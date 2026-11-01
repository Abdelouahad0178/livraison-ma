// LECTURE SEULE : point 4 (liste « En gare » complète vs allégée) et point 3 (âge des expéditions actives de l'exploitation).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const sa = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const mb = docs => (docs.reduce((s, d) => s + JSON.stringify(d.data()).length, 0) / 1e6).toFixed(2)
const CITIES = ['Agadir', 'Casablanca', 'Marrakech', 'Ait Melloul']
for (const city of CITIES) {
  const q = col => db.collection(col).where('destinationCity', '==', city).where('status', '==', 'Arrivé en agence').where('isArchived', '==', false).get()
  const [full, lite] = await Promise.all([q('parcels'), q('parcelsLite')])
  console.log(`[4] ${city.padEnd(12)} En gare (Arrivé, non archivées) : ${full.size} exp. — complète ${mb(full.docs)} Mo, allégée ${mb(lite.docs)} Mo (lite ${lite.size})`)
}
const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 90 * 864e5))
for (const city of CITIES) {
  const ages = { '≤14 j': [0, 0], '15-30 j': [0, 0], '31-90 j': [0, 0] }
  let bytes = 0, n = 0
  for (const st of ['Arrivé en agence', 'En cours de livraison']) {
    const snap = await db.collection('parcelsLite').where('destinationCity', '==', city).where('status', '==', st)
      .where('createdAt', '>=', since).orderBy('createdAt', 'desc').get()
    for (const d of snap.docs) {
      const p = d.data(); if (p.isArchived) continue
      const days = (Date.now() - p.createdAt.toMillis()) / 864e5
      const s = JSON.stringify(p).length
      const k = days <= 14 ? '≤14 j' : days <= 30 ? '15-30 j' : '31-90 j'
      ages[k][0]++; ages[k][1] += s; bytes += s; n++
    }
  }
  console.log(`[3] ${city.padEnd(12)} actives 90 j : ${n} exp., ${(bytes / 1e6).toFixed(2)} Mo — ` +
    Object.entries(ages).map(([k, [c, b]]) => `${k}: ${c} (${(b / 1e6).toFixed(2)} Mo)`).join(' · '))
}
process.exit(0)
