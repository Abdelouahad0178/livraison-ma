/**
 * Demande du 27/10/2026 : les expéditions REÇUES à Casablanca et passées « Livré » le 27/10/2026 par SAID OULYAZID
 * (said@gmail.com, chef d'agence de Casablanca — passage groupé 20 h 12 / 20 h 13) redeviennent « Arrivé en agence » :
 * livraison annulée (deliveredAt, deliveredBy, deliveredById retirés), ligne d'historique ajoutée, date d'arrivée posée
 * si absente. Livreur / argent NON touchés (aucun port dû ni COD encaissé à Casablanca sur ces expéditions — vérifié).
 * Usage : node scripts/undo-casa-livre-27-10.mjs            (simulation)
 *         node scripts/undo-casa-livre-27-10.mjs --apply    (sauvegarde puis écriture)
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { FieldValue } = admin.firestore
const APPLY = process.argv.includes('--apply')
const SAID_ID = (await admin.auth().getUserByEmail('said@gmail.com')).uid

const day = v => { const t = v?.toMillis ? v.toMillis() : (v ? Date.parse(v) : NaN); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10) }
const s = await db.collection('parcels').where('destinationCity', '==', 'Casablanca').where('status', '==', 'Livré')
  .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date('2026-09-20'))).orderBy('createdAt', 'desc').get()
const list = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => day(p.deliveredAt) === '2026-10-27'
  && (p.deliveredById === SAID_ID || JSON.stringify((p.history || []).slice(-1)).includes('SAID OULYAZID')))
const destMoney = list.filter(p => (p.portType === 'port_du' && ['collected', 'received'].includes(p.portStatus)) || (p.codStatus && p.codStatus !== 'pending'))
const methods = {}; list.forEach(p => { methods[String(p.deliveryMethod)] = (methods[String(p.deliveryMethod)] || 0) + 1 })
console.log(`${list.length} expédition(s) à remettre « Arrivé en agence » ; port dû / COD encaissés : ${destMoney.length}`)
console.log('deliveryMethod (conservé) :', methods)
if (destMoney.length) { console.log('ARRÊT : argent encaissé à Casablanca :', destMoney.map(p => p.senderNic).join(', ')); process.exit(1) }
console.log(list.map(p => p.senderNic).join(' '))
if (!APPLY) { console.log('\nSimulation : relancer avec --apply'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(`scripts/casa-livre-27-10-backup-${stamp}.json`, JSON.stringify(list, null, 1))
const now = new Date().toISOString()
const bw = db.bulkWriter()
for (const p of list) {
  bw.update(db.doc(`parcels/${p.id}`), {
    status: 'Arrivé en agence',
    deliveredAt: FieldValue.delete(), deliveredBy: FieldValue.delete(), deliveredById: FieldValue.delete(),
    ...(p.destinationArrivedAt ? {} : { destinationArrivedAt: now }),
    history: FieldValue.arrayUnion({ status: 'Arrivé en agence', timestamp: now, note: 'Livraison du 27/10/2026 annulée (passage groupé de SAID OULYAZID) — retour « Arrivé en agence », demande de l\'admin', by: 'Admin' }),
  })
}
await bw.close()
console.log(`\n✅ ${list.length} expédition(s) remises « Arrivé en agence » (sauvegarde : scripts/casa-livre-27-10-backup-${stamp}.json)`)
process.exit(0)
