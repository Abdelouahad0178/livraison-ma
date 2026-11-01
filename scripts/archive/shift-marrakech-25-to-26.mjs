/** Décale au 26/09/2026 les colis de Marrakech créés le 25/09/2026 à 11:00:00Z. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const s = await db.collection('parcels').where('createdAt','==',T.fromDate(new Date('2026-09-25T11:00:00Z'))).get()
const docs = s.docs.filter(d => d.data().originCity === 'Marrakech' && d.data().workDate === '2026-09-25')
writeFileSync('scripts/shift-marrakech-backup.json', JSON.stringify(docs.map(d => ({ id: d.id, createdAt: '2026-09-25T11:00:00.000Z', workDate: '2026-09-25' }))))
const nc = T.fromDate(new Date('2026-09-26T11:00:00Z'))
for (let i=0;i<docs.length;i+=400){ const b=db.batch(); docs.slice(i,i+400).forEach(d=>b.update(d.ref,{createdAt:nc, workDate:'2026-09-26'})); await b.commit() }
console.log(docs.length, 'appliqué')
