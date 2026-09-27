/**
 * Backfill des champs de recherche normalisés senderNameNorm / receiverNameNorm
 * (minuscules, sans accents, espaces compactés : "COPÏMA" -> "copima") sur
 * `parcels` et `parcels_archive`.
 *
 * Usage :
 *   node scripts/backfill-name-norm.mjs           # dry-run (aucune écriture)
 *   node scripts/backfill-name-norm.mjs --apply   # écrit les champs manquants/différents
 *
 * Même normalisation que normName() de src/utils/billingAgency.ts.
 * Mise à jour limitée à ces 2 champs : onParcelWrite ne réagit qu'aux changements
 * de statut / livreur, donc aucune statistique n'est modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const BATCH_SIZE = 400
const PAGE_SIZE = 2000
const PAUSE_MS = 8000 // lent : chaque update déclenche onParcelWrite (écrit stats/global)

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const normName = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function processCollection(name) {
  const stats = { scanned: 0, toUpdate: 0, updated: 0 }
  let last = null
  let batch = db.batch()
  let inBatch = 0

  for (;;) {
    let q = db.collection(name)
      .orderBy(admin.firestore.FieldPath.documentId())
      .select('sender.name', 'receiver.name', 'senderNameNorm', 'receiverNameNorm')
      .limit(PAGE_SIZE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break

    for (const d of snap.docs) {
      stats.scanned++
      const data = d.data()
      const sNorm = normName(data.sender?.name)
      const rNorm = normName(data.receiver?.name)
      const patch = {}
      if (data.senderNameNorm !== sNorm) patch.senderNameNorm = sNorm
      if (data.receiverNameNorm !== rNorm) patch.receiverNameNorm = rNorm
      if (!Object.keys(patch).length) continue
      stats.toUpdate++
      if (!APPLY) continue
      batch.update(d.ref, patch)
      inBatch++
      if (inBatch >= BATCH_SIZE) {
        await batch.commit()
        stats.updated += inBatch
        batch = db.batch()
        inBatch = 0
        await sleep(PAUSE_MS)
      }
    }
    last = snap.docs[snap.docs.length - 1]
    console.log(`  ${name}: ${stats.scanned} lus, ${stats.toUpdate} à mettre à jour, ${stats.updated} écrits`)
  }
  if (APPLY && inBatch > 0) {
    await batch.commit()
    stats.updated += inBatch
  }
  return stats
}

const main = async () => {
  console.log(APPLY ? 'MODE APPLY (écriture)' : 'MODE DRY-RUN (aucune écriture)')
  for (const name of ['parcels', 'parcels_archive']) {
    const s = await processCollection(name)
    console.log(`${name}: lus=${s.scanned} aMettreAJour=${s.toUpdate} ecrits=${s.updated}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
