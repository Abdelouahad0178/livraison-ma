import { describe, expect, it } from 'vitest'
import { agencyCanDeliver, agencyCanTransport, deliveryStatusChangeBlock } from './agencyDeliveryAccess'

const outgoing = { originCity: 'Casablanca', destinationCity: 'Agadir', status: 'Arrivé en agence', agentId: 'same-account', destinationArrivedAt: '2026-10-25T12:00:00Z' }

describe.each(['chef_agence', 'agentpro'])('%s destination responsibility', role => {
  const source = { role, city: 'Casablanca' }, destination = { role, city: 'Agadir' }
  it('denies delivery and status rollback at the source after arrival', () => {
    expect(agencyCanDeliver(source, outgoing)).toBe(false)
    for (const status of ['Livré', 'En cours de livraison', 'En transit', 'Initialisé', 'Retourné']) {
      expect(deliveryStatusChangeBlock(source, outgoing, status)).toMatch(/Agadir/)
    }
  })
  it('also denies cancellation of a completed delivery at the source', () => {
    expect(deliveryStatusChangeBlock(source, { ...outgoing, status: 'Livré' }, 'En cours de livraison')).toMatch(/Agadir/)
  })
  it('allows delivery at the destination and for local shipments', () => {
    expect(agencyCanDeliver(destination, outgoing)).toBe(true)
    expect(deliveryStatusChangeBlock(destination, outgoing, 'Livré')).toBeNull()
    expect(agencyCanDeliver(source, { ...outgoing, destinationCity: 'Casablanca' })).toBe(true)
  })
  it('keeps departure transport available before arrival', () => {
    const beforeArrival = { ...outgoing, status: 'Initialisé', destinationArrivedAt: null }
    expect(agencyCanTransport(source, beforeArrival)).toBe(true)
    expect(deliveryStatusChangeBlock(source, beforeArrival, 'En transit')).toBeNull()
    expect(deliveryStatusChangeBlock(source, beforeArrival, 'Arrivé en agence')).toMatch(/Agadir/)
    expect(deliveryStatusChangeBlock(source, { ...beforeArrival, chefPointedAt: '2026-10-25' }, 'En transit')).toMatch(/Agadir/)
  })
  it('keeps return transport with its departure agency and return completion with its destination', () => {
    const returned = { ...outgoing, wasReturned: true, originCity: 'Agadir', destinationCity: 'Casablanca', status: 'Retourné' }
    expect(deliveryStatusChangeBlock(destination, returned, 'Retour en transit')).toBeNull()
    expect(deliveryStatusChangeBlock(destination, returned, 'Retour finalisé')).toMatch(/Casablanca/)
    expect(deliveryStatusChangeBlock(source, returned, 'Retour finalisé')).toBeNull()
  })
  it('fails closed when the agency city or parcel destination is missing', () => {
    expect(agencyCanDeliver({ role }, outgoing)).toBe(false)
    expect(agencyCanDeliver(source, { status: 'Arrivé en agence' })).toBe(false)
    expect(deliveryStatusChangeBlock({ role }, outgoing, 'Livré')).toMatch(/Agadir/)
  })
})

it('preserves admin, real admin in agency mode, and other operational roles', () => {
  for (const profile of [{ role: 'admin' }, { role: 'agentpro', realRole: 'admin' }, { role: 'chef_exploitation', city: 'Casablanca' }, { role: 'livreur', city: 'Casablanca' }]) {
    expect(agencyCanDeliver(profile, outgoing)).toBe(true)
    expect(deliveryStatusChangeBlock(profile, outgoing, 'Livré')).toBeNull()
  }
})
