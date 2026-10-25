import { describe, it, expect } from 'vitest'
import { computeAgencyCodStats, codResteLines, codAgencyLines } from './agencyCodStats'

const d = '2026-10-14T10:00:00.000Z'
const base = { createdAt: d, visibleInDestinationAgency: true, destinationArrivedAt: d }
const parcels = [
  // Casablanca → Agadir, chèque 1000, encaissé
  { ...base, id: 'a', originCity: 'Casablanca', destinationCity: 'Agadir', serviceType: 'cheque', codPaymentType: 'cheque', codAmount: 1000, codStatus: 'collected', codCollectedAt: d, status: 'Livré' },
  // Casablanca → Agadir, espèces 300, pas encore encaissé
  { ...base, id: 'b', originCity: 'Casablanca', destinationCity: 'Agadir', serviceType: 'especes', codPaymentType: 'especes', codAmount: 300, codStatus: 'pending', status: 'En cours de livraison' },
  // simple : ignoré
  { ...base, id: 'c', originCity: 'Casablanca', destinationCity: 'Agadir', serviceType: 'simple', codAmount: 0 },
  // retourné : ignoré
  { ...base, id: 'e', originCity: 'Casablanca', destinationCity: 'Agadir', serviceType: 'especes', codAmount: 500, wasReturned: true },
]
const of = (s: any[], c: string) => s.find(x => x.city === c)

describe('COD par agence', () => {
  it('vue théorique, reçues : à encaisser par la destination, par type', () => {
    const s = computeAgencyCodStats(parcels, { viewMode: 'theoretical', directionFilter: 'received' })
    expect(of(s, 'Agadir')).toMatchObject({ especes: 300, cheque: 1000, traite: 0, total: 1300, nbUnique: 2 })
    expect(of(s, 'Casablanca').total).toBe(0)
  })
  it('vue théorique, envoyées : à régler aux expéditeurs de l\'origine', () => {
    const s = computeAgencyCodStats(parcels, { viewMode: 'theoretical', directionFilter: 'sent' })
    expect(of(s, 'Casablanca').total).toBe(1300)
    expect(of(s, 'Agadir').total).toBe(0)
  })
  it('situation caisse : seulement l\'encaissé', () => {
    const s = computeAgencyCodStats(parcels, { viewMode: 'physical', directionFilter: 'received' })
    expect(of(s, 'Agadir')).toMatchObject({ cheque: 1000, especes: 0, total: 1000 })
  })
  it('reste à encaisser = théorique reçues − caisse reçues', () => {
    const lines = codResteLines(parcels, 'Agadir')
    expect(lines.map((l: any) => l.p.id)).toEqual(['b'])
    const theo = computeAgencyCodStats(parcels, { viewMode: 'theoretical', directionFilter: 'received' }).find(s => s.city === 'Agadir')!.total
    const cash = computeAgencyCodStats(parcels, { viewMode: 'physical', directionFilter: 'received' }).find(s => s.city === 'Agadir')!.total
    expect(lines.reduce((s: number, l: any) => s + l.reste, 0)).toBe(theo - cash)
  })
  it('reste séparé : espèces d\'un côté, valeurs (chèques / traites) de l\'autre', () => {
    const mix = [...parcels, { ...base, id: 'f', originCity: 'Casablanca', destinationCity: 'Agadir', serviceType: 'traite', codPaymentType: 'traite', codAmount: 800, codStatus: 'pending', status: 'En cours de livraison' }]
    expect(codResteLines(mix, 'Agadir', 'especes').map((l: any) => l.p.id)).toEqual(['b'])
    expect(codResteLines(mix, 'Agadir', 'valeurs').map((l: any) => l.p.id)).toEqual(['f'])
  })
  it('listes théorique / caisse, espèces et valeurs séparées', () => {
    const theo = codAgencyLines(parcels, 'Agadir', { viewMode: 'theoretical', directionFilter: 'received', part: 'especes' })
    expect(theo.map((l: any) => l.p.id)).toEqual(['b'])
    const cashVal = codAgencyLines(parcels, 'Agadir', { viewMode: 'physical', directionFilter: 'received', part: 'valeurs' })
    expect(cashVal.map((l: any) => [l.p.id, l.encaisse])).toEqual([['a', 1000]])
    expect(codAgencyLines(parcels, 'Agadir', { viewMode: 'physical', directionFilter: 'received', part: 'especes' })).toHaveLength(0)
  })
  it('chèques et traites jamais mélangés', () => {
    const mix = [...parcels, { ...base, id: 't', originCity: 'Marrakech', destinationCity: 'Agadir', serviceType: 'traite', codPaymentType: 'traite', codAmount: 24770, codStatus: 'pending', status: 'Livré' }]
    expect(codResteLines(mix, 'Agadir', 'cheque').map((l: any) => l.p.id)).toEqual([])
    expect(codResteLines(mix, 'Agadir', 'traite').map((l: any) => l.p.id)).toEqual(['t'])
    expect(codAgencyLines(mix, 'Agadir', { viewMode: 'theoretical', directionFilter: 'received', part: 'cheque' }).map((l: any) => l.p.id)).toEqual(['a'])
  })
  it('« Toutes » : chaque agence voit son côté', () => {
    const s = computeAgencyCodStats(parcels, { viewMode: 'theoretical' })
    expect(of(s, 'Agadir').total).toBe(1300)
    expect(of(s, 'Casablanca').total).toBe(1300)
  })
})

describe('COD mixte (chèque + espèces) — COD par agence', () => {
  it('part espèces en Espèces, part chèque en Chèque, compté « mixte »', () => {
    const p = { id: 'm1', codAmount: 4387.32, codMixed: true, codCashAmount: 356.22, serviceType: 'cheque', codPaymentType: 'cheque', codStatus: 'collected', codCollectedAt: '2026-10-21T14:52:47.181Z',
      status: 'Livré', originCity: 'Casablanca', destinationCity: 'Ait Melloul', receiver: { city: 'Ait Melloul' }, sender: { city: 'Casablanca' }, visibleInDestinationAgency: true }
    const [s] = computeAgencyCodStats([p], { viewMode: 'physical', cities: ['Ait Melloul'] })
    expect(s).toMatchObject({ especes: 356.22, cheque: 4031.1, total: 4387.32, nbMixtes: 1 })
    expect(codAgencyLines([p], 'Ait Melloul', { viewMode: 'physical', part: 'especes' })[0]).toMatchObject({ attendu: 356.22, kind: 'mixte' })
  })
})
