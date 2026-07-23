import type { DateFilterPreset } from '../types'
import { getOperationalDayRange } from '../config/operationalDay'

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

export const parcelDate = (p: WithCreatedAt): Date => {
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
    start = new Date(); start.setHours(0, 0, 0, 0)
  } else if (preset === 'week') {
    start = new Date(); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (preset === 'operational' && operationalDay) {
    // 🗓️ Mode journée opérationnelle: 08:00 → 06:00 (lendemain)
    const range = getOperationalDayRange(operationalDay)
    start = range.start
    end = range.end
  } else if (preset === 'day') {
    start = from ? new Date(from) : null
    if (start) { start.setHours(0, 0, 0, 0); end = new Date(from + 'T23:59:59') }
  } else if (preset === 'custom') {
    start = from ? new Date(from) : null
    if (start) { start.setHours(0, 0, 0, 0) }
    end = to ? new Date(to + 'T23:59:59') : endOfToday
  }
  return list.filter(item => {
    const d = getDate(item)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}
