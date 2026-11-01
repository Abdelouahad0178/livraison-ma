import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { citiesLeft } = require('../../functions/parcelLite.js')

// 🪦 Traces parcelsLiteGone (syncParcelLite) : villes que l'expédition a QUITTÉES
describe('citiesLeft — villes quittées par une expédition', () => {
  const p = { originCity: 'Casablanca', destinationCity: 'Agadir' }
  it('supprimée / archivée : toutes ses villes', () => {
    expect(citiesLeft(p, null).sort()).toEqual(['Agadir', 'Casablanca'])
  })
  it('destination changée (Agadir → Ait Melloul) : seulement Agadir', () => {
    expect(citiesLeft(p, { ...p, destinationCity: 'Ait Melloul' })).toEqual(['Agadir'])
  })
  it('villes inchangées, ou ville restée par l\'autre champ : rien', () => {
    expect(citiesLeft(p, { ...p, status: 'Livré' })).toEqual([])
    expect(citiesLeft(p, { originCity: 'Agadir', destinationCity: 'Casablanca' })).toEqual([])
  })
  it('création (pas de version précédente) : rien ; même ville des deux côtés : une seule trace', () => {
    expect(citiesLeft(null, p)).toEqual([])
    expect(citiesLeft({ originCity: 'Agadir', destinationCity: 'Agadir' }, null)).toEqual(['Agadir'])
  })
})
