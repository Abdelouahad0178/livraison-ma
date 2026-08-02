// Script pour ajouter le senderNic à toutes les factures existantes
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCc4N_MjLDLFaHWT2WzsLE1ba7EYT6rQ9w",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "835138774056",
  appId: "1:835138774056:web:a64cd4eb3766ead0b87813"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function updateInvoicesWithNIC() {
  console.log('🔄 Début de la mise à jour des factures...')

  try {
    // Récupérer toutes les factures
    const invoicesSnapshot = await getDocs(collection(db, 'invoices'))
    console.log(`📋 ${invoicesSnapshot.size} factures trouvées`)

    let updatedCount = 0
    let errorCount = 0

    for (const invoiceDoc of invoicesSnapshot.docs) {
      const invoice = invoiceDoc.data()
      const invoiceId = invoiceDoc.id

      console.log(`\n📄 Traitement facture ${invoice.invoiceNumber}...`)

      // Mettre à jour chaque item avec le NIC du parcel
      const updatedItems = await Promise.all(
        invoice.items.map(async (item) => {
          // Si le senderNic existe déjà, le garder
          if (item.senderNic) {
            console.log(`  ✓ Item ${item.trackingId} a déjà un NIC: ${item.senderNic}`)
            return item
          }

          try {
            // Récupérer le parcel correspondant
            const parcelDoc = await getDoc(doc(db, 'parcels', item.parcelId))

            if (!parcelDoc.exists()) {
              console.log(`  ⚠️ Parcel ${item.parcelId} non trouvé`)
              return item
            }

            const parcel = parcelDoc.data()
            const senderNic = parcel.sender?.nic || ''

            if (senderNic) {
              console.log(`  ✓ Item ${item.trackingId} -> NIC: ${senderNic}`)
            } else {
              console.log(`  ⚠️ Item ${item.trackingId} -> Pas de NIC dans le parcel`)
            }

            return {
              ...item,
              senderNic: senderNic
            }
          } catch (error) {
            console.error(`  ❌ Erreur pour item ${item.trackingId}:`, error.message)
            return item
          }
        })
      )

      // Mettre à jour la facture dans Firestore
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), {
          items: updatedItems
        })
        updatedCount++
        console.log(`  ✅ Facture ${invoice.invoiceNumber} mise à jour`)
      } catch (error) {
        errorCount++
        console.error(`  ❌ Erreur mise à jour facture ${invoice.invoiceNumber}:`, error.message)
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log(`✅ Mise à jour terminée`)
    console.log(`   - ${updatedCount} factures mises à jour`)
    console.log(`   - ${errorCount} erreurs`)
    console.log('='.repeat(50))

  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

// Exécuter le script
updateInvoicesWithNIC()
  .then(() => {
    console.log('\n✅ Script terminé avec succès')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  })
