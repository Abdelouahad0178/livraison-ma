// LECTURE SEULE : expéditions qui référencent le compte ENGAREAGA6017 RAMASSAGE (9pctt…).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), ID = '9pcttQ2dlCXILnznKoAFPfVXx822'
for (const f of ['portGuichetHolderId', 'deliveryDriverId', 'pickupDriverId', 'portCollectedById', 'portReceivedById']) {
  const s = await db.collection('parcels').where(f, '==', ID).get()
  console.log(f.padEnd(22), s.size, s.docs.slice(0, 5).map(d => `${d.get('senderNic') || d.get('trackingId')}:${d.get('price')}DH:${d.get('portStatus')}`).join(' '))
}
const ce = await db.collection('caisseEntries').where('agentId', '==', ID).get(); console.log('caisseEntries', ce.size)
process.exit(0)
