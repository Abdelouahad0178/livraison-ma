import { describe, it, expect } from 'vitest'
import { toValueRow, physicalDocs, sumRows, lotRemovalPatch, lotAdditionPatch } from './valeursEnvoi'
import { freezeRow, type ValeursLot } from '../../firebase/valeursLots'

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

describe('Retrait d\'une expédition d\'un lot', () => {
  const doc = { type: 'cheque', numero: '77', banque: 'BMCE', montant: 400, echeance: '', groupId: 'g1', groupIds: ['a', 'b'], groupTotal: 800 }
  const rows = [
    toValueRow({ ...base, id: 'a', senderNic: 'N1', serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 400, codDocuments: [doc] }, staff, false)!,
    toValueRow({ ...base, id: 'b', senderNic: 'N2', serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 400, codDocuments: [doc] }, staff, false)!,
    toValueRow({ ...base, id: 'c', senderNic: 'N3', serviceType: 'cod', codPaymentType: 'especes', codAmount: 250.5 }, staff, false)!,
  ]
  const lot = (extra: Partial<ValeursLot> = {}): ValeursLot => ({
    id: 'L1', number: 'BV-1', fromCity: 'Casablanca', toCity: 'Marrakech', periodText: '', parcelIds: ['a', 'b', 'c'], nics: ['N1', 'N2', 'N3'],
    rows: rows.map(freezeRow), totals: { especes: 250.5, cheque: 800, traite: 0, total: 1050.5 }, cheques: 1, traites: 0,
    createdAt: '2026-11-03T08:00:00Z', createdBy: 'ENC', createdById: 'u1', status: 'cree', ...extra,
  })
  const who = { by: 'ENC', byId: 'u1', at: '2026-11-03T10:00:00Z', reason: 'mauvais lot' }

  it('retire la ligne, recalcule les totaux et garde la trace', () => {
    const p = lotRemovalPatch(lot(), 'c', who)
    expect(p.parcelIds).toEqual(['a', 'b'])
    expect(p.nics).toEqual(['N1', 'N2'])
    expect(p.rows.map((r: any) => r.id)).toEqual(['a', 'b'])
    expect(p.totals).toEqual({ especes: 0, cheque: 800, traite: 0, total: 800 })
    expect(p.removed).toEqual([{ id: 'c', nic: 'N3', total: 250.5, amounts: { especes: 250.5, cheque: 0, traite: 0 }, docs: [], by: 'ENC', byId: 'u1', at: who.at, reason: 'mauvais lot', lotStatus: 'cree' }])
    expect(p.status).toBeUndefined()
  })
  it('un chèque groupé reste compté une fois tant qu\'une de ses expéditions est dans le lot', () => {
    const p = lotRemovalPatch(lot(), 'a', who)
    expect(p.cheques).toBe(1)
    expect(p.totals.cheque).toBe(400)
    expect(lotRemovalPatch({ ...lot(), ...p } as ValeursLot, 'b', who).cheques).toBe(0)
  })
  it('lot reçu partiellement : retirer la seule manquante → « reçu »', () => {
    const p = lotRemovalPatch(lot({ status: 'recu_partiel', receivedIds: ['a', 'b'], missingIds: ['c'] }), 'c', who)
    expect(p.status).toBe('recu')
    expect(p.missingIds).toEqual([])
    expect(p.receivedIds).toEqual(['a', 'b'])
    expect(p.removed[0].lotStatus).toBe('recu_partiel')
  })
  it('lot reçu : retirer une valeur reçue la sort des reçues, statut inchangé', () => {
    const p = lotRemovalPatch(lot({ status: 'recu', receivedIds: ['a', 'b', 'c'], missingIds: [] }), 'b', who)
    expect(p.receivedIds).toEqual(['a', 'c'])
    expect(p.status).toBeUndefined()
  })
  it('les retraits s\'ajoutent ; la dernière expédition retirée annule le lot', () => {
    const one = lot({ parcelIds: ['c'], nics: ['N3'], rows: [freezeRow(rows[2])], removed: [{ id: 'a' } as any] })
    const p = lotRemovalPatch(one, 'c', who)
    expect(p.removed).toHaveLength(2)
    expect(p).toMatchObject({ parcelIds: [], status: 'annule', cancelledAt: who.at, cancelledBy: 'ENC', cancelledById: 'u1' })
  })
  it('refuse une expédition absente du lot ou un lot annulé', () => {
    expect(() => lotRemovalPatch(lot(), 'zz', who)).toThrow('plus dans le lot')
    expect(() => lotRemovalPatch(lot({ status: 'annule' }), 'a', who)).toThrow('annulé')
  })
})

describe('Ajout d\'expéditions à un lot déjà créé', () => {
  const doc = { type: 'cheque', numero: '77', banque: 'BMCE', montant: 400, echeance: '', groupId: 'g1', groupIds: ['a', 'b'], groupTotal: 800 }
  const row = (id: string, extra: any) => freezeRow(toValueRow({ ...base, id, senderNic: 'N' + id, ...extra }, staff, false)!)
  const A = row('a', { serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 400, codDocuments: [doc] })
  const B = row('b', { serviceType: 'cod_cheque', codPaymentType: 'cheque', codAmount: 400, codDocuments: [doc] })
  const C = row('c', { serviceType: 'cod', codPaymentType: 'especes', codAmount: 250.5 })
  const lot = (extra: Partial<ValeursLot> = {}): ValeursLot => ({
    id: 'L1', number: 'BV-1', fromCity: 'Casablanca', toCity: 'Marrakech', periodText: '', parcelIds: ['a'], nics: ['Na'], rows: [A],
    totals: { especes: 0, cheque: 400, traite: 0, total: 400 }, cheques: 1, traites: 0, createdAt: '2026-11-03T08:00:00Z', createdBy: 'ENC', createdById: 'u1', status: 'cree', ...extra,
  })
  const who = { by: 'ENC', byId: 'u1', at: '2026-11-03T10:00:00Z' }

  it('ajoute à la fin, recalcule les totaux et garde la trace', () => {
    const p = lotAdditionPatch(lot(), [B, C], who)
    expect(p.parcelIds).toEqual(['a', 'b', 'c'])
    expect(p.nics).toEqual(['Na', 'Nb', 'Nc'])
    expect(p.totals).toEqual({ especes: 250.5, cheque: 800, traite: 0, total: 1050.5 })
    expect(p.cheques).toBe(1) // chèque groupé a + b = 1 seul chèque
    expect(p.added).toEqual([{ ids: ['b', 'c'], nics: ['Nb', 'Nc'], total: 650.5, by: 'ENC', byId: 'u1', at: who.at }])
  })
  it('ignore une expédition déjà dans le lot ou en double', () => {
    const p = lotAdditionPatch(lot(), [A, C, C], who)
    expect(p.parcelIds).toEqual(['a', 'c'])
    expect(() => lotAdditionPatch(lot(), [A], who)).toThrow('déjà dans le lot')
  })
  it('refuse un lot déjà reçu ou annulé', () => {
    expect(() => lotAdditionPatch(lot({ status: 'recu' }), [C], who)).toThrow('déjà été reçu')
    expect(() => lotAdditionPatch(lot({ status: 'recu_partiel' }), [C], who)).toThrow('déjà été reçu')
    expect(() => lotAdditionPatch(lot({ status: 'annule' }), [C], who)).toThrow('annulé')
  })
  it('les ajouts successifs s\'empilent dans la trace', () => {
    const p1 = lotAdditionPatch(lot(), [B], who)
    const p2 = lotAdditionPatch({ ...lot(), ...p1 } as ValeursLot, [C], who)
    expect(p2.added).toHaveLength(2)
    expect(p2.parcelIds).toEqual(['a', 'b', 'c'])
  })
})
