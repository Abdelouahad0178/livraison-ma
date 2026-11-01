/** Archivage manuel : livrés sans COD > 30 j ; tous (COD inclus) > 45 j. Usage: node scripts/archive-now.mjs [--apply] */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const c30 = admin.firestore.Timestamp.fromMillis(Date.now()-30*864e5), f45 = Date.now()-45*864e5
let last=null, seen=0, n=0, n45=0, nLiv=0
while (true) {
  let q = db.collection('parcels').where('createdAt','<',c30).orderBy('createdAt').limit(500)
  if (last) q = q.startAfter(last)
  const s = await q.get(); if (s.empty) break
  last = s.docs[s.size-1]; seen += s.size
  const b = db.batch(); let k=0
  s.docs.forEach(d => { const x=d.data(); if (x.isArchived) return
    const old45 = x.createdAt?.toMillis && x.createdAt.toMillis() < f45
    const liv = x.status==='Livré' && !(Number(x.codAmount)>0)
    if (!old45 && !liv) return
    old45 ? n45++ : nLiv++; k++
    b.update(d.ref,{isArchived:true,archivedAt:new Date().toISOString(),archivedBy:'auto-system'}) })
  if (APPLY && k) { await b.commit(); await new Promise(r=>setTimeout(r,300)) }
  n += k
}
console.log({seen, aArchiver:n, plus45j:n45, livresSansCod30j:nLiv, applique:APPLY})
