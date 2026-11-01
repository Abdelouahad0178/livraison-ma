// LECTURE SEULE : arrivages sans champ city
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const s = await admin.firestore().collection('arrivages').select('city').get()
console.log(`arrivages : ${s.size} | sans ville : ${s.docs.filter(d => !d.data().city).length}`)
process.exit(0)
