// LECTURE SEULE : détail du point 1.3 — port encaissé puis passé « en compte »
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const START = new Date(2026, 9, 5, 8).getTime()
const ms = v => v == null ? null : v.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null
const d = v => { const t = ms(v); return t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }
const seen = new Map()
for (const v of [admin.firestore.Timestamp.fromMillis(START), new Date(START).toISOString()])
  (await db.collection('parcels').where('portCollectedAt', '>=', v).get()).docs.forEach(x => seen.set(x.id, { id: x.id, ...x.data() }))
const rows = [...seen.values()].filter(p => ['collected', 'received'].includes(p.portStatus) && !['port_du', 'port_paye', 'port_du_cheque'].includes(p.portType))
  .sort((a, b) => ms(a.portCollectedAt) - ms(b.portCollectedAt))
const label = { port_en_compte_destinataire: 'en compte DESTINATAIRE', port_en_compte_expediteur: 'en compte EXPÉDITEUR' }
let tot = 0
for (const p of rows) {
  tot += +p.price || 0
  const ch = [...(p.adminChanges || []), ...(p.history || [])].filter(x => /port/i.test(JSON.stringify(x)) && /compte|Port dû/i.test(JSON.stringify(x))).map(x => x.field ? `${x.field} ${x.oldValue}→${x.newValue} (${d(x.changedAt)}, ${x.changedBy})` : `${(x.note || '').slice(0, 90)} (${d(x.timestamp)})`).slice(-1)[0] || 'aucune trace du changement'
  const rec = p.portExpReceivedAt ? `reçu exploitation ${d(p.portExpReceivedAt)} (${p.portExpReceivedBy})` : p.portChefReceivedAt ? `reçu chef ${d(p.portChefReceivedAt)}` : 'pas reçu'
  const vers = p.portAdminTransferred ? 'versé admin' : p.valeursEnvoiId ? `dans envoi ${p.valeursEnvoiId.slice(0, 6)}` : '—'
  console.log(`${p.senderNic} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${+p.price} DH | ${label[p.portType] || p.portType}`)
  console.log(`   expéditeur : ${p.sender?.name || '?'}${p.clientId ? ' (client ' + (p.clientName || p.clientId).toString().slice(0, 30) + ')' : ''} | destinataire : ${p.receiver?.name || '?'}`)
  console.log(`   encaissé ${d(p.portCollectedAt)} par ${p.portCollectedBy} (${p.portDuReceivedMethod || 'espèces ?'}) | ${rec} | ${vers}`)
  console.log(`   changement : ${ch}`)
}
console.log(`TOTAL ${rows.length} expéditions, ${tot} DH`)
process.exit(0)
