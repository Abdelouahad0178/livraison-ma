import { describe, it, expect } from 'vitest'
import { previousWorkedOperationalDays } from './operationalDay'

// Dates en heure de Casablanca (UTC+1 en octobre 2026)
const at = (iso: string) => new Date(iso + '+01:00')
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const range = (iso: string) => { const r = previousWorkedOperationalDays(at(iso)); return [day(r.from), day(r.to)] }

describe('previousWorkedOperationalDays — veille travaillée', () => {
  it('jeudi 22/10 après 8 h → mercredi 21/10', () => {
    expect(range('2026-10-22T10:00:00')).toEqual(['2026-10-21', '2026-10-21'])
  })
  it('jeudi 22/10 avant 6 h (encore la journée du 21) → mardi 20/10', () => {
    expect(range('2026-10-22T05:00:00')).toEqual(['2026-10-20', '2026-10-20'])
  })
  it('dimanche 25/10 → samedi 24/10', () => {
    expect(range('2026-10-25T11:00:00')).toEqual(['2026-10-24', '2026-10-24'])
  })
  it('lundi 26/10 après 8 h → samedi 24/10 (avec le dimanche 25/10)', () => {
    expect(range('2026-10-26T09:00:00')).toEqual(['2026-10-24', '2026-10-25'])
  })
  it('mardi 27/10 après 8 h → lundi 26/10', () => {
    expect(range('2026-10-27T09:00:00')).toEqual(['2026-10-26', '2026-10-26'])
  })
})
