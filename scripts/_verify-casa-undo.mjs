import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const f = readdir => readFileSync
const bk = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const db = admin.firestore()
const snaps = await db.getAll(...bk.map(p => db.doc(`parcels/${p.id}`)))
const lite = await db.getAll(...bk.map(p => db.doc(`parcelsLite/${p.id}`)))
const ok = snaps.filter(s => s.get('status') === 'Arrivé en agence' && !s.get('deliveredAt')).length
const okL = lite.filter(s => s.get('status') === 'Arrivé en agence' && !s.get('deliveredAt')).length
console.log(`Vérification : parcels ${ok}/${bk.length} « Arrivé en agence » sans date de livraison ; copie allégée ${okL}/${bk.length}`)
process.exit(0)
