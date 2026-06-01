#!/usr/bin/env node

/**
 * Compte le nombre total de colis (pour estimer le temps de création d'index)
 */

const admin = require('firebase-admin')

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
})

const db = admin.firestore()

async function compterColis() {
  console.log('📊 Comptage des colis...\n')

  try {
    // Compter sans filtre (pas besoin d'index)
    const snapshot = await db.collection('parcels').count().get()
    const total = snapshot.data().count

    console.log(`📦 Total de colis dans Firestore: ${total.toLocaleString('fr-FR')}`)
    console.log(``)

    // Estimer le temps de création d'index
    let tempsEstime = '30 secondes - 1 minute'
    if (total > 10000) tempsEstime = '5-10 minutes'
    else if (total > 1000) tempsEstime = '2-5 minutes'

    console.log(`⏱️  Temps estimé pour création d'index: ${tempsEstime}`)
    console.log(``)
    console.log(`💡 Conseil: Attendez que l'index soit "✅ Activé" dans:`)
    console.log(`   https://console.firebase.google.com/project/arelanc/firestore/indexes`)
    console.log(``)

  } catch (error) {
    console.error('❌ Erreur:', error.message)
  }

  process.exit(0)
}

compterColis()
