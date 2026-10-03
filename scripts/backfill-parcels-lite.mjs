/**
 * Backfill de la collection parcelsLite (version allégée des expéditions) à partir de parcels.
 *
 * Usage :
 *   node scripts/backfill-parcels-lite.mjs           # dry-run (aucune écriture)
 *   node scripts/backfill-parcels-lite.mjs --apply   # crée les miroirs manquants
 *   node scripts/backfill-parcels-lite.mjs --apply --fix   # + réécrit les miroirs différents
 *
 * Même projection que la Cloud Function syncParcelLite (functions/parcelLite.js).
 * - Sans --fix : CRÉATION seulement (create() échoue si le miroir existe déjà) → ne peut jamais
 *   écraser une version plus récente écrite entre-temps par la Cloud Function.
 * - N'écrit QUE dans parcelsLite : aucun déclencheur sur parcels (onParcelWrite, syncParcelLite)
 *   n'est activé par ce script.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { projectParcelLite, liteKey } = require('../functions/parcelLite.js')

const APPLY = process.argv.includes('--apply')
const FIX = process.argv.includes('--fix')
const BATCH_SIZE = 400
const PAGE_SIZE = 2000
const PAUSE_MS = 1500

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const stats = { scanned: 0, existing: 0, created: 0, toCreate: 0, different: 0, fixed: 0, raced: 0, orphans: 0 }
let last = null
for (;;) {
  let q = db.collection('parcels').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  last = snap.docs[snap.docs.length - 1]

  const liteRefs = snap.docs.map(d => db.collection('parcelsLite').doc(d.id))
  const liteSnaps = await db.getAll(...liteRefs)
  const ops = []
  snap.docs.forEach((d, i) => {
    stats.scanned++
    const lite = projectParcelLite(d.data())
    const cur = liteSnaps[i]
    if (!cur.exists) { stats.toCreate++; ops.push({ kind: 'create', ref: liteRefs[i], lite }); return }
    stats.existing++
    if (liteKey(projectParcelLite(cur.data())) !== liteKey(lite)) {
      stats.different++
      if (FIX) ops.push({ kind: 'set', ref: liteRefs[i], lite })
    }
  })

  if (APPLY) {
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const chunk = ops.slice(i, i + BATCH_SIZE)
      // create() dans un batch : un seul miroir déjà présent ferait échouer tout le lot →
      // BulkWriter, qui traite chaque écriture indépendamment.
      const bw = db.bulkWriter()
      bw.onWriteError(err => {
        if (err.code === 6 /* ALREADY_EXISTS */) { stats.raced++; return false }
        return err.failedAttempts < 3
      })
      for (const op of chunk) {
        const data = { ...op.lite, liteUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }
        if (op.kind === 'create') bw.create(op.ref, data).then(() => stats.created++).catch(() => {})
        else bw.set(op.ref, data).then(() => stats.fixed++).catch(() => {})
      }
      await bw.close()
      await sleep(PAUSE_MS)
    }
  }
  console.log(`… ${stats.scanned} colis lus — à créer ${stats.toCreate}, créés ${stats.created}, différents ${stats.different}`)
}

// Miroirs orphelins (colis supprimé) — compté seulement
const liteCount = (await db.collection('parcelsLite').count().get()).data().count
const parcelCount = (await db.collection('parcels').count().get()).data().count
stats.orphans = Math.max(0, liteCount - parcelCount)

console.log(APPLY ? '\n✅ APPLY' : '\n🔎 DRY-RUN (relancer avec --apply pour écrire)')
console.log(stats)
console.log({ parcels: parcelCount, parcelsLite: liteCount })
process.exit(0)
