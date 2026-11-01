// LECTURE SEULE : volume des 16 lectures de « Collectes par jour » (useRecentCollected) pour une ville, période chargée = veille.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const city = process.argv[2] || 'Agadir'
const START = new Date(2026, 9, 5, 8), since14 = new Date(Date.now() - 13 * 864e5); since14.setHours(8, 0, 0, 0)
const since = START < since14 ? START : since14
const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(8, 0, 0, 0)
const to = new Date(from.getTime() + 22 * 3600e3)
const SHAPES = [['destinationCity', 'portCollectedAt'], ['destinationCity', 'codCollectedAt'], ['originCity', 'portPayeExpReceivedAt'], ['originCity', 'portReceivedAt']]
const all = new Set(); let tot = 0
for (const [cf, df] of SHAPES) for (const sv of [T.fromDate(since), since.toISOString()]) for (const [op, at] of [['<', from], ['>', to]]) {
  const c = (await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', sv).where('createdAt', op, T.fromDate(at)).select().get())
  c.docs.forEach(d => all.add(d.id)); tot += c.size
  if (c.size) console.log(df.padEnd(22), typeof sv === 'string' ? 'texte' : 'date ', op, c.size)
}
// Combien sur les 14 derniers jours seulement ?
let in14 = 0
for (const [cf, df] of SHAPES) { const c = await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', T.fromDate(since14)).select().get(); in14 += c.size }
console.log(`${city} : depuis ${since.toLocaleDateString('fr-FR')} → ${tot} lignes (${all.size} expéditions) | 14 derniers jours seulement : ~${in14}`)
process.exit(0)
