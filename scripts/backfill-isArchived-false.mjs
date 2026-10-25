/** Ajoute isArchived:false aux colis NON archivés où le champ est absent (requête « En gare » filtrée
 *  côté serveur sur isArchived == false). Purement additif : aucun autre champ n'est touché.
 *  Usage: node scripts/backfill-isArchived-false.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const sleep = ms => new Promise(r => setTimeout(r, ms))
let last = null, seen = 0, missing = 0, isTrue = 0, isFalse = 0, other = 0, written = 0
const todo = []
while (true) {
  let q = db.collection('parcels').select('isArchived').orderBy(admin.firestore.FieldPath.documentId()).limit(2000)
  if (last) q = q.startAfter(last)
  const s = await q.get(); if (s.empty) break
  last = s.docs[s.size - 1]; seen += s.size
  for (const d of s.docs) {
    const v = d.get('isArchived')
    if (v === undefined) { missing++; todo.push(d.ref) }
    else if (v === true) isTrue++
    else if (v === false) isFalse++
    else other++
  }
}
console.log({ seen, missing, isTrue, isFalse, autreValeur: other, apply: APPLY })
if (APPLY) {
  // Par lot de 400 : relecture juste avant l'écriture (champ toujours absent ? colis toujours là ?)
  // + précondition lastUpdateTime → un colis modifié/archivé entre-temps n'est jamais écrasé
  // (le lot échoue et est rejoué après relecture).
  let skipped = 0
  for (let i = 0; i < todo.length; i += 400) {
    const refs = todo.slice(i, i + 400)
    for (let attempt = 1; ; attempt++) {
      const snaps = await db.getAll(...refs, { fieldMask: ['isArchived'] })
      const b = db.batch(); let k = 0
      for (const sn of snaps) {
        if (!sn.exists || sn.get('isArchived') !== undefined) continue
        b.update(sn.ref, { isArchived: false }, { lastUpdateTime: sn.updateTime }); k++
      }
      try { if (k) await b.commit(); written += k; skipped += refs.length - k; break }
      catch (e) { if (attempt >= 5) throw e; console.warn('  lot rejoué :', e.message); await sleep(1000) }
    }
    console.log(`  ${Math.min(i + 400, todo.length)}/${todo.length} (écrits ${written})`)
    await sleep(1500)
  }
  console.log({ written, skipped })
}
