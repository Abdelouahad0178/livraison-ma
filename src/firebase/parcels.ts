
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import type { Parcel } from '../types'
import { CITIES, STATUSES, COD_PAYMENT_TYPES, COD_STATUS, STATUS_COLORS, CAISSE_CATEGORIES } from './constants'
import { daysAgoTimestamp, sortByCreatedDesc } from './firestoreUtils'
import { addPayment } from './clients'

export const FIRESTORE_PAGE_LIMITS = {
  adminLiveParcels: 50000,  // Charge initiale très élevée pour Admin
  adminNextParcels: 10000,  // Pages suivantes si besoin
  users: 500,
  clients: 500,
}
export function generateTrackingId() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  const encode = (num: any) => {
    let value = Math.max(0, Math.floor(num))
    let out = ''
    do {
      out = alphabet[value % alphabet.length] + out
      value = Math.floor(value / alphabet.length)
    } while (value > 0)
    return out
  }
  const ts = encode(Date.now())
  const rand = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `LMA-${ts}-${rand}`
}

// -- Parcels --------------------------------------------------

const cleanIdentity = (value: any) => String(value || '').trim()
const sameText = (a: any, b: any) => cleanIdentity(a).toLowerCase() === cleanIdentity(b).toLowerCase()
const LEGACY_DELIVERED_STATUS = 'Livr\u00c3\u00a9'
const isDeliveredStatus = (status: any) => status === 'Livré' || status === LEGACY_DELIVERED_STATUS

// Vérifie si un colis est dans le circuit retour
export const isInReturnCircuit = (parcel: any) => {
  return parcel.wasReturned ||
         parcel.status === 'Retourné' ||
         parcel.status === 'Retour en transit' ||
         parcel.status === 'Retour arrivé' ||
         parcel.status === 'Retour finalisé'
}
const DESTINATION_VISIBLE_STATUSES = ['En transit', 'Arrivé en agence', 'En cours de livraison', 'Livré', 'Retourné']

/**
 * 📅 Calcule la date de travail (workDate) basée sur l'heure de création
 * Session de travail: 8h00 → 6h00 du lendemain
 * Exemple: 01/07 8h→minuit + 02/07 minuit→6h = workDate 02/07
 */
function calculateWorkDate(timestamp?: Date | string): string {
  const date = timestamp ? new Date(timestamp) : new Date()
  const hours = date.getHours()

  // Entre 8h00 et minuit → workDate = DEMAIN (fin de session)
  if (hours >= 8) {
    const workDate = new Date(date)
    workDate.setDate(workDate.getDate() + 1)
    return workDate.toISOString().split('T')[0]
  }

  // Entre minuit et 6h00 → workDate = AUJOURD'HUI (déjà dans le lendemain)
  if (hours < 6) {
    return date.toISOString().split('T')[0]
  }

  // Entre 6h00 et 8h00 → période de transition, utiliser aujourd'hui
  return date.toISOString().split('T')[0]
}

export function isParcelVisibleInDestinationAgency(parcel: Partial<Parcel> = {}) {
  // Les retours ne vont PAS dans Arrivages, ils vont dans Retours
  // On utilise wasReturned pour identifier les retours
  if (parcel.wasReturned) return false

  return !!(
    parcel.visibleInDestinationAgency ||
    parcel.shipmentLoadedAt ||
    parcel.destinationArrivedAt ||
    parcel.destinationAgentId ||
    parcel.chauffeurId ||
    DESTINATION_VISIBLE_STATUSES.includes(parcel.status as string)
  )
}

async function ensureReceiverClientForAgency(parcel: any, parcelId: any) {
  if (parcel.receiverClientId) {
    const receiver = parcel.receiver || {}
    await updateDoc(doc(db, 'clients', parcel.receiverClientId), {
      lastReceiverParcelId: parcelId,
      lastReceiverTrackingId: parcel.trackingId,
      lastReceiverSeenAt: serverTimestamp(),
      ...(receiver.tel ? { tel: receiver.tel } : {}),
      ...(receiver.address ? { address: receiver.address } : {}),
      ...(receiver.name ? { name: receiver.name } : {}),
      isDestinataire: true,
    })
    return parcel.receiverClientId
  }

  const receiver = parcel.receiver || {}
  const city = cleanIdentity(receiver.city || parcel.destinationCity)
  const name = cleanIdentity(receiver.name)
  const tel = cleanIdentity(receiver.tel)
  if (!city || (!name && !tel)) return null

  let existing: any = null
  if (tel) {
    const byTel = await getDocs(query(collection(db, 'clients'), where('tel', '==', tel)))
    const found = byTel.docs.find(d => d.data().city === city)
    if (found) existing = { id: found.id, ...found.data() }
  }

  if (!existing && name) {
    const byCity = await getDocs(query(collection(db, 'clients'), where('city', '==', city)))
    const found = byCity.docs.find(d => sameText(d.data().name, name))
    if (found) existing = { id: found.id, ...found.data() }
  }

  if (existing) {
    const patch: Record<string, any> = {
      lastReceiverParcelId: parcelId,
      lastReceiverTrackingId: parcel.trackingId,
      lastReceiverSeenAt: serverTimestamp(),
      isDestinataire: true,
    }
    if (!existing.tel && tel) patch.tel = tel
    if (!existing.address && receiver.address) patch.address = receiver.address
    if (!existing.name && name) patch.name = name
    await updateDoc(doc(db, 'clients', existing.id), patch)
    return existing.id
  }

  const ref = await addDoc(collection(db, 'clients'), {
    name,
    tel,
    email: '',
    address: receiver.address || '',
    city,
    nic: '',
    accountType: 'cash',
    remise: 0,
    balance: 0,
    notes: 'Auto-enregistre comme destinataire servi par cette agence.',
    createdAt: serverTimestamp(),
    createdBy: parcel.agentId || null,
    createdByName: parcel.agentName || '',
    createdByRole: 'auto_receiver',
    portalUid: null,
    portalEmail: '',
    autoCreated: true,
    autoCreatedFrom: 'receiver',
    isExpediteur: false,
    isDestinataire: true,
    secteurId: '',
    secteurName: '',
    livreurIds: [],
    lastReceiverParcelId: parcelId,
    lastReceiverTrackingId: parcel.trackingId,
    lastReceiverSeenAt: serverTimestamp(),
  })
  return ref.id
}
export async function createParcel(data: Record<string, unknown>): Promise<Record<string, unknown> & { id: string; trackingId: string }> {
  const trackingId    = generateTrackingId()
  const requiresChefValidation = data.agentRole === 'aide_agent' || data.agentRole === 'client_portal'
  const sender = data.sender as Record<string, unknown>
  const receiver = data.receiver as Record<string, unknown>
  const isLocalDelivery = sameText(sender?.city, receiver?.city)
  const hasLocalDeliveryDriver = !!data.deliveryDriverId && isLocalDelivery && !data.chauffeurId
  const initialStatus = data.chauffeurId
    ? 'En transit'
    : (hasLocalDeliveryDriver ? 'En cours de livraison' : 'Initialisé')
  const hasCod        = parseFloat(data.codAmount as string) > 0
  const loadedAt      = data.chauffeurId ? new Date().toISOString() : null
  const opDate        = data.operationDate
    ? Timestamp.fromDate(new Date(data.operationDate + 'T12:00:00'))
    : serverTimestamp()
  const historyTs     = data.operationDate
    ? new Date(data.operationDate + 'T12:00:00').toISOString()
    : new Date().toISOString()
  const parcel = {
    trackingId,
    sender:               data.sender,
    receiver:             data.receiver,
    weight:               parseFloat(data.weight as string) || 0,
    nbColis:              parseInt(data.nbColis as string) || 1,
    natureOfGoods:        data.natureOfGoods || '',
    serviceType:          data.serviceType   || 'oc',
    customerMode:         data.customerMode  || (data.clientId ? 'client' : 'personal'),
    price:                data.price !== undefined && data.price !== null
      ? (parseFloat(data.price as string) || 0)
      : 0,
    codAmount:            parseFloat(data.codAmount as string) || 0,
    status:               initialStatus,
    history: [{
      status: initialStatus,
      timestamp: historyTs,
      note: data.chauffeurId
        ? `Colis enregistré et remis à ${data.chauffeurName || 'chauffeur de transport'}`
        : hasLocalDeliveryDriver
          ? `Colis enregistré et assigné au livreur ${data.deliveryDriverName || 'de livraison locale'}`
        : 'Colis enregistré en agence'
    }],
    photoUrl:             '',
    createdAt:            opDate,
    workDate:             calculateWorkDate((data.operationDate as string | undefined) || historyTs), // 📅 Date de travail (gère sessions de nuit)
    agentId:              data.agentId            || null,
    agentName:            data.agentName          || null,
    chauffeurId:          data.chauffeurId        || null,
    chauffeurName:        data.chauffeurName      || null,
    deliveryDriverId:     data.deliveryDriverId     || null,
    deliveryDriverName:   data.deliveryDriverName   || null,
    deliverySectorId:     data.deliverySectorId     || null,
    deliverySectorCode:   data.deliverySectorCode   || '',
    deliverySectorName:   data.deliverySectorName   || '',
    deliveryVehicleId:    data.deliveryVehicleId    || null,
    deliveryVehicleLabel: data.deliveryVehicleLabel || '',
    destinationCity:      receiver.city      || null,
    originCity:           sender.city        || null,
    createdByCity:        sender.city        || null,  // Ne change JAMAIS (même après retour)
    shipmentLoadedAt:     loadedAt,
    destinationArrivedAt: null,
    visibleInDestinationAgency: !!data.chauffeurId || hasLocalDeliveryDriver,
    destinationAgentId:   hasLocalDeliveryDriver ? (data.agentId || null) : null,
    destinationAgentName: hasLocalDeliveryDriver ? (data.agentName || null) : null,
    deliveryAssignedAt:   hasLocalDeliveryDriver ? historyTs : null,
    deliveryAssignedBy:   hasLocalDeliveryDriver ? (data.agentName || '') : '',
    deliveryMethod:       data.deliveryMethod || 'domicile',  // 🚉 Mode de livraison (gare ou domicile)
    codStatus:            hasCod ? 'pending' : null,
    codPaymentType:       hasCod ? 'especes' : null,  // Mode de paiement par défaut pour COD
    codCollectedAt:       null,
    codCollectedBy:       null,
    codRemisAt:           null,
    codRemisBy:           null,
    portType:             data.portType   || 'port_paye',
    clientId:             data.clientId   || null,
    clientName:           data.clientName || null,
    receiverClientId:     data.receiverClientId || null,
    returnOf:             data.returnOf             || null,
    returnOfTrackingId:   data.returnOfTrackingId   || null,
    agentRole:            data.agentRole            || 'agent',
    aideAgentId:          data.agentRole === 'aide_agent' ? (data.agentId || null) : null,
    aideAgentName:        data.agentRole === 'aide_agent' ? (data.agentName || '') : '',
    clientPortalUid:      data.agentRole === 'client_portal' ? (data.clientUid || data.agentId || null) : null,
    clientPortalName:     data.agentRole === 'client_portal' ? (data.clientName || data.agentName || '') : '',
    requestedFromPortal:  data.agentRole === 'client_portal',
    requestedByClientId:  data.agentRole === 'client_portal' ? (data.clientId || null) : null,
    requestedByClientName:data.agentRole === 'client_portal' ? (data.clientName || '') : '',
    requestedAt:          data.agentRole === 'client_portal' ? serverTimestamp() : null,
    // NOUVELLE POLITIQUE : Pas de validation nécessaire, enregistrement direct
    // Un colis est verrouillé pour aide-agent seulement si chargé (transportAssignedAt existe)
    aideEditUnlocked:     false,
    // 🔍 Champ pour file validation (subscribePendingAideAgentParcels)
    validatedByChef:      requiresChefValidation ? false : null,
    // 🔍 Champs dénormalisés pour recherche rapide
    senderNic:            (sender?.nic ? String(sender.nic).trim().toUpperCase() : ''),
    senderTel:            (sender?.tel ? String(sender.tel).replace(/[\s\-\(\)\.]/g, '') : ''),
    receiverTel:          (receiver?.tel ? String(receiver.tel).replace(/[\s\-\(\)\.]/g, '') : ''),
    senderNameLower:      (sender?.name ? String(sender.name).toLowerCase().trim() : ''),
    receiverNameLower:    (receiver?.name ? String(receiver.name).toLowerCase().trim() : ''),
    hasRetourBL:          data.hasRetourBL === true,  // ⭐ Retour BL obligatoire
  }
  const ref = await addDoc(collection(db, 'parcels'), parcel)

  // 💼 Si client "en compte" (société), ajouter le montant au solde
  if (data.clientId) {
    try {
      const clientRef = doc(db, 'clients', data.clientId as string)
      const clientSnap = await getDoc(clientRef)

      // Vérifier que le client a accountType === 'compte'
      if (clientSnap.exists() && clientSnap.data().accountType === 'compte') {
        await updateDoc(clientRef, {
          balance: increment(parcel.price)
        })
      }
    } catch (err) {
      console.error('Erreur mise à jour solde client:', err)
    }
  }

  // NOUVELLE POLITIQUE : Toujours créer le client destinataire (pas d'attente de validation)
  let receiverClientId = null
  try {
    receiverClientId = await ensureReceiverClientForAgency(parcel, ref.id)
    if (receiverClientId) await updateDoc(ref, { receiverClientId })
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('ensureReceiverClientForAgency:', err)
    }
  }
  return { id: ref.id, ...parcel, receiverClientId }
}

// Mise à jour de statut — non bloquant sur la géolocalisation
export async function updateParcelStatus(parcelId: string, status: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const parcelRef = doc(db, 'parcels', parcelId)

  // 🔒 Transaction pour éviter race conditions sur circuit retour
  await runTransaction(db, async tx => {
    const parcelSnap = await tx.get(parcelRef)
    if (parcelSnap.exists()) {
      const current = parcelSnap.data() as any

      // ✅ RÈGLE 1 DÉSACTIVÉE: L'Admin peut modifier le statut même si le colis est livré
      // if (isDeliveredStatus(current.status) && !isDeliveredStatus(status)) {
      //   throw new Error('Ce colis est livre : son statut est verrouille. Demandez une modification a l admin ou au chef d agence.')
      // }

      // RÈGLE 2: Un colis dans le circuit retour ne peut JAMAIS être marqué "Livré"
      if (isInReturnCircuit(current) && status === 'Livré') {
        throw new Error('Un colis retourne ne peut pas etre marque comme Livre. Utilisez "Retour finalise" pour terminer le retour.')
      }
    }

    const historyEntry = {
      status,
      timestamp: new Date().toISOString(),
      ...extra
    }
    const patch: Record<string, any> = {
      status,
      history: arrayUnion(historyEntry)
    }

    if (status === 'En transit') {
      patch.visibleInDestinationAgency = true
      patch.shipmentLoadedAt = extra.shipmentLoadedAt || new Date().toISOString()
    }
    if (status === 'Arrivé en agence') {
      patch.visibleInDestinationAgency = true
      patch.destinationArrivedAt = extra.destinationArrivedAt || new Date().toISOString()
    }

    // Écriture Firestore immédiate — pas d'attente GPS
    tx.update(parcelRef, patch)
  })

  // Géolocalisation en arrière-plan (ne bloque pas la mise à jour)
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    const tryGeo = () => navigator.geolocation.getCurrentPosition(
      pos => updateDoc(parcelRef, {
        lastLocation: {
          lat:       pos.coords.latitude,
          lng:       pos.coords.longitude,
          status,
          timestamp: new Date().toISOString()
        }
      }).catch(() => {}),
      () => {},
      { timeout: 5000, maximumAge: 30000 }
    )
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(r => { if (r.state === 'granted') tryGeo() })
        .catch(() => {})
    } else {
      tryGeo()
    }
  }

  return historyEntry
}
export async function getAllParcels() {
  const snap = await getDocs(collection(db, 'parcels'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

const ARRIVAGE_DETAIL_FIELDS = ['arrivedColisDetail', 'missingColisDetail']
const PARCEL_SNAPSHOT_KEYS = [
  'sender',
  'receiver',
  'weight',
  'nbColis',
  'natureOfGoods',
  'originCity',
  'destinationCity',
]

async function syncParcelSnapshotInArrivages(parcelId: any, data: any = {}) {
  if (!PARCEL_SNAPSHOT_KEYS.some(key => Object.prototype.hasOwnProperty.call(data, key))) return

  // 🚀 Optimisation : query uniquement les arrivages contenant ce colis (array-contains)
  // Au lieu de scanner TOUS les arrivages (O(N)), on ne charge que ceux concernés (O(1-5))
  const arrQuery = query(
    collection(db, 'arrivages'),
    where('arrivedParcelIds', 'array-contains', parcelId)
  )
  const snap = await getDocs(arrQuery)
  const batches: any[] = []
  let batch = writeBatch(db)
  let count = 0

  snap.docs.forEach(arrDoc => {
    const arr = arrDoc.data()
    const patch: Record<string, any> = {}

    ARRIVAGE_DETAIL_FIELDS.forEach(field => {
      const list = Array.isArray(arr[field]) ? arr[field] : []
      let changed = false
      const next = list.map(item => {
        if (item?.parcelId !== parcelId) return item
        changed = true
        const updated = { ...item }
        if (Object.prototype.hasOwnProperty.call(data, 'sender')) {
          updated.senderName = data.sender?.name || updated.senderName || ''
          updated.originCity = data.sender?.city || data.originCity || updated.originCity || ''
        }
        if (Object.prototype.hasOwnProperty.call(data, 'receiver')) {
          updated.receiverName = data.receiver?.name || updated.receiverName || ''
          updated.receiverCity = data.receiver?.city || data.destinationCity || updated.receiverCity || ''
        }
        if (Object.prototype.hasOwnProperty.call(data, 'originCity')) updated.originCity = data.originCity || updated.originCity || ''
        if (Object.prototype.hasOwnProperty.call(data, 'destinationCity')) updated.destinationCity = data.destinationCity || updated.destinationCity || ''
        if (Object.prototype.hasOwnProperty.call(data, 'weight')) updated.weight = data.weight || 0
        if (Object.prototype.hasOwnProperty.call(data, 'nbColis')) updated.nbColis = data.nbColis || 1
        if (Object.prototype.hasOwnProperty.call(data, 'natureOfGoods')) updated.natureOfGoods = data.natureOfGoods || ''
        return updated
      })
      if (changed) patch[field] = next
    })

    if (Object.keys(patch).length > 0) {
      batch.update(doc(db, 'arrivages', arrDoc.id), patch)
      count += 1
      if (count === 450) {
        batches.push(batch)
        batch = writeBatch(db)
        count = 0
      }
    }
  })

  if (count > 0) batches.push(batch)
  await Promise.all(batches.map(b => b.commit()))
}
export async function updateParcel(parcelId: string, data: Partial<Parcel> & Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'parcels', parcelId), data)
  await syncParcelSnapshotInArrivages(parcelId, data)
}
export async function markParcelAsReturned(parcel: any, extra: any = {}) {
  const now = new Date().toISOString()
  const newSender   = parcel.receiver   || {}
  const newReceiver = parcel.sender     || {}
  // IMPORTANT: Pour les retours, utiliser les AGENCES (originCity/destinationCity),
  // PAS les villes des clients (sender.city/receiver.city)
  // Cela garantit que les livreurs filtrés sont ceux de l'AGENCE d'expédition
  const newOrigin   = parcel.destinationCity || ''
  const newDest     = parcel.originCity      || ''

  // Garder trace du livreur qui a retourné le colis (pour son historique)
  const returnedByDriverId = parcel.deliveryDriverId || extra.driverId || null
  const returnedByDriverName = parcel.deliveryDriverName || extra.driverName || ''

  await updateDoc(doc(db, 'parcels', parcel.id), {
    status:          'Retourné',
    sender:          newSender,
    receiver:        newReceiver,
    originCity:      newOrigin,
    destinationCity: newDest,
    returnToCity:    newDest,
    codAmount:       0,
    returnedAt:      now,
    returnReason:    extra.note || '',
    arrivedNbColis:  deleteField(),
    // Marquer comme retourné de façon permanente (garde le signe même après réassignation)
    wasReturned:     true,
    returnedByDriverId: returnedByDriverId,
    returnedByDriverName: returnedByDriverName,
    // IMPORTANT: Retirer l'assignation au livreur de destination
    // Le colis retourne à l'agence SOURCE et ne doit plus être visible pour le livreur
    deliveryDriverId:     deleteField(),
    deliveryDriverName:   deleteField(),
    deliverySectorId:     deleteField(),
    deliverySectorCode:   deleteField(),
    deliverySectorName:   deleteField(),
    deliveryVehicleId:    deleteField(),
    deliveryVehicleLabel: deleteField(),
    deliveryAssignedAt:   deleteField(),
    deliveryAssignedBy:   deleteField(),
    history:         arrayUnion({
      status:    'Retourné',
      timestamp: now,
      ...(extra.note ? { note: extra.note } : {}),
    }),
  })
}

// Chargement d'un colis retourné sur camion inter-villes vers la ville de l'expéditeur.
// Si le swap n'a pas encore été effectué (ancien colis), il est réalisé ici.
export async function loadReturnedParcelOnTruck(parcel: any) {
  const now = new Date().toISOString()
  const hasBeenSwapped = !!parcel.returnToCity

  // Modifier le statut pour marquer le colis comme en transit retour
  await updateDoc(doc(db, 'parcels', parcel.id), {
    status: 'Retour en transit',
    returnShippedAt: now,
    history: arrayUnion({
      status: 'Retour en transit',
      timestamp: now,
      note: 'Chargé sur camion pour retour vers agence source',
    }),
  })
}

// Validation d'une saisie aide agent par le chef d'agence
export async function validateParcelEntry(parcelId: any, chefId: any, chefName: any) {
  const now = new Date().toISOString()
  const ref = doc(db, 'parcels', parcelId)
  const snap = await getDoc(ref)
  const parcel = snap.exists() ? snap.data() : {}
  const aideAgentId = parcel.aideAgentId || parcel.agentId || null
  const aideAgentName = parcel.aideAgentName || parcel.agentName || ''
  const isLocalManagedByAide = parcel.destinationAgentId && parcel.destinationAgentId === parcel.agentId

  const patch = {
    agentId: chefId,
    agentName: chefName,
    agentRole: parcel.agentRole || 'aide_agent',
    aideAgentId,
    aideAgentName,
    validatedByChef: true,
    validatedAt: now,
    validatedById: chefId,
    validatedByName: chefName,
    aideEditUnlocked: false,
    aideEditLockChangedAt: now,
    aideEditLockChangedBy: chefId,
    aideEditLockChangedByName: chefName,
    ...(isLocalManagedByAide ? {
      destinationAgentId: chefId,
      destinationAgentName: chefName,
      deliveryAssignedBy: chefName,
    } : {}),
  }

  await updateDoc(ref, patch)

  if (parcel.agentRole === 'client_portal' && parcel.portType === 'port_en_compte' && parcel.clientId && (parseFloat(parcel.price) || 0) > 0 && parcel.portalDebitCreated !== true) {
    try {
      await addPayment({
        clientId: parcel.clientId,
        parcelId: parcel.trackingId,
        amount: parseFloat(parcel.price) || 0,
        type: 'debit',
        invoiced: true,
        description: `Commande portail validee - ${parcel.trackingId} -> ${parcel.receiver?.city || ''}`,
        createdBy: chefId,
      })
      await updateDoc(ref, { portalDebitCreated: true })
    } catch (err: any) {
      console.warn('client portal debit validateParcelEntry:', err)
    }
  }

  try {
    const normalizedParcel = { ...parcel, ...patch }
    const receiverClientId = await ensureReceiverClientForAgency(normalizedParcel, parcelId)
    if (receiverClientId) await updateDoc(ref, { receiverClientId })
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('ensureReceiverClientForAgency validateParcelEntry:', err)
    }
  }
}

// Validation de l'arrivée d'un colis en transit retour ? Arrivé en agence
export async function validateReturnArrival(parcel: any) {

  const now = new Date().toISOString()
  const updateData: any = {
    status: 'Arrivé en agence',
    destinationArrivedAt: now,
    history: arrayUnion({
      status: 'Arrivé en agence',
      timestamp: now,
      note: 'Colis retourné arrivé en agence — prêt pour livraison à l\'expéditeur d\'origine',
    }),
  }

  // Suppression du champ arrivedNbColis seulement s'il existe
  if (parcel.arrivedNbColis !== undefined) {
    updateData.arrivedNbColis = deleteField()
  }


  try {
    await updateDoc(doc(db, 'parcels', parcel.id), updateData)
  } catch (error: any) {
    console.error('❌ Erreur Firestore:', error)
    console.error('Code:', error.code)
    console.error('Message:', error.message)
    throw error
  }
}
export async function deleteParcel(parcelId: string): Promise<void> {
  await deleteDoc(doc(db, 'parcels', parcelId))
}
export async function getArchivedParcels(city: any, { lastOrigDoc = null, lastDestDoc = null, pageSize = 300 } = {}) {
  const makeQ = (field: any, lastDoc: any) => {
    const constraints: any[] = [where(field, '==', city), orderBy('createdAt', 'desc'), limit(pageSize)]
    if (lastDoc) constraints.push(startAfter(lastDoc))
    return query(collection(db, 'parcels_archive'), ...constraints)
  }
  const [s1, s2] = await Promise.all([getDocs(makeQ('originCity', lastOrigDoc)), getDocs(makeQ('destinationCity', lastDestDoc))])
  const map = new Map()
  ;[...s1.docs, ...s2.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  const result = [...map.values()].sort((a, b) => {
    const ta = a.createdAt?.toDate?.() || new Date(0)
    const tb = b.createdAt?.toDate?.() || new Date(0)
    return tb.getTime() - ta.getTime()
  })
  return {
    parcels: result,
    hasMore: s1.docs.length === pageSize || s2.docs.length === pageSize,
    lastOrigDoc: s1.docs[s1.docs.length - 1] ?? null,
    lastDestDoc: s2.docs[s2.docs.length - 1] ?? null,
  }
}
export async function archiveParcels(city: any, olderThanDays = 180, onProgress: (done?: number, total?: number) => void = () => {}) {
  const cutoff = daysAgoTimestamp(olderThanDays)
  const [r1, r2, r3, r4] = await Promise.all([
    getDocs(query(collection(db, 'parcels'), where('originCity', '==', city), where('status', '==', 'Livré'), where('createdAt', '<', cutoff))),
    getDocs(query(collection(db, 'parcels'), where('originCity', '==', city), where('status', '==', 'Retourné'), where('createdAt', '<', cutoff))),
    getDocs(query(collection(db, 'parcels'), where('destinationCity', '==', city), where('status', '==', 'Livré'), where('createdAt', '<', cutoff))),
    getDocs(query(collection(db, 'parcels'), where('destinationCity', '==', city), where('status', '==', 'Retourné'), where('createdAt', '<', cutoff))),
  ])
  const map = new Map()
  ;[...r1.docs, ...r2.docs, ...r3.docs, ...r4.docs].forEach(d => map.set(d.id, d))
  const docs = [...map.values()]
  if (docs.length === 0) return { archived: 0 }
  const BATCH_SIZE = 450
  let done = 0
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(d => {
      batch.set(doc(collection(db, 'parcels_archive'), d.id), { ...d.data(), _archivedAt: Timestamp.now(), _archivedFrom: 'parcels' })
      batch.delete(doc(db, 'parcels', d.id))
    })
    await batch.commit()
    done += chunk.length
    onProgress(done, docs.length)
  }
  return { archived: docs.length }
}

// Archive tous les colis Livré/Retourné de toutes les villes — utilisé pour l'auto-archivage quotidien
export async function archiveParcelsByCriteria({
  city = '',
  statuses = ['Livré', 'Retourné'],
  olderThanDays = 180,
  onProgress = (_done?: number, _total?: number) => {},
}: {
  city?: string
  statuses?: string[]
  olderThanDays?: number
  onProgress?: (done?: number, total?: number) => void
}) {
  const selectedStatuses = [...new Set((statuses || []).filter(Boolean))]
  if (selectedStatuses.length === 0) return { archived: 0 }

  const cutoff = daysAgoTimestamp(olderThanDays)
  const requests: any[] = []
  selectedStatuses.forEach(status => {
    if (city && city !== 'Toutes') {
      requests.push(getDocs(query(collection(db, 'parcels'), where('originCity', '==', city), where('status', '==', status), where('createdAt', '<', cutoff))))
      requests.push(getDocs(query(collection(db, 'parcels'), where('destinationCity', '==', city), where('status', '==', status), where('createdAt', '<', cutoff))))
    } else {
      requests.push(getDocs(query(collection(db, 'parcels'), where('status', '==', status), where('createdAt', '<', cutoff))))
    }
  })

  const snaps = await Promise.all(requests)
  const map = new Map()
  snaps.forEach(snap => snap.docs.forEach((d: any) => map.set(d.id, d)))
  const docs = [...map.values()]
  if (docs.length === 0) return { archived: 0 }

  const BATCH_SIZE = 450
  let done = 0
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(d => {
      batch.set(doc(collection(db, 'parcels_archive'), d.id), {
        ...d.data(),
        _archivedAt: Timestamp.now(),
        _archivedFrom: 'parcels',
        _archiveCriteria: {
          city: city || 'Toutes',
          statuses: selectedStatuses,
          olderThanDays,
        },
      })
      batch.delete(doc(db, 'parcels', d.id))
    })
    await batch.commit()
    done += chunk.length
    onProgress(done, docs.length)
  }

  return { archived: docs.length }
}

export async function archiveAllParcels(olderThanDays = 90) {
  const cutoff = daysAgoTimestamp(olderThanDays)
  const [livresSnap, retoursSnap] = await Promise.all([
    getDocs(query(collection(db, 'parcels'), where('status', '==', 'Livré'),    where('createdAt', '<', cutoff))),
    getDocs(query(collection(db, 'parcels'), where('status', '==', 'Retourné'), where('createdAt', '<', cutoff))),
  ])
  const map = new Map()
  ;[...livresSnap.docs, ...retoursSnap.docs].forEach(d => map.set(d.id, d))
  const docs = [...map.values()]
  if (docs.length === 0) return { archived: 0 }
  const BATCH_SIZE = 450
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(d => {
      batch.set(doc(collection(db, 'parcels_archive'), d.id), { ...d.data(), _archivedAt: Timestamp.now(), _archivedFrom: 'parcels' })
      batch.delete(doc(db, 'parcels', d.id))
    })
    await batch.commit()
  }
  return { archived: docs.length }
}
export function subscribeAllParcels(callback: any, onError: (err?: any) => void = () => {}, days = 0, pageSize = FIRESTORE_PAGE_LIMITS.adminLiveParcels) {
  // Version ORIGINALE simplifiée - celle qui marchait avant
  const q = query(
    collection(db, 'parcels'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  )

  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const lastSnap = snap.docs[snap.docs.length - 1] || null
    callback(docs, lastSnap)
  }, onError)
}

// Charge une page supplémentaire de colis avec curseur document (startAfter)
// lastDocSnap = QueryDocumentSnapshot retourné par la page précédente
export async function getParcelsPage(lastDocSnap: any, pageSize = FIRESTORE_PAGE_LIMITS.adminNextParcels) {
  const q = query(
    collection(db, 'parcels'),
    orderBy('createdAt', 'desc'),
    startAfter(lastDocSnap),
    limit(pageSize)
  )
  const snap = await getDocs(q)
  return {
    docs: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDocSnap: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  }
}

// Colis d'un agent spécifique (créés + reçus) — requêtes ciblées
// Réduit drastiquement les lectures : l'agent ne reçoit que SES colis
// Debounce 50ms : les deux snapshots initiaux fusionnent en un seul re-render
export function subscribeAgentParcels(agentId: any, callback: any, onError: (err?: any) => void = () => {}) {
  let created: any[] = [], claimed: any[] = [], timer: ReturnType<typeof setTimeout> | undefined = undefined

  const merge = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const map = new Map()
      created.forEach(p => map.set(p.id, p))
      claimed.forEach(p => map.set(p.id, p))
      callback([...map.values()].sort((a, b) => {
        const da  = a.createdAt?.toDate?.() || new Date(a.history?.[0]?.timestamp || 0)
        const db2 = b.createdAt?.toDate?.() || new Date(b.history?.[0]?.timestamp || 0)
        return db2 - da
      }))
    }, 50)
  }

  const since = daysAgoTimestamp(60)
  const q1 = query(collection(db, 'parcels'), where('agentId', '==', agentId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(2000))
  const q2 = query(collection(db, 'parcels'), where('destinationAgentId', '==', agentId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(2000))

  const unsub1 = onSnapshot(q1, snap => { created = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge() }, onError)
  const unsub2 = onSnapshot(q2, snap => { claimed  = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge() }, onError)

  return () => { unsub1(); unsub2(); clearTimeout(timer) }
}
export async function getMoreAgentParcels(agentId: any, beforeTimestamp: any, pageSize = 50) {
  const [s1, s2] = await Promise.all([
    getDocs(query(collection(db, 'parcels'), where('agentId', '==', agentId), where('createdAt', '<', beforeTimestamp), orderBy('createdAt', 'desc'), limit(pageSize))),
    getDocs(query(collection(db, 'parcels'), where('destinationAgentId', '==', agentId), where('createdAt', '<', beforeTimestamp), orderBy('createdAt', 'desc'), limit(pageSize)))
  ])
  const map = new Map()
  ;[...s1.docs, ...s2.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  const result = [...map.values()].sort((a, b) => {
    const ta = a.createdAt?.toDate?.() || new Date(0)
    const tb = b.createdAt?.toDate?.() || new Date(0)
    return tb.getTime() - ta.getTime()
  })
  return { parcels: result, hasMore: s1.docs.length === pageSize || s2.docs.length === pageSize }
}

// Counts précis pour le home tab chef_agence — utilise getCountFromServer (0 document téléchargé)
export async function getAccurateAgencyStats(city: any) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayTs = Timestamp.fromDate(todayStart)
  const [totalSnap, todaySnap, livresSnap, retournesSnap] = await Promise.all([
    getCountFromServer(query(collection(db, 'parcels'), where('originCity', '==', city))),
    getCountFromServer(query(collection(db, 'parcels'), where('originCity', '==', city), where('createdAt', '>=', todayTs))),
    getCountFromServer(query(collection(db, 'parcels'), where('originCity', '==', city), where('status', '==', 'Livré'))),
    getCountFromServer(query(collection(db, 'parcels'), where('originCity', '==', city), where('status', '==', 'Retourné'))),
  ])
  const total    = totalSnap.data().count
  const today    = todaySnap.data().count
  const livres   = livresSnap.data().count
  const retournes = retournesSnap.data().count
  const enCours  = total - livres - retournes
  return { total, today, livres, retournes, enCours }
}

// Boîte de réception d'une agence (colis non encore pris en charge)
export function subscribeAgencyInbox(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'parcels'), where('destinationCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(q, snap => {
    callback((snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]).filter(p => !p.destinationAgentId && isParcelVisibleInDestinationAgency(p)))
  }, onError)
}

// Colis d'un chauffeur de transport
export function subscribeAgencyParcels(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  let created: any[] = [], arrived: any[] = []
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const merge = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const map = new Map()
      created.forEach(p => map.set(p.id, p))
      arrived.forEach(p => map.set(p.id, p))
      callback(sortByCreatedDesc([...map.values()]))
    }, 50)
  }

  const since = daysAgoTimestamp(60)
  const q1 = query(collection(db, 'parcels'), where('originCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(2000))
  const q2 = query(collection(db, 'parcels'), where('destinationCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(2000))

  const unsub1 = onSnapshot(q1, snap => { created = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge() }, onError)
  const unsub2 = onSnapshot(q2, snap => {
    // Chef d'agence voit TOUS les colis de destination (incluant les retours)
    // Filtrer seulement les colis visibles OU les retours qui reviennent ici
    arrived = (snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]).filter((p: any) => {
      // Si c'est un retour qui revient vers cette ville, le montrer
      if (p.wasReturned && (p.returnToCity === city || p.destinationCity === city)) return true
      // Sinon, utiliser le filtre normal pour les colis non-retournés
      return isParcelVisibleInDestinationAgency(p)
    })
    merge()
  }, onError)

  return () => { unsub1(); unsub2(); clearTimeout(timer) }
}

// Colis retournés pour une agence (à charger, reçus, historique)
export function subscribeAgencyReturnParcels(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  let allReturns: any[] = []

  // Requête : tous les colis avec status retour (pour inclure les anciens colis)
  const q = query(
    collection(db, 'parcels'),
    where('status', 'in', ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']),
    orderBy('createdAt', 'desc'),
    limit(200)
  )

  return onSnapshot(q, snap => {
    allReturns = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Filtrer en local pour cette agence
    const filtered = allReturns.filter((p: any) => {
      // À charger : Retourné + destinationCity (car après swap, destinationCity = agence source)
      if (p.status === 'Retourné' && (p.destinationCity === city || p.returnToCity === city || p.createdByCity === city)) return true

      // Reçus : en transit/arrivé + destinationCity (agence de retour)
      if ((p.status === 'Retour en transit' || p.status === 'Retour arrivé') &&
          (p.destinationCity === city || p.returnToCity === city)) return true

      // Historique : finalisé + returnToCity ou createdByCity (agence source)
      if (p.status === 'Retour finalisé' &&
          (p.returnToCity === city || p.createdByCity === city || p.destinationCity === city)) return true

      return false
    })

    callback(filtered)
  }, onError)
}

export function subscribePendingAideAgentParcels(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'parcels'), where('validatedByChef', '==', false))
  return onSnapshot(q, snap => {
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((p: any) => p.agentRole === 'aide_agent' || p.agentRole === 'client_portal')
    callback(sortByCreatedDesc(docs as any[]))
  }, onError)
}
export async function claimParcel(parcelId: any, agentId: any, agentName: any) {
  const ref = doc(db, 'parcels', parcelId)
  let captured: any = null

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')

    const parcel = snap.data()
    if (parcel.destinationAgentId && parcel.destinationAgentId !== agentId) {
      throw new Error(`Colis déjà pris en charge par ${parcel.destinationAgentName || 'un autre agent'}.`)
    }

    captured = parcel
    const now = new Date().toISOString()
    transaction.update(ref, {
      destinationAgentId:     agentId,
      destinationAgentName:   agentName,
      destinationArrivedAt:   parcel.destinationArrivedAt || now,
      status:                 'Arrivé en agence',
      history: arrayUnion({
        status: 'Arrivé en agence',
        timestamp: now,
        note: `Pris en charge par ${agentName}`
      })
    })
  })

  // Auto-create or update a daily arrivage for this city so pointage is always possible
  if (captured) {
    const destinationCity = captured.destinationCity || captured.receiver?.city || ''
    if (destinationCity) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const autoRef = doc(db, 'arrivages', `auto-${destinationCity}-${today}`)
      const nbColis = captured.nbColis || 1
      const detail = {
        parcelId,
        trackingId:    captured.trackingId    || '',
        senderName:    captured.sender?.name  || captured.senderName   || '',
        receiverName:  captured.receiver?.name || captured.receiverName  || '',
        receiverPhone: captured.receiver?.phone || captured.receiverPhone || '',
        weight:        captured.weight         || 0,
        nbColis,
        serviceType:   captured.serviceType   || '',
        originCity:    captured.originCity    || captured.sender?.city || '',
        chauffeurName: captured.chauffeurName || '',
        codAmount:     captured.codAmount     || 0,
        arrived: nbColis,
        total:   nbColis,
        pointed: false,
        addedViaClaimParcel: true,
      }
      try {
        await runTransaction(db, async tx => {
          const snap = await tx.get(autoRef)
          if (!snap.exists()) {
            tx.set(autoRef, {
              arrivageRef:          `ARR-AUTO-${today}`,
              city:                 destinationCity,
              type:                 'auto',
              pointageStatus:       'pending',
              arrivedParcelIds:     [parcelId],
              arrivedColisDetail:   [detail],
              missingParcelIds:     [],
              missingColisDetail:   [],
              colisWithoutBon:      [],
              colisWithoutBonCount: 0,
              agentId,
              agentName,
              createdAt:            serverTimestamp(),
            })
          } else {
            const data = snap.data()
            if (!(data.arrivedParcelIds || []).includes(parcelId)) {
              tx.update(autoRef, {
                arrivedParcelIds:   arrayUnion(parcelId),
                arrivedColisDetail: arrayUnion(detail),
              })
            }
          }
        })
      } catch (_: any) {
        // Non-blocking — pointage arrivage creation is best-effort
      }
    }
  }
}
export async function searchParcelByTrackingId(trackingId: any) {
  const q = query(collection(db, 'parcels'), where('trackingId', '==', trackingId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

// --- RETOUR COLIS ------------------------------------------------------------
export async function createReturnParcel(originalParcel: any, agentId: any, agentName: any) {
  return createParcel({
    sender: {
      name:    originalParcel.receiver?.name    || '',
      tel:     originalParcel.receiver?.tel     || '',
      city:    originalParcel.receiver?.city    || originalParcel.destinationCity || '',
      address: originalParcel.receiver?.address || '',
      nic:     originalParcel.receiver?.nic     || '',
    },
    receiver: {
      name:    originalParcel.sender?.name    || '',
      tel:     originalParcel.sender?.tel     || '',
      city:    originalParcel.sender?.city    || originalParcel.originCity || '',
      address: originalParcel.sender?.address || '',
      nic:     originalParcel.sender?.nic     || '',
    },
    weight:       originalParcel.weight      || 0,
    nbColis:      originalParcel.nbColis     || 1,
    natureOfGoods: originalParcel.natureOfGoods || '',
    serviceType:  'oc',
    customerMode: 'personal',
    price:        0,
    codAmount:    0,
    portType:     'port_paye',
    agentId,
    agentName,
    returnOf:             originalParcel.id,
    returnOfTrackingId:   originalParcel.trackingId,
  })
}

// -- Compteurs en temps réel -----------------------------------------------
export async function getRealParcelsCount() {
  try {
    const [activeSnapshot, archivedSnapshot] = await Promise.all([
      getCountFromServer(collection(db, 'parcels')),
      getCountFromServer(collection(db, 'parcels_archive'))
    ])

    return {
      active: activeSnapshot.data().count,
      archived: archivedSnapshot.data().count,
      total: activeSnapshot.data().count + archivedSnapshot.data().count
    }
  } catch (error) {
    console.error('Erreur comptage colis:', error)
    return { active: 0, archived: 0, total: 0 }
  }
}

export async function getRealParcelsStats() {
  try {
    const statuses = ['Livré', 'Retourné', 'Retour finalisé']
    const [activeSnapshot, ...statusSnapshots] = await Promise.all([
      getCountFromServer(collection(db, 'parcels')),
      ...statuses.map(status =>
        getCountFromServer(query(collection(db, 'parcels'), where('status', '==', status)))
      )
    ])

    const livres = statusSnapshots[0].data().count
    const retournes = statusSnapshots[1].data().count + statusSnapshots[2].data().count
    const active = activeSnapshot.data().count
    const enCours = active - livres - retournes

    return {
      total: active,
      enCours,
      livres,
      retournes
    }
  } catch (error) {
    console.error('Erreur stats colis:', error)
    return { total: 0, enCours: 0, livres: 0, retournes: 0 }
  }
}

// Recherche par N° EXP dans TOUTE la base (pas de limite)
export async function searchParcelByTrackingGlobal(trackingId: string) {
  try {
    const q = query(
      collection(db, 'parcels'),
      where('trackingId', '>=', trackingId.toUpperCase()),
      where('trackingId', '<=', trackingId.toUpperCase() + ''),
      limit(100) // Max 100 résultats pour éviter surcharge
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (error) {
    console.error('Erreur recherche tracking:', error)
    return []
  }
}

// ⚡ Recherche ULTRA-RAPIDE par N° EXP (optimisée avec index Firestore)
export async function searchParcelByNicOptimized(nic: string) {
  try {
    const nicUpper = nic.toUpperCase().trim()
    const startTime = performance.now()

    // 1️⃣ Match EXACT sur senderNic (le plus rapide avec index)
    const exactQuery = query(
      collection(db, 'parcels'),
      where('senderNic', '==', nicUpper),
      limit(1)
    )
    const exactSnap = await getDocs(exactQuery)

    if (!exactSnap.empty) {
      const duration = (performance.now() - startTime).toFixed(0)
      console.log(`⚡ Match exact trouvé en ${duration}ms`)
      return exactSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    }

    // 2️⃣ Si pas de match exact, chercher par préfixe (max 50 résultats)
    const prefixQuery = query(
      collection(db, 'parcels'),
      where('senderNic', '>=', nicUpper),
      where('senderNic', '<', nicUpper + ''),
      orderBy('senderNic'),
      limit(50)
    )
    const prefixSnap = await getDocs(prefixQuery)

    const duration = (performance.now() - startTime).toFixed(0)
    console.log(`⚡ ${prefixSnap.size} résultats trouvés en ${duration}ms`)
    return prefixSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  } catch (error) {
    console.error('❌ Erreur recherche N° EXP:', error)
    return []
  }
}

/**
 * ⚡ Recherche intelligente multi-critères côté serveur
 * Détecte automatiquement le type de recherche et utilise les index optimisés
 */
export async function searchParcels(
  term: string,
  options: {
    dateFrom?: Date
    dateTo?: Date
    limit?: number
  } = {}
): Promise<any[]> {
  console.log('🔍 searchParcels APPELÉ avec terme:', term, 'options:', options)
  try {
    if (!term || term.trim().length === 0) {
      console.log('❌ searchParcels: terme vide')
      return []
    }

    const searchTerm = term.trim()
    const searchLimit = options.limit || 50000  // Chercher dans TOUTE la base
    const startTime = performance.now()
    const parcelsCol = collection(db, 'parcels')
    console.log('📝 Terme normalisé:', searchTerm, 'limite:', searchLimit)

    // 1) Normalisation du terme selon plusieurs formats possibles.
    //    On NE se base PAS sur une classification exclusive (if/else if) :
    //    on lance en parallèle TOUTES les requêtes plausibles puis on fusionne.
    //    Chaque requête est un match EXACT sur un champ indexé (rapide, <100ms).
    const trackingId = searchTerm.toUpperCase().replace(/[\s-]/g, '') // "LMA-123" / "lma 123" -> "LMA123"
    const phone      = searchTerm.replace(/[\s\-\(\)\.]/g, '')         // "06 12 34 56 78" -> "0612345678"
    const nicUpper   = searchTerm.toUpperCase().trim()                 // CIN alphanumérique (ex: "AB123456")
    const nameLower  = searchTerm.toLowerCase().trim()

    // 2) Construire dynamiquement la liste des requêtes candidates
    const candidateQueries: Promise<any>[] = []

    console.log('🔬 Détection:', { trackingId, phone, nicUpper, nameLower })

    // Tracking ID : commence par "LMA"
    if (/^LMA\d*$/.test(trackingId)) {
      console.log('✅ Requête tracking ID:', trackingId)
      candidateQueries.push(getDocs(query(parcelsCol, where('trackingId', '==', trackingId), limit(searchLimit))))
    }
    // Téléphone : au moins 9 chiffres (couvre fixe + mobile)
    if (/^\d{9,}$/.test(phone)) {
      console.log('✅ Requête téléphone:', phone)
      candidateQueries.push(getDocs(query(parcelsCol, where('senderTel', '==', phone), limit(searchLimit))))
      candidateQueries.push(getDocs(query(parcelsCol, where('receiverTel', '==', phone), limit(searchLimit))))
    }
    // NIC / CIN : alphanumérique court (<= 12), et pas un tracking ID
    if (/^[A-Z0-9]{1,12}$/.test(nicUpper) && !/^LMA/.test(nicUpper)) {
      console.log('✅ Requête NIC:', nicUpper)
      candidateQueries.push(getDocs(query(parcelsCol, where('senderNic', '==', nicUpper), limit(searchLimit))))
    }
    // Nom : dès qu'il y a au moins une lettre (évite les recherches inutiles sur du pur numérique)
    if (/[a-zA-Zà-ÿ]/.test(searchTerm)) {
      console.log('✅ Requête nom:', nameLower)
      candidateQueries.push(getDocs(query(parcelsCol, where('senderNameLower', '==', nameLower), limit(searchLimit))))
      candidateQueries.push(getDocs(query(parcelsCol, where('receiverNameLower', '==', nameLower), limit(searchLimit))))
    }
    // Sécurité : si aucun format ne correspond, on tente quand même tracking + nom
    if (candidateQueries.length === 0) {
      console.log('⚠️ Aucun format détecté, requêtes fallback')
      candidateQueries.push(getDocs(query(parcelsCol, where('trackingId', '==', trackingId), limit(searchLimit))))
      candidateQueries.push(getDocs(query(parcelsCol, where('senderNameLower', '==', nameLower), limit(searchLimit))))
    }

    console.log(`🚀 Lancement ${candidateQueries.length} requête(s) en parallèle...`)

    // 3) Exécuter en parallèle + fusionner + dédupliquer
    const snapshots = await Promise.all(candidateQueries)
    console.log(`📊 Résultats par requête:`)
    snapshots.forEach((snap, idx) => {
      console.log(`   Requête ${idx + 1}: ${snap.docs.length} résultats`)
    })

    const uniqueIds = new Set<string>()
    let results: any[] = []
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        if (uniqueIds.has(d.id)) continue
        uniqueIds.add(d.id)
        const data = d.data()
        console.log(`   ✅ Trouvé: ${data.trackingId}, senderNic="${data.senderNic}"`)
        results.push({ id: d.id, ...data })
      }
    }

    // 6️⃣ Filtrer par date si spécifié
    if (options.dateFrom || options.dateTo) {
      results = results.filter(p => {
        const pDate = p.createdAt?.toDate?.() || new Date(p.createdAt)
        if (options.dateFrom && pDate < options.dateFrom) return false
        if (options.dateTo && pDate > options.dateTo) return false
        return true
      })
    }

    const duration = (performance.now() - startTime).toFixed(0)
    console.log(`⚡ searchParcels: ${results.length} résultats en ${duration}ms`)

    return results.slice(0, searchLimit)

  } catch (error) {
    console.error('❌ Erreur searchParcels:', error)
    return []
  }
}

// -- Règlements (Pointeur-Encaisseur) -------------------------------------