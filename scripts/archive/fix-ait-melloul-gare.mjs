/** Ait Melloul : renomme le compte livreur-gare en « En gare - Ait Melloul » et rattache à ce compte
 *  les colis à destination d'Ait Melloul affectés par erreur à « En gare - Agadir ». */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const GARE_ID = 'ApVo5FhaJnabDDhgbuoi4uXcBU63', NAME = 'En gare - Ait Melloul'
const s = await db.collection('parcels').where('destinationCity','==','Ait Melloul').where('deliveryDriverName','==','En gare - Agadir').get()
writeFileSync('scripts/fix-ait-melloul-gare-backup.json', JSON.stringify(s.docs.map(d=>({ id:d.id, deliveryDriverId:d.data().deliveryDriverId, deliveryDriverName:d.data().deliveryDriverName }))))
const b = db.batch()
s.docs.forEach(d => b.update(d.ref, { deliveryDriverId: GARE_ID, deliveryDriverName: NAME }))
b.update(db.doc('users/'+GARE_ID), { name: NAME })
await b.commit()
console.log('colis rattachés :', s.size, '| compte renommé :', NAME)
