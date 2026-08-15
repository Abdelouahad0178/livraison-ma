/**
 * Script pour corriger le codPaymentType des anciennes expéditions
 *
 * Problème : Avant le fix, toutes les expéditions COD avaient codPaymentType='especes'
 * même si serviceType était 'cheque' ou 'traite'
 *
 * Ce script corrige le codPaymentType en se basant sur serviceType
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore'

// Configuration Firebase (même config que dans votre app)
const firebaseConfig = {
  apiKey: "AIzaSyDN5I3IP_vT5f3dd5y4BNKUBHfauEhKic8",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "1001298645422",
  appId: "1:1001298645422:web:fb64dcbc372327e93f3a12"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Fonction de conversion serviceType → codPaymentType
const serviceToPaymentType = (st: string | null | undefined): string => {
  if (st === 'retour_bl') return 'bon_livraison'
  if (st === 'simple') return 'especes'
  return st || 'especes'
}

async function fixCodPaymentTypes() {
  console.log('🔧 Début de la correction des codPaymentType...\n')

  try {
    // Récupérer TOUTES les expéditions avec COD
    const q = query(
      collection(db, 'parcels'),
      where('codAmount', '>', 0)
    )

    const snapshot = await getDocs(q)
    console.log(`📦 ${snapshot.size} expéditions COD trouvées\n`)

    let corrected = 0
    let alreadyCorrect = 0
    let errors = 0

    for (const docSnap of snapshot.docs) {
      const parcel = docSnap.data()
      const currentPaymentType = parcel.codPaymentType
      const serviceType = parcel.serviceType
      const correctPaymentType = serviceToPaymentType(serviceType)

      // Si le codPaymentType est déjà correct, on ne fait rien
      if (currentPaymentType === correctPaymentType) {
        alreadyCorrect++
        continue
      }

      // Afficher l'expédition à corriger
      console.log(`📝 NIC ${parcel.senderNic || 'N/A'} | Tracking: ${parcel.trackingId || docSnap.id}`)
      console.log(`   serviceType: ${serviceType}`)
      console.log(`   codPaymentType AVANT: ${currentPaymentType}`)
      console.log(`   codPaymentType APRÈS: ${correctPaymentType}`)

      try {
        // Mettre à jour le document
        await updateDoc(doc(db, 'parcels', docSnap.id), {
          codPaymentType: correctPaymentType
        })
        console.log(`   ✅ CORRIGÉ\n`)
        corrected++
      } catch (error) {
        console.error(`   ❌ ERREUR:`, error)
        errors++
      }
    }

    // Résumé
    console.log('\n' + '='.repeat(60))
    console.log('📊 RÉSUMÉ :')
    console.log(`   ✅ Corrigées : ${corrected}`)
    console.log(`   ⏭️  Déjà correctes : ${alreadyCorrect}`)
    console.log(`   ❌ Erreurs : ${errors}`)
    console.log(`   📦 Total traité : ${snapshot.size}`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }

  console.log('\n✨ Script terminé')
  process.exit(0)
}

// Lancer le script
fixCodPaymentTypes()
