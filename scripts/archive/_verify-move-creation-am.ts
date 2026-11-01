// LECTURE SEULE : diff champ par champ (sauvegarde ↔ actuel) + copies parcelsLite / parcelsFacturier à jour
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const backup = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const norm = (v: any): any => v && typeof v === 'object' ? ('_seconds' in v ? `ts:${v._seconds}` : 'seconds' in v && 'nanoseconds' in v && Object.keys(v).length === 2 ? `ts:${v.seconds}` : JSON.stringify(v)) : JSON.stringify(v)
const fmt = (t: any) => new Date((t._seconds ?? t.seconds) * 1000).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
for (const b of backup) {
  const cur: any = (await db.collection('parcels').doc(b.id).get()).data()
  const keys = new Set([...Object.keys(b.data), ...Object.keys(cur)])
  const changed = [...keys].filter(k => norm(b.data[k]) !== norm(cur[k]?.toMillis ? { seconds: cur[k].seconds, nanoseconds: 0 } : cur[k]))
  const lite: any = (await db.collection('parcelsLite').doc(b.id).get()).data()
  const fact: any = (await db.collection('parcelsFacturier').doc(b.id).get()).data()
  const ok = (x: any) => x?.createdAt && x.createdAt.seconds === cur.createdAt.seconds && x.workDate === cur.workDate
  console.log(`${b.nic} : modifiés [${changed.join(', ')}] | créée ${fmt(cur.createdAt)} | lite ${ok(lite) ? 'OK' : 'PAS À JOUR'} | facturier ${fact ? (ok(fact) ? 'OK' : 'PAS À JOUR') : 'absente'}`)
}
process.exit(0)
