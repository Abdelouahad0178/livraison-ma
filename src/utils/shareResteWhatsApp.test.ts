import { describe, it, expect } from 'vitest'
import { waNumber } from './shareResteWhatsApp'

describe('numéro WhatsApp (Maroc)', () => {
  it('06 / 07 → 212…', () => {
    expect(waNumber('0666279676')).toBe('212666279676')
    expect(waNumber('07 12 34 56 78')).toBe('212712345678')
  })
  it('formats internationaux conservés', () => {
    expect(waNumber('+212 666-279-676')).toBe('212666279676')
    expect(waNumber('00212666279676')).toBe('212666279676')
  })
  it('vide ou incomplet → vide (choix du contact dans WhatsApp)', () => {
    expect(waNumber('')).toBe('')
    expect(waNumber('0666')).toBe('')
  })
})
