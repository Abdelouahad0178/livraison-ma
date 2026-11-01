import { describe, expect, it } from 'vitest'
import { computeCaisseView } from './agencyCaisseRules'
import { envoiItemsOf } from './exploitationEnvoi'

// 👤 01/11/2026 — « Collectes par jour » du chef d'exploitation = argent RÉELLEMENT collecté / reçu par lui, exactement
// comme son bloc « Versements au chef d'agence » (cas réel Agadir, 31/10 : 1057607 à 0 DH, 1219742 port payé encore au guichet)
const ZINEBE = 'zinebe', AUTRE = 'chefAgence'
const at = '2026-10-31T12:26:29.792Z'
const DU = (id: string, extra: Record<string, any> = {}) => ({
  id, portType: 'port_du', portStatus: 'collected', price: 55, originCity: 'Casablanca', destinationCity: 'Agadir', status: 'Livré',
  createdAt: '2026-10-29T10:00:00.000Z', workDate: '2026-10-29', portCollectedAt: at, portCollectedById: ZINEBE, portCollectedBy: 'ZINEBE',
  portExpReceivedAt: at, portExpReceivedById: ZINEBE, deliveryDriverName: 'ENGAREAGA6017', ...extra,
})
const PP = (id: string, extra: Record<string, any> = {}) => ({
  id, portType: 'port_paye', portStatus: 'collected', price: 25, originCity: 'Agadir', destinationCity: 'Casablanca', status: 'Arrivé en agence',
  createdAt: '2026-10-31T12:00:00.000Z', workDate: '2026-10-31', portCollectedAt: '2026-10-31T12:00:00.000Z', portCollectedById: 'nouredine',
  portCollectedBy: 'NOUREDINE MOUJI', portGuichetHolderId: 'engare', portGuichetHolderName: 'ENGAREAGA6017', ...extra,
})
const parcels = [
  DU('a'), DU('b', { price: 100 }),
  DU('zero', { price: 0 }),                                               // 1057607 : port dû à 0 DH
  DU('autre', { portCollectedById: AUTRE, portExpReceivedById: undefined, portExpReceivedAt: undefined }), // encaissé par un autre compte
  PP('guichet'),                                                          // 1219742 : encore au guichet
  PP('remis', { portPayeExpReceivedAt: '2026-10-31T18:00:00.000Z', portPayeExpReceivedById: ZINEBE }), // remis à ZINEBE
]
const view = (collectorId: string | null) => computeCaisseView({
  city: 'Agadir', allDisplayParcels: parcels, garePending: [], datePreset: 'day', dateFrom: '2026-10-31',
  now: new Date('2026-11-01T02:00:00.000Z'), collectorId,
})
const day31 = (v: ReturnType<typeof view>) => v.collectesParJour.find(([k]) => k === '2026-10-31')![1]

describe('« Collectes par jour » du chef d\'exploitation', () => {
  it('sans compte (admin, Caisse Agence) : toute l\'agence — sans le 0 DH ni le port payé encore au guichet', () => {
    const d = day31(view(null))
    expect(d.parcels.map((p: any) => p.id).sort()).toEqual(['a', 'autre', 'b', 'remis'])
    expect(d.montant).toBe(55 + 100 + 55 + 25)
  })
  it('chef d\'exploitation : seulement ce qu\'il a collecté / reçu (ni 0 DH, ni un autre compte, ni le guichet non remis)', () => {
    const d = day31(view(ZINEBE))
    expect(d.parcels.map((p: any) => p.id).sort()).toEqual(['a', 'b', 'remis'])
    expect(d.portDu).toEqual({ count: 2, montant: 155 })
    expect(d.portPaye).toEqual({ count: 1, montant: 25 })
  })
  it('= exactement ses valeurs à verser (règle du bloc « Versements au chef d\'agence »)', () => {
    const items = parcels.flatMap(p => envoiItemsOf(p)).filter(i => i.kind !== 'cod' && i.holders.includes(ZINEBE) && (i.collectedKey ?? i.dayKey) === '2026-10-31')
    const d = day31(view(ZINEBE))
    expect(items.map(i => i.parcelId).sort()).toEqual(d.parcels.map((p: any) => p.id).sort())
    expect(items.reduce((s, i) => s + i.amount, 0)).toBe(d.montant)
  })
})
