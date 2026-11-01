import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const s = await admin.firestore().collection('parcelsLite').where('wasReturned', '==', true).get()
const ms = v => v?.toMillis ? v.toMillis() : (v ? Date.parse(v) : NaN)
s.docs.forEach(d => { const p = d.data(); if (p.portType !== 'port_du' || !['collected','received'].includes(p.portStatus)) return
  console.log(p.senderNic || p.trackingId, '|', p.status, '| dest', p.destinationCity, '|', p.price, 'DH | encaissé', new Date(ms(p.portCollectedAt)).toISOString().slice(0,10), 'par', p.portCollectedBy, '| retour', String(p.returnedAt).slice(0,10), '| versé admin', !!p.portAdminTransferred) })
process.exit(0)
