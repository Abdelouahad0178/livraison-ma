import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const { contributionOf } = createRequire(import.meta.url)('../../functions/commercial.js')

// ↩️ 01/11/2026 — gestion commerciale : une expédition retournée reste au client et à l'agence d'ORIGINE
const aller = {
  createdAt: '2026-10-20T10:00:00.000Z', status: 'Livré', price: 60, portType: 'port_paye', codAmount: 300, nbColis: 1,
  sender: { name: 'Société Étoile', city: 'Casablanca' }, senderNameNorm: 'societe etoile',
  receiver: { name: 'Karim', city: 'Agadir' }, originCity: 'Casablanca', destinationCity: 'Agadir', createdByCity: 'Casablanca',
}
// Ce que fait markParcelReturned : échange expéditeur ⇄ destinataire et villes, COD à 0, état d'avant dans preReturn
const retour = (p: any, withPre = true) => ({
  ...p, status: 'Retourné', sender: p.receiver, receiver: p.sender, senderNameNorm: 'karim',
  originCity: p.destinationCity, destinationCity: p.originCity, returnToCity: p.originCity, codAmount: 0, wasReturned: true,
  ...(withPre ? { preReturn: { sender: p.sender, receiver: p.receiver, originCity: p.originCity, destinationCity: p.destinationCity } } : {}),
})

describe('gestion commerciale — retours', () => {
  it('aller : client = expéditeur, agence = origine', () => {
    const c = contributionOf(aller)
    expect(c.meta).toMatchObject({ city: 'Casablanca', clientKey: 'societe etoile', clientName: 'Société Étoile' })
    expect(c.values).toMatchObject({ ca: 60, livres: 1, retours: 0 })
  })
  it('retourné : même client et même agence que l\'aller (mêmes documents de totaux)', () => {
    const a = contributionOf(aller), r = contributionOf(retour(aller))
    expect(r.targets).toEqual(a.targets)
    expect(r.meta).toMatchObject({ city: 'Casablanca', clientName: 'Société Étoile' })
    expect(r.values).toMatchObject({ ca: 60, livres: 0, retours: 1 })
  })
  it('ancien retour sans état d\'avant (preReturn) : échange inverse', () => {
    expect(contributionOf(retour(aller, false)).targets).toEqual(contributionOf(aller).targets)
  })
  it('tous les statuts de retour comptent comme retour', () => {
    for (const status of ['Retour en transit', 'Retour arrivé', 'Retour finalisé']) {
      expect(contributionOf({ ...retour(aller), status }).values.retours).toBe(1)
    }
  })
  it('retour annulé (wasReturned false, état d\'avant remis) : compté comme l\'aller', () => {
    expect(contributionOf({ ...aller, wasReturned: false, preReturn: null, returnToCity: null }).targets).toEqual(contributionOf(aller).targets)
  })
})
