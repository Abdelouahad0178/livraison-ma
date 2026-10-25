import { describe, expect, it } from 'vitest'
import { canBulkLoadTransport, canBulkAssignDelivery, deliverySelectionGroups } from './parcelBulkSelection'

const shipment = (id: string, originCity = 'Agadir', destinationCity = 'Agadir', status = 'Initialisé') => ({ id, originCity, createdByCity: originCity, destinationCity, status })

describe.each(['chef_agence', 'agentpro'])('%s bulk selection', role => {
  const profile = { role, city: 'Agadir' }
  const local = shipment('local')
  const outgoing = shipment('outgoing', 'Agadir', 'Rabat')
  const incoming = shipment('incoming', 'Rabat', 'Agadir', 'Arrivé en agence')
  const foreign = shipment('foreign', 'Rabat', 'Casablanca', 'Initialisé')

  it('loads only initialized shipments created in its own agency', () => {
    expect([local, outgoing, incoming, foreign].filter(p => canBulkLoadTransport(profile, p)).map(p => p.id)).toEqual(['local', 'outgoing'])
    expect(canBulkLoadTransport(profile, { ...local, createdByCity: 'Rabat' })).toBe(false)
    expect(canBulkLoadTransport(profile, { ...outgoing, status: 'Arrivé en agence' })).toBe(false)
  })
  it('never reloads arrived, archived, delivered or returned shipments with an outdated initialized status', () => {
    for (const extra of [{ destinationArrivedAt: 'date' }, { chefPointedAt: 'date' }, { deliveredAt: 'date' }, { returnedAt: 'date' }, { isArchived: true }, { wasReturned: true }]) {
      expect(canBulkLoadTransport(profile, { ...outgoing, ...extra })).toBe(false)
    }
  })
  it('keeps destination delivery rights while separating initial entries and received shipments', () => {
    const assignable = [local, outgoing, incoming, foreign].filter(p => canBulkAssignDelivery(profile, p))
    expect(assignable.map(p => p.id)).toEqual(['local', 'incoming'])
    expect(deliverySelectionGroups(assignable).map(group => group.parcels.map(p => p.id))).toEqual([['local'], ['incoming']])
    expect(canBulkAssignDelivery(profile, shipment('not-arrived', 'Rabat', 'Agadir'))).toBe(false)
    expect(canBulkAssignDelivery(profile, shipment('already-delivered', 'Rabat', 'Agadir', 'Livré'))).toBe(false)
    expect(canBulkAssignDelivery(profile, shipment('returning', 'Rabat', 'Agadir', 'Retour en transit'))).toBe(false)
  })
  it('uses authoritative cities, supports legacy city fields and fails closed without a city', () => {
    expect(canBulkLoadTransport(profile, { ...outgoing, originCity: 'Rabat', sender: { city: 'Agadir' } })).toBe(false)
    expect(canBulkLoadTransport(profile, { id: 'legacy', sender: { city: 'Agadir' }, status: 'Initialisé' })).toBe(true)
    expect(canBulkAssignDelivery(profile, { ...incoming, destinationCity: 'Casablanca', receiver: { city: 'Agadir' } })).toBe(false)
    expect(canBulkLoadTransport({ role }, outgoing)).toBe(false)
    expect(canBulkAssignDelivery({ role }, incoming)).toBe(false)
    expect(canBulkLoadTransport(profile, null)).toBe(false)
  })
})

it('preserves admin transport and keeps unsupported roles out of agency bulk actions', () => {
  expect(canBulkLoadTransport({ role: 'admin' }, shipment('foreign', 'Rabat', 'Casablanca'))).toBe(true)
  expect(canBulkLoadTransport({ role: 'chef_agence', realRole: 'admin', city: 'Agadir' }, shipment('foreign', 'Rabat', 'Casablanca'))).toBe(true)
  expect(canBulkLoadTransport({ role: 'aide_agent', city: 'Agadir' }, shipment('local'))).toBe(false)
})
