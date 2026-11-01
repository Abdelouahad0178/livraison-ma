// LECTURE SEULE : versements à l'admin (chefs d'agence) dont le montant ≠ total des expéditions du versement
// (montant modifié par l'admin avant validation).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const s = await db.collection('adminTransfers').get()
console.log(`adminTransfers : ${s.size}`)
const rows = []
for (const d of s.docs) {
  const t = d.data()
  const ids = (t.codParcelIds || []).filter(Boolean)
  let sum = null
  if (ids.length) {
    sum = 0
    for (let i = 0; i < ids.length; i += 300) {
      const snaps = await db.getAll(...ids.slice(i, i + 300).map(x => db.collection('parcels').doc(x)))
      for (const x of snaps) if (x.exists) { const p = x.data(); sum += t.kind === 'cod' ? (Number(p.codAmount) || 0) : (Number(p.price) || 0) }
    }
  }
  rows.push({ id: d.id, city: t.city, from: t.fromName, kind: t.kind || '-', status: t.status, amount: Number(t.amount) || 0, sum, n: ids.length, note: t.note || '',
    at: t.createdAt?.toDate?.().toISOString().slice(0, 16), updatedAt: t.updatedAt?.toDate?.().toISOString().slice(0, 16) || '', amountSent: t.amountSent ?? null })
}
rows.sort((a, b) => String(a.at).localeCompare(String(b.at)))
for (const r of rows) {
  const diff = r.sum === null ? '' : Math.round((r.sum - r.amount) * 100) / 100
  console.log(`${r.at} ${String(r.city).padEnd(11)} ${String(r.from).slice(0, 18).padEnd(18)} ${r.kind.padEnd(4)} ${r.status.padEnd(9)} montant ${String(r.amount).padStart(9)} | expéditions ${r.n} = ${r.sum ?? '—'} ${diff ? `⚠️ écart ${diff}` : ''} ${r.updatedAt ? '(modifié ' + r.updatedAt + ')' : ''} « ${r.note.slice(0, 60)} »`)
}
process.exit(0)
