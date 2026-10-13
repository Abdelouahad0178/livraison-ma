import { describe, it, expect } from 'vitest'
import { planPointageCancel, groupMemberIdsToFetch, planGroupChequeWrites } from './pointageCancel'

const ME = 'me'
const cheque = (extra: any = {}) => ({ type: 'cheque', numero: '123', banque: 'CIH', montant: 100, echeance: '', ...extra })
const grp = (ids: string[], extra: any = {}) => cheque({ groupId: 'G1', groupIds: ids, groupNics: ids.map(i => `N${i}`), groupTotal: 300, ...extra })
const exp = (id: string, extra: any = {}) => ({ id, senderNic: `N${id}`, ...extra })
const mine = { controlled: true, controlledById: ME, controlledBy: 'Moi' }
const other = { controlled: true, controlledById: 'u2', controlledBy: 'Ali' }
const map = (...ps: any[]) => new Map(ps.map(p => [p.id, p]))

describe('planPointageCancel', () => {
  it('espèces : dé-pointe seulement', () => {
    const a = exp('a', mine)
    const plan = planPointageCancel([a], map(a), ME)
    expect(plan.unpoint).toEqual(['a'])
    expect(plan.clearDocs).toEqual([])
  })

  it('chèque simple : dé-pointe et efface ses données', () => {
    const a = exp('a', { ...mine, codDocuments: [cheque()] })
    const plan = planPointageCancel([a], map(a), ME)
    expect(plan.unpoint).toEqual(['a'])
    expect(plan.clearDocs).toEqual(['a'])
  })

  it('chèque groupé : dé-pointe mes membres et dissout le groupe sur tous ses membres', () => {
    const ids = ['a', 'b', 'c']
    const a = exp('a', { ...mine, codDocuments: [grp(ids)] })
    const b = exp('b', { ...mine, codDocuments: [grp(ids)] })
    const c = exp('c', { codDocuments: [grp(ids)] }) // pas pointée
    const plan = planPointageCancel([a], map(a, b, c), ME)
    expect(plan.unpoint.sort()).toEqual(['a', 'b'])
    expect(plan.clearDocs.sort()).toEqual(['a', 'b', 'c'])
    expect(plan.groupsDissolved).toBe(1)
  })

  it('ignore un ancien membre qui ne référence plus le groupe', () => {
    const a = exp('a', { ...mine, codDocuments: [grp(['a', 'b'])] })
    const b = exp('b', { ...mine, codDocuments: [cheque({ numero: '999' })] })
    const plan = planPointageCancel([a], map(a, b), ME)
    expect(plan.unpoint).toEqual(['a'])
    expect(plan.clearDocs).toEqual(['a'])
  })

  it('arrivée confirmée sur un membre : rien n\'est annulé', () => {
    const ids = ['a', 'b']
    const a = exp('a', { ...mine, codDocuments: [grp(ids)] })
    const b = exp('b', { ...mine, codDocuments: [grp(ids)], deliveryControlled: true, deliveryControlledBy: 'Agence X' })
    const plan = planPointageCancel([a], map(a, b), ME)
    expect(plan.unpoint).toEqual([])
    expect(plan.clearDocs).toEqual([])
    expect(plan.arrivalBlocked).toEqual([{ id: 'b', nic: 'Nb', by: 'Agence X' }])
  })

  it('membre pointé par un autre : non touché, groupe gardé intact, mes pointages annulés', () => {
    const ids = ['a', 'b']
    const a = exp('a', { ...mine, codDocuments: [grp(ids)] })
    const b = exp('b', { ...other, codDocuments: [grp(ids)] })
    const plan = planPointageCancel([a], map(a, b), ME)
    expect(plan.unpoint).toEqual(['a'])
    expect(plan.clearDocs).toEqual([])
    expect(plan.othersPointed).toEqual([{ id: 'b', nic: 'Nb', by: 'Ali' }])
    expect(plan.groupsKept).toBe(1)
  })

  it('sélection en masse : pointages des autres et non pointées ignorés, groupe traité une seule fois', () => {
    const ids = ['a', 'b']
    const a = exp('a', { ...mine, codDocuments: [grp(ids)] })
    const b = exp('b', { ...mine, codDocuments: [grp(ids)] })
    const x = exp('x', other)
    const y = exp('y')
    const plan = planPointageCancel([a, b, x, y], map(a, b, x, y), ME)
    expect(plan.unpoint.sort()).toEqual(['a', 'b'])
    expect(plan.clearDocs.sort()).toEqual(['a', 'b'])
    expect(plan.groupsDissolved).toBe(1)
    expect(plan.othersPointed.map(o => o.id)).toEqual(['x'])
    expect(plan.notPointed).toEqual(['y'])
  })
})

describe('groupMemberIdsToFetch', () => {
  it('renvoie les membres pas encore relus', () => {
    const a = exp('a', { codDocuments: [grp(['a', 'b', 'c'])] })
    expect(groupMemberIdsToFetch([a], new Set(['a', 'c']))).toEqual(['b'])
  })
})

describe('planGroupChequeWrites', () => {
  const part = (p: any) => p.part || 0
  const newId = () => 'GNEW'

  it('nouveau groupe : mêmes groupIds / groupNics / groupTotal sur tous les membres, montant = part', () => {
    const a = exp('a', { part: 100 }), b = exp('b', { part: 200 })
    const w = planGroupChequeWrites(a, [cheque({ montant: 300 })] as any, [a, b], map(a, b), part, newId)
    expect(Object.keys(w).sort()).toEqual(['a', 'b'])
    expect(w.a[0]).toMatchObject({ groupId: 'GNEW', groupIds: ['a', 'b'], groupNics: ['Na', 'Nb'], groupTotal: 300, montant: 100 })
    expect(w.b[0]).toMatchObject({ groupId: 'GNEW', groupIds: ['a', 'b'], groupNics: ['Na', 'Nb'], groupTotal: 300, montant: 200 })
  })

  it('regroupement : garde le groupId, efface les membres retirés', () => {
    const ids = ['a', 'b', 'c']
    const a = exp('a', { part: 100, codDocuments: [grp(ids)] })
    const b = exp('b', { part: 100, codDocuments: [grp(ids)] })
    const c = exp('c', { part: 100, codDocuments: [grp(ids)] })
    const w = planGroupChequeWrites(a, [cheque({ montant: 200 })] as any, [a, b], map(a, b, c), part, newId)
    expect(w.a[0].groupId).toBe('G1')
    expect(w.c).toEqual([])
  })

  it('sortie du groupe : les autres gardent un groupe réduit cohérent', () => {
    const ids = ['a', 'b', 'c']
    const a = exp('a', { codDocuments: [grp(ids, { montant: 100 })] })
    const b = exp('b', { part: 100, codDocuments: [grp(ids, { montant: 100 })] })
    const c = exp('c', { part: 100, codDocuments: [grp(ids, { montant: 100 })] })
    const w = planGroupChequeWrites(a, [cheque({ numero: '777' })] as any, undefined, map(a, b, c), part, newId)
    expect(w.a[0].numero).toBe('777')
    expect(w.b[0]).toMatchObject({ groupId: 'G1', groupIds: ['b', 'c'], groupNics: ['Nb', 'Nc'], groupTotal: 200, montant: 100 })
    expect(w.c[0]).toMatchObject({ groupIds: ['b', 'c'], groupTotal: 200 })
  })

  it('sortie d\'un groupe de 2 : l\'autre garde un chèque simple du montant restant', () => {
    const ids = ['a', 'b']
    const a = exp('a', { codDocuments: [grp(ids, { montant: 100, groupTotal: 250 })] })
    const b = exp('b', { codDocuments: [grp(ids, { montant: 150, groupTotal: 250 })] })
    const w = planGroupChequeWrites(a, [cheque()] as any, undefined, map(a, b), part, newId)
    expect(w.b[0].groupIds).toBeUndefined()
    expect(w.b[0].montant).toBe(150)
  })
})
