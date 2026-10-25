// LECTURE SEULE : champs modifiés par rapport à la sauvegarde + dates d'encaissement inchangées
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const backup = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const changed = {}, datesOk = { ok: 0, ko: 0 }
for (const b of backup) {
  const cur = (await db.collection('parcels').doc(b.id).get()).data()
  for (const k of new Set([...Object.keys(b.data), ...Object.keys(cur)])) {
    const a = JSON.stringify(b.data[k]), c = JSON.stringify(cur[k]?.toMillis ? { _seconds: cur[k].seconds, _nanoseconds: cur[k].nanoseconds } : cur[k])
    if (a !== c) changed[k] = (changed[k] || 0) + 1
  }
  const t0 = b.data.portCollectedAt?._seconds, t1 = cur.portCollectedAt?.seconds
  t0 === t1 ? datesOk.ok++ : datesOk.ko++
}
console.log('Champs modifiés (nombre d\'expéditions) :', changed)
console.log('Dates d\'encaissement identiques :', datesOk)
process.exit(0)
