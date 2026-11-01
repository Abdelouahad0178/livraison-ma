// LECTURE SEULE : solde de caisse enregistré (agencyCashes) vs opérations de caisse (caisseEntries), par ville
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const cashes = (await db.collection('agencyCashes').get()).docs
const entries = (await db.collection('caisseEntries').get()).docs.map(d => d.data())
const amt = v => parseFloat(String(v ?? 0).replace(',', '.')) || 0
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
console.log(`opérations de caisse : ${entries.length} | cashAdjusted=true : ${entries.filter(e => e.cashAdjusted === true).length} | =false : ${entries.filter(e => e.cashAdjusted === false).length} | absent : ${entries.filter(e => e.cashAdjusted === undefined).length}`)
const cities = new Set([...cashes.map(d => d.id), ...entries.map(e => e.city).filter(Boolean)])
for (const c of [...cities].sort()) {
  const cash = cashes.find(d => d.id === c)?.data()
  const mine = entries.filter(e => e.city === c)
  const signed = list => list.reduce((s, e) => s + (e.type === 'entree' ? 1 : e.type === 'sortie' ? -1 : 0) * amt(e.amount), 0)
  const adj = mine.filter(e => e.cashAdjusted !== false)   // même règle que la suppression (absent = ajusté)
  const last = cash?.lastUpdatedAt?.toDate ? cash.lastUpdatedAt.toDate().toLocaleString('fr-FR') : '—'
  console.log(`${c.padEnd(12)} solde enregistré ${fmt(amt(cash?.solde)).padStart(12)} (espèces ${fmt(amt(cash?.soldeEspeces))}, chèques ${fmt(amt(cash?.soldeCheques))}) | maj ${last} par ${cash?.lastUpdatedBy || '—'}`)
  console.log(`${''.padEnd(12)} somme opérations « ajustées » ${fmt(signed(adj)).padStart(12)} (${adj.length}) | toutes opérations ${fmt(signed(mine))} (${mine.length}) | écart solde − ajustées : ${fmt(amt(cash?.solde) - signed(adj))}`)
}
process.exit(0)
