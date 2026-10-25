// LECTURE SEULE : compare parcels et parcelsLite (nombre, total des prix, détail des champs) avant de basculer
// le Facturier sur la version allégée. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { projectParcelLite, liteKey } = require('../functions/parcelLite.js')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { Timestamp, AggregateField } = admin.firestore

const range = (col, a, b) => db.collection(col).where('createdAt', '>=', Timestamp.fromDate(a)).where('createdAt', '<', Timestamp.fromDate(b))
const agg = async (col, a, b) => (await range(col, a, b).aggregate({ n: AggregateField.count() }).get()).data()

// 1) Semaine par semaine, 12 semaines
const now = new Date()
let end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
let diffs = 0
console.log('Semaine (début)   parcels(n)                  parcelsLite(n)          ')
for (let w = 0; w < 0; w++) {
  const start = new Date(end.getTime() - 7 * 86400000)
  const [f, l] = await Promise.all([agg('parcels', start, end), agg('parcelsLite', start, end)])
  const ok = f.n === l.n && true
  if (!ok) diffs++
  console.log(`${start.toISOString().slice(0, 10)}   ${String(f.n).padStart(6)}   ${String(l.n).padStart(6)}   ${ok ? 'OK' : 'DIFFÉRENT'}`)
  end = start
}

// 2) Détail champ par champ sur 2 journées (hier et il y a 20 jours)
for (const back of [0, 2, 6, 13]) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
  const b = new Date(a.getTime() + 86400000)
  const [fs, ls] = await Promise.all([range('parcels', a, b).get(), range('parcelsLite', a, b).get()])
  const lite = new Map(ls.docs.map(d => [d.id, d.data()]))
  let missing = 0, differ = 0
  const fieldDiff = {}
  for (const d of fs.docs) {
    const l = lite.get(d.id)
    if (!l) { missing++; continue }
    const exp = projectParcelLite(d.data())
    const got = { ...l }; delete got.liteUpdatedAt
    if (liteKey(exp) !== liteKey(got)) {
      differ++
      for (const k of new Set([...Object.keys(exp), ...Object.keys(got)])) {
        if (JSON.stringify(liteKey({ v: exp[k] })) !== JSON.stringify(liteKey({ v: got[k] }))) fieldDiff[k] = (fieldDiff[k] || 0) + 1
      }
    }
  }
  console.log(`\nJournée ${a.toISOString().slice(0, 10)} : ${fs.size} complètes, ${ls.size} allégées, absentes=${missing}, différentes=${differ}`)
  if (differ) console.log('  champs qui diffèrent :', fieldDiff)
}
console.log(`\nSemaines différentes : ${diffs}`)
process.exit(0)
