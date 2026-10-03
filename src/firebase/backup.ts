import { addDoc, collection, doc, documentId, getDocs, limit, orderBy, query, startAfter, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from './db'
export { BACKUP_COLLECTIONS } from './backupCollections'
import { BACKUP_COLLECTIONS } from './backupCollections'

function serializeBackupValue(value: any): any {
  if (value?.toDate && typeof value.toDate === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() }
  }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
  if (Array.isArray(value)) return value.map(serializeBackupValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]: [string, any]) => [key, serializeBackupValue(nested)])
    )
  }
  return value
}

function reviveBackupValue(value: any): any {
  if (Array.isArray(value)) return value.map(reviveBackupValue)
  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp' && value.value) return Timestamp.fromDate(new Date(value.value))
    if (value.__type === 'date' && value.value) return new Date(value.value)
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]: [string, any]) => [key, reviveBackupValue(nested)])
    )
  }
  return value
}

const errorText = (err: any) =>
  err?.code === 'permission-denied' ? 'accès refusé par les règles' : (err?.message || String(err))

/** Lit TOUTE une collection par pages (ordre par identifiant) : pas de requête géante unique
 *  (≈45 000 expéditions) qui faisait échouer ou figer l'export. */
async function readCollectionPaged(name: string, onProgress?: (n: number) => void, pageSize = 1000) {
  const out: { id: string; data: any }[] = []
  let last: any = null
  for (let guard = 0; guard < 1000; guard++) {
    const q = query(collection(db, name), orderBy(documentId()), ...(last ? [startAfter(last)] : []), limit(pageSize))
    const snap = await getDocs(q)
    snap.docs.forEach(d => out.push({ id: d.id, data: serializeBackupValue(d.data()) }))
    onProgress?.(out.length)
    if (snap.docs.length < pageSize) break
    last = snap.docs[snap.docs.length - 1]
  }
  return out
}

export type BackupProgress = (info: { collection: string; index: number; total: number; docs: number }) => void

export async function exportSiteBackup(onProgress?: BackupProgress) {
  const collections: Record<string, any[]> = {}
  const counts: Record<string, number> = {}
  const errors: Record<string, string> = {}

  for (let i = 0; i < BACKUP_COLLECTIONS.length; i++) {
    const name = BACKUP_COLLECTIONS[i]
    try {
      const docs = await readCollectionPaged(name, n => onProgress?.({ collection: name, index: i, total: BACKUP_COLLECTIONS.length, docs: n }))
      collections[name] = docs
      counts[name] = docs.length
    } catch (err: any) {
      // Une collection illisible ne bloque plus toute la sauvegarde : elle est signalée.
      console.error(`Sauvegarde - collection ${name}:`, err)
      errors[name] = errorText(err)
    }
  }

  return {
    app: 'BG Express',
    schema: 'firestore-backup-v1',
    exportedAt: new Date().toISOString(),
    collections,
    counts,
    errors,
  }
}

export async function importSiteBackup(backup: any, importedBy = 'Admin', onProgress?: BackupProgress) {
  if (!backup || backup.schema !== 'firestore-backup-v1' || !backup.collections) {
    throw new Error('Fichier de sauvegarde invalide.')
  }

  const summary: { collections: Record<string, number>; total: number; errors: Record<string, string> } = { collections: {}, total: 0, errors: {} }
  const importedAt = new Date().toISOString()
  const entries = Object.entries(backup.collections).filter(([name, docs]) => BACKUP_COLLECTIONS.includes(name) && Array.isArray(docs)) as [string, any[]][]

  for (let c = 0; c < entries.length; c++) {
    const [name, docs] = entries[c]
    let written = 0
    try {
      // 400 écritures par lot (limite Firestore : 500)
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db)
        let n = 0
        docs.slice(i, i + 400).forEach(item => {
          if (!item?.id || !item.data) return
          batch.set(doc(db, name, item.id), reviveBackupValue(item.data), { merge: true })
          n++
        })
        if (n) await batch.commit()
        written += n
        onProgress?.({ collection: name, index: c, total: entries.length, docs: written })
      }
    } catch (err: any) {
      console.error(`Import - collection ${name}:`, err)
      summary.errors[name] = errorText(err)
    }
    summary.collections[name] = written
    summary.total += written
  }

  try {
    await addDoc(collection(db, 'backupImports'), {
      importedAt,
      importedBy,
      sourceExportedAt: backup.exportedAt || null,
      summary,
    })
  } catch (err) {
    console.warn('Journal des imports non enregistré:', err)
  }

  return summary
}
