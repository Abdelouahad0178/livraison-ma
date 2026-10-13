// 🧠 MÉMOIRE DES JOURNÉES PASSÉES (parcelsLite) — logique PURE (clés, rattrapage, persistance).
// La partie Firestore / IndexedDB est dans firebase/parcels.ts et firebase/liteDayStore.ts ;
// ce module est testé seul (liteDayCache.test.ts).
//
// Clé d'une journée gardée en mémoire : `ville|champ|journée d'opération`
//   - ville|originCity|AAAA-MM-JJ      : expéditions PARTIES de la ville ce jour-là
//   - ville|destinationCity|AAAA-MM-JJ : expéditions À DESTINATION de la ville ce jour-là
//   - *|createdAt|AAAA-MM-JJ           : TOUTES les villes (Admin « Port par agence »)
import { opDayOf } from './daySlices'

export const ALL_CITIES = '*'
export type LiteDayField = 'originCity' | 'destinationCity' | 'createdAt'
export interface LiteDayKeyParts { city: string; field: LiteDayField; day: string }

export const liteDayKey = (city: string, field: LiteDayField, day: string) => `${city}|${field}|${day}`

/** Découpe une clé (la ville ne contient jamais « | »). */
export function parseLiteDayKey(key: string): LiteDayKeyParts {
  const i = key.indexOf('|')
  const j = key.indexOf('|', i + 1)
  return { city: key.slice(0, i), field: key.slice(i + 1, j) as LiteDayField, day: key.slice(j + 1) }
}

/** createdAt en ms (Timestamp Firestore, {seconds}, Date, chaîne) — NaN si absent / illisible. */
export function createdMsOf(p: any): number {
  const v = p?.createdAt
  if (!v) return NaN
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return new Date(v).getTime()
}

/** Journée d'opération de création d'une expédition ('' si createdAt illisible). */
export function opDayOfParcel(p: any): string {
  const t = createdMsOf(p)
  return isNaN(t) ? '' : opDayOf(new Date(t))
}

/** L'expédition appartient-elle (dans son état ACTUEL) à la journée gardée sous cette clé ? */
export function parcelMatchesKey(p: any, k: LiteDayKeyParts): boolean {
  if (k.city !== ALL_CITIES && p?.[k.field] !== k.city) return false
  return opDayOfParcel(p) === k.day
}

/**
 * Rattrapage : replace chaque expédition modifiée dans les journées gardées (retirée partout, puis
 * remise là où elle appartient maintenant — y compris après un changement de ville ou un retour qui
 * échange origine / destination). Modifie `entries` sur place ; renvoie les clés modifiées.
 */
export function applyChangedParcels(entries: Map<string, Map<string, any>>, changed: any[]): Set<string> {
  const touched = new Set<string>()
  if (!changed.length) return touched
  for (const [key, day] of entries) {
    const k = parseLiteDayKey(key)
    for (const p of changed) {
      const had = day.delete(p.id)
      if (parcelMatchesKey(p, k)) { day.set(p.id, p); touched.add(key) } else if (had) touched.add(key)
    }
  }
  return touched
}

/** Villes présentes dans la mémoire (hors « toutes villes ») et présence de journées « toutes villes ». */
export function citiesInCache(keys: Iterable<string>): { cities: string[]; hasAllCities: boolean } {
  const cities = new Set<string>()
  let hasAllCities = false
  for (const key of keys) {
    const { city } = parseLiteDayKey(key)
    if (city === ALL_CITIES) hasAllCities = true
    else cities.add(city)
  }
  return { cities: [...cities], hasAllCities }
}

/** Retire de la mémoire les journées d'une ville (ou « * ») ; renvoie les clés retirées. */
export function dropCityEntries(entries: Map<string, any>, city: string): string[] {
  const prefix = city + '|'
  const dropped: string[] = []
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) { entries.delete(key); dropped.push(key) }
  return dropped
}

// ─────────────────────────────────────────────────────────────────────────────
// 💾 PERSISTANCE (IndexedDB) — sérialisation des documents et choix des journées gardées
// ─────────────────────────────────────────────────────────────────────────────

/** Version du format enregistré (changer = anciennes données ignorées). */
export const LITE_PERSIST_SCHEMA = 1
export const LITE_PERSIST_MAX_DAYS = 45
export const LITE_PERSIST_MAX_DOCS = 120_000

const isTimestampLike = (v: any) =>
  typeof v?.toMillis === 'function' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number'
const isGeoPointLike = (v: any) =>
  typeof v?.latitude === 'number' && typeof v.longitude === 'number' && typeof v.isEqual === 'function'

/**
 * Document → valeur enregistrable (clonage structuré) : les Timestamp / GeoPoint / Date / références
 * Firestore perdraient leurs méthodes (toMillis, toDate…) — ils sont marqués pour être recréés.
 */
export function encodeLiteValue(v: any): any {
  if (v === null || v === undefined) return v
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v
  if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined
  if (Array.isArray(v)) return v.map(x => { const e = encodeLiteValue(x); return e === undefined ? null : e })
  if (v instanceof Date) return { __date: v.getTime() }
  if (isTimestampLike(v)) return { __ts: [v.seconds, v.nanoseconds] }
  if (isGeoPointLike(v)) return { __geo: [v.latitude, v.longitude] }
  if (typeof v.path === 'string' && v.firestore) return { __ref: v.path }
  const out: Record<string, any> = {}
  for (const k of Object.keys(v)) {
    const e = encodeLiteValue(v[k])
    if (e !== undefined) out[k] = e
  }
  return out
}

export interface LiteDecoders {
  timestamp: (seconds: number, nanoseconds: number) => any
  geoPoint?: (lat: number, lng: number) => any
}

/** Inverse de encodeLiteValue (les références redeviennent leur chemin, non utilisé par les pages). */
export function decodeLiteValue(v: any, dec: LiteDecoders): any {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(x => decodeLiteValue(x, dec))
  const keys = Object.keys(v)
  if (keys.length === 1) {
    if (keys[0] === '__ts' && Array.isArray(v.__ts)) return dec.timestamp(v.__ts[0], v.__ts[1])
    if (keys[0] === '__date' && typeof v.__date === 'number') return new Date(v.__date)
    if (keys[0] === '__geo' && Array.isArray(v.__geo)) return dec.geoPoint ? dec.geoPoint(v.__geo[0], v.__geo[1]) : { latitude: v.__geo[0], longitude: v.__geo[1] }
    if (keys[0] === '__ref' && typeof v.__ref === 'string') return v.__ref
  }
  const out: Record<string, any> = {}
  for (const k of keys) out[k] = decodeLiteValue(v[k], dec)
  return out
}

/** Journée d'opération AAAA-MM-JJ décalée de n jours (calendrier local). */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + n, 12)
  const pad = (k: number) => String(k).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

/**
 * Journées à enregistrer : JAMAIS la journée en cours (ni à venir), seulement les `maxDays` dernières,
 * les plus récentes d'abord, dans la limite de `maxDocs` expéditions au total.
 */
export function selectPersistableKeys(
  sizes: Iterable<[string, number]>, today: string,
  maxDays = LITE_PERSIST_MAX_DAYS, maxDocs = LITE_PERSIST_MAX_DOCS,
): string[] {
  const oldest = shiftDay(today, -maxDays)
  const rows = [...sizes]
    .map(([key, size]) => ({ key, size, day: parseLiteDayKey(key).day }))
    .filter(r => r.day < today && r.day >= oldest)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.key.localeCompare(b.key)))
  const out: string[] = []
  let total = 0
  for (const r of rows) {
    if (total + r.size > maxDocs) continue
    total += r.size
    out.push(r.key)
  }
  return out
}
