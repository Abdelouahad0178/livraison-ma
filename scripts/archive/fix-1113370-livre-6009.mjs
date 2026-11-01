// Demande de l'admin (19/10/2026) : 1113370 livrée par hassan smaili6009 (Agadir), opération de retour annulée.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const FV = admin.firestore.FieldValue
const ref = db.doc('parcels/ni6nrGa8hfn9A8p0onUK')
const p = (await ref.get()).data()
if (p.senderNic !== '1113370') throw new Error('Expédition inattendue')
writeFileSync('scripts/fix-1113370-livre-6009-backup.json', JSON.stringify({ id: ref.id, data: p }, (k, v) => (v && v._seconds !== undefined ? { _ts: v._seconds } : v), 2))
const now = new Date().toISOString()
await ref.update({
  status: 'Livré',
  deliveredAt: p.deliveredAt || now,
  deliveryDriverId: 'nS2g24NRdKWI0aO6mCG4zTa2zis2',
  deliveryDriverName: 'hassan smaili6009',
  deliveryAssignedAt: now,
  deliveryAssignedBy: 'Admin',
  // ↩️ Opération de retour annulée
  wasReturned: FV.delete(), returnToCity: FV.delete(), returnedAt: FV.delete(), returnReason: FV.delete(),
  returnedByDriverId: FV.delete(), returnedByDriverName: FV.delete(), preReturn: FV.delete(),
  returnCancelledAt: now, returnCancelledBy: 'Admin',
  history: FV.arrayUnion({ status: 'Livré', timestamp: now, note: 'Correction admin : retour annulé — livrée par hassan smaili6009 (Agadir)' }),
})
const a = (await ref.get()).data()
console.log('Après :', a.senderNic, a.status, '| livreur', a.deliveryDriverName, '|', a.originCity, '→', a.destinationCity, '| retour', a.wasReturned ? 'OUI' : 'annulé', '| COD', a.codAmount, a.codStatus, '| port', a.portType, a.portStatus || 'à encaisser')
process.exit(0)
