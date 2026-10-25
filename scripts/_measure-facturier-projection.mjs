// LECTURE SEULE : taille moyenne d'une expédition (complète / allégée / copie facturier proposée). Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const TOP = ['portType', 'originCity', 'destinationCity', 'recipientCity', 'trackingId', 'clientName', 'clientId', 'status',
  'price', 'numberOfParcels', 'nbColis', 'isArchived', 'invoiced', 'createdAt', 'workDate',
  'codAmount', 'codMixed', 'codCashAmount', 'serviceType', 'codPaymentType']
const SUB = ['name', 'city', 'nic', 'tel']
const project = (v) => {
  const o = {}
  for (const k of TOP) if (v[k] !== undefined) o[k] = v[k]
  for (const s of ['sender', 'receiver']) if (v[s] && typeof v[s] === 'object') {
    o[s] = {}; for (const k of SUB) if (v[s][k] !== undefined) o[s][k] = v[s][k]
  }
  return o
}
const a = new Date(Date.now() - 6 * 86400000), b = new Date(a.getTime() + 86400000)
const q = (c) => db.collection(c).where('createdAt', '>=', admin.firestore.Timestamp.fromDate(a)).where('createdAt', '<', admin.firestore.Timestamp.fromDate(b)).get()
const [full, lite] = await Promise.all([q('parcels'), q('parcelsLite')])
const size = (o) => Buffer.byteLength(JSON.stringify(o))
const avg = (docs, f = (x) => x) => docs.reduce((t, d) => t + size(f(d.data())), 0) / docs.length / 1024
console.log(`Journée ${a.toISOString().slice(0, 10)} : ${full.size} expéditions`)
console.log(`  complète  : ${avg(full.docs).toFixed(2)} Ko / expédition`)
console.log(`  allégée   : ${avg(lite.docs).toFixed(2)} Ko / expédition`)
console.log(`  facturier : ${avg(full.docs, project).toFixed(2)} Ko / expédition`)
process.exit(0)
