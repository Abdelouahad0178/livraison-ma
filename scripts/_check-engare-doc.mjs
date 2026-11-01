import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const d = (await admin.firestore().doc('users/OVMkys7PVFfx8zLvltBoQ4PN35x2').get()).data()
const safe = Object.fromEntries(Object.entries(d).filter(([k]) => !/pass|code|token|secret|pin/i.test(k)).map(([k, v]) => [k, v?.toDate ? v.toDate().toISOString() : v]))
console.log(JSON.stringify(safe, null, 1), '\nchamps masqués :', Object.keys(d).filter(k => /pass|code|token|secret|pin/i.test(k)))
process.exit(0)
