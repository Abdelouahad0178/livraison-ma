// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ browse: vi.fn(), restore: vi.fn() }))
vi.mock('../../firebase/adminArchives', () => ({ browseAdminArchives: mocks.browse, restoreAdminArchive: mocks.restore }))
import AdminArchiveBrowser from '../../pages/admin/components/AdminArchiveBrowser'

const result = {
  parcels: [{ id: 'a', archiveSource: 'parcels', trackingId: 'LMA123', senderNic: '123', sender: { name: 'Société Étoile' }, receiver: { name: 'Karim' }, originCity: 'Ait Melloul', destinationCity: 'Agadir', status: 'Livré', codAmount: 500, shipmentDay: '2026-10-01', archiveDay: '2026-10-25' }],
  total: 51, totalArchived: 46084, page: 0, pageSize: 50,
  cities: ['Ait Melloul', 'Guelmim'], statuses: ['Livré', 'Retour finalisé'], updatedAt: '2026-10-25T12:00:00Z',
}

describe('Admin archive filters', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.browse.mockResolvedValue(result) })
  afterEach(cleanup)

  it('shows both date meanings and actual city/status choices, and resets pagination on filtering', async () => {
    render(<AdminArchiveBrowser />)
    await screen.findByText('Société Étoile')
    expect(screen.getByRole('option', { name: 'Guelmim' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Retour finalisé' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Date d’archivage' })).toBeTruthy()
    expect(screen.getByText('01/10/2026')).toBeTruthy()
    expect(screen.getByText('25/10/2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'Retour finalisé' } })
    await waitFor(() => expect(mocks.browse).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, status: 'Retour finalisé', refresh: false })))
  })

  it('explains reversed date ranges and clears all filters on reset', async () => {
    render(<AdminArchiveBrowser />)
    await screen.findByText('Société Étoile')
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '25102026' } })
    fireEvent.change(screen.getByLabelText('Au (inclus)'), { target: { value: '01102026' } })
    expect(screen.getByRole('alert').textContent).toContain('La date de début')
    expect(screen.queryByText('Aucune archive ne correspond à ces filtres.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenLastCalledWith(expect.objectContaining({ dateFrom: '', dateTo: '', city: 'all' })))
    expect((screen.getByLabelText('Du') as HTMLInputElement).value).toBe('')
  })

  it('shows a retryable error instead of claiming that archives are empty', async () => {
    mocks.browse.mockRejectedValueOnce(new Error('network'))
    render(<AdminArchiveBrowser />)
    expect((await screen.findByRole('alert')).textContent).toContain('Impossible de charger')
    expect(screen.queryByText('Aucune archive ne correspond à ces filtres.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await screen.findByText('Société Étoile')
    expect(mocks.browse).toHaveBeenLastCalledWith(expect.objectContaining({ refresh: true }))
  })

  it('ignores a delayed response from earlier filters', async () => {
    let resolveOld: (value: typeof result) => void = () => {}
    mocks.browse.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce({ ...result, total: 1 })
    render(<AdminArchiveBrowser />)
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Ville de départ ou d’arrivée'), { target: { value: 'Agadir' } })
    await screen.findByRole('heading', { name: 'Consulter les archives (1 résultat)' })
    await act(async () => { resolveOld({ ...result, total: 999 }) })
    expect(screen.getByRole('heading', { name: 'Consulter les archives (1 résultat)' })).toBeTruthy()
  })
})
