import { describe, it, expect, vi, afterEach } from 'vitest'
import { opPeriodRange } from './dateFilter'

// 📅 01/11/2026 — « la date du jour est la journée d'opération pour tout le site » : 8 h → 6 h le lendemain
afterEach(() => vi.useRealTimers())
const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }
const hm = (d: Date | null) => (d ? `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : null)

describe('opPeriodRange — périodes en journées d\'opération', () => {
  it('à 1 h 30 du matin, « Aujourd\'hui » est encore la journée de la veille (8 h → 6 h)', () => {
    at('2026-11-01T01:30:00+01:00')
    const r = opPeriodRange('today')
    expect(hm(r.start)).toBe('31/10 8h00')
    expect(hm(r.end)).toBe('1/11 5h59')
  })
  it('à 10 h, « Aujourd\'hui » est la journée du jour ; « Hier » la précédente', () => {
    at('2026-11-01T10:00:00+01:00')
    expect(hm(opPeriodRange('today').start)).toBe('1/11 8h00')
    expect(hm(opPeriodRange('yesterday').start)).toBe('31/10 8h00')
    expect(hm(opPeriodRange('yesterday').end)).toBe('1/11 5h59')
  })
  it('un jour précis et « Du … au … » : de 8 h le premier jour jusqu\'à 6 h après le dernier', () => {
    expect(hm(opPeriodRange('day', '2026-10-29').start)).toBe('29/10 8h00')
    expect(hm(opPeriodRange('day', '2026-10-29').end)).toBe('30/10 5h59')
    const c = opPeriodRange('custom', '2026-10-13', '2026-10-15')
    expect(hm(c.start)).toBe('13/10 8h00')
    expect(hm(c.end)).toBe('16/10 5h59')
  })
  it('« 7 jours » = la journée en cours + les 6 précédentes ; « Ce mois » depuis le 1er à 8 h', () => {
    at('2026-10-20T10:00:00+01:00')
    expect(hm(opPeriodRange('week').start)).toBe('14/10 8h00')
    expect(hm(opPeriodRange('month').start)).toBe('1/10 8h00')
    expect(opPeriodRange('all')).toEqual({ start: null, end: null })
  })
})
