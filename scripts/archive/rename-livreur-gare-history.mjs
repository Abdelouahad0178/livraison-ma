/** Remplace l'ancien nom du livreur en gare ("NOUREDINE AGA") par "En gare - Agadir" dans les textes
 *  d'historique des colis (notes) et champs de nom résiduels. Aucun montant/statut n'est modifié. */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const DRY = process.argv.includes('--dry-run')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const RX = /NOUREDINE AGA/gi
const NEW = 'En gare - Agadir'
const snap = await db.collection('parcels').get()
const fix = v => typeof v === 'string' ? v.replace(RX, NEW) : v
const todo = []
snap.docs.forEach(d => {
  const x = d.data(); const upd = {}
  if (Array.isArray(x.history) && RX.test(JSON.stringify(x.history))) {
    RX.lastIndex = 0
    upd.history = x.history.map(h => (h && typeof h === 'object') ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k, fix(v)])) : h)
  }
  RX.lastIndex = 0
  if (typeof x.returnedByDriverName === 'string' && RX.test(x.returnedByDriverName)) { RX.lastIndex = 0; upd.returnedByDriverName = fix(x.returnedByDriverName) }
  RX.lastIndex = 0
  if (Object.keys(upd).length) todo.push({ ref: d.ref, upd })
})
console.log(`${todo.length} colis à corriger`)
if (!DRY) {
  for (let i = 0; i < todo.length; i += 200) {
    const b = db.batch(); todo.slice(i, i + 200).forEach(t => b.update(t.ref, t.upd)); await b.commit()
    await new Promise(r => setTimeout(r, 400))
  }
  console.log('✅ terminé')
}
process.exit(0)
