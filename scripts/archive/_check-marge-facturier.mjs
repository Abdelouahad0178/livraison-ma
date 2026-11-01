// LECTURE SEULE (correction 7 du Facturier) : une expédition de la journée d'opération D (workDate = D) est-elle
// toujours créée (createdAt) entre D 06:00 et D+1 08:00 ? Sinon, la marge réduite la ferait sortir du total.
// Ancienne marge chargée : de D-1 00:00 à D+3 00:00 (pour une seule journée). Aucune écriture.
process.env.TZ = 'Africa/Casablanca'
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const DAYS = 50
const from = new Date(Date.now() - DAYS * 86400000)
const snap = await db.collection('parcels').where('createdAt', '>=', admin.firestore.Timestamp.fromDate(from))
  .select('workDate', 'createdAt', 'senderNic').get()
const at = (day, h, plus = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d + plus, h) }
let withWd = 0, inNew = 0, onlyOld = 0, outsideBoth = 0
const samples = [], perDay = {}
for (const d of snap.docs) {
  const v = d.data()
  if (!v.workDate || !v.createdAt?.toDate) continue
  withWd++
  const c = v.createdAt.toDate(), D = v.workDate
  const newOk = c >= at(D, 6) && c <= at(D, 8, 1)
  const oldOk = c >= at(D, 0, -1) && c < at(D, 0, 3)
  if (newOk) inNew++
  else if (oldOk) { onlyOld++; perDay[D] = (perDay[D] || 0) + 1; if (samples.length < 15) samples.push(`${v.senderNic} workDate=${D} créée ${c.toLocaleString('fr-FR')}`) }
  else outsideBoth++
}
console.log(`Expéditions lues (${DAYS} j) : ${snap.size} — avec workDate : ${withWd}`)
console.log(`  dans la nouvelle marge : ${inNew}`)
console.log(`  PERDUES par la nouvelle marge (présentes avec l'ancienne) : ${onlyOld}`)
console.log(`  hors des deux marges (déjà absentes aujourd'hui) : ${outsideBoth}`)
if (onlyOld) { console.log('  par journée :', perDay); console.log('  exemples :\n   ' + samples.join('\n   ')) }
process.exit(0)
