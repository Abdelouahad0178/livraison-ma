import { addDoc, collection, doc, getDocs, Timestamp, writeBatch } from 'firebase/firestore'
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

export async function exportSiteBackup() {
  const collections = {}
  const counts = {}

  for (const name of BACKUP_COLLECTIONS) {
    const snap = await getDocs(collection(db, name))
    ;(collections as any)[name] = snap.docs.map(d => ({
      id: d.id,
      data: serializeBackupValue(d.data()),
    }))
    ;(counts as any)[name] = snap.size
  }

  return {
    app: 'BG Express',
    schema: 'firestore-backup-v1',
    exportedAt: new Date().toISOString(),
    collections,
    counts,
  }
}

export async function importSiteBackup(backup: any, importedBy = 'Admin') {
  if (!backup || backup.schema !== 'firestore-backup-v1' || !backup.collections) {
    throw new Error('Fichier de sauvegarde invalide.')
  }

  const summary = { collections: {}, total: 0 }
  const importedAt = new Date().toISOString()

  for (const [name, docs] of Object.entries(backup.collections)) {
    if (!BACKUP_COLLECTIONS.includes(name) || !Array.isArray(docs)) continue

    ;(summary.collections as any)[name] = docs.length
    summary.total += docs.length

    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db)
      docs.slice(i, i + 450).forEach(item => {
        if (!item?.id || !item.data) return
        batch.set(doc(db, name, item.id), reviveBackupValue(item.data), { merge: true })
      })
      await batch.commit()
    }
  }

  await addDoc(collection(db, 'backupImports'), {
    importedAt,
    importedBy,
    sourceExportedAt: backup.exportedAt || null,
    summary,
  })

  return summary
}
