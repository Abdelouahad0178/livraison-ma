import { describe, it, expect } from 'vitest'
import { loadedPeriodLabel } from './loadedPeriodLabel'

describe('loadedPeriodLabel — période réellement chargée', () => {
  it('veille travaillée (journée d’opération)', () => {
    expect(loadedPeriodLabel('operational', '', '', new Date(2026, 9, 24, 8))).toBe('journée du 24/10')
  })
  it('lundi : samedi + dimanche (période)', () => {
    expect(loadedPeriodLabel('custom', '2026-10-24', '2026-10-25')).toBe('du 24/10 au 25/10')
  })
  it('période d’un seul jour', () => {
    expect(loadedPeriodLabel('custom', '2026-10-24', '2026-10-24')).toBe('journée du 24/10')
  })
  it('« Récent » = 30 derniers jours', () => {
    expect(loadedPeriodLabel('all')).toBe('30 derniers jours')
  })
  it('préréglages simples', () => {
    expect(loadedPeriodLabel('week')).toBe('7 derniers jours')
    expect(loadedPeriodLabel('month')).toBe('ce mois')
    expect(loadedPeriodLabel('day', '2026-10-20')).toBe('journée du 20/10')
  })
})
