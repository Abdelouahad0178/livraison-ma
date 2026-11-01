// LECTURE SEULE : ports dus / COD des expéditions du 07/10 (Agadir) touchés aujourd'hui par Zinebe.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const Z = 'N1gHn9JuBnOdUEM90vRhBfnl1xP2'
const s = await db.collection('parcels').where('destinationCity', '==', 'Agadir').where('createdAt', '>=', T.fromDate(new Date('2026-10-07T00:00:00'))).where('createdAt', '<', T.fromDate(new Date('2026-10-08T12:00:00'))).orderBy('createdAt', 'desc').get()
const iso = v => v?.toDate ? v.toDate().toISOString() : (v || '')
const l = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.workDate === '2026-10-07')
const mine = l.filter(p => p.portCollectedById === Z || p.portExpReceivedById === Z || p.codCollectedById === Z || p.codExpReceivedById === Z)
console.log('expéditions du 07/10 touchées par Zinebe :', mine.length)
mine.slice(0, 15).forEach(p => console.log(p.senderNic, '| port', p.portType, p.portStatus || '-', 'coll', iso(p.portCollectedAt).slice(0, 16), 'par', p.portCollectedBy || '-', '| reçu', String(p.portExpReceivedAt || '').slice(0, 16), '| COD', p.codStatus || '-', 'coll', String(p.codCollectedAt || '').slice(0, 16), '| reçu', String(p.codExpReceivedAt || '').slice(0, 16)))
const today = mine.filter(p => p.portType === 'port_du' && /2026-10-2[89]/.test(iso(p.portCollectedAt) + ' ' + String(p.portExpReceivedAt || '')))
console.log('\nports dus datés d\'AUJOURD\'HUI (au lieu du 07/10) :', today.length)
process.exit(0)
