import { describe, it, expect } from 'vitest'
import { portTypeChangeBlock } from './portTypeGuard'

describe('portTypeChangeBlock — type de port d’une expédition encaissée', () => {
  it('port dû encaissé → « en compte » : refusé (cas 1238392)', () => {
    expect(portTypeChangeBlock({ senderNic: '1238392', portType: 'port_du', portStatus: 'collected', portCollectedBy: 'ZINEBE' }, 'port_en_compte_destinataire')).toMatch(/déjà encaissé/)
  })
  it('port dû non encaissé → « en compte » : permis', () => {
    expect(portTypeChangeBlock({ portType: 'port_du', portStatus: null }, 'port_en_compte_destinataire')).toBeNull()
  })
  it('port dû encaissé → port dû chèque : permis (reste un port dû)', () => {
    expect(portTypeChangeBlock({ portType: 'port_du', portStatus: 'collected' }, 'port_du_cheque')).toBeNull()
  })
  it('port payé reçu → « en compte expéditeur » : refusé (cas 1083287D)', () => {
    expect(portTypeChangeBlock({ portType: 'port_paye', portStatus: 'received' }, 'port_en_compte_expediteur')).toMatch(/port payé/)
  })
  it('port payé encaissé au guichet, pas encore remis → changement permis (encaissement retiré par portTypeChangeFields)', () => {
    expect(portTypeChangeBlock({ portType: 'port_paye', portStatus: 'collected' }, 'port_du')).toBeNull()
  })
  it('même type : rien à refuser', () => {
    expect(portTypeChangeBlock({ portType: 'port_du', portStatus: 'collected' }, 'port_du')).toBeNull()
  })
})
