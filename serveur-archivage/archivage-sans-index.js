#!/usr/bin/env node

/**
 * Archivage automatique SANS index Firestore
 * Récupère tous les colis et filtre en mémoire
 */

const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

// Configuration
const CONFIG = {
  delaiMinimumJours: 90,
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,
  batchSize: 100,
  archivesDir: path.join(__dirname, 'archives')
}

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
})

const db = admin.firestore()

/**
 * Archivage complet
 */
async function archiver() {
  console.log(`
╔════════════════════════════════════════╗
║   Archivage Automatique               ║
╠════════════════════════════════════════╣
║  Date: ${new Date().toLocaleString('fr-FR')}
║  Politique: ${CONFIG.delaiMinimumJours} jours
╚════════════════════════════════════════╝
`)

  try {
    // 1. Récupérer tous les colis
    console.log('📦 Récupération des colis...')
    const snapshot = await db.collection('parcels').get()
    console.log(`✅ ${snapshot.size} colis chargés`)

    // 2. Date limite
    const dateLimite = new Date()
    dateLimite.setDate(dateLimite.getDate() - CONFIG.delaiMinimumJours)

    // 3. Filtrer les archivables
    const archivables = []

    snapshot.docs.forEach(doc => {
      const p = doc.data()

      if (!CONFIG.statutsArchivables.includes(p.status)) return

      const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      if (createdAt >= dateLimite) return

      if (CONFIG.seulementCodPaye && p.status === 'Livré' && p.codAmount > 0) {
        const codPaye = p.codStatus === 'settled' || p.codStatus === 'paid'
        if (!codPaye) return
      }

      archivables.push({ id: doc.id, ...p })
    })

    console.log(`📊 ${archivables.length} colis à archiver`)

    if (archivables.length === 0) {
      console.log('ℹ️  Aucun archivage nécessaire')
      return { success: true, archived: 0 }
    }

    // 4. Créer dossier archives
    if (!fs.existsSync(CONFIG.archivesDir)) {
      fs.mkdirSync(CONFIG.archivesDir, { recursive: true })
    }

    // 5. Sauvegarder JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `archive_${timestamp}_${archivables.length}_colis.json`
    const filepath = path.join(CONFIG.archivesDir, filename)

    fs.writeFileSync(filepath, JSON.stringify({
      date: new Date().toISOString(),
      policy: CONFIG,
      count: archivables.length,
      parcels: archivables.map(p => ({
        ...p,
        archivedAt: new Date().toISOString(),
        archivedBy: 'auto-script'
      }))
    }, null, 2))

    console.log(`💾 Sauvegardé: ${filename}`)

    // 6. Supprimer de Firestore
    let deleted = 0
    for (let i = 0; i < archivables.length; i += CONFIG.batchSize) {
      const batch = db.batch()
      const chunk = archivables.slice(i, i + CONFIG.batchSize)

      chunk.forEach(p => {
        batch.delete(db.collection('parcels').doc(p.id))
      })

      await batch.commit()
      deleted += chunk.length
      console.log(`🗑️  Supprimés: ${deleted}/${archivables.length}`)
    }

    console.log(`
╔════════════════════════════════════════╗
║   Archivage Terminé                   ║
╠════════════════════════════════════════╣
║  Archivés: ${archivables.length} colis
║  Fichier: ${filename}
╚════════════════════════════════════════╝
`)

    return { success: true, archived: archivables.length, filepath }

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    return { success: false, error: error.message }
  }
}

// Exécuter
archiver().then(() => process.exit(0))
