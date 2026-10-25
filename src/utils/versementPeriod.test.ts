import { describe, it, expect } from 'vitest'
import { versementBounds, inBounds, wholeExpeditionSplit } from './versementPeriod'

describe('versementBounds', () => {
  it('jour, semaine (7 journées), période (ordre corrigé), tout', () => {
    expect(versementBounds('jour', '2026-10-18')).toMatchObject({ fromKey: '2026-10-18', toKey: '2026-10-18' })
    expect(versementBounds('semaine', '2026-10-03')).toMatchObject({ fromKey: '2026-09-27', toKey: '2026-10-03' })
    expect(versementBounds('periode', '2026-10-18', '2026-10-15', '2026-10-10')).toMatchObject({ fromKey: '2026-10-10', toKey: '2026-10-15' })
    expect(versementBounds('tout', '2026-10-18')).toMatchObject({ fromKey: null, toKey: null })
  })
  it('inBounds', () => {
    const b = versementBounds('semaine', '2026-10-18')
    expect(inBounds('2026-10-12', b)).toBe(true)
    expect(inBounds('2026-10-11', b)).toBe(false)
    expect(inBounds(null, versementBounds('tout', '2026-10-18'))).toBe(true)
  })
})

describe('wholeExpeditionSplit', () => {
  const g = [{ id: 'a', amount: 30, at: 1 }, { id: 'b', amount: 40, at: 2 }, { id: 'c', amount: 100, at: 3 }]
  it('montant exact sur des expéditions entières', () => {
    const s = wholeExpeditionSplit(g, 70)
    expect(s).toMatchObject({ total: 170, lower: 70, upper: 170, exact: true })
    expect(s.lowerGroups.map(x => x.id)).toEqual(['a', 'b'])
  })
  it('montant non exact : propositions juste en dessous / au-dessus', () => {
    const s = wholeExpeditionSplit(g, 100)
    expect(s).toMatchObject({ lower: 70, upper: 170, exact: false })
    expect(s.upperGroups.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('les plus anciennes d\'abord', () => {
    const s = wholeExpeditionSplit([{ amount: 50, at: 9 }, { amount: 20, at: 1 }], 20)
    expect(s.exact).toBe(true)
    expect(s.lowerGroups[0].at).toBe(1)
  })
})
