// LECTURE SEULE : compare la copie parcelsFacturier aux expéditions complètes (parcels), semaine par semaine :
// nombre, total des prix, total du contre-remboursement, et chaque champ de chaque expédition. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { liteKey } = require('../functions/parcelLite.js')
const { projectParcelFacturier, FACTURIER_FIELDS } = require('../functions/parcelFacturier.js')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { Timestamp } = admin.firestore
const range = (col, a, b) => db.collection(col).where('createdAt', '>=', Timestamp.fromDate(a)).where('createdAt', '<', Timestamp.fromDate(b))
const num = (v) => Number(v) || 0
const now = new Date()
let end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
let bad = 0
console.log('Semaine du   expéd. complètes/copie   prix complètes/copie   CRBT complètes/copie   champs différents')
for (let w = 0; w < 12; w++) {
  const start = new Date(end.getTime() - 7 * 86400000)
  const [full, copy] = await Promise.all([range('parcels', start, end).select(...FACTURIER_FIELDS, 'sender', 'receiver').get(), range('parcelsFacturier', start, end).get()])
  const cm = new Map(copy.docs.map(d => [d.id, d.data()]))
  let pf = 0, pc = 0, cf = 0, cc = 0, diff = 0, missing = 0
  for (const d of full.docs) {
    const v = d.data(); pf += num(v.price); cf += num(v.codAmount)
    const c = cm.get(d.id)
    if (!c) { missing++; continue }
    pc += num(c.price); cc += num(c.codAmount)
    const got = { ...c }; delete got.facturierUpdatedAt
    if (liteKey(projectParcelFacturier(v)) !== liteKey(got)) diff++
  }
  const ok = full.size === copy.size && !missing && !diff && Math.round(pf) === Math.round(pc) && Math.round(cf) === Math.round(cc)
  if (!ok) bad++
  console.log(`${start.toISOString().slice(0, 10)}   ${full.size} / ${copy.size}   ${Math.round(pf)} / ${Math.round(pc)}   ${Math.round(cf)} / ${Math.round(cc)}   ${diff + missing}   ${ok ? 'OK' : 'DIFFÉRENT'}`)
  end = start
}
console.log(`\nSemaines différentes : ${bad}`)
process.exit(0)
