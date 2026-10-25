// LECTURE SEULE : argent détenu par les livreurs — format de portCollectedAt / codCollectedAt, volumes par livreur.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const drivers = (await db.collection('users').where('role', '==', 'livreur').get()).docs
const START = new Date(2026, 9, 5, 8).getTime()
const t = v => v == null ? null : typeof v === 'string' ? Date.parse(v) : v.toMillis ? v.toMillis() : null
let rows = []
const types = {}
for (const d of drivers) {
  const pd = await db.collection('parcels').where('deliveryDriverId', '==', d.id).where('portType', '==', 'port_du').where('portStatus', '==', 'collected').get()
  const cod = await db.collection('parcels').where('deliveryDriverId', '==', d.id).where('codStatus', 'in', ['collected_by_driver', 'collected_at_destination', 'collected', 'remis']).get()
  if (!pd.size && !cod.size) continue
  let noAt = 0, after = 0, held = 0, heldNoAt = 0
  for (const x of pd.docs) { const p = x.data(); const k = typeof p.portCollectedAt; types[k] = (types[k] || 0) + 1
    const at = t(p.portCollectedAt); if (at == null) noAt++; else if (at >= START) after++
    if (!p.portChefReceivedAt && !p.portExpReceivedAt) { if (at == null) heldNoAt++; else if (at >= START) held++ } }
  rows.push({ n: d.data().name || d.id.slice(0, 6), city: d.data().city, pd: pd.size, pdApres: after, pdSansDate: noAt, pdDetenus: held, pdDetenusSansDate: heldNoAt, cod: cod.size })
}
rows.sort((a, b) => b.pd - a.pd)
console.log('Types portCollectedAt :', types)
console.table(rows.slice(0, 25))
console.log('Total livreurs avec argent :', rows.length, '| max port dû collecté :', Math.max(...rows.map(r => r.pd)), '| max COD :', Math.max(...rows.map(r => r.cod)))
process.exit(0)
