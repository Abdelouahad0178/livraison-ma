// LECTURE SEULE : expéditions d'une ville sur une journée d'opération (08:00 → 06:00), départ + arrivée sans doublon
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const [city, day] = process.argv.slice(2)
const s = new Date(day + 'T08:00:00+01:00'), e = new Date(s.getTime() + 22 * 3600e3)
const ids = new Set()
for (const f of ['originCity', 'destinationCity']) {
  const snap = await admin.firestore().collection('parcels').where(f, '==', city).where('createdAt', '>=', s).where('createdAt', '<', e).orderBy('createdAt', 'desc').select().get()
  snap.docs.forEach(d => ids.add(d.id))
}
console.log(city, day, ':', ids.size, 'expéditions')
process.exit(0)
