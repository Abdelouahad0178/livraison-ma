import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock firebase/firestore before importing the module under test
vi.mock('firebase/firestore', () => ({
  Timestamp: {
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), _date: d }),
  },
}))

import { daysAgoTimestamp, sortByCreatedDesc } from './firestoreUtils'

type MockTimestamp = ReturnType<typeof daysAgoTimestamp> & { _date: Date }

// ── daysAgoTimestamp ───────────────────────────────────────────────────────

describe('daysAgoTimestamp', () => {
  const FIXED = new Date('2026-05-27T12:00:00.000Z')
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED) })
  afterEach(() => { vi.useRealTimers() })

  it('returns a Timestamp-like object', () => {
    const ts = daysAgoTimestamp(0) as MockTimestamp
    expect(ts).toHaveProperty('seconds')
  })

  it('0 days ago is approximately now', () => {
    const ts = daysAgoTimestamp(0) as MockTimestamp
    expect(ts._date.toISOString()).toBe(FIXED.toISOString())
  })

  it('7 days ago is 7 days before now', () => {
    const ts = daysAgoTimestamp(7) as MockTimestamp
    const expected = new Date(FIXED)
    expected.setDate(expected.getDate() - 7)
    expect(ts._date.getTime()).toBe(expected.getTime())
  })

  it('30 days ago crosses a month boundary correctly', () => {
    const ts = daysAgoTimestamp(30) as MockTimestamp
    const expected = new Date(FIXED)
    expected.setDate(expected.getDate() - 30)
    expect(ts._date.getTime()).toBe(expected.getTime())
  })
})

// ── sortByCreatedDesc ──────────────────────────────────────────────────────

describe('sortByCreatedDesc', () => {
  const makeDoc = (dateStr: string) => ({
    createdAt: { toDate: () => new Date(dateStr) },
  })

  it('sorts newest first', () => {
    const docs: Record<string, any>[] = [
      makeDoc('2026-05-20T00:00:00Z'),
      makeDoc('2026-05-27T00:00:00Z'),
      makeDoc('2026-05-24T00:00:00Z'),
    ]
    const result = sortByCreatedDesc(docs)
    expect(result[0].createdAt.toDate().toISOString()).toContain('2026-05-27')
    expect(result[2].createdAt.toDate().toISOString()).toContain('2026-05-20')
  })

  it('handles ISO string createdAt (no toDate)', () => {
    const docs = [
      { createdAt: '2026-05-20T00:00:00Z' },
      { createdAt: '2026-05-27T00:00:00Z' },
    ]
    const result = sortByCreatedDesc(docs)
    expect(result[0].createdAt).toBe('2026-05-27T00:00:00Z')
  })

  it('handles missing createdAt (treats as epoch)', () => {
    const docs: Record<string, any>[] = [
      makeDoc('2026-05-20T00:00:00Z'),
      {},
    ]
    const result = sortByCreatedDesc(docs)
    expect(result[0].createdAt).toBeDefined()
    expect(result[1]).toEqual({})
  })
})
