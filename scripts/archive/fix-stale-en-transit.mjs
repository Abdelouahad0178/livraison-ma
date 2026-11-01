/** Redonne le dernier statut de l'historique aux colis restés « En transit » alors qu'ils sont déjà arrivés.
 *  Usage: node scripts/fix-stale-en-transit.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const snap = await db.collection('parcels').where('status','==','En transit').get()
const todo = [], backup = [], stat = {}
snap.docs.forEach(d => {
  const p = d.data(); const h = Array.isArray(p.history) ? p.history : []
  if (!h.length) return
  let last = h[h.length-1]
  for (const e of h) if (e?.timestamp && last?.timestamp && String(e.timestamp) > String(last.timestamp)) last = e
  if (last?.status && last.status !== 'En transit') {
    todo.push({ ref: d.ref, st: last.status }); backup.push({ id: d.id, old: 'En transit', new: last.status })
    stat[last.status] = (stat[last.status]||0)+1
  }
})
console.log(snap.size, 'En transit ;', todo.length, 'à corriger', stat)
if (APPLY) {
  writeFileSync('scripts/stale-en-transit-backup.json', JSON.stringify(backup))
  for (let i=0;i<todo.length;i+=400){ const b=db.batch(); todo.slice(i,i+400).forEach(t=>b.update(t.ref,{status:t.st})); await b.commit(); await new Promise(r=>setTimeout(r,400)) }
  console.log('appliqué')
}
