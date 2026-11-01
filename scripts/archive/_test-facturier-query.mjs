// LECTURE SEULE : rejoue, avec les droits d'un compte facturier (jeton personnalisé, aucun mot de passe),
// la requête de période de la page Facturier sur parcelsFacturier. Aucune écriture. Aucun secret affiché.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { getFirestore, collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const users = await admin.firestore().collection('users').where('role', '==', 'facturier').limit(1).get()
if (users.empty) { console.log('Aucun compte facturier'); process.exit(0) }
const uid = users.docs[0].id
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID })
await signInWithCustomToken(getAuth(app), await admin.auth().createCustomToken(uid))
const db = getFirestore(app)
const start = new Date('2026-10-01T00:00:00'), end = new Date('2026-10-02T00:00:00')
for (const col of ['parcelsFacturier', 'parcelsLite']) {
  try {
    const snap = await getDocs(query(collection(db, col), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<', Timestamp.fromDate(end)), orderBy('createdAt', 'desc'), limit(1000)))
    console.log(`${col} : ${snap.size} expéditions le 01/10`)
  } catch (e) { console.log(`${col} : ERREUR ${e.code} — ${e.message}`) }
}
process.exit(0)
