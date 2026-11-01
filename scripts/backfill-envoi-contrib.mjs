/**
 * Rattrapage de la copie allégée envoiContrib (argent détenu par le chef d'exploitation) — voir functions/envoiContrib.js.
 *   node scripts/backfill-envoi-contrib.mjs           # simulation : rien n'est écrit
 *   node scripts/backfill-envoi-contrib.mjs --apply   # écrit les différences (expédition RELUE avant chaque écriture)
 * Idempotent, sûr pendant que la Cloud Function tourne. N'écrit que dans envoiContrib : aucune expédition modifiée.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { envoiContribOf, envoiKey, syncEnvoi } = require('../functions/envoiContrib.js')

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const FV = admin.firestore.FieldValue

// Candidates : port encaissé (port dû / port payé ramassé) ou COD encaissé
const docs = new Map()
for (const q of [db.collection('parcels').where('portStatus', '==', 'collected'), db.collection('parcels').where('codStatus', '==', 'collected')]) {
  const s = await q.get()
  s.docs.forEach(d => docs.set(d.id, d.data()))
}
const want = new Map()
for (const [id, p] of docs) { const c = envoiContribOf(id, p); if (c) want.set(id, c) }
const have = new Map()
;(await db.collection('envoiContrib').get()).docs.forEach(d => { const x = d.data(); have.set(d.id, { items: x.items, holders: x.holders }) })

const byHolder = {}
for (const c of want.values()) for (const i of c.items) for (const h of i.holders) {
  const k = `${h} · ${i.kind}/${i.type}`; byHolder[k] = byHolder[k] || { n: 0, m: 0 }; byHolder[k].n++; byHolder[k].m += i.amount
}
console.log(`Expéditions lues : ${docs.size} · avec argent détenu : ${want.size} · copie actuelle : ${have.size}`)
const diff = [...new Set([...want.keys(), ...have.keys()])].filter(id => envoiKey(want.get(id) || null) !== envoiKey(have.get(id) || null))
console.log(`Différences : ${diff.length}`)
if (APPLY) {
  let n = 0, next = 0
  // 20 à la fois (chaque expédition relue juste avant son écriture)
  const worker = async () => {
    while (next < diff.length) {
      const id = diff[next++]
      const fresh = await db.collection('parcels').doc(id).get()
      await syncEnvoi(db, FV, id, fresh.exists ? fresh.data() : null)
      if (++n % 500 === 0) console.log(`… ${n}/${diff.length}`)
    }
  }
  await Promise.all(Array.from({ length: 20 }, worker))
  console.log(`✅ ${n} document(s) écrits / supprimés.`)
}
// Totaux par compte détenteur (contrôle)
const users = new Map((await db.collection('users').where('role', 'in', ['chef_exploitation', 'chef_agence', 'agentpro']).get()).docs.map(d => [d.id, d.get('name') || d.id]))
for (const [k, v] of Object.entries(byHolder).filter(([k]) => users.has(k.split(' · ')[0])).sort()) {
  const [h, t] = k.split(' · ')
  console.log(`  ${String(users.get(h)).padEnd(24)} ${t.padEnd(16)} ${String(v.n).padStart(5)} valeur(s) · ${Math.round(v.m)} DH`)
}
process.exit(0)
