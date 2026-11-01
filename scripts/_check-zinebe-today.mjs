import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const Z = 'N1gHn9JuBnOdUEM90vRhBfnl1xP2'
const since = '2026-10-28T07:00:00'
for (const [f, d] of [['portExpReceivedById', 'portExpReceivedAt'], ['codExpReceivedById', 'codExpReceivedAt'], ['portCollectedById', null], ['codCollectedById', null]]) {
  const s = await db.collection('parcelsLite').where(f, '==', Z).get()
  const iso = v => v?.toDate ? v.toDate().toISOString() : String(v || '')
  const upd = s.docs.map(x => x.data()).filter(p => iso(p.liteUpdatedAt) >= since)
  console.log(`${f} : ${upd.length} expédition(s) modifiée(s) aujourd'hui`, upd.slice(0, 6).map(p => `${p.senderNic}[w${p.workDate}] port ${iso(p.portCollectedAt).slice(0, 16)}/${String(p.portExpReceivedAt || '').slice(0, 16)} cod ${String(p.codCollectedAt || '').slice(0, 16)}/${String(p.codExpReceivedAt || '').slice(0, 16)}`).join(' ; '))
}
process.exit(0)
