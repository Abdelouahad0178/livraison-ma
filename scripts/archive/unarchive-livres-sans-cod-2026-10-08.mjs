/** Annule l'archivage manuel « livrés sans COD avant le 08/10/2026 » : remet isArchived=false et
 *  retire archivedAt / archivedBy, UNIQUEMENT sur les colis de la sauvegarde encore marqués par cet
 *  archivage (archivedBy = admin-manual-livres-sans-cod-2026-10-08).
 *  Usage: node scripts/unarchive-livres-sans-cod-2026-10-08.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
const TAG = 'admin-manual-livres-sans-cod-2026-10-08'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const ids = JSON.parse(readFileSync('scripts/archive-livres-sans-cod-before-2026-10-08-backup.json', 'utf8'))
const refs = ids.map(id => db.collection('parcels').doc(id))
const snaps = []
for (let i = 0; i < refs.length; i += 300) snaps.push(...await db.getAll(...refs.slice(i, i + 300), { fieldMask: ['isArchived', 'archivedBy'] }))
const todo = snaps.filter(s => s.exists && s.get('isArchived') === true && s.get('archivedBy') === TAG)
console.log('dans la sauvegarde :', ids.length, '| encore marqués par cet archivage :', todo.length,
  '| autres (introuvables ou modifiés depuis) :', ids.length - todo.length)
if (APPLY && todo.length) {
  const del = admin.firestore.FieldValue.delete()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(s => b.update(s.ref, { isArchived: false, archivedAt: del, archivedBy: del }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('désarchivés :', todo.length)
}
