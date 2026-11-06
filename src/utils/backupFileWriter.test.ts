import { describe, it, expect, vi } from 'vitest'
import { backupSizeLabel, createBackupWriter, readPagesWithRetry, serializeBackupValue } from './backupFileWriter'

const AT = '2026-11-06T10:00:00.000Z'
const lire = async (b: Blob) => JSON.parse(await b.text())

describe('Sauvegarde manuelle : fichier écrit morceau par morceau', () => {
  it('produit le format relu par « Importer JSON »', async () => {
    const w = createBackupWriter(AT)
    w.beginCollection('settings'); w.addDoc({ id: 'a', data: { x: 1 } }); w.endCollection()
    w.beginCollection('parcels')
    w.addDoc({ id: 'p1', data: { name: 'NOURA « é » "guillemets" \\ \n', price: 30 } })
    w.addDoc({ id: 'p2', data: { list: [1, { y: null }] } })
    w.endCollection()
    const o = await lire(w.finish({ settings: 1, parcels: 2 }, {}))
    expect(o).toMatchObject({ app: 'BG Express', schema: 'firestore-backup-v1', exportedAt: AT, counts: { settings: 1, parcels: 2 }, errors: {} })
    expect(o.collections.settings).toEqual([{ id: 'a', data: { x: 1 } }])
    expect(o.collections.parcels[0].data.name).toBe('NOURA « é » "guillemets" \\ \n')
    expect(o.collections.parcels).toHaveLength(2)
  })
  it('collection vide, et aucune collection : JSON toujours valide', async () => {
    const w = createBackupWriter(AT)
    w.beginCollection('vide'); w.endCollection()
    expect((await lire(w.finish({ vide: 0 }, {}))).collections.vide).toEqual([])
    expect((await lire(createBackupWriter(AT).finish({}, {}))).collections).toEqual({})
  })
  it('collection interrompue : ce qui est lu est gardé et l\'erreur est notée', async () => {
    const w = createBackupWriter(AT)
    w.beginCollection('parcels'); w.addDoc({ id: 'p1', data: {} }); w.endCollection()
    const o = await lire(w.finish({ parcels: 1 }, { parcels: 'coupure après 1 document' }))
    expect(o.collections.parcels).toHaveLength(1)
    expect(o.errors.parcels).toContain('coupure')
  })
  it('jamais un seul gros bloc : 30 Mo répartis en morceaux, et une expédition par ligne', async () => {
    const w = createBackupWriter(AT)
    w.beginCollection('parcels')
    const lourd = 'x'.repeat(3000)
    for (let i = 0; i < 10000; i++) w.addDoc({ id: `p${i}`, data: { lourd } })
    w.endCollection()
    expect(w.partsCount).toBeGreaterThanOrEqual(6)
    expect(w.size).toBeGreaterThan(30_000_000)
    const b = w.finish({ parcels: 10000 }, {})
    expect(b.size).toBeGreaterThan(30_000_000)
    expect((await lire(b)).collections.parcels).toHaveLength(10000)
  })
  it('valeurs Firestore reconnaissables dans le fichier', () => {
    const iso = '2026-11-06T08:00:00.000Z'
    expect(serializeBackupValue({ toDate: () => new Date(iso) })).toEqual({ __type: 'timestamp', value: iso })
    expect(serializeBackupValue(new Date(iso))).toEqual({ __type: 'date', value: iso })
    const circulaire: any = { app: {} }; circulaire.app.self = circulaire
    expect(serializeBackupValue({ path: 'users/u1', firestore: circulaire, id: 'u1' })).toEqual({ __type: 'reference', path: 'users/u1' })
    expect(serializeBackupValue({ latitude: 30.4, longitude: -9.6, isEqual: () => true })).toEqual({ __type: 'geopoint', latitude: 30.4, longitude: -9.6 })
    expect(serializeBackupValue({ a: [{ b: { toDate: () => new Date(iso) } }], c: null, d: 0, e: '' })).toEqual({ a: [{ b: { __type: 'timestamp', value: iso } }], c: null, d: 0, e: '' })
    expect(serializeBackupValue({ path: 'pas une référence' })).toEqual({ path: 'pas une référence' })
  })
  it('taille lisible', () => {
    expect(backupSizeLabel(500)).toBe('1 Ko')
    expect(backupSizeLabel(2048)).toBe('2 Ko')
    expect(backupSizeLabel(5 * 1048576)).toBe('5 Mo')
  })
})

describe('Lecture par pages', () => {
  const base = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, data: {} }))
  const pages = (list: any[]) => async (after: string | null, size: number) => {
    const from = after ? list.findIndex(x => x.id === after) + 1 : 0
    return list.slice(from, from + size)
  }
  it('lit tout, page après page', async () => {
    const vus: string[] = []
    const n = await readPagesWithRetry(pages(base), d => d.forEach(x => vus.push(x.id)), { pageSize: 2 })
    expect(n).toBe(5)
    expect(vus).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
  })
  it('nombre exact de documents = taille de page : pas de boucle sans fin', async () => {
    expect(await readPagesWithRetry(pages(base.slice(0, 4)), () => {}, { pageSize: 2 })).toBe(4)
    expect(await readPagesWithRetry(pages([]), () => {}, { pageSize: 2 })).toBe(0)
  })
  it('coupure passagère : la page est retentée, sans doublon', async () => {
    const f = pages(base)
    let echecs = 2
    const sleep = vi.fn(async () => {})
    const vus: string[] = []
    const n = await readPagesWithRetry(async (a, s) => { if (a === 'd1' && echecs-- > 0) throw new Error('réseau'); return f(a, s) }, d => d.forEach(x => vus.push(x.id)), { pageSize: 2, sleep })
    expect(n).toBe(5)
    expect(vus).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
    expect(sleep).toHaveBeenCalledTimes(2)
  })
  it('échec durable : l\'erreur remonte, ce qui est lu reste écrit', async () => {
    const f = pages(base)
    const vus: string[] = []
    await expect(readPagesWithRetry(async (a, s) => { if (a === 'd1') throw new Error('refusé'); return f(a, s) }, d => d.forEach(x => vus.push(x.id)), { pageSize: 2, retries: 1, sleep: async () => {} })).rejects.toThrow('refusé')
    expect(vus).toEqual(['d0', 'd1'])
  })
})
