// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// 3 expéditions : 01/10, 05/10, 10/10 (journée d'opération = workDate)
const mk = (id: string, day: string) => ({
  id, workDate: day, createdAt: { toDate: () => new Date(day + 'T12:00:00') }, portType: 'port_paye', price: 10,
  status: 'Livré', sender: { nic: id, name: 'CLIENT ' + id, city: 'Agadir' }, receiver: { name: 'R', city: 'Rabat' }, originCity: 'Agadir',
})
const ALL = [mk('1000001', '2026-10-01'), mk('1000002', '2026-10-05'), mk('1000003', '2026-10-10'), mk('1000004', '2026-10-15')]
const ranges: string[] = []
vi.mock('../../firebase/config', () => ({ auth: { currentUser: { uid: 'f' } }, db: {} }))
vi.mock('../../firebase/parcels', () => ({
  subscribeAllParcels: (cb: any) => { cb(ALL, null); return () => {} },
  getParcelsPage: vi.fn(async () => ({ docs: [], hasMore: false })),
  searchParcels: vi.fn(async () => []),
  getParcelsByCreatedAtRange: vi.fn(async (s: Date, e: Date) => {
    ranges.push(`${s.toISOString()}→${e.toISOString()}`)
    return ALL.filter(p => { const d = p.createdAt.toDate(); return d >= s && d < e })
  }),
}))
vi.mock('../../firebase/invoices', () => ({ subscribeAllInvoices: (cb: any) => { cb([]); return () => {} }, createInvoice: vi.fn(), markParcelsAsInvoiced: vi.fn() }))
vi.mock('../../firebase/clients', () => ({ subscribeClients: (cb: any) => { cb([]); return () => {} } }))
vi.mock('../../config/operationalDay', async (orig) => {
  const real: any = await orig()
  return { ...real, getCurrentOperationalDay: () => new Date(2026, 9, 19) }
})

import FacturierExpeditionsTab from '../../pages/FacturierExpeditionsTab'

const typeDate = (input: HTMLElement, fr: string) => fireEvent.change(input, { target: { value: fr } })

describe('Facturier — filtre de période', () => {
  it('Période 01/10 → 05/10 : affiche 1000001 et 1000002, pas 1000003', async () => {
    render(<FacturierExpeditionsTab userName="F" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Période' })) })
    const inputs = screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)
    await act(async () => { typeDate(inputs[0], '01/10/2026') })
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[1], '05/10/2026') })
    await waitFor(() => expect(screen.getByText('1000002')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000001')).toBeTruthy()
    expect(screen.queryByText('1000003')).toBeNull()
  })

  it("7 jours → Ce mois → Aujourd'hui → Journée d'opération → Période", async () => {
    render(<FacturierExpeditionsTab userName="F" />)
    await waitFor(() => expect(screen.getByText('1000004')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000003')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ce mois' })) })
    await waitFor(() => expect(screen.getByText('1000001')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000004')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: "Aujourd'hui" })) })
    await waitFor(() => expect(screen.queryByText('1000004')).toBeNull(), { timeout: 3000 })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Journée d'opération/ })) })
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[0], '05/10/2026') })
    await waitFor(() => expect(screen.getByText('1000002')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000001')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Période' })) })
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[0], '09/10/2026') })
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[1], '16/10/2026') })
    await waitFor(() => expect(screen.getByText('1000003')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000004')).toBeTruthy()
    expect(screen.queryByText('1000002')).toBeNull()
    // Nouvelle date de début seule : AUCUNE recherche tant que la date de fin n'est pas choisie
    const before = ranges.length
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[0], '01/10/2026') })
    await new Promise(r => setTimeout(r, 300))
    expect(ranges.length).toBe(before)
    expect(screen.getByText(/Choisissez maintenant la date de fin/)).toBeTruthy()
    expect(screen.queryByText('1000003')).toBeTruthy() // période précédente toujours affichée
    await act(async () => { typeDate(screen.getAllByPlaceholderText(/jj\/mm\/aaaa/i)[1], '05/10/2026') })
    await waitFor(() => expect(screen.getByText('1000001')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText('1000003')).toBeNull()
  }, 15000) // nombreuses étapes : délai large quand toute la suite tourne en parallèle
})
