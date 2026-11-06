import { addDoc, collection, doc, documentId, GeoPoint, getDocs, limit, orderBy, query, startAfter, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from './db'
import { restListPage } from './restQuery'
import { createBackupWriter, readPagesWithRetry, serializeBackupValue, type PagedDoc } from '../utils/backupFileWriter'
export { BACKUP_COLLECTIONS } from './backupCollections'
import { BACKUP_COLLECTIONS } from './backupCollections'

function reviveBackupValue(value: any): any {
  if (Array.isArray(value)) return value.map(reviveBackupValue)
  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp' && value.value) return Timestamp.fromDate(new Date(value.value))
    if (value.__type === 'date' && value.value) return new Date(value.value)
    if (value.__type === 'reference' && value.path) return doc(db, value.path)
    if (value.__type === 'geopoint') return new GeoPoint(value.latitude, value.longitude)
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]: [string, any]) => [key, reviveBackupValue(nested)])
    )
  }
  return value
}

const errorText = (err: any) =>
  err?.code === 'permission-denied' ? 'accès refusé par les règles' : (err?.message || String(err))

/** Une page de collection : lecture directe (sans cache local) ; en cas d'échec, lecture habituelle par la bibliothèque Firebase. */
async function fetchBackupPage(name: string, afterId: string | null, pageSize: number): Promise<PagedDoc[]> {
  try {
    return (await restListPage(name, pageSize, afterId)).map(d => ({ id: d.id, data: d.data }))
  } catch (err: any) {
    console.warn(`Sauvegarde - lecture directe de ${name} en échec, lecture habituelle :`, err?.message || err)
    const q = query(collection(db, name), orderBy(documentId()), ...(afterId ? [startAfter(afterId)] : []), limit(pageSize))
    const snap = await getDocs(q)
    return snap.docs.map(x => ({ id: x.id, data: x.data() }))
  }
}

export type BackupProgress = (info: { collection: string; index: number; total: number; docs: number; size?: number }) => void

/**
 * 💾 Sauvegarde complète pour le PC : écrite morceau par morceau (utils/backupFileWriter), sans jamais tenir toute la base
 * en mémoire. Une collection illisible ne bloque pas les autres : elle est signalée dans `errors`. Renvoie le fichier prêt à enregistrer.
 */
export async function exportSiteBackup(onProgress?: BackupProgress) {
  const counts: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const exportedAt = new Date().toISOString()
  const writer = createBackupWriter(exportedAt)
  // Fermer la page pendant l'export ferait tout perdre : le navigateur demande confirmation
  const keepOpen = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  window.addEventListener('beforeunload', keepOpen)
  try {
    for (let i = 0; i < BACKUP_COLLECTIONS.length; i++) {
      const name = BACKUP_COLLECTIONS[i]
      let docs = 0
      writer.beginCollection(name)
      onProgress?.({ collection: name, index: i, total: BACKUP_COLLECTIONS.length, docs, size: writer.size })
      try {
        await readPagesWithRetry((after, size) => fetchBackupPage(name, after, size), page => {
          for (const d of page) writer.addDoc({ id: d.id, data: serializeBackupValue(d.data) })
          docs += page.length
          onProgress?.({ collection: name, index: i, total: BACKUP_COLLECTIONS.length, docs, size: writer.size })
        })
      } catch (err: any) {
        console.error(`Sauvegarde - collection ${name}:`, err)
        errors[name] = `${errorText(err)}${docs ? ` (${docs} document(s) seulement)` : ''}`
      }
      writer.endCollection()
      counts[name] = docs
    }
  } finally {
    window.removeEventListener('beforeunload', keepOpen)
  }
  return { blob: writer.finish(counts, errors), counts, errors, exportedAt }
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
