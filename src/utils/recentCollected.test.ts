import { describe, it, expect } from 'vitest'
import { matchesRecentCollected, matchesRecentShape, createdOutsidePeriod, hasOutsideRanges, tsMillis } from './recentCollected'

const ts = (iso: string) => { const ms = Date.parse(iso); return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms } }
const SINCE = Date.parse('2026-10-05T07:00:00Z')
const base = { createdAt: ts('2026-10-01T10:00:00Z') }

describe('Collectes par jour — mêmes règles que les requêtes Firestore', () => {
  it('port dû collecté (date Firestore) à destination de la ville', () => {
    expect(matchesRecentCollected({ ...base, destinationCity: 'Agadir', portCollectedAt: ts('2026-10-20T10:00:00Z') }, 'Agadir', SINCE)).toBe(true)
  })
  it('collecte en texte ISO : comparée comme texte', () => {
    expect(matchesRecentCollected({ ...base, destinationCity: 'Agadir', codCollectedAt: '2026-10-20T10:00:00.000Z' }, 'Agadir', SINCE)).toBe(true)
    expect(matchesRecentCollected({ ...base, destinationCity: 'Agadir', codCollectedAt: '2026-10-01T10:00:00.000Z' }, 'Agadir', SINCE)).toBe(false)
  })
  it('collecte avant le début : exclue', () => {
    expect(matchesRecentCollected({ ...base, destinationCity: 'Agadir', portCollectedAt: ts('2026-10-04T10:00:00Z') }, 'Agadir', SINCE)).toBe(false)
  })
  it('mauvais champ ville (port payé reçu : ville de DÉPART)', () => {
    expect(matchesRecentCollected({ ...base, destinationCity: 'Agadir', originCity: 'Casablanca', portReceivedAt: ts('2026-10-20T10:00:00Z') }, 'Agadir', SINCE)).toBe(false)
    expect(matchesRecentCollected({ ...base, originCity: 'Agadir', portReceivedAt: ts('2026-10-20T10:00:00Z') }, 'Agadir', SINCE)).toBe(true)
  })
  it('sans date de création (date Firestore) : exclue, comme les requêtes', () => {
    expect(matchesRecentShape({ destinationCity: 'Agadir', portCollectedAt: ts('2026-10-20T10:00:00Z') }, 'Agadir', 'destinationCity', 'portCollectedAt', 'ts', SINCE)).toBe(false)
  })
  it('date relue d’IndexedDB ({ seconds, nanoseconds })', () => {
    expect(tsMillis({ seconds: 10, nanoseconds: 5e8 })).toBe(10500)
  })
  it('création hors période : avant le début, ou après la fin si la période est passée', () => {
    const from = Date.parse('2026-10-22T07:00:00Z'), to = Date.parse('2026-10-23T05:00:00Z'), now = Date.parse('2026-10-24T10:00:00Z')
    expect(createdOutsidePeriod({ createdAt: ts('2026-10-21T10:00:00Z') }, from, to, now)).toBe(true)
    expect(createdOutsidePeriod({ createdAt: ts('2026-10-22T10:00:00Z') }, from, to, now)).toBe(false)
    expect(createdOutsidePeriod({ createdAt: ts('2026-10-24T09:00:00Z') }, from, to, now)).toBe(true)
    // Période en cours (fin dans le futur) : rien après la fin
    expect(createdOutsidePeriod({ createdAt: ts('2026-10-24T09:00:00Z') }, from, Date.parse('2026-10-25T05:00:00Z'), now)).toBe(false)
  })
  it('« Tout » sans borne de début et période en cours : rien à lire', () => {
    expect(hasOutsideRanges(0, Date.parse('2099-01-01'), Date.now())).toBe(false)
    expect(hasOutsideRanges(Date.parse('2026-10-01'), 0)).toBe(true)
  })
})
