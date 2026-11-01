// LECTURE SEULE : où se trouve 1085840D et avec quels champs de recherche.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
for (const col of ['parcels', 'parcelsLite', 'parcels_archive', 'parcelsFacturier']) {
  for (const v of ['1085840D', '1085840', '1085840d']) for (const f of ['senderNic', 'sender.nic', 'trackingId', 'nic']) {
    const s = await db.collection(col).where(f, '==', v).get().catch(() => null)
    if (s && s.size) s.docs.forEach(d => { const p = d.data(); console.log(col, '|', f, '=', v, '| id', d.id, '| status', p.status, '| isArchived', p.isArchived, '| créé', p.createdAt?.toDate?.().toISOString?.(), '| workDate', p.workDate, '| origine', p.originCity, '→', p.destinationCity, '| senderNic', JSON.stringify(p.senderNic), '| sender.nic', JSON.stringify(p.sender?.nic), '| trackingId', p.trackingId) })
  }
}
process.exit(0)
