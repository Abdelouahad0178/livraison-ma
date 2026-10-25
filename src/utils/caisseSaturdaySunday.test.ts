import { describe, it, expect } from 'vitest'
import { caisseOpDayRange, firestoreBoundsFor, caisseDateBounds } from './agencyCaisseRules'
import { expPeriodFromCaisse } from '../pages/exploitation/exploitationCaisse'

const sat = new Date(2026, 9, 24, 8) // samedi 24/10/2026
const fri = new Date(2026, 9, 23, 8) // vendredi 23/10/2026

describe('Pages de caisse — le samedi couvre aussi le dimanche', () => {
  it('samedi : 24/10 08:00 → lundi 26/10 06:00', () => {
    const r = caisseOpDayRange(sat)
    expect(r.start).toEqual(new Date(2026, 9, 24, 8, 0, 0, 0))
    expect(r.end).toEqual(new Date(2026, 9, 26, 5, 59, 59, 999))
  })
  it('autres jours inchangés : vendredi 23/10 08:00 → samedi 24/10 06:00', () => {
    const r = caisseOpDayRange(fri)
    expect(r.end).toEqual(new Date(2026, 9, 24, 5, 59, 59, 999))
  })
  it('chargement et filtre de « Journée d\'opération » samedi : mêmes bornes', () => {
    expect(firestoreBoundsFor('operational', '', '', sat).to).toEqual(new Date(2026, 9, 26, 5, 59, 59, 999))
    expect(caisseDateBounds('operational', '', '', sat)?.end).toEqual(new Date(2026, 9, 26, 5, 59, 59, 999))
  })
  it('listes du chef d\'exploitation : journées 24/10 et 25/10', () => {
    const p = expPeriodFromCaisse('operational', '', '', sat, new Date(2026, 9, 26, 10))
    expect([p.fromKey, p.toKey]).toEqual(['2026-10-24', '2026-10-25'])
  })
})
