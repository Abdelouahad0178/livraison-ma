// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../firebase/config', () => ({ auth: { currentUser: { uid: 'ex', email: 'ex@x.ma' } }, db: {} }))
const createEnvoi = vi.fn(async () => 'id1')
// 📤 Copie allégée envoiContrib (30/10/2026) : le bloc lit les valeurs détenues — construites ici avec la RÈGLE
// PARTAGÉE envoiItemsOf, comme le fait le serveur
let copyParcels: any[] = []
// 💰 Total « reste à verser » tenu par le serveur (envoiHolders/{uid}, 31/10/2026) : lu par le bloc FERMÉ
let holderTotals: Record<string, number> | null = null
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig()
  const { envoiItemsOf } = await import('../../utils/exploitationEnvoi')
  return {
    ...real, collection: () => ({}), query: () => ({}), where: () => ({}), doc: () => ({ __doc: true }),
    onSnapshot: (q: any, cb: any) => {
      if (q?.__doc) cb({ exists: () => !!holderTotals, data: () => holderTotals || {} })
      else cb({ docs: copyParcels.map(p => { const items = envoiItemsOf(p); return { data: () => ({ items, holders: [...new Set(items.flatMap(i => i.holders))] }) } }) })
      return () => {}
    },
  }
})
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
    copyParcels = parcels
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

describe('EnvoiValeursPanel — bloc fermé : total du serveur (31/10/2026)', () => {
  it('affiche le reste à verser tenu par le serveur, sans charger la liste détaillée', () => {
    copyParcels = []
    holderTotals = { ports: 170, cod_especes: 400, cod_docs: 1000, cod_docs_cash: 400 }
    render(<EnvoiValeursPanel parcels={[]} profile={{ city: 'Agadir', name: 'ZINEBE' }} />)
    const t = document.body.textContent || ''
    expect(t).toMatch(/Ports 170[,.]00 DH/)
    expect(t).toMatch(/COD espèces 400[,.]00 DH/)
    expect(t, t).toMatch(/Chèques \/ traites 1\D{0,2}000[,.]00 DH/)
    holderTotals = null
  })
})
