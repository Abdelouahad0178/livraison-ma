/**
 * 📅 Admin « Changer la date d'une expédition » (22/10/2026) : TOUTES les dates de l'expédition sont décalées du
 * même nombre de jours (création, journée de travail, historique, livraison, encaissements COD / port, remises…),
 * l'heure de chaque événement est gardée. L'expédition passe ainsi à la nouvelle journée avec toutes ses données.
 *
 * Décalé (champs du document, objets et listes compris — ex. history[].timestamp, preReturn.*) :
 * - Timestamp Firestore (objet avec toMillis) ;
 * - texte date-heure ISO « AAAA-MM-JJTHH:MM… » ;
 * - texte date seule « AAAA-MM-JJ » dans un champ dont le nom évoque une date / journée (workDate, operationDate…).
 * Jamais décalé : traces de modification (adminChanges, dateChangeLog, updatedAt, liteUpdatedAt, lastAdminEditAt).
 */
const DAY_MS = 86400000
const SKIP_KEYS = new Set(['adminChanges', 'dateChangeLog', 'updatedAt', 'liteUpdatedAt', 'lastAdminEditAt', 'lastAdminEditBy'])
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY = /(date|day|jour)/i

/** Nombre de jours entre deux journées « AAAA-MM-JJ » (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DAY_MS)
}

const shiftDay = (s: string, days: number) => {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const isTimestamp = (v: any) => !!v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.seconds === 'number'

/**
 * Renvoie { patch, count } : patch = champs de PREMIER niveau modifiés (valeur complète, à écrire tels quels),
 * count = nombre de dates décalées. `makeTimestamp(ms)` fabrique un Timestamp (Timestamp.fromMillis).
 */
export function shiftParcelDates(parcel: Record<string, any>, days: number, makeTimestamp: (ms: number) => any) {
  let count = 0
  const walk = (v: any, key: string): any => {
    if (isTimestamp(v)) { count++; return makeTimestamp(v.toMillis() + days * DAY_MS) }
    if (typeof v === 'string') {
      if (ISO_DATETIME.test(v)) {
        const t = Date.parse(v)
        if (!Number.isNaN(t)) { count++; return new Date(t + days * DAY_MS).toISOString() }
        return v
      }
      if (DATE_ONLY.test(v) && DATE_KEY.test(key)) { count++; return shiftDay(v, days) }
      return v
    }
    if (Array.isArray(v)) return v.map(x => walk(x, key))
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const out: Record<string, any> = {}
      for (const [k, x] of Object.entries(v)) out[k] = SKIP_KEYS.has(k) ? x : walk(x, k)
      return out
    }
    return v
  }
  const patch: Record<string, any> = {}
  if (!days) return { patch, count }
  for (const [k, v] of Object.entries(parcel)) {
    if (k === 'id' || SKIP_KEYS.has(k)) continue
    const before = count
    const next = walk(v, k)
    if (count !== before) patch[k] = next
  }
  return { patch, count }
}
