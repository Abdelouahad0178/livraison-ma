import { describe, it, expect } from 'vitest'
import { computeCaisseView, isPortDuHeldByAgency } from './agencyCaisseRules'

const CITY = 'Agadir'
const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0)
const portDu = (id: string, d: number, extra: any = {}) => ({
  id, portType: 'port_du', portStatus: 'collected', price: 100, status: 'Livré',
  originCity: 'Casablanca', destinationCity: CITY, createdAt: day(d, 9), portCollectedAt: day(d), ...extra,
})
const view = (parcels: any[], agencyHolderIds: Set<string> | null, now = day(20)) => computeCaisseView({
  city: CITY, allDisplayParcels: parcels, garePending: [], datePreset: 'all', agencyHolderIds, now,
})

describe('A1 — « à verser » = ports dus reçus par le chef d\'agence', () => {
  const holders = new Set(['chef'])
  it('reconnaît reçu / encaissé par le chef / chez le chef d\'exploitation', () => {
    expect(isPortDuHeldByAgency({ portChefReceivedAt: day(10) }, holders)).toBe(true)
    expect(isPortDuHeldByAgency({ portStatus: 'received' }, holders)).toBe(true)
    expect(isPortDuHeldByAgency({ portCollectedById: 'chef' }, holders)).toBe(true)
    expect(isPortDuHeldByAgency({ portCollectedById: 'exploit' }, holders)).toBe(false)
    expect(isPortDuHeldByAgency({ portCollectedById: 'exploit' }, null)).toBe(true)
  })

  it('sépare « à verser » et « pas encore reçu » ; sans liste, comportement inchangé', () => {
    const parcels = [
      portDu('a', 18, { portCollectedById: 'exploit' }),
      portDu('b', 18, { portCollectedById: 'exploit', portChefReceivedAt: day(18, 20) }),
      portDu('c', 18, { portCollectedById: 'chef' }),
    ]
    const v = view(parcels, holders)
    const [, d] = v.collectesParJour[0]
    expect(d.aVerser).toBe(200)
    expect(d.nonRecu).toBe(100)
    expect(v.soldeCaisseGlobal).toBe(200)
    expect(v.nonRecuTotal).toBe(100)
    const old = view(parcels, null)
    expect(old.collectesParJour[0][1].aVerser).toBe(300)
    expect(old.soldeCaisseGlobal).toBe(300)
  })
})

describe('A2 — une journée non versée ne disparaît pas après 14 jours', () => {
  it('garde les journées anciennes encore à verser (Caisse Agence seulement)', () => {
    const parcels: any[] = []
    for (let d = 5; d <= 30; d++) parcels.push(portDu(`p${d}`, d, { portCollectedById: 'chef', portAdminTransferred: d !== 6 }))
    const v = view(parcels, new Set(['chef']), new Date(2026, 9, 31, 12))
    const keys = v.collectesParJour.map(([k]) => k)
    expect(keys).toContain('2026-10-06')
    expect(keys).not.toContain('2026-10-07')
    expect(view(parcels, null, new Date(2026, 9, 31, 12)).collectesParJour.length).toBe(14)
  })
})
