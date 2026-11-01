// LECTURE SEULE : fiche + historique d'expéditions par N° EXP.  node scripts/_inspect-bons.mjs 2608718 1247881
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const fmt = v => (v?.toDate ? v.toDate().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' }) : v ?? '')
const KEYS = ['status', 'originCity', 'destinationCity', 'createdAt', 'workDate', 'agentName', 'createdByName', 'portType', 'price', 'portStatus', 'portCollectedAt', 'portCollectedBy',
  'codAmount', 'serviceType', 'codParts', 'codStatus', 'codCollectedAt', 'codCollectedBy', 'codDocumentStatus', 'codExpReceivedAt', 'codExpReceivedBy', 'valeursEnvoiId',
  'codRemiseAt', 'codRemisBy', 'codSentToSourceAt', 'codReceivedBySourceAt', 'adminTransferred', 'deliveryDriverName', 'deliveryAssignedAt', 'deliveredAt', 'deliveredBy',
  'destinationArrivedAt', 'isArchived', 'wasReturned', 'returnedAt']
for (const nic of process.argv.slice(2)) {
  const docs = new Map()
  for (const col of ['parcels', 'parcels_archive']) for (const f of ['senderNic', 'trackingId']) {
    const s = await db.collection(col).where(f, '==', nic).get()
    s.docs.forEach(d => docs.set(col + '/' + d.id, d.data()))
  }
  if (!docs.size) { console.log(`\n=== ${nic} : introuvable`); continue }
  for (const [path, p] of docs) {
    console.log(`\n=== ${nic}  (${path})`)
    for (const k of KEYS) if (p[k] !== undefined && p[k] !== null && p[k] !== '') console.log(`  ${k}: ${typeof p[k] === 'object' && !p[k].toDate ? JSON.stringify(p[k]) : fmt(p[k])}`)
    console.log('  --- historique ---')
    for (const h of p.history || []) console.log(`  ${fmt(h.timestamp || h.date || h.at)} | ${h.status || h.action || ''} | ${h.by || h.user || h.agentName || ''} | ${(h.note || h.comment || h.details || '').toString().slice(0, 160)}`)
  }
}
process.exit(0)
