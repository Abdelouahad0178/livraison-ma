// LECTURE SEULE : expéditions Casablanca « Livré » liées au 27/10/2026 et au compte said@gmail.com.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const au = await admin.auth().getUserByEmail('said@gmail.com')
const u = (await db.doc(`users/${au.uid}`).get()).data() || {}
console.log('Compte :', au.uid.slice(0, 6) + '…', u.name, u.role, u.city)
const s = await db.collection('parcelsLite').where('destinationCity', '==', 'Casablanca').where('status', '==', 'Livré').where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date('2026-09-20T00:00:00'))).orderBy('createdAt', 'desc').get()
const ms = v => v?.toMillis ? v.toMillis() : (v ? Date.parse(v) : NaN)
const day = v => { const t = ms(v); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10) }
const rows = s.docs.map(d => ({ id: d.id, ...d.data() }))
const recv27 = p => ['destinationArrivedAt', 'chefPointedAt', 'deliveryControlledAt'].some(f => day(p[f]) === '2026-10-27')
const del27 = rows.filter(p => recv27(p) || day(p.deliveredAt) === '2026-10-27' || (day(p.deliveredAt) === '2026-10-28' && new Date(ms(p.deliveredAt)).getUTCHours() < 5))
const cre27 = rows.filter(p => p.workDate === '2026-10-27')
console.log(`Casablanca Livré : livrées le 27/10 = ${del27.length} ; créées (journée) le 27/10 = ${cre27.length}`)
const byWho = {}
del27.forEach(p => { const h = (p.history || []).slice().reverse().find(x => x.status === 'Livré'); const k = (h?.by || p.deliveredBy || p.deliveryDriverName || '?'); byWho[k] = (byWho[k] || 0) + 1 })
console.log('Livrées le 27/10, par :', byWho)
const bySaid = del27.filter(p => JSON.stringify(p).includes(au.uid) || JSON.stringify(p.history || []).includes(u.name || '§'))
console.log(`… dont liées à ${u.name} : ${bySaid.length}`)
const cash = del27.filter(p => ['collected', 'received'].includes(p.portStatus) || (p.codStatus && p.codStatus !== 'pending'))
console.log(`… dont avec port dû / COD déjà encaissé : ${cash.length}`)
del27.slice(0, 8).forEach(p => console.log('  ', p.senderNic, '| créée', p.workDate, '| livrée', String(p.deliveredAt).slice(0, 19), '| livreur', p.deliveryDriverName, '| port', p.portType, p.portStatus || '-', '| cod', p.codAmount || 0, p.codStatus || '-'))
process.exit(0)

