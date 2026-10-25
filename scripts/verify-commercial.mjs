// Lecture seule : compare tous les compteurs commerciaux à un recalcul complet (node scripts/verify-commercial.mjs).
// Quelques écarts sur le jour en cours = expéditions modifiées pendant la vérification (les totaux sont alors plus récents).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const { contributionOf, NUM_FIELDS } = createRequire(import.meta.url)('../functions/commercial.js')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(); db.settings({ preferRest: true })
const exp = new Map(), seen = new Set()
for (const c of ['parcels', 'parcels_archive']) (await db.collection(c).select('createdAt', 'senderNameNorm', 'sender', 'senderName', 'clientName', 'originCity', 'createdByCity', 'status', 'price', 'portType', 'codAmount', 'nbColis').get()).docs.forEach(d => {
  if (seen.has(d.id)) return; seen.add(d.id); const k = contributionOf(d.data()); if (!k) return
  for (const path of Object.values(k.targets)) { const t = exp.get(path) || Object.fromEntries(NUM_FIELDS.map(f => [f, 0])); NUM_FIELDS.forEach(f => { t[f] += k.values[f] }); exp.set(path, t) }
})
let diff = 0, n = 0
for (const coll of ['commercialAgencies', 'commercialClients', 'commercialDays']) {
  for (const d of (await db.collection(coll).get()).docs) {
    n++
    const e = exp.get(`${coll}/${d.id}`) || {}, s = d.data()
    const bad = NUM_FIELDS.filter(f => Math.abs((e[f] || 0) - (s[f] || 0)) > 0.01)
    if (bad.length) { diff++; if (diff < 15) console.log('ÉCART', coll, d.id, bad.map(f => `${f} ${s[f]}≠${e[f]}`).join(', ')) }
  }
}
console.log('documents vérifiés', n, '; écarts', diff)
process.exit(0)
