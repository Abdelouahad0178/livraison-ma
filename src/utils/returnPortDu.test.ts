import { describe, it, expect } from 'vitest'
import { isReturnPortDu, isPortCollectedBeforeReturn, buildCaisseDrivers, GARE_GROUP_ID, makePassesDateFilter } from './agencyCaisseRules'

// Ait Melloul → Casablanca, retournée : villes inversées (destination = Ait Melloul)
const ret = (extra: any = {}) => ({
  id: 'r1', portType: 'port_du', price: 40, status: 'Retourné', wasReturned: true, returnedAt: '2026-10-25T10:00:00.000Z',
  originCity: 'Casablanca', destinationCity: 'Ait Melloul', pickupDriverId: 'ramasseur', ...extra,
})

describe('port dû des expéditions retournées (26/10/2026)', () => {
  it('non encaissé : à encaisser à la ville de retour', () => {
    expect(isReturnPortDu(ret())).toBe(true)
    expect(isPortCollectedBeforeReturn(ret())).toBe(false)
  })
  it('encaissé APRÈS le retour : compte à la ville de retour', () => {
    const p = ret({ portStatus: 'collected', portCollectedAt: '2026-10-26T09:00:00.000Z' })
    expect(isReturnPortDu(p)).toBe(true)
    expect(isPortCollectedBeforeReturn(p)).toBe(false)
  })
  it('encaissé AVANT le retour (ancienne destination) : hors caisse de la ville de retour', () => {
    const p = ret({ portStatus: 'collected', portCollectedAt: '2026-10-24T09:00:00.000Z' })
    expect(isPortCollectedBeforeReturn(p)).toBe(true)
    expect(isReturnPortDu(p)).toBe(false)
  })
  it('port payé ou expédition non retournée : non concerné', () => {
    expect(isReturnPortDu(ret({ portType: 'port_paye' }))).toBe(false)
    expect(isReturnPortDu({ ...ret(), wasReturned: false, returnedAt: null, status: 'Livré' })).toBe(false)
  })
  it('rangé dans « En gare » de la ville de retour, à collecter (même avec un ramasseur à l\'aller)', () => {
    const groups = buildCaisseDrivers([ret()], 'Ait Melloul')
    const gare = groups.find(g => g.id === GARE_GROUP_ID)
    expect(gare?.portsACollecterCount).toBe(1)
    expect(gare?.portsACollecterMontant).toBe(40)
    expect(buildCaisseDrivers([ret()], 'Casablanca').some(g => g.parcels.length)).toBe(false)
  })
  it('collecté après le retour : compté dans les ports collectés de la ville de retour', () => {
    const groups = buildCaisseDrivers([ret({ portStatus: 'collected', portCollectedAt: '2026-10-26T09:00:00.000Z' })], 'Ait Melloul')
    expect(groups.find(g => g.id === GARE_GROUP_ID)?.portsCollectesCount).toBe(1)
  })
})

// 31/10/2026 — circuit complet du retour : toujours visible à la ville de retour jusqu'à l'encaissement
describe('retour : visible « En gare » de la ville de retour jusqu\'à l\'encaissement (31/10/2026)', () => {
  it('assigné ensuite (rachida, compte en gare, livreur) : reste dans « En gare », à collecter', () => {
    for (const drv of [{ deliveryDriverId: 'rachida', deliveryDriverName: 'rachida' }, { deliveryDriverId: 'gare1', deliveryDriverName: 'En gare - Ait Melloul' }, { deliveryDriverId: 'liv', deliveryDriverName: 'Livreur' }]) {
      const groups = buildCaisseDrivers([ret(drv)], 'Ait Melloul')
      expect(groups.find(g => g.id === GARE_GROUP_ID)?.portsACollecterCount).toBe(1)
      expect(groups.filter(g => g.id !== GARE_GROUP_ID).some(g => g.parcels.some((p: any) => p.id === 'r1'))).toBe(false)
    }
  })
  it('non encaissé : visible sur une journée choisie, même créé 12 jours avant', () => {
    const p = ret({ workDate: '2026-10-19', returnedAt: '2026-10-31T15:04:00.000Z' })
    expect(makePassesDateFilter('day', '2026-10-31')(p)).toBe(true)
    expect(makePassesDateFilter('day', '2026-10-25')(p)).toBe(true)
  })
  it('encaissé : compté le jour de l\'encaissement, plus le jour de création de l\'aller', () => {
    const p = ret({ workDate: '2026-10-19', returnedAt: '2026-10-31T15:04:00.000Z', portStatus: 'collected', portCollectedAt: '2026-10-31T17:00:00.000Z' })
    expect(makePassesDateFilter('day', '2026-10-31')(p)).toBe(true)
    expect(makePassesDateFilter('day', '2026-10-19')(p)).toBe(false)
  })
  it('expédition normale (non retournée) : filtre de date inchangé', () => {
    const p = { id: 'n1', portType: 'port_du', price: 30, status: 'Livré', workDate: '2026-10-19', destinationCity: 'Ait Melloul' }
    expect(makePassesDateFilter('day', '2026-10-19')(p)).toBe(true)
    expect(makePassesDateFilter('day', '2026-10-31')(p)).toBe(false)
  })
})
