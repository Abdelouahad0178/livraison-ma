import { db } from './config'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  limit,
  startAfter,
} from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ReturnFundStatus = 'pending' | 'verified' | 'ready' | 'delivered' | 'dispute' | 'problem' | 'expired'

export interface ReturnFundEspeces {
  id: string
  type: 'especes'
  encaisseurId: string
  encaisseurName: string
  encaisseurCity: string
  clientName: string
  clientPhone: string
  clientCin?: string
  parcelId?: string
  trackingId?: string
  amount: number
  receivedAt: Timestamp
  status: ReturnFundStatus
  bordereauPhotoUrl?: string
  cinPhotoUrl?: string
  signaturePhotoUrl?: string
  deliveredAt?: Timestamp
  deliveredBy?: string
  deliveredByName?: string
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ReturnFundCheque {
  id: string
  type: 'cheque' | 'traite'
  encaisseurId: string
  encaisseurName: string
  encaisseurCity: string
  clientName: string
  clientPhone: string
  clientCin?: string
  parcelId?: string
  trackingId?: string
  amount: number
  checkNumber: string
  bankName: string
  expiryDate: Timestamp
  receivedAt: Timestamp
  status: ReturnFundStatus
  checkPhotoFrontUrl?: string
  checkPhotoBackUrl?: string
  cinPhotoUrl?: string
  signaturePhotoUrl?: string
  deliveredAt?: Timestamp
  deliveredBy?: string
  deliveredByName?: string
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─────────────────────────────────────────────────────────────────────────────
// ESPECES (DRFE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Créer un nouveau retour de fond en espèces
 */
export async function createReturnFundEspeces(data: Partial<ReturnFundEspeces>) {
  const now = Timestamp.now()
  const docData = {
    type: 'especes',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    receivedAt: now,
    ...data,
  }
  const docRef = await addDoc(collection(db, 'return_funds_especes'), docData)
  return docRef.id
}

/**
 * Mettre à jour un retour de fond espèces
 */
export async function updateReturnFundEspeces(id: string, data: Partial<ReturnFundEspeces>) {
  const docRef = doc(db, 'return_funds_especes', id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Marquer comme remis au client
 */
export async function deliverReturnFundEspeces(
  id: string,
  deliveredBy: string,
  deliveredByName: string,
  cinPhotoUrl?: string,
  signaturePhotoUrl?: string,
  notes?: string
) {
  await updateReturnFundEspeces(id, {
    status: 'delivered',
    deliveredAt: Timestamp.now(),
    deliveredBy,
    deliveredByName,
    cinPhotoUrl,
    signaturePhotoUrl,
    notes,
  })
}

/**
 * Supprimer un retour de fond espèces
 */
export async function deleteReturnFundEspeces(id: string) {
  await deleteDoc(doc(db, 'return_funds_especes', id))
}

/**
 * S'abonner aux retours de fond espèces
 */
export function subscribeReturnFundsEspeces(
  callback: (data: ReturnFundEspeces[], lastDoc: any) => void,
  onError?: (err: any) => void,
  statusFilter?: ReturnFundStatus,
  limitCount = 9000
) {
  let q = query(
    collection(db, 'return_funds_especes'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )

  if (statusFilter) {
    q = query(
      collection(db, 'return_funds_especes'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    )
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReturnFundEspeces))
      const lastDoc = snapshot.docs[snapshot.docs.length - 1]
      callback(data, lastDoc)
    },
    onError || (() => {})
  )
}

/**
 * Charger plus de retours de fond espèces
 */
export async function getMoreReturnFundsEspeces(
  lastDoc: any,
  statusFilter?: ReturnFundStatus,
  limitCount = 9000
) {
  let q = query(
    collection(db, 'return_funds_especes'),
    orderBy('createdAt', 'desc'),
    startAfter(lastDoc),
    limit(limitCount)
  )

  if (statusFilter) {
    q = query(
      collection(db, 'return_funds_especes'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(limitCount)
    )
  }

  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReturnFundEspeces))
  const newLastDoc = snapshot.docs[snapshot.docs.length - 1]
  return { data, lastDoc: newLastDoc, hasMore: snapshot.docs.length === limitCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHEQUES/TRAITES (DRFC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Créer un nouveau retour de fond en chèque/traite
 */
export async function createReturnFundCheque(data: Partial<ReturnFundCheque>) {
  const now = Timestamp.now()
  const docData = {
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    receivedAt: now,
    ...data,
  }
  const docRef = await addDoc(collection(db, 'return_funds_cheques'), docData)
  return docRef.id
}

/**
 * Mettre à jour un retour de fond chèque/traite
 */
export async function updateReturnFundCheque(id: string, data: Partial<ReturnFundCheque>) {
  const docRef = doc(db, 'return_funds_cheques', id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Marquer comme remis au client
 */
export async function deliverReturnFundCheque(
  id: string,
  deliveredBy: string,
  deliveredByName: string,
  cinPhotoUrl?: string,
  signaturePhotoUrl?: string,
  notes?: string
) {
  await updateReturnFundCheque(id, {
    status: 'delivered',
    deliveredAt: Timestamp.now(),
    deliveredBy,
    deliveredByName,
    cinPhotoUrl,
    signaturePhotoUrl,
    notes,
  })
}

/**
 * Supprimer un retour de fond chèque/traite
 */
export async function deleteReturnFundCheque(id: string) {
  await deleteDoc(doc(db, 'return_funds_cheques', id))
}

/**
 * S'abonner aux retours de fond chèques/traites
 */
export function subscribeReturnFundsCheques(
  callback: (data: ReturnFundCheque[], lastDoc: any) => void,
  onError?: (err: any) => void,
  statusFilter?: ReturnFundStatus,
  limitCount = 9000
) {
  let q = query(
    collection(db, 'return_funds_cheques'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )

  if (statusFilter) {
    q = query(
      collection(db, 'return_funds_cheques'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    )
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReturnFundCheque))
      const lastDoc = snapshot.docs[snapshot.docs.length - 1]
      callback(data, lastDoc)
    },
    onError || (() => {})
  )
}

/**
 * Charger plus de retours de fond chèques/traites
 */
export async function getMoreReturnFundsCheques(
  lastDoc: any,
  statusFilter?: ReturnFundStatus,
  limitCount = 9000
) {
  let q = query(
    collection(db, 'return_funds_cheques'),
    orderBy('createdAt', 'desc'),
    startAfter(lastDoc),
    limit(limitCount)
  )

  if (statusFilter) {
    q = query(
      collection(db, 'return_funds_cheques'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(limitCount)
    )
  }

  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReturnFundCheque))
  const newLastDoc = snapshot.docs[snapshot.docs.length - 1]
  return { data, lastDoc: newLastDoc, hasMore: snapshot.docs.length === limitCount }
}

/**
 * Vérifier les échéances des chèques/traites
 */
export function checkExpiringCheques(cheques: ReturnFundCheque[]) {
  const now = new Date()
  const results = {
    expired: [] as ReturnFundCheque[],
    expiringSoon: [] as ReturnFundCheque[], // J-3
    expiringUrgent: [] as ReturnFundCheque[], // J-1
  }

  cheques.forEach((cheque) => {
    if (cheque.status === 'delivered') return

    const expiryDate = cheque.expiryDate.toDate()
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      results.expired.push(cheque)
    } else if (daysUntilExpiry <= 1) {
      results.expiringUrgent.push(cheque)
    } else if (daysUntilExpiry <= 3) {
      results.expiringSoon.push(cheque)
    }
  })

  return results
}
