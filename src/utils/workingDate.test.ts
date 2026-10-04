import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dbLoaded: vi.fn(),
  firestoreLoaded: vi.fn(),
  doc: vi.fn(() => 'working-date-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('../firebase/db', () => {
  mocks.dbLoaded()
  return { db: 'database' }
})
vi.mock('firebase/firestore', () => {
  mocks.firestoreLoaded()
  return { doc: mocks.doc, getDoc: mocks.getDoc, setDoc: mocks.setDoc }
})

let stored: Map<string, string>
const reload = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  stored = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  })
  vi.stubGlobal('window', { location: { reload } })
})

afterEach(() => vi.unstubAllGlobals())

describe('Working date with deferred Firestore', () => {
  it('reads the local date without loading Firebase', async () => {
    stored.set('bg-express-working-date', '2026-10-04T12:00:00')
    const { getWorkingDateStr, getWorkingDateDisplay } = await import('./workingDate')
    expect(getWorkingDateStr()).toBe('2026-10-04')
    expect(getWorkingDateDisplay()).toBe('04/10/2026')
    expect(mocks.dbLoaded).not.toHaveBeenCalled()
    expect(mocks.firestoreLoaded).not.toHaveBeenCalled()
  })

  it('loads the remote working date on demand', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ date: '2026-10-03T12:00:00' }) })
    const { loadWorkingDateFromFirestore } = await import('./workingDate')
    await loadWorkingDateFromFirestore()
    expect(mocks.doc).toHaveBeenCalledWith('database', 'settings', 'workingDate')
    expect(stored.get('bg-express-working-date')).toBe('2026-10-03T12:00:00')
  })

  it('keeps the local date if the remote read fails', async () => {
    stored.set('bg-express-working-date', '2026-10-02T12:00:00')
    mocks.getDoc.mockRejectedValue(new Error('Offline'))
    const { loadWorkingDateFromFirestore } = await import('./workingDate')
    await expect(loadWorkingDateFromFirestore()).resolves.toBeUndefined()
    expect(stored.get('bg-express-working-date')).toBe('2026-10-02T12:00:00')
  })

  it('persists the admin date before updating local storage and reloading', async () => {
    const isoDate = new Date('2026-10-05T00:00:00').toISOString()
    mocks.setDoc.mockImplementation(async () => {
      expect(stored.has('bg-express-working-date')).toBe(false)
      expect(reload).not.toHaveBeenCalled()
    })
    const { setWorkingDate } = await import('./workingDate')
    await setWorkingDate('2026-10-05')
    expect(mocks.setDoc).toHaveBeenCalledWith('working-date-ref', {
      date: isoDate, updatedAt: expect.any(String),
    })
    expect(stored.get('bg-express-working-date')).toBe(isoDate)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not change the local date or reload when saving fails', async () => {
    mocks.setDoc.mockRejectedValue(new Error('Denied'))
    const { setWorkingDate } = await import('./workingDate')
    await expect(setWorkingDate('2026-10-05')).rejects.toThrow('Denied')
    expect(stored.has('bg-express-working-date')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
