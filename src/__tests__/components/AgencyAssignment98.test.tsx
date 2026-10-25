// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import BulkDeliverySelection from '../../pages/agent/components/BulkDeliverySelection'
import { useAgencyBulkAssignment } from '../../pages/agent/hooks/useAgencyBulkAssignment'
import { pickupAssignmentUpdates } from '../../utils/parcelBulkSelection'

afterEach(cleanup)
const outgoing = Array.from({ length: 17 }, (_, i) => ({ id: `initial-${i}`, originCity: 'Agadir', createdByCity: 'Agadir', destinationCity: 'Casablanca', status: 'Initialisé' }))
const incoming = Array.from({ length: 98 }, (_, i) => ({ id: `received-${i}`, originCity: 'Casablanca', createdByCity: 'Casablanca', destinationCity: 'Agadir', status: 'Arrivé en agence' }))
const all = [...outgoing, ...incoming]

function Harness({ role = 'agentpro', rows = all }) {
  const [pickupIds, setPickupIds] = useState(new Set<string>())
  const [deliveryIds, setDeliveryIds] = useState(incoming.map(p => p.id))
  const [, setTransportIds] = useState<string[]>([])
  const a = useAgencyBulkAssignment({ profile: { role, city: 'Agadir' }, parcels: rows, pickupIds, deliveryIds, setPickupIds, setDeliveryIds, setTransportIds })
  return <>
    <button onClick={() => a.setMode('pickup')}>Ramassage</button>
    <button onClick={() => a.setMode('delivery')}>Livraison</button>
    <BulkDeliverySelection parcels={a.parcels} selectedIds={a.ids} onChange={a.select} />
    <output aria-label="active-mode">{a.mode}</output>
    <output aria-label="selected-count">{a.ids.length}</output>
    <output aria-label="pickup-count">{pickupIds.size}</output>
    <output aria-label="delivery-count">{deliveryIds.length}</output>
    {all.map(p => <input key={p.id} aria-label={p.id} type="checkbox" checked={a.selected.has(p.id)} readOnly />)}
  </>
}

describe.each(['chef_agence', 'agentpro'])('%s reported 98-shipment case', role => {
  it('defaults to the 17 outgoing initialized shipments and never checks the 98 received ones', () => {
    render(<Harness role={role} />)
    expect(screen.getByLabelText('active-mode')).toHaveTextContent('pickup')
    expect(screen.getByLabelText('delivery-count')).toHaveTextContent(/^0$/)
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les initialisées (17)' }))
    expect(screen.getByLabelText('selected-count')).toHaveTextContent(/^17$/)
    expect(screen.getByLabelText('pickup-count')).toHaveTextContent(/^17$/)
    for (const p of outgoing) expect(screen.getByRole('checkbox', { name: p.id })).toBeChecked()
    for (const p of incoming) expect(screen.getByRole('checkbox', { name: p.id })).not.toBeChecked()
  })
  it('requires an explicit switch for destination delivery and clears selection on every switch', () => {
    render(<Harness role={role} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les initialisées (17)' }))
    fireEvent.click(screen.getByRole('button', { name: /^Livraison$/ }))
    expect(screen.getByLabelText('selected-count')).toHaveTextContent(/^0$/)
    expect(screen.getByLabelText('pickup-count')).toHaveTextContent(/^0$/)
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les autres statuts (98)' }))
    expect(screen.getByLabelText('delivery-count')).toHaveTextContent(/^98$/)
    for (const p of outgoing) expect(screen.getByRole('checkbox', { name: p.id })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /^Ramassage$/ }))
    expect(screen.getByLabelText('selected-count')).toHaveTextContent(/^0$/)
    expect(screen.getByLabelText('delivery-count')).toHaveTextContent(/^0$/)
  })
  it('keeps the pickup selection empty when only received shipments match the filters', () => {
    render(<Harness role={role} rows={incoming} />)
    expect(screen.getByLabelText('active-mode')).toHaveTextContent('pickup')
    expect(screen.queryByRole('button', { name: /Sélectionner les autres statuts/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('selected-count')).toHaveTextContent(/^0$/)
  })
  it('writes pickup fields without assigning the destination delivery driver', () => {
    const profile = { role, city: 'Agadir', name: 'Agence' }
    const driver = { id: 'pickup-driver', name: 'Livreur local', city: 'Agadir' }
    const update = pickupAssignmentUpdates(profile, outgoing[0], driver, new Date('2026-10-25T18:00:00Z'))
    expect(update).toMatchObject({ pickupDriverId: driver.id, status: 'En cours de ramassage' })
    expect(update).not.toHaveProperty('deliveryDriverId')
    expect(update).not.toHaveProperty('deliveryDriverName')
    expect(() => pickupAssignmentUpdates(profile, incoming[0], driver)).toThrow(/Ramassage/)
    expect(() => pickupAssignmentUpdates(profile, outgoing[0], { ...driver, city: 'Rabat' })).toThrow(/Ramassage/)
  })
})
