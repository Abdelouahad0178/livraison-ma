#!/usr/bin/env node

/**
 * Test - Vérifie combien de colis seront archivés (SANS les supprimer)
 */

const admin = require('firebase-admin')

// Configuration
const CONFIG = {
  delaiMinimumJours: 90,
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true
}

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
})

const db = admin.firestore()

async function testerArchivage() {
  console.log(`
╔════════════════════════════════════════╗
║   TEST ARCHIVAGE - Simulation         ║
╠════════════════════════════════════════╣
║  Politique: ${CONFIG.delaiMinimumJours} jours
║  Statuts: ${CONFIG.statutsArchivables.join(', ')}
║  COD payé requis: ${CONFIG.seulementCodPaye ? 'Oui' : 'Non'}
╚════════════════════════════════════════╝
`)

  try {
    const dateLimite = new Date()
    dateLimite.setDate(dateLimite.getDate() - CONFIG.delaiMinimumJours)

    let totalEligibles = 0
    const parStatut = {}

    // Pour chaque statut
    for (const status of CONFIG.statutsArchivables) {
      const snapshot = await db.collection('parcels')
        .where('status', '==', status)
        .where('createdAt', '<', admin.firestore.Timestamp.fromDate(dateLimite))
        .get()

      const count = snapshot.size
      totalEligibles += count
      parStatut[status] = count

      console.log(`📦 ${status}: ${count} colis`)
    }

    console.log(`
╔════════════════════════════════════════╗
║   Résultat du Test                    ║
╠════════════════════════════════════════╣
║  Total à archiver: ${totalEligibles} colis
║
║  Répartition:
${Object.entries(parStatut).map(([s, c]) => `║    - ${s}: ${c}`).join('\n')}
║
║  Espace estimé: ~${Math.round(totalEligibles * 2.5 / 1024)} MB
╚════════════════════════════════════════╝

⚠️  CECI EST UN TEST - Aucun colis n'a été supprimé

✅ Pour lancer l'archivage réel: node archivage-auto.js
`)

    process.exit(0)

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    process.exit(1)
  }
}

testerArchivage()
