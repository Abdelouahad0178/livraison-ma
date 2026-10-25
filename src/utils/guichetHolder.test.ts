import { describe, expect, it } from 'vitest'
import { buildCaisseDrivers, GARE_GROUP_ID, guichetGroupIdOf } from './agencyCaisseRules'

// 🏬 Port payé encaissé au guichet : carte du détenteur en gare (rachida…) sinon « En gare - <ville> » (23/10/2026)
const created = '2026-10-22T12:00:00.000Z'
const PP = (id: string, extra: Record<string, any> = {}) => ({
  id, portType: 'port_paye', portStatus: 'collected', price: 20, originCity: 'Ait Melloul', destinationCity: 'Casablanca',
  status: 'En transit', createdAt: created, workDate: '2026-10-22', ...extra,
})

describe('ports payés du guichet et détenteur en gare', () => {
  const parcels = [
    PP('a', { portGuichetHolderId: 'rach', portGuichetHolderName: 'rachida' }),
    PP('b', { portGuichetHolderId: 'rach', portGuichetHolderName: 'rachida', price: 50 }),
    PP('c'), // sans détenteur (ancien / inconnu) → reste « En gare »
  ]
  const drivers = buildCaisseDrivers(parcels, 'Ait Melloul', { now: new Date('2026-10-23T10:00:00Z') })
  const gare = drivers.find(d => d.id === GARE_GROUP_ID)!
  const rach = drivers.find(d => d.id === 'rach')!

  it('la carte du détenteur reçoit ses ports, « En gare » garde les inconnus', () => {
    expect(rach.name).toBe('rachida')
    expect(rach.parcels.map((p: any) => p.id).sort()).toEqual(['a', 'b'])
    expect(rach.portsPayesARecevoirCount).toBe(2)
    expect(rach.portsPayesARecevoirMontant).toBe(70)
    expect(gare.parcels.map((p: any) => p.id)).toEqual(['c'])
    expect(gare.portsPayesARecevoirCount).toBe(1)
  })

  it('même total qu’avant (« En gare » + détenteur)', () => {
    expect(rach.portsPayesARecevoirMontant + gare.portsPayesARecevoirMontant).toBe(90)
  })

  it('guichetGroupIdOf : détenteur, « En gare », ou pas un port du guichet', () => {
    expect(guichetGroupIdOf(parcels[0], 'Ait Melloul')).toBe('rach')
    expect(guichetGroupIdOf(parcels[2], 'Ait Melloul')).toBe(GARE_GROUP_ID)
    expect(guichetGroupIdOf({ ...parcels[0], portType: 'port_du' }, 'Ait Melloul')).toBeNull()
    expect(guichetGroupIdOf(parcels[0], 'Agadir')).toBeNull() // autre agence
  })
})
