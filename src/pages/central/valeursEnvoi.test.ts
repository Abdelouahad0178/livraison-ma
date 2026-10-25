import { describe, it, expect } from 'vitest'
import { toValueRow, physicalDocs, sumRows } from './valeursEnvoi'

const staff = new Map([['u1', 'Casablanca']])
const base = { originCity: 'Marrakech', destinationCity: 'Casablanca', createdAt: '2026-10-14T10:00:00Z', controlled: true, controlledById: 'u1' }

describe('Envoi des valeurs', () => {
  it('ville qui a pointé (compte) et ville qui reçoit (origine)', () => {
    const r = toValueRow({ ...base, id: 'a', serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 500 }, staff, false)!
    expect(r.pointCity).toBe('Casablanca')
    expect(r.toCity).toBe('Marrakech')
    expect(r.total).toBe(500)
  })
  it('un chèque groupé sur 2 expéditions compte pour 1 chèque', () => {
    const doc = { type: 'cheque', numero: '77', banque: 'BMCE', montant: 0, echeance: '', groupId: 'g1', groupIds: ['a', 'b'], groupTotal: 800 }
    const rows = ['a', 'b'].map(id => toValueRow({ ...base, id, serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 400, codDocuments: [{ ...doc, montant: 400 }] }, staff, false)!)
    expect(physicalDocs(rows)).toEqual({ cheques: 1, traites: 0 })
    expect(sumRows(rows).cheque).toBe(800)
  })
  it('analyseur chèques : les espèces sont ignorées', () => {
    expect(toValueRow({ ...base, id: 'c', serviceType: 'cod', codPaymentType: 'especes', codAmount: 300 }, staff, true)).toBeNull()
  })
})
