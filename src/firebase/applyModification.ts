import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './db'

/**
 * Applique automatiquement une modification approuvée à un colis
 */
export async function applyModificationToParcel(requestId: string) {
  // Charger la demande
  const requestRef = doc(db, 'modificationRequests', requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Demande introuvable')
  }

  const request = requestSnap.data()

  // Vérifier que la demande est approuvée
  if (request.status !== 'approved') {
    throw new Error('Demande non approuvée')
  }

  // Charger le colis
  const parcelRef = doc(db, 'parcels', request.parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  // Préparer les mises à jour selon le type de modification
  const updates: any = {}

  switch (request.modificationType) {
    case 'adresse':
      updates['receiver.address'] = request.newValue
      updates.receiverAddress = request.newValue
      break

    case 'telephone':
      updates['receiver.tel'] = request.newValue
      updates.receiverTel = request.newValue
      break

    case 'nom':
      updates['receiver.name'] = request.newValue
      updates.receiverName = request.newValue
      break

    case 'montant_cod':
      updates.codAmount = parseFloat(request.newValue) || 0
      break

    case 'type_paiement':
      updates.serviceType = request.newValue
      break

    case 'annulation':
      updates.status = 'Annulé'
      updates.cancelledAt = serverTimestamp()
      updates.cancelReason = request.note || 'Annulé sur demande'
      break

    default:
      throw new Error(`Type de modification non supporté: ${request.modificationType}`)
  }

  updates.updatedAt = serverTimestamp()
  updates.lastModificationRequestId = requestId

  // Mettre à jour le colis
  await updateDoc(parcelRef, updates)

  // Marquer la demande comme appliquée
  await updateDoc(requestRef, {
    autoApplied: true,
    appliedAt: serverTimestamp(),
    status: 'completed',
    updatedAt: serverTimestamp()
  })

  return {
    success: true,
    parcelId: request.parcelId,
    trackingId: request.trackingId,
    modificationType: request.modificationType
  }
}

/**
 * Approuver une demande (expéditeur ou transporteur)
 */
export async function approveModificationRequest(
  requestId: string,
  approverInfo: {
    role: 'expediteur' | 'transporteur'
    name: string
    note?: string
  }
) {
  const requestRef = doc(db, 'modificationRequests', requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Demande introuvable')
  }

  const request = requestSnap.data()

  // Vérifier que la demande est en attente
  if (request.status !== 'pending') {
    throw new Error('Cette demande n\'est plus en attente')
  }

  const updates: any = {
    status: 'approved',
    updatedAt: serverTimestamp()
  }

  if (approverInfo.role === 'expediteur') {
    updates.reviewedByExpAt = serverTimestamp()
    updates.reviewedByExpName = approverInfo.name
    updates.expediteurResponse = 'approved'
    if (approverInfo.note) {
      updates.expediteurNote = approverInfo.note
    }
  } else {
    updates.reviewedByAgentAt = serverTimestamp()
    updates.reviewedByAgentName = approverInfo.name
    if (approverInfo.note) {
      updates.agentNote = approverInfo.note
    }
  }

  // Mettre à jour la demande
  await updateDoc(requestRef, updates)

  // Appliquer automatiquement la modification
  try {
    await applyModificationToParcel(requestId)
  } catch (error: any) {
    // Si l'application échoue, marquer la demande comme approuvée mais non appliquée
    await updateDoc(requestRef, {
      status: 'approved',
      autoApplied: false,
      applicationError: error.message || 'Erreur lors de l\'application'
    })
    throw error
  }

  return { success: true }
}

/**
 * Refuser une demande (expéditeur ou transporteur)
 */
export async function rejectModificationRequest(
  requestId: string,
  rejecterInfo: {
    role: 'expediteur' | 'transporteur'
    name: string
    reason: string
  }
) {
  const requestRef = doc(db, 'modificationRequests', requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Demande introuvable')
  }

  const request = requestSnap.data()

  // Vérifier que la demande est en attente
  if (request.status !== 'pending') {
    throw new Error('Cette demande n\'est plus en attente')
  }

  const updates: any = {
    status: 'rejected',
    updatedAt: serverTimestamp()
  }

  if (rejecterInfo.role === 'expediteur') {
    updates.reviewedByExpAt = serverTimestamp()
    updates.reviewedByExpName = rejecterInfo.name
    updates.expediteurResponse = 'rejected'
    updates.expediteurNote = rejecterInfo.reason
  } else {
    updates.reviewedByAgentAt = serverTimestamp()
    updates.reviewedByAgentName = rejecterInfo.name
    updates.agentNote = rejecterInfo.reason
  }

  // Mettre à jour la demande
  await updateDoc(requestRef, updates)

  return { success: true }
}
