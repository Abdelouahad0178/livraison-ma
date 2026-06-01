#!/usr/bin/env node
/**
 * Script pour initialiser TOUTES les données essentielles après suppression
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
  console.log('🚀 Initialisation de TOUTES les données essentielles...\n')

  try {
    // 1. Créer operationLocks
    console.log('📝 Création de operationLocks...')
    await db.collection('operationLocks').doc('global').set({
      globalStopped: false,
      globalUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      globalUpdatedBy: 'System',
      agencies: {}
    })
    console.log('✅ operationLocks créé')

    // 2. Créer settings/tariffs (document vide pour éviter les erreurs)
    console.log('📝 Création de settings/tariffs...')
    await db.collection('settings').doc('tariffs').set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      tariffs: {}
    })
    console.log('✅ settings/tariffs créé')

    // 3. Récupérer les villes depuis les users
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

    // 4. Créer agencyCashes pour chaque ville
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
    console.log(`   - settings: 1 (tariffs)`)
    console.log(`   - agencyCashes: ${cities.size}`)
    console.log('='.repeat(60) + '\n')

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }

  process.exit(0)
}

initializeData()
