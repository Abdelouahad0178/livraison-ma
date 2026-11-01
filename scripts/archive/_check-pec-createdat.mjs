import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const s = await admin.firestore().collection('parcelsLite').where('portType', 'in', ['port_en_compte_expediteur', 'port_en_compte_destinataire', 'port_en_compte']).select('createdAt').get()
const t = {}; s.docs.forEach(d => { const v = d.get('createdAt'); const k = v?.toMillis ? 'Timestamp' : typeof v; t[k] = (t[k] || 0) + 1 })
console.log(t); process.exit(0)
