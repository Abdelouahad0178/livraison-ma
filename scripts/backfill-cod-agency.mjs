/**
 * Rattrapage des totaux de « COD par agence » (codAgencyContrib + codAgencyDays) — voir functions/codAgency.js.
 *   node scripts/backfill-cod-agency.mjs            # simulation : totaux calculés par agence, rien n'est écrit
 *   node scripts/backfill-cod-agency.mjs --apply    # 1er remplissage (copie VIDE seulement) : écriture par lots
 *   node scripts/backfill-cod-agency.mjs --fix      # contrôle : chaque différence est corrigée en transaction
 * Même règle que l'onglet et que la Cloud Function (functions/shared/codAgencyContribution.js, compilé depuis src/).
 * Lit la base ACTIVE (parcels, expéditions complètes, archivées comprises — comme l'onglet), par tranches de 15 jours.
 * N'écrit que dans codAgencyContrib / codAgencyDays : aucune expédition n'est modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { codAgencyOf, syncCodAgency, sameContribution, codDayDeltas, COD_ALL_CITY } = require('../functions/codAgency.js')
const { agencyCities } = require('../functions/portAgency.js')

const APPLY = process.argv.includes('--apply')
const FIX = process.argv.includes('--fix')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
db.settings({ preferRest: true })
const FV = admin.firestore.FieldValue
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

const cities = await agencyCities(db)
const contrib = new Map()
let read = 0
const start = new Date('2025-01-01T00:00:00Z'), end = new Date(Date.now() + 2 * 86400e3)
for (let t = start.getTime(); t < end.getTime(); t += 15 * 86400e3) {
  const snap = await db.collection('parcels').where('createdAt', '>=', new Date(t)).where('createdAt', '<', new Date(t + 15 * 86400e3)).get()
  read += snap.size
  for (const d of snap.docs) { const c = codAgencyOf(d.data(), cities); if (c) contrib.set(d.id, c) }
}
// Documents de journée = somme des différences de chaque contribution (même règle que la Cloud Function : codDayDeltas)
const days = new Map()
for (const c of contrib.values()) {
  for (const x of codDayDeltas(c, 1)) {
    const k = `${x.day}_${safeId(x.city)}`
    const d = days.get(k) || { city: x.city, day: x.day }
    for (const [f, n] of Object.entries(x.nums)) d[f] = r2((d[f] || 0) + n)
    for (const { path, n } of x.nested) {
      let o = d
      for (const key of path.slice(0, -1)) o = o[key] || (o[key] = {})
      const last = path[path.length - 1]
      o[last] = r2((o[last] || 0) + n)
    }
    days.set(k, d)
  }
}
console.log(`Agences : ${cities.join(', ')}`)
console.log(`Expédition(s) lue(s) : ${read} · contribuent : ${contrib.size} · documents de journée : ${days.size}`)
const byCity = {}
for (const d of days.values()) {
  if (d.city === COD_ALL_CITY) continue
  const t = byCity[d.city] || (byCity[d.city] = { attendu: 0, encaisse: 0, nb: 0 })
  t.attendu = r2(t.attendu + d.th_rcv_total); t.encaisse = r2(t.encaisse + d.ph_rcv_total); t.nb += d.th_rcv_nbExp
}
for (const [city, t] of Object.entries(byCity).sort()) console.log(`  ${city.padEnd(12)} reçues : à encaisser ${String(t.attendu).padStart(11)} DH · encaissé ${String(t.encaisse).padStart(11)} DH · ${t.nb} exp.`)

const existing = await db.collection('codAgencyContrib').select().limit(1).get()
if (APPLY) {
  if (!existing.empty) { console.log('⛔ codAgencyContrib contient déjà des documents : utilisez --fix (aucune écriture faite).'); process.exit(1) }
  const bw = db.bulkWriter()
  const ts = FV.serverTimestamp()
  for (const [id, c] of contrib) bw.set(db.collection('codAgencyContrib').doc(id), { ...c, updatedAt: ts })
  for (const [k, d] of days) bw.set(db.collection('codAgencyDays').doc(k), { ...d, updatedAt: ts })
  await bw.close()
  console.log(`✅ Écrit : ${contrib.size} contribution(s), ${days.size} document(s) de journée.`)
}
if (FIX) {
  const saved = new Map()
  ;(await db.collection('codAgencyContrib').get()).docs.forEach(d => saved.set(d.id, d.data()))
  const ids = new Set([...contrib.keys(), ...saved.keys()])
  let fixed = 0, checked = 0
  for (const id of ids) {
    checked++
    if (sameContribution(saved.get(id) || null, contrib.get(id) || null)) continue
    const fresh = await db.collection('parcels').doc(id).get()
    if (await syncCodAgency(db, FV, id, fresh.exists ? fresh.data() : null, cities)) fixed++
  }
  console.log(`🔧 Contrôle : ${checked} vérifiée(s) · ${fixed} corrigée(s).`)
}
process.exit(0)
