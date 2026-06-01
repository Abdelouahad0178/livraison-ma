#!/usr/bin/env node
/**
 * Script pour initialiser les données minimales après suppression
 * Crée les documents essentiels pour que l'app fonctionne
 */

import admin from 'firebase-admin'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const serviceAccount = require('./serviceAccount.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function initializeData() {
  console.log('🚀 Initialisation des données minimales...\n')

  try {
    // 1. Créer le document operationLocks global
    console.log('📝 Création de operationLocks...')
    await db.collection('operationLocks').doc('global').set({
      globalStopped: false,
      globalUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      globalUpdatedBy: 'System',
      agencies: {}
    })
    console.log('✅ operationLocks créé\n')

    // 2. Créer les agencyCashes pour chaque ville si des utilisateurs existent
    console.log('📝 Récupération des villes...')
    const usersSnapshot = await db.collection('users').get()
    const cities = new Set()

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data()
      if (userData.city) {
        cities.add(userData.city)
      }
    })

    console.log(`📍 Villes trouvées: ${Array.from(cities).join(', ')}\n`)

    for (const city of cities) {
      console.log(`💰 Création agencyCash pour ${city}...`)
      await db.collection('agencyCashes').doc(city).set({
        city: city,
        solde: 0,
        soldeEspeces: 0,
        soldeCheques: 0,
        soldeTraites: 0,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: 'System',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      })
      console.log(`✅ agencyCash ${city} créé`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Initialisation terminée avec succès !')
    console.log('='.repeat(60))
    console.log(`📊 Documents créés:`)
    console.log(`   - operationLocks: 1`)
    console.log(`   - agencyCashes: ${cities.size}`)
    console.log('='.repeat(60) + '\n')

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    process.exit(1)
  }

  process.exit(0)
}

initializeData()
