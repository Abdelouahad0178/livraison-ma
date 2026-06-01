import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from './db'

export async function findParcel(trackingId: any) {
  const q = query(collection(db, 'parcels'), where('trackingId', '==', trackingId.trim()), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}
