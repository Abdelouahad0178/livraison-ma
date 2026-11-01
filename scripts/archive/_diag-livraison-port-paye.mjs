// LECTURE SEULE : « Port payé » de l'en-tête « Livraison du jour » (workDate du lot, villes de départ) — détail.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const DAY = process.argv[2] || '2026-10-29'
const CITIES = (process.argv[3] || 'Agadir,Ait Melloul').split(',')
const s = await db.collection('parcelsLite').where('workDate', 'in', [DAY]).where('originCity', 'in', CITIES).get()
const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== 'Annulé')
const pp = rows.filter(p => p.portType === 'port_paye' && Number(p.price) > 0)
const key = p => `${p.originCity} → ${p.destinationCity === p.originCity ? 'local' : 'autre ville'} | ${p.portStatus || '-'} | ${p.portGuichetHolderName ? 'détenteur ' + p.portGuichetHolderName : p.pickupDriverName ? 'ramasseur ' + p.pickupDriverName : 'sans détenteur'} | ${p.status}`
const by = {}
for (const p of pp) { const k = key(p); by[k] = by[k] || { n: 0, m: 0, nics: [] }; by[k].n++; by[k].m += Number(p.price); if (by[k].nics.length < 6) by[k].nics.push(`${p.senderNic || p.trackingId}:${p.price}`) }
console.log(`workDate ${DAY}, départ ${CITIES.join('+')} : ${rows.length} exp., port payé ${pp.length} · ${pp.reduce((a, p) => a + Number(p.price), 0)} DH`)
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].m - a[1].m)) console.log(`  ${k} : ${v.n} · ${v.m} DH  ${v.nics.join(' ')}`)
// Créées le 29/10 (journée d'opération) mais workDate différent ?
const from = admin.firestore.Timestamp.fromDate(new Date(`${DAY}T08:00:00+01:00`)), to = admin.firestore.Timestamp.fromDate(new Date(new Date(`${DAY}T08:00:00+01:00`).getTime() + 22 * 3600e3))
for (const c of CITIES) {
  const q = await db.collection('parcelsLite').where('originCity', '==', c).where('createdAt', '>=', from).where('createdAt', '<', to).orderBy('createdAt').get()
  const ppc = q.docs.map(d => d.data()).filter(p => p.portType === 'port_paye' && p.status !== 'Annulé')
  console.log(`créées journée ${DAY} départ ${c} : port payé ${ppc.length} · ${ppc.reduce((a, p) => a + (Number(p.price) || 0), 0)} DH | workDate ≠ ${DAY} : ${ppc.filter(p => p.workDate !== DAY).length}`)
}
process.exit(0)
