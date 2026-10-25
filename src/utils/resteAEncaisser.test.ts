import { describe, it, expect } from 'vitest'
import { computeAgencyPortStats, buildCaisseSituation, resteAEncaisserLines } from './agencyFollowUp'

const d = '2026-10-14T10:00:00.000Z'
const parcels = [
  // port dû Marrakech → Casablanca, non encaissé : reste à Casablanca
  { id: 'a', originCity: 'Marrakech', destinationCity: 'Casablanca', portType: 'port_du', price: 50, status: 'Livré', createdAt: d, visibleInDestinationAgency: true, destinationArrivedAt: d },
  // port dû encaissé : rien
  { id: 'b', originCity: 'Marrakech', destinationCity: 'Casablanca', portType: 'port_du', price: 40, portStatus: 'collected', status: 'Livré', createdAt: d, visibleInDestinationAgency: true, destinationArrivedAt: d },
  // port payé Casablanca → Agadir, non encaissé : reste à Casablanca
  { id: 'c', originCity: 'Casablanca', destinationCity: 'Agadir', portType: 'port_paye', price: 90, status: 'Initialisé', createdAt: d },
  // port payé encaissé : rien
  { id: 'e', originCity: 'Casablanca', destinationCity: 'Agadir', portType: 'port_paye', price: 30, portStatus: 'received', status: 'Initialisé', createdAt: d },
  // en compte : jamais dans le reste
  { id: 'f', originCity: 'Casablanca', destinationCity: 'Agadir', portType: 'port_en_compte_expediteur', price: 70, status: 'Initialisé', createdAt: d },
]

describe('Reste à encaisser — détail', () => {
  it('Σ des lignes = écart de la situation caisse', () => {
    for (const city of ['Casablanca', 'Marrakech', 'Agadir']) {
      const phys = computeAgencyPortStats(parcels, { viewMode: 'physical', cities: [city] })[0]
      const theo = computeAgencyPortStats(parcels, { viewMode: 'theoretical', cities: [city] })[0]
      const ecart = buildCaisseSituation(phys, theo, 0).ecart
      const sum = Math.round(resteAEncaisserLines(parcels, city).reduce((s, l) => s + l.reste, 0) * 100) / 100
      expect(sum).toBe(ecart)
    }
  })
  it('Casablanca : port dû non encaissé + port payé non encaissé', () => {
    const lines = resteAEncaisserLines(parcels, 'Casablanca')
    expect(lines.map(l => l.p.id).sort()).toEqual(['a', 'c'])
  })
})
