#!/usr/bin/env node
/**
 * Script pour supprimer TOUTES les données Firestore SAUF les utilisateurs
 *
 * ATTENTION : Cette action est IRREVERSIBLE !
 *
 * Usage: node deleteAllDataExceptUsers.mjs
 */

import admin from 'firebase-admin'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const serviceAccount = require('./serviceAccount.json')

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

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
 * Supprime tous les documents d'une collection par batch
 */
async function deleteCollection(collectionName) {
  const collectionRef = db.collection(collectionName)
  const batchSize = 500
  let totalDeleted = 0

  try {
    let snapshot = await collectionRef.limit(batchSize).get()

    while (!snapshot.empty) {
      const batch = db.batch()
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref)
      })

      await batch.commit()
      totalDeleted += snapshot.docs.length
      console.log(`   ✓ ${totalDeleted} documents supprimés de ${collectionName}...`)

      // Récupérer le prochain batch
      snapshot = await collectionRef.limit(batchSize).get()
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
