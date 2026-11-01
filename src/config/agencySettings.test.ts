import { describe, it, expect, afterEach, vi } from 'vitest'
vi.mock('../firebase/db', () => ({ db: {} }))
import { CITIES } from '../firebase/constants'
import { applyAgencySettings, guichetHolderOf, neighborCityOf, areNeighborCities, CODE_CITIES } from './agencySettings'
import { activeDays, recentCollectDays } from './siteDelays'

// 🏢 01/11/2026 — réglages des agences (Admin › Agences) : sans document, les valeurs du code s'appliquent
afterEach(() => applyAgencySettings(null))

describe('réglages des agences', () => {
  it('sans réglage : villes, guichet et voisine du code', () => {
    applyAgencySettings(null)
    expect(CITIES).toEqual(CODE_CITIES)
    expect(guichetHolderOf('Agadir')?.name).toBe('ENGAREAGA6017')
    expect(guichetHolderOf('Casablanca')).toBeNull()
    expect(neighborCityOf('Agadir')).toBe('Ait Melloul')
    expect(areNeighborCities('Ait Melloul', 'Agadir')).toBe(true)
    expect(areNeighborCities('Agadir', 'Casablanca')).toBe(false)
  })
  it('réglage admin : la liste partagée CITIES change sur place, guichet et voisine réglés', () => {
    applyAgencySettings({
      cities: ['Agadir', 'Tiznit', ' '],
      guichet: { Agadir: null, Tiznit: { id: 'u1', name: 'GUICHET TIZNIT' } },
      neighbors: { Agadir: 'Tiznit', Tiznit: 'Agadir' },
    })
    expect(CITIES).toEqual(['Agadir', 'Tiznit'])
    expect(guichetHolderOf('Agadir')).toBeNull() // null réglé = aucun détenteur
    expect(guichetHolderOf('Tiznit')).toEqual({ id: 'u1', name: 'GUICHET TIZNIT' })
    expect(guichetHolderOf('Marrakech')?.name).toBe('HAMZA EN GARE') // ville non réglée → code
    expect(neighborCityOf('Agadir')).toBe('Tiznit')
    expect(areNeighborCities('Agadir', 'Ait Melloul')).toBe(false)
  })
  it('liste de villes vide ou invalide → liste du code', () => {
    applyAgencySettings({ cities: [] })
    expect(CITIES).toEqual(CODE_CITIES)
  })
  it('durées : code 14 / 45, réglées dans les bornes (7–31, 45–90)', () => {
    expect([recentCollectDays(), activeDays()]).toEqual([14, 45])
    applyAgencySettings({ delays: { collectDays: 21, activeDays: 60 } })
    expect([recentCollectDays(), activeDays()]).toEqual([21, 60])
    applyAgencySettings({ delays: { collectDays: 100, activeDays: 10 } })
    expect([recentCollectDays(), activeDays()]).toEqual([31, 45])
    applyAgencySettings({ delays: { collectDays: null as any } })
    expect([recentCollectDays(), activeDays()]).toEqual([14, 45])
  })
})
