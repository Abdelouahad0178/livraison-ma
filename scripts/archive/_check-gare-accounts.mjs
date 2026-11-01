// LECTURE SEULE : comptes « en gare » d'Agadir et configuration des détenteurs du guichet.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const us = await db.collection('users').where('city', '==', 'Agadir').get()
us.docs.forEach(d => { const u = d.data(); const n = `${u.name || ''} ${u.email || ''}`; if (/gare|rachida|hamza|ENGARE|nour/i.test(n) || ['livreur', 'driver', 'livreur_gare', 'depot'].includes(u.role))
  console.log(d.id.slice(0, 6) + '…', '|', u.name, '|', u.email, '|', u.role, '|', u.isDepot ?? u.gareDepot ?? '', '|', u.blocked ? 'BLOQUÉ' : '') })
const cfg = await db.doc('config/guichetHolders').get()
console.log('config/guichetHolders :', JSON.stringify(cfg.exists ? cfg.data() : null).slice(0, 600))
process.exit(0)
