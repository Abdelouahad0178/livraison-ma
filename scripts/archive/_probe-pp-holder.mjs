// LECTURE SEULE : détenteur du guichet des ports payés de la capture (Agadir, 23/10/2026)
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
for (const nic of ['1027207', '1068764', '1229603', '1229761', '1229763', '1229765', '1229769', '1229770', '1229772', '12297764']) {
  const s = await admin.firestore().collection('parcels').where('senderNic', '==', nic).limit(3).get()
  s.docs.forEach(d => { const p = d.data(); console.log(nic.padEnd(9), (p.originCity || '').padEnd(10), '→', (p.destinationCity || '').padEnd(11), '| guichet :', p.portGuichetHolderName || '(aucun)', '| encaissé par :', p.portCollectedBy || '-', '| livreur :', p.deliveryDriverName || '-') })
  if (!s.size) console.log(nic, 'introuvable')
}
process.exit(0)
