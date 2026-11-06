/**
 * Rattrapage des totaux de « Port par agence » (portAgencyContrib + portAgencyDays) — voir functions/portAgency.js.
 *   node scripts/backfill-port-agency.mjs            # simulation : totaux calculés par agence, rien n'est écrit
 *   node scripts/backfill-port-agency.mjs --apply    # 1er remplissage (copie VIDE seulement) : écriture par lots
 *   node scripts/backfill-port-agency.mjs --fix      # contrôle : chaque différence est corrigée en transaction
 *                                                     (idempotent, sûr pendant que la Cloud Function tourne)
 * Même règle que l'onglet et que la Cloud Function (functions/shared/portAgencyContribution.js, compilé depuis src/).
 * Lit la base ACTIVE (parcels, archivés compris — comme l'onglet). N'écrit que dans portAgencyContrib / portAgencyDays :
 * aucune expédition n'est modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { portAgencyOf, syncPortAgency, agencyCities, sameContribution, PORT_DAY_FIELDS, PORT_ALL_CITY } = require('../functions/portAgency.js')

const APPLY = process.argv.includes('--apply')
const FIX = process.argv.includes('--fix')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
db.settings({ preferRest: true })
const FV = admin.firestore.FieldValue
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

const FIELDS = ['originCity', 'destinationCity', 'sender.city', 'receiver.city', 'portType', 'portStatus', 'portPayeMethod', 'price',
  'status', 'workDate', 'createdAt', 'visibleInDestinationAgency', 'destinationArrivedAt', 'pickupDriverId', 'wasReturned',
  'shipmentLoadedAt', 'destinationAgentId', 'chauffeurId', 'portPayeExpReceivedAt', 'portCollectedById', 'portCollectedAt']

const cities = await agencyCities(db)
const contrib = new Map()
let read = 0
// Lecture par tranches de dates de création (la base active entière en une requête serait trop lourde)
const start = new Date('2025-01-01T00:00:00Z'), end = new Date(Date.now() + 2 * 86400e3)
for (let t = start.getTime(); t < end.getTime(); t += 15 * 86400e3) {
  const snap = await db.collection('parcels').where('createdAt', '>=', new Date(t)).where('createdAt', '<', new Date(t + 15 * 86400e3)).select(...FIELDS).get()
  read += snap.size
  for (const d of snap.docs) { const c = portAgencyOf(d.data(), cities); if (c) contrib.set(d.id, c) }
}
// (expéditions sans date de création : jamais chargées par l'onglet non plus)
const days = new Map()
for (const c of contrib.values()) {
  for (const [city, v] of Object.entries(c.cities)) {
    const k = `${c.day}_${safeId(city)}`
    const d = days.get(k) || { city, day: c.day, ...Object.fromEntries(PORT_DAY_FIELDS.map(f => [f, 0])) }
    for (const f of PORT_DAY_FIELDS) d[f] = r2(d[f] + (Number(v[f]) || 0))
    days.set(k, d)
  }
  if (c.union) {
    const k = `${c.day}_${safeId(PORT_ALL_CITY)}`
    const d = days.get(k) || { city: PORT_ALL_CITY, day: c.day, nUnion: 0 }
    d.nUnion++
    days.set(k, d)
  }
}
console.log(`Agences : ${cities.join(', ')}`)
console.log(`Expédition(s) lue(s) : ${read} · contribuent : ${contrib.size} · documents de journée : ${days.size}`)
const byCity = {}
for (const d of days.values()) {
  if (d.city === PORT_ALL_CITY) continue
  const t = byCity[d.city] || (byCity[d.city] = { th: 0, ph: 0, nb: 0 })
  t.th = r2(t.th + d.th_portPaye + d.th_portDu + d.th_portDuCheque); t.ph = r2(t.ph + d.ph_portPaye + d.ph_portDu + d.ph_portDuCheque); t.nb += d.nbExp
}
for (const [city, t] of Object.entries(byCity).sort()) console.log(`  ${city.padEnd(12)} théorique ${String(t.th).padStart(10)} DH · en caisse ${String(t.ph).padStart(10)} DH · ${t.nb} exp.`)

const existing = await db.collection('portAgencyContrib').select().limit(1).get()
if (APPLY) {
  if (!existing.empty) { console.log('⛔ portAgencyContrib contient déjà des documents : utilisez --fix (aucune écriture faite).'); process.exit(1) }
  const bw = db.bulkWriter()
  const ts = FV.serverTimestamp()
  for (const [id, c] of contrib) bw.set(db.collection('portAgencyContrib').doc(id), { ...c, updatedAt: ts })
  for (const [k, d] of days) bw.set(db.collection('portAgencyDays').doc(k), { ...d, updatedAt: ts })
  await bw.close()
  console.log(`✅ Écrit : ${contrib.size} contribution(s), ${days.size} document(s) de journée.`)
}
if (FIX) {
  const saved = new Map()
  ;(await db.collection('portAgencyContrib').get()).docs.forEach(d => saved.set(d.id, d.data()))
  const ids = new Set([...contrib.keys(), ...saved.keys()])
  let fixed = 0, checked = 0
  for (const id of ids) {
    checked++
    if (sameContribution(saved.get(id) || null, contrib.get(id) || null)) continue
    const fresh = await db.collection('parcels').doc(id).get()
    if (await syncPortAgency(db, FV, id, fresh.exists ? fresh.data() : null, cities)) fixed++
  }
  console.log(`🔧 Contrôle : ${checked} vérifiée(s) · ${fixed} corrigée(s).`)
}
process.exit(0)
