#!/usr/bin/env node

/**
 * Test SANS index - Récupère tous les colis et filtre en mémoire
 */

const admin = require('firebase-admin')

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
})

const db = admin.firestore()

async function testSimple() {
  console.log(`
╔════════════════════════════════════════╗
║   TEST ARCHIVAGE - Version Simple     ║
╠════════════════════════════════════════╣
║  Délai: 90 jours
║  Statuts: Livré, Retourné, Annulé
╚════════════════════════════════════════╝
`)

  try {
    // Récupérer TOUS les colis (pas besoin d'index)
    console.log('📦 Récupération des colis...')
    const snapshot = await db.collection('parcels').get()

    console.log(`✅ ${snapshot.size} colis chargés\n`)

    // Date limite (90 jours)
    const dateLimite = new Date()
    dateLimite.setDate(dateLimite.getDate() - 90)

    // Filtrer en mémoire
    const archivables = []
    const parStatut = {}

    snapshot.docs.forEach(doc => {
      const p = doc.data()

      // Vérifier statut
      if (!['Livré', 'Retourné', 'Annulé'].includes(p.status)) return

      // Vérifier âge
      const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      if (createdAt >= dateLimite) return

      // Vérifier COD pour "Livré"
      if (p.status === 'Livré' && p.codAmount > 0) {
        const codPaye = p.codStatus === 'settled' || p.codStatus === 'paid'
        if (!codPaye) return
      }

      // Colis archivable
      archivables.push({ id: doc.id, ...p })
      parStatut[p.status] = (parStatut[p.status] || 0) + 1
    })

    console.log('📊 Résultat:\n')
    console.log(`   Total colis: ${snapshot.size}`)
    console.log(`   Plus de 90 jours: ${archivables.length}`)
    console.log(``)

    if (archivables.length > 0) {
      console.log('   Répartition:')
      Object.entries(parStatut).forEach(([s, c]) => {
        console.log(`     - ${s}: ${c} colis`)
      })
      console.log(``)
      console.log(`   Espace estimé: ~${Math.round(archivables.length * 2.5)} KB`)
      console.log(``)
      console.log('✅ Prêt à archiver ces colis')
    } else {
      console.log('ℹ️  Aucun colis à archiver pour le moment')
      console.log('')
      console.log('   Raisons possibles:')
      console.log('   - Tous les colis ont moins de 90 jours')
      console.log('   - Les colis livrés ont du COD non payé')
      console.log('   - Pas de colis avec statut Livré/Retourné/Annulé')
    }

    console.log(`
╔════════════════════════════════════════╗
║   Test Terminé                        ║
╚════════════════════════════════════════╝

⚠️  CECI EST UN TEST - Aucun colis n'a été supprimé

Pour archiver vraiment: node archivage-auto.js
(Après avoir créé les index Firestore)
`)

  } catch (error) {
    console.error('❌ Erreur:', error.message)
  }

  process.exit(0)
}

testSimple()
