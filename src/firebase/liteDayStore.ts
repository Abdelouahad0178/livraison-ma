// 💾 MÉMOIRE DES JOURNÉES PASSÉES conservée entre deux chargements de page (IndexedDB, API native).
// Utilisée UNIQUEMENT par firebase/parcels.ts (LITE_DAY_CACHE). Au démarrage, les journées gardées
// sont rechargées puis remises à jour par le rattrapage habituel (liteUpdatedAt) et vérifiées par un
// comptage serveur avant toute réutilisation. La journée en cours n'est JAMAIS enregistrée.
// Tout échec (navigation privée, quota, IndexedDB absent) → silencieux : lecture réseau normale.
//
// Chaque journée a sa propre date de validité (store « valid » : syncedAt + onglet qui l'a écrite) :
// plusieurs onglets ouverts peuvent enregistrer sans qu'une journée écrite par l'un soit déclarée
// « à jour » par un autre qui ne l'a pas réécrite (voir savePersistedLiteDays, `refresh`).
import { LITE_PERSIST_SCHEMA } from '../utils/liteDayCache'

const DB_NAME = 'bgx-lite-days'
const DB_VERSION = 1
const DAYS = 'days'   // { key, docs }
const VALID = 'valid' // { key, syncedAt, session, schema }

export interface PersistedLiteTag { session: string; syncedAt: number }
export interface PersistedLiteDay { key: string; docs: any[]; syncedAt: number; session: string }

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(VALID)) db.createObjectStore(VALID, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

/** Journées enregistrées (avec leur validité). null : IndexedDB indisponible ou illisible. */
export async function loadPersistedLiteDays(): Promise<PersistedLiteDay[] | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const tx = db.transaction([DAYS, VALID], 'readonly')
    const validReq = tx.objectStore(VALID).getAll()
    const daysReq = tx.objectStore(DAYS).getAll()
    await done(tx)
    const valid = new Map<string, any>()
    for (const v of validReq.result || []) if (v && typeof v.key === 'string') valid.set(v.key, v)
    const out: PersistedLiteDay[] = []
    for (const r of daysReq.result || []) {
      const v = r && valid.get(r.key)
      if (!v || v.schema !== LITE_PERSIST_SCHEMA || typeof v.syncedAt !== 'number' || !Array.isArray(r.docs)) continue
      out.push({ key: r.key, docs: r.docs, syncedAt: v.syncedAt, session: String(v.session || '') })
    }
    return out
  } catch (err) {
    console.warn('Mémoire des journées (IndexedDB) : lecture impossible', err)
    return null
  }
}

/**
 * Enregistre en UNE transaction (tout ou rien) :
 * - `put`     : journées réécrites (documents + validité syncedAt / session) ;
 * - `refresh` : journées NON modifiées depuis leur dernier enregistrement connu (`tag`) — seule leur
 *               validité est avancée à syncedAt, et SEULEMENT si l'enregistrement est toujours celui
 *               connu (sinon un autre onglet l'a réécrit : il garde sa propre validité) ;
 * - `remove`  : journées effacées.
 * Renvoie les clés dont la validité a été avancée (null : échec, rien n'est écrit).
 */
export async function savePersistedLiteDays(
  session: string, syncedAt: number,
  put: { key: string; docs: any[] }[], refresh: { key: string; tag: PersistedLiteTag }[], remove: string[],
): Promise<string[] | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const tx = db.transaction([DAYS, VALID], 'readwrite')
    const days = tx.objectStore(DAYS)
    const valid = tx.objectStore(VALID)
    const stamp = (key: string) => ({ key, syncedAt, session, schema: LITE_PERSIST_SCHEMA })
    for (const key of remove) { days.delete(key); valid.delete(key) }
    for (const row of put) { days.put(row); valid.put(stamp(row.key)) }
    const refreshed: string[] = []
    for (const { key, tag } of refresh) {
      const req = valid.get(key)
      req.onsuccess = () => {
        const v = req.result
        if (v && v.schema === LITE_PERSIST_SCHEMA && v.session === tag.session && v.syncedAt === tag.syncedAt) {
          valid.put(stamp(key))
          refreshed.push(key)
        }
      }
    }
    await done(tx)
    return refreshed
  } catch (err) {
    console.warn('Mémoire des journées (IndexedDB) : enregistrement impossible', err)
    return null
  }
}

/** Efface les journées données (vrai si effacées ou rien à faire). */
export async function removePersistedLiteDays(keys: string[]): Promise<boolean> {
  if (!keys.length) return true
  try {
    const db = await openDb()
    if (!db) return false
    const tx = db.transaction([DAYS, VALID], 'readwrite')
    for (const key of keys) { tx.objectStore(DAYS).delete(key); tx.objectStore(VALID).delete(key) }
    await done(tx)
    return true
  } catch {
    return false
  }
}
