/** Colis d'Agadir réellement créés le 28/09/2026 entre 12h et 22h (heure Maroc, createTime Firestore)
 *  mais datés du 26/09 : jour d'opération → 2026-09-28, createdAt → heure réelle de création. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const from = new Date('2026-09-28T12:00:00+01:00').getTime(), to = new Date('2026-09-28T22:00:00+01:00').getTime()
const s = await db.collection('parcels').where('originCity','==','Agadir').where('workDate','==','2026-09-26').get()
const docs = s.docs.filter(d => { const t = d.createTime.toMillis(); return t >= from && t < to })
writeFileSync('scripts/shift-agadir-26-28-backup.json', JSON.stringify(docs.map(d => ({ id: d.id, createdAt: d.data().createdAt.toDate().toISOString(), workDate: d.data().workDate, expeditionDate: d.data().expeditionDate || null }))))
const b = db.batch()
docs.forEach(d => b.update(d.ref, { workDate: '2026-09-28', createdAt: d.createTime, ...(d.data().expeditionDate ? { expeditionDate: '2026-09-28' } : {}) }))
await b.commit()
console.log(docs.length, 'colis corrigés')
