/**
 * 🔄 Script de migration: Ajouter les champs de recherche dénormalisés
 *
 * Ajoute senderTel, receiverTel, senderNic, senderNameLower, receiverNameLower
 * sur TOUS les colis existants pour activer la recherche rapide.
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAcUsVLwpAaYC3TGzlWO0uLBtxZOH9LzbA",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "648854166488",
  appId: "1:648854166488:web:ba72dbb5ac01b98dad2f7f"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function migrateSearchFields() {
  console.log('🔄 Début migration des champs de recherche...')

  const parcelsRef = collection(db, 'parcels')
  const snapshot = await getDocs(parcelsRef)

  console.log(`📦 ${snapshot.size} colis à traiter`)

  let batch = writeBatch(db)
  let batchCount = 0
  let totalUpdated = 0
  let alreadyHaveFields = 0

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
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

    batch.update(doc(db, 'parcels', docSnap.id), updates)
    batchCount++
    totalUpdated++

    // Firestore limite: 500 opérations par batch
    if (batchCount >= 500) {
      await batch.commit()
      console.log(`✅ Batch de ${batchCount} colis mis à jour (total: ${totalUpdated})`)
      batch = writeBatch(db)
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
}

migrateSearchFields().catch(console.error)
