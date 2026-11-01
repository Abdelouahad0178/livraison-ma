// Annule la date de livraison (deliveredAt) de l'expédition 1248627 — demande de l'utilisateur du 31/10/2026.
// Marquée « Livré » par erreur le 30/10 14:39 ; déjà remise « Arrivé en agence » par l'admin le 31/10 07:20,
// mais deliveredAt était resté. Sauvegarde complète AVANT ; rien d'autre n'est modifié.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { FieldValue } = admin.firestore
const ref = db.collection('parcels').doc('iBjAw0kxY6DclnzR74Vi')
const BACKUP = 'scripts/annule-livraison-1248627-backup-2026-10-31.json'
const snap = await ref.get()
const ser = v => v?.toDate ? { __ts: v.toDate().toISOString() } : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)])) : v
writeFileSync(BACKUP, JSON.stringify({ id: snap.id, savedAt: new Date().toISOString(), data: ser(snap.data()) }, null, 1))
console.log('Sauvegarde :', BACKUP)
await db.runTransaction(async tx => {
  const p = (await tx.get(ref)).data()
  if (p.senderNic !== '1248627') throw new Error('mauvaise expédition')
  if (p.status !== 'Arrivé en agence') throw new Error(`statut changé entre-temps : ${p.status}`)
  if (!String(p.deliveredAt || '').startsWith('2026-10-30T13:39')) throw new Error(`date de livraison inattendue : ${p.deliveredAt}`)
  tx.update(ref, {
    deliveredAt: FieldValue.delete(),
    history: FieldValue.arrayUnion({ status: 'Arrivé en agence', timestamp: new Date().toISOString(),
      note: "Date de livraison annulée (30/10 14:39 — livraison marquée par erreur), à la demande de l'admin", updatedBy: 'admin' }),
  })
})
const after = (await ref.get()).data()
console.log('Après : statut', after.status, '· deliveredAt', after.deliveredAt === undefined ? 'retirée ✓' : after.deliveredAt, '· historique', after.history.length, 'étapes')
process.exit(0)
