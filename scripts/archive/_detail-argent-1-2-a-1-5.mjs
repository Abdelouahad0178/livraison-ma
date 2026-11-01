// LECTURE SEULE : détail des groupes 1.2 à 1.5 du diagnostic du 24/10/2026 (lu en direct dans Firestore)
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const START = new Date(2026, 9, 5, 8).getTime()
const users = new Map((await db.collection('users').get()).docs.map(d => [d.id, d.data()]))
const ms = v => v == null ? null : v.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : typeof v._seconds === 'number' ? v._seconds * 1000 : null
const d = v => { const t = ms(v); return t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }
const n = v => parseFloat(String(v ?? 0).replace(',', '.')) || 0
const nic = p => p.senderNic || p.trackingId
const RET = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const pair = (a, b) => (a === 'Agadir' && b === 'Ait Melloul') || (a === 'Ait Melloul' && b === 'Agadir')
// Toutes les expéditions dont le port a été encaissé depuis le 05/10 (deux formats de date) + COD encaissés
const seen = new Map()
for (const v of [admin.firestore.Timestamp.fromMillis(START), new Date(START).toISOString()]) {
  (await db.collection('parcels').where('portCollectedAt', '>=', v).get()).docs.forEach(x => seen.set(x.id, { id: x.id, ...x.data() }))
  ;(await db.collection('parcels').where('codCollectedAt', '>=', v).get()).docs.forEach(x => seen.set(x.id, { id: x.id, ...x.data() }))
}
const all = [...seen.values()]
const collected = p => ['collected', 'received'].includes(p.portStatus)
const recu = p => p.portExpReceivedAt ? `reçu exploitation ${d(p.portExpReceivedAt)} (${p.portExpReceivedBy || ''})` : p.portChefReceivedAt ? `reçu chef ${d(p.portChefReceivedAt)}` : p.portStatus === 'received' ? 'reçu' : 'NON REÇU'
const out = (title, rows, head, line) => {
  console.log(`\n### ${title} — ${rows.length} expédition(s), ${rows.reduce((s, r) => s + r._m, 0).toFixed(0)} DH`)
  console.log(head); rows.forEach(r => console.log(line(r)))
}
// 1.2
const g12 = all.filter(p => p.portType === 'port_du' && collected(p) && ms(p.portCollectedAt) >= START && p.portCollectedById && !users.has(p.portCollectedById)).map(p => ({ ...p, _m: n(p.price) }))
out('1.2 Port dû collecté par un compte SUPPRIMÉ', g12, 'N° EXP | trajet | statut | archivée | port | encaissé le | par (nom enregistré) | réception',
  p => `${nic(p)} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${p.isArchived ? 'oui' : 'non'} | ${n(p.price)} DH | ${d(p.portCollectedAt)} | ${p.portCollectedBy || '?'} (${String(p.portCollectedById).slice(0, 6)}…) | ${recu(p)}`)
// 1.3
const g13 = all.filter(p => collected(p) && p.portType !== 'port_du' && p.portType !== 'port_paye' && ms(p.portCollectedAt) >= START).map(p => ({ ...p, _m: n(p.price) }))
const typeChange = p => { const c = (p.adminChanges || []).concat(p.history || []).filter(x => /port|type/i.test(JSON.stringify(x))).slice(-1)[0]; return c ? (c.field ? `${c.field}: ${c.oldValue}→${c.newValue} ${d(c.changedAt)} par ${c.changedBy}` : `${(c.note || c.status || '').slice(0, 60)} ${d(c.timestamp)}`) : '—' }
out('1.3 Port encaissé puis passé « en compte »', g13, 'N° EXP | trajet | statut | type actuel | port | encaissé le | par | état | dernier changement de type',
  p => `${nic(p)} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${p.portType} | ${n(p.price)} DH | ${d(p.portCollectedAt)} | ${p.portCollectedBy || '?'} | ${p.portStatus} | ${typeChange(p)}`)
// 1.4
const notDelivered = p => p.status !== 'Livré' && !RET.includes(p.status)
const g14p = all.filter(p => p.portType === 'port_du' && collected(p) && ms(p.portCollectedAt) >= START && notDelivered(p)).map(p => ({ ...p, _m: n(p.price) }))
const g14c = all.filter(p => n(p.codAmount) > 0 && p.codStatus && p.codStatus !== 'pending' && ms(p.codCollectedAt) >= START && notDelivered(p)).map(p => ({ ...p, _m: n(p.codAmount) }))
out('1.4a Port dû encaissé, expédition NON livrée', g14p, 'N° EXP | trajet | statut | livreur | port | encaissé le | par | réception',
  p => `${nic(p)} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${p.deliveryDriverName || '—'} | ${n(p.price)} DH | ${d(p.portCollectedAt)} | ${p.portCollectedBy || '?'} | ${recu(p)}`)
out('1.4b COD encaissé, expédition NON livrée', g14c, 'N° EXP | trajet | statut | livreur | COD | état COD | encaissé le | par',
  p => `${nic(p)} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${p.deliveryDriverName || '—'} | ${n(p.codAmount)} DH | ${p.codStatus} | ${d(p.codCollectedAt)} | ${p.codCollectedBy || p.codCollectedByName || '?'}`)
// 1.5
const g15 = all.filter(p => p.portType === 'port_du' && collected(p) && ms(p.portCollectedAt) >= START && users.has(p.portCollectedById)).filter(p => {
  const c = users.get(p.portCollectedById).city; return c && c !== p.destinationCity && !pair(c, p.destinationCity) && users.get(p.portCollectedById).role !== 'admin'
}).map(p => ({ ...p, _m: n(p.price) }))
out('1.5 Port dû encaissé par un compte d\'une AUTRE ville que la destination', g15, 'N° EXP | trajet | statut | port | encaissé le | par (ville du compte) | réception',
  p => `${nic(p)} | ${p.originCity}→${p.destinationCity} | ${p.status} | ${n(p.price)} DH | ${d(p.portCollectedAt)} | ${p.portCollectedBy || '?'} (${users.get(p.portCollectedById).city}) | ${recu(p)}`)
process.exit(0)
