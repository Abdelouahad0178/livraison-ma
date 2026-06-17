import { arrayUnion, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './db'

/**
 * Génère un token de signature pour un colis
 * @param parcelId ID du colis
 * @param isReturn true si c'est pour une signature de retour (expéditeur), false pour livraison normale (destinataire)
 */
export async function generateSignatureToken(parcelId: any, isReturn = false) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)

  if (isReturn) {
    // Signature de retour (expéditeur récupère son colis)
    await updateDoc(doc(db, 'parcels', parcelId), {
      returnSignatureToken: token,
      returnSignatureTokenCreatedAt: new Date().toISOString(),
    })
  } else {
    // Signature normale (destinataire reçoit le colis)
    await updateDoc(doc(db, 'parcels', parcelId), {
      signatureToken: token,
      signatureTokenCreatedAt: new Date().toISOString(),
    })
  }

  return token
}

/**
 * S'abonne aux mises à jour d'une signature de livraison
 * @param parcelId ID du colis
 * @param callback Fonction appelée avec la signature
 * @param isReturn true pour signature de retour, false pour signature normale
 */
export function subscribeDeliverySignature(parcelId: any, callback: any, isReturn = false) {
  const docId = isReturn ? `${parcelId}_return` : parcelId
  return onSnapshot(
    doc(db, 'deliverySignatures', docId),
    snap => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    err => {
      console.warn('subscribeDeliverySignature permission error:', err.code)
      callback(null)
    }
  )
}

/**
 * Soumet une signature électronique
 * Détecte automatiquement si c'est une signature de retour ou normale
 */
export async function submitDeliverySignature(parcelId: any, token: any, signatureDataUrl: any, { signatureType = 'personal', companyName = '' } = {}) {
  const parcelSnap = await getDoc(doc(db, 'parcels', parcelId))
  if (!parcelSnap.exists()) throw new Error('Colis introuvable.')

  const parcelData = parcelSnap.data()

  // Détecter si c'est une signature de retour ou normale
  const isReturn = parcelData.returnSignatureToken === token
  const isNormal = parcelData.signatureToken === token

  if (!isReturn && !isNormal) {
    throw new Error('Lien de signature invalide ou expiré.')
  }

  if (parcelData.status === 'Livré' || parcelData.status === 'LivrÃ©') {
    throw new Error('Ce colis a déjà été livré.')
  }

  // ID du document de signature
  const signatureDocId = isReturn ? `${parcelId}_return` : parcelId

  await setDoc(doc(db, 'deliverySignatures', signatureDocId), {
    token,
    signatureDataUrl,
    signatureType,
    companyName: companyName || '',
    signedAt: new Date().toISOString(),
    parcelId,
    isReturn, // Marquer si c'est une signature de retour
    trackingId: parcelData.trackingId || '',
    recipientName: isReturn ? parcelData.sender?.name || '' : parcelData.receiver?.name || '',
    originCity: parcelData.originCity || '',
    destinationCity: parcelData.destinationCity || '',
  })
}

/**
 * Confirme la livraison après signature
 * @param parcelId ID du colis
 * @param driverName Nom du livreur
 * @param isReturn true si c'est une signature de retour
 */
export async function confirmDeliveryAfterSignature(parcelId: any, driverName: any, isReturn = false) {
  const now = new Date().toISOString()

  if (isReturn) {
    // Signature de retour : le colis retourne à l'expéditeur
    await updateDoc(doc(db, 'parcels', parcelId), {
      status: 'Retour finalisé',
      returnSignatureToken: null,
      returnSignatureConfirmedAt: now,
      history: arrayUnion({
        status: 'Retour finalisé',
        timestamp: now,
        note: `Colis retourné et remis à l'expéditeur (signature électronique) - livreur : ${driverName}`,
      }),
    })
  } else {
    // Signature normale : livraison au destinataire
    await updateDoc(doc(db, 'parcels', parcelId), {
      status: 'Livré',
      signatureToken: null,
      signatureConfirmedAt: now,
      history: arrayUnion({
        status: 'Livré',
        timestamp: now,
        note: `Livraison confirmée par signature électronique du destinataire - chauffeur : ${driverName}`,
      }),
    })
  }
}

export async function deleteDeliverySignature(parcelId: any, isReturn = false) {
  const signatureDocId = isReturn ? `${parcelId}_return` : parcelId
  await deleteDoc(doc(db, 'deliverySignatures', signatureDocId))

  if (isReturn) {
    await updateDoc(doc(db, 'parcels', parcelId), { returnSignatureConfirmedAt: null })
  } else {
    await updateDoc(doc(db, 'parcels', parcelId), { signatureConfirmedAt: null })
  }
}

export async function updateDeliverySignature(parcelId: any, signatureDataUrl: any, updatedBy: any, isReturn = false) {
  const signatureDocId = isReturn ? `${parcelId}_return` : parcelId
  await updateDoc(doc(db, 'deliverySignatures', signatureDocId), {
    signatureDataUrl,
    signedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'Administrateur',
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Confirme la livraison avec bon papier (signature manuelle classique)
 * @param parcelId ID du colis
 * @param driverName Nom du livreur
 * @param isReturn true si c'est un retour
 * @param note Note optionnelle
 */
export async function confirmDeliveryWithPaperReceipt(
  parcelId: string,
  driverName: string,
  isReturn = false,
  note = ''
) {
  const now = new Date().toISOString()

  if (isReturn) {
    // Retour avec bon papier
    await updateDoc(doc(db, 'parcels', parcelId), {
      status: 'Retour finalisé',
      returnSignatureToken: null,
      returnSignatureConfirmedAt: now,
      signatureMethod: 'paper_receipt', // Nouveau champ pour identifier le type de signature
      history: arrayUnion({
        status: 'Retour finalisé',
        timestamp: now,
        note: `Colis retourné avec bon papier signé manuellement - livreur : ${driverName}${note ? ` - ${note}` : ''}`,
      }),
    })
  } else {
    // Livraison normale avec bon papier
    await updateDoc(doc(db, 'parcels', parcelId), {
      status: 'Livré',
      signatureToken: null,
      signatureConfirmedAt: now,
      signatureMethod: 'paper_receipt', // Nouveau champ pour identifier le type de signature
      history: arrayUnion({
        status: 'Livré',
        timestamp: now,
        note: `Livré avec bon papier signé manuellement par le destinataire - chauffeur : ${driverName}${note ? ` - ${note}` : ''}`,
      }),
    })
  }
}
