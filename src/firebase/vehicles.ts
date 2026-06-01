import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from './db'

type DynamicData = Record<string, any>
type FirestoreRow = DynamicData & { id: string }

export async function createVehicle(data: DynamicData) {
  const ref = await addDoc(collection(db, 'vehicles'), { ...data, createdAt: new Date().toISOString() })
  return ref.id
}

export async function updateVehicle(id: string, data: DynamicData) {
  await updateDoc(doc(db, 'vehicles', id), data)
}

export async function deleteVehicle(id: string) {
  await deleteDoc(doc(db, 'vehicles', id))
}

export function subscribeVehicles(callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  return onSnapshot(collection(db, 'vehicles'), snap => {
    const data: FirestoreRow[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    callback(data)
  }, onError)
}
