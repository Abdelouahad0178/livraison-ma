import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const { planAssignmentReset, createDestinationAssignmentHandler } = createRequire(import.meta.url)('../../functions/destinationAssignment.js')
const parcel = { destinationCity: 'Rabat', deliveryDriverId: 'old', deliveryDriverName: 'Driver', status: 'En cours de livraison' }
describe('delivery ownership after destination correction', () => {
  it('removes an old city driver and resets delivery readiness', () => {
    expect(planAssignmentReset(parcel, { city: 'Casablanca' }, null, 'now')).toMatchObject({ deliveryDriverId: null, status: 'Arrivé en agence' })
  })
  it('uses the new city gare account without choosing a delivery driver', () => {
    const p = { ...parcel, deliveryDriverName: 'En gare - Casablanca' }
    expect(planAssignmentReset(p, { role: 'livreur-gare', city: 'Casablanca' }, { id: 'gare-rabat' }, 'now')).toMatchObject({ deliveryDriverId: 'gare-rabat', deliveryDriverName: 'En gare - Rabat' })
  })
  it('preserves a valid destination driver and the existing shared city pair', () => {
    expect(planAssignmentReset(parcel, { city: 'Rabat' }, null, 'now')).toBeNull()
    expect(planAssignmentReset({ ...parcel, destinationCity: 'Agadir' }, { city: 'Ait Melloul' }, null, 'now')).toBeNull()
  })
  it('preserves delivered shipments, returns and collected money', () => {
    for (const extra of [{ status: 'Livré' }, { status: 'Retourné' }, { codAmount: 100, codStatus: 'collected' }, { portType: 'port_du', portStatus: 'collected' }]) {
      expect(planAssignmentReset({ ...parcel, ...extra }, { city: 'Casablanca' }, null, 'now')).toBeNull()
    }
  })
  it('ignores events without a destination change', async () => {
    const db = { doc: vi.fn() }
    const handler = createDestinationAssignmentHandler(db, {})
    await handler({ data: { before: { data: () => parcel }, after: { data: () => parcel } } })
    expect(db.doc).not.toHaveBeenCalled()
  })
  it('preserves a newer assignment made while the event was pending', async () => {
    const tx = { get: vi.fn(async () => ({ data: () => ({ ...parcel, deliveryDriverId: 'new-choice' }) })), update: vi.fn() }
    const query = { where: () => query, limit: () => query, get: async () => ({ empty: true }) }
    const db = { doc: () => ({ get: async () => ({ data: () => ({ city: 'Casablanca' }) }) }), collection: () => query, runTransaction: (fn: any) => fn(tx) }
    const handler = createDestinationAssignmentHandler(db, { arrayUnion: vi.fn() })
    await handler({ data: { before: { data: () => ({ ...parcel, destinationCity: 'Casablanca' }) }, after: { data: () => parcel, ref: {} } } })
    expect(tx.update).not.toHaveBeenCalled()
  })
})
