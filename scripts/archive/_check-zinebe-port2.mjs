import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const s = await db.collection('parcels').where('destinationCity', '==', 'Agadir').where('createdAt', '>=', T.fromDate(new Date('2026-10-07T00:00:00'))).where('createdAt', '<', T.fromDate(new Date('2026-10-08T12:00:00'))).orderBy('createdAt', 'desc').get()
const iso = v => v?.toDate ? v.toDate().toISOString() : String(v || '')
const l = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.workDate === '2026-10-07')
const back = '2026-10-07T17:00'
const portBack = l.filter(p => iso(p.portCollectedAt).startsWith(back) || String(p.portExpReceivedAt || '').startsWith(back))
const codBack = l.filter(p => String(p.codCollectedAt || '').startsWith(back) || String(p.codExpReceivedAt || '').startsWith(back))
console.log(`Datés du 07/10 18:00 aujourd'hui : ports dus ${portBack.length} ; COD ${codBack.length}`)
codBack.slice(0, 5).forEach(p => console.log('  COD', p.senderNic, p.codAmount, '| port', p.portType, p.portStatus || '-', iso(p.portCollectedAt).slice(0, 16), '| statut', p.status))
const pd = l.filter(p => p.portType === 'port_du')
const notColl = pd.filter(p => !['collected', 'received'].includes(p.portStatus))
console.log(`Ports dus du 07/10 : ${pd.length} ; encore NON encaissés : ${notColl.length} (${notColl.reduce((a, p) => a + (+p.price || 0), 0)} DH)`)
const days = {}; pd.filter(p => ['collected', 'received'].includes(p.portStatus)).forEach(p => { const k = iso(p.portCollectedAt).slice(0, 10) || '?'; days[k] = (days[k] || 0) + 1 })
console.log('Ports dus encaissés, par jour d\'encaissement :', days)
const st = {}; notColl.forEach(p => st[p.status] = (st[p.status] || 0) + 1); console.log('Non encaissés, statuts :', st)
process.exit(0)
