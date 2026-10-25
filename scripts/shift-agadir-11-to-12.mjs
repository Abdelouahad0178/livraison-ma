/** Demande du 12/10/2026 : expéditions d'Agadir réellement saisies le 12/10/2026 (createTime Firestore, heure Maroc)
 *  mais datées du 11/10 (journée de travail restée au 11/10), quel que soit leur statut :
 *  jour d'opération → 2026-10-12, createdAt → heure réelle de saisie. Sauvegarde avant écriture. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const from = new Date('2026-10-12T00:00:00+01:00').getTime(), to = new Date('2026-10-13T00:00:00+01:00').getTime()
const s = await db.collection('parcels').where('originCity', '==', 'Agadir').where('workDate', '==', '2026-10-11').get()
const docs = s.docs.filter(d => { const t = d.createTime.toMillis(); return t >= from && t < to })
console.log(docs.length, 'expédition(s) à passer au 12/10/2026')
if (!APPLY) { console.log('simulation — relancer avec --apply'); process.exit(0) }
writeFileSync('scripts/shift-agadir-11-12-backup.json', JSON.stringify(docs.map(d => ({ id: d.id, senderNic: d.data().senderNic, createdAt: d.data().createdAt?.toDate?.().toISOString() || null, workDate: d.data().workDate, expeditionDate: d.data().expeditionDate || null }))))
const b = db.batch()
docs.forEach(d => b.update(d.ref, { workDate: '2026-10-12', createdAt: d.createTime, ...(d.data().expeditionDate ? { expeditionDate: '2026-10-12' } : {}) }))
await b.commit()
console.log(docs.length, 'expédition(s) corrigée(s) ; sauvegarde : scripts/shift-agadir-11-12-backup.json')
process.exit(0)
