import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const s = await db.collection('parcelsLite').where('status', '==', 'Arrivé en agence').where('isArchived', '==', false).get()
const mb = s.docs.reduce((a, d) => a + JSON.stringify(d.data()).length, 0) / 1e6
const l = s.docs.map(d => d.data()).filter(p => !p.isArchived && !(p.returnedAt || p.wasReturned) && !p.pickupDriverId)
console.log(`Arrivé en agence : ${s.size} (${mb.toFixed(1)} Mo) ; gardées : ${l.length}`)
const toD = v => v?.toDate ? v.toDate() : (v ? new Date(v) : null)
const now = Date.now(), c = {}
l.forEach(p => { const a = toD(p.destinationArrivedAt) || toD(p.chefPointedAt) || toD(p.createdAt); const k = p.destinationCity; c[k] ??= { n: 0, plus1j: 0, plus7j: 0 }; c[k].n++; const days = a ? (now - a) / 864e5 : 0; if (days > 1) c[k].plus1j++; if (days > 7) c[k].plus7j++ })
console.table(c)
process.exit(0)

