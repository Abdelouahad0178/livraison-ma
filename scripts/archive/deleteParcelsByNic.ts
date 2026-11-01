import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'

// Configuration Firebase (même config que dans src/firebase/config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyDlmer33ePemcqAIeaQ9mjSIaBLq51CJSI",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "341029031993",
  appId: "1:341029031993:web:f0ea8bb02ca76374e5a36c"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Liste des N° EXP à supprimer
const nicsToDelete = [
  '2605502',
  '1123242',
  '1116319',
  '1101637',
  '1126881',
  '1129749',
  '1141635'
]

async function deleteParcelsByNic() {
  console.log('🔍 Recherche des expéditions à supprimer...\n')

  for (const nic of nicsToDelete) {
    try {
      // Chercher les colis avec ce N° EXP
      const q = query(
        collection(db, 'parcels'),
        where('sender.nic', '==', nic)
      )

      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        console.log(`❌ N° EXP ${nic}: Aucune expédition trouvée`)
        continue
      }

      // Supprimer toutes les expéditions trouvées
      for (const docSnapshot of snapshot.docs) {
        const parcel = docSnapshot.data()
        console.log(`📦 Trouvé: ${docSnapshot.id} - ${parcel.trackingId} - N° EXP: ${nic}`)

        // Supprimer
        await deleteDoc(doc(db, 'parcels', docSnapshot.id))
        console.log(`✅ Supprimé: ${docSnapshot.id}\n`)
      }

    } catch (error: any) {
      console.error(`❌ Erreur pour N° EXP ${nic}:`, error.message)
    }
  }

  console.log('\n✅ Suppression terminée!')
}

// Exécuter
deleteParcelsByNic()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  })
