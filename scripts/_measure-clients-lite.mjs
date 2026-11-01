import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
for (const c of ['Agadir', 'Marrakech', 'Casablanca']) {
  const [f, l] = await Promise.all(['clients', 'clientsLite'].map(col => db.collection(col).where('city', '==', c).get()))
  const mb = s => (s.docs.reduce((a, d) => a + JSON.stringify(d.data()).length, 0) / 1e6).toFixed(2)
  console.log(`${c.padEnd(11)} ${f.size} fiches : ${mb(f)} Mo → ${l.size} fiches : ${mb(l)} Mo`)
}
process.exit(0)
