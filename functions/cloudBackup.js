/**
 * ☁️ Sauvegarde automatique dans Storage (auto-backups/), chaque dimanche — réécrite le 06/11/2026.
 *
 * Avant : collection(...).get() chargeait toutes les expéditions en mémoire, puis JSON.stringify d'un seul bloc → le serveur
 * (1 Go) s'arrêtait avec « JavaScript heap out of memory » : plus aucun fichier depuis le 13/09/2026.
 * Maintenant : lecture page par page, écriture compressée au fil de l'eau (mémoire stable). Mêmes collections et même format
 * que l'export manuel sur le PC (functions/shared/backupCloud.js). Le fichier n'apparaît dans Storage qu'une fois complet.
 *
 * LECTURE SEULE sur la base. Écrit seulement dans Storage. Rotation (10 fichiers) uniquement après une sauvegarde complète.
 */
'use strict'

const zlib = require('zlib')
const { once } = require('events')
const { pipeline } = require('stream/promises')
const { FieldPath } = require('firebase-admin/firestore')
const {
  BACKUP_COLLECTIONS, BACKUP_COLLECTION_END, BACKUP_FILE_PREFIX, MAX_CLOUD_BACKUPS, backupCollectionStart, backupDocLine, backupFileName,
  backupFooter, backupHeader, backupsToDelete, readPagesWithRetry, serializeBackupValue,
} = require('./shared/backupCloud')

async function runCloudBackup(db, bucket, { now = new Date(), collections = BACKUP_COLLECTIONS, log = console.log, retryDelayMs } = {}) {
  const startedAt = Date.now()
  const exportedAt = now.toISOString()
  const name = backupFileName(exportedAt)
  const file = bucket.file(name)
  const gz = zlib.createGzip({ level: 6 })
  const out = file.createWriteStream({ resumable: true, contentType: 'application/json', metadata: { contentEncoding: 'gzip' } })
  let uploadError = null
  const upload = pipeline(gz, out).catch(e => { uploadError = e })
  let chars = 0
  const write = async s => {
    if (uploadError) throw uploadError
    chars += s.length
    if (!gz.write(s)) await Promise.race([once(gz, 'drain'), upload.then(() => { if (uploadError) throw uploadError })])
  }

  const counts = {}
  const errors = {}
  try {
    await write(backupHeader(exportedAt))
    let firstCollection = true
    for (const coll of collections) {
      await write(backupCollectionStart(coll, firstCollection))
      firstCollection = false
      let firstDoc = true
      let docs = 0
      const fetchPage = async (after, size) => {
        let q = db.collection(coll).orderBy(FieldPath.documentId()).limit(size)
        if (after) q = q.startAfter(after)
        const s = await q.get()
        return s.docs.map(d => ({ id: d.id, data: d.data() }))
      }
      try {
        await readPagesWithRetry(fetchPage, async page => {
          let chunk = ''
          for (const d of page) { chunk += backupDocLine({ id: d.id, data: serializeBackupValue(d.data) }, firstDoc); firstDoc = false }
          docs += page.length
          await write(chunk)
        }, retryDelayMs === undefined ? {} : { retryDelayMs })
      } catch (err) {
        if (uploadError || err === uploadError) throw err
        errors[coll] = `${err?.message || err}${docs ? ` (${docs} document(s) seulement)` : ''}`
        log(`[backup] ${coll} incomplète : ${errors[coll]}`)
      }
      await write(BACKUP_COLLECTION_END)
      counts[coll] = docs
      if (docs) log(`[backup] ${coll}: ${docs} docs`)
    }
    await write(backupFooter(counts, errors))
    gz.end()
    await upload
    if (uploadError) throw uploadError
  } catch (err) {
    // Rien n'est gardé : l'envoi interrompu n'apparaît jamais comme un fichier dans Storage
    gz.destroy(err)
    await upload
    throw err
  }

  const documents = Object.values(counts).reduce((s, n) => s + n, 0)
  const errorCount = Object.keys(errors).length
  await file.setMetadata({ metadata: { exportedAt, documents: String(documents), errors: String(errorCount) } })

  // Rotation seulement si la sauvegarde est complète : une sauvegarde incomplète ne remplace jamais une bonne
  let deleted = 0
  if (!errorCount) {
    const [all] = await bucket.getFiles({ prefix: BACKUP_FILE_PREFIX })
    const old = backupsToDelete(all.map(f => f.name), MAX_CLOUD_BACKUPS)
    await Promise.all(old.map(n => bucket.file(n).delete()))
    deleted = old.length
  }
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  log(`[backup] Sauvegardé : ${name} — ${documents} documents, ${Math.round(chars / 1048576)} Mo avant compression, ${seconds} s, ${errorCount} collection(s) en erreur, ${deleted} ancien(s) fichier(s) retiré(s)`)
  return { name, documents, counts, errors, chars, seconds, deleted, exportedAt }
}

module.exports = { runCloudBackup }
