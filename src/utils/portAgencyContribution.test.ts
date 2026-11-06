import { describe, expect, it } from 'vitest'
import { computeAgencyPortStats } from './agencyFollowUp'
import { isInAgencyScope } from './billingAgency'
import { portAgencyContributionOf, PORT_TH_KEYS, PORT_PH_KEYS, PORT_ALL_CITY } from './portAgencyContribution'

// 📮 01/11/2026 — totaux de « Port par agence » tenus par le serveur : la SOMME des contributions des expéditions doit
// donner EXACTEMENT le calcul de l'onglet sur ces expéditions (vue théorique, situation caisse, nombres, distinctes)
const CITIES = ['Casablanca', 'Agadir', 'Ait Melloul', 'Marrakech']
const W = '2026-10-31', at = '2026-10-31T12:00:00.000Z'
const P = (id: string, x: Record<string, any>) => ({ id, workDate: W, createdAt: at, status: 'Arrivé en agence', destinationArrivedAt: at, ...x })
const parcels = [
  P('du', { originCity: 'Casablanca', destinationCity: 'Agadir', portType: 'port_du', price: 55, portStatus: 'collected', portCollectedAt: at }),
  P('duNon', { originCity: 'Casablanca', destinationCity: 'Agadir', portType: 'port_du', price: 40 }),
  P('cheque', { originCity: 'Marrakech', destinationCity: 'Agadir', portType: 'port_du_cheque', price: 70, portStatus: 'received' }),
  P('guichet', { originCity: 'Agadir', destinationCity: 'Casablanca', portType: 'port_paye', price: 25, portStatus: 'collected', portCollectedById: 'n', portGuichetHolderId: 'g' }),
  P('remis', { originCity: 'Agadir', destinationCity: 'Casablanca', portType: 'port_paye', price: 30, portStatus: 'collected', portPayeExpReceivedAt: at, portPayeExpReceivedById: 'z' }),
  P('local', { originCity: 'Agadir', destinationCity: 'Agadir', portType: 'port_du', price: 20, portStatus: 'collected' }),
  P('compteExp', { originCity: 'Ait Melloul', destinationCity: 'Marrakech', portType: 'port_en_compte_expediteur', price: 90, status: 'Initialisé', destinationArrivedAt: null }),
  P('compteDest', { originCity: 'Casablanca', destinationCity: 'Ait Melloul', portType: 'port_en_compte_destinataire', price: 60 }),
  P('ancienneVille', { originCity: 'Casablanca', sender: { city: 'Casablanca' }, destinationCity: 'Agadir', receiver: { city: 'Ait Melloul' }, portType: 'port_du', price: 35, portStatus: 'collected' }),
  P('horsAgence', { originCity: 'Tanger', destinationCity: 'Fès', portType: 'port_du', price: 99, portStatus: 'collected' }),
]

const sumContributions = () => {
  const byCity: Record<string, Record<string, number>> = {}
  let union = 0
  for (const p of parcels) {
    const c = portAgencyContributionOf(p, CITIES)
    if (!c) continue
    expect(c.day).toBe(W)
    union += c.union
    for (const [city, v] of Object.entries(c.cities)) {
      const t = byCity[city] || (byCity[city] = {})
      for (const [k, n] of Object.entries(v)) t[k] = Math.round(((t[k] || 0) + n) * 100) / 100
    }
  }
  return { byCity, union }
}

describe('totaux de Port par agence tenus par le serveur', () => {
  const { byCity, union } = sumContributions()
  const th = computeAgencyPortStats(parcels, { viewMode: 'theoretical', cities: CITIES })
  const ph = computeAgencyPortStats(parcels, { viewMode: 'physical', cities: CITIES })
  it.each(CITIES)('%s : même vue théorique, même situation caisse, mêmes nombres que l\'onglet', city => {
    const t = th.find(s => s.city === city)!, q = ph.find(s => s.city === city)!, a = byCity[city] || {}
    PORT_TH_KEYS.forEach(k => expect(a[`th_${k}`] || 0).toBe(t[k]))
    PORT_PH_KEYS.forEach(k => expect(a[`ph_${k}`] || 0).toBe(q[k]))
    expect(a.nbExp || 0).toBe(t.nbExpeditions)
    expect(a.nbUnique || 0).toBe(t.nbUnique)
  })
  it('expéditions distinctes de toutes les agences = compte de l\'onglet', () => {
    const tab = parcels.filter(p => CITIES.some(c => isInAgencyScope(p, c, 'all'))).length
    expect(union).toBe(tab)
  })
  it('expédition hors des agences : aucune contribution', () => {
    expect(portAgencyContributionOf(parcels.find(p => p.id === 'horsAgence'), CITIES)).toBeNull()
    expect(PORT_ALL_CITY).toBe('__toutes')
  })
})
