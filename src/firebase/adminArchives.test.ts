import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), delete: vi.fn(),
}))
vi.mock('./appCore', () => ({ default: {} }))
vi.mock('./db', () => ({ db: {} }))
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  deleteField: () => 'DELETE_FIELD',
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  runTransaction: (_db: unknown, callback: (tx: typeof mocks) => unknown) => callback(mocks),
}))
import { restoreAdminArchive } from './adminArchives'

describe('safe archive restoration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates soft archives without replacing any business data', async () => {
    mocks.get.mockResolvedValueOnce({ exists: () => true, data: () => ({ isArchived: true, history: ['preserve'], codAmount: 700 }) })
    await restoreAdminArchive({ id: 'a', archiveSource: 'parcels' })
    expect(mocks.update).toHaveBeenCalledWith('parcels/a', expect.objectContaining({ isArchived: false, archivedAt: 'DELETE_FIELD' }))
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('history')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('restores the full stored document and deletes its archive atomically', async () => {
    mocks.get.mockResolvedValueOnce({ exists: () => true, data: () => ({ history: ['preserve'], codAmount: 700, archivedAt: 'old-date' }) })
      .mockResolvedValueOnce({ exists: () => false })
    await restoreAdminArchive({ id: 'a', archiveSource: 'parcels_archive' })
    expect(mocks.set).toHaveBeenCalledWith('parcels/a', { history: ['preserve'], codAmount: 700, isArchived: false })
    expect(mocks.delete).toHaveBeenCalledWith('parcels_archive/a')
  })

  it('refuses to overwrite an existing parcel', async () => {
    mocks.get.mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
      .mockResolvedValueOnce({ exists: () => true })
    await expect(restoreAdminArchive({ id: 'a', archiveSource: 'parcels_archive' })).rejects.toThrow('existe déjà')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})
