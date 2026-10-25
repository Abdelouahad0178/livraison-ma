// Diagnostic Firebase en lecture seule, sans affichage des identifiants.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const root = fileURLToPath(new URL('../', import.meta.url))
let app
let db

try {
  const env = {}
  for (const name of ['.env', '.env.local']) {
    const path = resolve(root, name)
    if (existsSync(path)) Object.assign(env, parse(readFileSync(path)))
  }

  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ]
  const missing = required.filter(name => !env[name]?.trim())
  if (missing.length) throw new Error(`Configuration manquante : ${missing.join(', ')}`)

  const projectId = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8')).projects?.default
  if (!projectId || projectId !== env.VITE_FIREBASE_PROJECT_ID) {
    throw new Error('Les projets de .firebaserc et de la configuration Vite ne correspondent pas.')
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST est actif. Ce diagnostic verifie la base distante ; utilisez un terminal sans cette variable.')
  }
  console.log(`Projet Firebase : ${projectId}`)
  console.log('Configuration application : OK')

  const keyPath = resolve(root, 'serviceAccountKey.json')
  if (!existsSync(keyPath)) throw new Error('serviceAccountKey.json absent du dossier du projet.')
  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  if (key.type !== 'service_account' || key.project_id !== projectId || !key.private_key || !key.client_email) {
    throw new Error('Compte de service invalide ou rattache a un autre projet.')
  }

  app = initializeApp({ credential: cert(key), projectId }, 'firebase-access-check')
  db = getFirestore(app)
  // Projection vide : aucun champ metier n'est telecharge ou affiche.
  const snapshot = await db.collection('users').select().limit(1).get()
  console.log(`Lecture Firestore distante : OK (${snapshot.size} document temoin)`)
  console.log('Acces via le compte de service confirme. Aucune donnee modifiee.')
  console.log('Les regles de securite des utilisateurs de l\'application ne sont pas testees par ce diagnostic Admin.')
} catch (error) {
  // Les erreurs du SDK peuvent contenir des details de requete : afficher seulement leur code.
  const sdkError = error?.code !== undefined
  console.error(sdkError
    ? `Echec de connexion Firebase (code ${error.code}). Verifiez le reseau et les autorisations du compte de service.`
    : error instanceof SyntaxError
      ? 'Un fichier de configuration JSON est invalide.'
      : error?.message || 'Echec du diagnostic Firebase.')
  process.exitCode = 1
} finally {
  if (db) await db.terminate()
  if (app) await deleteApp(app)
}
