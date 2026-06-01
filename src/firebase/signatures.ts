import { arrayUnion, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './db'

export async function generateSignatureToken(parcelId: any) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
  await updateDoc(doc(db, 'parcels', parcelId), {
    signatureToken: token,
    signatureTokenCreatedAt: new Date().toISOString(),
  })
  return token
}

export function subscribeDeliverySignature(parcelId: any, callback: any) {
  return onSnapshot(
    doc(db, 'deliverySignatures', parcelId),
    snap => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    err => {
      console.warn('subscribeDeliverySignature permission error:', err.code)
      callback(null)
    }
  )
}

export async function submitDeliverySignature(parcelId: any, token: any, signatureDataUrl: any, { signatureType = 'personal', companyName = '' } = {}) {
  const parcelSnap = await getDoc(doc(db, 'parcels', parcelId))
  if (!parcelSnap.exists()) throw new Error('Colis introuvable.')

  const parcelData = parcelSnap.data()
  if (parcelData.signatureToken !== token) throw new Error('Lien de signature invalide ou expire.')
  if (parcelData.status === 'Livré' || parcelData.status === 'Livr\u00c3\u00a9') throw new Error('Ce colis a deja ete livre.')

  await setDoc(doc(db, 'deliverySignatures', parcelId), {
    token,
    signatureDataUrl,
    signatureType,
    companyName: companyName || '',
    signedAt: new Date().toISOString(),
    parcelId,
    trackingId: parcelData.trackingId || '',
    recipientName: parcelData.receiver?.name || '',
    originCity: parcelData.originCity || '',
    destinationCity: parcelData.destinationCity || '',
  })
}

export async function confirmDeliveryAfterSignature(parcelId: any, driverName: any) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    status: 'Livré',
    signatureToken: null,
    signatureConfirmedAt: now,
    history: arrayUnion({
      status: 'Livré',
      timestamp: now,
      note: `Livraison confirmee par signature electronique du destinataire - chauffeur : ${driverName}`,
    }),
  })
}

export async function deleteDeliverySignature(parcelId: any) {
  await deleteDoc(doc(db, 'deliverySignatures', parcelId))
  await updateDoc(doc(db, 'parcels', parcelId), { signatureConfirmedAt: null })
}

export async function updateDeliverySignature(parcelId: any, signatureDataUrl: any, updatedBy: any) {
  await updateDoc(doc(db, 'deliverySignatures', parcelId), {
    signatureDataUrl,
    signedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'Administrateur',
    updatedAt: new Date().toISOString(),
  })
}
