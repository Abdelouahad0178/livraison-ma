import { doc, updateDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db } from './db'

/**
 * Actions CRUD pour le portail client
 */

// ────────────────────────────────────────────────────────────────
// COLIS (Parcels)
// ────────────────────────────────────────────────────────────────

/**
 * Modifier un colis créé par le portail (avant validation chef)
 */
export async function updatePortalParcel(parcelId: string, data: {
  receiverName?: string
  receiverTel?: string
  receiverAddress?: string
  receiverCity?: string
  weight?: number
  nbColis?: number
  natureOfGoods?: string
  codAmount?: number
}) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = parcelSnap.data()

  // Vérifier que c'est un colis créé par le portail
  if (parcel.agentRole !== 'client_portal') {
    throw new Error('Seuls les colis créés via le portail peuvent être modifiés')
  }

  // Vérifier qu'il n'est pas validé
  if (parcel.validatedByChef === true) {
    throw new Error('Ce colis a déjà été validé et ne peut plus être modifié directement')
  }

  // Vérifier que le statut permet la modification
  if (['Livré', 'Retourné', 'Annulé'].includes(parcel.status)) {
    throw new Error('Ce colis ne peut plus être modifié')
  }

  // Préparer les données de mise à jour
  const updateData: any = {
    updatedAt: serverTimestamp()
  }

  if (data.receiverName) {
    updateData['receiver.name'] = data.receiverName
    updateData.receiverName = data.receiverName
  }

  if (data.receiverTel) {
    updateData['receiver.tel'] = data.receiverTel
    updateData.receiverTel = data.receiverTel
  }

  if (data.receiverAddress) {
    updateData['receiver.address'] = data.receiverAddress
    updateData.receiverAddress = data.receiverAddress
  }

  if (data.receiverCity) {
    updateData['receiver.city'] = data.receiverCity
    updateData.receiverCity = data.receiverCity
    updateData.destinationCity = data.receiverCity
  }

  if (data.weight !== undefined) {
    updateData.weight = data.weight
  }

  if (data.nbColis !== undefined) {
    updateData.nbColis = data.nbColis
  }

  if (data.natureOfGoods !== undefined) {
    updateData.natureOfGoods = data.natureOfGoods
  }

  if (data.codAmount !== undefined) {
    updateData.codAmount = data.codAmount
  }

  await updateDoc(parcelRef, updateData)

  return { success: true }
}

/**
 * Annuler un colis créé par le portail (avant validation)
 */
export async function cancelPortalParcel(parcelId: string, reason?: string) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = parcelSnap.data()

  // Vérifier que c'est un colis créé par le portail
  if (parcel.agentRole !== 'client_portal') {
    throw new Error('Seuls les colis créés via le portail peuvent être annulés directement')
  }

  // Vérifier qu'il n'est pas validé OU qu'il est en attente
  if (parcel.validatedByChef === true && parcel.status !== 'Initialisé') {
    throw new Error('Ce colis a été validé. Utilisez une demande d\'annulation.')
  }

  // Si validatedByChef est false (refusé), on peut supprimer
  if (parcel.validatedByChef === false) {
    await deleteDoc(parcelRef)
    return { success: true, deleted: true }
  }

  // Sinon, marquer comme annulé
  await updateDoc(parcelRef, {
    status: 'Annulé',
    cancelledAt: serverTimestamp(),
    cancelReason: reason || 'Annulé par le client',
    updatedAt: serverTimestamp()
  })

  return { success: true, deleted: false }
}

/**
 * Charger un colis retourné sur camion vers l'agence source
 */
export async function loadReturnedParcelOnTruck(parcelId: string) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = parcelSnap.data()

  // Vérifier que le colis est retourné
  if (parcel.status !== 'Retourné') {
    throw new Error('Seuls les colis retournés peuvent être chargés sur camion')
  }

  // Charger sur camion
  await updateDoc(parcelRef, {
    status: 'Retour en transit',
    returnShippedAt: serverTimestamp(),
    history: parcel.history || []
  })

  return { success: true }
}

// ────────────────────────────────────────────────────────────────
// DEMANDES DE MODIFICATION
// ────────────────────────────────────────────────────────────────

/**
 * Modifier une demande de modification (avant traitement)
 */
export async function updateModificationRequest(requestId: string, data: {
  modificationType?: string
  newValue?: string
  note?: string
}) {
  const requestRef = doc(db, 'modificationRequests', requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Demande introuvable')
  }

  const request = requestSnap.data()

  // Vérifier que la demande est en attente
  if (request.status !== 'pending') {
    throw new Error('Seules les demandes en attente peuvent être modifiées')
  }

  const updateData: any = {
    updatedAt: serverTimestamp()
  }

  if (data.modificationType) {
    updateData.modificationType = data.modificationType
  }

  if (data.newValue !== undefined) {
    updateData.newValue = data.newValue
  }

  if (data.note !== undefined) {
    updateData.note = data.note
  }

  await updateDoc(requestRef, updateData)

  return { success: true }
}

/**
 * Répondre à une question de l'agent (conversation sur une demande)
 */
export async function replyToModificationRequest(requestId: string, clientReply: string) {
  const requestRef = doc(db, 'modificationRequests', requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Demande introuvable')
  }

  const request = requestSnap.data()

  // Ajouter la réponse aux conversations
  const conversations = request.conversations || []
  conversations.push({
    from: 'client',
    message: clientReply,
    timestamp: serverTimestamp()
  })

  await updateDoc(requestRef, {
    conversations,
    clientRepliedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })

  return { success: true }
}

// ────────────────────────────────────────────────────────────────
// ACTIONS DESTINATAIRES
// ────────────────────────────────────────────────────────────────

/**
 * Confirmer la réception d'un colis (pour destinataire)
 */
export async function confirmDeliveryReceipt(parcelId: string, feedback?: {
  rating?: number  // 1-5
  comment?: string
  hasIssue?: boolean
  issueType?: string
}) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const updateData: any = {
    receiverConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }

  if (feedback) {
    updateData.receiverFeedback = {
      rating: feedback.rating || null,
      comment: feedback.comment || '',
      hasIssue: feedback.hasIssue || false,
      issueType: feedback.issueType || null,
      submittedAt: serverTimestamp()
    }
  }

  await updateDoc(parcelRef, updateData)

  return { success: true }
}

/**
 * Signaler un problème sur une livraison (pour destinataire)
 */
export async function reportDeliveryIssue(parcelId: string, issue: {
  type: 'not_received' | 'damaged' | 'wrong_item' | 'partial' | 'other'
  description: string
  requestAction?: 'return' | 'replacement' | 'refund'
}) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  await updateDoc(parcelRef, {
    deliveryIssue: {
      type: issue.type,
      description: issue.description,
      requestAction: issue.requestAction || null,
      reportedAt: serverTimestamp(),
      reportedBy: 'receiver'
    },
    hasDeliveryIssue: true,
    updatedAt: serverTimestamp()
  })

  return { success: true }
}

/**
 * Demander une modification avant livraison (pour destinataire)
 */
export async function requestPreDeliveryChange(parcelId: string, change: {
  type: 'address' | 'phone' | 'schedule'
  newValue: string
  reason: string
}) {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = parcelSnap.data()

  // Vérifier que le colis n'est pas encore livré
  if (parcel.status === 'Livré') {
    throw new Error('Ce colis a déjà été livré')
  }

  // Créer la demande de modification dans la collection modificationRequests
  // Pour l'instant, on ajoute juste une note sur le colis
  await updateDoc(parcelRef, {
    preDeliveryChangeRequest: {
      type: change.type,
      newValue: change.newValue,
      reason: change.reason,
      requestedAt: serverTimestamp(),
      requestedBy: 'receiver',
      status: 'pending'
    },
    updatedAt: serverTimestamp()
  })

  return { success: true }
}
