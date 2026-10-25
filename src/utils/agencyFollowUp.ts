// 🧭 Admin › Port par agence › « Suivi de l'agence » — calculs PURS (testés : agencyFollowUp.test.ts).
// PORTS uniquement (aucun COD) :
//   1. Chef d'exploitation : ports REÇUS des livreurs / « En gare - <ville> », REMIS (validés) au chef d'agence, RESTE ;
//   2. Chef d'agence : ports reçus en caisse (caisseEntries), VERSEMENTS (Transfert à l'Admin…), SOLDE ;
//   3. Solde caisse (Situation caisse) vs solde théorique (Vue théorique), écart = reste à encaisser ;
//   4. Ports en compte (expéditeur / destinataire), facturés / non facturés.
// Les totaux par agence (vue théorique / situation caisse) sont ceux de l'onglet : computeAgencyPortStats
// est la SEULE définition, utilisée par le tableau de l'onglet ET par le suivi.
import { CITIES } from '../firebase/constants'
import {
  agencyPortAmounts, isInAgencyScope, isSentFromAgency, isReceivedInAgency, type AgencyDirection,
} from './billingAgency'
import { MONEY_START } from './moneyFlow'
import { parcelDate } from './dateFilter'

const round2 = (n: number) => Math.round(n * 100) / 100

// ── Totaux par agence (onglet Port par agence) ────────────────────────────────

export type PortViewMode = 'theoretical' | 'physical'

export interface AgencyPortStat {
  city: string
  portPaye: number              // ✅ Port Payé (expéditeur) OU Ports payés reçus (mode physical)
  portDu: number                // 💰 Port Dû (destinataire) OU Ports dû collectés (mode physical)
  portDuCheque: number          // 📋 Port Dû Chèque
  enCompteExp: number           // 📤 En Compte Expéditeur
  enCompteDest: number          // 📥 En Compte Destinataire
  totalPort: number
  nbExpeditions: number         // Seulement les expéditions (pas colis) — locales comptées 2 fois en « Toutes »
  nbUnique: number              // Expéditions distinctes (= nombre affiché sur la page Chef d'agence)
}

// 🔒 Fonction sécurisée pour parser les nombres
const safeParseFloat = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0
  const num = parseFloat(String(value).replace(',', '.'))
  return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
}

/**
 * ✅ Statistiques par agence de l'onglet « Port par agence » (règles inchangées, déplacées ici pour être
 * partagées avec le suivi de l'agence).
 * - theoretical : ports de chaque expédition du périmètre de l'agence (utils/billingAgency) ;
 * - physical (Situation caisse) : argent réellement collecté — port dû / port dû chèque « collected » ou
 *   « received » à DESTINATION, port payé (sans portPayeMethod) « collected » ou « received » à l'ORIGINE.
 */
export function computeAgencyPortStats(
  parcels: any[],
  opts: { viewMode: PortViewMode; directionFilter?: string; originCityFilter?: string; cities?: readonly string[] },
): AgencyPortStat[] {
  const { viewMode, directionFilter = 'all', originCityFilter = 'all', cities = CITIES } = opts
  if (!Array.isArray(parcels)) return []

  const stats: Record<string, Omit<AgencyPortStat, 'totalPort'> & { totalPort: number }> = {}
  cities.forEach(city => {
    stats[city] = { city, portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0, totalPort: 0, nbExpeditions: 0, nbUnique: 0 }
  })
  const agencyDir: AgencyDirection = directionFilter === 'sent' ? 'sent' : directionFilter === 'received' ? 'received' : 'all'

  parcels.forEach((p: any) => {
    // ✅ Utiliser SEULEMENT originCity et destinationCity (comme dans AgentPage)
    const originCity = p.originCity
    const destCity = p.destinationCity

    // 🔗 Agences concernées : ville d'expédition / de destination (et villes expéditeur /
    // destinataire des anciens colis). Le périmètre et la répartition des ports suivent la règle
    // PARTAGÉE avec la page Chef d'agence (utils/billingAgency) → mêmes expéditions, mêmes montants.
    const matchesOriginFilter = directionFilter !== 'received' || originCityFilter === 'all' || originCity === originCityFilter
    const involvedCities = [...new Set([originCity, p.sender?.city, destCity, p.receiver?.city])]
      .filter((c: any) => c && stats[c]) as string[]

    if (viewMode === 'theoretical') {
      // 📊 MODE THÉORIQUE : Port payé / En compte exp. → ORIGINE ; Port dû (espèces, chèque) / En compte dest. → DESTINATION
      if (matchesOriginFilter) {
        for (const c of involvedCities) {
          if (!isInAgencyScope(p, c, agencyDir)) continue
          const a = agencyPortAmounts(p, c)
          stats[c].portPaye += a.portPaye
          stats[c].portDu += a.portDu
          stats[c].portDuCheque += a.portDuCheque
          stats[c].enCompteExp += a.enCompteExp
          stats[c].enCompteDest += a.enCompteDest
        }
      }
    } else {
      // 💵 MODE SITUATION CAISSE : ARGENT PHYSIQUE COLLECTÉ
      const price = safeParseFloat(p.price)
      const portType = p.portType
      const portStatus = p.portStatus
      const collected = portStatus === 'collected' || portStatus === 'received'

      // 1️⃣ PORTS DÛ COLLECTÉS : portType = 'port_du', portStatus = 'collected' ou 'received'
      if (portType === 'port_du' && collected && price > 0 && destCity && stats[destCity]) {
        stats[destCity].portDu += price
      }
      // 1️⃣ bis PORTS DÛ CHÈQUE COLLECTÉS : portType = 'port_du_cheque', portStatus = 'collected' ou 'received'
      if (portType === 'port_du_cheque' && collected && price > 0 && destCity && stats[destCity]) {
        stats[destCity].portDuCheque += price
      }
      // 2️⃣ PORTS PAYÉS ENCAISSÉS : portType = 'port_paye', ville d'origine, portStatus = 'collected' (encaissé au guichet
      // « En gare » ou par le livreur de ramassage, puis remis au chef d'exploitation) ou 'received' (reçu par le chef
      // d'agence) — même règle que les ports dus collectés ci-dessus.
      if (portType === 'port_paye' && !p.portPayeMethod && collected && price > 0 && originCity && stats[originCity]) {
        stats[originCity].portPaye += price
      }
    }

    // ✅ EXPÉDITIONS : même périmètre que la page Chef d'agence (envoyées depuis la ville, reçues = arrivées
    // dans la ville ET visibles à destination). En « Toutes », une expédition LOCALE compte 2 fois pour son
    // agence (1 envoyée + 1 reçue) ; nbUnique la compte une seule fois (= total Chef d'agence).
    if (matchesOriginFilter) {
      for (const c of involvedCities) {
        const sent = agencyDir !== 'received' && isSentFromAgency(p, c)
        const received = agencyDir !== 'sent' && isReceivedInAgency(p, c)
        stats[c].nbExpeditions += (sent ? 1 : 0) + (received ? 1 : 0)
        if (sent || received) stats[c].nbUnique += 1
      }
    }
  })

  return Object.values(stats).map(stat => {
    // 💰 Total Port = Somme de tous les ports (sans déduire les versements)
    const totalPort = stat.portPaye + stat.portDu + stat.portDuCheque + stat.enCompteExp + stat.enCompteDest
    return {
      ...stat,
      portPaye: round2(stat.portPaye),
      portDu: round2(stat.portDu),
      portDuCheque: round2(stat.portDuCheque),
      enCompteExp: round2(stat.enCompteExp),
      enCompteDest: round2(stat.enCompteDest),
      totalPort: round2(totalPort),
    }
  })
}

/** Total « Payé + Dû + Chèque » d'une ligne (colonne « 💵 Total (Payé + Dû + Chèque) » de l'onglet). */
export const cashPortTotal = (s?: Pick<AgencyPortStat, 'portPaye' | 'portDu' | 'portDuCheque'> | null): number =>
  s ? round2(s.portPaye + s.portDu + s.portDuCheque) : 0

// ── Outils ────────────────────────────────────────────────────────────────────

/** Date (Timestamp Firestore, {seconds}, Date, ISO, nombre) → millisecondes, sinon null. */
export const toMs = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v?.toMillis === 'function') return v.toMillis()
  if (typeof v?.toDate === 'function') return v.toDate().getTime()
  if (typeof v?.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6)
  const t = (v instanceof Date ? v : new Date(v)).getTime()
  return Number.isNaN(t) ? null : t
}
const priceOf = (p: any): number => safeParseFloat(p?.price)
/** N° EXP affiché (même règle que les autres écrans : NIC expéditeur, sinon N° de suivi). */
export const expNumberOf = (p: any): string => String(p?.senderNic || p?.sender?.nic || p?.trackingId || p?.id || '')

export interface FollowUpWindow { startMs: number; endMs: number; clamped: boolean }
/**
 * Fenêtre des MOUVEMENTS d'argent suivis (réceptions, caisse, versements) = période de l'onglet, mais jamais
 * avant le début du vrai calcul (05/10/2026 08:00, utils/moneyFlow) : avant, l'argent n'entre dans aucun solde.
 */
export const followUpWindow = (periodStartMs: number, periodEndMs: number): FollowUpWindow => {
  const ms = MONEY_START.getTime()
  return { startMs: Math.max(periodStartMs, ms), endMs: periodEndMs, clamped: periodStartMs < ms }
}
const inWin = (ms: number | null, w: FollowUpWindow) => ms !== null && ms >= w.startMs && ms <= w.endMs

const pad2 = (n: number) => String(n).padStart(2, '0')
/** « 14/10/2026 09:05 » (heure locale) ; « — » si pas de date. */
export const fmtDateTime = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const d = new Date(ms)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// Libellés partagés (écran + impression)
export const EXP_STATE_LABEL: Record<'valide' | 'envoye' | 'chez_exp', string> = {
  valide: "Remis (validé par le chef d'agence)", envoye: 'Envoyé — en attente de validation', chez_exp: "Chez le chef d'exploitation",
}
export const RECEIPT_SOURCE_LABEL: Record<'envoi' | 'direct' | 'autre', string> = {
  envoi: "Envoi du chef d'exploitation validé", direct: 'Réception directe (remplacement)', autre: 'Autre entrée port',
}
export const TRANSFER_STATUS_LABEL: Record<'pending' | 'confirmed' | 'rejected', string> = {
  pending: 'En attente', confirmed: 'Confirmé', rejected: 'Rejeté',
}

export interface CountAmount { n: number; amount: number }
const ca0 = (): CountAmount => ({ n: 0, amount: 0 })
const addCa = (c: CountAmount, amount: number) => { c.n += 1; c.amount = round2(c.amount + amount) }

// ── 1. Chef d'exploitation ────────────────────────────────────────────────────

export type ExpLineState = 'valide' | 'envoye' | 'chez_exp'
export interface ExpLine {
  id: string
  nic: string
  kind: 'port_du' | 'port_paye'
  method: 'especes' | 'cheque'
  amount: number
  receivedAtMs: number
  receivedBy: string
  /** valide = reçu par le chef d'agence ; envoye = dans un envoi en attente de validation ; chez_exp = pas encore envoyé */
  state: ExpLineState
  validatedAtMs: number | null
  validatedBy: string
  /** Ville de l'autre bout (origine d'un port dû, destination d'un port payé) */
  otherCity: string
}
export interface ExploitationFollowUp {
  lines: ExpLine[]
  recu: CountAmount
  remis: CountAmount
  /** Reçu − remis (inclut « envoyé, en attente de validation ») */
  reste: CountAmount
  enAttente: CountAmount
}

/** Ids des expéditions dont un PORT figure dans un envoi (valeursEnvois) encore « envoyé » (non validé). */
export const pendingEnvoiPortParcelIds = (envois: any[]): Set<string> => {
  const out = new Set<string>()
  for (const e of envois || []) {
    if (e?.status !== 'envoye') continue
    for (const it of e.items || []) if (it && (it.kind === 'port_du' || it.kind === 'port_paye') && it.parcelId) out.add(it.parcelId)
  }
  return out
}

/**
 * 1️⃣ Ports REÇUS par le chef d'exploitation pendant la fenêtre, et ce qu'ils sont devenus (état actuel) :
 * - port dû (port_du / port_du_cheque) de l'agence de DESTINATION : portExpReceivedAt dans la fenêtre ;
 *   remis = reçu par le chef d'agence (portChefReceivedAt — validation de l'envoi — ou ancien portStatus « received ») ;
 * - port payé ramassé au guichet (port_paye) de l'agence d'ORIGINE : portPayeExpReceivedAt dans la fenêtre ;
 *   remis = portStatus « received » (portReceivedAt / portReceivedBy).
 * Réceptions faites par le chef d'agence EN REMPLACEMENT (…ExpReceivedRole = 'chef_agence') EXCLUES : leur argent
 * est entré directement dans la caisse du chef d'agence (partie 2).
 */
export function buildExploitationFollowUp(parcels: any[], city: string, w: FollowUpWindow, pendingIds: Set<string> = new Set()): ExploitationFollowUp {
  const res: ExploitationFollowUp = { lines: [], recu: ca0(), remis: ca0(), reste: ca0(), enAttente: ca0() }
  const seen = new Set<string>()
  for (const p of parcels || []) {
    if (!p?.id || seen.has(p.id)) continue
    const amount = priceOf(p)
    if (amount <= 0) continue
    let line: ExpLine | null = null
    const isDu = (p.portType === 'port_du' || p.portType === 'port_du_cheque') && !p.portPayeMethod
    if (isDu && p.destinationCity === city && p.portExpReceivedRole !== 'chef_agence') {
      const at = toMs(p.portExpReceivedAt)
      if (inWin(at, w)) {
        const valide = !!p.portChefReceivedAt || p.portStatus === 'received'
        line = {
          id: p.id, nic: expNumberOf(p), kind: 'port_du',
          method: p.portType === 'port_du_cheque' || p.portDuReceivedMethod === 'cheque' ? 'cheque' : 'especes',
          amount, receivedAtMs: at as number, receivedBy: p.portExpReceivedBy || '',
          state: valide ? 'valide' : pendingIds.has(p.id) ? 'envoye' : 'chez_exp',
          validatedAtMs: valide ? toMs(p.portChefReceivedAt ?? p.portReceivedAt) : null,
          validatedBy: valide ? (p.portChefReceivedBy || p.portReceivedBy || '') : '',
          otherCity: p.originCity || p.sender?.city || '',
        }
      }
    } else if (p.portType === 'port_paye' && !p.portPayeMethod && p.originCity === city && p.portPayeExpReceivedRole !== 'chef_agence') {
      const at = toMs(p.portPayeExpReceivedAt)
      if (inWin(at, w)) {
        const valide = p.portStatus === 'received'
        line = {
          id: p.id, nic: expNumberOf(p), kind: 'port_paye', method: 'especes',
          amount, receivedAtMs: at as number, receivedBy: p.portPayeExpReceivedBy || '',
          state: valide ? 'valide' : pendingIds.has(p.id) ? 'envoye' : 'chez_exp',
          validatedAtMs: valide ? toMs(p.portReceivedAt) : null,
          validatedBy: valide ? (p.portReceivedBy || '') : '',
          otherCity: p.destinationCity || p.receiver?.city || '',
        }
      }
    }
    if (!line) continue
    seen.add(p.id)
    res.lines.push(line)
    addCa(res.recu, amount)
    if (line.state === 'valide') addCa(res.remis, amount)
    else {
      addCa(res.reste, amount)
      if (line.state === 'envoye') addCa(res.enAttente, amount)
    }
  }
  res.lines.sort((a, b) => b.receivedAtMs - a.receivedAtMs)
  return res
}

// ── 2. Chef d'agence ──────────────────────────────────────────────────────────

export type ReceiptSource = 'envoi' | 'direct' | 'autre'
export interface CaisseReceiptLine {
  id: string
  atMs: number
  amount: number
  category: 'port_du' | 'port_paye'
  source: ReceiptSource
  who: string
  description: string
  reference: string
}
export type VersementNature = 'ports' | 'cod' | 'en_compte' | 'interne'
export interface VersementLine {
  id: string
  atMs: number
  amount: number
  kind: 'remise_admin' | 'versement_banque' | 'remise_caissier' | 'admin_direct'
  label: string
  who: string
  note: string
  status: 'pending' | 'confirmed' | 'rejected' | null
  paymentType: string
  nature: VersementNature
  /** Compté dans les versements de PORTS (déduit du solde) */
  counted: boolean
  reason: string
}
export interface ChefAgenceFollowUp {
  receipts: CaisseReceiptLine[]
  recu: CountAmount & { envoi: number; direct: number; autre: number }
  versements: VersementLine[]
  /** Versements de ports comptés (non COD, non en compte, non rejetés, hors mouvements internes) */
  verse: CountAmount
  /** Versements écartés du calcul (COD, en compte, rejetés, internes) */
  ecarte: CountAmount
  /** Reçu en caisse (ports) − versé (ports) */
  solde: number
}

const PORT_CATEGORIES = new Set(['port_du', 'port_paye'])
const VERSEMENT_CATEGORIES = new Set(['remise_admin', 'versement_banque', 'remise_caissier'])
const TRANSFER_TYPE_LABEL: Record<string, string> = {
  port_du: 'Port dû', cod: 'COD', ports_payes: 'Ports payés', compte_expediteur: 'Compte expéditeur', compte_destinataire: 'Compte destinataire',
}
const normStatus = (s: any): VersementLine['status'] => (s === 'pending' || s === 'confirmed' || s === 'rejected' ? s : null)

/**
 * Nature d'un transfert à l'Admin : COD si type « cod » ou s'il porte des codParcelIds (ancien transfert
 * « depuis l'agent » qui marque des COD) ; « en compte » si type compte_expediteur / compte_destinataire ;
 * sinon PORTS (port_du, ports_payes, ou type non précisé).
 */
export const transferNature = (t: any): VersementNature => {
  if (!t) return 'ports'
  if (t.type === 'cod' || (Array.isArray(t.codParcelIds) && t.codParcelIds.filter(Boolean).length > 0)) return 'cod'
  if (t.type === 'compte_expediteur' || t.type === 'compte_destinataire') return 'en_compte'
  return 'ports'
}

/**
 * 2️⃣ Caisse du chef d'agence (caisseEntries de la ville, createdAt dans la fenêtre) :
 * - REÇU = entrées de catégorie port_du / port_paye : « envoi » (validation d'un envoi du chef d'exploitation,
 *   identifiant envoi_<id>_port / envoi_<id>_pp), « direct » (réception en remplacement du chef d'exploitation),
 *   « autre » (saisie manuelle / ancien circuit) ;
 * - VERSEMENTS = sorties remise_admin (Transfert à l'Admin, statut lu dans adminTransfers via caisseEntryId),
 *   versement_banque (Versement RETOUR FOND à la banque → COD), remise_caissier (mouvement interne à l'agence,
 *   compensé par une entrée « Dépôt agent ») + transferts saisis directement par l'admin (adminTransfers sans
 *   caisseEntryId) dans la fenêtre. Seuls les versements de PORTS non rejetés sont déduits.
 */
export function buildChefAgenceFollowUp(entries: any[], transfers: any[], w: FollowUpWindow): ChefAgenceFollowUp {
  const res: ChefAgenceFollowUp = {
    receipts: [], recu: { n: 0, amount: 0, envoi: 0, direct: 0, autre: 0 }, versements: [], verse: ca0(), ecarte: ca0(), solde: 0,
  }
  const byEntry = new Map<string, any>()
  for (const t of transfers || []) if (t?.caisseEntryId) byEntry.set(t.caisseEntryId, t)

  for (const e of entries || []) {
    if (!e?.id) continue
    const at = toMs(e.createdAt)
    if (!inWin(at, w)) continue
    const amount = safeParseFloat(e.amount)
    if (amount <= 0) continue
    const who = e.cashierName || e.agentName || ''
    if (e.type === 'entree' && PORT_CATEGORIES.has(e.category)) {
      const desc = String(e.description || '')
      const source: ReceiptSource = String(e.id).startsWith('envoi_') ? 'envoi'
        : /en l'absence du chef d'exploitation/i.test(desc) ? 'direct' : 'autre'
      res.receipts.push({ id: e.id, atMs: at as number, amount, category: e.category, source, who, description: desc, reference: String(e.reference || '') })
      res.recu.n += 1
      res.recu.amount = round2(res.recu.amount + amount)
      res.recu[source] = round2(res.recu[source] + amount)
    } else if (e.type === 'sortie' && VERSEMENT_CATEGORIES.has(e.category)) {
      const t = e.category === 'remise_admin' ? byEntry.get(e.id) : null
      let nature: VersementNature
      let label: string
      if (e.category === 'versement_banque') { nature = 'cod'; label = 'Versement RETOUR FOND à la banque' }
      else if (e.category === 'remise_caissier') { nature = 'interne'; label = 'Remise au caissier (interne)' }
      else { nature = transferNature(t); label = `Transfert à l'Admin${t?.type ? ` — ${TRANSFER_TYPE_LABEL[t.type] || t.type}` : ''}` }
      const status = e.category === 'remise_admin' ? normStatus(t?.status) : null
      const line: VersementLine = {
        id: e.id, atMs: at as number, amount, kind: e.category, label, who: t?.fromName || who,
        note: String(e.note || t?.note || ''), status, paymentType: String(t?.paymentType || e.paymentKind || ''),
        nature, counted: false, reason: '',
      }
      finalizeVersement(line)
      res.versements.push(line)
    }
  }

  // Versements saisis directement par l'admin (sans écriture dans la caisse de l'agence)
  for (const t of transfers || []) {
    if (!t?.id || t.caisseEntryId) continue
    const at = toMs(t.createdAt)
    if (!inWin(at, w)) continue
    const amount = safeParseFloat(t.amount)
    if (amount <= 0) continue
    const line: VersementLine = {
      id: `transfer_${t.id}`, atMs: at as number, amount, kind: 'admin_direct',
      label: `Versement saisi par l'admin${t.type ? ` — ${TRANSFER_TYPE_LABEL[t.type] || t.type}` : ''}`,
      who: t.fromName || t.createdBy || '', note: String(t.note || ''), status: normStatus(t.status),
      paymentType: String(t.paymentType || ''), nature: transferNature(t), counted: false, reason: '',
    }
    finalizeVersement(line)
    res.versements.push(line)
  }

  for (const v of res.versements) addCa(v.counted ? res.verse : res.ecarte, v.amount)
  res.receipts.sort((a, b) => b.atMs - a.atMs)
  res.versements.sort((a, b) => b.atMs - a.atMs)
  res.solde = round2(res.recu.amount - res.verse.amount)
  return res
}

function finalizeVersement(v: VersementLine) {
  if (v.nature === 'cod') v.reason = 'COD — hors ports'
  else if (v.nature === 'en_compte') v.reason = 'Ports en compte — hors caisse ports'
  else if (v.nature === 'interne') v.reason = "Mouvement interne à l'agence"
  else if (v.status === 'rejected') v.reason = "Rejeté par l'admin"
  v.counted = !v.reason
}

// ── 3 bis. Détail du « Reste à encaisser » ───────────────────────────────────

export interface ResteLine {
  p: any
  /** Port attendu pour l'agence (vue théorique, hors en compte) */
  attendu: number
  /** Port encaissé pour l'agence (situation caisse) */
  encaisse: number
  /** attendu − encaissé (négatif : encaissé sans être attendu dans la période / le périmètre) */
  reste: number
  kind: 'port_du' | 'port_du_cheque' | 'port_paye' | 'autre'
}

/**
 * Expéditions qui composent le « Reste à encaisser » d'une agence : pour chaque expédition, la part attendue (mêmes
 * règles que computeAgencyPortStats en vue théorique) moins la part encaissée (mêmes règles qu'en situation caisse).
 * Σ reste = ecart de buildCaisseSituation (au centime près).
 */
export function resteAEncaisserLines(parcels: any[], city: string): ResteLine[] {
  const out: ResteLine[] = []
  for (const p of parcels || []) {
    const involved = [p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city].includes(city)
    if (!involved) continue
    let attendu = 0
    if (isInAgencyScope(p, city, 'all')) {
      const a = agencyPortAmounts(p, city)
      attendu = a.portPaye + a.portDu + a.portDuCheque
    }
    const price = safeParseFloat(p.price)
    const collected = p.portStatus === 'collected' || p.portStatus === 'received'
    let encaisse = 0
    if (collected && price > 0) {
      if ((p.portType === 'port_du' || p.portType === 'port_du_cheque') && p.destinationCity === city) encaisse += price
      if (p.portType === 'port_paye' && !p.portPayeMethod && p.originCity === city) encaisse += price
    }
    const reste = round2(attendu - encaisse)
    if (Math.abs(reste) < 0.005) continue
    const kind = p.portType === 'port_du' || p.portType === 'port_du_cheque' || p.portType === 'port_paye' ? p.portType : 'autre'
    out.push({ p, attendu: round2(attendu), encaisse: round2(encaisse), reste, kind })
  }
  return out.sort((a, b) => b.reste - a.reste)
}

// ── 3. Solde caisse vs solde théorique ───────────────────────────────────────

export interface CaisseSituation {
  encaisse: { portPaye: number; portDu: number; portDuCheque: number; total: number }
  theorique: { portPaye: number; portDu: number; portDuCheque: number; total: number }
  versements: number
  soldeCaisse: number
  soldeTheorique: number
  /** Théorique − caisse = reste à encaisser */
  ecart: number
}
type PortTriple = Pick<AgencyPortStat, 'portPaye' | 'portDu' | 'portDuCheque'>
const triple = (s?: PortTriple | null) => ({
  portPaye: s?.portPaye || 0, portDu: s?.portDu || 0, portDuCheque: s?.portDuCheque || 0, total: cashPortTotal(s),
})

/**
 * 3️⃣ solde caisse = ports réellement encaissés (Situation caisse : payé + dû + dû chèque) − versements de ports ;
 * solde théorique = ports de la vue théorique (payé + dû + dû chèque, SANS en compte) − versements de ports ;
 * écart = théorique − caisse (= ports restant à encaisser).
 */
export function buildCaisseSituation(physical: PortTriple | null | undefined, theoretical: PortTriple | null | undefined, versementsPorts: number): CaisseSituation {
  const encaisse = triple(physical)
  const theorique = triple(theoretical)
  const v = round2(versementsPorts || 0)
  return {
    encaisse, theorique, versements: v,
    soldeCaisse: round2(encaisse.total - v),
    soldeTheorique: round2(theorique.total - v),
    ecart: round2(theorique.total - encaisse.total),
  }
}

// ── 4. Ports en compte ────────────────────────────────────────────────────────

/** N° de facture par expédition (factures non annulées) — même règle que le Facturier. */
export const invoiceNumbersByParcel = (invoices: any[]): Map<string, string> => {
  const m = new Map<string, string>()
  for (const inv of invoices || []) {
    if (!inv || inv.status === 'cancelled') continue
    for (const it of inv.items || []) if (it?.parcelId) m.set(it.parcelId, String(inv.invoiceNumber || 'Facturée'))
  }
  return m
}

export interface EnCompteLine {
  id: string
  nic: string
  kind: 'exp' | 'dest'
  amount: number
  client: string
  otherCity: string
  dateMs: number
  invoiced: boolean
  invoiceNumber: string
}
export interface EnCompteGroup { total: CountAmount; facture: CountAmount; nonFacture: CountAmount }
export interface EnCompteFollowUp { lines: EnCompteLine[]; exp: EnCompteGroup; dest: EnCompteGroup }
const group0 = (): EnCompteGroup => ({ total: ca0(), facture: ca0(), nonFacture: ca0() })

/**
 * 4️⃣ Ports en compte de l'agence sur les expéditions de la période (mêmes règles que la vue théorique :
 * périmètre isInAgencyScope « toutes », montants agencyPortAmounts) : en compte EXPÉDITEUR à l'origine,
 * en compte DESTINATAIRE à la destination. Facturé = présent dans une facture non annulée (N° de facture) ou
 * marqué invoiced === true sur l'expédition — règle du Facturier.
 */
export function buildEnCompteFollowUp(parcels: any[], city: string, invoiceMap: Map<string, string> = new Map()): EnCompteFollowUp {
  const res: EnCompteFollowUp = { lines: [], exp: group0(), dest: group0() }
  for (const p of parcels || []) {
    if (!p?.id || !isInAgencyScope(p, city, 'all')) continue
    const a = agencyPortAmounts(p, city)
    const parts: [EnCompteLine['kind'], number][] = []
    if (a.enCompteExp > 0) parts.push(['exp', a.enCompteExp])
    if (a.enCompteDest > 0) parts.push(['dest', a.enCompteDest])
    for (const [kind, amount] of parts) {
      const num = invoiceMap.get(p.id) || (p.invoiced === true ? 'Facturée' : '')
      const line: EnCompteLine = {
        id: p.id, nic: expNumberOf(p), kind, amount,
        client: kind === 'exp' ? (p.sender?.name || '') : (p.receiver?.name || ''),
        otherCity: kind === 'exp' ? (p.destinationCity || p.receiver?.city || '') : (p.originCity || p.sender?.city || ''),
        dateMs: parcelDate(p).getTime(), invoiced: !!num, invoiceNumber: num,
      }
      res.lines.push(line)
      const g = kind === 'exp' ? res.exp : res.dest
      addCa(g.total, amount)
      addCa(line.invoiced ? g.facture : g.nonFacture, amount)
    }
  }
  res.lines.sort((a, b) => b.dateMs - a.dateMs)
  return res
}
