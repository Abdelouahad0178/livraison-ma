import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const au = await admin.auth().getUserByEmail('zinebechef@gmail.com')
const u = (await db.doc(`users/${au.uid}`).get()).data() || {}
console.log('uid', au.uid, '|', u.name, '|', u.role, '|', u.city)
const T = admin.firestore.Timestamp
for (const f of ['destinationCity', 'originCity']) {
  const s = await db.collection('parcelsLite').where(f, '==', u.city).where('createdAt', '>=', T.fromDate(new Date('2026-10-07T00:00:00'))).where('createdAt', '<', T.fromDate(new Date('2026-10-08T12:00:00'))).orderBy('createdAt', 'desc').get()
  const l = s.docs.map(d => d.data()).filter(p => p.workDate === '2026-10-07')
  const pd = l.filter(p => p.portType === 'port_du'), cod = l.filter(p => (p.codAmount || 0) > 0)
  console.log(`${f}=${u.city} créées le 07/10 : ${l.length} | port dû non encaissé ${pd.filter(p => !['collected','received'].includes(p.portStatus)).length}/${pd.length} | COD non encaissé ${cod.filter(p => !p.codStatus || p.codStatus === 'pending').length}/${cod.length} | port payé non reçu ${l.filter(p => p.portType === 'port_paye' && p.portStatus !== 'received').length}`)
  const st = {}; l.forEach(p => st[p.status] = (st[p.status] || 0) + 1); console.log('   statuts', st)
}
process.exit(0)

