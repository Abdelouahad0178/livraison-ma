import { caisseCodAmountOfType, isRamasseGuichet, isAdminTransferred, isPortDuHeldByAgency } from './agencyCaisseRules'
import { isMixedCod } from './codParts'
import { isCodMoneyBeforeStart, isPortDuMoneyBeforeStart } from './moneyFlow'
import { opDayKeyOf } from './versementPeriod'

/**
 * 📅 Bilan d'une journée / période — module UNIQUE pour le chef d'exploitation et le chef d'agence.
 * ① Théorique à encaisser : expéditions de la période (ports dus et COD : agence de destination ; ports payés à
 *    ramasser : guichet d'origine) → total / encaissé / reste.
 * ② Encaissé à la date : argent encaissé (guichet / livreur) OU reçu par le chef d'exploitation pendant la période,
 *    même pour une expédition plus ancienne → déjà versé / à verser. Ports ET COD suivent le même circuit :
 *    chef d'exploitation → chef d'agence → admin.
 */
export type BilanRole = 'exploitation' | 'agence'
export const BILAN_TYPES = ['especes', 'cheque', 'traite'] as const
/** Expédition derrière un montant (liste cliquable / imprimable). */
export interface BilanItem { id: string; nic: string; sender: string; receiver: string; status: string; driver: string; amount: number; expDay: string | null; moneyDay: string | null }
/** encaisse = ESPÈCES seulement ; docs = chèques / traites reçus (documents, pas de l'argent encaissé) */
type Line = { total: number; encaisse: number; docs: number; reste: number; n: number; items: { total: BilanItem[]; encaisse: BilanItem[]; docs: BilanItem[]; reste: BilanItem[] } }
type Enc = { montant: number; n: number; verse: number; aVerser: number; nonRecu: number; items: { montant: BilanItem[]; verse: BilanItem[]; aVerser: BilanItem[]; nonRecu: BilanItem[] } }
export interface Bilan {
  theorique: { portsDus: Line; portsPayes: Line; cod: Record<(typeof BILAN_TYPES)[number], Line> }
  encaisse: { ports: Enc; codEspeces: Enc; codDocs: Enc }
}

const RETURNED = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const isReturned = (p: any) => !!(p.returnedAt || p.wasReturned || RETURNED.includes(p.status))
const amt = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100
const line = (): Line => ({ total: 0, encaisse: 0, docs: 0, reste: 0, n: 0, items: { total: [], encaisse: [], docs: [], reste: [] } })
const enc = (): Enc => ({ montant: 0, n: 0, verse: 0, aVerser: 0, nonRecu: 0, items: { montant: [], verse: [], aVerser: [], nonRecu: [] } })
const itemOf = (p: any, amount: number, moneyWhen?: any, driver?: string): BilanItem => ({
  id: p.id, nic: p.senderNic || p.sender?.nic || p.trackingId || p.id, sender: p.sender?.name || '', receiver: p.receiver?.name || '',
  status: p.status || '', driver: driver ?? (p.deliveryDriverName || p.portCollectedBy || ''), amount, expDay: expKeyOf(p), moneyDay: moneyWhen ? opDayKeyOf(moneyWhen) : null,
})
/** 📬 Port payé ramassé au GUICHET de la ville de départ : encaissé par le détenteur du guichet de CETTE ville
 *  (ex. ENGAREAGA6017 à Agadir), sinon « En gare - <ville> » — jamais le livreur / la gare de la ville de destination
 *  (avant 24/10/2026 : deliveryDriverName affichait « En gare - Marrakech », « En gare - Casablanca »…). */
const guichetCollectorOf = (p: any, city: string) => p.portGuichetHolderName || `En gare - ${city}`
const expKeyOf = (p: any) => opDayKeyOf(p.workDate ? `${p.workDate}T12:00:00` : p.createdAt)

export function computeBilan(input: {
  periodParcels: any[]        // expéditions de la période (view.dataSource)
  moneyParcels: any[]         // tout ce qui est chargé (période + encaissements récents hors période)
  city: string
  role: BilanRole
  fromKey: string | null      // null = sans borne (« Tout »)
  toKey: string | null
  /** Clés « kind:parcelId » déjà dans un versement chef d'exploitation → chef d'agence (en attente / reçu) */
  sentKeys?: Set<string>
  /** Chef d'agence : comptes chef d'agence / agent pro de la ville (encaissé par eux = déjà entre leurs mains) */
  agencyHolderIds?: Set<string> | null
}): Bilan {
  const { periodParcels, moneyParcels, city, role, fromKey, toKey, sentKeys = new Set(), agencyHolderIds = null } = input
  const inP = (k: string | null) => !fromKey || (!!k && k >= fromKey && k <= (toKey || fromKey))
  const t = { portsDus: line(), portsPayes: line(), cod: { especes: line(), cheque: line(), traite: line() } }

  // ① Théorique : expéditions de la période (une seule fois chacune)
  const seen = new Set<string>()
  for (const p of periodParcels) {
    if (!p?.id || seen.has(p.id)) continue
    seen.add(p.id)
    if (fromKey && !inP(expKeyOf(p))) continue // filets larges de la caisse : seulement les expéditions de la période
    if (isReturned(p)) continue
    const price = amt(p.price)
    if (p.portType === 'port_du' && !p.portPayeMethod && p.destinationCity === city && price > 0) {
      const done = p.portStatus === 'collected' || p.portStatus === 'received'
      t.portsDus.n++; t.portsDus.total += price; t.portsDus.items.total.push(itemOf(p, price, p.portCollectedAt))
      if (done && p.portDuReceivedMethod === 'cheque') { t.portsDus.docs += price; t.portsDus.items.docs.push(itemOf(p, price, p.portCollectedAt)) }
      else if (done) { t.portsDus.encaisse += price; t.portsDus.items.encaisse.push(itemOf(p, price, p.portCollectedAt)) } else t.portsDus.items.reste.push(itemOf(p, price))
    } else if (isRamasseGuichet(p, city)) {
      const done = p.portStatus === 'collected' || p.portStatus === 'received'
      const by = guichetCollectorOf(p, city)
      t.portsPayes.n++; t.portsPayes.total += price; t.portsPayes.items.total.push(itemOf(p, price, p.portCollectedAt, by))
      if (done) { t.portsPayes.encaisse += price; t.portsPayes.items.encaisse.push(itemOf(p, price, p.portCollectedAt, by)) } else t.portsPayes.items.reste.push(itemOf(p, price, undefined, by))
    }
    if (p.destinationCity === city && amt(p.codAmount) > 0) {
      const done = !!p.codStatus && p.codStatus !== 'pending'
      for (const k of BILAN_TYPES) {
        const a = caisseCodAmountOfType(p, k)
        if (a > 0) {
          t.cod[k].n++; t.cod[k].total += a; t.cod[k].items.total.push(itemOf(p, a, p.codCollectedAt))
          if (done && k !== 'especes') { t.cod[k].docs += a; t.cod[k].items.docs.push(itemOf(p, a, p.codCollectedAt)) }
          else if (done) { t.cod[k].encaisse += a; t.cod[k].items.encaisse.push(itemOf(p, a, p.codCollectedAt)) } else t.cod[k].items.reste.push(itemOf(p, a))
        }
      }
    }
  }
  const fin = (l: Line) => { l.total = r2(l.total); l.encaisse = r2(l.encaisse); l.docs = r2(l.docs); l.reste = r2(l.total - l.encaisse - l.docs) }
  fin(t.portsDus); fin(t.portsPayes); BILAN_TYPES.forEach(k => fin(t.cod[k]))

  // ② Encaissé pendant la période (encaissé OU reçu ce jour-là), découpé selon l'étape du circuit
  const e = { ports: enc(), codEspeces: enc(), codDocs: enc() }
  const add = (x: Enc, key: 'verse' | 'aVerser' | 'nonRecu', it: BilanItem) => { x[key] += it.amount; x.items[key].push(it) }
  const seen2 = new Set<string>()
  for (const p of moneyParcels) {
    if (!p?.id || seen2.has(p.id)) continue
    seen2.add(p.id)
    const price = amt(p.price)
    // — Ports dus (destination) et ports payés ramassés au guichet (origine)
    let portKind: 'port_du' | 'port_paye' | null = null
    if (p.portType === 'port_du' && !p.portPayeMethod && p.destinationCity === city && (p.portStatus === 'collected' || p.portStatus === 'received') && !isPortDuMoneyBeforeStart(p)) portKind = 'port_du'
    else if (isRamasseGuichet(p, city) && !isReturned(p) && (p.portStatus === 'collected' || p.portStatus === 'received')) portKind = 'port_paye'
    if (portKind && price > 0) {
      const recvWhen = portKind === 'port_du' ? p.portExpReceivedAt : p.portPayeExpReceivedAt
      // 📅 Une somme = UNE journée : le jour d'ENCAISSEMENT (guichet / livreur) ; anciennes données : jour de réception
      const moneyWhen = p.portCollectedAt || recvWhen || p.portReceivedAt
      if (inP(opDayKeyOf(moneyWhen))) {
        const it = itemOf(p, price, moneyWhen, portKind === 'port_paye' ? guichetCollectorOf(p, city) : undefined)
        // Port dû payé par CHÈQUE : document, pas de l'argent encaissé → avec les chèques / traites
        const px = portKind === 'port_du' && p.portDuReceivedMethod === 'cheque' ? e.codDocs : e.ports
        px.montant += price; px.n++; px.items.montant.push(it)
        const chezAgence = !!p.portChefReceivedAt || p.portStatus === 'received'
          || (portKind === 'port_du' && !!agencyHolderIds && isPortDuHeldByAgency(p, agencyHolderIds))
        if (role === 'exploitation') {
          add(px, chezAgence || sentKeys.has(`${portKind}:${p.id}`) ? 'verse' : 'aVerser', it)
        } else add(px, isAdminTransferred(p) ? 'verse' : chezAgence ? 'aVerser' : 'nonRecu', it)
      }
    }
    // — COD (destination) : même circuit que les ports
    const cod = amt(p.codAmount)
    if (cod > 0 && p.destinationCity === city && p.codStatus && p.codStatus !== 'pending' && !isCodMoneyBeforeStart(p)
      && inP(opDayKeyOf(p.codCollectedAt || p.codExpReceivedAt))) {
      const when = p.codCollectedAt || p.codExpReceivedAt
      const chezAgence = p.codStatus === 'remis' || p.codStatus === 'regle' || !!p.codReceivedByChef || !!p.codChefReceivedAt
        || (!!agencyHolderIds && !!p.codCollectedById && agencyHolderIds.has(p.codCollectedById))
      const verseAdmin = isAdminTransferred(p) || !!p.centralDeposited
      const put = (x: typeof e.codEspeces, amount: number) => {
        const it = itemOf(p, amount, when)
        x.montant += amount; x.n++; x.items.montant.push(it)
        if (role === 'exploitation') add(x, chezAgence || verseAdmin || sentKeys.has(`cod:${p.id}`) ? 'verse' : 'aVerser', it)
        else add(x, verseAdmin ? 'verse' : chezAgence ? 'aVerser' : 'nonRecu', it)
      }
      if (isMixedCod(p)) {
        // 💵+📋 COD MIXTE : part ESPÈCES avec les espèces, part chèque / traite avec les documents (jamais additionnés)
        const cash = caisseCodAmountOfType(p, 'especes')
        const docs = caisseCodAmountOfType(p, 'cheque') + caisseCodAmountOfType(p, 'traite')
        if (cash > 0) put(e.codEspeces, cash)
        if (docs > 0) put(e.codDocs, docs)
      } else {
        const isDoc = caisseCodAmountOfType(p, 'cheque') > 0 || caisseCodAmountOfType(p, 'traite') > 0
        put(isDoc ? e.codDocs : e.codEspeces, cod)
      }
    }
  }
  for (const k of ['ports', 'codEspeces', 'codDocs'] as const) { const x = e[k]; x.montant = r2(x.montant); x.verse = r2(x.verse); x.aVerser = r2(x.aVerser); x.nonRecu = r2(x.nonRecu) }
  return { theorique: t, encaisse: e }
}
