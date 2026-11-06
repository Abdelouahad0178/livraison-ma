import { describe, it, expect } from 'vitest'
import { planPointageCancel, groupMemberIdsToFetch, planGroupChequeWrites, splitProRata, groupOperationShares } from './pointageCancel'

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

describe('Plusieurs chèques / traites pour plusieurs expéditions (03/11/2026)', () => {
  const part = (p: any) => p.part || 0
  const newId = () => 'GNEW'

  it('répartition au prorata, arrondie au centime, somme exacte', () => {
    expect(splitProRata(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33])
    expect(splitProRata(300, [100, 200])).toEqual([100, 200])
    expect(splitProRata(50, [0, 0])).toEqual([25, 25])
    expect(splitProRata(1000, [])).toEqual([])
  })
  it('2 chèques pour 3 expéditions : chaque expédition reçoit les 2 chèques, avec sa part de chacun', () => {
    const a = exp('a', { part: 1000 }), b = exp('b', { part: 3000 }), c = exp('c', { part: 1000 })
    const w = planGroupChequeWrites(a, [cheque({ numero: '111', montant: 3000 }), cheque({ numero: '222', montant: 2000 })] as any, [a, b, c], map(a, b, c), part, newId)
    expect(w.a.map((d: any) => d.groupId)).toEqual(['GNEW', 'GNEW~1'])
    expect(w.a.map((d: any) => d.montant)).toEqual([600, 400])
    expect(w.b.map((d: any) => d.montant)).toEqual([1800, 1200])
    expect(w.c.map((d: any) => d.groupTotal)).toEqual([3000, 2000])
    expect(w.b[1]).toMatchObject({ numero: '222', groupIds: ['a', 'b', 'c'], groupNics: ['Na', 'Nb', 'Nc'] })
    // Chaque chèque : la somme des parts = montant du chèque
    for (const k of [0, 1]) expect(['a', 'b', 'c'].reduce((s, id) => s + w[id][k].montant, 0)).toBe(k === 0 ? 3000 : 2000)
  })
  it('sortie d\'une opération à 2 chèques : les autres gardent les 2 chèques, totaux diminués', () => {
    const ids = ['a', 'b', 'c']
    const docsFor = (m1: number, m2: number) => [grp(ids, { montant: m1, groupTotal: 3000 }), grp(ids, { numero: '222', groupId: 'G1~1', montant: m2, groupTotal: 2000 })]
    const a = exp('a', { part: 1000, codDocuments: docsFor(600, 400) })
    const b = exp('b', { part: 3000, codDocuments: docsFor(1800, 1200) })
    const c = exp('c', { part: 1000, codDocuments: docsFor(600, 400) })
    const w = planGroupChequeWrites(a, [cheque({ numero: '999', montant: 1000 })] as any, undefined, map(a, b, c), part, newId)
    expect(w.a).toEqual([cheque({ numero: '999', montant: 1000 })])
    expect(w.b.map((d: any) => [d.groupId, d.groupTotal, d.montant])).toEqual([['G1', 2400, 1800], ['G1~1', 1600, 1200]])
    expect(w.c[1].groupIds).toEqual(['b', 'c'])
  })
  it('parts de chaque expédition : chèques puis reste en espèces, au prorata', () => {
    const list = [exp('a', { part: 1000 }), exp('b', { part: 3000 })]
    const s = groupOperationShares(list, part, [2000, 1000], 1000)
    expect(s).toEqual([
      { id: 'a', nic: 'Na', expected: 1000, cheque: 750, cash: 250 },
      { id: 'b', nic: 'Nb', expected: 3000, cheque: 2250, cash: 750 },
    ])
  })
})
