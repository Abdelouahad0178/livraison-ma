// LECTURE SEULE : comptes « KERDAOUI » actuels + traces de l'ancien compte sGaOgP… (sans e-mail complet)
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const us = (await db.collection('users').get()).docs.filter(d => /kerdaoui/i.test(`${d.data().name} ${d.data().email}`))
for (const d of us) { const u = d.data(); const e = String(u.email || ''); console.log(d.id.slice(0, 8) + '…', '|', u.name, '|', u.role, '|', u.city, '|', e.replace(/^(.{3}).*(@.*)$/, '$1…$2'), '|', u.blocked ? 'BLOQUÉ' : '') }
// Ancien compte : identifiant complet + ville d'après ses expéditions
const s = await db.collection('parcels').where('portCollectedBy', '==', 'ABDELLAH ELKERDAOUI').limit(400).get()
const ids = {}; s.docs.forEach(x => { const p = x.data(); const k = p.portCollectedById; ids[k] = ids[k] || { n: 0, dest: {} }; ids[k].n++; ids[k].dest[p.destinationCity] = (ids[k].dest[p.destinationCity] || 0) + 1 })
for (const [k, v] of Object.entries(ids)) console.log('collecteur', String(k).slice(0, 8) + '…', 'existe :', us.some(d => d.id === k) ? 'oui' : 'NON', '|', v.n, 'exp. |', JSON.stringify(v.dest))
process.exit(0)
