// LECTURE SEULE : ports en compte — présence/type de workDate et écart maximal workDate ↔ createdAt (pour savoir
// si l'onglet peut borner sa requête serveur à la période choisie). Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const snap = await db.collection('parcelsLite').where('portType', 'in', ['port_en_compte_expediteur', 'port_en_compte_destinataire', 'port_en_compte']).get()
const types = {}
let noCreated = 0, maxBefore = 0, maxAfter = 0, over3 = 0
const toMs = v => v?.toMillis ? v.toMillis() : (typeof v === 'string' ? Date.parse(v.length === 10 ? v + 'T12:00:00' : v) : NaN)
for (const d of snap.docs) {
  const p = d.data()
  const t = p.workDate === undefined ? 'absent' : (p.workDate?.toMillis ? 'Timestamp' : typeof p.workDate)
  types[t] = (types[t] || 0) + 1
  const c = toMs(p.createdAt)
  if (isNaN(c)) { noCreated++; continue }
  const w = toMs(p.workDate ?? p.expeditionDate)
  if (isNaN(w)) continue
  const days = (w - c) / 86400000
  if (days < -maxBefore) maxBefore = -days
  if (days > maxAfter) maxAfter = days
  if (Math.abs(days) > 3) over3++
}
console.log(`total ${snap.size} ; workDate :`, types, `; sans createdAt : ${noCreated}`)
console.log(`workDate avant createdAt : max ${maxBefore.toFixed(1)} j ; après : max ${maxAfter.toFixed(1)} j ; écart > 3 j : ${over3}`)
process.exit(0)
