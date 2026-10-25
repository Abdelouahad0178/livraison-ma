// LECTURE SEULE : COD collectés à Agadir pendant la journée d'opération du 19/10/2026 (08:00 → 20/10 06:00).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const a = new Date('2026-10-19T08:00:00+01:00'), b = new Date('2026-10-20T06:00:00+01:00')
const rows = []
for (const col of ['parcels', 'parcels_archive']) {
  const s = await db.collection(col).where('destinationCity', '==', 'Agadir').where('codStatus', 'in', ['collected', 'remis', 'regle']).get()
  for (const d of s.docs) {
    const p = d.data()
    const t = p.codCollectedAt ? new Date(p.codCollectedAt?.toDate ? p.codCollectedAt.toDate() : p.codCollectedAt) : null
    const r = p.codRemisAt ? new Date(p.codRemisAt) : null
    const inDay = x => x && x >= a && x < b
    if (!inDay(t) && !inDay(r) && !inDay(p.codExpReceivedAt ? new Date(p.codExpReceivedAt) : null)) continue
    rows.push({ nic: p.senderNic, amt: p.codAmount, cash: p.codCashAmount, mixed: p.codMixed, service: p.serviceType, ptype: p.codPaymentType, st: p.codStatus, status: p.status,
      collectedAt: t?.toISOString(), remisAt: p.codRemisAt, expRecv: p.codExpReceivedAt, by: p.codCollectedBy, driver: p.deliveryDriverName, created: (p.createdAt?.toDate?.() || null)?.toISOString?.()?.slice(0, 10), workDate: p.workDate, returned: !!(p.wasReturned || p.returnedAt) })
  }
}
rows.sort((x, y) => String(x.collectedAt).localeCompare(String(y.collectedAt)))
for (const r of rows) console.log(JSON.stringify(r))
console.log('total', rows.length)
process.exit(0)
