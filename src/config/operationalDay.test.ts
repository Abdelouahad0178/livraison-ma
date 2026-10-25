import { describe, it, expect } from 'vitest'
import { getOperationalDay, getOperationalDayString, _legacyCasablancaWallClock, OPERATIONAL_DAY_CONFIG } from './operationalDay'

// Ancienne implémentation complète (référence) : mêmes étapes, ancienne conversion d'heure
function legacyOperationalDay(date: Date): Date {
  const casablancaTime = _legacyCasablancaWallClock(new Date(date))
  const currentMinutes = casablancaTime.getHours() * 60 + casablancaTime.getMinutes()
  const endMinutes = OPERATIONAL_DAY_CONFIG.END_HOUR * 60 + OPERATIONAL_DAY_CONFIG.END_MINUTE
  const d = new Date(casablancaTime)
  if (currentMinutes < endMinutes) d.setDate(d.getDate() - 1)
  d.setHours(OPERATIONAL_DAY_CONFIG.START_HOUR, OPERATIONAL_DAY_CONFIG.START_MINUTE, 0, 0)
  return d
}

describe('getOperationalDay — conversion rapide identique à l\'ancienne', () => {
  it('même résultat toutes les 7 minutes sur 2026 (changements d\'heure / Ramadan compris)', () => {
    const start = new Date(2026, 0, 1).getTime()
    const end = new Date(2027, 0, 1).getTime()
    let diffs = 0
    for (let t = start; t < end; t += 7 * 60 * 1000) {
      const a = getOperationalDay(t).getTime()
      const b = legacyOperationalDay(new Date(t)).getTime()
      if (a !== b) diffs++
    }
    expect(diffs).toBe(0)
  }, 120_000)

  it('cas limites 05:59 / 06:00 / 08:00 et date invalide', () => {
    for (const s of ['2026-10-05T05:59:00Z', '2026-10-05T06:00:00Z', '2026-10-05T07:59:59Z', '2026-10-05T08:00:00Z', '2026-03-29T01:30:00Z']) {
      expect(getOperationalDayString(new Date(s))).toBe(legacyOperationalDay(new Date(s)).toISOString().split('T')[0])
    }
    expect(Number.isNaN(getOperationalDay(new Date('x')).getTime())).toBe(true)
  })
})
