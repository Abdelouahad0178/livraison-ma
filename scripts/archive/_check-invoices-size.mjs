// LECTURE SEULE : nombre et taille des factures (correction 6 du Facturier). Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const snap = await db.collection('invoices').get()
let bytes = 0, items = 0, cancelled = 0, maxItems = 0
const byMonth = {}
let lagMax = 0, lagOver45 = 0, noDate = 0
for (const d of snap.docs) {
  const v = d.data()
  const sz = Buffer.byteLength(JSON.stringify(v))
  bytes += sz
  const n = (v.items || []).length
  items += n; maxItems = Math.max(maxItems, n)
  if (v.status === 'cancelled') cancelled++
  const c = v.createdAt?.toDate ? v.createdAt.toDate() : (v.createdAt ? new Date(v.createdAt) : null)
  const m = c && !isNaN(c) ? c.toISOString().slice(0, 7) : '????'
  byMonth[m] = byMonth[m] || { n: 0, ko: 0 }
  byMonth[m].n++; byMonth[m].ko += sz / 1024
  if (!c || isNaN(c)) { noDate++; continue }
}
console.log(`Factures : ${snap.size} (annulées ${cancelled}) — lignes : ${items} (max ${maxItems}/facture) — taille totale ≈ ${(bytes / 1048576).toFixed(2)} Mo`)
for (const m of Object.keys(byMonth).sort()) console.log(`  ${m} : ${byMonth[m].n} factures, ${byMonth[m].ko.toFixed(0)} Ko`)
console.log(`Sans date de création : ${noDate}`)
process.exit(0)
