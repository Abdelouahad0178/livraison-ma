import { describe, it, expect } from 'vitest'
import { summarizeEcarts, transferEcart, transferSent } from './versementEcarts'

describe('écarts de versement chef d\'agence → admin', () => {
  it('versement validé pour moins que le montant envoyé → écart', () => {
    expect(transferEcart({ status: 'confirmed', kind: 'port', amount: 2635, amountSent: 3825 })).toBe(1190)
    expect(transferSent({ amount: 2635, amountSent: 3825 })).toBe(3825)
  })
  it('pas d\'écart : montant inchangé, en attente, refusé, régularisation, centime d\'arrondi', () => {
    expect(transferEcart({ status: 'confirmed', kind: 'port', amount: 100 })).toBe(0)
    expect(transferEcart({ status: 'pending', amount: 90, amountSent: 100 })).toBe(0)
    expect(transferEcart({ status: 'rejected', amount: 90, amountSent: 100 })).toBe(0)
    expect(transferEcart({ status: 'confirmed', kind: 'regul', amount: 90, amountSent: 100 })).toBe(0)
    expect(transferEcart({ status: 'confirmed', amount: 7013.01, amountSent: 7013.01 })).toBe(0)
  })
  it('reste à régulariser = écarts − régularisations validées', () => {
    const s = summarizeEcarts([
      { status: 'confirmed', kind: 'port', amount: 13000, amountSent: 13160 },
      { status: 'confirmed', kind: 'port', amount: 2635, amountSent: 3825 },
      { status: 'confirmed', kind: 'regul', amount: 1000 },
      { status: 'pending', kind: 'regul', amount: 200 },
      { status: 'rejected', kind: 'regul', amount: 50 },
    ])
    expect(s.ecarts).toBe(1350)
    expect(s.regulValidees).toBe(1000)
    expect(s.regulEnAttente).toBe(200)
    expect(s.reste).toBe(350)
    expect(s.list).toHaveLength(2)
  })
})
