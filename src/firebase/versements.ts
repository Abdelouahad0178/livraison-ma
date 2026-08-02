import { db } from './db'
import { auth } from './config'
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore'

export type VersementType =
  | 'ports_payes'          // Ports payés collectés en gare
  | 'ports_dus'            // Ports dûs collectés par livreur
  | 'compte_expediteur'    // Ports en compte expéditeur (💼)
  | 'compte_destinataire'  // Ports en compte destinataire (🖐️)

export type VersementStatus = 'pending' | 'validated' | 'rejected'

export type PaymentMode = 'especes' | 'cheque' | 'virement'

export interface Versement {
  id: string
  agentId: string
  agentName: string
  agentRole: 'chef_agence' | 'agent_comptes'
  city: string
  amount: number
  type: VersementType
  paymentMode: PaymentMode
  reference?: string // numéro chèque ou référence virement
  notes?: string
  declaredAt: Timestamp
  validatedAt?: Timestamp
  validatedBy?: string // admin user id
  validatedByName?: string
  status: VersementStatus
  createdAt: Timestamp
}

/**
 * Déclarer un nouveau versement (par chef d'agence ou agent des comptes)
 */
export async function declareVersement(data: {
  amount: number
  type: VersementType
  paymentMode: PaymentMode
  reference?: string
  notes?: string
  city: string
  agentName: string
  agentRole: 'chef_agence' | 'agent_comptes'
}) {
  const user = auth.currentUser
  if (!user) throw new Error('Non authentifié')

  const versement = {
    agentId: user.uid,
    agentName: data.agentName,
    agentRole: data.agentRole,
    city: data.city,
    amount: data.amount,
    type: data.type,
    paymentMode: data.paymentMode,
    reference: data.reference || null,
    notes: data.notes || null,
    declaredAt: Timestamp.now(),
    status: 'pending' as VersementStatus,
    createdAt: Timestamp.now(),
  }

  const docRef = await addDoc(collection(db, 'versements'), versement)
  return docRef.id
}

/**
 * Valider un versement (par admin)
 */
export async function validateVersement(
  versementId: string,
  validatorName: string
) {
  const user = auth.currentUser
  if (!user) throw new Error('Non authentifié')

  await updateDoc(doc(db, 'versements', versementId), {
    status: 'validated',
    validatedAt: Timestamp.now(),
    validatedBy: user.uid,
    validatedByName: validatorName,
  })
}

/**
 * Rejeter un versement (par admin)
 */
export async function rejectVersement(
  versementId: string,
  reason?: string
) {
  const user = auth.currentUser
  if (!user) throw new Error('Non authentifié')

  await updateDoc(doc(db, 'versements', versementId), {
    status: 'rejected',
    validatedAt: Timestamp.now(),
    validatedBy: user.uid,
    validatedByName: reason || 'Rejeté',
  })
}

/**
 * Supprimer un versement (admin ou créateur si pending)
 */
export async function deleteVersement(versementId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Non authentifié')

  await deleteDoc(doc(db, 'versements', versementId))
}

/**
 * Écouter tous les versements (pour admin)
 */
export function subscribeToAllVersements(
  callback: (versements: Versement[]) => void
) {
  const q = query(
    collection(db, 'versements'),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, snapshot => {
    const versements = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Versement[]
    callback(versements)
  })
}

/**
 * Écouter les versements d'un agent spécifique
 */
export function subscribeToMyVersements(
  agentId: string,
  callback: (versements: Versement[]) => void
) {
  const q = query(
    collection(db, 'versements'),
    where('agentId', '==', agentId),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, snapshot => {
    const versements = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Versement[]
    callback(versements)
  })
}

/**
 * Labels pour l'interface
 */
export const VERSEMENT_TYPE_LABELS: Record<VersementType, string> = {
  ports_payes: '💵 Ports Payés (gare)',
  ports_dus: '📮 Ports Dûs (livreur)',
  compte_expediteur: '💼 Compte Expéditeur',
  compte_destinataire: '🖐️ Compte Destinataire',
}

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  especes: '💵 Espèces',
  cheque: '📝 Chèque',
  virement: '🏦 Virement',
}

export const STATUS_LABELS: Record<VersementStatus, string> = {
  pending: '⏳ En attente',
  validated: '✅ Validé',
  rejected: '❌ Rejeté',
}

export const STATUS_COLORS: Record<VersementStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  validated: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
}
