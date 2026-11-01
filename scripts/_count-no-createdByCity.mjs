// LECTURE SEULE : expéditions sans createdByCity (champ ville de création), par statut
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const total = (await db.collection('parcels').count().get()).data().count
const withField = (await db.collection('parcels').where('createdByCity', '>', '').count().get()).data().count
console.log(`parcels : ${total} | avec createdByCity : ${withField} | SANS : ${total - withField}`)
const ACTIVE = ['Initialisé', 'En transit', 'Arrivé en agence', 'En cours de livraison']
let act = 0, actNonArch = 0
for (const s of ACTIVE) {
  const all = (await db.collection('parcels').where('status', '==', s).select('createdByCity', 'isArchived').get()).docs
  const no = all.filter(d => !d.data().createdByCity)
  act += no.length; actNonArch += no.filter(d => !d.data().isArchived).length
  console.log(`  ${s.padEnd(22)} sans createdByCity : ${no.length} (non archivées : ${no.filter(d => !d.data().isArchived).length})`)
}
console.log(`actives sans createdByCity : ${act} (non archivées : ${actNonArch})`)
process.exit(0)
