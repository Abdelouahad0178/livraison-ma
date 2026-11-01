// Versements validés pour MOINS que le montant envoyé, dont l'original a été écrasé par une modification de l'admin :
// remet le montant ENVOYÉ (amountSent = total des expéditions du versement) pour que l'écart soit suivi.
// Ne modifie que ces versements (champ amountSent) ; aucune expédition. Sauvegarde avant. Sans --apply : affichage.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const s = await db.collection('adminTransfers').where('status', '==', 'confirmed').get()
const todo = []
for (const d of s.docs) {
  const t = d.data()
  if (t.amountSent != null || !t.updatedAt) continue // seuls les versements MODIFIÉS par l'admin
  const ids = (t.codParcelIds || []).filter(Boolean)
  if (!ids.length) continue
  let sum = 0
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map(x => db.collection('parcels').doc(x)))
    for (const x of snaps) if (x.exists) sum += t.kind === 'cod' ? (Number(x.data().codAmount) || 0) : (Number(x.data().price) || 0)
  }
  sum = Math.round(sum * 100) / 100
  const amount = Number(t.amount) || 0
  if (sum - amount > 0.009) todo.push({ id: d.id, city: t.city, from: t.fromName, note: t.note, amount, sent: sum })
}
for (const r of todo) console.log(`${r.city} · ${r.from} · « ${r.note} » : validé ${r.amount} DH, envoyé ${r.sent} DH → écart ${Math.round((r.sent - r.amount) * 100) / 100} DH`)
if (APPLY && todo.length) {
  const file = `scripts/transfers-amountSent-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify(todo.map(r => ({ id: r.id, amountSent: null })), null, 1))
  for (const r of todo) await db.collection('adminTransfers').doc(r.id).update({ amountSent: r.sent })
  console.log(`${todo.length} versement(s) corrigé(s) — sauvegarde : ${file}`)
}
process.exit(0)
