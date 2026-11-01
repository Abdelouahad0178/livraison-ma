// LECTURE SEULE : l'index (originCity, portType, portStatus, createdAt) est-il prêt ? + comptage avant / après bornes
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const base = db.collection('parcels').where('originCity', '==', 'Agadir').where('portType', '==', 'port_paye').where('portStatus', '==', 'collected')
const d0 = new Date(); d0.setHours(8, 0, 0, 0); if (new Date().getHours() < 6) d0.setDate(d0.getDate() - 1)
try {
  const all = (await base.count().get()).data().count
  const day = (await base.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(d0)).count().get()).data().count
  const d45 = (await base.where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 45 * 864e5)).count().get()).data().count
  console.log('PRET | toutes dates :', all, '| journée :', day, '| 45 jours :', d45)
} catch (e) { console.log('PAS PRET :', e.code, String(e.message).slice(0, 80)) }
process.exit(0)
