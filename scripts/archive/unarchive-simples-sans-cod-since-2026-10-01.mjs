/** Correction de l'admin (22/10/2026) : l'archivage « simples sans COD » devait s'arrêter au 01/10/2026 (et non au 20/10).
 *  Désarchive, parmi les expéditions archivées par cet archivage (sauvegarde + archivedBy = TAG), celles CRÉÉES à partir
 *  du 01/10/2026 00:00 (heure Maroc). Celles d'avant le 01/10 restent archivées.
 *  Sans --apply : comptage seulement. Avec --apply : sauvegarde des ids désarchivés puis écriture. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
const TAG = 'admin-manual-simples-sans-cod-2026-10-20'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const since = new Date('2026-10-01T00:00:00+01:00').getTime()
const ids = JSON.parse(readFileSync('scripts/archive-simples-sans-cod-before-2026-10-20-livres-skipmoney-backup.json', 'utf8')).map(x => x.id)
const refs = ids.map(id => db.collection('parcels').doc(id))
const snaps = []
for (let i = 0; i < refs.length; i += 300) snaps.push(...await db.getAll(...refs.slice(i, i + 300), { fieldMask: ['isArchived', 'archivedBy', 'createdAt', 'destinationCity'] }))
const mine = snaps.filter(s => s.exists && s.get('isArchived') === true && s.get('archivedBy') === TAG)
const todo = mine.filter(s => (s.get('createdAt')?.toMillis?.() ?? 0) >= since)
const keep = mine.length - todo.length
const byCity = todo.reduce((m, s) => { const c = s.get('destinationCity') || '?'; m[c] = (m[c] || 0) + 1; return m }, {})
console.log(`archivées par cet archivage : ${mine.length} | créées à partir du 01/10 → à désarchiver : ${todo.length} | avant le 01/10 → restent archivées : ${keep}`)
console.log('  à désarchiver par ville :', byCity)
if (APPLY && todo.length) {
  writeFileSync('scripts/unarchive-simples-sans-cod-since-2026-10-01-backup.json', JSON.stringify(todo.map(s => s.id)))
  const del = admin.firestore.FieldValue.delete()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(s => b.update(s.ref, { isArchived: false, archivedAt: del, archivedBy: del }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('désarchivées :', todo.length)
}
process.exit(0)
