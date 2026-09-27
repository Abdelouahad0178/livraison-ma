import type { DateFilterPreset } from '../types'
import { getOperationalDayRange, getCurrentOperationalDay } from '../config/operationalDay'

// ── Date string helpers ───────────────────────────────────────────────────────

// Returns today's date as YYYY-MM-DD in the browser's LOCAL timezone.
// (Using toISOString() would return the UTC date, which is wrong for Morocco UTC+1
// between midnight and 1 AM local time.)
export const todayStr = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Date extractors ───────────────────────────────────────────────────────────

// Minimal duck-type accepted by both parcelDate and entryDate
type WithCreatedAt = {
  createdAt?: { toDate?: () => Date } | string | number | null
  history?: Array<{ timestamp?: string } | null>
}

// ⚡ Cache par objet expédition : new Date('YYYY-MM-DDT12:00:00') (analyse de chaîne) était refait
// pour chaque expédition à CHAQUE filtrage. Validé par identité des champs sources (workDate,
// createdAt, history) : si l'un change, la date est recalculée. Renvoie toujours un NOUVEL objet
// Date (un appelant peut le modifier sans polluer le cache).
const PARCEL_DATE_CACHE = new WeakMap<object, { wd: unknown; ca: unknown; h: unknown; ms: number }>()
export const parcelDate = (p: any): Date => {
  if (!p || typeof p !== 'object') return parcelDateRaw(p)
  const c = PARCEL_DATE_CACHE.get(p)
  if (c && c.wd === p.workDate && c.ca === p.createdAt && c.h === p.history) return new Date(c.ms)
  const d = parcelDateRaw(p)
  PARCEL_DATE_CACHE.set(p, { wd: p.workDate, ca: p.createdAt, h: p.history, ms: d.getTime() })
  return d
}

const parcelDateRaw = (p: any): Date => {
  // 🗓️ PRIORITÉ 1 : workDate — la JOURNÉE D'OPÉRATION du système (8h → 6h le lendemain), pas
  // le jour calendaire de createdAt. Une expédition saisie à 2h du matin appartient à la
  // journée commencée à 8h la veille.
  //
  // ⚠️ Historique : ce fichier ignorait workDate ("TEMPORAIRE... workDate semble incorrect,
  // tous à août au lieu de juillet") à cause d'un vrai bug — calculateWorkDate utilisait
  // toISOString() (conversion UTC), ce qui décalait la date d'un jour pour tout colis créé
  // entre minuit et 1h heure du Maroc. Ce bug est corrigé à la source (firebase/parcels.ts,
  // calculateWorkDate délègue maintenant à getOperationalDayString) : workDate est de nouveau
  // fiable pour les colis créés depuis ce correctif.
  if (p.workDate) {
    return new Date(p.workDate + 'T12:00:00')
  }

  // 📅 FALLBACK createdAt : pour les colis créés AVANT ce correctif ou sans workDate du tout.
  const ca = p.createdAt as { toDate?: () => Date } | undefined | null
  if (ca?.toDate) return ca.toDate()
  const ts = p.history?.[0]?.timestamp
  if (ts) return new Date(ts)

  return new Date(0)
}

export const entryDate = (e: WithCreatedAt): Date => {
  const ca = e.createdAt as { toDate?: () => Date } | string | undefined | null
  if (ca && typeof ca === 'object' && ca.toDate) return ca.toDate()
  if (ca) return new Date(ca as string)
  return new Date(0)
}

// ── Main filter ───────────────────────────────────────────────────────────────

// Filters a list by date preset.
// end defaults to end-of-today (not "now") so that parcels whose createdAt is
// set to noon via operationDate are always visible even before noon.
export const filterByDate = <T>(
  list: T[],
  preset: DateFilterPreset,
  from?: string | null,
  to?: string | null,
  getDate: (item: T) => Date = parcelDate as unknown as (item: T) => Date,
  operationalDay?: Date,
): T[] => {
  if (preset === 'all') return list
  const now = new Date()
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
  let start: Date | null = null
  let end: Date = endOfToday
  if (preset === 'today') {
    // 🕐 Utiliser le jour opérationnel (8h → 6h lendemain) au lieu du jour calendaire
    const opDay = getCurrentOperationalDay()
    const range = getOperationalDayRange(opDay)
    start = range.start
    end = range.end
  } else if (preset === 'week') {
    // 🕐 Idem "today" : 7 derniers JOURS D'OPÉRATION, pas 7 jours calendaires — sinon un colis
    // saisi entre minuit et 6h (workDate = la veille) sortait à tort de la fenêtre "7 jours".
    const todayOp = getCurrentOperationalDay()
    const weekAgoOp = new Date(todayOp); weekAgoOp.setDate(weekAgoOp.getDate() - 6)
    start = getOperationalDayRange(weekAgoOp).start
    end = getOperationalDayRange(todayOp).end
  } else if (preset === 'month') {
    const todayOp = getCurrentOperationalDay()
    const firstOfMonth = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1)
    start = getOperationalDayRange(firstOfMonth).start
    end = getOperationalDayRange(todayOp).end
  } else if (preset === 'operational' && operationalDay) {
    // 🗓️ Mode journée opérationnelle: 08:00 → 06:00 (lendemain)
    const range = getOperationalDayRange(operationalDay)
    start = range.start
    end = range.end
  } else if (preset === 'day') {
    start = from ? new Date(from) : null
    if (start) { start.setHours(0, 0, 0, 0); end = new Date(from + 'T23:59:59') }
  } else if (preset === 'custom') {
    // 🗓️ FILTRE PÉRIODE : basé sur la JOURNÉE D'OPÉRATION (8h → 6h lendemain), pas le jour
    // calendaire. Ex: 13/08 → 15/08 = du 13/08 8h00 jusqu'au 16/08 ~6h00 (fin de la journée
    // d'opération du 15/08). Sinon un colis saisi entre minuit et 8h le 16/08 (workDate = 15/08,
    // donc dans la période) était exclu par une borne calendaire stricte à 15/08 23:59.
    if (from) {
      start = getOperationalDayRange(new Date(from + 'T12:00:00')).start
    } else {
      start = null
    }
    if (to) {
      end = getOperationalDayRange(new Date(to + 'T12:00:00')).end
    } else {
      end = endOfToday
    }
  }
  return list.filter(item => {
    const d = getDate(item)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}
