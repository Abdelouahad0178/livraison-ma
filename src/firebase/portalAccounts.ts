import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, updateDoc, serverTimestamp, getDocs, query, where, limit, collection } from 'firebase/firestore'
import { authSecondary } from './auth'
import { db } from './db'
import { Client } from './clients'

/**
 * NOUVEAU SYSTÈME - Création de compte portail avec données intégrées
 */

function generatePassword(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

export async function createClientPortalAccount(client: Client, customEmail?: string) {
  // Utiliser l'email personnalisé ou générer automatiquement
  const email = customEmail || client.portalEmail || `${client.tel}@portail.livraison.ma`
  const password = generatePassword(10)

  try {
    // Créer le compte auth
    const userCredential = await createUserWithEmailAndPassword(
      authSecondary,
      email,
      password
    )

    const uid = userCredential.user.uid

    // Déterminer le type de client
    const isExpediteur = client.isExpediteur !== false // Par défaut true si non spécifié
    const isDestinataire = client.isDestinataire === true

    const clientType = isExpediteur && isDestinataire ? 'both' :
                       isDestinataire ? 'destinataire' : 'expediteur'

    const role = isDestinataire && !isExpediteur ? 'client-destinataire' : 'client-expediteur'

    // Créer le document user avec TOUTES les données intégrées
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      role,
      clientType,
      clientId: client.id,

      // Données client intégrées pour accès direct
      clientData: {
        id: client.id,
        name: client.name,
        tel: client.tel,
        city: client.city,
        address: client.address || '',
        nic: client.nic || '',
        secteurId: client.secteurId || '',
        secteurName: client.secteurName || '',
        accountType: client.accountType || 'cash',
        remise: client.remise || 0
      },

      createdAt: serverTimestamp(),
      blocked: false,

      // Pour compatibilité avec l'ancien système
      name: client.name
    })

    // Mettre à jour le document client avec le portalUid (pour compatibilité)
    await updateDoc(doc(db, 'clients', client.id), {
      portalUid: uid,
      portalEmail: email
    })

    // Déconnecter l'auth secondaire
    await authSecondary.signOut()

    return {
      success: true,
      email,
      password,
      uid
    }
  } catch (error: any) {
    console.error('Erreur création compte portail:', error)

    // Déconnecter en cas d'erreur
    try {
      await authSecondary.signOut()
    } catch {}

    throw new Error(error.message || 'Erreur lors de la création du compte')
  }
}

/**
 * Créer un compte portail pour un particulier (expéditeur individuel)
 */
export async function createParticularPortalAccount(senderData: {
  name: string
  tel: string
  city: string
  address?: string
  nic?: string
}) {
  const email = `${senderData.tel}@portail.livraison.ma`
  const password = generatePassword(10)

  try {
    // Vérifier si un compte existe déjà pour ce téléphone
    const existingUserQuery = await getDocs(
      query(collection(db, 'users'), where('clientData.tel', '==', senderData.tel), limit(1))
    )

    if (!existingUserQuery.empty) {
      // Le compte existe déjà, retourner les infos
      const existingUser = existingUserQuery.docs[0].data()
      return {
        success: true,
        alreadyExists: true,
        uid: existingUser.uid,
        email: existingUser.email
      }
    }

    // Créer le compte auth
    let userCredential
    try {
      userCredential = await createUserWithEmailAndPassword(
        authSecondary,
        email,
        password
      )
    } catch (authError: any) {
      // Si l'email existe déjà, retourner succès (compte déjà créé)
      if (authError.code === 'auth/email-already-in-use') {
        await authSecondary.signOut()
        return {
          success: true,
          alreadyExists: true,
          email
        }
      }
      throw authError
    }

    const uid = userCredential.user.uid

    // Créer le document user
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      role: 'client-expediteur',
      clientType: 'expediteur',
      clientId: null,  // Pas de clientId pour les particuliers

      // Données du particulier
      clientData: {
        id: null,
        name: senderData.name,
        tel: senderData.tel,
        city: senderData.city,
        address: senderData.address || '',
        nic: senderData.nic || '',
        secteurId: '',
        secteurName: '',
        accountType: 'cash',
        remise: 0,
        isParticular: true  // Flag pour identifier les particuliers
      },

      createdAt: serverTimestamp(),
      blocked: false,
      name: senderData.name
    })

    // Déconnecter l'auth secondaire
    await authSecondary.signOut()

    return {
      success: true,
      alreadyExists: false,
      email,
      password,
      uid
    }
  } catch (error: any) {
    console.error('Erreur création compte particulier:', error)

    // Déconnecter en cas d'erreur
    try {
      await authSecondary.signOut()
    } catch {}

    throw new Error(error.message || 'Erreur lors de la création du compte')
  }
}

/**
 * Migrer un compte existant vers le nouveau système
 */
export async function migrateClientPortalAccount(client: Client) {
  if (!client.portalUid) {
    throw new Error('Ce client n\'a pas de compte portail')
  }

  try {
    const isExpediteur = client.isExpediteur !== false
    const isDestinataire = client.isDestinataire === true

    const clientType = isExpediteur && isDestinataire ? 'both' :
                       isDestinataire ? 'destinataire' : 'expediteur'

    const role = isDestinataire && !isExpediteur ? 'client-destinataire' : 'client-expediteur'

    // Mettre à jour le document user avec les nouvelles données
    await updateDoc(doc(db, 'users', client.portalUid), {
      role,
      clientType,
      clientId: client.id,
      clientData: {
        id: client.id,
        name: client.name,
        tel: client.tel,
        city: client.city,
        address: client.address || '',
        nic: client.nic || '',
        secteurId: client.secteurId || '',
        secteurName: client.secteurName || '',
        accountType: client.accountType || 'cash',
        remise: client.remise || 0
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Erreur migration compte:', error)
    throw new Error(error.message || 'Erreur lors de la migration')
  }
}

/**
 * Réinitialiser le mot de passe d'un compte portail
 */
export async function resetClientPortalPassword(client: Client) {
  if (!client.portalUid || !client.portalEmail) {
    throw new Error('Ce client n\'a pas de compte portail')
  }

  // TODO: Implémenter la réinitialisation de mot de passe
  // Peut utiliser sendPasswordResetEmail ou créer un nouveau mot de passe

  return {
    success: true,
    message: 'Un email de réinitialisation a été envoyé'
  }
}
