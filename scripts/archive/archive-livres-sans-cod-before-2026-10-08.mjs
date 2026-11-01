/** Archive (isArchived=true, même marquage que l'archivage automatique) les colis « Livré » SANS COD
 *  créés avant le 08/10/2026 00:00 (heure Maroc). Ne modifie pas les règles d'archivage.
 *  Sauvegarde des ids archivés pour retour arrière.
 *  Usage: node scripts/archive-livres-sans-cod-before-2026-10-08.mjs [--apply] [--skip-port-du]
 *  --skip-port-du : laisse de côté les ports dus pas encore collectés. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
const SKIP_PORT_DU = process.argv.includes('--skip-port-du')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const cutoff = admin.firestore.Timestamp.fromDate(new Date('2026-10-08T00:00:00+01:00'))
const s = await db.collection('parcels').where('status', '==', 'Livré').where('createdAt', '<', cutoff)
  .select('isArchived', 'codAmount', 'portType', 'portPayeMethod', 'portStatus', 'createdAt', 'destinationCity').get()
const livresSansCod = s.docs.filter(d => !(Number(d.get('codAmount')) > 0))
const notArchived = livresSansCod.filter(d => d.get('isArchived') !== true)
const portDuNonCollecte = notArchived.filter(d => d.get('portType') === 'port_du' && !d.get('portPayeMethod')
  && !['collected', 'received'].includes(d.get('portStatus')))
const todo = SKIP_PORT_DU ? notArchived.filter(d => !portDuNonCollecte.includes(d)) : notArchived

const byMonth = {}, byCity = {}
todo.forEach(d => {
  const m = d.get('createdAt')?.toDate?.().toISOString().slice(0, 7) || '?'
  byMonth[m] = (byMonth[m] || 0) + 1
  const c = d.get('destinationCity') || '?'
  byCity[c] = (byCity[c] || 0) + 1
})
console.log('Livrés créés avant le 08/10/2026 :', s.size, '| dont sans COD :', livresSansCod.length,
  '| déjà archivés :', livresSansCod.length - notArchived.length, '| non archivés :', notArchived.length)
console.log('  dont port dû PAS encore collecté :', portDuNonCollecte.length)
console.log('À archiver' + (SKIP_PORT_DU ? ' (ports dus non collectés exclus)' : '') + ' :', todo.length)
console.log('  par mois de création :', byMonth)
console.log('  par ville de destination :', byCity)
if (APPLY && todo.length) {
  writeFileSync('scripts/archive-livres-sans-cod-before-2026-10-08-backup.json', JSON.stringify(todo.map(d => d.id)))
  const now = new Date().toISOString()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(d => b.update(d.ref, { isArchived: true, archivedAt: now, archivedBy: 'admin-manual-livres-sans-cod-2026-10-08' }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('archivés :', todo.length)
}
