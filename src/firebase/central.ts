
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { daysAgoTimestamp } from './firestoreUtils'
import { buildCaisseEntryPayload } from './caisse'
import { centralCodParcelPatch } from './finance'

export async function createCentralCodDeposit({ parcelIds = [], parcels = [] as any[], amount, city, agentId, agentName, note }: any) {
  const ids = [...new Set((parcelIds || []).filter(Boolean))]
  const total = parseFloat(amount) || 0
  if (!city) throw new Error('Ville agence manquante.')
  if (ids.length === 0) throw new Error('Aucun RETOUR FOND à verser.')
  if (total <= 0) throw new Error('Montant de versement invalide.')

  const now = new Date().toISOString()
  return runTransaction(db, async tx => {
    const cashRef = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const currentSolde = parseFloat(cash.solde || 0) || 0
    const currentEspeces = parseFloat(cash.soldeEspeces || 0) || 0
    const nextSolde = Math.max(0, currentSolde - total)
    const nextEspeces = Math.max(0, currentEspeces - total)
    const nextCheques = parseFloat(cash.soldeCheques || 0) || 0
    const nextVirement = parseFloat(cash.soldeVirement || 0) || 0

    const depositRef = doc(collection(db, 'centralCodDeposits'))
    tx.set(depositRef, {
      city,
      agentId: agentId || null,
      agentName: agentName || '',
      amount: total,
      parcelIds: ids,
      parcelCount: ids.length,
      parcels: (parcels || []).map((p: any) => ({
        id: p.id,
        trackingId: p.trackingId || '',
        senderName: p.sender?.name || '',
        senderNic: p.sender?.nic || '',
        senderTel: p.sender?.tel || '',
        receiverName: p.receiver?.name || '',
        receiverTel: p.receiver?.tel || '',
        originCity: p.originCity || p.sender?.city || '',
        destinationCity: p.destinationCity || p.receiver?.city || '',
        amount: parseFloat(p.codAmount) || 0,
      })),
      status: 'verse',
      note: note || '',
      cashBefore: currentSolde,
      cashAfter: nextSolde,
      cashShortage: Math.max(0, total - currentSolde),
      createdAt: serverTimestamp(),
    })

    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'sortie',
      category: 'versement_banque',
      amount: total,
      description: `Versement RETOUR FOND au compte société — ${ids.length} colis`,
      reference: depositRef.id,
      agentId,
      agentName,
      city,
      cashierId: agentId,
      cashierName: agentName,
      note: note || 'Versement société',
    }))

    tx.set(cashRef, {
      city,
      solde: nextSolde,
      soldeEspeces: nextEspeces,
      soldeCheques: nextCheques,
      soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: agentName || 'Chef agence',
    }, { merge: true })

    const patch = centralCodParcelPatch({ depositId: depositRef.id, now, agentName, agentId, city })
    ;(ids as string[]).forEach((id: string) => tx.update(doc(db, 'parcels', id), patch))
    return depositRef.id
  })
}
export function subscribeAllCentralCodDeposits(callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(90)
  const q = query(collection(db, 'centralCodDeposits'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export async function createCentralSupplierPayment({ parcelIds = [], parcels = [] as any[], amount, senderName, senderTel, chequeNum, bankName, chequeDate, preparedBy, preparedById, note }: any) {
  const ids = [...new Set((parcelIds || []).filter(Boolean))]
  const total = parseFloat(amount) || 0
  if (ids.length === 0) throw new Error('Aucun colis sélectionné.')
  if (total <= 0) throw new Error('Montant chèque invalide.')
  if (!senderName) throw new Error('Expéditeur manquant.')
  if (!chequeNum) throw new Error('Numéro de chèque obligatoire.')

  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'centralSupplierPayments'), {
    senderName: senderName || '',
    senderTel: senderTel || '',
    senderNic: parcels?.[0]?.sender?.nic || '',
    amount: total,
    parcelIds: ids,
    parcelCount: ids.length,
    parcels: (parcels || []).map((p: any) => ({
      id: p.id,
      trackingId: p.trackingId || '',
      senderNic: p.sender?.nic || '',
      receiverName: p.receiver?.name || '',
      receiverTel: p.receiver?.tel || '',
      originCity: p.originCity || p.sender?.city || '',
      destinationCity: p.destinationCity || p.receiver?.city || '',
      amount: parseFloat(p.codAmount) || 0,
    })),
    chequeNum: chequeNum || '',
    bankName: bankName || '',
    chequeDate: chequeDate || new Date().toISOString().split('T')[0],
    preparedBy: preparedBy || '',
    preparedById: preparedById || null,
    note: note || '',
    status: 'prepared',
    createdAt: serverTimestamp(),
  })

  const chunks: any[][] = []
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach(id => batch.update(doc(db, 'parcels', id), {
      centralSupplierPaymentId: ref.id,
      centralSupplierPaymentStatus: 'prepared',
      centralSupplierPreparedAt: now,
      centralSupplierPreparedBy: preparedBy || 'Encaisseur central',
      centralSupplierPreparedById: preparedById || null,
      centralChequeNum: chequeNum || '',
      centralChequeBank: bankName || '',
      centralChequeDate: chequeDate || '',
    }))
    await batch.commit()
  }
  return ref.id
}
export async function markCentralSupplierPaymentPaid(paymentId: any, paidBy: any, paidById: any) {
  if (!paymentId) throw new Error('Cheque invalide.')
  const now = new Date().toISOString()
  const paymentRef = doc(db, 'centralSupplierPayments', paymentId)
  const snap = await getDoc(paymentRef)
  if (!snap.exists()) throw new Error('Cheque introuvable.')
  const payment: any = snap.data()
  if (payment.status === 'paid') return paymentId

  const ids = [...new Set((payment.parcelIds || []).filter(Boolean))]
  const chunks: any[][] = []
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach(id => {
      batch.update(doc(db, 'parcels', id), {
        codSenderPaid: true,
        codSenderPaidAt: now,
        codSenderPaidBy: paidBy || 'Encaisseur central',
        codSenderPaidById: paidById || null,
        centralSupplierPaid: true,
        centralSupplierPaymentId: paymentId,
        centralSupplierPaymentStatus: 'paid',
        centralSupplierPaidAt: now,
        centralSupplierPaidBy: paidBy || '',
        centralSupplierPaidById: paidById || null,
        centralChequeNum: payment.chequeNum || '',
        centralChequeBank: payment.bankName || '',
        centralChequeDate: payment.chequeDate || '',
      })
    })
    await batch.commit()
  }
  await updateDoc(paymentRef, {
    status: 'paid',
    paidAt: serverTimestamp(),
    paidBy: paidBy || 'Encaisseur central',
    paidById: paidById || null,
  })
  return paymentId
}
export function subscribeAllCentralSupplierPayments(callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(90)
  const q = query(collection(db, 'centralSupplierPayments'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
