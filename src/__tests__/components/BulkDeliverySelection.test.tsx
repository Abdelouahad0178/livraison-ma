// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import BulkDeliverySelection from '../../pages/agent/components/BulkDeliverySelection'
import { canBulkAssignDelivery } from '../../utils/parcelBulkSelection'

afterEach(cleanup)
const parcels = [
  { id: 'initial', status: 'Initialisé', createdByCity: 'Agadir', originCity: 'Agadir', destinationCity: 'Agadir' },
  { id: 'received', status: 'Arrivé en agence', createdByCity: 'Rabat', originCity: 'Rabat', destinationCity: 'Agadir' },
  { id: 'foreign', status: 'Arrivé en agence', createdByCity: 'Rabat', originCity: 'Rabat', destinationCity: 'Casablanca' },
]
function Harness({ disabled = false, rows = parcels, role = 'agentpro' }) {
  const [ids, setIds] = useState<string[]>(['old-hidden-selection'])
  const assignable = rows.filter(p => canBulkAssignDelivery({ role, city: 'Agadir' }, p))
  return <>
    <BulkDeliverySelection parcels={assignable} selectedIds={ids} onChange={setIds} disabled={disabled} />
    {parcels.map(p => <input key={p.id} aria-label={p.id} type="checkbox" checked={ids.includes(p.id)} readOnly />)}
    <output aria-label="selection">{ids.join(',')}</output>
  </>
}
it.each(['chef_agence', 'agentpro'])('selects initialized shipments without checking incoming or foreign rows for %s', role => {
  render(<Harness role={role} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les initialisées (1)' }))
  expect(screen.getByRole('checkbox', { name: 'initial' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'received' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'foreign' })).not.toBeChecked()
  expect(screen.getByLabelText('selection')).toHaveTextContent(/^initial$/)
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les autres statuts (1)' }))
  expect(screen.getByRole('checkbox', { name: 'initial' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'received' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Désélectionner les autres statuts (1)' }))
  expect(screen.getByLabelText('selection')).toBeEmptyDOMElement()
})
it('respects the filtered rows and blocks selection while filters are being recalculated', () => {
  const { rerender } = render(<Harness disabled rows={[parcels[0]]} />)
  const button = screen.getByRole('button', { name: 'Sélectionner les initialisées (1)' })
  fireEvent.click(button)
  expect(screen.getByRole('checkbox', { name: 'initial' })).not.toBeChecked()
  expect(screen.queryByRole('button', { name: /autres statuts/ })).not.toBeInTheDocument()
  rerender(<Harness rows={[parcels[0]]} />)
  fireEvent.click(button)
  expect(screen.getByLabelText('selection')).toHaveTextContent(/^initial$/)
})
