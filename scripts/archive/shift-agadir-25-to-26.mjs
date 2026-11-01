/** Décale au 26/09/2026 les colis d'Agadir créés le 25/09/2026 à 12:00:00Z. Usage: node ... [--apply] */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const T = admin.firestore.Timestamp
const s = await db.collection('parcels').where('createdAt','==',T.fromDate(new Date('2026-09-25T12:00:00Z'))).get()
const docs = s.docs.filter(d => d.data().originCity === 'Agadir')
console.log(docs.length, 'colis')
if (APPLY) {
  writeFileSync('scripts/shift-agadir-backup.json', JSON.stringify(docs.map(d => ({ id: d.id, createdAt: '2026-09-25T12:00:00.000Z', workDate: d.data().workDate }))))
  const nc = T.fromDate(new Date('2026-09-26T12:00:00Z'))
  for (let i=0;i<docs.length;i+=400){ const b=db.batch(); docs.slice(i,i+400).forEach(d=>b.update(d.ref,{createdAt:nc, workDate:'2026-09-26'})); await b.commit() }
  console.log('appliqué')
}
