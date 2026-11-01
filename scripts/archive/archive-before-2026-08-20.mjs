/** Archive (isArchived=true, même marquage que l'archivage automatique) les colis créés avant le
 *  20/08/2026 00:00 (heure Maroc). Usage: node scripts/archive-before-2026-08-20.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const cutoff = admin.firestore.Timestamp.fromDate(new Date('2026-08-20T00:00:00+01:00'))
const s = await db.collection('parcels').where('createdAt','<',cutoff).select('isArchived').get()
const todo = s.docs.filter(d => d.data().isArchived !== true)
console.log('créés avant le 20/08/2026 :', s.size, '| déjà archivés :', s.size - todo.length, '| à archiver :', todo.length)
if (APPLY && todo.length) {
  writeFileSync('scripts/archive-before-2026-08-20-backup.json', JSON.stringify(todo.map(d => d.id)))
  const now = new Date().toISOString()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(d => b.update(d.ref, { isArchived: true, archivedAt: now, archivedBy: 'admin-manual-2026-08-20' }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('archivés :', todo.length)
}
