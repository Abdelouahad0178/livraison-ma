import { describe, it, expect, vi } from 'vitest'
vi.mock('./db', () => ({ db: {} }))
import { lotMatches, lotRowsMatching, lotHasType, type ValeursLot } from './valeursLots'

const row = (id: string, nic: string, sender: string, docs: string[] = []) => ({ id, nic, pointCity: 'Agadir', toCity: 'Casablanca', amounts: { especes: 0, cheque: 100, traite: 0 }, total: 100, docs, p: { id, createdAt: '', sender: { name: sender }, receiver: { name: 'CLIENT' }, codDocuments: [], controlledBy: '', controlledAt: '' } })
const lot = { number: 'BV-20261015-AGACAS-1', createdBy: 'ZAHRA', rows: [row('a', '1228930', 'FADESSA NÉGOCE', ['Chèque N° 445566 · BMCE']), row('b', '1077313', 'ENERGIZE')], totals: { especes: 0, cheque: 200, traite: 0, total: 200 } } as unknown as ValeursLot

describe('recherche dans les lots', () => {
  it('par N° EXP, expéditeur (sans accents), N° de chèque, n° de lot', () => {
    expect(lotRowsMatching(lot, '1228930').map(r => r.id)).toEqual(['a'])
    expect(lotRowsMatching(lot, 'negoce').map(r => r.id)).toEqual(['a'])
    expect(lotRowsMatching(lot, '445566').map(r => r.id)).toEqual(['a'])
    expect(lotMatches(lot, 'agacas')).toBe(true)
    expect(lotMatches(lot, '9999999')).toBe(false)
  })
  it('types présents', () => {
    expect(lotHasType(lot, 'cheque')).toBe(true)
    expect(lotHasType(lot, 'especes')).toBe(false)
  })
})
