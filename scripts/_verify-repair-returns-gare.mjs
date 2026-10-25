// LECTURE SEULE : vérification des réparations 2.3 / 2.1 (argent inchangé, copies à jour)
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const backup = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const MONEY = ['price', 'portType', 'portStatus', 'portCollectedAt', 'portCollectedById', 'portExpReceivedAt', 'portChefReceivedAt', 'codStatus', 'codCollectedAt', 'codCollectedById', 'codExpReceivedAt', 'adminTransferred', 'portAdminTransferred', 'createdAt', 'workDate']
const changed = {}, liteKo = [], factKo = []
for (const b of backup) {
  const cur = (await db.collection('parcels').doc(b.id).get()).data()
  for (const k of MONEY) { const a = JSON.stringify(b.data[k] ?? null), c = JSON.stringify(cur[k]?.toMillis ? { _seconds: cur[k].seconds, _nanoseconds: cur[k].nanoseconds } : (cur[k] ?? null)); if (a !== c) changed[k] = (changed[k] || 0) + 1 }
  const lite = (await db.collection('parcelsLite').doc(b.id).get()).data(), fact = (await db.collection('parcelsFacturier').doc(b.id).get()).data()
  const same = x => x && x.destinationCity === cur.destinationCity && (x.deliveryDriverId ?? null) === (cur.deliveryDriverId ?? null) && x.status === cur.status
  if (!same(lite)) liteKo.push(b.data.senderNic); if (fact && !same(fact)) factKo.push(b.data.senderNic)
}
console.log(`${backup.length} expéditions vérifiées | champs d'argent / dates modifiés :`, Object.keys(changed).length ? changed : 'aucun')
console.log('copies parcelsLite pas à jour :', liteKo.length ? liteKo : 'aucune', '| parcelsFacturier :', factKo.length ? factKo : 'aucune')
process.exit(0)
