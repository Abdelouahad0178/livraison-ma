import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const { createArchiveBrowser, toArchiveRow, filterArchiveRows } = createRequire(import.meta.url)('../../functions/archiveBrowser.js')
class RequestError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
const row = (id: string, data: Record<string, unknown> = {}, source = 'parcels') => toArchiveRow(id, {
  sender: { name: 'Société Étoile', tel: '0612345678' }, receiver: { name: 'Karim' },
  senderNic: '0987223', status: 'Livré', originCity: 'Ait Melloul', destinationCity: 'Agadir',
  workDate: '2026-10-01', archivedAt: '2026-10-25T12:00:00Z', ...data,
}, source)
function fakeDb(main: unknown[], separate: unknown[], role = 'admin') {
  const getArchives = vi.fn(async (name: string) => ({ docs: (name === 'parcels' ? main : separate).map((data, index) => ({
    id: String(index), data: () => data,
  })) }))
  const db = { collection: (name: string) => {
    if (name === 'users') return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ role }) }) }) }
    const query = { where: vi.fn(() => query), select: vi.fn(() => query), get: () => getArchives(name) }
    return query
  } }
  return { browse: createArchiveBrowser(db, RequestError), getArchives }
}

describe('admin archive browsing', () => {
  it('reads ISO, Firestore Timestamp, serialized timestamps and legacy archive dates', () => {
    const iso = '2026-10-24T23:30:00Z'
    const millis = Date.parse(iso)
    for (const archivedAt of [iso, { toMillis: () => millis }, { seconds: millis / 1000 }, { _seconds: millis / 1000 }]) {
      expect(row('a', { archivedAt }).archiveDay).toBe('2026-10-25')
    }
    expect(row('a', { archivedAt: null, _archivedAt: iso }).archiveDay).toBe('2026-10-25')
    expect(row('a', { archivedAt: 'invalid' }).archiveDay).toBe('')
  })

  it('filters shipment and archive dates separately with inclusive bounds', () => {
    const rows = [row('first'), row('last', { workDate: '2026-10-25' }), row('before', { workDate: '2026-09-30' })]
    expect(filterArchiveRows(rows, { dateFrom: '2026-10-01', dateTo: '2026-10-25' }).map((p: { id: string }) => p.id)).toEqual(['first', 'last'])
    expect(filterArchiveRows(rows, { dateField: 'archivedAt', dateFrom: '2026-10-25', dateTo: '2026-10-25' })).toHaveLength(3)
    expect(filterArchiveRows([row('no-date', { archivedAt: null })], { dateField: 'archivedAt', dateFrom: '2026-10-01' })).toHaveLength(0)
    expect(filterArchiveRows([row('no-date', { archivedAt: null })], {})).toHaveLength(1)
    expect(row('creation', { workDate: null, createdAt: '2026-10-01T10:00:00Z' }).shipmentDay).toBe('2026-10-01')
  })

  it('combines city, status and accent-insensitive search without dropping leading zeroes', () => {
    const rows = [row('a'), row('b', { status: 'Retourné' })]
    expect(filterArchiveRows(rows, { search: 'societe etoile', city: 'Agadir', status: 'Livré' })).toHaveLength(1)
    expect(filterArchiveRows(rows, { search: '0987' })).toHaveLength(2)
    expect(filterArchiveRows(rows, { search: '987223' })).toHaveLength(0)
  })

  it('searches beyond 500 rows, deduplicates both collections and paginates after filtering', async () => {
    const main = Array.from({ length: 620 }, (_, i) => ({ ...row(String(i)), senderNic: String(i), status: i === 619 ? 'Retour finalisé' : 'Livré' }))
    const { browse, getArchives } = fakeDb(main, [{ ...row('0'), status: 'Retourné' }])
    const auth = { uid: 'admin' }
    const result = await browse({ auth, data: { page: 12, pageSize: 50 } })
    expect(result.total).toBe(620)
    expect(result.parcels).toHaveLength(20)
    expect(result.statuses).toEqual(['Livré', 'Retour finalisé'])
    const found = await browse({ auth, data: { search: '619' } })
    expect(found.parcels).toHaveLength(1)
    expect(found.parcels[0].archiveSource).toBe('parcels')
    expect(getArchives).toHaveBeenCalledTimes(2)
    await browse({ auth, data: { refresh: true } })
    expect(getArchives).toHaveBeenCalledTimes(4)
  })

  it('checks admin authorization before reading archives', async () => {
    const { browse, getArchives } = fakeDb([], [], 'agentpro')
    await expect(browse({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' })
    await expect(browse({ auth: { uid: 'agent' }, data: {} })).rejects.toMatchObject({ code: 'permission-denied' })
    expect(getArchives).not.toHaveBeenCalled()
  })

  it('rejects impossible dates, reversed ranges and invalid pagination', async () => {
    const { browse, getArchives } = fakeDb([], [])
    for (const data of [{ dateFrom: '2026-02-30' }, { dateFrom: '2026-10-25', dateTo: '2026-10-01' }, { page: -1 }, { pageSize: 10000 }]) {
      await expect(browse({ auth: { uid: 'admin' }, data })).rejects.toMatchObject({ code: 'invalid-argument' })
    }
    expect(getArchives).not.toHaveBeenCalled()
  })

  it('does not return partial or empty results when one collection fails', async () => {
    const { browse, getArchives } = fakeDb([], [])
    getArchives.mockRejectedValueOnce(new Error('network'))
    await expect(browse({ auth: { uid: 'admin' }, data: {} })).rejects.toThrow('network')
    const result = await browse({ auth: { uid: 'admin' }, data: {} })
    expect(result.total).toBe(0)
    expect(getArchives).toHaveBeenCalledTimes(4)
  })
})
