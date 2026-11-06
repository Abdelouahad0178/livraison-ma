import { describe, expect, it } from 'vitest'
import { Timestamp, GeoPoint } from 'firebase/firestore'
import { fromRestFields, restTimestamp, toRestValue } from './restValue'

// ⚡ 01/11/2026 — lecture directe (API REST) : même forme que doc.data() de la bibliothèque Firebase
describe('valeurs REST Firestore', () => {
  it('horodatages exacts (nanosecondes)', () => {
    const t = restTimestamp('2026-10-31T12:26:29.792123456Z')
    expect(t).toBeInstanceOf(Timestamp)
    expect([t.seconds, t.nanoseconds]).toEqual([Date.parse('2026-10-31T12:26:29Z') / 1000, 792123456])
    expect(restTimestamp('2026-10-31T12:26:29Z').nanoseconds).toBe(0)
    expect(restTimestamp('2026-10-31T12:26:29.5Z').nanoseconds).toBe(500000000)
  })
  it('tous les types, imbriqués', () => {
    const d = fromRestFields({
      s: { stringValue: 'Agadir' }, n: { integerValue: '45' }, f: { doubleValue: 12.5 }, b: { booleanValue: true }, z: { nullValue: null },
      m: { mapValue: { fields: { city: { stringValue: 'Casablanca' } } } }, e: { mapValue: {} },
      a: { arrayValue: { values: [{ mapValue: { fields: { status: { stringValue: 'Livré' } } } }, { integerValue: '2' }] } }, ea: { arrayValue: {} },
      g: { geoPointValue: { latitude: 30.4, longitude: -9.6 } }, r: { referenceValue: 'projects/p/databases/(default)/documents/parcels/abc' },
    }, { ref: path => `REF:${path}` })
    expect(d).toEqual({ s: 'Agadir', n: 45, f: 12.5, b: true, z: null, m: { city: 'Casablanca' }, e: {}, a: [{ status: 'Livré' }, 2], ea: [],
      g: new GeoPoint(30.4, -9.6), r: 'REF:parcels/abc' })
  })
  it('filtres : texte, nombre, booléen, Timestamp (nanosecondes gardées)', () => {
    expect(toRestValue('Agadir')).toEqual({ stringValue: 'Agadir' })
    expect(toRestValue(3)).toEqual({ integerValue: '3' })
    expect(toRestValue(new Timestamp(1793500000, 5))).toEqual({ timestampValue: `${new Date(1793500000 * 1000).toISOString().slice(0, 19)}.000000005Z` })
    expect(toRestValue({ timestampValue: 'x' })).toEqual({ timestampValue: 'x' })
  })
})
