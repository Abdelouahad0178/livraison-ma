/**
 * 🔄 Script de migration: Ajouter les champs de recherche dénormalisés
 * Utilise Firebase Admin SDK pour bypass les règles de sécurité
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'

// Charger le service account
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function migrateSearchFields() {
  console.log('🔄 Début migration des champs de recherche...')

  const parcelsRef = db.collection('parcels')
  const snapshot = await parcelsRef.get()

  console.log(`📦 ${snapshot.size} colis à traiter`)

  let batch = db.batch()
  let batchCount = 0
  let totalUpdated = 0
  let alreadyHaveFields = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const sender = data.sender || {}
    const receiver = data.receiver || {}

    // Si le colis a déjà tous les champs, on skip
    if (data.senderTel !== undefined && data.receiverTel !== undefined &&
        data.senderNic !== undefined && data.senderNameLower !== undefined &&
        data.receiverNameLower !== undefined) {
      alreadyHaveFields++
      continue
    }

    // Préparer les champs dénormalisés
    const updates = {
      senderNic: sender.nic ? String(sender.nic).trim().toUpperCase() : '',
      senderTel: sender.tel ? String(sender.tel).replace(/[\s\-\(\)\.]/g, '') : '',
      receiverTel: receiver.tel ? String(receiver.tel).replace(/[\s\-\(\)\.]/g, '') : '',
      senderNameLower: sender.name ? String(sender.name).toLowerCase().trim() : '',
      receiverNameLower: receiver.name ? String(receiver.name).toLowerCase().trim() : ''
    }

    batch.update(doc.ref, updates)
    batchCount++
    totalUpdated++

    // Firestore limite: 500 opérations par batch
    if (batchCount >= 500) {
      await batch.commit()
      console.log(`✅ Batch de ${batchCount} colis mis à jour (total: ${totalUpdated})`)
      batch = db.batch()
      batchCount = 0
    }
  }

  // Commit le dernier batch
  if (batchCount > 0) {
    await batch.commit()
    console.log(`✅ Dernier batch de ${batchCount} colis mis à jour`)
  }

  console.log('\n📊 RÉSUMÉ:')
  console.log(`   Total colis: ${snapshot.size}`)
  console.log(`   Déjà à jour: ${alreadyHaveFields}`)
  console.log(`   Mis à jour: ${totalUpdated}`)
  console.log('\n✅ Migration terminée!')

  process.exit(0)
}

migrateSearchFields().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
