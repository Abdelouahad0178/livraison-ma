#!/usr/bin/env node
/**
 * Script pour supprimer TOUTES les données Firestore SAUF les utilisateurs
 * Utilise les credentials Firebase actuels (pas besoin de serviceAccount.json)
 *
 * ATTENTION : Cette action est IRREVERSIBLE !
 *
 * Usage: node deleteDataWithCLI.mjs
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Charger la config Firebase depuis .env
const envPath = join(__dirname, '.env')
const envContent = readFileSync(envPath, 'utf-8')

const getEnvValue = (key) => {
  const match = envContent.match(new RegExp(`${key}=(.+)`))
  return match ? match[1].trim() : ''
}

const firebaseConfig = {
  apiKey: getEnvValue('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvValue('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvValue('VITE_FIREBASE_APP_ID'),
}

// Initialiser Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Liste de TOUTES les collections (sauf 'users')
const COLLECTIONS_TO_DELETE = [
  'settings',
  'parcels',
  'clients',
  'payments',
  'caisseEntries',
  'agentRemises',
  'caissierRemarks',
  'caisseClotures',
  'caissierTransactions',
  'caissierRequests',
  'agentCashRecoveryRequests',
  'agentCodRequests',
  'agencyCashes',
  'vehicles',
  'directorLogs',
  'cities',
  'clientMessages',
  'clientPortals',
  'reglements',
  'reglementsRapports',
  'bankDeposits',
  'centralCodDeposits',
  'centralSupplierPayments',
  'modifications',
  'arrivages',
  'sectors',
  'bonRamasageBatches',
  'adminTransfersFromAgents',
  'operationLocks',
  'signatures',
  'tariffs',
  'archives',
  'driverPortDuTransactions',
]

/**
 * Supprime tous les documents d'une collection
 */
async function deleteCollection(collectionName) {
  const collectionRef = collection(db, collectionName)
  let totalDeleted = 0

  try {
    const snapshot = await getDocs(collectionRef)

    if (snapshot.empty) {
      console.log(`⚪ Collection "${collectionName}" est vide`)
      return 0
    }

    console.log(`   📄 ${snapshot.size} documents trouvés dans ${collectionName}...`)

    // Supprimer par batch de 500 pour éviter les erreurs
    const docs = snapshot.docs
    const batchSize = 500

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize)
      await Promise.all(batch.map(d => deleteDoc(d.ref)))
      totalDeleted += batch.length
      console.log(`   ✓ ${totalDeleted}/${docs.length} supprimés...`)
    }

    console.log(`✅ Collection "${collectionName}" supprimée : ${totalDeleted} documents au total`)
    return totalDeleted
  } catch (error) {
    console.error(`❌ Erreur suppression "${collectionName}":`, error.message)
    return 0
  }
}

/**
 * Script principal
 */
async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('🗑️  SUPPRESSION DE TOUTES LES DONNÉES (SAUF UTILISATEURS)')
  console.log('='.repeat(70))
  console.log('\n⚠️  ATTENTION : Cette action est IRREVERSIBLE !\n')
  console.log(`📋 Collections à supprimer : ${COLLECTIONS_TO_DELETE.length}`)
  console.log(`🔒 Collection préservée : users\n`)

  // Confirmation
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise(resolve => {
    rl.question('Êtes-vous ABSOLUMENT SÛR de vouloir continuer ? (tapez "OUI SUPPRIMER" pour confirmer) : ', resolve)
  })
  rl.close()

  if (answer.trim() !== 'OUI SUPPRIMER') {
    console.log('\n❌ Suppression annulée.')
    process.exit(0)
  }

  console.log('\n🚀 Démarrage de la suppression...\n')

  let totalDocsDeleted = 0
  let collectionsDeleted = 0
  const startTime = Date.now()

  for (const collectionName of COLLECTIONS_TO_DELETE) {
    console.log(`\n📦 Traitement de "${collectionName}"...`)
    const deleted = await deleteCollection(collectionName)
    totalDocsDeleted += deleted
    if (deleted > 0) collectionsDeleted++
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n' + '='.repeat(70))
  console.log('✅ SUPPRESSION TERMINÉE')
  console.log('='.repeat(70))
  console.log(`📊 Collections supprimées : ${collectionsDeleted}/${COLLECTIONS_TO_DELETE.length}`)
  console.log(`📄 Documents supprimés : ${totalDocsDeleted.toLocaleString('fr-FR')}`)
  console.log(`⏱️  Durée : ${duration}s`)
  console.log(`🔒 Collection "users" préservée ✓`)
  console.log('='.repeat(70) + '\n')

  process.exit(0)
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err)
  process.exit(1)
})
