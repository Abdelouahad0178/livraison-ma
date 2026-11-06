// Conversion des valeurs de l'API REST Firestore ⇄ JavaScript (même forme que `doc.data()` de la bibliothèque Firebase).
// Module PUR (testé : restValue.test.ts, et comparé champ par champ aux lectures habituelles sur données réelles).
import { Timestamp, GeoPoint, Bytes } from 'firebase/firestore'

/** Horodatage REST (« 2026-10-31T12:26:29.792123Z ») → Timestamp exact (secondes + nanosecondes). */
export function restTimestamp(iso: string): Timestamp {
  const m = /^(.*?)(?:\.(\d+))?Z$/.exec(iso)
  const seconds = Math.floor(Date.parse(`${m ? m[1] : iso}Z`) / 1000)
  const frac = m && m[2] ? m[2] : ''
  return new Timestamp(seconds, frac ? Number(`${frac}000000000`.slice(0, 9)) : 0)
}

/** `ref` : convertit le chemin d'une référence (« parcels/abc ») en DocumentReference (fourni par l'appelant). */
export interface RestConvertOpts { ref?: (path: string) => any }

/** Valeur REST Firestore → valeur JavaScript. */
export function fromRestValue(v: any, opts: RestConvertOpts = {}): any {
  if (!v || typeof v !== 'object') return null
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return !!v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return typeof v.doubleValue === 'number' ? v.doubleValue : Number(v.doubleValue)
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return restTimestamp(v.timestampValue)
  if ('mapValue' in v) return fromRestFields(v.mapValue?.fields || {}, opts)
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map((x: any) => fromRestValue(x, opts))
  if ('geoPointValue' in v) return new GeoPoint(v.geoPointValue?.latitude || 0, v.geoPointValue?.longitude || 0)
  if ('referenceValue' in v) { const path = String(v.referenceValue).split('/documents/')[1]; return opts.ref ? opts.ref(path) : path }
  if ('bytesValue' in v) return Bytes.fromBase64String(v.bytesValue)
  return null
}
export function fromRestFields(fields: Record<string, any>, opts: RestConvertOpts = {}): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromRestValue(v, opts)
  return out
}

/** Valeur JavaScript simple → valeur REST (filtres : texte, nombre, booléen, Date / Timestamp, valeur REST déjà prête). */
export function toRestValue(v: any): any {
  if (v instanceof Timestamp) {
    const ns = String(v.nanoseconds).padStart(9, '0')
    return { timestampValue: `${new Date(v.seconds * 1000).toISOString().slice(0, 19)}.${ns}Z` }
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (v && typeof v === 'object' && ('timestampValue' in v || 'stringValue' in v)) return v
  return { nullValue: null }
}
