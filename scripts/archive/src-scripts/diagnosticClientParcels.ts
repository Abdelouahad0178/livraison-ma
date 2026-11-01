/**
 * Script de diagnostic pour vérifier pourquoi les colis n'apparaissent pas dans le portail client
 *
 * UTILISATION :
 * 1. Ouvrir la console du navigateur (F12) dans le portail client
 * 2. Copier-coller ce code
 * 3. Lire les résultats pour identifier le problème
 */

import { auth, db } from '../firebase/config'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'

export async function diagnosticClientParcels(clientId: string) {
  console.log('🔍 === DIAGNOSTIC CLIENT PARCELS ===')
  console.log('')

  // 1. Vérifier l'utilisateur authentifié
  const user = auth.currentUser
  if (!user) {
    console.error('❌ Aucun utilisateur authentifié')
    return
  }
  console.log('✅ Utilisateur authentifié:', user.uid)
  console.log('   Email:', user.email)
  console.log('')

  // 2. Vérifier le document client
  const clientDoc = await getDoc(doc(db, 'clients', clientId))
  if (!clientDoc.exists()) {
    console.error('❌ Le document client n\'existe pas:', clientId)
    return
  }
  const clientData = clientDoc.data()
  console.log('✅ Document client trouvé:', clientId)
  console.log('   Nom:', clientData.name)
  console.log('   portalUid:', clientData.portalUid || '(non défini)')
  console.log('   isExpediteur:', clientData.isExpediteur)
  console.log('   isDestinataire:', clientData.isDestinataire)
  console.log('')

  // 3. Vérifier si portalUid correspond
  if (clientData.portalUid !== user.uid) {
    console.warn('⚠️  PROBLÈME : portalUid ne correspond pas à l\'UID utilisateur')
    console.warn('   portalUid dans client:', clientData.portalUid)
    console.warn('   UID utilisateur:', user.uid)
    console.warn('   → Le client ne peut pas lire ses colis à cause de la règle Firestore')
    console.log('')
  } else {
    console.log('✅ portalUid correspond à l\'UID utilisateur')
    console.log('')
  }

  // 4. Chercher les colis avec ce clientId
  console.log('🔍 Recherche des colis avec clientId:', clientId)
  const parcelsQuery = query(
    collection(db, 'parcels'),
    where('clientId', '==', clientId)
  )

  try {
    const parcelsSnap = await getDocs(parcelsQuery)
    console.log(`✅ ${parcelsSnap.size} colis trouvé(s) avec clientId = ${clientId}`)
    console.log('')

    if (parcelsSnap.size > 0) {
      console.log('📦 Liste des colis :')
      parcelsSnap.forEach(doc => {
        const parcel = doc.data()
        console.log(`   - ${parcel.trackingId}`)
        console.log(`     Status: ${parcel.status}`)
        console.log(`     Date: ${parcel.createdAt?.toDate?.()?.toLocaleDateString?.() || 'N/A'}`)
        console.log(`     Client: ${parcel.clientName || '(non défini)'}`)
        console.log(`     clientId: ${parcel.clientId}`)
      })
      console.log('')
    }
  } catch (error: any) {
    console.error('❌ Erreur lors de la lecture des colis:', error.message)
    console.error('   Code:', error.code)
    console.log('')
  }

  // 5. Vérifier le compte portail
  const portalQuery = query(
    collection(db, 'portalAccounts'),
    where('__name__', '==', user.uid)
  )
  const portalSnap = await getDocs(portalQuery)

  if (portalSnap.empty) {
    console.warn('⚠️  Aucun compte portalAccounts trouvé pour cet utilisateur')
  } else {
    const portalData = portalSnap.docs[0].data()
    console.log('✅ Compte portalAccounts trouvé')
    console.log('   clientId:', portalData.clientId)
    console.log('   email:', portalData.email)
    console.log('   name:', portalData.name)
    console.log('')

    if (portalData.clientId !== clientId) {
      console.warn('⚠️  PROBLÈME : clientId dans portalAccounts différent de l\'URL')
      console.warn('   clientId dans portalAccounts:', portalData.clientId)
      console.warn('   clientId dans URL:', clientId)
    }
  }

  console.log('')
  console.log('=== FIN DU DIAGNOSTIC ===')
  console.log('')
  console.log('💡 SOLUTIONS POSSIBLES :')
  console.log('   1. Si portalUid ne correspond pas : mettre à jour le document client')
  console.log('   2. Si aucun colis trouvé : vérifier que le chef d\'agence sélectionne bien le client')
  console.log('   3. Si clientId différent : vérifier l\'URL du portail client')
}

// Utilisation depuis la console :
// import { diagnosticClientParcels } from './src/scripts/diagnosticClientParcels'
// diagnosticClientParcels('ID_DU_CLIENT')
