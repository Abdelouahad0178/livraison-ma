// LECTURE SEULE : rejoue, avec les droits du compte qui a saisi 1212579 (jeton personnalisé, aucun mot de passe),
// la requête du contrôle « N° EXP déjà existant » de l'écran de saisie. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { getFirestore, collection, query, where, limit, getDocs } from 'firebase/firestore'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID })
await signInWithCustomToken(getAuth(app), await admin.auth().createCustomToken('sB9GAnS6IQZWdb3O0rVa9XJMg4q2'))
const db = getFirestore(app)
for (const nic of ['1212579', '1212578']) {
  try {
    const s = await getDocs(query(collection(db, 'parcels'), where('sender.nic', '==', nic), limit(1)))
    console.log(nic, '→', s.size ? 'TROUVÉ (alerte affichée)' : 'non trouvé')
  } catch (e) { console.log(nic, '→ ERREUR', e.code) }
}
process.exit(0)
