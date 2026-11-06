import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { Writable } from 'stream'
import { createRequire } from 'module'
import { BACKUP_COLLECTIONS, BACKUP_FILE_PREFIX, backupFileName, backupStatusOf, backupsToDelete } from './backupCloud'

const require2 = createRequire(import.meta.url)
const { runCloudBackup } = require2('../../functions/cloudBackup.js')

const DAY = 86400000
const NOW = Date.parse('2026-11-08T03:05:00Z')
const nom = (d: string) => `${BACKUP_FILE_PREFIX}${d}T03-00-00.json`

/** Faux Storage : garde ce qui est envoyé, et ne crée le fichier qu'une fois l'envoi terminé (comme le vrai). */
function fauxStorage(existants: string[] = [], { casser = false } = {}) {
  const files = new Map<string, any>(existants.map(n => [n, { name: n }]))
  const deleted: string[] = []
  return {
    files, deleted,
    file(name: string) {
      return {
        createWriteStream() {
          const chunks: Buffer[] = []
          return new Writable({
            write(c, _e, cb) { if (casser) cb(new Error('réseau coupé')); else { chunks.push(c); cb() } },
            final(cb) { files.set(name, { name, body: Buffer.concat(chunks) }); cb() },
          })
        },
        async setMetadata(m: any) { files.get(name).meta = m },
        async delete() { files.delete(name); deleted.push(name) },
      }
    },
    async getFiles() { return [[...files.values()]] },
  }
}
/** Fausse base : collection → documents, avec pagination par identifiant. */
function fausseBase(data: Record<string, any[]>, { panne }: { panne?: (coll: string, after: any) => boolean } = {}) {
  const lectures: number[] = []
  return {
    lectures,
    collection(coll: string) {
      const build2 = (limitN: number, after: any) => ({
        orderBy: () => build2(limitN, after),
        limit: (n: number) => build2(n, after),
        startAfter: (a: any) => build2(limitN, a),
        async get() {
          if (panne?.(coll, after)) throw new Error(`panne ${coll}`)
          const list = data[coll] || []
          const from = after ? list.findIndex(d => d.id === after) + 1 : 0
          const docs = list.slice(from, from + limitN).map(d => ({ id: d.id, data: () => d.data }))
          lectures.push(docs.length)
          return { docs }
        },
      })
      return build2(1000, null)
    },
  }
}
const lire = (s: any, name: string) => JSON.parse(gunzipSync(s.files.get(name).body).toString('utf8'))
const AT = new Date('2026-11-08T03:00:00Z')
const silence = () => {}

describe('Sauvegarde cloud : règles', () => {
  it('nom de fichier et rotation : les plus anciens au-delà de 10', () => {
    expect(backupFileName('2026-11-08T03:00:00.123Z')).toBe(`${BACKUP_FILE_PREFIX}2026-11-08T03-00-00.json`)
    const noms = Array.from({ length: 12 }, (_, i) => nom(`2026-10-${String(i + 1).padStart(2, '0')}`))
    expect(backupsToDelete(noms)).toEqual([nom('2026-10-01'), nom('2026-10-02')])
    expect(backupsToDelete(noms.slice(0, 10))).toEqual([])
    expect(backupsToDelete(['auto-backups/autre.json', ...noms.slice(0, 3)], 1)).toEqual([nom('2026-10-01'), nom('2026-10-02')])
  })
  it('alerte : aucun fichier, ou plus de 8 jours, ou sauvegarde incomplète', () => {
    expect(backupStatusOf([], NOW).stale).toBe(true)
    const f = (jours: number, extra = {}) => ({ name: nom('2026-11-01'), timeCreated: new Date(NOW - jours * DAY).toISOString(), size: '5000', ...extra })
    expect(backupStatusOf([f(7)], NOW)).toMatchObject({ stale: false, ageDays: 7, sizeBytes: 5000, count: 1 })
    expect(backupStatusOf([f(8.5)], NOW)).toMatchObject({ stale: true, ageDays: 8 })
    expect(backupStatusOf([f(1, { errors: '2', documents: '900' })], NOW)).toMatchObject({ stale: true, errors: 2, documents: 900 })
    expect(backupStatusOf([f(56)], NOW)).toMatchObject({ stale: true, ageDays: 56 })
  })
  it('c\'est le fichier le plus récent qui compte', () => {
    const vieux = { name: nom('2026-09-13'), timeCreated: new Date(NOW - 56 * DAY).toISOString() }
    const recent = { name: nom('2026-11-08'), timeCreated: new Date(NOW - DAY).toISOString() }
    expect(backupStatusOf([recent, vieux], NOW).stale).toBe(false)
    expect(backupStatusOf([{ name: 'auto-backups/autre.json', timeCreated: new Date(NOW).toISOString() }, vieux], NOW).stale).toBe(true)
  })
  it('mêmes collections que l\'export manuel', () => {
    for (const c of ['parcels', 'arrivages', 'deliverySheets', 'valeursLots', 'commercialInvoices']) expect(BACKUP_COLLECTIONS).toContain(c)
  })
  it('la version du SERVEUR (functions/shared) est à jour', async () => {
    const r = await build({
      entryPoints: ['src/utils/backupCloud.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false,
      banner: { js: '// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/backupCloud.ts — ne pas modifier.' },
    })
    // Échec : lancer `node scripts/build-functions-shared.mjs`, puis redéployer scheduledWeeklyBackup
    expect(readFileSync('functions/shared/backupCloud.js', 'utf8').replace(/\r\n/g, '\n')).toBe(r.outputFiles[0].text.replace(/\r\n/g, '\n'))
  }, 30000)
})

describe('Sauvegarde cloud : écriture sur le serveur', () => {
  const data = {
    settings: [{ id: 'a', data: { x: 1, quand: { toDate: () => new Date('2026-11-01T10:00:00Z') } } }],
    parcels: Array.from({ length: 1234 }, (_, i) => ({ id: `p${String(i).padStart(5, '0')}`, data: { nom: `CLIENT « é » ${i}`, price: i } })),
    vide: [],
  }
  it('fichier compressé, complet, relu comme par « Importer JSON »', async () => {
    const s = fauxStorage(), db = fausseBase(data)
    const r = await runCloudBackup(db, s, { now: AT, collections: ['settings', 'parcels', 'vide'], log: silence })
    expect(r).toMatchObject({ documents: 1235, errors: {}, deleted: 0 })
    const o = lire(s, r.name)
    expect(o).toMatchObject({ schema: 'firestore-backup-v1', exportedAt: AT.toISOString(), counts: { settings: 1, parcels: 1234, vide: 0 }, errors: {} })
    expect(o.collections.parcels).toHaveLength(1234)
    expect(o.collections.parcels[1233]).toEqual({ id: 'p01233', data: { nom: 'CLIENT « é » 1233', price: 1233 } })
    expect(o.collections.settings[0].data.quand).toEqual({ __type: 'timestamp', value: '2026-11-01T10:00:00.000Z' })
    expect(o.collections.vide).toEqual([])
    expect(s.files.get(r.name).meta.metadata).toMatchObject({ documents: '1235', errors: '0' })
  })
  it('lit par pages : jamais toute la collection d\'un coup', async () => {
    const s = fauxStorage(), db = fausseBase(data)
    await runCloudBackup(db, s, { now: AT, collections: ['parcels'], log: silence })
    expect(Math.max(...db.lectures)).toBe(500)
    expect(db.lectures).toEqual([500, 500, 234])
  })
  it('garde 10 fichiers après une sauvegarde complète', async () => {
    const existants = Array.from({ length: 10 }, (_, i) => nom(`2026-08-${String(i + 10)}`))
    const s = fauxStorage(existants)
    const r = await runCloudBackup(fausseBase(data), s, { now: AT, collections: ['settings'], log: silence })
    expect(r.deleted).toBe(1)
    expect(s.deleted).toEqual([nom('2026-08-10')])
    expect(s.files.size).toBe(10)
  })
  it('collection en panne : signalée, les autres sauvegardées, et AUCUN ancien fichier retiré', async () => {
    const existants = Array.from({ length: 10 }, (_, i) => nom(`2026-08-${String(i + 10)}`))
    const s = fauxStorage(existants)
    const db = fausseBase(data, { panne: (c, after) => c === 'parcels' && after === 'p00499' })
    const r = await runCloudBackup(db, s, { now: AT, collections: ['settings', 'parcels'], log: silence, retryDelayMs: 0 })
    expect(r.errors.parcels).toContain('500 document(s) seulement')
    expect(r.deleted).toBe(0)
    expect(s.files.size).toBe(11)
    const o = lire(s, r.name)
    expect(o.collections.parcels).toHaveLength(500)
    expect(o.collections.settings).toHaveLength(1)
    expect(s.files.get(r.name).meta.metadata.errors).toBe('1')
  })
  it('envoi coupé : erreur remontée, aucun fichier créé, aucun ancien fichier retiré', async () => {
    const existants = [nom('2026-09-13')]
    const s = fauxStorage(existants, { casser: true })
    await expect(runCloudBackup(fausseBase(data), s, { now: AT, collections: ['settings', 'parcels'], log: silence })).rejects.toThrow()
    expect([...s.files.keys()]).toEqual(existants)
    expect(s.deleted).toEqual([])
  }, 20000)
})
