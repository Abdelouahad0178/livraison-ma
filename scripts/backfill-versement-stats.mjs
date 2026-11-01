/**
 * Rattrapage de la copie allégée des versements (versementContrib + versementDays) — voir functions/versement.js.
 *   node scripts/backfill-versement-stats.mjs            # simulation : totaux calculés par ville, rien n'est écrit
 *   node scripts/backfill-versement-stats.mjs --apply    # 1er remplissage (copie VIDE seulement) : écriture par lots
 *   node scripts/backfill-versement-stats.mjs --fix      # contrôle : chaque différence est corrigée en transaction
 *                                                         (idempotent, sûr pendant que la Cloud Function tourne)
 * Même règle que les pages et que la Cloud Function (functions/shared/versementContribution.js, compilé depuis src/).
 * N'écrit que dans versementContrib / versementDays : aucune expédition n'est modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { versementOf, syncVersement, holdersByCity, sameContribution, BUCKETS, DAY_FIELDS, dayFieldsOf } = require('../functions/versement.js')

const APPLY = process.argv.includes('--apply')
const FIX = process.argv.includes('--fix')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const FV = admin.firestore.FieldValue
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

const FIELDS = ['portStatus', 'portType', 'portPayeMethod', 'price', 'destinationCity', 'originCity', 'createdAt', 'status',
  'portCollectedAt', 'portReceivedAt', 'portPayeExpReceivedAt', 'pickupDriverId', 'returnedAt', 'wasReturned',
  'portAdminTransferred', 'adminTransferred', 'portChefReceivedAt', 'portCollectedById', 'senderNic', 'trackingId', 'sender.nic']

const holders = await holdersByCity(db)
const snap = await db.collection('parcels').where('portStatus', 'in', ['collected', 'received']).select(...FIELDS).get()
const contrib = new Map()
for (const d of snap.docs) {
  let p = d.data()
  if (!p.createdAt) { const full = await d.ref.get(); p = full.data() } // date de création absente : expédition complète
  const c = versementOf(p, holders)
  if (c) contrib.set(d.id, c)
}
// Totaux par ville et par journée
const days = new Map()
for (const c of contrib.values()) {
  const k = `${c.day}_${safeId(c.city)}`
  const d = days.get(k) || { city: c.city, day: c.day, ...Object.fromEntries(DAY_FIELDS.map(f => [f, 0])) }
  for (const f of dayFieldsOf(c)) d[f] = r2(d[f] + (f.startsWith('n_') ? 1 : c.amount))
  days.set(k, d)
}
const byCity = {}
for (const d of days.values()) {
  const t = byCity[d.city] || (byCity[d.city] = { aVerser: 0, nonRecu: 0, verse: 0, jours: 0 })
  BUCKETS.forEach(b => { t[b] = r2(t[b] + d[b]) }); if (d.aVerser > 0) t.jours++
}
console.log(`Expédition(s) lue(s) : ${snap.size} · contribuent : ${contrib.size} · journées : ${days.size}`)
for (const [city, t] of Object.entries(byCity).sort()) console.log(`  ${city.padEnd(12)} à verser ${String(t.aVerser).padStart(10)} DH (${t.jours} j.) · pas encore reçu ${String(t.nonRecu).padStart(10)} DH · déjà versé ${String(t.verse).padStart(10)} DH`)

const existing = await db.collection('versementContrib').select().get()
if (APPLY) {
  if (!existing.empty) { console.log(`⛔ versementContrib contient déjà ${existing.size} document(s) : utilisez --fix (aucune écriture faite).`); process.exit(1) }
  const bw = db.bulkWriter()
  const ts = FV.serverTimestamp()
  for (const [id, c] of contrib) bw.set(db.collection('versementContrib').doc(id), { ...c, updatedAt: ts })
  for (const [k, d] of days) bw.set(db.collection('versementDays').doc(k), { ...d, updatedAt: ts })
  await bw.close()
  console.log(`✅ Écrit : ${contrib.size} contribution(s), ${days.size} journée(s).`)
}
if (FIX) {
  // 1) chaque expédition encaissée : différence appliquée si sa contribution enregistrée n'est plus la bonne
  // 2) chaque contribution enregistrée dont l'expédition n'est plus encaissée (ou supprimée) : retirée
  const saved = new Map()
  const all = await db.collection('versementContrib').get()
  all.docs.forEach(d => saved.set(d.id, d.data()))
  const ids = new Set([...contrib.keys(), ...saved.keys()])
  let fixed = 0, checked = 0
  for (const id of ids) {
    checked++
    const want = contrib.get(id) || null
    const have = saved.get(id) || null
    if (sameContribution(have, want) && (!want || have.nic === want.nic)) continue
    const fresh = await db.collection('parcels').doc(id).get()
    if (await syncVersement(db, FV, id, fresh.exists ? fresh.data() : null, holders)) fixed++
  }
  console.log(`🔧 Contrôle : ${checked} vérifiée(s) · ${fixed} corrigée(s).`)
}
process.exit(0)
