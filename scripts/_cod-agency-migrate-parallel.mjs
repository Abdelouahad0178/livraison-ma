// Conversion en parallèle des contributions COD encore à l'ancien format (sans cityList) — même fonction transactionnelle
// que la Cloud Function (syncCodAgency : idempotente, aucun double comptage). N'écrit que codAgencyContrib / codAgencyDays.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { syncCodAgency } = require('../functions/codAgency.js')
const { agencyCities } = require('../functions/portAgency.js')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const FV = admin.firestore.FieldValue
const cities = await agencyCities(db)
const snap = await db.collection('codAgencyContrib').select('cityList').get()
const ids = snap.docs.filter(d => !Array.isArray(d.get('cityList'))).map(d => d.id).reverse()
console.log(`à convertir : ${ids.length}`)
let done = 0, fixed = 0, i = 0
const worker = async () => {
  while (i < ids.length) {
    const id = ids[i++]
    const fresh = await db.collection('parcels').doc(id).get()
    if (await syncCodAgency(db, FV, id, fresh.exists ? fresh.data() : null, cities)) fixed++
    if (++done % 500 === 0) console.log(`… ${done}`)
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
console.log(`✅ ${done} vérifiée(s) · ${fixed} convertie(s)`)
process.exit(0)
