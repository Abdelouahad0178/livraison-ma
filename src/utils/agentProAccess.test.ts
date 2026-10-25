import { describe, expect, it } from 'vitest'
import { agentProCanEditBon, agentProCanDeliver, agentProCanTransport, agentProReadOnly, parcelCreationCity } from './agentProAccess'

const profile = { role: 'agentpro', city: 'Casablanca' }
const shipment = (originCity: string, destinationCity: string, extra = {}) => ({ originCity, destinationCity, createdByCity: originCity, ...extra })
describe('Agent Pro city responsibilities', () => {
  it('keeps the source bon editable while reserving delivery and drivers for the destination', () => {
    const p = shipment('Casablanca', 'Agadir')
    expect(agentProCanEditBon(profile, p)).toBe(true)
    expect(agentProCanTransport(profile, p)).toBe(true)
    expect(agentProCanDeliver(profile, p)).toBe(false)
  })
  it('allows delivery of incoming parcels while keeping their bon read-only', () => {
    const p = shipment('Agadir', 'Casablanca')
    expect(agentProCanEditBon(profile, p)).toBe(false)
    expect(agentProCanDeliver(profile, p)).toBe(true)
    expect(agentProReadOnly(profile, p)).toBe(false)
  })
  it('makes unrelated cities entirely read-only even if the same agent created the parcel', () => {
    const p = shipment('Agadir', 'Rabat', { agentId: 'same-agent', sender: { city: 'Casablanca' } })
    expect(agentProCanEditBon(profile, p)).toBe(false)
    expect(agentProCanDeliver(profile, p)).toBe(false)
    expect(agentProReadOnly(profile, p)).toBe(true)
  })
  it('allows both responsibilities for a local shipment', () => {
    const p = shipment('Casablanca', 'Casablanca')
    expect(agentProCanEditBon(profile, p)).toBe(true)
    expect(agentProCanDeliver(profile, p)).toBe(true)
  })
  it('keeps the creation agency stable after a return swaps the current cities', () => {
    const p = shipment('Agadir', 'Casablanca', { createdByCity: 'Casablanca', wasReturned: true })
    expect(parcelCreationCity(p)).toBe('Casablanca')
    expect(agentProCanEditBon(profile, p)).toBe(true)
    expect(agentProCanDeliver(profile, p)).toBe(true)
  })
  it('fails closed when the agent has no city', () => {
    const p = shipment('Casablanca', 'Agadir')
    expect(agentProCanEditBon({ role: 'agentpro' }, p)).toBe(false)
    expect(agentProCanDeliver({ role: 'agentpro' }, p)).toBe(false)
    expect(agentProReadOnly({ role: 'agentpro' }, p)).toBe(true)
  })
  it('preserves the other roles and the real admin in the agency interface', () => {
    const p = shipment('Agadir', 'Rabat')
    expect(agentProCanEditBon({ role: 'admin' }, p)).toBe(true)
    expect(agentProCanDeliver({ role: 'chef_agence', city: 'Casablanca' }, p)).toBe(true)
    expect(agentProReadOnly({ role: 'agentpro', realRole: 'admin', city: 'Casablanca' }, p)).toBe(false)
  })
})
