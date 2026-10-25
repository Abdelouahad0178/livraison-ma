import { describe, it, expect } from 'vitest'
import {
  ALL_CITIES, liteDayKey, parseLiteDayKey, parcelMatchesKey, applyChangedParcels, citiesInCache,
  dropCityEntries, encodeLiteValue, decodeLiteValue, selectPersistableKeys, shiftDay, opDayOfParcel,
} from './liteDayCache'

// Faux Timestamp Firestore (mêmes champs / méthode que la vraie classe)
class FakeTs {
  constructor(public seconds: number, public nanoseconds: number) {}
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6) }
  toDate() { return new Date(this.toMillis()) }
}
const ts = (d: Date) => new FakeTs(Math.floor(d.getTime() / 1000), 0)
// 10/10/2026 à 12h (journée d'opération 2026-10-10) ; 11/10/2026 à 03h → encore la journée du 10
const D10 = new Date(2026, 9, 10, 12, 0, 0)
const D11_NIGHT = new Date(2026, 9, 11, 3, 0, 0)
const D11 = new Date(2026, 9, 11, 12, 0, 0)
const exp = (id: string, origin: string, dest: string, at: Date, extra: any = {}) =>
  ({ id, originCity: origin, destinationCity: dest, createdAt: ts(at), ...extra })

describe('clés de la mémoire des journées', () => {
  it('construit et découpe une clé (ville, toutes villes)', () => {
    expect(parseLiteDayKey(liteDayKey('Agadir', 'originCity', '2026-10-10'))).toEqual({ city: 'Agadir', field: 'originCity', day: '2026-10-10' })
    expect(parseLiteDayKey(liteDayKey(ALL_CITIES, 'createdAt', '2026-10-10'))).toEqual({ city: '*', field: 'createdAt', day: '2026-10-10' })
    expect(parseLiteDayKey('Ait Melloul|destinationCity|2026-10-01').city).toBe('Ait Melloul')
  })

  it('journée d\'opération : avant 8h = la veille', () => {
    expect(opDayOfParcel(exp('a', 'X', 'Y', D11_NIGHT))).toBe('2026-10-10')
    expect(opDayOfParcel({ id: 'z' })).toBe('')
  })

  it('appartenance : ville + champ + journée ; « * » = toutes les villes', () => {
    const p = exp('a', 'Agadir', 'Casablanca', D10)
    expect(parcelMatchesKey(p, parseLiteDayKey('Agadir|originCity|2026-10-10'))).toBe(true)
    expect(parcelMatchesKey(p, parseLiteDayKey('Agadir|destinationCity|2026-10-10'))).toBe(false)
    expect(parcelMatchesKey(p, parseLiteDayKey('Agadir|originCity|2026-10-11'))).toBe(false)
    expect(parcelMatchesKey(p, parseLiteDayKey('*|createdAt|2026-10-10'))).toBe(true)
    expect(parcelMatchesKey(p, parseLiteDayKey('*|createdAt|2026-10-11'))).toBe(false)
  })
})

describe('rattrapage (applyChangedParcels)', () => {
  const build = () => {
    const entries = new Map<string, Map<string, any>>()
    const a = exp('a', 'Agadir', 'Casablanca', D10, { status: 'En transit' })
    entries.set('Agadir|originCity|2026-10-10', new Map([['a', a]]))
    entries.set('Agadir|destinationCity|2026-10-10', new Map())
    entries.set('Casablanca|destinationCity|2026-10-10', new Map([['a', a]]))
    entries.set('*|createdAt|2026-10-10', new Map([['a', a]]))
    entries.set('*|createdAt|2026-10-11', new Map())
    return entries
  }

  it('met à jour une expédition modifiée partout où elle figure', () => {
    const entries = build()
    const touched = applyChangedParcels(entries, [exp('a', 'Agadir', 'Casablanca', D10, { status: 'Livré' })])
    expect(entries.get('Agadir|originCity|2026-10-10')!.get('a').status).toBe('Livré')
    expect(entries.get('Casablanca|destinationCity|2026-10-10')!.get('a').status).toBe('Livré')
    expect(entries.get('*|createdAt|2026-10-10')!.get('a').status).toBe('Livré')
    expect(touched.has('*|createdAt|2026-10-11')).toBe(false)
    expect(touched.size).toBe(3)
  })

  it('retour (origine ⇄ destination échangées) : déplacée vers la bonne journée de ville', () => {
    const entries = build()
    applyChangedParcels(entries, [exp('a', 'Casablanca', 'Agadir', D10, { status: 'Retourné' })])
    expect(entries.get('Agadir|originCity|2026-10-10')!.has('a')).toBe(false)
    expect(entries.get('Agadir|destinationCity|2026-10-10')!.get('a').status).toBe('Retourné')
    expect(entries.get('Casablanca|destinationCity|2026-10-10')!.has('a')).toBe(false)
    expect(entries.get('*|createdAt|2026-10-10')!.has('a')).toBe(true)
  })

  it('nouvelle expédition d\'une journée gardée : ajoutée ; autre journée : ignorée', () => {
    const entries = build()
    applyChangedParcels(entries, [exp('b', 'Rabat', 'Agadir', D10), exp('c', 'Rabat', 'Agadir', D11)])
    expect(entries.get('Agadir|destinationCity|2026-10-10')!.has('b')).toBe(true)
    expect(entries.get('Agadir|destinationCity|2026-10-10')!.has('c')).toBe(false)
    expect(entries.get('*|createdAt|2026-10-10')!.has('b')).toBe(true)
    expect(entries.get('*|createdAt|2026-10-11')!.has('c')).toBe(true)
  })

  it('aucune modification : rien de touché', () => {
    expect(applyChangedParcels(build(), []).size).toBe(0)
  })
})

describe('villes présentes / oubli d\'une ville', () => {
  it('liste les villes et détecte « toutes villes »', () => {
    const r = citiesInCache(['Agadir|originCity|2026-10-10', 'Agadir|destinationCity|2026-10-10', 'Rabat|originCity|2026-10-09'])
    expect(r.cities.sort()).toEqual(['Agadir', 'Rabat'])
    expect(r.hasAllCities).toBe(false)
    expect(citiesInCache(['*|createdAt|2026-10-10']).hasAllCities).toBe(true)
    expect(citiesInCache(['*|createdAt|2026-10-10']).cities).toEqual([])
  })

  it('n\'oublie que les journées de la ville (pas une ville au nom préfixe)', () => {
    const m = new Map<string, any>([
      ['Agadir|originCity|2026-10-10', 1], ['Agadir|destinationCity|2026-10-10', 1],
      ['Agadir2|originCity|2026-10-10', 1], ['*|createdAt|2026-10-10', 1],
    ])
    expect(dropCityEntries(m, 'Agadir').sort()).toEqual(['Agadir|destinationCity|2026-10-10', 'Agadir|originCity|2026-10-10'])
    expect([...m.keys()].sort()).toEqual(['*|createdAt|2026-10-10', 'Agadir2|originCity|2026-10-10'])
    expect(dropCityEntries(m, ALL_CITIES)).toEqual(['*|createdAt|2026-10-10'])
  })
})

describe('sérialisation IndexedDB', () => {
  const dec = { timestamp: (s: number, ns: number) => new FakeTs(s, ns) }

  it('aller-retour : Timestamp recréé (méthodes comprises), dates, tableaux, objets imbriqués', () => {
    const p = {
      id: 'a', price: 35, isArchived: false, note: null,
      createdAt: new FakeTs(1760090400, 123000000),
      receiver: { city: 'Agadir', name: 'X', at: new FakeTs(5, 0) },
      tags: ['a', 1, new FakeTs(7, 0)],
      when: new Date(1760090400000),
      fn: () => 1,
    }
    const enc = encodeLiteValue(p)
    expect(JSON.parse(JSON.stringify(enc))).toEqual(enc) // valeur « plate », clonable
    expect(enc.fn).toBeUndefined()
    const back = decodeLiteValue(enc, dec)
    expect(back.createdAt).toBeInstanceOf(FakeTs)
    expect(back.createdAt.toMillis()).toBe(p.createdAt.toMillis())
    expect(back.receiver.at.seconds).toBe(5)
    expect(back.tags[2].seconds).toBe(7)
    expect(back.when).toBeInstanceOf(Date)
    expect(back.when.getTime()).toBe(1760090400000)
    expect(back.price).toBe(35)
    expect(back.note).toBeNull()
    expect(back.receiver.city).toBe('Agadir')
  })

  it('GeoPoint et référence', () => {
    const geo = { latitude: 30.4, longitude: -9.6, isEqual: () => true }
    const ref = { path: 'parcels/a', firestore: {} }
    const back = decodeLiteValue(encodeLiteValue({ g: geo, r: ref }), { ...dec, geoPoint: (a, b) => ({ lat: a, lng: b }) })
    expect(back.g).toEqual({ lat: 30.4, lng: -9.6 })
    expect(back.r).toBe('parcels/a')
  })
})

describe('journées enregistrées (selectPersistableKeys)', () => {
  it('jamais la journée en cours ni à venir, au plus N jours, les plus récentes d\'abord sous plafond', () => {
    const today = '2026-10-12'
    const sizes: [string, number][] = [
      ['Agadir|originCity|2026-10-12', 10],      // journée en cours → jamais
      ['Agadir|originCity|2026-10-13', 10],      // à venir → jamais
      ['Agadir|originCity|2026-10-11', 50],
      ['*|createdAt|2026-10-11', 100],
      ['Agadir|originCity|2026-10-01', 60],
      ['Agadir|originCity|2026-08-01', 5],       // plus de 45 jours → non
    ]
    expect(selectPersistableKeys(sizes, today).sort()).toEqual(['*|createdAt|2026-10-11', 'Agadir|originCity|2026-10-01', 'Agadir|originCity|2026-10-11'])
    // Plafond de 160 expéditions : la plus ancienne (60) ne tient plus
    expect(selectPersistableKeys(sizes, today, 45, 160).sort()).toEqual(['*|createdAt|2026-10-11', 'Agadir|originCity|2026-10-11'])
  })

  it('shiftDay franchit les mois', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})
