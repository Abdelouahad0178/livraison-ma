// LECTURE SEULE (essai à blanc) : 2.3 retours non inversés ; 2.1 livreur d'une autre ville que la destination
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const users = new Map((await db.collection('users').get()).docs.map(d => [d.id, d.data()]))
const nic = p => p.senderNic || p.trackingId
const RET = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
// 2.3
const r = (await db.collection('parcels').where('status', 'in', RET).get()).docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(p => !p.returnToCity && !p.returnedAt && !p.wasReturned)
console.log(`\n### 2.3 Retours non inversés : ${r.length}`)
const byCity = {}; r.forEach(p => { byCity[p.destinationCity] = (byCity[p.destinationCity] || 0) + 1 })
console.log('par ville actuelle de destination :', byCity)
const codMoney = r.filter(p => (+p.codAmount || 0) > 0 && p.codStatus && p.codStatus !== 'pending')
const portMoney = r.filter(p => p.portType === 'port_du' && ['collected', 'received'].includes(p.portStatus))
console.log(`COD encaissé : ${codMoney.length} | COD en attente (montant remis à 0 comme un vrai retour) : ${r.filter(p => (+p.codAmount || 0) > 0 && (!p.codStatus || p.codStatus === 'pending')).length} | port dû encaissé : ${portMoney.length} | archivées : ${r.filter(p => p.isArchived).length}`)
r.slice(0, 61).forEach(p => console.log(`  ${nic(p)} | ${p.status} | ${p.originCity}→${p.destinationCity} devient ${p.destinationCity}→${p.originCity} | exp. ${p.sender?.name || '?'} ⇄ dest. ${p.receiver?.name || '?'} | livreur ${p.deliveryDriverName || '—'} | COD ${+p.codAmount || 0}/${p.codStatus || '-'} | port ${p.portType}/${p.portStatus || '-'}${p.isArchived ? ' | archivée' : ''}`))
// 2.1
const live = (await db.collection('parcels').where('deliveryDriverId', '!=', null).get()).docs
const d = live.map(x => ({ id: x.id, ...x.data() })).filter(p => {
  if (RET.includes(p.status)) return false
  const u = users.get(p.deliveryDriverId); if (!u) return false
  const isGare = u.role === 'livreur-gare' || /^En gare/i.test(p.deliveryDriverName || '')
  const c = u.city || ''
  const pair = [c, p.destinationCity].sort().join('|') === 'Agadir|Ait Melloul'
  return c && p.destinationCity && c !== p.destinationCity && !(pair && !isGare) || (isGare && /^En gare - /i.test(p.deliveryDriverName || '') && p.deliveryDriverName.replace(/^En gare - /i, '') !== p.destinationCity)
})
console.log(`\n### 2.1 Livreur d'une autre ville que la destination : ${d.length}`)
d.forEach(p => { const u = users.get(p.deliveryDriverId)
  console.log(`  ${nic(p)} | ${p.status} | ${p.originCity}→${p.destinationCity} | livreur « ${p.deliveryDriverName} » (compte ${u.role}, ${u.city}) | port ${p.portType}/${p.portStatus || '-'} | COD ${+p.codAmount || 0}/${p.codStatus || '-'}${p.isArchived ? ' | archivée' : ''}`) })
process.exit(0)
