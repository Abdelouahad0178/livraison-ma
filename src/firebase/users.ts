import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { createParcel, FIRESTORE_PAGE_LIMITS } from './parcels'
import type { AppUser } from '../types'

export async function getAgentCode(agentId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', agentId))
  return snap.exists() ? (snap.data()?.code ?? null) : null
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser))
}

export async function updateUser(userId: string, data: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', userId), data as Record<string, unknown>)
}

export async function deleteUserDoc(userId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId))
}

export function subscribeAllUsers(
  callback: (users: AppUser[]) => void,
  onError: (err?: any) => void = () => {},
): () => void {
  const q = query(collection(db, 'users'), limit(FIRESTORE_PAGE_LIMITS.users))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)))
  }, onError)
}

interface ClientPortalInput {
  clientId: string
  clientName?: string
  clientUid?: string | null
  sender: Record<string, unknown>
  receiver: Record<string, unknown>
  weight?: number
  nbColis?: number
  natureOfGoods?: string
  serviceType?: string
  codAmount?: number
  portType?: string
  price?: number
}

export async function createClientPortalParcel(data: ClientPortalInput) {
  if (!data.clientId) throw new Error('Compte client introuvable.')
  const parcel = await createParcel({
    sender: data.sender,
    receiver: data.receiver,
    weight: data.weight,
    nbColis: data.nbColis,
    natureOfGoods: data.natureOfGoods,
    serviceType: data.serviceType || 'especes',
    codAmount: data.codAmount || 0,
    portType: data.portType || 'port_en_compte',
    price: data.price || 0,
    clientId: data.clientId,
    clientName: data.clientName,
    clientUid: data.clientUid || null,
    agentId: data.clientUid || null,
    agentName: data.clientName || 'Portail client',
    chauffeurId: null,
    chauffeurName: null,
    agentRole: 'client_portal',
  })
  return parcel
}

// -- Permissions Directeur --------------------------------------
