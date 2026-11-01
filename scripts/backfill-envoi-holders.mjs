/**
 * Totaux « reste à verser » par compte (envoiHolders) recalculés depuis la copie envoiContrib — voir functions/envoiContrib.js.
 *   node scripts/backfill-envoi-holders.mjs           # simulation : compare, n'écrit rien
 *   node scripts/backfill-envoi-holders.mjs --apply   # écrit les totaux exacts des comptes qui diffèrent
 * Sans danger pendant que la Cloud Function tourne (relancer : 0 différence attendue). N'écrit que dans envoiHolders.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { holderTotalsOf, HOLDER_GROUPS } = require('../functions/envoiContrib.js')

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const FV = admin.firestore.FieldValue
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

const want = {}
;(await db.collection('envoiContrib').get()).docs.forEach(d => {
  for (const [h, t] of Object.entries(holderTotalsOf(d.data()))) {
    const w = want[h] = want[h] || {}
    for (const g of HOLDER_GROUPS) if (t[g]) w[g] = r2((w[g] || 0) + t[g])
  }
})
const have = {}
;(await db.collection('envoiHolders').get()).docs.forEach(d => { have[d.id] = d.data() })
const users = new Map((await db.collection('users').get()).docs.map(d => [d.id, `${d.get('name') || d.id} (${d.get('role') || '?'})`]))
let diff = 0
for (const h of new Set([...Object.keys(want), ...Object.keys(have)])) {
  const ok = HOLDER_GROUPS.every(g => r2(want[h]?.[g]) === r2(have[h]?.[g]))
  if (ok) continue
  diff++
  console.log(`${String(users.get(h) || h).padEnd(40)} attendu ${JSON.stringify(want[h] || {})} · enregistré ${JSON.stringify(Object.fromEntries(HOLDER_GROUPS.map(g => [g, r2(have[h]?.[g])])))}`)
  if (APPLY) await db.collection('envoiHolders').doc(h).set({ ...Object.fromEntries(HOLDER_GROUPS.map(g => [g, r2(want[h]?.[g])])), updatedAt: FV.serverTimestamp() })
}
console.log(`${Object.keys(want).length} compte(s) détenteur(s) · ${diff} différence(s)${APPLY ? ' corrigée(s)' : ' (simulation)'}`)
process.exit(0)
