import { describe, it, expect } from 'vitest'
import { computeBilan } from './bilanPeriode'

const D = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h)).toISOString()
const base = { originCity: 'Casablanca', destinationCity: 'Agadir', status: 'Livré' }
describe('computeBilan', () => {
  const parcels = [
    { id: 'a', ...base, portType: 'port_du', price: 50, portStatus: 'collected', createdAt: D(17), portCollectedAt: D(17), portExpReceivedAt: D(17) },
    { id: 'b', ...base, portType: 'port_du', price: 40, createdAt: D(17) },
    { id: 'c', ...base, portType: 'port_du', price: 30, portStatus: 'collected', createdAt: D(14), portCollectedAt: D(17), portExpReceivedAt: D(17) },
    { id: 'd', ...base, portType: 'port_du', price: 20, portStatus: 'collected', createdAt: D(14), portCollectedAt: D(18) },
    { id: 'e', originCity: 'Agadir', destinationCity: 'Casablanca', status: 'Arrivé en agence', portType: 'port_paye', price: 30, portStatus: 'collected', createdAt: D(17), portCollectedAt: D(17), portPayeExpReceivedAt: D(18) },
    { id: 'f', ...base, codAmount: 1000, codPaymentType: 'especes', codStatus: 'collected', createdAt: D(17), codCollectedAt: D(17), codExpReceivedAt: D(17) },
  ]
  it('exploitation : théorique de la période + encaissé à la date (encaissé OU reçu)', () => {
    const b = computeBilan({ periodParcels: parcels, moneyParcels: parcels, city: 'Agadir', role: 'exploitation', fromKey: '2026-10-17', toKey: '2026-10-17' })
    expect(b.theorique.portsDus).toMatchObject({ total: 90, encaisse: 50, reste: 40 })
    expect(b.theorique.portsPayes).toMatchObject({ total: 30, encaisse: 30 })
    expect(b.theorique.cod.especes).toMatchObject({ total: 1000, encaisse: 1000 })
    // a (50) + c (30, expédition du 14 encaissée le 17) + e (30, encaissé le 17, remis le 18) ; d (encaissé le 18) exclu
    expect(b.encaisse.ports).toMatchObject({ montant: 110, aVerser: 110, verse: 0 })
    expect(b.encaisse.codEspeces).toMatchObject({ montant: 1000, aVerser: 1000 })
  })
  it('agence : à verser à l\'admin = reçu par l\'agence ; le reste « pas encore reçu »', () => {
    const recv = parcels.map(p => p.id === 'a' ? { ...p, portChefReceivedAt: D(17) } : p.id === 'f' ? { ...p, codStatus: 'remis' } : p)
    const b = computeBilan({ periodParcels: recv, moneyParcels: recv, city: 'Agadir', role: 'agence', fromKey: '2026-10-17', toKey: '2026-10-17', agencyHolderIds: new Set() })
    expect(b.encaisse.ports).toMatchObject({ aVerser: 50, nonRecu: 60 }) // c (30) + e (port payé chez le chef d'exploitation, 30)
    expect(b.encaisse.codEspeces).toMatchObject({ aVerser: 1000, nonRecu: 0 })
  })
})

describe('computeBilan — COD espèces séparé des chèques / traites', () => {
  it('chèque et COD mixte côté documents, espèces à part', () => {
    const D = (d: number) => new Date(Date.UTC(2026, 9, d, 12)).toISOString()
    const b0 = { originCity: 'Casablanca', destinationCity: 'Agadir', status: 'Livré', codStatus: 'collected', createdAt: D(17), codCollectedAt: D(17) }
    const parcels = [
      { id: 'e', ...b0, codAmount: 100, codPaymentType: 'especes' },
      { id: 'c', ...b0, codAmount: 500, codPaymentType: 'cheque' },
    ]
    const b = computeBilan({ periodParcels: parcels, moneyParcels: parcels, city: 'Agadir', role: 'exploitation', fromKey: '2026-10-17', toKey: '2026-10-17' })
    expect(b.encaisse.codEspeces).toMatchObject({ montant: 100, aVerser: 100 })
    expect(b.encaisse.codDocs).toMatchObject({ montant: 500, aVerser: 500 })
  })
})

describe('computeBilan — une somme = une journée (date d\'encaissement)', () => {
  it('port payé encaissé au guichet le 14, remis le 15 : compte le 14, jamais le 15', () => {
    const D = (d: number) => new Date(Date.UTC(2026, 9, d, 12)).toISOString()
    const p = [{ id: 'r', originCity: 'Agadir', destinationCity: 'Casablanca', status: 'Arrivé en agence', portType: 'port_paye', price: 90,
      portStatus: 'collected', createdAt: D(14), portCollectedAt: D(14), portPayeExpReceivedAt: D(15) }]
    const day = (k: string) => computeBilan({ periodParcels: p, moneyParcels: p, city: 'Agadir', role: 'exploitation', fromKey: k, toKey: k }).encaisse.ports.montant
    expect(day('2026-10-14')).toBe(90)
    expect(day('2026-10-15')).toBe(0)
  })
})
