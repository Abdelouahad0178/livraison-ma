/** Aligne le nom affiché des livreurs sur celui de la page Admin (users.name), partout où un
 *  identifiant de livreur est stocké avec un nom dénormalisé (parcels, deliverySheets).
 *  Usage: node scripts/sync-driver-names.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()

const u = await db.collection('users').where('role','in',['livreur','chauffeur','livreur-gare']).get()
const nameOf = {}
u.docs.forEach(d => { nameOf[d.id] = d.data().name || d.data().email || 'Livreur' })
console.log(u.size, 'comptes livreurs')

const stat = {}
async function syncField(collection, idField, nameField) {
  const snap = await db.collection(collection).get()
  const todo = []
  snap.docs.forEach(d => {
    const x = d.data()
    const id = x[idField]
    if (!id || !nameOf[id]) return
    if (x[nameField] !== nameOf[id]) {
      todo.push({ ref: d.ref, upd: { [nameField]: nameOf[id] } })
      const k = `${collection}.${nameField}: "${x[nameField]}" -> "${nameOf[id]}"`
      stat[k] = (stat[k] || 0) + 1
    }
  })
  console.log(collection, nameField, 'à corriger:', todo.length)
  if (APPLY) {
    for (let i = 0; i < todo.length; i += 400) {
      const b = db.batch()
      todo.slice(i, i + 400).forEach(t => b.update(t.ref, t.upd))
      await b.commit()
      await new Promise(r => setTimeout(r, 400))
    }
  }
}
await syncField('parcels', 'deliveryDriverId', 'deliveryDriverName')
await syncField('parcels', 'pickupDriverId', 'pickupDriverName')
await syncField('deliverySheets', 'driverId', 'driverName')

console.log(stat)
if (APPLY) console.log('✅ terminé')
process.exit(0)
