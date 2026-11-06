// 💰 Totaux de « COD par agence » TENUS PAR LE SERVEUR (01/11/2026) — contribution d'UNE expédition.
// Même principe que utils/portAgencyContribution (Port par agence) : point d'entrée PARTAGÉ, compilé pour la Cloud Function
// syncCodAgencyStats (functions/shared/codAgencyContribution.js), qui appelle la MÊME fonction que l'onglet
// (computeAgencyCodStats, utils/agencyCodStats) → mêmes chiffres que le calcul sur les expéditions.
// Les montants dépendent de la direction (reçues = à encaisser / encaissées ; envoyées = à régler / réglées aux
// expéditeurs ; toutes = les deux) : chaque vue × direction est tenue à part.
// (01/11/2026, 2ᵉ étape) TOUS les filtres de l'onglet sans charger les expéditions :
//  - Ville d'origine (reçues) : totaux par ville d'origine (byOrigin) ;
//  - type de valeur / expéditions distinctes : chaque expédition est comptée dans la COMBINAISON d'agences où elle compte
//    (sets / setsO) → le nombre d'expéditions distinctes de n'importe quel groupe d'agences est exact ;
//  - Reste à encaisser : nombre d'expéditions par type (reste_especes_n…) ;
//  - listes (montant cliqué, reste d'une agence) : cityList permet de retrouver les expéditions concernées.
import { computeAgencyCodStats, COD_TYPE_KEYS, type AgencyCodStat } from './agencyCodStats'
import { parcelDate } from './dateFilter'
import { getOperationalDayString } from '../config/operationalDay'

export const COD_MODES = ['th', 'ph'] as const            // vue théorique / situation caisse
export const COD_DIRS = ['rcv', 'snd', 'all'] as const    // reçues / envoyées / toutes
export const COD_STAT_KEYS = ['especes', 'cheque', 'traite', 'total', 'nbExp', 'nbUnique', 'nbMix'] as const
/** Reste à encaisser (reçues, pas encore encaissées) : nombre d'expéditions par type de valeur */
export const COD_RESTE_FIELDS = COD_TYPE_KEYS.map(k => `reste_${k}_n`)
export const COD_DAY_FIELDS = [...COD_MODES.flatMap(m => COD_DIRS.flatMap(d => COD_STAT_KEYS.map(k => `${m}_${d}_${k}`))), ...COD_RESTE_FIELDS]
/** Document « toutes agences » d'une journée : expéditions DISTINCTES par vue × direction (u_th_rcv…). */
export const COD_UNION_FIELDS = COD_MODES.flatMap(m => COD_DIRS.map(d => `u_${m}_${d}`))
export const COD_ALL_CITY = '__toutes'
/** Ville d'origine inconnue (clé de carte non vide) */
export const COD_NO_ORIGIN = '?'

const MODE = { th: 'theoretical', ph: 'physical' } as const
const DIR = { rcv: 'received', snd: 'sent', all: 'all' } as const
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface CodAgencyContribution {
  day: string
  /** Ville d'origine de l'expédition (filtre « Ville d'origine » des reçues) */
  origin: string
  /** Agences où l'expédition a un chiffre (recherche des expéditions d'une agence) */
  cityList: string[]
  cities: Record<string, Record<string, number>>
  union: Record<string, number>
  /** Par vue × direction : agences où l'expédition compte (total > 0), triées, séparées par « | » */
  sets: Record<string, string>
}

/** Contribution d'une expédition aux totaux de sa journée pour les agences `agencyCities` ; null = ne compte nulle part. */
export function codAgencyContributionOf(p: any, agencyCities: readonly string[]): CodAgencyContribution | null {
  if (!p) return null
  const involved = [...new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])]
    .filter((c: any) => typeof c === 'string' && c && agencyCities.includes(c)) as string[]
  if (!involved.length) return null
  const d = parcelDate(p)
  if (!d || Number.isNaN(d.getTime())) return null
  const cities: Record<string, Record<string, number>> = {}
  const union: Record<string, number> = {}
  const sets: Record<string, string> = {}
  for (const m of COD_MODES) {
    for (const dir of COD_DIRS) {
      const stats = computeAgencyCodStats([p], { viewMode: MODE[m], directionFilter: DIR[dir], cities: involved })
      const counted: string[] = []
      for (const s of stats) {
        const v = cities[s.city] || (cities[s.city] = {})
        v[`${m}_${dir}_especes`] = r2(s.especes)
        v[`${m}_${dir}_cheque`] = r2(s.cheque)
        v[`${m}_${dir}_traite`] = r2(s.traite)
        v[`${m}_${dir}_total`] = r2(s.total)
        v[`${m}_${dir}_nbExp`] = s.nbExpeditions
        v[`${m}_${dir}_nbUnique`] = s.nbUnique
        v[`${m}_${dir}_nbMix`] = s.nbMixtes
        if (s.total > 0) { union[`u_${m}_${dir}`] = 1; counted.push(s.city) }
      }
      if (counted.length) sets[`${m}_${dir}`] = counted.sort().join('|')
    }
  }
  // Reste à encaisser (codResteLines) : reçue, valeur de ce type attendue, pas encore encaissée
  for (const v of Object.values(cities)) {
    for (const k of COD_TYPE_KEYS) v[`reste_${k}_n`] = v[`th_rcv_${k}`] > 0 && !(v[`ph_rcv_${k}`] > 0) ? 1 : 0
  }
  for (const [c, v] of Object.entries(cities)) if (!Object.values(v).some(x => x)) delete cities[c]
  if (!Object.keys(cities).length) return null
  return { day: getOperationalDayString(d), origin: p.originCity || COD_NO_ORIGIN, cityList: Object.keys(cities).sort(), cities, union, sets }
}

/** Une différence à appliquer à un document de journée : compteurs simples + compteurs imbriqués (chemin de clés). */
export interface CodDayDelta { city: string; day: string; nums: Record<string, number>; nested: { path: string[]; n: number }[] }

/**
 * Différences qu'une contribution apporte aux documents de journée (sign = +1 ajout, −1 retrait) — règle UNIQUE utilisée
 * par la Cloud Function (increments en transaction) et par les contrôles / tests (sommes simulées).
 *  - {journée}_{ville} : champs COD_DAY_FIELDS ; byOrigin.{origine}.{th|ph}_rcv_{clé} (reçues par ville d'origine) ;
 *  - {journée}___toutes : u_… ; sets.{vue_direction}.{combinaison} ; setsO.{vue}.{origine}.{combinaison} (reçues).
 */
export function codDayDeltas(c: CodAgencyContribution | null | undefined, sign: 1 | -1): CodDayDelta[] {
  if (!c) return []
  const out: CodDayDelta[] = []
  const origin = c.origin || COD_NO_ORIGIN
  for (const [city, v] of Object.entries(c.cities)) {
    const nums: Record<string, number> = {}
    for (const f of COD_DAY_FIELDS) nums[f] = r2(sign * (Number(v[f]) || 0))
    const nested: CodDayDelta['nested'] = []
    for (const m of COD_MODES) for (const k of COD_STAT_KEYS) {
      const n = Number(v[`${m}_rcv_${k}`]) || 0
      if (n) nested.push({ path: ['byOrigin', origin, `${m}_rcv_${k}`], n: r2(sign * n) })
    }
    out.push({ city, day: c.day, nums, nested })
  }
  const nums: Record<string, number> = {}
  for (const f of COD_UNION_FIELDS) nums[f] = sign * ((c.union && c.union[f]) || 0)
  const nested: CodDayDelta['nested'] = []
  for (const [md, key] of Object.entries(c.sets || {})) {
    nested.push({ path: ['sets', md, key], n: sign })
    const [m, dir] = md.split('_')
    if (dir === 'rcv') nested.push({ path: ['setsO', m, origin, key], n: sign })
  }
  if (Object.values(nums).some(x => x) || nested.length) out.push({ city: COD_ALL_CITY, day: c.day, nums, nested })
  return out
}

/**
 * 📊 Lignes de l'onglet à partir des documents de journée — mêmes résultats que computeAgencyCodStats sur les expéditions
 * de la période (vue, direction, ville d'origine) — et nombre d'expéditions DISTINCTES d'un groupe d'agences.
 */
export function codAgencyFromDays(docs: any[], cities: readonly string[], opts: { viewMode: 'theoretical' | 'physical'; directionFilter?: string; originCityFilter?: string }) {
  const m = opts.viewMode === 'physical' ? 'ph' : 'th'
  const dir = opts.directionFilter === 'sent' ? 'snd' : opts.directionFilter === 'received' ? 'rcv' : 'all'
  const byOrigin = dir === 'rcv' && opts.originCityFilter && opts.originCityFilter !== 'all' ? opts.originCityFilter : null
  const rows = new Map<string, AgencyCodStat>(cities.map(city => [city, { city, especes: 0, cheque: 0, traite: 0, total: 0, nbExpeditions: 0, nbUnique: 0, nbMixtes: 0 }]))
  const combos = new Map<string, number>()
  const field = (k: string) => `${m}_${dir}_${k}`
  for (const d of docs) {
    if (d.city === COD_ALL_CITY) {
      const sets = byOrigin ? d.setsO?.[m]?.[byOrigin] : d.sets?.[`${m}_${dir}`]
      for (const [key, n] of Object.entries(sets || {})) combos.set(key, (combos.get(key) || 0) + (Number(n) || 0))
      continue
    }
    const row = rows.get(d.city)
    if (!row) continue
    const src = byOrigin ? d.byOrigin?.[byOrigin] || {} : d
    row.especes += Number(src[field('especes')]) || 0
    row.cheque += Number(src[field('cheque')]) || 0
    row.traite += Number(src[field('traite')]) || 0
    row.total += Number(src[field('total')]) || 0
    row.nbExpeditions += Number(src[field('nbExp')]) || 0
    row.nbUnique += Number(src[field('nbUnique')]) || 0
    row.nbMixtes += Number(src[field('nbMix')]) || 0
  }
  const stats = [...rows.values()].map(s => ({ ...s, especes: r2(s.especes), cheque: r2(s.cheque), traite: r2(s.traite), total: r2(s.total) }))
  /** Expéditions distinctes comptées dans au moins une des agences `group` */
  const uniqueOf = (group: readonly string[]) => {
    const g = new Set(group)
    let n = 0
    for (const [key, count] of combos) if (key.split('|').some(c => g.has(c))) n += count
    return n
  }
  return { stats, uniqueOf }
}

/** Reste à encaisser d'une agence et d'un type, à partir des documents de journée (reçues, toutes origines). */
export function codResteFromDays(docs: any[], city: string, part: 'especes' | 'cheque' | 'traite') {
  let attendu = 0, encaisse = 0, count = 0
  for (const d of docs) {
    if (d.city !== city) continue
    attendu += Number(d[`th_rcv_${part}`]) || 0
    encaisse += Number(d[`ph_rcv_${part}`]) || 0
    count += Number(d[`reste_${part}_n`]) || 0
  }
  return { attendu: r2(attendu), encaisse: r2(encaisse), reste: r2(attendu - encaisse), count }
}
