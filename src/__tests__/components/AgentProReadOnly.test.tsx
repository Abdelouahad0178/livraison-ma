// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReadOnlyParcelCard, ReadOnlyParcelRow } from '../../pages/agent/components/ReadOnlyParcel'

const mocks = vi.hoisted(() => ({ status: vi.fn().mockResolvedValue({}), returned: vi.fn(), cancelled: vi.fn() }))
vi.mock('../../firebase/parcels', () => ({ updateParcelStatus: mocks.status, markParcelAsReturned: mocks.returned, cancelParcelReturn: mocks.cancelled }))
vi.mock('../../firebase/cod', () => ({ collectCodAtDestination: vi.fn() }))
import QuickStatusToggles from '../../components/QuickStatusToggles'

const parcel = { id: 'foreign', createdByCity: 'Agadir', originCity: 'Agadir', destinationCity: 'Rabat', trackingId: 'LMA123', sender: { name: 'Expéditeur', nic: '123', tel: '0600000000' }, receiver: { name: 'Destinataire', address: 'Adresse' }, status: 'En cours de livraison', codAmount: 100, price: 30, workDate: '2026-10-01' }
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('read-only Agent Pro views', () => {
  it('shows foreign shipment details on cards without mutation controls', () => {
    render(<ReadOnlyParcelCard parcel={parcel} />)
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.getAllByText('Expéditeur')).toHaveLength(2)
    expect(screen.getAllByText('Destinataire')).toHaveLength(2)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
  it('keeps the table columns aligned while showing a read-only row', () => {
    render(<table><tbody><ReadOnlyParcelRow parcel={parcel} columns={{ nexp: true, date: true, expediteur: true, cod: true }} /></tbody></table>)
    expect(screen.getAllByRole('cell')).toHaveLength(7)
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
  it.each(['agentpro', 'chef_agence'])('hides delivery controls from the origin and unrelated cities for %s', role => {
    const { rerender } = render(<QuickStatusToggles compact parcel={parcel} profile={{ role, city: 'Agadir' }} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<QuickStatusToggles compact parcel={parcel} profile={{ role, city: 'Casablanca' }} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<QuickStatusToggles compact parcel={{ ...parcel, status: 'Livré' }} profile={{ role, city: 'Agadir' }} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(mocks.status).not.toHaveBeenCalled()
  })
  it.each(['agentpro', 'chef_agence'])('lets the destination perform delivery for %s', async role => {
    render(<QuickStatusToggles compact parcel={parcel} profile={{ role, city: 'Rabat' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Marquer livré' }))
    await waitFor(() => expect(mocks.status).toHaveBeenCalledWith('foreign', 'Livré', expect.any(Object)))
  })
})
