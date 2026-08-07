/**
 * Script pour détecter les expéditions créées en double
 * dans les 3 dernières semaines
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs, Timestamp } from 'firebase/firestore'

// Configuration Firebase (copiée depuis votre config)
const firebaseConfig = {
  apiKey: "AIzaSyDpo-tls9om7e8TmVi8DxH9LMlT9H8RQ3I",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "867426720175",
  appId: "1:867426720175:web:89fc74b25e06a4f76f9e3f"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function findDuplicates() {
  console.log('🔍 Recherche des doublons dans les 3 dernières semaines...\n')

  // Date il y a 3 semaines
  const threeWeeksAgo = new Date()
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21)

  const parcelsRef = collection(db, 'parcels')
  const q = query(
    parcelsRef,
    where('createdAt', '>=', Timestamp.fromDate(threeWeeksAgo))
  )

  const snapshot = await getDocs(q)
  console.log(`📦 ${snapshot.size} expéditions trouvées depuis ${threeWeeksAgo.toLocaleDateString('fr-FR')}\n`)

  // Grouper par clé unique (expéditeur + destinataire + montant + COD)
  const groups = new Map()

  snapshot.forEach(doc => {
    const parcel = doc.data()
    const createdAt = parcel.createdAt?.toDate() || new Date()

    // Créer une clé pour identifier les doublons potentiels
    const key = [
      parcel.sender?.name || '',
      parcel.sender?.tel || '',
      parcel.receiver?.name || '',
      parcel.receiver?.tel || '',
      parcel.price || 0,
      parcel.codAmount || 0,
      parcel.weight || 0
    ].join('|').toLowerCase()

    if (!groups.has(key)) {
      groups.set(key, [])
    }

    groups.get(key).push({
      id: doc.id,
      trackingId: parcel.trackingId,
      createdAt,
      sender: parcel.sender?.name,
      receiver: parcel.receiver?.name,
      price: parcel.price,
      codAmount: parcel.codAmount,
      agentName: parcel.agentName,
      status: parcel.status
    })
  })

  // Filtrer les groupes avec plus d'une expédition
  const duplicates = []

  groups.forEach(items => {
    if (items.length > 1) {
      // Vérifier si créées dans un intervalle de 10 secondes
      for (let i = 0; i < items.length - 1; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const timeDiff = Math.abs(items[i].createdAt - items[j].createdAt) / 1000 // en secondes
          if (timeDiff <= 10) {
            duplicates.push({
              group: items,
              timeDiff
            })
            break
          }
        }
      }
    }
  })

  console.log(`\n⚠️  ${duplicates.length} groupes de doublons détectés:\n`)
  console.log('='.repeat(100))

  duplicates.forEach((dup, index) => {
    console.log(`\n📋 Doublon #${index + 1} (écart: ${dup.timeDiff.toFixed(1)}s)`)
    console.log('-'.repeat(100))
    dup.group.forEach(item => {
      console.log(`  🎫 ${item.trackingId}`)
      console.log(`     └─ Créé le: ${item.createdAt.toLocaleString('fr-FR')}`)
      console.log(`     └─ Agent: ${item.agentName || 'N/A'}`)
      console.log(`     └─ Expéditeur: ${item.sender}`)
      console.log(`     └─ Destinataire: ${item.receiver}`)
      console.log(`     └─ Prix: ${item.price} DH | COD: ${item.codAmount} DH`)
      console.log(`     └─ Statut: ${item.status}`)
      console.log('')
    })
  })

  console.log('\n' + '='.repeat(100))
  console.log(`\n✅ Total: ${duplicates.length} doublons trouvés`)
}

findDuplicates().catch(console.error)
