/**
 * Script pour supprimer les clients de passage de Firestore
 *
 * Ce script identifie et supprime les clients qui ont été créés automatiquement
 * lors de la création de colis (clients de passage) et qui ne devraient exister
 * que dans localStorage, pas dans Firestore.
 *
 * Critères d'identification:
 * - accountType = 'cash'
 * - Pas d'email OU email vide
 * - Pas de NIC OU NIC vide
 * - remise = 0
 * - createdByRole = 'agent' (créé automatiquement)
 */

import { config } from 'dotenv'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore'

// Charger les variables d'environnement depuis .env
config()

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

interface PassageClient {
  id: string
  name: string
  tel: string
  city: string
  email?: string
  nic?: string
  accountType: string
  remise: number
  createdByRole?: string
}

async function findPassageClients(): Promise<PassageClient[]> {
  console.log('🔍 Recherche des clients de passage dans Firestore...\n')

  const clientsRef = collection(db, 'clients')
  const snapshot = await getDocs(clientsRef)

  const passageClients: PassageClient[] = []

  snapshot.docs.forEach(doc => {
    const data = doc.data()

    // Critères pour identifier un client de passage
    const isCash = data.accountType === 'cash'
    const noEmail = !data.email || data.email.trim() === ''
    const noNIC = !data.nic || data.nic.trim() === ''
    const noRemise = !data.remise || data.remise === 0
    const createdByAgent = data.createdByRole === 'agent'

    if (isCash && noEmail && noNIC && noRemise && createdByAgent) {
      passageClients.push({
        id: doc.id,
        name: data.name,
        tel: data.tel,
        city: data.city,
        email: data.email,
        nic: data.nic,
        accountType: data.accountType,
        remise: data.remise,
        createdByRole: data.createdByRole,
      })
    }
  })

  return passageClients
}

async function deletePassageClients(clients: PassageClient[]): Promise<void> {
  console.log(`\n🗑️  Suppression de ${clients.length} clients de passage...\n`)

  let deleted = 0
  let errors = 0

  for (const client of clients) {
    try {
      await deleteDoc(doc(db, 'clients', client.id))
      deleted++
      console.log(`✅ Supprimé: ${client.name} (${client.tel}) - ${client.city}`)
    } catch (error) {
      errors++
      console.error(`❌ Erreur: ${client.name} (${client.tel})`, error)
    }
  }

  console.log(`\n📊 Résultat:`)
  console.log(`   ✅ Supprimés: ${deleted}`)
  console.log(`   ❌ Erreurs: ${errors}`)
}

async function main() {
  try {
    // Étape 1: Trouver les clients de passage
    const passageClients = await findPassageClients()

    if (passageClients.length === 0) {
      console.log('✅ Aucun client de passage trouvé dans Firestore.')
      process.exit(0)
    }

    console.log(`📋 ${passageClients.length} clients de passage trouvés:\n`)

    // Afficher la liste
    passageClients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name} - ${client.tel} (${client.city})`)
    })

    // Demander confirmation
    console.log('\n⚠️  ATTENTION: Ces clients vont être supprimés de Firestore.')
    console.log('   Ils seront automatiquement sauvegardés dans localStorage lors')
    console.log('   de la prochaine utilisation.\n')

    // En mode automatique, on supprime directement
    // Vous pouvez ajouter une confirmation interactive si nécessaire
    const shouldDelete = process.argv.includes('--confirm')

    if (shouldDelete) {
      await deletePassageClients(passageClients)
      console.log('\n✅ Nettoyage terminé!')
    } else {
      console.log('ℹ️  Pour confirmer la suppression, relancez le script avec --confirm:')
      console.log('   npm run cleanup-passage-clients -- --confirm')
    }

    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  }
}

main()
