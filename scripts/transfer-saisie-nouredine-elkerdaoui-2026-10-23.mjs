// Transfert des 29 expéditions saisies le 23/10/2026 par NOUREDINE MOUJI (agent pro, Agadir) au compte de
// ABDELLAH ELKERDAOUI (chef d'agence, Ait Melloul) — demande du 24/10/2026 : « changer tout et marquer qu'il les a créées ».
// Modifie : créateur (agentId / agentName / agentRole), ville d'expédition (originCity, createdByCity, sender.city),
// encaissement du port payé (portCollectedBy / Id, détenteur du guichet → rachida). Dates INCHANGÉES. + ligne d'historique.
// Usage : node scripts/transfer-saisie-nouredine-elkerdaoui-2026-10-23.mjs           → simulation
//         node scripts/transfer-saisie-nouredine-elkerdaoui-2026-10-23.mjs --apply   → sauvegarde puis écriture
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const DAY = '2026-10-23'
const CITY = 'Ait Melloul'
const HOLDER = { id: 'XC5YJs1l1bS4G0MDdb3TSB6RF932', name: 'rachida' } // src/config/guichetHolders.ts
const users = (await db.collection('users').where('email', 'in', ['nouredinepro@gmail.com', 'elkerdaoui1@gmail.com']).get()).docs.map(d => ({ id: d.id, ...d.data() }))
const src = users.find(u => u.email === 'nouredinepro@gmail.com'), dst = users.find(u => u.email === 'elkerdaoui1@gmail.com')
const s = await db.collection('parcels').where('agentId', '==', src.id).where('workDate', '==', DAY).get()
const docs = s.docs.filter(d => d.data().status === 'Initialisé')
console.log(APPLY ? 'APPLICATION' : 'SIMULATION', '—', docs.length, 'expédition(s) du', DAY, 'de', src.name, '→', dst.name, `(${dst.role}, ${dst.city})`)
if (docs.length !== 29) console.log('⚠️ nombre différent de 29 : vérifier avant application')
const now = new Date().toISOString()
const plan = docs.map(d => {
  const p = d.data()
  const patch = {
    agentId: dst.id, agentName: dst.name, agentRole: dst.role,
    originCity: CITY, createdByCity: CITY, 'sender.city': CITY,
    history: admin.firestore.FieldValue.arrayUnion({
      status: p.status, timestamp: now,
      note: `Expédition créée par ${dst.name} (${CITY}) — saisie transférée du compte de ${src.name} (Agadir) sur demande de l'admin, même date`,
    }),
  }
  const isPP = (p.portType === 'port_paye' || !p.portType) && !p.portPayeMethod
  if (isPP && p.portStatus === 'collected' && (!p.portCollectedById || p.portCollectedById === src.id)) {
    patch.portCollectedBy = dst.name; patch.portCollectedById = dst.id
  }
  if (isPP && !p.pickupDriverId) { patch.portGuichetHolderId = HOLDER.id; patch.portGuichetHolderName = HOLDER.name }
  return { id: d.id, nic: p.senderNic || p.sender?.nic, route: `${p.originCity} → ${p.destinationCity}`, port: p.portType, price: p.price, patch }
})
plan.forEach(x => console.log(' ', x.nic, '|', x.route, '→', `${CITY} → ${x.route.split(' → ')[1]}`, '|', x.port, x.price, 'DH', x.patch.portGuichetHolderId ? '| guichet → rachida' : ''))
if (APPLY && plan.length) {
  const backup = `scripts/transfer-saisie-nouredine-elkerdaoui-backup-${Date.now()}.json`
  writeFileSync(backup, JSON.stringify(docs.map(d => ({ id: d.id, data: d.data() })), null, 1))
  console.log('sauvegarde complète :', backup)
  const b = db.batch()
  plan.forEach(x => b.update(db.collection('parcels').doc(x.id), x.patch))
  await b.commit()
  console.log('✅ écrit :', plan.length)
}
process.exit(0)
