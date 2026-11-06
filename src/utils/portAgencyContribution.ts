// 📮 Totaux de « Port par agence » TENUS PAR LE SERVEUR (01/11/2026) — contribution d'UNE expédition.
// Point d'entrée PARTAGÉ : la Cloud Function syncPortAgencyStats et le script de rattrapage utilisent la version compilée
// (functions/shared/portAgencyContribution.js, `node scripts/build-functions-shared.mjs`) de CE fichier, qui appelle la
// MÊME fonction que l'onglet (computeAgencyPortStats, utils/agencyFollowUp) → mêmes chiffres que le calcul sur les
// expéditions. L'onglet lit alors quelques dizaines de petits documents (portAgencyDays) au lieu de milliers d'expéditions.
import { computeAgencyPortStats } from './agencyFollowUp'
import { parcelDate } from './dateFilter'
import { getOperationalDayString } from '../config/operationalDay'

/** Montants « Vue théorique » (th_…) et « Situation caisse » (ph_…), nombres d'expéditions (direction « Toutes »). */
export const PORT_TH_KEYS = ['portPaye', 'portDu', 'portDuCheque', 'enCompteExp', 'enCompteDest'] as const
export const PORT_PH_KEYS = ['portPaye', 'portDu', 'portDuCheque'] as const
export const PORT_DAY_FIELDS = [...PORT_TH_KEYS.map(k => `th_${k}`), ...PORT_PH_KEYS.map(k => `ph_${k}`), 'nbExp', 'nbUnique']
/** Document « toutes agences » d'une journée : nombre d'expéditions DISTINCTES (une inter-agences compte une fois). */
export const PORT_ALL_CITY = '__toutes'

export interface PortAgencyContribution {
  /** Journée d'opération de l'expédition (workDate, même filtre de période que l'onglet) */
  day: string
  /** Par agence concernée : champs de PORT_DAY_FIELDS (les agences sans aucun chiffre sont omises) */
  cities: Record<string, Record<string, number>>
  /** 1 si l'expédition est dans le périmètre d'au moins une agence (compte des expéditions distinctes) */
  union: number
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Contribution d'une expédition aux totaux de sa journée, pour les agences `agencyCities` (liste des villes de l'onglet).
 * null = l'expédition ne compte pour aucune agence.
 */
export function portAgencyContributionOf(p: any, agencyCities: readonly string[]): PortAgencyContribution | null {
  if (!p) return null
  const involved = [...new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])]
    .filter((c: any) => typeof c === 'string' && c && agencyCities.includes(c)) as string[]
  if (!involved.length) return null
  const d = parcelDate(p)
  if (!d || Number.isNaN(d.getTime())) return null
  const th = computeAgencyPortStats([p], { viewMode: 'theoretical', cities: involved })
  const ph = computeAgencyPortStats([p], { viewMode: 'physical', cities: involved })
  const cities: Record<string, Record<string, number>> = {}
  let union = 0
  th.forEach((t, i) => {
    const q = ph[i]
    const v: Record<string, number> = {}
    PORT_TH_KEYS.forEach(k => { v[`th_${k}`] = r2(t[k]) })
    PORT_PH_KEYS.forEach(k => { v[`ph_${k}`] = r2(q[k]) })
    v.nbExp = t.nbExpeditions
    v.nbUnique = t.nbUnique
    if (Object.values(v).some(x => x)) cities[t.city] = v
    if (t.nbUnique) union = 1
  })
  if (!Object.keys(cities).length) return null
  return { day: getOperationalDayString(d), cities, union }
}
