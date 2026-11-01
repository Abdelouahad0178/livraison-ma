// 1088479D : remise « En gare - Ait Melloul » (2e fois, réassignée à rachida après la correction de 16:22) — demande
// de l'utilisateur du 31/10/2026. Retire seulement l'assignation au livreur. Sauvegarde complète AVANT.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { FieldValue } = admin.firestore
const ref = db.collection('parcels').doc('8KxRoNUwh7C4UJgqATW9')
const BACKUP = 'scripts/retour-1088479D-backup-bis-2026-10-31.json'
const snap = await ref.get()
const ser = v => v?.toDate ? { __ts: v.toDate().toISOString() } : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)])) : v
writeFileSync(BACKUP, JSON.stringify({ id: snap.id, savedAt: new Date().toISOString(), data: ser(snap.data()) }, null, 1))
console.log('Sauvegarde :', BACKUP)
await db.runTransaction(async tx => {
  const p = (await tx.get(ref)).data()
  if (p.senderNic !== '1088479D' || p.status !== 'Retourné' || p.portStatus !== 'pending') throw new Error(`Arrêt, état changé : ${p.status} / port ${p.portStatus}`)
  if (!p.deliveryDriverId) throw new Error('Déjà sans livreur')
  tx.update(ref, {
    deliveryDriverId: FieldValue.delete(), deliveryDriverName: FieldValue.delete(),
    deliveryAssignedAt: FieldValue.delete(), deliveryAssignedBy: FieldValue.delete(),
    history: FieldValue.arrayUnion({ status: 'Retourné', timestamp: new Date().toISOString(), updatedBy: 'admin',
      note: `Remise « En gare - Ait Melloul » (assignation à ${p.deliveryDriverName || 'un livreur'} retirée) — port dû 520 DH à encaisser au guichet — à la demande de l'admin` }),
  })
})
const a = (await ref.get()).data()
console.log('Après :', a.status, '· livreur', a.deliveryDriverName ?? 'aucun → carte « En gare - Ait Melloul »', '· port', a.price, 'DH', a.portStatus)
process.exit(0)
