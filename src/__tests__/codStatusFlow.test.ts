import { describe, it, expect } from 'vitest'

type CodStatus = 'pending' | 'collected' | 'remis'

function canCollectCod(parcel: { codStatus?: CodStatus | null; codAmount?: number }): boolean {
  if (!parcel.codAmount || parcel.codAmount <= 0) return false
  if (parcel.codStatus === 'collected' || parcel.codStatus === 'remis') return false
  return true
}

function canRemitCod(parcel: { codStatus?: CodStatus | null }): boolean {
  return parcel.codStatus === 'collected'
}

function canSettleCod(parcel: { codSenderPaid?: boolean; codStatus?: CodStatus | null }): boolean {
  if (parcel.codSenderPaid) return false
  return parcel.codStatus === 'remis' || parcel.codStatus === 'collected'
}

describe('COD status flow', () => {
  it('can collect a pending COD', () => {
    expect(canCollectCod({ codAmount: 500, codStatus: 'pending' })).toBe(true)
  })

  it('cannot collect an already collected COD', () => {
    expect(canCollectCod({ codAmount: 500, codStatus: 'collected' })).toBe(false)
  })

  it('cannot collect a remis COD', () => {
    expect(canCollectCod({ codAmount: 500, codStatus: 'remis' })).toBe(false)
  })

  it('cannot collect when codAmount is 0', () => {
    expect(canCollectCod({ codAmount: 0, codStatus: undefined })).toBe(false)
  })

  it('can remit after collected', () => {
    expect(canRemitCod({ codStatus: 'collected' })).toBe(true)
  })

  it('cannot remit a pending COD', () => {
    expect(canRemitCod({ codStatus: 'pending' })).toBe(false)
  })

  it('can settle after remis', () => {
    expect(canSettleCod({ codStatus: 'remis', codSenderPaid: false })).toBe(true)
  })

  it('cannot settle an already paid COD', () => {
    expect(canSettleCod({ codStatus: 'remis', codSenderPaid: true })).toBe(false)
  })
})
