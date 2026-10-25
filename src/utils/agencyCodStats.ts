// 💰 Admin › COD par agence — calculs PURS (testés : agencyCodStats.test.ts). Même organisation que « Port par agence »
// (utils/agencyFollowUp → computeAgencyPortStats) : périmètre de l'agence par direction, deux modes de lecture.
//   - Vue théorique : valeurs (COD) attendues — reçues = à ENCAISSER par l'agence de destination,
//     envoyées = à RÉGLER aux expéditeurs de l'agence d'origine ;
//   - Situation caisse : argent réellement passé — reçues = valeurs ENCAISSÉES à destination,
//     envoyées = valeurs déjà RÉGLÉES aux expéditeurs.
// Montant par type (espèces / chèque / traite, RF mixte compris) : caisseCodAmountOfType — même règle que Caisse Agence.
// Exclus : services sans valeur (simple, Retour BL), expéditions retournées, argent encaissé avant le 05/10/2026.
import { CITIES } from '../firebase/constants'
import { caisseCodAmountOfType } from './agencyCaisseRules'
import { isMixedCod } from './codParts'
import { isCodMoneyBeforeStart, isCodSenderPaid } from './moneyFlow'
import { isSentFromAgency, isReceivedInAgency, type AgencyDirection } from './billingAgency'

export type CodViewMode = 'theoretical' | 'physical'
export type CodTypeKey = 'especes' | 'cheque' | 'traite'
export const COD_TYPE_KEYS: CodTypeKey[] = ['especes', 'cheque', 'traite']

export interface AgencyCodStat {
  city: string
  especes: number
  cheque: number
  traite: number
  total: number
  /** Expéditions avec une valeur comptée pour l'agence (locales comptées 2 fois en « Toutes ») */
  nbExpeditions: number
  /** Expéditions distinctes */
  nbUnique: number
  /** 💵+📋 Dont COD MIXTES (chèque / traite + espèces) — chaque part comptée dans sa colonne */
  nbMixtes: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const RETURN_STATUSES = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']

/** Valeur (COD) à compter : montant > 0, service avec valeur, pas retournée, pas d'argent d'avant le 05/10/2026. */
export const hasCountedCod = (p: any): boolean => {
  if (!((parseFloat(p?.codAmount) || 0) > 0)) return false
  const s = String(p?.serviceType ?? '').trim().toLowerCase()
  if (s === 'simple' || s === 'retour_bl' || s === 'bon_livraison') return false
  if (p?.wasReturned || RETURN_STATUSES.includes(p?.status)) return false
  return !isCodMoneyBeforeStart(p)
}
/** Valeur encaissée à destination (collectée, remise au chef, réglée). */
export const isCodCollected = (p: any): boolean => !!p?.codStatus && p.codStatus !== 'pending'

const typedAmounts = (p: any) => {
  const o = { especes: caisseCodAmountOfType(p, 'especes'), cheque: caisseCodAmountOfType(p, 'cheque'), traite: caisseCodAmountOfType(p, 'traite') }
  return { ...o, total: o.especes + o.cheque + o.traite }
}

/** Une expédition du « reste à encaisser » (même forme que utils/agencyFollowUp → ResteLine). */
export interface CodResteLine { p: any; attendu: number; encaisse: number; reste: number; kind: string }
/**
 * ⏳ Reste à encaisser COD d'une agence = valeurs des expéditions REÇUES par l'agence (vue théorique, reçues)
 * pas encore encaissées (situation caisse) — Σ reste = théorique reçues − caisse reçues.
 */
/** Partie d'un COD : espèces (caisse), chèques, traites — jamais mélangés — ou valeurs (chèques + traites, totaux seulement). */
export type CodPart = 'all' | 'especes' | 'cheque' | 'traite' | 'valeurs'
export const codPartAmount = (a: { especes: number; cheque: number; traite: number; total: number }, part: CodPart) =>
  part === 'especes' ? a.especes : part === 'cheque' ? a.cheque : part === 'traite' ? a.traite : part === 'valeurs' ? a.cheque + a.traite : a.total
/** Types de valeur couverts par une partie. */
const partHas = (part: CodPart, k: CodTypeKey) => part === 'all' || part === k || (part === 'valeurs' && k !== 'especes')

export function codResteLines(parcels: any[], city: string, part: CodPart = 'all'): CodResteLine[] {
  const out: CodResteLine[] = []
  for (const p of parcels || []) {
    if (!hasCountedCod(p) || !isReceivedInAgency(p, city) || isCodCollected(p)) continue
    const a = typedAmounts(p)
    const amount = codPartAmount(a, part)
    if (amount <= 0) continue
    const types = COD_TYPE_KEYS.filter(k => a[k] > 0 && partHas(part, k))
    out.push({ p, attendu: round2(amount), encaisse: 0, reste: round2(amount), kind: isMixedCod(p) || types.length > 1 ? 'mixte' : (types[0] || 'especes') })
  }
  return out.sort((x, y) => y.reste - x.reste)
}
/**
 * 📋 Expéditions derrière un montant du tableau (vue théorique ou situation caisse), espèces OU valeurs :
 * mêmes règles que computeAgencyCodStats. attendu = montant de la partie, encaissé = s'il est encaissé
 * (destination) ou réglé à l'expéditeur (origine). Une expédition n'apparaît qu'une fois par agence.
 */
export function codAgencyLines(parcels: any[], city: string, opts: { viewMode: CodViewMode; directionFilter?: string; originCityFilter?: string; part: CodPart }): CodResteLine[] {
  const { viewMode, directionFilter = 'all', originCityFilter = 'all', part } = opts
  const out: CodResteLine[] = []
  for (const p of parcels || []) {
    if (!hasCountedCod(p)) continue
    if (directionFilter === 'received' && originCityFilter !== 'all' && p.originCity !== originCityFilter) continue
    const a = typedAmounts(p)
    const amount = codPartAmount(a, part)
    if (amount <= 0) continue
    const asDest = directionFilter !== 'sent' && isReceivedInAgency(p, city)
    const asOrig = directionFilter !== 'received' && isSentFromAgency(p, city)
    if (!asDest && !asOrig) continue
    const done = asDest ? isCodCollected(p) : isCodSenderPaid(p)
    if (viewMode === 'physical' && !done) continue
    const types = COD_TYPE_KEYS.filter(k => a[k] > 0 && partHas(part, k))
    out.push({ p, attendu: round2(amount), encaisse: done ? round2(amount) : 0, reste: done ? 0 : round2(amount), kind: isMixedCod(p) || types.length > 1 ? 'mixte' : (types[0] || 'especes') })
  }
  return out.sort((x, y) => y.attendu - x.attendu)
}

export const COD_KIND_LABEL: Record<string, string> = { especes: '💵 Espèces', cheque: '📋 Chèque', traite: '📝 Traite', mixte: '💵+📋 Mixte' }

export function computeAgencyCodStats(
  parcels: any[],
  opts: { viewMode: CodViewMode; directionFilter?: string; originCityFilter?: string; cities?: readonly string[] },
): AgencyCodStat[] {
  const { viewMode, directionFilter = 'all', originCityFilter = 'all', cities = CITIES } = opts
  const dir: AgencyDirection = directionFilter === 'sent' ? 'sent' : directionFilter === 'received' ? 'received' : 'all'
  const stats: Record<string, AgencyCodStat> = {}
  cities.forEach(city => { stats[city] = { city, especes: 0, cheque: 0, traite: 0, total: 0, nbExpeditions: 0, nbUnique: 0, nbMixtes: 0 } })
  if (!Array.isArray(parcels)) return Object.values(stats)

  for (const p of parcels) {
    if (!hasCountedCod(p)) continue
    if (dir === 'received' && originCityFilter !== 'all' && p.originCity !== originCityFilter) continue
    const a = typedAmounts(p)
    if (a.total <= 0) continue
    const involved = [...new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])].filter((c: any) => c && stats[c]) as string[]
    for (const c of involved) {
      // Côté destination : à encaisser (théorique) / encaissé (caisse)
      const asDest = dir !== 'sent' && isReceivedInAgency(p, c) && (viewMode === 'theoretical' || isCodCollected(p))
      // Côté origine : à régler aux expéditeurs (théorique) / réglé (caisse)
      const asOrig = dir !== 'received' && isSentFromAgency(p, c) && (viewMode === 'theoretical' || isCodSenderPaid(p))
      const n = (asDest ? 1 : 0) + (asOrig ? 1 : 0)
      if (!n) continue
      const s = stats[c]
      s.especes += a.especes * n
      s.cheque += a.cheque * n
      s.traite += a.traite * n
      s.total += a.total * n
      s.nbExpeditions += n
      s.nbUnique += 1
      if (isMixedCod(p)) s.nbMixtes += 1
    }
  }
  return Object.values(stats).map(s => ({ ...s, especes: round2(s.especes), cheque: round2(s.cheque), traite: round2(s.traite), total: round2(s.total) }))
}
