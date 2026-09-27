/** Attribue les anciens colis « Livraison en gare » SANS livreur au compte « En gare - <ville> » de leur ville
 *  de destination. Ne touche jamais un colis déjà assigné à un livreur, ni les retournés/annulés/initialisés.
 *  Usage: node scripts/assign-old-gare-parcels.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const g = await db.collection('users').where('role','==','livreur-gare').get()
const acc = {}; g.docs.forEach(d => { acc[d.data().city] = d.id })
const OK = new Set(['Arrivé en agence', 'En cours de livraison', 'Livré'])
const seen = new Map()
for (const q of [db.collection('parcels').where('deliveryMethod','==','gare'), db.collection('parcels').where('enGare','==',true)]) {
  (await q.get()).docs.forEach(d => seen.set(d.id, d))
}
const todo = []; const stat = {}
seen.forEach(d => {
  const x = d.data(); const id = acc[x.destinationCity]
  if (!id || x.deliveryDriverId || x.pickupDriverId || x.wasReturned || x.returnedAt || !OK.has(x.status)) return
  todo.push({ ref: d.ref, id, city: x.destinationCity })
  const k = `${x.destinationCity} | ${x.status}`; stat[k] = (stat[k] || 0) + 1
})
console.log(todo.length, 'colis à attribuer'); console.log(stat)
if (APPLY) {
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(t => b.update(t.ref, { deliveryDriverId: t.id, deliveryDriverName: `En gare - ${t.city}` }))
    await b.commit(); await new Promise(r => setTimeout(r, 500))
  }
  console.log('✅ terminé')
}
process.exit(0)
