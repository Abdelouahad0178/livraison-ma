/**
 * SCRIPT DE TEST - Créer un compte portail client
 *
 * Usage:
 * 1. Ouvrir la console navigateur (F12)
 * 2. Aller sur la page Admin
 * 3. Coller ce code et modifier les données
 * 4. Exécuter
 */

import { createClientPortalAccount } from '../firebase/portalAccounts'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/db'

export async function createTestPortalAccount() {
  // MODIFIEZ CES DONNÉES
  const clientId = "REMPLACER_PAR_CLIENT_ID"  // ID du client depuis Firestore

  try {
    // Charger le client depuis Firestore
    const clientSnap = await getDoc(doc(db, 'clients', clientId))

    if (!clientSnap.exists()) {
      console.error('❌ Client non trouvé:', clientId)
      return
    }

    const client = { id: clientSnap.id, ...clientSnap.data() }

    console.log('📦 Création compte portail pour:', client.name)

    // Créer le compte
    const result = await createClientPortalAccount(client as any)

    console.log('✅ COMPTE CRÉÉ AVEC SUCCÈS !')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📧 Email:', result.email)
    console.log('🔑 Mot de passe:', result.password)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🌐 URL connexion: https://votre-site.web.app/clients/' + client.id)

    return result
  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
  }
}

// Pour exécuter dans la console :
// createTestPortalAccount()
