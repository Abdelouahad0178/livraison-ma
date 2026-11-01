// 1088479D (retournée vers Ait Melloul, port dû 520 DH) : à collecter par le chef d'exploitation dans « En gare - Ait
// Melloul » — demande de l'utilisateur du 31/10/2026. Retire l'assignation à rachida (un retour n'est jamais affiché
// dans la carte d'un livreur) et les traces de l'ALLER (port reçu le 20/10 par SAID OULYAZID alors que le port est
// « non encaissé », livrée le 26/10) qui fausseraient le versement après la collecte. Sauvegarde complète AVANT.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { FieldValue } = admin.firestore
const ref = db.collection('parcels').doc('8KxRoNUwh7C4UJgqATW9')
const BACKUP = 'scripts/retour-1088479D-backup-2026-10-31.json'
const snap = await ref.get()
const ser = v => v?.toDate ? { __ts: v.toDate().toISOString() } : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)])) : v
writeFileSync(BACKUP, JSON.stringify({ id: snap.id, savedAt: new Date().toISOString(), data: ser(snap.data()) }, null, 1))
console.log('Sauvegarde :', BACKUP)
const DEL = ['deliveryDriverId', 'deliveryDriverName', 'deliveryAssignedAt', 'deliveryAssignedBy',
  'portExpReceivedAt', 'portExpReceivedBy', 'portExpReceivedById', 'portExpReceivedRole',
  'portChefReceivedAt', 'portChefReceivedBy', 'portChefReceivedById', 'portDuReceivedMethod',
  'deliveredAt', 'deliveredBy', 'deliveredById']
await db.runTransaction(async tx => {
  const p = (await tx.get(ref)).data()
  const check = (ok, msg) => { if (!ok) throw new Error('Arrêt, état changé : ' + msg) }
  check(p.senderNic === '1088479D', 'N° EXP')
  check(p.status === 'Retourné' && p.wasReturned === true, `statut ${p.status}`)
  check(p.destinationCity === 'Ait Melloul' && p.portType === 'port_du' && Number(p.price) === 520, 'ville / port')
  check(p.portStatus === 'pending' && !p.portCollectedAt, `port ${p.portStatus}`)
  check(p.deliveryDriverId === 'XC5YJs1l1bS4G0MDdb3TSB6RF932', `livreur ${p.deliveryDriverName}`)
  check(p.portChefReceivedById === 'L3uHaZXU4AUSODsyva0NjtrKmne2', 'trace SAID OULYAZID')
  const u = Object.fromEntries(DEL.map(k => [k, FieldValue.delete()]))
  u.history = FieldValue.arrayUnion({ status: 'Retourné', timestamp: new Date().toISOString(), updatedBy: 'admin',
    note: "Retour à collecter à Ait Melloul (En gare) : assignation à rachida retirée ; traces de l'aller effacées (port reçu le 20/10 par SAID OULYAZID, livrée le 26/10) — port dû 520 DH à encaisser — à la demande de l'admin" })
  tx.update(ref, u)
})
const a = (await ref.get()).data()
console.log('Après :', a.status, '·', a.destinationCity, '· port', a.portType, a.price, 'DH', a.portStatus, '· livreur', a.deliveryDriverName ?? 'aucun (En gare)',
  '· traces aller', DEL.filter(k => a[k] !== undefined).join(', ') || 'effacées ✓')
process.exit(0)
