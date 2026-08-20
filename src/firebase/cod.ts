import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { COD_STATUS, COD_PAYMENT_TYPES, STATUSES } from './constants'
import { findOrCreateClientForReceiver } from './clients'

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
  await runTransaction(db, async tx => {
    const ref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')
    const data = snap.data()

    // 🔒 GARDE : Éviter double-encaissement
    if (data.codStatus === 'remis' || data.codStatus === 'regle') {
      throw new Error('Ce COD a déjà été collecté.')
    }

    tx.update(ref, {
      codStatus:      'remis',
      codPaymentType:  paymentType,
      codCollectedAt:  now,
      codCollectedBy:  collectedBy,
      codRemisAt:      now,
      codRemisBy:      collectedBy,
    })
  })
}

// Collecte directe par l'agence source (client vient sur place) — bypass étapes destination
export async function collectCodAtSource(parcelId: string, paymentType: string, collectedBy: string) {
  const now = new Date().toISOString()
  await runTransaction(db, async tx => {
    const ref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')
    const data = snap.data()

    // 🔒 GARDE : Éviter double-encaissement
    if (data.codStatus === 'collected' || data.codStatus === 'remis' || data.codStatus === 'regle') {
      throw new Error('Ce COD a déjà été collecté.')
    }

    tx.update(ref, {
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
  const updates = {
    portStatus:          'collected',
    portCollectedBy:     agentName,
    portCollectedById:   agentId,
    portCollectedAt:     serverTimestamp(),
    portDuReceivedMethod: 'especes', // Par défaut espèces pour cette fonction
  }

  await updateDoc(doc(db, 'parcels', parcelId), updates)

  // 🔄 TEMPS RÉEL: Émettre événement pour synchronisation cross-tab
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates: { ...updates, portCollectedAt: new Date() }, // Convertir timestamp pour l'événement
        timestamp: new Date().toISOString(),
        source: 'database'
      }
    }))
  }
}

/**
 * Annuler la collecte d'un port dû
 */
export async function uncollectPortDu(parcelId: string) {
  const updates = {
    portStatus:          null,
    portCollectedBy:     null,
    portCollectedById:   null,
    portCollectedAt:     null,
    portDuReceivedMethod: null,
  }

  await updateDoc(doc(db, 'parcels', parcelId), updates)

  // 🔄 TEMPS RÉEL: Émettre événement pour synchronisation cross-tab
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates,
        timestamp: new Date().toISOString(),
        source: 'database'
      }
    }))
  }
}

/**
 * Collecter un port dû payé par chèque avec détails du chèque
 * @param parcelId ID du colis
 * @param details Détails du chèque (banque, numéro, date)
 * @param collectedBy Nom de la personne qui collecte
 * @param collectedById ID de la personne qui collecte
 */
export async function collectPortDuCheque(
  parcelId: string,
  details: {
    banque: string
    numero: string
    dateEncaissement: string
  },
  collectedBy: string,
  collectedById: string
): Promise<void> {
  const parcelRef = doc(db, 'parcels', parcelId)

  // Vérifier que le colis existe et est bien un port dû
  const snap = await getDoc(parcelRef)
  if (!snap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = snap.data()
  if (parcel.portType !== 'port_du') {
    throw new Error('Ce colis n\'est pas un port dû')
  }

  // Mettre à jour avec les détails du chèque
  const updates = {
    portStatus: 'collected',
    portCollectedBy: collectedBy,
    portCollectedById: collectedById,
    portCollectedAt: serverTimestamp(),
    portDuReceivedMethod: 'cheque',
    portDuChequeBanque: details.banque,
    portDuChequeNumero: details.numero,
    portDuChequeDateEncaissement: details.dateEncaissement,
    portDuChequeFinalizedAt: new Date().toISOString(),
    portDuChequeFinalizedBy: collectedBy,
  }

  await updateDoc(parcelRef, updates)

  // 🔄 TEMPS RÉEL: Émettre événement pour synchronisation cross-tab
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates: { ...updates, portCollectedAt: new Date() },
        timestamp: new Date().toISOString(),
        source: 'database'
      }
    }))
  }
}

/**
 * Ajoute le port dû au compte du client destinataire
 * Le montant n'est PAS ajouté au solde du livreur
 */
export async function addPortDuToClientAccount(
  parcelId: string,
  driverName: string,
  driverId: string,
  agencyCity: string
): Promise<void> {
  console.log('🏦 Début addPortDuToClientAccount:', { parcelId, driverName, agencyCity })

  // Étape 1 : Lire le colis pour vérifications initiales
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    console.error('❌ Colis introuvable:', parcelId)
    throw new Error('Colis introuvable.')
  }

  const parcelData = parcelSnap.data()
  console.log('📦 Données du colis:', {
    trackingId: parcelData.trackingId,
    portType: parcelData.portType,
    portStatus: parcelData.portStatus,
    receiverClientId: parcelData.receiverClientId,
    receiverName: parcelData.receiver?.name || parcelData.receiverName,
    receiverTel: parcelData.receiver?.tel || parcelData.receiverTel,
    receiverCity: parcelData.receiver?.city || parcelData.receiverCity,
    price: parcelData.price
  })

  // Vérifier que c'est bien un port dû
  if (parcelData.portType !== 'port_du') {
    console.error('❌ Pas un port dû:', parcelData.portType)
    throw new Error('Ce colis n\'est pas en port dû.')
  }

  // Vérifier que le port n'a pas déjà été traité
  if (parcelData.portStatus === 'collected' || parcelData.portStatus === 'en_compte_destinataire') {
    console.error('❌ Port déjà traité:', parcelData.portStatus)
    throw new Error('Le port dû a déjà été traité.')
  }

  const portAmount = parseFloat(parcelData.price || 0)

  if (portAmount <= 0) {
    console.error('❌ Montant invalide:', portAmount)
    throw new Error('Le montant du port est invalide.')
  }

  // Étape 2 : Trouver ou créer le client pour le destinataire
  const receiverName = parcelData.receiver?.name || parcelData.receiverName || ''
  const receiverTel = parcelData.receiver?.tel || parcelData.receiverTel || ''
  const receiverCity = parcelData.receiver?.city || parcelData.receiverCity || parcelData.destinationCity || agencyCity
  const receiverAddress = parcelData.receiver?.address || parcelData.receiverAddress || ''

  if (!receiverName || !receiverCity) {
    throw new Error('Le nom et la ville du destinataire sont requis.')
  }

  console.log('🔍 Recherche du client pour le destinataire...')
  const receiverClientId = await findOrCreateClientForReceiver(
    {
      name: receiverName,
      tel: receiverTel,
      city: receiverCity,
      address: receiverAddress
    },
    driverId,
    driverName
  )

  // ⚠️ Si client non trouvé, afficher un message clair
  if (!receiverClientId) {
    throw new Error(
      `❌ Client "${receiverName}" non trouvé dans "Mes Clients".\n\n` +
      `📝 Le chef d'agence doit d'abord ajouter ce client manuellement:\n` +
      `   1. Aller dans "Mes Clients"\n` +
      `   2. Cliquer "+ Ajouter un client"\n` +
      `   3. Remplir les informations du client\n` +
      `   4. Enregistrer\n\n` +
      `Tél: ${receiverTel || 'Non fourni'}\n` +
      `Ville: ${receiverCity}`
    )
  }

  console.log('✅ Client ID obtenu:', receiverClientId)

  // Étape 3 : Transaction pour mettre à jour le colis et créer la transaction
  return runTransaction(db, async tx => {
    // Re-vérifier le colis dans la transaction
    const parcelSnapTx = await tx.get(parcelRef)
    if (!parcelSnapTx.exists()) {
      throw new Error('Colis introuvable.')
    }

    const parcelDataTx = parcelSnapTx.data()
    if (parcelDataTx.portStatus === 'collected' || parcelDataTx.portStatus === 'en_compte_destinataire') {
      throw new Error('Le port dû a déjà été traité.')
    }

    console.log('✅ Validation OK, création de la transaction...')

    // Mettre à jour le colis
    tx.update(parcelRef, {
      portStatus: 'en_compte_destinataire',
      portEnCompteBy: driverName,
      portEnCompteById: driverId,
      portEnCompteAt: serverTimestamp(),
      portEnCompteClientId: receiverClientId,
      receiverClientId: receiverClientId, // Lier le colis au client
    })

    // Créer une transaction de port en compte destinataire
    const transactionRef = doc(collection(db, 'clientPortDuTransactions'))
    const transactionData = {
      parcelId,
      trackingId: parcelData.trackingId || '',
      nic: parcelData.nic || '',
      clientId: receiverClientId,
      clientName: receiverName,
      clientTel: receiverTel,
      clientCity: receiverCity,
      amount: portAmount,
      driverName,
      driverId,
      agencyCity,
      createdAt: serverTimestamp(),
      status: 'pending',
      createdBy: driverName,
    }

    console.log('📝 Transaction à créer:', transactionData)
    tx.set(transactionRef, transactionData)

    console.log('✅ Transaction créée avec succès!')
  })
}

/**
 * Souscription aux transactions de ports en compte clients pour une agence
 */
export function subscribeClientPortDuTransactions(
  agencyCity: string,
  callback: (transactions: FirestoreRow[]) => void,
  onError: (err?: any) => void = () => {}
) {
  const q = query(
    collection(db, 'clientPortDuTransactions'),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    const transactions = snap.docs.map(rowFromDoc)
    callback(transactions)
  }, onError)
}

/**
 * Collecter un port en compte client (quand le chef récupère le paiement)
 */
export async function collectClientPortDu(
  transactionId: string,
  collectedBy: string
): Promise<void> {
  await updateDoc(doc(db, 'clientPortDuTransactions', transactionId), {
    status: 'collected',
    collectedBy,
    collectedAt: serverTimestamp(),
  })
}

/**
 * Annuler un port en compte client
 */
export async function cancelClientPortDu(
  transactionId: string,
  cancelledBy: string,
  reason: string
): Promise<void> {
  await updateDoc(doc(db, 'clientPortDuTransactions', transactionId), {
    status: 'cancelled',
    cancelledBy,
    cancelledAt: serverTimestamp(),
    cancellationReason: reason,
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

// ────────────────────────────────────────────────────────────────────────────
// 💳 GESTION DES PORTS PAYÉS PAR CHÈQUE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Récupère tous les ports payés/dus par chèque pour une agence
 * Inclut à la fois:
 * - Les ports PAYÉS (port_paye) avec portPayeMethod === 'cheque'
 * - Les ports DUS (port_du) avec portDuReceivedMethod === 'cheque'
 * @param agencyCity Ville de l'agence
 * @param callback Fonction appelée avec la liste des colis
 * @param onError Fonction appelée en cas d'erreur
 */
export function subscribePortPayeCheque(
  agencyCity: string,
  callback: (parcels: FirestoreRow[]) => void,
  onError: (err?: any) => void = () => {}
) {
  let portPayeParcels: FirestoreRow[] = []
  let portDuParcels: FirestoreRow[] = []

  const merge = () => {
    // Fusionner et dédupliquer par ID
    const map = new Map<string, FirestoreRow>()
    portPayeParcels.forEach(p => map.set(p.id, p))
    portDuParcels.forEach(p => map.set(p.id, p))

    // Trier par date décroissante
    const sorted = Array.from(map.values()).sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0
      const timeB = b.createdAt?.toMillis?.() || 0
      return timeB - timeA
    })

    callback(sorted)
  }

  // Query 1: Ports PAYÉS par chèque (créés dans cette agence)
  const q1 = query(
    collection(db, 'parcels'),
    where('originCity', '==', agencyCity),
    where('portType', '==', 'port_paye'),
    orderBy('createdAt', 'desc'),
    limit(500)
  )

  // Query 2: Ports DUS payés par chèque (destination = cette agence)
  const q2 = query(
    collection(db, 'parcels'),
    where('destinationCity', '==', agencyCity),
    where('portType', '==', 'port_du'),
    orderBy('createdAt', 'desc'),
    limit(500)
  )

  const unsub1 = onSnapshot(q1, snap => {
    portPayeParcels = snap.docs
      .map(rowFromDoc)
      .filter(p => p.portPayeMethod === 'cheque')
    merge()
  }, onError)

  const unsub2 = onSnapshot(q2, snap => {
    portDuParcels = snap.docs
      .map(rowFromDoc)
      .filter(p => p.portDuReceivedMethod === 'cheque')
    merge()
  }, onError)

  // Retourner une fonction de désinscription qui annule les deux souscriptions
  return () => {
    unsub1()
    unsub2()
  }
}

/**
 * Finaliser un port payé par chèque (ajouter détails banque, numéro, date)
 * @param parcelId ID du colis
 * @param details Détails du chèque (banque, numéro, date)
 * @param finalizedBy Nom de la personne qui finalise
 */
export async function finalizePortPayeCheque(
  parcelId: string,
  details: {
    banque: string
    numero: string
    dateEncaissement: string
  },
  finalizedBy: string
): Promise<void> {
  const parcelRef = doc(db, 'parcels', parcelId)

  // Vérifier que le colis existe et est bien un port payé par chèque
  const snap = await getDoc(parcelRef)
  if (!snap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcel = snap.data()
  if (parcel.portType !== 'port_paye') {
    throw new Error('Ce colis n\'est pas un port payé')
  }

  if (parcel.portPayeMethod !== 'cheque') {
    throw new Error('Ce colis n\'est pas payé par chèque')
  }

  // Mettre à jour les détails du chèque
  await updateDoc(parcelRef, {
    portPayeChequeBanque: details.banque,
    portPayeChequeNumero: details.numero,
    portPayeChequeDateEncaissement: details.dateEncaissement,
    portPayeChequeFinalizedAt: new Date().toISOString(),
    portPayeChequeFinalizedBy: finalizedBy,
  })
}
