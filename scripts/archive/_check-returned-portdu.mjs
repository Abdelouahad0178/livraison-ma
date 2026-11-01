// LECTURE SEULE : expéditions retournées en port dû — encaissées avant / après le retour, non encaissées, par statut.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const s = await admin.firestore().collection('parcelsLite').where('wasReturned', '==', true).get()
const ms = v => v?.toMillis ? v.toMillis() : (v ? Date.parse(v) : NaN)
const st = {}, out = { total: s.size, portDu: 0, nonEncaisse: 0, avantRetour: 0, apresRetour: 0, sansDate: 0 }
const ex = []
s.docs.forEach(d => { const p = d.data(); if (p.portType !== 'port_du' || p.portPayeMethod) return; out.portDu++
  st[p.status] = (st[p.status] || 0) + 1
  const coll = p.portStatus === 'collected' || p.portStatus === 'received'
  if (!coll) { out.nonEncaisse++; return }
  const c = ms(p.portCollectedAt), r = ms(p.returnedAt)
  if (isNaN(c) || isNaN(r)) out.sansDate++; else if (c < r) out.avantRetour++; else { out.apresRetour++; if (ex.length < 5) ex.push(`${p.senderNic || p.trackingId} ${p.status} ${p.destinationCity} encaissé par ${p.portCollectedBy}`) } })
console.log(out, st); ex.forEach(e => console.log('  ' + e)); process.exit(0)
