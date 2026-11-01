import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBi6j03lbBa_8f3QiL5w8IEcBa3fNUlXnk",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "473002759999",
  appId: "1:473002759999:web:8a3dfc9b7aae7cf59c4869"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function fixOldReturns() {
  console.log('🔧 Correction des anciens colis retournés...')

  // Trouver tous les colis retournés sans returnToCity
  const q = query(
    collection(db, 'parcels'),
    where('status', 'in', ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé'])
  )

  const snapshot = await getDocs(q)
  console.log(`📦 Trouvé ${snapshot.size} colis retournés`)

  let fixed = 0
  let skipped = 0
  let errors = 0

  for (const docSnap of snapshot.docs) {
    const parcel = docSnap.data()

    // Si returnToCity existe déjà, skip
    if (parcel.returnToCity) {
      skipped++
      continue
    }

    try {
      // Utiliser createdByCity comme returnToCity (ville source)
      const returnToCity = parcel.createdByCity || parcel.originCity

      if (!returnToCity) {
        console.warn(`⚠️ ${parcel.trackingId}: Pas de ville source trouvée`)
        errors++
        continue
      }

      await updateDoc(doc(db, 'parcels', docSnap.id), {
        returnToCity: returnToCity
      })

      console.log(`✅ ${parcel.trackingId}: returnToCity = ${returnToCity}`)
      fixed++
    } catch (error) {
      console.error(`❌ ${parcel.trackingId}:`, error)
      errors++
    }
  }

  console.log('\n📊 RÉSUMÉ:')
  console.log(`  ✅ Corrigés: ${fixed}`)
  console.log(`  ⏭️  Skipped: ${skipped}`)
  console.log(`  ❌ Erreurs: ${errors}`)
  console.log(`  📦 Total: ${snapshot.size}`)
}

fixOldReturns()
  .then(() => {
    console.log('\n✅ Script terminé!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  })
