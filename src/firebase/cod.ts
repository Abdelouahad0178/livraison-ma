import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { COD_STATUS, COD_PAYMENT_TYPES, STATUSES } from './constants'

type DynamicData = Record<string, any>
type FirestoreRow = DynamicData & { id: string }

const rowFromDoc = (d: { id: string; data: () => DynamicData }): FirestoreRow => ({ id: d.id, ...d.data() })

export async function collectCod(
  parcelId: string,
  paymentType: string,
  collectedBy: string,
  extraFields: DynamicData = {}
): Promise<void> {
  await runTransaction(db, async tx => {
    const ref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')
    const data = snap.data()
    if (data.codStatus === 'collected' || data.codStatus === 'remis') {
      throw new Error('Ce COD a déjà été encaissé.')
    }
    tx.update(ref, {
      codStatus:      'collected',
      codPaymentType: paymentType,
      codCollectedAt: new Date().toISOString(),
      codCollectedBy: collectedBy,
      ...extraFields,
    })
  })
}

// Collecte directe par l'agence destination (client vient sur place) — passe directement à 'remis'
export async function collectCodAtDestination(parcelId: string, paymentType: string, collectedBy: string) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    codStatus:      'remis',
    codPaymentType:  paymentType,
    codCollectedAt:  now,
    codCollectedBy:  collectedBy,
    codRemisAt:      now,
    codRemisBy:      collectedBy,
  })
}

// Collecte directe par l'agence source (client vient sur place) — bypass étapes destination
export async function collectCodAtSource(parcelId: string, paymentType: string, collectedBy: string) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    codStatus:              'collected',
    codPaymentType:          paymentType,
    codCollectedAt:          now,
    codCollectedBy:          collectedBy,
    codSentToSource:         true,
    codSentToSourceBy:       collectedBy,
    codSentToSourceAt:       now,
    codReceivedBySource:     true,
    codReceivedBySourceBy:   collectedBy,
    codReceivedBySourceAt:   now,
  })
}
export async function remitCod(parcelId: string, remittedBy: string, extraFields: DynamicData = {}): Promise<void> {
  await runTransaction(db, async tx => {
    const ref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')
    const data = snap.data()
    if (data.codStatus === 'remis') {
      throw new Error('Ce COD a déjà été remis.')
    }
    tx.update(ref, {
      codStatus:  'remis',
      codRemisAt: new Date().toISOString(),
      codRemisBy: remittedBy,
      ...extraFields,
    })
  })
}
export async function settleCodToSender(parcelId: string, settledBy: string, settledById: string): Promise<void> {
  await runTransaction(db, async tx => {
    const ref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')
    const data = snap.data()
    if (data.codSenderPaid === true) {
      throw new Error('Ce COD a déjà été réglé à l\'expéditeur.')
    }
    tx.update(ref, {
      codSenderPaid:     true,
      codSenderPaidAt:   new Date().toISOString(),
      codSenderPaidBy:   settledBy,
      codSenderPaidById: settledById,
    })
  })
}

// ⭐ Étape 3.5 : Pointeur envoie le rapport au chef d'agence
export async function markCodSentToChef(parcelId: string, sentBy: string, sentById: string): Promise<void> {
  await updateDoc(doc(db, 'parcels', parcelId), {
    codSentToChef:     true,
    codSentToChefAt:   new Date().toISOString(),
    codSentToChefBy:   sentBy,
    codSentToChefById: sentById,
  })
}

// ⭐ Validation du rapport par le chef d'agence (optionnel)
export async function validateCodByChef(parcelId: string, validatedBy: string, validatedById: string): Promise<void> {
  await updateDoc(doc(db, 'parcels', parcelId), {
    codValidatedByChef:     true,
    codValidatedByChefAt:   new Date().toISOString(),
    codValidatedByChefBy:   validatedBy,
    codValidatedByChefById: validatedById,
  })
}

// Étape 4 : Agent destinataire envoie les valeurs à l'agent expéditeur
export async function markCodSentToSource(parcelId: string, sentBy: string, sentById: string, validated = false): Promise<void> {
  await updateDoc(doc(db, 'parcels', parcelId), {
    codSentToSource:     true,
    codSentToSourceAt:   new Date().toISOString(),
    codSentToSourceBy:   sentBy,
    codSentToSourceById: sentById,
    codSentWithValidation: validated,  // ⭐ Indique si envoyé avec validation
  })
}

// Étape 5 : Agent expéditeur confirme réception des valeurs
export async function confirmCodReceivedBySource(parcelId: string, confirmedBy: string, confirmedById: string, receiveType = 'especes', chequeDetails: DynamicData = {}): Promise<void> {
  const isDocumentValue = ['cheque', 'traite'].includes(receiveType)
  await updateDoc(doc(db, 'parcels', parcelId), {
    codReceivedBySource:      true,
    codReceivedBySourceAt:    new Date().toISOString(),
    codReceivedBySourceBy:    confirmedBy,
    codReceivedBySourceById:  confirmedById,
    codReceivedBySourceType:  receiveType,
    ...(isDocumentValue ? {
      codReceivedChequeNum:     chequeDetails.chequeNum  || '',
      codReceivedChequeBanque:  chequeDetails.banque     || '',
      codReceivedChequeEcheance: chequeDetails.echeance  || '',
      codReceivedValueMatchesPointeur: chequeDetails.matchesPointeur !== false,
      codReceivedValueNote: chequeDetails.note || '',
      codReceivedReglementId: chequeDetails.reglementId || '',
    } : {}),
  })
}
export async function batchSettleCods(parcelIds: string[], settledBy: string, settledById: string): Promise<void> {
  const now = new Date().toISOString()
  const chunks: string[][] = []
  for (let i = 0; i < parcelIds.length; i += 500) chunks.push(parcelIds.slice(i, i + 500))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach(id => batch.update(doc(db, 'parcels', id), {
      codSenderPaid: true, codSenderPaidAt: now, codSenderPaidBy: settledBy, codSenderPaidById: settledById,
    }))
    await batch.commit()
  }
}

// Récupère tous les colis RETOUR FOND liés à un agent (source OU destination) — historique complet
export async function fetchAllAgentCodParcels(agentId: string) {
  const [s1, s2] = await Promise.all([
    getDocs(query(collection(db, 'parcels'), where('agentId',            '==', agentId))),
    getDocs(query(collection(db, 'parcels'), where('destinationAgentId', '==', agentId))),
  ])
  const all = new Map<string, FirestoreRow>()
  ;[...s1.docs, ...s2.docs].forEach(d => all.set(d.id, rowFromDoc(d)))
  return [...all.values()].filter(p => parseFloat(p.codAmount) > 0)
}
export async function collectPortDu(parcelId: string, agentName: string, agentId: string) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    portStatus:          'collected',
    portCollectedBy:     agentName,
    portCollectedById:   agentId,
    portCollectedAt:     serverTimestamp(),
  })
}
export async function markPortDuReceivedByAgent(parcelId: string, receivedBy: string) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    portReceivedByAgent:   receivedBy,
    portReceivedByAgentAt: new Date().toISOString(),
  })
}
export function subscribeCodParcels(city: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'parcels'),
    where('destinationCity', '==', city),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    const all = snap.docs.map(rowFromDoc)
    callback(all.filter(p =>
      p.codAmount > 0 ||
      p.codStatus === 'collected' ||
      (p.portType === 'port_du' && p.portStatus === 'collected')
    ))
  }, onError)
}
