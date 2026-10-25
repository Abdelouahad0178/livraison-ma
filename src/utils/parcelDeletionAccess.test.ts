import { describe, expect, it } from 'vitest'
import { agencyCanDeleteParcel } from './parcelDeletionAccess'

const source = { createdByCity: 'Casablanca', originCity: 'Casablanca', destinationCity: 'Agadir', status: 'Initialisé', agentId: 'colleague' }
const received = { ...source, createdByCity: 'Agadir', originCity: 'Agadir', destinationCity: 'Casablanca', agentId: 'self', destinationAgentId: 'self' }

describe.each(['agentpro', 'chef_agence'])('%s shipment deletion', role => {
  const profile = { role, city: 'Casablanca' }
  it('allows shipments created by another account in the same agency', () => {
    expect(agencyCanDeleteParcel(profile, source)).toBe(true)
  })
  it('denies received shipments even when the agent is recorded as owner or delivery agent', () => {
    expect(agencyCanDeleteParcel(profile, received)).toBe(false)
    expect(agencyCanDeleteParcel(profile, { ...received, sender: { city: 'Casablanca' } })).toBe(false)
  })
  it('uses the original creation city after return cities are swapped', () => {
    const returned = { ...source, originCity: 'Agadir', destinationCity: 'Casablanca', wasReturned: true, status: 'Arrivé en agence' }
    expect(agencyCanDeleteParcel(profile, returned)).toBe(true)
    expect(agencyCanDeleteParcel({ ...profile, city: 'Agadir' }, returned)).toBe(false)
    expect(agencyCanDeleteParcel(profile, { ...returned, createdByCity: undefined, preReturn: { originCity: 'Casablanca' } })).toBe(true)
  })
  it('handles legacy parcels and fails closed without a creation agency or actor city', () => {
    expect(agencyCanDeleteParcel(profile, { ...source, createdByCity: undefined })).toBe(true)
    expect(agencyCanDeleteParcel(profile, { ...received, createdByCity: undefined })).toBe(false)
    expect(agencyCanDeleteParcel(profile, { status: 'Initialisé' })).toBe(false)
    expect(agencyCanDeleteParcel({ role }, source)).toBe(false)
    expect(agencyCanDeleteParcel(profile, null)).toBe(false)
  })
  it('keeps loaded and finalized shipments protected in their creation agency', () => {
    expect(agencyCanDeleteParcel(profile, { ...source, shipmentLoadedAt: '2026-10-25' })).toBe(false)
    for (const status of ['Livré', 'Retourné', 'Retour en transit']) {
      expect(agencyCanDeleteParcel(profile, { ...source, status })).toBe(false)
    }
  })
})

it('preserves the separate policies of other roles and the real admin in agency mode', () => {
  expect(agencyCanDeleteParcel({ role: 'admin' }, received)).toBe(true)
  expect(agencyCanDeleteParcel({ role: 'agentpro', realRole: 'admin', city: 'Casablanca' }, received)).toBe(true)
  expect(agencyCanDeleteParcel({ role: 'chef_exploitation', city: 'Casablanca' }, received)).toBe(true)
})
