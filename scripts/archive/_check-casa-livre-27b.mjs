// LECTURE SEULE : champs de livraison et statut précédent des 69 expéditions Casablanca livrées le 27/10 par SAID.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const s = await db.collection('parcels').where('destinationCity', '==', 'Casablanca').where('status', '==', 'Livré').where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date('2026-09-20'))).orderBy('createdAt', 'desc').get()
const day = v => { const t = v?.toMillis ? v.toMillis() : (v ? Date.parse(v) : NaN); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10) }
const list = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => day(p.deliveredAt) === '2026-10-27' && (p.history || []).some(h => h.status === 'Livré' && /SAID/i.test(String(h.by || h.note || ''))) || (day(p.deliveredAt) === '2026-10-27' && JSON.stringify(p.history || []).includes('SAID')))
console.log('trouvées :', list.length)
const keys = new Set(); list.forEach(p => Object.keys(p).filter(k => /deliver|livr|signature/i.test(k)).forEach(k => keys.add(k)))
console.log('champs « livraison » présents :', [...keys].join(', '))
const prev = {}; list.forEach(p => { const h = p.history || []; const i = h.map(x => x.status).lastIndexOf('Livré'); const b = i > 0 ? h.slice(0, i).reverse().find(x => x.status && x.status !== 'Livré')?.status : '?'; prev[b] = (prev[b] || 0) + 1 })
console.log('statut avant « Livré » :', prev)
const last = list[0]?.history?.slice(-1)[0]; console.log('exemple dernière ligne d\'historique :', JSON.stringify(last))
console.log('\nAvec argent encaissé :')
list.filter(p => ['collected', 'received'].includes(p.portStatus) || (p.codStatus && p.codStatus !== 'pending')).forEach(p => console.log('  ', p.senderNic, '| port', p.portType, p.portStatus || '-', p.price + ' DH', 'par', p.portCollectedBy || '-', '| COD', p.codAmount || 0, p.codStatus || '-', 'par', p.codCollectedBy || '-'))
process.exit(0)
