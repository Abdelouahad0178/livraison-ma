import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ addDoc: vi.fn().mockResolvedValue({ id: 'created' }) }))
vi.mock('./db', () => ({ db: {} }))
vi.mock('./auth', () => ({ auth: {} }))
vi.mock('./clients', () => ({ addPayment: vi.fn() }))
vi.mock('../services/presenceCounters', () => ({ bumpPresence: vi.fn() }))
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, name: string) => name,
  addDoc: mocks.addDoc,
}))
import { createParcel } from './parcels'

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('creation history versus operational date', () => {
  it.each(['2026-10-24', '2026-10-23', undefined])('records the actual time with operation date %s', async operationDate => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T14:56:12.685Z'))
    const p = await createParcel({ sender: { name: 'Sender', city: 'Agadir' }, receiver: { name: 'Receiver', city: 'Casablanca' }, operationDate, portType: 'port_paye' })
    expect(p.history).toEqual([expect.objectContaining({ timestamp: '2026-10-24T14:56:12.685Z' })])
    const operationTs = operationDate ? new Date(`${operationDate}T12:00:00`).toISOString() : '2026-10-24T14:56:12.685Z'
    expect(p.portCollectedAt).toBe(operationTs)
    expect(p.workDate).toBe(operationDate || '2026-10-24')
    expect(mocks.addDoc).toHaveBeenCalledWith('parcels', expect.objectContaining({ history: p.history, workDate: p.workDate }))
    if (operationDate) expect((p.createdAt as any).toDate().getHours()).toBe(12)
  })
})
