import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './db'
import { sortByCreatedDesc } from './firestoreUtils'

type FirestoreRow = Record<string, any> & { id: string; createdAt?: any }

const rowFromDoc = (d: { id: string; data: () => Record<string, any> }): FirestoreRow => ({ id: d.id, ...d.data() })

export async function createAgentCodRequest(data: Record<string, any>) {
  if (!data.parcelId || !data.agentId) throw new Error('Colis ou agent RETOUR FOND invalide.')
  const ref = await addDoc(collection(db, 'agentCodRequests'), {
    parcelId:     data.parcelId,
    trackingId:   data.trackingId || '',
    agentId:      data.agentId,
    agentName:    data.agentName || '',
    agentCity:    data.agentCity || '',
    codAmount:    parseFloat(data.codAmount || 0) || 0,
    codStatus:    data.codStatus || '',
    senderName:   data.senderName || '',
    receiverName: data.receiverName || '',
    message:      data.message || 'Merci de régler ce RETOUR FOND avec le client expéditeur.',
    status:       'open',
    createdBy:    data.createdBy || 'Admin',
    createdById:  data.createdById || 'admin',
    createdAt:    serverTimestamp(),
    readByAgentAt:null,
    lastReplyAt:  null,
    resolvedAt:   null,
    resolvedBy:   '',
    replies:      [],
  })
  return ref.id
}

export function subscribeAllAgentCodRequests(callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  // Récupérer toutes les demandes sans filtre de date
  const q = query(collection(db, 'agentCodRequests'), orderBy('createdAt', 'desc'), limit(500))
  return onSnapshot(q, snap => callback(snap.docs.map(rowFromDoc)), onError)
}

export function subscribeAgentCodRequests(agentId: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'agentCodRequests'), where('agentId', '==', agentId))
  return onSnapshot(q, snap => {
    const rows = sortByCreatedDesc(snap.docs.map(rowFromDoc))
    callback(rows)
  }, onError)
}

export async function markAgentCodRequestRead(id: string) {
  await updateDoc(doc(db, 'agentCodRequests', id), {
    readByAgentAt: serverTimestamp(),
  })
}

export async function addAgentCodRequestReply(id: string, data: Record<string, any>) {
  await updateDoc(doc(db, 'agentCodRequests', id), {
    status: 'open',
    lastReplyAt: serverTimestamp(),
    replies: arrayUnion({
      message: data.message || '',
      authorName: data.authorName || '',
      authorRole: data.authorRole || 'agent',
      createdAt: new Date().toISOString(),
    }),
  })
}

export async function resolveAgentCodRequest(id: string, resolvedBy = 'Admin') {
  await updateDoc(doc(db, 'agentCodRequests', id), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy,
  })
}
