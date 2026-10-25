import { describe, expect, it } from 'vitest'
import { formatTrackingDate } from './trackingDate'

describe('Moroccan tracking dates', () => {
  it('displays the reported creation at 15:56 Moroccan time', () => {
    expect(formatTrackingDate('2026-10-24T14:56:12.685Z')).toContain('15:56')
  })
  it('uses the actual Casablanca offset, including Ramadan and midnight', () => {
    expect(formatTrackingDate('2026-02-24T14:56:12Z')).toContain('14:56')
    const midnight = formatTrackingDate('2026-10-24T23:10:00Z')
    expect(midnight).toContain('25')
    expect(midnight).toContain('00:10')
  })
  it('shows only a date when the historic hour is unavailable', () => {
    expect(formatTrackingDate('2026-10-24T12:00:00Z', false)).toContain('24')
    expect(formatTrackingDate('2026-10-24T12:00:00Z', false)).not.toMatch(/\d\d:\d\d/)
    expect(formatTrackingDate(null)).toBe('Date indisponible')
    expect(formatTrackingDate('bad-date')).toBe('Date indisponible')
  })
})
