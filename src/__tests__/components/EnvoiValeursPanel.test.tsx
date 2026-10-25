// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../firebase/config', () => ({ auth: { currentUser: { uid: 'ex', email: 'ex@x.ma' } } }))
const createEnvoi = vi.fn(async () => 'id1')
vi.mock('../../firebase/valeursEnvois', async (orig) => {
  const real: any = await orig()
  return { ...real, subscribeEnvois: (_c: string, cb: any) => { cb([]); return () => {} }, createEnvoi: (...a: any[]) => (createEnvoi as any)(...a), cancelEnvoi: vi.fn() }
})

import EnvoiValeursPanel from '../../pages/exploitation/EnvoiValeursPanel'

const now = new Date().toISOString()
const parcel = (id: string, price: number, minutes: number) => ({
  id, senderNic: id, portType: 'port_du', portStatus: 'collected', price, destinationCity: 'Agadir',
  portCollectedById: 'liv', portExpReceivedById: 'ex', portExpReceivedAt: new Date(Date.now() - minutes * 60000).toISOString(),
  portCollectedAt: now, createdAt: now,
})

describe('EnvoiValeursPanel — montant saisi à la main', () => {
  it('accepte un montant tapé et l\'ajuste aux expéditions entières', () => {
    const parcels = [parcel('1000001', 30, 30), parcel('1000002', 40, 20), parcel('1000003', 100, 10)]
    render(<EnvoiValeursPanel parcels={parcels} profile={{ city: 'Agadir', name: 'ZINEBE' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Afficher/ })) // bloc replié au démarrage
    const input = screen.getByPlaceholderText('Ex. : 5000') as HTMLInputElement
    expect(input.value).toBe('170')
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '100' } })
    expect(input.value).toBe('100')
    const btn = screen.getByRole('button', { name: /Verser 70/ })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
})
