#!/usr/bin/env node

/**
 * Archivage 100% LOCAL - SANS suppression de Firestore
 * Les colis restent dans Firestore ET sont sauvegardés localement
 */

const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

// Configuration
const CONFIG = {
  delaiMinimumJours: 90,
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,
  archivesDir: path.join(__dirname, 'archives'),
  firebaseConfig: {
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  }
}

// Initialiser Firebase Admin
admin.initializeApp(CONFIG.firebaseConfig)
const db = admin.firestore()

/**
 * BACKUP LOCAL UNIQUEMENT - Pas de suppression
 */
async function backupLocal() {
  console.log('📦 Backup local démarré...')

  try {
    const dateLimite = new Date()
    dateLimite.setDate(dateLimite.getDate() - CONFIG.delaiMinimumJours)

    const colisABackup = []

    // Récupérer les colis
    for (const status of CONFIG.statutsArchivables) {
      const snapshot = await db.collection('parcels')
        .where('status', '==', status)
        .where('createdAt', '<', admin.firestore.Timestamp.fromDate(dateLimite))
        .get()

      snapshot.docs.forEach(doc => {
        colisABackup.push({ id: doc.id, ...doc.data() })
      })
    }

    console.log(`✅ ${colisABackup.length} colis à sauvegarder`)

    // Créer le dossier
    if (!fs.existsSync(CONFIG.archivesDir)) {
      fs.mkdirSync(CONFIG.archivesDir, { recursive: true })
    }

    // Sauvegarder localement (SANS suppression)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup_${timestamp}_${colisABackup.length}_colis.json`
    const filepath = path.join(CONFIG.archivesDir, filename)

    const backupData = {
      date: new Date().toISOString(),
      type: 'BACKUP_LOCAL_SANS_SUPPRESSION',
      count: colisABackup.length,
      parcels: colisABackup
    }

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2))

    console.log(`💾 Sauvegardé: ${filename}`)
    console.log(`📍 Localisation: ${filepath}`)
    console.log(`✅ BACKUP LOCAL TERMINÉ`)
    console.log(`ℹ️  Les colis RESTENT dans Firestore (pas de suppression)`)

    return { success: true, count: colisABackup.length, filepath }

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    return { success: false, error: error.message }
  }
}

// Exécuter
backupLocal().then(() => process.exit(0))
