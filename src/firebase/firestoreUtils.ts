import { Timestamp } from 'firebase/firestore'

// Returns a Firestore Timestamp for N days ago at the current time of day.
// Used as the lower-bound for subscription time windows (e.g. "last 60 days").
export const daysAgoTimestamp = (days: number): Timestamp => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return Timestamp.fromDate(d)
}

type WithCreatedAt = {
  createdAt?: { toDate?: () => Date } | string | number | null
}

// Sorts an array of Firestore-shaped docs by createdAt descending (most recent first).
// Handles both Firestore Timestamp objects and plain Date/string values.
export const sortByCreatedDesc = <T extends WithCreatedAt>(docs: T[]): T[] =>
  docs.sort((a, b) => {
    const ca = a.createdAt as { toDate?: () => Date } | string | number | undefined | null
    const cb = b.createdAt as { toDate?: () => Date } | string | number | undefined | null
    const da = ca && typeof ca === 'object' && ca.toDate ? ca.toDate() : new Date((ca as string | number) || 0)
    const db = cb && typeof cb === 'object' && cb.toDate ? cb.toDate() : new Date((cb as string | number) || 0)
    return db.getTime() - da.getTime()
  })
