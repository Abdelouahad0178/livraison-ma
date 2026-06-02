import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore'
import { db } from './db'

export async function createBankDeposit({ parcelId, trackingId, senderName, receiverName, amount, bankName, refNum, depositDate, city, agentId, agentName, note }: any) {
  const ref = await addDoc(collection(db, 'bankDeposits'), {
    parcelId:     parcelId    || null,
    trackingId:   trackingId  || '',
    senderName:   senderName  || '',
    receiverName: receiverName || '',
    amount:       parseFloat(amount) || 0,
    bankName:     bankName    || '',
    refNum:       refNum      || '',
    depositDate:  depositDate || new Date().toISOString().split('T')[0],
    city:         city        || '',
    agentId:      agentId     || null,
    agentName:    agentName   || '',
    note:         note        || '',
    createdAt:    serverTimestamp(),
  })

  if (parcelId) {
    updateDoc(doc(db, 'parcels', parcelId), {
      codBankDeposited:   true,
      codBankDepositAt:   new Date().toISOString(),
      codBankDepositRef:  refNum   || '',
      codBankDepositBank: bankName || '',
      codBankDepositBy:   agentName || '',
      codBankDepositById: agentId  || null,
    }).catch(() => {})
  }

  return ref.id
}

export function subscribeBankDepositsByCity(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'bankDeposits'),
    where('city', '==', city),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

export function subscribeAllBankDeposits(callback: any, onError: (err?: any) => void = () => {}) {
  // Récupérer tous les versements sans filtre de date
  const q = query(collection(db, 'bankDeposits'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

export async function confirmBankDeposit(depositId: any, adminName: any) {
  await updateDoc(doc(db, 'bankDeposits', depositId), {
    adminConfirmed:   true,
    adminConfirmedAt: new Date().toISOString(),
    adminConfirmedBy: adminName || 'Admin',
  })
}

export async function deleteBankDeposit(depositId: any) {
  await deleteDoc(doc(db, 'bankDeposits', depositId))
}
