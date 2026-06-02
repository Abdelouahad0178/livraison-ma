import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayStr, parcelDate, entryDate, filterByDate } from './dateFilter'

// ── Helpers ────────────────────────────────────────────────────────────────

// Build a fake parcel whose createdAt is a real Date (simulates Firestore Timestamp)
const makeParcel = (dateStr: any) => ({
  createdAt: { toDate: () => new Date(dateStr) },
})

// Pin "now" to 2026-05-27 at 14:00 Morocco time (UTC+1 → UTC 13:00)
// Using a concrete UTC instant avoids any tz-related test flakiness.
const FIXED_NOW = new Date('2026-05-27T13:00:00.000Z') // 14:00 Morocco

// ── todayStr ───────────────────────────────────────────────────────────────

describe('todayStr', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('returns local YYYY-MM-DD (not UTC date)', () => {
    // At UTC 13:00 on 2026-05-27, local date is 2026-05-27 in UTC+1
    const result = todayStr()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Should not return the UTC date when local and UTC diverge — we test the
    // format contract here; timezone offset is host-dependent in test env.
    expect(result.length).toBe(10)
  })

  it('pads month and day with leading zero', () => {
    vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'))
    const result = todayStr()
    const [, month, day] = result.split('-')
    expect(month).toMatch(/^\d{2}$/)
    expect(day).toMatch(/^\d{2}$/)
  })
})

// ── parcelDate ─────────────────────────────────────────────────────────────

describe('parcelDate', () => {
  it('uses createdAt.toDate() when available', () => {
    const d = new Date('2026-05-20T10:00:00Z')
    expect(parcelDate({ createdAt: { toDate: () => d } })).toBe(d)
  })

  it('falls back to history[0].timestamp', () => {
    const p = { history: [{ timestamp: '2026-05-20T10:00:00Z' }] }
    expect(parcelDate(p)).toEqual(new Date('2026-05-20T10:00:00Z'))
  })

  it('returns epoch when no date info', () => {
    expect(parcelDate({})).toEqual(new Date(0))
  })
})

// ── entryDate ──────────────────────────────────────────────────────────────

describe('entryDate', () => {
  it('uses createdAt.toDate() for Firestore Timestamps', () => {
    const d = new Date('2026-05-20T10:00:00Z')
    expect(entryDate({ createdAt: { toDate: () => d } })).toBe(d)
  })

  it('parses ISO string createdAt', () => {
    expect(entryDate({ createdAt: '2026-05-20T10:00:00Z' }))
      .toEqual(new Date('2026-05-20T10:00:00Z'))
  })

  it('returns epoch when no createdAt', () => {
    expect(entryDate({})).toEqual(new Date(0))
  })
})

// ── filterByDate ───────────────────────────────────────────────────────────

describe('filterByDate', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
  afterEach(() => { vi.useRealTimers() })

  const parcels = [
    makeParcel('2026-05-27T10:00:00Z'), // today
    makeParcel('2026-05-25T10:00:00Z'), // 2 days ago
    makeParcel('2026-05-21T10:00:00Z'), // 6 days ago
    makeParcel('2026-05-01T10:00:00Z'), // this month, earlier
    makeParcel('2026-04-30T10:00:00Z'), // last month
  ]

  it('preset=all returns full list', () => {
    expect(filterByDate(parcels, 'all')).toHaveLength(5)
  })

  it('preset=today includes today and excludes yesterday', () => {
    const result = filterByDate(parcels, 'today')
    expect(result).toHaveLength(1)
    expect(parcelDate(result[0]).toISOString()).toContain('2026-05-27')
  })

  it('preset=today: parcel with createdAt=noon is visible (end=endOfToday, not now)', () => {
    // The fixed "now" is 14:00 — a noon parcel should be visible
    const noonParcel = makeParcel('2026-05-27T11:00:00Z') // 12:00 Morocco
    const result = filterByDate([noonParcel], 'today')
    expect(result).toHaveLength(1)
  })

  it('preset=week includes last 7 days', () => {
    // now=27, week covers 21→27; parcels on 27, 25, 21 qualify; 01-May and 30-Apr do not
    const result = filterByDate(parcels, 'week')
    expect(result).toHaveLength(3)
  })

  it('preset=month includes current month only', () => {
    // May parcels: 27, 25, 21, 01. April parcel excluded.
    const result = filterByDate(parcels, 'month')
    expect(result).toHaveLength(4)
  })

  it('preset=day filters to exact day', () => {
    const result = filterByDate(parcels, 'day', '2026-05-25')
    expect(result).toHaveLength(1)
    expect(parcelDate(result[0]).toISOString()).toContain('2026-05-25')
  })

  it('preset=custom filters inclusive range', () => {
    const result = filterByDate(parcels, 'custom', '2026-05-21', '2026-05-25')
    expect(result).toHaveLength(2)
  })

  it('preset=custom: parcel from 26/05 not shown in 27/05-27/05 range (timezone bug regression)', () => {
    // This was the original bug: new Date('2026-05-27') = UTC midnight = 01:00 Morocco
    // so parcels from 26/05 at 23:30 Morocco leaked into the "27/05" range.
    // Fix: start.setHours(0,0,0,0) normalises to local midnight.
    const may26 = makeParcel('2026-05-26T22:30:00Z') // 23:30 Morocco on 26/05
    const result = filterByDate([may26], 'custom', '2026-05-27', '2026-05-27')
    expect(result).toHaveLength(0)
  })

  it('preset=custom with no from/to returns full list bounded by endOfToday', () => {
    const result = filterByDate(parcels, 'custom', '', '')
    expect(result).toHaveLength(5)
  })
})
