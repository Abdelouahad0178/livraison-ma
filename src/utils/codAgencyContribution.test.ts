import { describe, expect, it } from 'vitest'
import { computeAgencyCodStats, codResteLines } from './agencyCodStats'
import { codAgencyContributionOf, codDayDeltas, codAgencyFromDays, codResteFromDays, COD_ALL_CITY } from './codAgencyContribution'

// 💰 01/11/2026 — totaux de « COD par agence » tenus par le serveur : les documents de journée (sommes des différences
// codDayDeltas, comme la Cloud Function) doivent redonner EXACTEMENT le calcul de l'onglet (computeAgencyCodStats) pour
// chaque vue × direction × ville d'origine, les expéditions distinctes de tout groupe d'agences, et le reste à encaisser
const CITIES = ['Casablanca', 'Agadir', 'Ait Melloul', 'Marrakech']
const W = '2026-10-31', at = '2026-10-31T12:00:00.000Z'
const P = (id: string, x: Record<string, any>): any => ({ id, workDate: W, createdAt: at, status: 'Livré', destinationArrivedAt: at, ...x })
const parcels = [
  P('esp', { originCity: 'Casablanca', destinationCity: 'Agadir', codAmount: 300, serviceType: 'especes', codStatus: 'collected', codCollectedAt: at }),
  P('espNon', { originCity: 'Casablanca', destinationCity: 'Agadir', codAmount: 120, serviceType: 'especes', codStatus: 'pending', status: 'Arrivé en agence' }),
  P('cheque', { originCity: 'Marrakech', destinationCity: 'Agadir', codAmount: 900, serviceType: 'cheque', codPaymentType: 'cheque', codStatus: 'remis' }),
  P('chequeNon', { originCity: 'Marrakech', destinationCity: 'Agadir', codAmount: 400, serviceType: 'cheque', codPaymentType: 'cheque', codStatus: 'pending' }),
  P('mixte', { originCity: 'Agadir', destinationCity: 'Casablanca', codAmount: 1000, serviceType: 'traite', codMixed: true, codCashAmount: 200, codStatus: 'collected', codCollectedAt: at }),
  P('mixteNon', { originCity: 'Agadir', destinationCity: 'Casablanca', codAmount: 700, serviceType: 'traite', codMixed: true, codCashAmount: 100, codStatus: 'pending' }),
  P('regle', { originCity: 'Agadir', destinationCity: 'Marrakech', codAmount: 450, serviceType: 'especes', codStatus: 'regle', codSenderPaid: true }),
  P('local', { originCity: 'Agadir', destinationCity: 'Agadir', codAmount: 80, serviceType: 'especes', codStatus: 'collected', codCollectedAt: at }),
  P('simple', { originCity: 'Casablanca', destinationCity: 'Agadir', codAmount: 500, serviceType: 'simple' }),
  P('retour', { originCity: 'Casablanca', destinationCity: 'Agadir', codAmount: 0, serviceType: 'especes', status: 'Retourné', wasReturned: true }),
  P('ancienneVille', { originCity: 'Casablanca', destinationCity: 'Agadir', receiver: { city: 'Ait Melloul' }, codAmount: 210, serviceType: 'especes', codStatus: 'collected', codCollectedAt: at }),
  P('horsReseau', { originCity: 'Tanger', destinationCity: 'Agadir', codAmount: 330, serviceType: 'especes', codStatus: 'pending' }),
]
const MODES = ['theoretical', 'physical'] as const
const DIRS = ['received', 'sent', 'all'] as const
const ORIGINS = ['all', 'Casablanca', 'Marrakech', 'Agadir', 'Tanger']

// Documents de journée, comme la Cloud Function les tient (increments)
const docs = (() => {
  const byKey = new Map<string, any>()
  for (const p of parcels) {
    for (const d of codDayDeltas(codAgencyContributionOf(p, CITIES), 1)) {
      const doc = byKey.get(d.city) || { city: d.city, day: d.day }
      for (const [k, n] of Object.entries(d.nums)) doc[k] = Math.round(((doc[k] || 0) + n) * 100) / 100
      for (const { path, n } of d.nested) {
        let o = doc
        for (const k of path.slice(0, -1)) o = o[k] || (o[k] = {})
        const last = path[path.length - 1]
        o[last] = Math.round(((o[last] || 0) + n) * 100) / 100
      }
      byKey.set(d.city, doc)
    }
  }
  return [...byKey.values()]
})()
const subsets = (list: string[]): string[][] => list.reduce<string[][]>((acc, c) => acc.concat(acc.map(s => [...s, c])), [[]]).filter(s => s.length)

describe('totaux de COD par agence tenus par le serveur — tous les filtres', () => {
  for (const viewMode of MODES) for (const directionFilter of DIRS) for (const originCityFilter of ORIGINS) {
    if (directionFilter !== 'received' && originCityFilter !== 'all') continue // la ville d'origine ne filtre que les reçues
    it(`${viewMode} · ${directionFilter} · origine ${originCityFilter}`, () => {
      const tab = computeAgencyCodStats(parcels, { viewMode, directionFilter, originCityFilter, cities: CITIES })
      const srv = codAgencyFromDays(docs, CITIES, { viewMode, directionFilter, originCityFilter })
      expect(srv.stats).toEqual(tab)
      // expéditions distinctes de CHAQUE groupe d'agences (filtres ville / type de valeur), comme l'onglet
      for (const group of subsets(CITIES)) {
        const expected = parcels.filter(p => (directionFilter !== 'received' || originCityFilter === 'all' || p.originCity === originCityFilter)
          && group.some(c => computeAgencyCodStats([p], { viewMode, directionFilter, originCityFilter, cities: [c] })[0].total > 0)).length
        expect(srv.uniqueOf(group)).toBe(expected)
      }
    })
  }
  it.each(CITIES)('reste à encaisser de %s : attendu, encaissé et nombre d\'expéditions par type', city => {
    for (const part of ['especes', 'cheque', 'traite'] as const) {
      const r = codResteFromDays(docs, city, part)
      const t = computeAgencyCodStats(parcels, { viewMode: 'theoretical', directionFilter: 'received', cities: [city] })[0]
      const ph = computeAgencyCodStats(parcels, { viewMode: 'physical', directionFilter: 'received', cities: [city] })[0]
      expect([r.attendu, r.encaisse]).toEqual([t[part], ph[part]])
      expect(r.count).toBe(codResteLines(parcels, city, part).length)
    }
  })
  it('liste des agences d\'une expédition (recherche ciblée) et retrait exact (−1)', () => {
    const c = codAgencyContributionOf(parcels.find(p => p.id === 'ancienneVille'), CITIES)!
    expect(c.cityList).toEqual(['Agadir', 'Ait Melloul', 'Casablanca'])
    const plus = codDayDeltas(c, 1), minus = codDayDeltas(c, -1)
    plus.forEach((d, i) => Object.entries(d.nums).forEach(([k, n]) => expect(n + minus[i].nums[k]).toBe(0)))
    expect(codAgencyContributionOf(parcels.find(p => p.id === 'simple'), CITIES)).toBeNull()
    expect(COD_ALL_CITY).toBe('__toutes')
  })
})
