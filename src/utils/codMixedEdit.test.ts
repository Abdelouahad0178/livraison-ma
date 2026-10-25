import { describe, it, expect } from 'vitest'
import { sanitizeParcelCodWrite } from '../firebase/constants'
import { docPartKeepingTotal, mixedSplitLockReason } from './codParts'

describe('RF mixte — modification (correction 1, 21/10/2026)', () => {
  it('garde-fou : un mixte enregistré SANS changer le type de service est conservé', () => {
    const d = sanitizeParcelCodWrite({ codMixed: true, codCashAmount: 1000, codAmount: 5000 })
    expect(d).toMatchObject({ codMixed: true, codCashAmount: 1000, codAmount: 5000 })
  })
  it('garde-fou : type connu en base (chèque) → conservé ; espèces → annulé', () => {
    expect(sanitizeParcelCodWrite({ codMixed: true, codCashAmount: 1000 }, 'cheque')).toMatchObject({ codMixed: true, codCashAmount: 1000 })
    expect(sanitizeParcelCodWrite({ codMixed: true, codCashAmount: 1000 }, 'especes')).toMatchObject({ codMixed: false, codCashAmount: 0 })
    expect(sanitizeParcelCodWrite({ serviceType: 'especes', codMixed: true, codCashAmount: 1000 })).toMatchObject({ codMixed: false, codCashAmount: 0 })
  })
  it('garde-fou : part espèces ≥ total ou nulle → annulé', () => {
    expect(sanitizeParcelCodWrite({ codMixed: true, codCashAmount: 5000, codAmount: 5000 })).toMatchObject({ codMixed: false })
    expect(sanitizeParcelCodWrite({ codMixed: true, codCashAmount: 0, codAmount: 5000 })).toMatchObject({ codMixed: false })
  })
  it('saisie des espèces : retirées du chèque, total inchangé', () => {
    expect(docPartKeepingTotal('5000', '', '1000')).toBe('4000')
    expect(docPartKeepingTotal('4000', '1000', '1500')).toBe('3500')
    expect(docPartKeepingTotal('4000', '1000', '')).toBe('5000')
    expect(docPartKeepingTotal('100', '', '500')).toBe('0')
  })
  it('blocage : COD déjà remis / réglé / versé', () => {
    expect(mixedSplitLockReason({ codStatus: 'collected' })).toBe('')
    expect(mixedSplitLockReason({ codStatus: 'pending' })).toBe('')
    expect(mixedSplitLockReason({ codStatus: 'remis' })).not.toBe('')
    expect(mixedSplitLockReason({ codStatus: 'collected', codSenderPaid: true })).not.toBe('')
  })
})
