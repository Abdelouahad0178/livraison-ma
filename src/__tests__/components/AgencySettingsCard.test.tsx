// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgencySettingsCard from '../../pages/admin/components/AgencySettingsCard'
import { applyAgencySettings } from '../../config/agencySettings'

const mocks = vi.hoisted(() => ({ write: vi.fn().mockResolvedValue(undefined) }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, collection: string, id: string) => `${collection}/${id}`,
  onSnapshot: () => () => {},
  setDoc: (...args: any[]) => mocks.write(...args),
}))
vi.mock('../../firebase/db', () => ({ db: {} }))

afterEach(() => { cleanup(); vi.clearAllMocks(); applyAgencySettings(null) })

const users = [
  { id: 'g1', name: 'GUICHET CASA', role: 'livreur-gare', city: 'Casablanca' },
  { id: 'c1', name: 'CLIENT', role: 'client', city: 'Casablanca' },
]

describe('Admin › Agences › Réglages', () => {
  it('montre les valeurs du code tant que rien n\'est réglé', () => {
    render(<AgencySettingsCard users={users} adminName="admin" />)
    expect(screen.getByText('Réglages des agences')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(7) // en-tête + 6 villes
    expect(screen.queryByText('Enregistrer')).not.toBeInTheDocument()
  })

  it('enregistre guichet, voisines (dans les deux sens) et nouvelle ville dans settings/agencies', async () => {
    render(<AgencySettingsCard users={users} adminName="admin" />)
    const rowOf = (city: string) => screen.getByText(city, { selector: 'td' }).closest('tr')!
    const selects = (city: string) => rowOf(city).querySelectorAll('select')
    // le client n'est jamais proposé comme guichet
    expect(selects('Casablanca')[0].textContent).not.toContain('CLIENT')
    fireEvent.change(selects('Casablanca')[0], { target: { value: 'g1' } })
    fireEvent.change(selects('Casablanca')[1], { target: { value: 'Rabat' } })
    fireEvent.change(screen.getByPlaceholderText(/Nouvelle ville/), { target: { value: '  Tiznit ' } })
    fireEvent.click(screen.getByText('Ajouter'))
    fireEvent.click(screen.getByText('Enregistrer'))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    const [path, data] = mocks.write.mock.calls[0]
    expect(path).toBe('settings/agencies')
    expect(data.cities).toEqual(['Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Guelmim', 'Ait Melloul', 'Tiznit'])
    expect(data.guichet.Casablanca).toEqual({ id: 'g1', name: 'GUICHET CASA' })
    expect(data.guichet.Agadir).toEqual({ id: 'OVMkys7PVFfx8zLvltBoQ4PN35x2', name: 'ENGAREAGA6017' })
    expect(data.guichet.Tiznit).toBeNull()
    expect(data.neighbors).toEqual({ Casablanca: 'Rabat', Rabat: 'Casablanca', Agadir: 'Ait Melloul', 'Ait Melloul': 'Agadir' })
    expect(data.updatedBy).toBe('admin')
    expect(data.delays).toEqual({ collectDays: 14, activeDays: 45 })
  })

  it('durées : ramenées dans les bornes (« Tout » jamais sous 45 jours)', async () => {
    render(<AgencySettingsCard users={users} adminName="admin" />)
    const [collect, active] = screen.getAllByRole('spinbutton')
    fireEvent.change(collect, { target: { value: '21' } })
    fireEvent.change(active, { target: { value: '30' } })
    fireEvent.click(screen.getByText('Enregistrer'))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][1].delays).toEqual({ collectDays: 21, activeDays: 45 })
  })

  it('changer de voisine libère l\'ancienne paire', async () => {
    render(<AgencySettingsCard users={users} adminName="admin" />)
    const sel = screen.getByText('Agadir', { selector: 'td' }).closest('tr')!.querySelectorAll('select')[1]
    fireEvent.change(sel, { target: { value: 'Guelmim' } })
    fireEvent.click(screen.getByText('Enregistrer'))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][1].neighbors).toEqual({ Agadir: 'Guelmim', Guelmim: 'Agadir' })
  })
})
