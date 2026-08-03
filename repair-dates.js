/**
 * Script de réparation pour les expéditions avec dates modifiées
 *
 * PROBLÈME: L'ancien code modifiait createdAt, ce qui faisait disparaître
 * les expéditions des vues filtrées des agences.
 *
 * SOLUTION: Ce script restaure createdAt depuis history[0].timestamp
 * et met expeditionDate à la date voulue par l'utilisateur.
 *
 * UTILISATION:
 * 1. Ouvrir la console du navigateur (F12)
 * 2. Coller ce code
 * 3. Exécuter: repairParcelDate('ID_EXPEDITION')
 */

import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from './src/firebase/config'

async function repairParcelDate(parcelId) {
  try {
    console.log(`🔧 Réparation de l'expédition ${parcelId}...`)

    // Récupérer l'expédition
    const parcelRef = doc(db, 'parcels', parcelId)
    const parcelSnap = await getDoc(parcelRef)

    if (!parcelSnap.exists()) {
      console.error('❌ Expédition non trouvée')
      return
    }

    const parcel = parcelSnap.data()

    // Vérifier si l'historique existe
    if (!parcel.history || parcel.history.length === 0) {
      console.error('❌ Pas d\'historique disponible pour cette expédition')
      return
    }

    // Récupérer la vraie date de création depuis le premier événement de l'historique
    const originalTimestamp = parcel.history[0].timestamp
    if (!originalTimestamp) {
      console.error('❌ Pas de timestamp dans le premier événement de l\'historique')
      return
    }

    const originalDate = new Date(originalTimestamp)
    console.log(`📅 Date originale trouvée: ${originalDate.toLocaleDateString('fr-FR')}`)

    // Date actuelle (modifiée par erreur)
    const currentDate = parcel.createdAt ? new Date(parcel.createdAt.seconds * 1000) : null
    console.log(`📅 Date actuelle (cassée): ${currentDate?.toLocaleDateString('fr-FR')}`)

    // Restaurer createdAt à la date originale
    const restoredCreatedAt = Timestamp.fromDate(originalDate)

    // Si l'utilisateur voulait changer la date affichée, on la met dans expeditionDate
    let expeditionDate = null
    if (currentDate && currentDate.getTime() !== originalDate.getTime()) {
      const yyyy = currentDate.getFullYear()
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0')
      const dd = String(currentDate.getDate()).padStart(2, '0')
      expeditionDate = `${yyyy}-${mm}-${dd}`
      console.log(`📅 Date d'expédition (voulue par l'utilisateur): ${expeditionDate}`)
    }

    // Mettre à jour l'expédition
    const updates = {
      createdAt: restoredCreatedAt
    }

    if (expeditionDate) {
      updates.expeditionDate = expeditionDate
    }

    await updateDoc(parcelRef, updates)

    console.log('✅ Expédition réparée avec succès!')
    console.log('📋 Modifications:')
    console.log(`   - createdAt restauré à: ${originalDate.toLocaleDateString('fr-FR')}`)
    if (expeditionDate) {
      console.log(`   - expeditionDate défini à: ${expeditionDate}`)
    }
    console.log('🔄 L\'expédition devrait maintenant être visible dans les agences')

    return {
      success: true,
      originalDate: originalDate.toLocaleDateString('fr-FR'),
      expeditionDate
    }

  } catch (error) {
    console.error('❌ Erreur lors de la réparation:', error)
    return { success: false, error: error.message }
  }
}

// Exporter la fonction pour utilisation
window.repairParcelDate = repairParcelDate

console.log('✅ Script de réparation chargé!')
console.log('📝 Pour réparer une expédition, utilisez: repairParcelDate("ID_EXPEDITION")')
