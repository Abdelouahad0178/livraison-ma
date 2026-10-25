import { describe, it, expect } from 'vitest'
import { computeBilan } from './bilanPeriode'

// Port payé ramassé au guichet d'Agadir, livré à Marrakech par « En gare - Marrakech »
const pp = (extra: any = {}) => ({
  id: 'x', senderNic: '1027207', portType: 'port_paye', portStatus: 'collected', price: 60,
  originCity: 'Agadir', destinationCity: 'Marrakech', status: 'Arrivé en agence',
  deliveryDriverName: 'En gare - Marrakech', portCollectedBy: 'NOUREDINE MOUJI',
  portCollectedAt: '2026-10-23T10:00:00.000Z', createdAt: '2026-10-23T10:00:00.000Z', workDate: '2026-10-23', ...extra,
})

describe('Bilan — « Livreur / encaissé par » des ports payés au guichet', () => {
  it('détenteur du guichet de la ville de départ, pas la gare de destination', () => {
    const b = computeBilan({ periodParcels: [pp({ portGuichetHolderName: 'ENGAREAGA6017' })], moneyParcels: [], city: 'Agadir', role: 'agence', fromKey: null, toKey: null })
    expect(b.theorique.portsPayes.items.total.map(i => i.driver)).toEqual(['ENGAREAGA6017'])
  })
  it('sans détenteur enregistré : « En gare - <ville de départ> »', () => {
    const b = computeBilan({ periodParcels: [pp()], moneyParcels: [], city: 'Agadir', role: 'agence', fromKey: null, toKey: null })
    expect(b.theorique.portsPayes.items.encaisse.map(i => i.driver)).toEqual(['En gare - Agadir'])
  })
})
