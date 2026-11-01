import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const u = await admin.auth().getUserByEmail('zahra@gmail.com')
const p = (await admin.firestore().collection('users').doc(u.uid).get()).data() || {}
console.log({ uid: u.uid, role: p.role, city: p.city, name: p.name, blocked: p.blocked ?? null, disabled: u.disabled })
process.exit(0)
