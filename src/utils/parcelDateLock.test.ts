import { describe, it, expect } from 'vitest'
import { isParcelDateLocked, parcelDateLockMessage } from './parcelDateLock'

describe('Date d’expédition verrouillée à destination', () => {
  it.each(['Arrivé en agence', 'En cours de livraison', 'Livré'])('« %s » : verrouillée', status => {
    expect(isParcelDateLocked({ status })).toBe(true)
  })
  it.each(['Initialisé', 'En cours de ramassage', 'En transit'])('« %s » : modifiable', status => {
    expect(isParcelDateLocked({ status })).toBe(false)
  })
  it('message clair avec le N° EXP et le statut', () => {
    expect(parcelDateLockMessage({ senderNic: '1225005', status: 'Livré' })).toMatch(/1225005.*Livré.*admin/)
  })
})
