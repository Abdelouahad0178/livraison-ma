/** Renomme les comptes « Livreur en gare » en « En gare - <ville> » (compte + nom dénormalisé sur les colis).
 *  Ne touche QUE des noms d'affichage : les calculs se basent sur les identifiants. */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const DRY = process.argv.includes('--dry-run')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const users = await db.collection('users').where('role','==','livreur-gare').get()
for (const u of users.docs) {
  const city = u.data().city || ''
  const newName = `En gare - ${city}`
  const old = new Map()
  const snap = await db.collection('parcels').where('deliveryDriverId','==',u.id).get()
  const todo = snap.docs.filter(d => d.data().deliveryDriverName !== newName)
  todo.forEach(d => old.set(d.data().deliveryDriverName, (old.get(d.data().deliveryDriverName)||0)+1))
  console.log(`${u.data().name} (${u.id}) -> "${newName}" | colis: ${snap.size}, à renommer: ${todo.length}`, Object.fromEntries(old))
  if (DRY) continue
  await u.ref.update({ name: newName })
  for (let i = 0; i < todo.length; i += 200) {
    const b = db.batch()
    todo.slice(i, i + 200).forEach(d => b.update(d.ref, { deliveryDriverName: newName }))
    await b.commit()
    await new Promise(r => setTimeout(r, 400))
  }
  console.log('  ✅ terminé')
}
process.exit(0)
