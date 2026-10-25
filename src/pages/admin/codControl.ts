/**
 * 💰 Page admin « Contre Remboursement » — CONTRÔLE du COD de toutes les agences. Logique PURE (aucun React,
 * aucun Firestore), testée à part (codControl.test.ts).
 *
 * ⚖️ Aucune règle nouvelle : chaque notion reprend la fonction des pages existantes.
 *   - « COD collectés »       → isCaisseCodCollecte / groupCodCollectesParJour (Caisse Agence, Collecte du soir :
 *                               bloc « Valeurs (COD) collectées par jour »), rangés au JOUR DE COLLECTE ;
 *   - montants par type       → caisseCodAmountOfType (mixte : une part par type, Retour BL hors argent) ;
 *   - avant le 05/10/2026     → isCodMoneyBeforeStart (moneyFlow, MONEY_START) ;
 *   - reçu chef d'exploitation→ isCodExpReceived (Collecte du soir) ;
 *   - livrée non encaissée    → isCodLivreNonCollecte (bilan de journée de Caisse Agence) ;
 *   - pointé / arrivée        → controlled / deliveryControlled (encaisseur central, Contrôle & Pointage) ;
 *   - chèque sans données     → isDocParcel / hasDocData (fiche de réception des chèques) ;
 *   - expéditeur payé         → isCodSenderPaid (encaisseur central, onglet Fournisseurs).
 *
 * 📅 Deux bases de date, affichées clairement sur la page :
 *   - suivi du circuit : journée d'opération de CRÉATION de l'expédition (caisseParcelDate, comme Caisse Agence) ;
 *   - « COD collectés » : journée d'opération de la COLLECTE (codCollectedAt), comme « Valeurs (COD) collectées par jour ».
 */
import { getOperationalDayString } from '../../config/operationalDay'
import { codPaymentTypeOf } from '../../firebase/constants'
import { codHasType, isMixedCod } from '../../utils/codParts'
import { isCodMoneyBeforeStart, isCodSenderPaid } from '../../utils/moneyFlow'
import {
  caisseCodAmountOfType, caisseCodValueTotal, caisseParcelDate, groupCodCollectesParJour, isCodLivreNonCollecte,
  toDateSafe, type CodCollecteJour,
} from '../../utils/agencyCaisseRules'
import { isCodExpReceived, isReturnedParcel } from '../exploitation/exploitationRules'
import { isDocParcel, hasDocData } from '../central/ChequeReception'

// ── Étapes du circuit ────────────────────────────────────────────────────────

export type CodStep =
  | 'a_collecter' | 'chez_livreur' | 'recu_exploitation' | 'recu_agence' | 'envoye'
  | 'pointe' | 'arrive' | 'paye'
  | 'retourne' | 'hors_valeur' | 'avant_debut'

export type CodSide = 'destination' | 'origine' | 'hors'

export interface CodStepMeta {
  key: CodStep
  n: number
  label: string
  help: string
  side: CodSide
  badge: string
}

/** Étapes dans l'ordre du circuit (livreur → … → expéditeur payé), puis les cas hors circuit. */
export const COD_STEPS: CodStepMeta[] = [
  { key: 'a_collecter', n: 1, side: 'destination', label: 'À collecter', help: "COD pas encore encaissé auprès du destinataire (codStatus « pending »)", badge: 'bg-gray-100 text-gray-700 border-gray-300' },
  { key: 'chez_livreur', n: 2, side: 'destination', label: 'Chez livreurs / En gare', help: "Encaissé par le livreur ou le guichet « En gare », pas encore reçu par le chef d'exploitation (à recevoir des livreurs)", badge: 'bg-red-50 text-red-700 border-red-300' },
  { key: 'recu_exploitation', n: 3, side: 'destination', label: "Reçus chef d'exploitation", help: "Reçu à la Collecte du soir, pas encore reçu par le chef d'agence (envoi des valeurs à valider)", badge: 'bg-amber-50 text-amber-800 border-amber-300' },
  { key: 'recu_agence', n: 4, side: 'destination', label: "Reçus chef d'agence", help: "Reçu par le chef d'agence (codStatus « remis ») : en caisse agence, pas encore envoyé", badge: 'bg-orange-50 text-orange-700 border-orange-300' },
  { key: 'envoye', n: 5, side: 'destination', label: 'Envoyés (valeurs)', help: "Valeur partie de l'agence de destination : envoyée à l'agence d'origine ou versée au compte société, pas encore pointée", badge: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'pointe', n: 6, side: 'origine', label: "Pointés (encaisseur central)", help: "Pointé par l'encaisseur central / l'analyseur chèques, arrivée à l'agence d'origine pas encore confirmée", badge: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  { key: 'arrive', n: 7, side: 'origine', label: "Arrivés agence d'origine", help: "Arrivée confirmée dans la ville d'origine, expéditeur pas encore payé", badge: 'bg-purple-50 text-purple-700 border-purple-300' },
  { key: 'paye', n: 8, side: 'origine', label: "Payés à l'expéditeur", help: "Expéditeur payé (fin du circuit)", badge: 'bg-green-50 text-green-700 border-green-300' },
  { key: 'retourne', n: 0, side: 'hors', label: 'Retournées (COD non dû)', help: "Expédition retournée sans encaissement du COD", badge: 'bg-slate-100 text-slate-600 border-slate-300' },
  { key: 'hors_valeur', n: 0, side: 'hors', label: "Sans valeur d'argent", help: "Retour BL (document) ou type de COD sans valeur espèces / chèque / traite : 0 DH dans Caisse Agence", badge: 'bg-slate-100 text-slate-600 border-slate-300' },
  { key: 'avant_debut', n: 0, side: 'hors', label: 'Encaissés avant le 05/10/2026', help: "COD encaissé pendant la période d'essais (avant le 05/10/2026 08:00) : hors de tous les calculs d'argent", badge: 'bg-slate-100 text-slate-600 border-slate-300' },
]
export const COD_STEP_META: Record<CodStep, CodStepMeta> = Object.fromEntries(COD_STEPS.map(s => [s.key, s])) as Record<CodStep, CodStepMeta>
export const CIRCUIT_STEPS = COD_STEPS.filter(s => s.side !== 'hors')
export const HORS_STEPS = COD_STEPS.filter(s => s.side === 'hors')

/**
 * Étape ACTUELLE du COD d'une expédition = l'étape la plus avancée atteinte (un drapeau posé plus loin dans le
 * circuit l'emporte toujours, ex. pointée sans drapeau « envoyée »).
 */
export function codStepOf(p: any): CodStep {
  if (isCodMoneyBeforeStart(p)) return 'avant_debut'
  if (caisseCodValueTotal(p) <= 0) return 'hors_valeur'
  if (isCodSenderPaid(p)) return 'paye'
  if (p.deliveryControlled || p.codReceivedBySource) return 'arrive'
  if (p.controlled) return 'pointe'
  if (p.codSentToSource || p.centralDeposited) return 'envoye'
  const st = p.codStatus || 'pending'
  if (st === 'pending') return isReturnedParcel(p) ? 'retourne' : 'a_collecter'
  if (st === 'collected') return isCodExpReceived(p) ? 'recu_exploitation' : 'chez_livreur'
  return 'recu_agence' // 'remis' (reçu par le chef d'agence) / anciens 'regle'
}

const first = (...v: any[]) => v.find(x => x !== undefined && x !== null && x !== '')

/** Date d'entrée dans l'étape (pour l'ancienneté et la colonne « Dernière étape »). */
export function codStepSince(p: any, step: CodStep = codStepOf(p)): any {
  switch (step) {
    case 'paye': return first(p.codSenderPaidAt, p.centralSupplierPaidAt)
    case 'arrive': return first(p.deliveryControlledAt, p.codReceivedBySourceAt)
    case 'pointe': return p.controlledAt
    case 'envoye': return first(p.codSentToSourceAt, p.centralDepositedAt)
    case 'recu_agence': return first(p.codChefReceivedAt, p.codReceivedByChefAt, p.codRemisAt)
    case 'recu_exploitation': return p.codExpReceivedAt
    case 'chez_livreur': case 'avant_debut': return first(p.codCollectedAt, p.codRemisAt)
    default: return first(p.createdAt, p.workDate)
  }
}

/** Qui a fait la dernière étape. */
export function codStepActor(p: any, step: CodStep = codStepOf(p)): string {
  switch (step) {
    case 'paye': return first(p.codSenderPaidBy, p.centralSupplierPaidBy) || ''
    case 'arrive': return first(p.deliveryControlledBy, p.codReceivedBySourceBy) || ''
    case 'pointe': return p.controlledBy || ''
    case 'envoye': return first(p.codSentToSourceBy, p.centralDeposited ? 'Versé au compte société' : '') || ''
    case 'recu_agence': return first(p.codChefReceivedBy, p.codReceivedByChefBy, p.codRemisBy) || ''
    case 'recu_exploitation': return p.codExpReceivedBy || ''
    case 'chez_livreur': case 'avant_debut': return first(p.codCollectedBy, p.deliveryDriverName) || ''
    default: return p.deliveryDriverName || ''
  }
}

export const destCityOf = (p: any): string => p?.destinationCity || p?.receiver?.city || 'Agence non définie'
export const originCityOf = (p: any): string => p?.originCity || p?.sender?.city || 'Agence non définie'

/** Agence responsable de l'étape : DESTINATION pour l'encaissement (1 → 5), ORIGINE pour le retour à l'expéditeur (6 → 8). */
export const stepCityOf = (p: any, step: CodStep = codStepOf(p)): string =>
  COD_STEP_META[step].side === 'origine' ? originCityOf(p) : destCityOf(p)

/** Montant des valeurs (espèces + chèque + traite) — même calcul que Caisse Agence. */
export const codValueOf = (p: any): number => caisseCodValueTotal(p)

// ── À surveiller (anomalies) ────────────────────────────────────────────────

export type CodAnomaly =
  | 'livree_non_collectee' | 'collecte_48h' | 'doc_sans_donnees' | 'envoye_non_pointe' | 'pointe_non_arrive' | 'arrive_non_paye'

export const COD_ANOMALIES: { key: CodAnomaly; label: (days: number) => string; help: string }[] = [
  { key: 'livree_non_collectee', label: () => 'Livrée mais COD non collecté', help: "Statut « Livré » et COD encore « à collecter » (= « Livrés non encaissés » du bilan Caisse Agence)" },
  { key: 'collecte_48h', label: () => "COD collecté depuis plus de 48 h, pas reçu par le chef d'agence", help: "Encaissé (codCollectedAt) il y a plus de 48 h, encore chez le livreur / En gare ou chez le chef d'exploitation" },
  { key: 'doc_sans_donnees', label: () => 'Chèque / traite pointé sans N° ni banque', help: "Pointé par l'encaisseur central mais sans données de chèque (N° + banque)" },
  { key: 'envoye_non_pointe', label: d => `Valeur envoyée, pas pointée depuis plus de ${d} j`, help: "Envoyée à l'agence d'origine / versée au compte société, sans pointage de l'encaisseur central" },
  { key: 'pointe_non_arrive', label: d => `Pointée, arrivée non confirmée depuis plus de ${d} j`, help: "Pointée par l'encaisseur central, arrivée à l'agence d'origine pas encore confirmée" },
  { key: 'arrive_non_paye', label: d => `Arrivée, expéditeur non payé depuis plus de ${d} j`, help: "Arrivée confirmée à l'agence d'origine, expéditeur pas encore payé" },
]

const HOUR = 3600 * 1000
const ageHours = (v: any, now: number): number | null => {
  const d = toDateSafe(v)
  return d ? (now - d.getTime()) / HOUR : null
}

/** Anomalies d'une expédition (`days` = seuil en jours des étapes après l'envoi). */
export function codAnomaliesOf(p: any, days: number, now: number = Date.now()): CodAnomaly[] {
  const out: CodAnomaly[] = []
  if (isCodMoneyBeforeStart(p)) return out
  const step = codStepOf(p)
  if (isCodLivreNonCollecte(p) && !isReturnedParcel(p)) out.push('livree_non_collectee')
  if (step === 'chez_livreur' || step === 'recu_exploitation') {
    const h = ageHours(p.codCollectedAt, now)
    if (h !== null && h > 48) out.push('collecte_48h')
  }
  if (p.controlled && isDocParcel(p) && !hasDocData(p)) out.push('doc_sans_donnees')
  const late = (h: number | null) => h !== null && h > days * 24
  if (step === 'envoye' && late(ageHours(codStepSince(p, step), now))) out.push('envoye_non_pointe')
  if (step === 'pointe' && late(ageHours(codStepSince(p, step), now))) out.push('pointe_non_arrive')
  if (step === 'arrive' && late(ageHours(codStepSince(p, step), now))) out.push('arrive_non_paye')
  return out
}

// ── Filtres ──────────────────────────────────────────────────────────────────

export type CodTypeFilter = 'all' | 'especes' | 'cheque' | 'traite' | 'bon_livraison' | 'mixte' | 'signale'
export const COD_TYPE_FILTERS: { key: CodTypeFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'especes', label: '💵 Espèces' },
  { key: 'cheque', label: '📋 Chèque' },
  { key: 'traite', label: '📝 Traite' },
  { key: 'bon_livraison', label: '🧾 Retour BL' },
  { key: 'mixte', label: '💵+📋 Mixte' },
  { key: 'signale', label: '⚠️ Chèque + espèces signalé' },
]

/** Type de COD (même règle que les pages COD : un mixte apparaît sous Espèces ET sous son document). */
export const codTypeMatches = (p: any, t: CodTypeFilter | string): boolean => {
  if (t === 'all') return true
  if (t === 'mixte') return isMixedCod(p)
  // ⚠️ Signalé par l'encaisseur central / l'analyseur chèque : chèque reçu < attendu, le reste payé en espèces
  if (t === 'signale') return p?.codDocMismatch === true
  return codPaymentTypeOf(p) === t || codHasType(p, t)
}

/** Expédition concernant l'agence (destination OU origine). */
export const inAgency = (p: any, city: string): boolean => city === 'all' || destCityOf(p) === city || originCityOf(p) === city

// ── Période (journées d'opération, clés 'YYYY-MM-DD') ────────────────────────

export type CodPreset = 'today' | 'week' | 'month' | 'custom'
export const MAX_PERIOD_DAYS = 62

const pad2 = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
export const addDaysToKey = (key: string, n: number): string => {
  const [y, m, d] = key.split('-').map(Number)
  return keyOf(new Date(y, m - 1, d + n, 12))
}
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / (24 * HOUR)) + 1
const validKey = (k?: string) => /^\d{4}-\d{2}-\d{2}$/.test(k || '')
export const fmtKey = (k: string) => (validKey(k) ? k.split('-').reverse().join('/') : k)

export interface CodPeriod { fromKey: string; toKey: string; label: string; days: number; cappedFrom: number | null }

/**
 * Période choisie → journées d'opération (mêmes presets que Caisse Agence : aujourd'hui, 7 jours, ce mois).
 * « Période du … au … » : appliquée seulement quand LES DEUX dates sont saisies (sinon : 7 derniers jours).
 */
export function codPeriodOf(preset: CodPreset | string, from: string, to: string, todayKey: string): CodPeriod {
  let fromKey = todayKey.slice(0, 8) + '01', toKey = todayKey, label = 'Ce mois'
  if (preset === 'today') { fromKey = todayKey; label = "Aujourd'hui" }
  // 7 jours aussi tant que la période « du … au … » n'a pas ses deux dates (le mois entier est lourd à charger)
  else if (preset === 'week' || (preset === 'custom' && !(validKey(from) && validKey(to)))) { fromKey = addDaysToKey(todayKey, -6); label = '7 derniers jours' }
  else if (preset === 'custom' && validKey(from) && validKey(to)) {
    fromKey = from <= to ? from : to
    toKey = from <= to ? to : from
    label = `Du ${fmtKey(fromKey)} au ${fmtKey(toKey)}`
  }
  let days = daysBetween(fromKey, toKey)
  let cappedFrom: number | null = null
  if (days > MAX_PERIOD_DAYS) { cappedFrom = days; toKey = addDaysToKey(fromKey, MAX_PERIOD_DAYS - 1); days = MAX_PERIOD_DAYS }
  return { fromKey, toKey, label, days, cappedFrom }
}

/** Journée d'opération de CRÉATION (workDate, sinon createdAt) — base de date de Caisse Agence. */
export const createdDayKey = (p: any): string => getOperationalDayString(caisseParcelDate(p))
export const keyInPeriod = (key: string | null | undefined, period: { fromKey: string; toKey: string }) =>
  !!key && key >= period.fromKey && key <= period.toKey

// ── Synthèses ────────────────────────────────────────────────────────────────

export interface StepTotal { n: number; m: number }
export type StepTotals = Record<CodStep, StepTotal>
const zeroSteps = (): StepTotals => Object.fromEntries(COD_STEPS.map(s => [s.key, { n: 0, m: 0 }])) as StepTotals

/** Circuit par agence (étapes 1 → 5 à l'agence de destination, 6 → 8 à l'agence d'origine) + total général. */
export function circuitByAgency(list: any[]): { byCity: Map<string, StepTotals>; total: StepTotals } {
  const byCity = new Map<string, StepTotals>()
  const total = zeroSteps()
  for (const p of list) {
    const step = codStepOf(p)
    const city = stepCityOf(p, step)
    const m = codValueOf(p)
    if (!byCity.has(city)) byCity.set(city, zeroSteps())
    const c = byCity.get(city)![step]
    c.n++; c.m += m
    total[step].n++; total[step].m += m
  }
  return { byCity, total }
}

export interface CodCollectesAgence {
  city: string
  parJour: [string, CodCollecteJour][]
  count: number; montant: number; especes: number; cheque: number; traite: number
  parcels: any[]
}

/**
 * 💰 « COD collectés » d'une agence sur la période = journées de groupCodCollectesParJour (règle de Caisse Agence /
 * Collecte du soir) dont le JOUR DE COLLECTE est dans la période.
 */
export function codCollectesOfAgency(list: any[], city: string, period: { fromKey: string; toKey: string }, keep: ((p: any) => boolean) | null = null): CodCollectesAgence {
  const parJour = groupCodCollectesParJour(list, city, keep).filter(([k]) => keyInPeriod(k, period))
  const out: CodCollectesAgence = { city, parJour, count: 0, montant: 0, especes: 0, cheque: 0, traite: 0, parcels: [] }
  for (const [, d] of parJour) {
    out.count += d.count; out.montant += d.montant
    out.especes += d.especes; out.cheque += d.cheque; out.traite += d.traite
    out.parcels.push(...d.parcels)
  }
  return out
}

/** Parts par type (colonnes Espèces / Chèque / Traite de Caisse Agence). */
export const codTypeParts = (p: any) => ({
  especes: caisseCodAmountOfType(p, 'especes'),
  cheque: caisseCodAmountOfType(p, 'cheque'),
  traite: caisseCodAmountOfType(p, 'traite'),
})
