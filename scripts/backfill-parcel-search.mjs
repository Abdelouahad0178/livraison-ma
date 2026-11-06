/**
 * Rattrapage de l'index de recherche par mot (collection parcelSearch) à partir de parcels — 03/11/2026.
 *
 * Usage :
 *   node scripts/backfill-parcel-search.mjs            # essai (aucune écriture) : combien d'index à créer / corriger
 *   node scripts/backfill-parcel-search.mjs --apply    # écrit les index manquants ou différents
 *
 * Même règle que la Cloud Function syncParcelSearch (functions/shared/searchWords.js, compilé depuis
 * src/utils/searchWords.ts). N'écrit QUE dans parcelSearch : les expéditions ne sont ni modifiées ni relues
 * par un déclencheur (aucune fonction ne réagit aux écritures de parcelSearch).
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { searchDocOf } = require('../functions/shared/searchWords.js')

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 2000

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const stats = { scanned: 0, toWrite: 0, same: 0, written: 0, errors: 0, tokens: 0 }
let last = null
for (;;) {
  let q = db.collection('parcels').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  last = snap.docs[snap.docs.length - 1]
  const refs = snap.docs.map(d => db.collection('parcelSearch').doc(d.id))
  const cur = await db.getAll(...refs)
  const bw = APPLY ? db.bulkWriter() : null
  if (bw) bw.onWriteError(err => { if (err.failedAttempts < 3) return true; stats.errors++; return false })
  snap.docs.forEach((d, i) => {
    stats.scanned++
    const want = searchDocOf(d.data())
    stats.tokens += want.w.length
    const have = cur[i].exists ? cur[i].data() : null
    if (have && JSON.stringify({ w: have.w, d: have.d }) === JSON.stringify(want)) { stats.same++; return }
    stats.toWrite++
    if (bw) bw.set(refs[i], want).then(() => stats.written++).catch(() => {})
  })
  if (bw) await bw.close()
  console.log(`… ${stats.scanned} expéditions lues — index à écrire ${stats.toWrite}, écrits ${stats.written}`)
}
console.log(APPLY ? '\n✅ ÉCRIT' : '\n🔎 ESSAI (relancer avec --apply pour écrire)')
console.log({ ...stats, jetonsParExpedition: Math.round(stats.tokens / Math.max(1, stats.scanned)) })
process.exit(0)
