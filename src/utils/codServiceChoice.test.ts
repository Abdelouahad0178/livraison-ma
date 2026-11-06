import { describe, it, expect } from 'vitest'
import { applyServiceChoice, serviceChoiceOf, buildCodWriteFields } from './codParts'

describe('Type de service « chèque + espèces » (page Admin)', () => {
  it('le choix de la liste suit le formulaire', () => {
    expect(serviceChoiceOf({ serviceType: 'cheque', codMixed: true })).toBe('cheque+especes')
    expect(serviceChoiceOf({ serviceType: 'traite', codMixed: true })).toBe('traite+especes')
    expect(serviceChoiceOf({ serviceType: 'cheque', codMixed: false })).toBe('cheque')
    expect(serviceChoiceOf({ serviceType: 'especes', codMixed: true })).toBe('especes')
  })
  it('chèque → chèque + espèces : le chèque garde le montant, espèces à saisir', () => {
    const f = applyServiceChoice({ serviceType: 'cheque', codAmount: '1000', codMixed: false, codCashAmount: '' }, 'cheque+especes')
    expect(f).toMatchObject({ serviceType: 'cheque', codMixed: true, codAmount: '1000', codCashAmount: '' })
  })
  it('avec un signalement de l\'encaisseur : chèque reçu et espèces repris', () => {
    const f = applyServiceChoice({ serviceType: 'cheque', codAmount: '1000', codMixed: false }, 'cheque+especes', { received: 750, cash: 250 })
    expect(f).toMatchObject({ codMixed: true, codAmount: '750', codCashAmount: '250' })
    // enregistré : total 1 000, part espèces 250
    expect(buildCodWriteFields({ serviceType: f.serviceType, codAmount: f.codAmount, cashAmount: f.codCashAmount, mixed: f.codMixed })).toEqual({ serviceType: 'cheque', codAmount: 1000, codMixed: true, codCashAmount: 250 })
  })
  it('retour à un seul type : il reprend le total chèque + espèces', () => {
    const f = applyServiceChoice({ serviceType: 'cheque', codAmount: '750', codMixed: true, codCashAmount: '250' }, 'especes')
    expect(f).toMatchObject({ serviceType: 'especes', codMixed: false, codAmount: '1000', codCashAmount: '' })
  })
  it('chèque + espèces → traite + espèces : montants gardés ; Simple → 0', () => {
    expect(applyServiceChoice({ serviceType: 'cheque', codAmount: '750', codMixed: true, codCashAmount: '250' }, 'traite+especes')).toMatchObject({ serviceType: 'traite', codAmount: '750', codCashAmount: '250', codMixed: true })
    expect(applyServiceChoice({ serviceType: 'cheque', codAmount: '750', codMixed: true, codCashAmount: '250' }, 'simple')).toMatchObject({ codAmount: '0', codMixed: false })
  })
})
