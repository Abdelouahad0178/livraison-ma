/**
 * Rattrapage de la collection clientsLite (version allégée des clients) à partir de clients.
 *
 * Usage :
 *   node scripts/backfill-clients-lite.mjs           # dry-run (aucune écriture)
 *   node scripts/backfill-clients-lite.mjs --apply   # crée les copies manquantes
 *   node scripts/backfill-clients-lite.mjs --apply --fix   # + réécrit les copies différentes
 *
 * Même projection que la Cloud Function syncClientLite (functions/clientLite.js).
 * - Sans --fix : CRÉATION seulement (create() échoue si la copie existe déjà) → n'écrase jamais une version
 *   plus récente écrite entre-temps par la Cloud Function.
 * - N'écrit QUE dans clientsLite : la collection clients n'est jamais modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { projectClientLite } = require('../functions/clientLite.js')
const { liteKey } = require('../functions/parcelLite.js')

const APPLY = process.argv.includes('--apply')
const FIX = process.argv.includes('--fix')
const PAGE_SIZE = 2000

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const stats = { scanned: 0, existing: 0, toCreate: 0, created: 0, different: 0, fixed: 0, raced: 0 }
let last = null
for (;;) {
  let q = db.collection('clients').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  last = snap.docs[snap.docs.length - 1]
  const refs = snap.docs.map(d => db.collection('clientsLite').doc(d.id))
  const cur = await db.getAll(...refs)
  const bw = APPLY ? db.bulkWriter() : null
  bw?.onWriteError(err => {
    if (err.code === 6 /* ALREADY_EXISTS */) { stats.raced++; return false }
    return err.failedAttempts < 3
  })
  snap.docs.forEach((d, i) => {
    stats.scanned++
    const lite = projectClientLite(d.data())
    const data = { ...lite, liteUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }
    if (!cur[i].exists) {
      stats.toCreate++
      bw?.create(refs[i], data).then(() => stats.created++).catch(() => {})
      return
    }
    stats.existing++
    if (liteKey(projectClientLite(cur[i].data())) !== liteKey(lite)) {
      stats.different++
      if (FIX) bw?.set(refs[i], data).then(() => stats.fixed++).catch(() => {})
    }
  })
  if (bw) await bw.close()
  console.log(`… ${stats.scanned} clients lus — à créer ${stats.toCreate}, créés ${stats.created}, différents ${stats.different}`)
}
const [c, l] = await Promise.all([db.collection('clients').count().get(), db.collection('clientsLite').count().get()])
console.log(APPLY ? '\n✅ APPLY' : '\n🔎 DRY-RUN (relancer avec --apply pour écrire)')
console.log(stats, { clients: c.data().count, clientsLite: l.data().count })
process.exit(0)
