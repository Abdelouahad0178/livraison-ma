/**
 * 🧾 « Collectes par jour » — règles PURES de l'ensemble des expéditions collectées / reçues récemment
 * (firebase/recentCollectedStore.ts). Elles reproduisent EXACTEMENT les 16 requêtes Firestore d'avant :
 *   cityField == ville  ET  dateField >= depuis (date Firestore OU texte ISO, deux formats enregistrés)
 *   ET createdAt (date Firestore) en dehors de la période chargée par la page.
 * Une égalité / comparaison Firestore ne mélange jamais les types : une date ne se compare qu'à une date,
 * un texte qu'à un texte — d'où les deux « formes » par champ.
 */

export type RecentCityField = 'destinationCity' | 'originCity'
export type RecentForm = 'ts' | 'iso'

// Date de collecte / réception → ville de l'agence concernée
export const RECENT_SHAPES: [cityField: RecentCityField, dateField: string][] = [
  ['destinationCity', 'portCollectedAt'],     // port dû collecté (livreur, guichet, chef)
  ['destinationCity', 'codCollectedAt'],      // COD collecté
  ['originCity', 'portPayeExpReceivedAt'],    // port payé ramassé remis au chef d'exploitation
  ['originCity', 'portReceivedAt'],           // port payé reçu par le chef d'agence
]
export const RECENT_FORMS: RecentForm[] = ['ts', 'iso']

/** Millisecondes d'une date Firestore (Timestamp, ou objet { seconds, nanoseconds } relu d'IndexedDB) ; sinon null. */
export function tsMillis(v: any): number | null {
  if (!v || typeof v !== 'object') return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000 + (Number(v.nanoseconds) || 0) / 1e6
  return null
}

/** L'expédition répond-elle à la requête (champ ville, champ date, forme) — sans le filtre de création ? */
export function matchesRecentShape(p: any, city: string, cityField: RecentCityField, dateField: string, form: RecentForm, sinceMs: number): boolean {
  if (!p || p[cityField] !== city) return false
  if (tsMillis(p.createdAt) === null) return false // les requêtes filtrent sur createdAt (date) : sans date, exclue
  const v = p[dateField]
  if (form === 'iso') return typeof v === 'string' && v >= new Date(sinceMs).toISOString()
  const ms = tsMillis(v)
  return ms !== null && ms >= sinceMs
}

/** Fait partie de l'ensemble (au moins une des 8 requêtes, sans le filtre de création) ? */
export function matchesRecentCollected(p: any, city: string, sinceMs: number): boolean {
  return RECENT_SHAPES.some(([cf, df]) => RECENT_FORMS.some(f => matchesRecentShape(p, city, cf, df, f, sinceMs)))
}

/** Créée EN DEHORS de la période chargée par la page (mêmes bornes que les requêtes d'avant). */
export function createdOutsidePeriod(p: any, fromMs: number, toMs: number, now: number = Date.now()): boolean {
  const t = tsMillis(p?.createdAt)
  if (t === null) return false
  if (fromMs && t < fromMs) return true
  if (toMs && toMs < now && t > toMs) return true
  return false
}

/** Aucune partie de la création n'est hors période (période ouverte jusqu'à maintenant, sans début) → rien à lire. */
export function hasOutsideRanges(fromMs: number, toMs: number, now: number = Date.now()): boolean {
  return !!fromMs || (!!toMs && toMs < now)
}
