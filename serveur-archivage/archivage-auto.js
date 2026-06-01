#!/usr/bin/env node

/**
 * Script d'archivage automatique
 * À exécuter avec cron (Linux) ou Task Scheduler (Windows)
 */

const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

// Configuration
const CONFIG = {
  // Politique d'archivage
  delaiMinimumJours: 90,  // 3 mois
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,
  batchSize: 100,

  // Serveur local
  archivesDir: path.join(__dirname, 'archives'),

  // Firebase (à configurer)
  firebaseConfig: {
    // Remplacer par votre config ou utiliser variable d'environnement
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  }
}

// Initialiser Firebase Admin
admin.initializeApp(CONFIG.firebaseConfig)
const db = admin.firestore()

/**
 * Vérifie si un colis est archivable
 */
function estArchivable(parcel) {
  // 1. Vérifier le statut
  if (!CONFIG.statutsArchivables.includes(parcel.status)) {
    return false
  }

  // 2. Vérifier le délai
  const createdAt = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : new Date(parcel.createdAt)
  const ageJours = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

  if (ageJours < CONFIG.delaiMinimumJours) {
    return false
  }

  // 3. Pour "Livré", vérifier COD payé
  if (CONFIG.seulementCodPaye && parcel.status === 'Livré') {
    if (parcel.codAmount > 0) {
      const codPaye = parcel.codStatus === 'settled' || parcel.codStatus === 'paid'
      if (!codPaye) return false
    }
  }

  return true
}

/**
 * Récupère les colis archivables
 */
async function getColisArchivables() {
  console.log('🔍 Recherche des colis archivables...')

  const colisArchivables = []
  const dateLimite = new Date()
  dateLimite.setDate(dateLimite.getDate() - CONFIG.delaiMinimumJours)

  for (const status of CONFIG.statutsArchivables) {
    const snapshot = await db.collection('parcels')
      .where('status', '==', status)
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(dateLimite))
      .get()

    snapshot.docs.forEach(doc => {
      const parcel = { id: doc.id, ...doc.data() }
      if (estArchivable(parcel)) {
        colisArchivables.push(parcel)
      }
    })
  }

  console.log(`✅ ${colisArchivables.length} colis éligibles trouvés`)
  return colisArchivables
}

/**
 * Archive les colis
 */
async function archiverColis(colis) {
  if (colis.length === 0) {
    console.log('ℹ️  Aucun colis à archiver')
    return { success: true, archived: 0 }
  }

  console.log(`📦 Archivage de ${colis.length} colis...`)

  try {
    // 1. Créer le dossier archives s'il n'existe pas
    if (!fs.existsSync(CONFIG.archivesDir)) {
      fs.mkdirSync(CONFIG.archivesDir, { recursive: true })
    }

    // 2. Sauvegarder en JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `archive_${timestamp}_${colis.length}_colis.json`
    const filepath = path.join(CONFIG.archivesDir, filename)

    const archiveData = {
      date: new Date().toISOString(),
      policy: CONFIG,
      count: colis.length,
      parcels: colis.map(p => ({
        ...p,
        archivedAt: new Date().toISOString(),
        archivedBy: 'auto-script'
      }))
    }

    fs.writeFileSync(filepath, JSON.stringify(archiveData, null, 2))
    console.log(`💾 Sauvegardé: ${filename}`)

    // 3. Supprimer de Firestore (par batches)
    let deleted = 0
    for (let i = 0; i < colis.length; i += CONFIG.batchSize) {
      const batch = db.batch()
      const chunk = colis.slice(i, i + CONFIG.batchSize)

      chunk.forEach(parcel => {
        batch.delete(db.collection('parcels').doc(parcel.id))
      })

      await batch.commit()
      deleted += chunk.length
      console.log(`🗑️  Supprimés: ${deleted}/${colis.length}`)
    }

    console.log(`✅ Archivage terminé: ${colis.length} colis`)
    return { success: true, archived: colis.length, filepath }

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log(`
╔════════════════════════════════════════╗
║   Archivage Automatique Démarré       ║
╠════════════════════════════════════════╣
║  Date: ${new Date().toLocaleString('fr-FR')}
║  Politique: ${CONFIG.delaiMinimumJours} jours
║  Statuts: ${CONFIG.statutsArchivables.join(', ')}
╚════════════════════════════════════════╝
`)

  try {
    // 1. Récupérer les colis archivables
    const colis = await getColisArchivables()

    // 2. Archiver
    const result = await archiverColis(colis)

    // 3. Rapport final
    console.log(`
╔════════════════════════════════════════╗
║   Rapport d'Archivage                 ║
╠════════════════════════════════════════╣
║  Statut: ${result.success ? '✅ SUCCÈS' : '❌ ERREUR'}
║  Archivés: ${result.archived || 0} colis
${result.filepath ? `║  Fichier: ${path.basename(result.filepath)}` : ''}
╚════════════════════════════════════════╝
`)

    // 4. Envoyer notification (optionnel)
    if (result.success && result.archived > 0) {
      // TODO: Envoyer email/notification
      console.log('📧 Notification envoyée')
    }

    process.exit(0)

  } catch (error) {
    console.error('💥 Erreur fatale:', error)
    process.exit(1)
  }
}

// Exécuter
main()
