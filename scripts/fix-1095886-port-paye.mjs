// Correction (demande de l'admin, 18/10/2026) : port payé de 1095886 resté « pending » → encaissé au guichet le 12/10
// par NOUREDINE MOUJI (comme les 8 autres ports payés du 12/10). Sauvegarde avant modification.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const ref = db.doc('parcels/8gM20yZjL5PqLsnIiOuw')
const snap = await ref.get()
const p = snap.data()
if (p.senderNic !== '1095886' || p.portType !== 'port_paye') throw new Error('Expédition inattendue')
if (p.portStatus === 'collected' || p.portStatus === 'received') { console.log('Déjà encaissé, rien à faire.'); process.exit(0) }
writeFileSync('scripts/fix-1095886-port-paye-backup.json', JSON.stringify({ id: ref.id, data: p }, (k, v) => (v && v._seconds !== undefined ? { _ts: v._seconds } : v), 2))
await ref.update({
  portStatus: 'collected',
  portCollectedBy: p.agentName || 'NOUREDINE MOUJI',
  portCollectedById: p.agentId,
  portCollectedAt: p.createdAt,
  history: admin.firestore.FieldValue.arrayUnion({
    status: p.status, timestamp: new Date().toISOString(),
    note: `Correction admin : port payé ${p.price} DH encaissé au guichet le 12/10/2026 par ${p.agentName || 'NOUREDINE MOUJI'} (resté « en attente » par erreur de saisie)`,
  }),
})
const after = (await ref.get()).data()
console.log('Après :', after.senderNic, after.portStatus, after.portCollectedBy, after.portCollectedAt?.toDate?.().toISOString())
process.exit(0)
