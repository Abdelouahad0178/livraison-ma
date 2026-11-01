/**
 * Script pour nettoyer les clients destinataires avec ancien code
 *
 * Pour l'exécuter:
 * 1. npm install -g ts-node
 * 2. ts-node scripts/cleanDestinataires.ts
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore'

// Configuration Firebase (à copier depuis src/firebase/config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyBz8Z9YvQGxGP0xvqGJH8MJ_R0qGJxGP0Q",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function listDestinataires() {
  console.log('\n📋 Liste des clients DESTINATAIRES:\n')

  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  )

  const snapshot = await getDocs(q)
  const clients: any[] = []

  snapshot.forEach(doc => {
    const data = doc.data()
    clients.push({ id: doc.id, ...data })
    console.log(`ID: ${doc.id}`)
    console.log(`  Nom: ${data.name}`)
    console.log(`  Code: ${data.code || 'AUCUN'}`)
    console.log(`  Ville: ${data.city || '—'}`)
    console.log(`  Tel: ${data.tel || '—'}`)
    console.log('---')
  })

  console.log(`\n✅ Total: ${clients.length} clients destinataires`)
  return clients
}

async function deleteDestinatairesWithoutCode() {
  console.log('\n🗑️  Suppression des destinataires SANS code...\n')

  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  )

  const snapshot = await getDocs(q)
  const batch = writeBatch(db)
  let count = 0

  snapshot.forEach(docSnap => {
    const data = docSnap.data()
    // Supprimer si pas de code OU code vide
    if (!data.code || data.code.trim() === '') {
      console.log(`❌ Suppression: ${data.name} (ID: ${docSnap.id})`)
      batch.delete(doc(db, 'clients', docSnap.id))
      count++
    }
  })

  if (count > 0) {
    await batch.commit()
    console.log(`\n✅ ${count} clients destinataires supprimés`)
  } else {
    console.log('\n✅ Aucun client à supprimer')
  }
}

async function deleteAllDestinataires() {
  console.log('\n⚠️  ATTENTION: Suppression de TOUS les destinataires...\n')

  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  )

  const snapshot = await getDocs(q)
  const batch = writeBatch(db)

  snapshot.forEach(docSnap => {
    const data = docSnap.data()
    console.log(`❌ Suppression: ${data.name} (Code: ${data.code || 'AUCUN'})`)
    batch.delete(doc(db, 'clients', docSnap.id))
  })

  if (!snapshot.empty) {
    await batch.commit()
    console.log(`\n✅ ${snapshot.size} clients destinataires supprimés`)
  } else {
    console.log('\n✅ Aucun client destinataire trouvé')
  }
}

// Menu principal
async function main() {
  console.log('='.repeat(50))
  console.log('🧹 NETTOYAGE DES CLIENTS DESTINATAIRES')
  console.log('='.repeat(50))

  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'list':
      await listDestinataires()
      break

    case 'delete-without-code':
      await deleteDestinatairesWithoutCode()
      break

    case 'delete-all':
      console.log('\n⚠️  CONFIRMATION REQUISE ⚠️')
      console.log('Cette action va supprimer TOUS les clients destinataires!')
      console.log('Pour confirmer, relancez avec: delete-all-confirm\n')
      break

    case 'delete-all-confirm':
      await deleteAllDestinataires()
      break

    default:
      console.log('\nCommandes disponibles:')
      console.log('  list                    - Afficher tous les clients destinataires')
      console.log('  delete-without-code     - Supprimer les destinataires sans code')
      console.log('  delete-all              - Supprimer TOUS les destinataires (avec confirmation)')
      console.log('\nExemple: ts-node scripts/cleanDestinataires.ts list')
  }

  process.exit(0)
}

main().catch(console.error)
