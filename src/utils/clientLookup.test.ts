import { describe, it, expect } from 'vitest'
import { mergeClientLists, clientNameVariants, phoneDigits } from './clientLookup'

const ts = (ms: number) => ({ toMillis: () => ms })

describe('mergeClientLists', () => {
  it('sans doublon : la première liste l\'emporte (temps réel avant recherche ponctuelle)', () => {
    const live = [{ id: 'a', name: 'Live', createdAt: ts(1) }]
    const lookup = [{ id: 'a', name: 'Ancien' }, { id: 'b', name: 'B', createdAt: ts(5) }]
    const out = mergeClientLists(live, lookup)
    expect(out.map(c => c.id)).toEqual(['b', 'a'])
    expect(out.find(c => c.id === 'a')!.name).toBe('Live')
  })

  it('tri du plus récent au plus ancien, fiches sans date à la fin ; listes vides / absentes ignorées', () => {
    const out = mergeClientLists(
      [{ id: 'x' }, { id: 'old', createdAt: { seconds: 10 } }],
      null, undefined, [],
      [{ id: 'new', createdAt: new Date(2026, 0, 1).toISOString() }, { id: '' }],
    )
    expect(out.map(c => c.id)).toEqual(['new', 'old', 'x'])
  })
})

describe('clientNameVariants', () => {
  it('tel que saisi, MAJUSCULES, minuscules, Première Lettre', () => {
    expect(clientNameVariants('  sté  el amal ')).toEqual(['sté el amal', 'STÉ EL AMAL', 'Sté El Amal'])
    expect(clientNameVariants('BG')).toEqual(['BG', 'bg', 'Bg'])
    expect(clientNameVariants('   ')).toEqual([])
  })
})

describe('phoneDigits', () => {
  it('au moins 6 chiffres pour une recherche par téléphone', () => {
    expect(phoneDigits('06 61-23 45 67')).toBe('0661234567')
    expect(phoneDigits('ab12')).toBe('')
  })
})
