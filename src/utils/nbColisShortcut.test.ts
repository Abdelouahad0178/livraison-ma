import { describe, it, expect } from 'vitest'
import { parseNbColisShortcut, analyzeNbColisShortcut, nbColisDigitsOnly } from './nbColisShortcut'
import { buildCityInitialsMap, matchCityInitials } from './cityInitials'

describe('parseNbColisShortcut — port', () => {
  it('port dû', () => {
    expect(parseNbColisShortcut('2ds45')).toEqual({ nbColis: '2', portType: 'port_du', amount: '45' })
  })
  it('port payé', () => {
    expect(parseNbColisShortcut('3ps40')).toEqual({ nbColis: '3', portType: 'port_paye', amount: '40' })
  })
  it('port dû chèque', () => {
    expect(parseNbColisShortcut('2dc45')).toEqual({ nbColis: '2', portType: 'port_du_cheque', amount: '45' })
  })
  it('compte expéditeur / destinataire', () => {
    expect(parseNbColisShortcut('2ce45')).toEqual({ nbColis: '2', portType: 'port_en_compte_expediteur', amount: '45' })
    expect(parseNbColisShortcut('2cd45')).toEqual({ nbColis: '2', portType: 'port_en_compte_destinataire', amount: '45' })
  })
  it('compat : s optionnel (2d45 / 2p45)', () => {
    expect(parseNbColisShortcut('2d45')).toEqual({ nbColis: '2', portType: 'port_du', amount: '45' })
    expect(parseNbColisShortcut('2p45')).toEqual({ nbColis: '2', portType: 'port_paye', amount: '45' })
  })
  it('majuscules, espaces, virgule, dh', () => {
    expect(parseNbColisShortcut(' 2 DS 45,5 dh')).toEqual({ nbColis: '2', portType: 'port_du', amount: '45.5' })
  })
  it('sans nombre → 1 colis, s optionnel', () => {
    expect(parseNbColisShortcut('d30')).toEqual({ nbColis: '1', portType: 'port_du', amount: '30' })
  })
  it('rangée AZERTY sans Maj', () => {
    expect(parseNbColisShortcut('éds\'(')).toEqual({ nbColis: '2', portType: 'port_du', amount: '45' })
    expect(parseNbColisShortcut('éds\'(e(àà')?.cod?.codAmount).toBe('500')
  })
  it('pas un raccourci', () => {
    expect(parseNbColisShortcut('245')).toBeNull()
    expect(parseNbColisShortcut('2ds')).toBeNull()
    expect(parseNbColisShortcut('2ds0')).toBeNull()
    expect(parseNbColisShortcut('')).toBeNull()
    expect(analyzeNbColisShortcut('12')).toBeNull()
    expect(nbColisDigitsOnly('2a5')).toBe('25')
  })
})

describe('parseNbColisShortcut — retour de fonds', () => {
  it('espèces seules', () => {
    expect(parseNbColisShortcut('2ds45e500')?.cod).toEqual({ serviceType: 'especes', codAmount: '500', codMixed: false, codCashAmount: '', total: '500' })
  })
  it('chèque seul', () => {
    expect(parseNbColisShortcut('2ds45c1200')?.cod).toEqual({ serviceType: 'cheque', codAmount: '1200', codMixed: false, codCashAmount: '', total: '1200' })
  })
  it('traite seule', () => {
    expect(parseNbColisShortcut('2ds45t3000')?.cod).toEqual({ serviceType: 'traite', codAmount: '3000', codMixed: false, codCashAmount: '', total: '3000' })
  })
  it('mixte espèces + chèque (codAmount = part document, comme le formulaire)', () => {
    expect(parseNbColisShortcut('2ds45e200c800')).toEqual({
      nbColis: '2', portType: 'port_du', amount: '45',
      cod: { serviceType: 'cheque', codAmount: '800', codMixed: true, codCashAmount: '200', total: '1000' },
    })
  })
  it('mixte : ordre libre, traite', () => {
    expect(parseNbColisShortcut('2ds45t800e200')?.cod).toEqual({ serviceType: 'traite', codAmount: '800', codMixed: true, codCashAmount: '200', total: '1000' })
  })
  it('espaces et majuscules', () => {
    expect(parseNbColisShortcut('2 DS 45 E 500')).toEqual({
      nbColis: '2', portType: 'port_du', amount: '45',
      cod: { serviceType: 'especes', codAmount: '500', codMixed: false, codCashAmount: '', total: '500' },
    })
  })
  it('décimales', () => {
    expect(parseNbColisShortcut('2ds45e200,5c100')?.cod?.total).toBe('300.5')
  })
  it('chèque + traite → erreur', () => {
    const r = analyzeNbColisShortcut('2ds45c100t200')
    expect(r?.error).toMatch(/Chèque et traite/)
    expect(parseNbColisShortcut('2ds45c100t200')).toBeNull()
    expect(analyzeNbColisShortcut('2ds45e1c100t200')?.error).toBeTruthy()
  })
  it('doublon / montant nul / reste invalide → erreur', () => {
    expect(analyzeNbColisShortcut('2ds45e1e2')?.error).toBeTruthy()
    expect(analyzeNbColisShortcut('2ds45e0')?.error).toBeTruthy()
    expect(analyzeNbColisShortcut('2ds45e')?.error).toBeTruthy()
    expect(analyzeNbColisShortcut('2ds45x')?.error).toBeTruthy()
  })
})

describe('parseNbColisShortcut — nature et poids', () => {
  it('palette / bagages', () => {
    expect(parseNbColisShortcut('2ds45p')).toEqual({ nbColis: '2', portType: 'port_du', amount: '45', nature: 'Palette' })
    expect(parseNbColisShortcut('2ps45b')?.nature).toBe('Bagages')
    expect(parseNbColisShortcut('2p45p')).toEqual({ nbColis: '2', portType: 'port_paye', amount: '45', nature: 'Palette' })
  })
  it('« ps » reste un code port, pas une nature', () => {
    expect(parseNbColisShortcut('2ps45')).toEqual({ nbColis: '2', portType: 'port_paye', amount: '45' })
  })
  it('poids', () => {
    expect(parseNbColisShortcut('2ds45k8')?.weight).toBe('8')
    expect(parseNbColisShortcut('2ds45k2,5kg')?.weight).toBe('2.5')
    expect(analyzeNbColisShortcut('2ds45k0')?.error).toBeTruthy()
  })
  it('combinaison complète', () => {
    expect(parseNbColisShortcut('3ds45c1500k8')).toEqual({
      nbColis: '3', portType: 'port_du', amount: '45', weight: '8',
      cod: { serviceType: 'cheque', codAmount: '1500', codMixed: false, codCashAmount: '', total: '1500' },
    })
    expect(parseNbColisShortcut('2CE45E200T800BK12')).toEqual({
      nbColis: '2', portType: 'port_en_compte_expediteur', amount: '45', nature: 'Bagages', weight: '12',
      cod: { serviceType: 'traite', codAmount: '800', codMixed: true, codCashAmount: '200', total: '1000' },
    })
  })
  it('deux natures → erreur', () => {
    expect(analyzeNbColisShortcut('2ds45pb')?.error).toBeTruthy()
  })
})

describe('cityInitials', () => {
  const map = buildCityInitialsMap(['Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Guelmim', 'Ait Melloul'])
  it('codes', () => {
    expect(map).toEqual({ C: 'Casablanca', R: 'Rabat', A: 'Agadir', M: 'Marrakech', G: 'Guelmim', AA: 'Ait Melloul' })
  })
  it('A = Agadir, puis A = Ait Melloul, puis A = Agadir', () => {
    let s = matchCityInitials(map, '', 'a')
    expect(s).toEqual({ buffer: 'A', city: 'Agadir' })
    s = matchCityInitials(map, s.buffer, 'a')
    expect(s).toEqual({ buffer: 'AA', city: 'Ait Melloul' })
    s = matchCityInitials(map, s.buffer, 'a')
    expect(s).toEqual({ buffer: 'A', city: 'Agadir' })
  })
  it('A puis M = Marrakech (nouvelle initiale)', () => {
    expect(matchCityInitials(map, 'A', 'm')).toEqual({ buffer: 'M', city: 'Marrakech' })
  })
  it('lettre inconnue', () => {
    expect(matchCityInitials(map, '', 'x')).toEqual({ buffer: '', city: null })
  })
})
