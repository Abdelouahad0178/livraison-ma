
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField, documentId
} from 'firebase/firestore'
import type { Query, DocumentData } from 'firebase/firestore'
import { db } from './db'
import type { Parcel } from '../types'
import {
  CITIES, STATUSES, COD_PAYMENT_TYPES, COD_STATUS, STATUS_COLORS, CAISSE_CATEGORIES, codPaymentTypeOf,
  normalizeServiceType, codPaymentTypeForService, sanitizeParcelCodWrite, NON_COD_SERVICE_TYPES,
} from './constants'
import { daysAgoTimestamp, sortByCreatedDesc } from './firestoreUtils'
import { codPartView, isMixedCod } from '../utils/codParts'
import { getOperationalDayString } from '../config/operationalDay'
import { buildDaySlices, opDayOf } from '../utils/daySlices'
import { addPayment } from './clients'
import { bumpPresence } from '../services/presenceCounters'
import { normName, isVisibleInDestinationAgency } from '../utils/billingAgency'

export const FIRESTORE_PAGE_LIMITS = {
  adminLiveParcels: 300,  // ⚡ OPTIMISATION : Réduit de 10000 à 300 pour chargement rapide
  adminNextParcels: 200,   // ⚡ Pages suivantes réduites aussi
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

/**
 * 📅 Calcule la date de travail (workDate) basée sur la date de création
 * Système classique: 00h00 à 23h59 (jour calendaire)
 * Exemples:
 *   - 21/07 à 00h → workDate = 21/07
 *   - 21/07 à 10h → workDate = 21/07
 *   - 21/07 à 23h → workDate = 21/07
 */
function calculateWorkDate(timestamp?: Date | string): string {
  // ⚠️ Une chaîne "date seule" (ex: '2026-09-09', sans 'T...') est interprétée par JS comme
  // minuit UTC — soit 1h du matin au Maroc (UTC+1), ce qui la fait basculer à tort sur la
  // VEILLE une fois passée dans la règle 8h→6h ci-dessous. On l'ancre donc à midi local.
  const normalized = typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)
    ? `${timestamp}T12:00:00`
    : timestamp
  const date = normalized ? new Date(normalized) : new Date()
  // 🗓️ workDate suit la JOURNÉE D'OPÉRATION du système (8h → 6h le lendemain), pas le jour
  // calendaire : une expédition saisie à 2h du matin appartient encore à la journée qui a
  // commencé à 8h la veille, pas à la nouvelle journée civile qui vient de commencer à minuit.
  // getOperationalDayString (config/operationalDay.ts) applique cette même règle partout
  // ailleurs dans l'application (filtres "Aujourd'hui", "Journée d'opération", etc.) — on
  // s'appuie sur elle ici pour que workDate soit cohérent avec ces filtres dès la création.
  // (Elle ancre l'heure à 8h avant de convertir en UTC, donc pas de risque de décalage de jour
  // lié au fuseau horaire, contrairement à un simple .toISOString() à l'heure de création.)
  return getOperationalDayString(date)
}

// Règle partagée (utils/billingAgency) : même périmètre pour Chef d'agence et Admin « Port par Agence ».
export function isParcelVisibleInDestinationAgency(parcel: Partial<Parcel> = {}) {
  return isVisibleInDestinationAgency(parcel)
}

// ── 🪶 Version allégée des expéditions (collection parcelsLite) ──────────────────────────────
// parcelsLite/{id} = miroir de parcels/{id} SANS les champs lourds / d'audit (historique, champs de
// recherche serveur, traçabilité…), tenu à jour par la Cloud Function syncParcelLite (liste
// d'exclusion : functions/parcelLite.js). Les listes / filtres / totaux de l'onglet Expéditions
// (chef d'agence, agent pro) le lisent ; le document COMPLET reste dans 'parcels' et est relu à
// l'ouverture d'un colis (modification, historique, impression…) via ensureFullParcel(s).
// Les écritures vont toujours dans 'parcels' (jamais dans parcelsLite : règles = lecture seule).
export const PARCELS_LITE_COLLECTION = 'parcelsLite'
const parcelsSource = (lite?: boolean) => collection(db, lite ? PARCELS_LITE_COLLECTION : 'parcels')

/** true si l'objet vient de parcelsLite (tout colis complet porte un tableau history). */
export function isLiteParcel(p: any): boolean {
  return !!p && typeof p === 'object' && !!p.id && !Array.isArray(p.history)
}

/** Document COMPLET d'un colis (relu dans 'parcels' si l'objet est la version allégée). */
export async function ensureFullParcel<T = any>(p: T): Promise<T> {
  const anyP: any = p
  if (!isLiteParcel(anyP)) return p
  try {
    const snap = await getDoc(doc(db, 'parcels', anyP.id))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as any) : p
  } catch (err) {
    console.warn('ensureFullParcel:', err)
    return p
  }
}

/** Documents COMPLETS d'une liste de colis (lecture par lots de 30 identifiants), ordre conservé. */
export async function ensureFullParcels(list: any[]): Promise<any[]> {
  const items = Array.isArray(list) ? list : []
  const ids = [...new Set(items.filter(isLiteParcel).map((p: any) => p.id as string))]
  if (ids.length === 0) return items
  const full = new Map<string, any>()
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  try {
    // 10 lots en parallèle au plus
    for (let i = 0; i < chunks.length; i += 10) {
      const snaps = await Promise.all(chunks.slice(i, i + 10).map(c =>
        getDocs(query(collection(db, 'parcels'), where(documentId(), 'in', c)))))
      snaps.forEach(s => s.docs.forEach(d => full.set(d.id, { id: d.id, ...d.data() })))
    }
  } catch (err) {
    console.warn('ensureFullParcels:', err)
  }
  return items.map((p: any) => (p && full.has(p.id) ? full.get(p.id) : p))
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
  // ⚠️ VALIDATION DÉSACTIVÉE : Les saisies des aides agents et portail client ne nécessitent plus de validation par le chef
  const requiresChefValidation = false  // Était: data.agentRole === 'aide_agent' || data.agentRole === 'client_portal'
  const sender = data.sender as Record<string, unknown>
  const receiver = data.receiver as Record<string, unknown>
  const isLocalDelivery = sameText(sender?.city, receiver?.city)
  const hasLocalDeliveryDriver = !!data.deliveryDriverId && isLocalDelivery && !data.chauffeurId

  // Agent PRO : expédition arrive directement en agence de destination
  const isAgentProDirectShipment = data.agentRole === 'agentpro' && !isLocalDelivery && !data.chauffeurId

  const initialStatus = data.chauffeurId
    ? 'En transit'
    : (hasLocalDeliveryDriver ? 'En cours de livraison'
      : (isAgentProDirectShipment ? 'Arrivé en agence' : 'Initialisé'))
  // 🔒 UN SEUL type de retour de fonds par expédition (jamais 'traite,cheque')
  const serviceType   = normalizeServiceType(data.serviceType) || 'oc'
  let codAmountNum    = parseFloat(data.codAmount as string) || 0
  if (codAmountNum > 0 && NON_COD_SERVICE_TYPES.includes(serviceType)) {
    console.warn(`[createParcel] montant RETOUR FOND ${codAmountNum} ignoré : service "${serviceType}" sans retour de fonds`)
    codAmountNum = 0
  }
  // 💵+📋 RF MIXTE : data.codAmount = TOTAL, data.codCashAmount = part espèces (serviceType chèque/traite)
  let codCashNum      = data.codMixed === true ? (parseFloat(data.codCashAmount as string) || 0) : 0
  if (codCashNum > 0 && (!['cheque', 'traite'].includes(codPaymentTypeForService(serviceType)) || codCashNum >= codAmountNum)) {
    console.warn(`[createParcel] RF mixte invalide (service "${serviceType}", espèces ${codCashNum}, total ${codAmountNum}) → part espèces ignorée`)
    codCashNum = 0
  }
  const codMixed      = codCashNum > 0
  const hasCod        = codAmountNum > 0
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
    serviceType,
    customerMode:         data.customerMode  || (data.clientId ? 'client' : 'personal'),
    price:                data.price !== undefined && data.price !== null
      ? (parseFloat(data.price as string) || 0)
      : 0,
    codAmount:            codAmountNum,
    // RF mixte uniquement (sinon champs absents : colis identique à l'existant)
    ...(codMixed ? { codMixed: true, codCashAmount: codCashNum } : {}),
    status:               initialStatus,
    history: [{
      status: initialStatus,
      timestamp: historyTs,
      note: data.chauffeurId
        ? `Colis enregistré et remis à ${data.chauffeurName || 'chauffeur de transport'}`
        : hasLocalDeliveryDriver
          ? `Colis enregistré et assigné au livreur ${data.deliveryDriverName || 'de livraison locale'}`
          : isAgentProDirectShipment
            ? `Colis arrivé directement à l'agence de ${receiver.city}`
            : 'Colis enregistré en agence'
    }],
    photoUrl:             '',
    createdAt:            opDate,
    // ⚠️ 'T12:00:00' obligatoire : new Date('2026-09-09') (date seule) est interprété comme
    // minuit UTC = 1h locale au Maroc, ce qui bascule à tort le colis sur la VEILLE une fois
    // passé dans la règle 8h→6h (voir calculateWorkDate). Même ancrage midi que opDate/historyTs
    // ci-dessus, sinon workDate se retrouvait décalé d'un jour par rapport à createdAt.
    workDate:             calculateWorkDate(
      data.operationDate ? `${data.operationDate}T12:00:00` : historyTs
    ), // 📅 Date de travail (gère sessions de nuit)
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
    destinationArrivedAt: isAgentProDirectShipment ? historyTs : null,
    visibleInDestinationAgency: !!data.chauffeurId || hasLocalDeliveryDriver || isAgentProDirectShipment,
    destinationAgentId:   hasLocalDeliveryDriver ? (data.agentId || null) : null,
    destinationAgentName: hasLocalDeliveryDriver ? (data.agentName || null) : null,
    deliveryAssignedAt:   hasLocalDeliveryDriver ? historyTs : null,
    deliveryAssignedBy:   hasLocalDeliveryDriver ? (data.agentName || '') : '',
    deliveryMethod:       data.deliveryMethod || 'domicile',  // 🚉 Mode de livraison (gare ou domicile)
    codStatus:            hasCod ? 'pending' : null,
    // Mode de paiement COD normalisé (especes, cheque, traite, bon_livraison) — jamais une liste 'cheque,traite'
    // Toujours dérivé du serviceType (serviceType fait foi) : jamais 'cheque' pour un colis C/Espèces
    codPaymentType:       hasCod ? (codPaymentTypeForService(serviceType) || codPaymentTypeOf({ serviceType, codPaymentType: data.codPaymentType }) || 'especes') : null,
    codCollectedAt:       null,
    codCollectedBy:       null,
    codRemisAt:           null,
    codRemisBy:           null,
    portType:             data.portType   || 'port_paye',
    portStatus:           (data.portType === 'port_paye' || !data.portType) ? 'collected' : null,  // Port payé = déjà collecté au ramassage
    portCollectedAt:      (data.portType === 'port_paye' || !data.portType) ? historyTs : null,
    portCollectedBy:      (data.portType === 'port_paye' || !data.portType) ? (data.agentName || '') : null,
    portCollectedById:    (data.portType === 'port_paye' || !data.portType) ? (data.agentId || null) : null,
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
    // 🔍 Noms normalisés (sans accents : COPÏMA = COPIMA) pour la recherche serveur
    senderNameNorm:       normName(sender?.name),
    receiverNameNorm:     normName(receiver?.name),
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
  bumpPresence('created')
  return { id: ref.id, ...parcel, receiverClientId }
}

// Mise à jour de statut — non bloquant sur la géolocalisation
export async function updateParcelStatus(parcelId: string, status: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const parcelRef = doc(db, 'parcels', parcelId)

  // Créer historyEntry avant la transaction pour qu'il soit accessible après
  // ⚠️ IMPORTANT: Filtrer deleteField() car il ne peut pas être dans arrayUnion()
  const historyEntry: Record<string, any> = {
    status,
    timestamp: new Date().toISOString(),
  }
  // Copier seulement les valeurs qui ne sont pas deleteField()
  Object.keys(extra).forEach(key => {
    const value = extra[key]
    // deleteField() retourne un objet spécial, pas une valeur normale
    if (value && typeof value === 'object' && '_methodName' in value) {
      // C'est un deleteField(), on ne l'ajoute PAS à l'historique
      return
    }
    historyEntry[key] = value
  })

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
    if (status === 'Livré') {
      patch.deliveredAt = extra.deliveredAt || new Date().toISOString()
    }

    // Écriture Firestore immédiate — pas d'attente GPS
    tx.update(parcelRef, patch)
  })
  bumpPresence('updated')

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

  // Émettre un événement pour synchronisation temps réel entre les pages
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: { parcelId, data: { status, ...extra }, timestamp: new Date().toISOString() }
    }))
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
/** Champs dénormalisés de recherche (mêmes règles de normalisation que createParcel). */
export function parcelSearchFields(sender?: any, receiver?: any): Record<string, string> {
  const out: Record<string, string> = {}
  if (sender) {
    out.senderNic       = sender.nic ? String(sender.nic).trim().toUpperCase() : ''
    out.senderTel       = sender.tel ? String(sender.tel).replace(/[\s\-\(\)\.]/g, '') : ''
    out.senderNameLower = sender.name ? String(sender.name).toLowerCase().trim() : ''
    out.senderNameNorm  = normName(sender.name)
  }
  if (receiver) {
    out.receiverTel       = receiver.tel ? String(receiver.tel).replace(/[\s\-\(\)\.]/g, '') : ''
    out.receiverNameLower = receiver.name ? String(receiver.name).toLowerCase().trim() : ''
    out.receiverNameNorm  = normName(receiver.name)
  }
  return out
}

/**
 * Construit le patch Firestore d'une correction de bon (modal "Modifier l'expédition"
 * et modal de confirmation après saisie). Ne contient QUE les champs réellement modifiés,
 * afin de rester dans la liste autorisée par firestore.rules (parcelBonEditFields).
 */
export function buildParcelCorrectionPatch(
  parcel: any,
  next: {
    sender?: any, receiver?: any, weight?: any, nbColis?: any, natureOfGoods?: any,
    serviceType?: any, price?: any, codAmount?: any, portType?: any, fragile?: any, notes?: any,
    /** RF mixte : codAmount = TOTAL, codCashAmount = part espèces, codMixed = true (undefined = inchangé). */
    codMixed?: boolean, codCashAmount?: any,
  },
  modifier?: { uid?: string | null, name?: string }
): Record<string, any> {
  const patch: Record<string, any> = {}
  const txt = (v: any) => String(v ?? '').trim()
  const num = (v: any) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const changedObj = (a: any, b: any, keys: string[]) => keys.some(k => txt(a?.[k]) !== txt(b?.[k]))

  if (next.sender && changedObj(parcel.sender, next.sender, ['name', 'nic', 'address', 'tel', 'city'])) {
    patch.sender = { ...(parcel.sender || {}), ...next.sender }
  }
  if (next.receiver && changedObj(parcel.receiver, next.receiver, ['name', 'address', 'tel', 'city'])) {
    patch.receiver = { ...(parcel.receiver || {}), ...next.receiver }
    if (txt(next.receiver.city) && txt(next.receiver.city) !== txt(parcel.destinationCity)) patch.destinationCity = next.receiver.city
  }
  Object.assign(patch, parcelSearchFields(patch.sender, patch.receiver))

  if (next.weight !== undefined && num(parcel.weight) !== num(next.weight)) patch.weight = num(next.weight)
  if (next.nbColis !== undefined) {
    const nb = parseInt(String(next.nbColis)) || 1
    if ((parseInt(String(parcel.nbColis)) || 1) !== nb) patch.nbColis = nb
  }
  if (next.natureOfGoods !== undefined && txt(parcel.natureOfGoods) !== txt(next.natureOfGoods)) patch.natureOfGoods = txt(next.natureOfGoods)
  if (next.price !== undefined && num(parcel.price) !== num(next.price)) patch.price = num(next.price)

  // serviceType : UNE seule valeur. Un ancien colis 'traite,cheque' est ramené au premier type.
  const rawOldService = parcel.serviceType || 'oc'
  const oldService = normalizeServiceType(rawOldService) || 'oc'
  const newService = next.serviceType !== undefined ? (normalizeServiceType(next.serviceType) || 'oc') : oldService
  if (newService !== rawOldService) {
    patch.serviceType = newService
    const wasCOD = ['especes', 'cheque', 'traite', 'retour_bl'].includes(oldService)
    if (wasCOD && newService === 'simple' && modifier) {
      patch.lastModifiedBy     = modifier.uid || null
      patch.lastModifiedByName = modifier.name || 'Utilisateur'
      patch.lastModifiedAt     = new Date().toISOString()
    }
  }

  // Montant COD : Simple / Retour BL => 0. Garder codStatus / codPaymentType cohérents.
  let newCod = next.codAmount !== undefined ? num(next.codAmount) : num(parcel.codAmount)
  if (NON_COD_SERVICE_TYPES.includes(newService)) newCod = 0
  const oldCod = num(parcel.codAmount)
  if (newCod !== oldCod) {
    patch.codAmount = newCod
    patch.codAmountHistory = [
      ...(Array.isArray(parcel.codAmountHistory) ? parcel.codAmountHistory : []),
      { oldAmount: oldCod, newAmount: newCod, changedAt: new Date().toISOString(), changedBy: modifier?.name || 'Agent' },
    ]
    if (newCod > 0 && !parcel.codStatus) patch.codStatus = 'pending'
    if (newCod === 0 && parcel.codStatus === 'pending') patch.codStatus = null
  }
  // 💵+📋 RF MIXTE (Espèces + un chèque OU une traite) : codCashAmount = part espèces,
  // codAmount = total. Passer à un type unique (ou à Espèces seul) efface la part espèces.
  const oldMixed = parcel.codMixed === true
  const oldCash = num(parcel.codCashAmount)
  let newMixed = next.codMixed !== undefined ? next.codMixed === true : oldMixed
  let newCash = next.codCashAmount !== undefined ? num(next.codCashAmount) : oldCash
  if (!['cheque', 'traite'].includes(codPaymentTypeForService(newService)) || newCod <= 0 || newCash <= 0 || newCash >= newCod) {
    newMixed = false
  }
  if (!newMixed) newCash = 0
  if (newMixed !== oldMixed || (newMixed && newCash !== oldCash)) {
    patch.codMixed = newMixed
    patch.codCashAmount = newCash
  }
  // COD pas encore encaissé : seul cas où firestore.rules autorise codStatus / codPaymentType
  const codNotCollected = !parcel.codCollectedAt && (!parcel.codStatus || parcel.codStatus === 'pending')
  const expectedCpt = codPaymentTypeForService(newService)
    || codPaymentTypeOf({ serviceType: newService, codPaymentType: parcel.codPaymentType }) || 'especes'
  if (newCod > 0 && (patch.codAmount !== undefined || patch.serviceType !== undefined)) {
    if (expectedCpt !== parcel.codPaymentType) patch.codPaymentType = expectedCpt
    if (!parcel.codStatus && codNotCollected) patch.codStatus = 'pending'
  } else if (newCod > 0 && codNotCollected && expectedCpt !== parcel.codPaymentType
    && (next.serviceType !== undefined || next.codAmount !== undefined)) {
    // Réaligne un colis incohérent (ex: C/Chèque enregistré avec codPaymentType 'especes')
    // quand l'appelant touche à la partie RETOUR FOND (type ou montant).
    patch.codPaymentType = expectedCpt
    if (!parcel.codStatus) patch.codStatus = 'pending'
  } else if (newCod === 0 && (patch.codAmount !== undefined || patch.serviceType !== undefined)
    && parcel.codPaymentType && codNotCollected) {
    patch.codPaymentType = null
    if (parcel.codStatus === 'pending') patch.codStatus = null
  }

  if (next.portType !== undefined && next.portType && next.portType !== (parcel.portType || '')) patch.portType = next.portType
  if (next.fragile !== undefined && !!next.fragile !== !!parcel.fragile) patch.fragile = !!next.fragile
  if (next.notes !== undefined && txt(next.notes) !== txt(parcel.notes)) patch.notes = txt(next.notes)

  return patch
}

/** Message clair (FR) pour un refus d'enregistrement d'une correction de colis. */
export function describeParcelSaveError(err: any, parcel?: any): string {
  if (err?.code === 'permission-denied') {
    if (parcel?.shipmentLoadedAt) {
      return "Modification refusée : ce colis a déjà été chargé dans un camion. Seul l'administrateur peut encore le modifier."
    }
    if (parcel?.status === 'Livré' || parcel?.status === LEGACY_DELIVERED_STATUS) {
      return "Modification refusée : ce colis est déjà livré. Seul le chef d'agence ou l'administrateur peut le corriger."
    }
    if (parcel?.codCollectedAt) {
      return "Modification refusée : le retour de fond (COD) de ce colis a déjà été encaissé, son montant ne peut plus être changé."
    }
    return "Modification refusée par le serveur : votre rôle ne permet pas de modifier ces champs sur ce colis. Aucune modification n'a été enregistrée."
  }
  return `Erreur lors de l'enregistrement : ${err?.message || err}. Aucune modification n'a été enregistrée.`
}

export async function updateParcel(parcelId: string, data: Partial<Parcel> & Record<string, unknown>): Promise<void> {
  // 🔒 Garde-fou : jamais de serviceType multiple ni de codPaymentType contradictoire
  sanitizeParcelCodWrite(data as Record<string, any>)
  await updateDoc(doc(db, 'parcels', parcelId), data)
  bumpPresence('updated')
  // La mise à jour du colis est déjà enregistrée : un échec de synchro des arrivages
  // (droits, réseau) ne doit pas faire croire à l'utilisateur que sa correction a échoué.
  try {
    await syncParcelSnapshotInArrivages(parcelId, data)
  } catch (err) {
    console.warn('syncParcelSnapshotInArrivages:', err)
  }

  // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate entre les pages/onglets
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates: data,
        timestamp: new Date().toISOString(),
        source: 'database' // Écriture directe dans Firestore
      }
    }))
  }
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

  // 📸 État AVANT le retour, pour pouvoir l'annuler exactement (cancelParcelReturn)
  const keep = (v: any) => (v === undefined ? null : v)
  const preReturn = {
    status: keep(parcel.status), sender: keep(parcel.sender), receiver: keep(parcel.receiver),
    originCity: keep(parcel.originCity), destinationCity: keep(parcel.destinationCity),
    returnToCity: keep(parcel.returnToCity), codAmount: keep(parcel.codAmount),
    codMixed: keep(parcel.codMixed), codCashAmount: keep(parcel.codCashAmount),
    arrivedNbColis: keep(parcel.arrivedNbColis),
    deliveryDriverId: keep(parcel.deliveryDriverId), deliveryDriverName: keep(parcel.deliveryDriverName),
    deliverySectorId: keep(parcel.deliverySectorId), deliverySectorCode: keep(parcel.deliverySectorCode),
    deliverySectorName: keep(parcel.deliverySectorName), deliveryVehicleId: keep(parcel.deliveryVehicleId),
    deliveryVehicleLabel: keep(parcel.deliveryVehicleLabel), deliveryAssignedAt: keep(parcel.deliveryAssignedAt),
    deliveryAssignedBy: keep(parcel.deliveryAssignedBy),
  }

  const updates = {
    status:          'Retourné',
    preReturn,
    sender:          newSender,
    receiver:        newReceiver,
    // 🔍 Garder les noms normalisés cohérents avec l'échange expéditeur/destinataire
    senderNameNorm:   normName(newSender.name),
    receiverNameNorm: normName(newReceiver.name),
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
  }

  await updateDoc(doc(db, 'parcels', parcel.id), updates)

  // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId: parcel.id,
        updates,
        timestamp: now,
        source: 'database'
      }
    }))
  }
}

// ↩️ ANNULER un retour (erreur de saisie) : remet le colis exactement dans son état d'avant le
// retour (snapshot preReturn). Ancien colis sans snapshot : ré-échange expéditeur/destinataire et
// villes, statut = dernier statut avant « Retourné » dans l'historique (le montant RF remis à 0 au
// retour ne peut alors pas être restauré automatiquement → signalé à l'utilisateur).
export async function cancelParcelReturn(parcel: any, by = ''): Promise<{ codRestored: boolean }> {
  const now = new Date().toISOString()
  const snap = parcel.preReturn
  const RETURN_STATUSES = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
  let updates: Record<string, any>
  let codRestored = true
  if (snap) {
    updates = { ...snap }
    if (!updates.status || RETURN_STATUSES.includes(updates.status)) updates.status = 'Arrivé en agence'
  } else {
    const hist = Array.isArray(parcel.history) ? parcel.history : []
    const idx = hist.map((h: any) => h?.status).lastIndexOf('Retourné')
    const before = idx > 0 ? hist.slice(0, idx).reverse().find((h: any) => h?.status && !RETURN_STATUSES.includes(h.status)) : null
    updates = {
      status: before?.status || 'Arrivé en agence',
      sender: parcel.receiver || {}, receiver: parcel.sender || {},
      originCity: parcel.destinationCity || '', destinationCity: parcel.originCity || '',
      returnToCity: null,
    }
    codRestored = false
  }
  const s: any = updates.sender || {}, r: any = updates.receiver || {}
  Object.assign(updates, {
    senderNameNorm: normName(s.name), receiverNameNorm: normName(r.name),
    wasReturned: false, preReturn: null, returnedAt: null, returnReason: null,
    returnedByDriverId: null, returnedByDriverName: null,
    returnCancelledAt: now, returnCancelledBy: by || null,
    history: arrayUnion({ status: updates.status, timestamp: now, note: `Retour annulé${by ? ` par ${by}` : ''}` }),
  })
  await updateDoc(doc(db, 'parcels', parcel.id), updates)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', { detail: { parcelId: parcel.id, updates, timestamp: now, source: 'database' } }))
  }
  return { codRestored }
}

// Chargement d'un colis retourné sur camion inter-villes vers la ville de l'expéditeur.
// Si le swap n'a pas encore été effectué (ancien colis), il est réalisé ici.
export async function loadReturnedParcelOnTruck(parcel: any) {
  const now = new Date().toISOString()
  const hasBeenSwapped = !!parcel.returnToCity

  const updates = {
    status: 'Retour en transit',
    returnShippedAt: now,
    history: arrayUnion({
      status: 'Retour en transit',
      timestamp: now,
      note: 'Chargé sur camion pour retour vers agence source',
    }),
  }

  // Modifier le statut pour marquer le colis comme en transit retour
  await updateDoc(doc(db, 'parcels', parcel.id), updates)

  // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId: parcel.id,
        updates,
        timestamp: now,
        source: 'database'
      }
    }))
  }
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

  // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates: patch,
        timestamp: now,
        source: 'database'
      }
    }))
  }

  if (parcel.agentRole === 'client_portal' && parcel.portType === 'port_en_compte_expediteur' && parcel.clientId && (parseFloat(parcel.price) || 0) > 0 && parcel.portalDebitCreated !== true) {
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

    // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('parcelUpdated', {
        detail: {
          parcelId: parcel.id,
          updates: updateData,
          timestamp: now,
          source: 'database'
        }
      }))
    }
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

// Récupérer TOUTES les archives (pour Encaisseur Central)
export async function getAllArchivedParcels(maxResults = 1000) {
  const q = query(collection(db, 'parcels_archive'), orderBy('createdAt', 'desc'), limit(maxResults))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
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
export function subscribeAllParcels(callback: any, onError: (err?: any) => void = () => {}, days = 0, pageSize = FIRESTORE_PAGE_LIMITS.adminLiveParcels, lite = false) {
  // Version ORIGINALE simplifiée - celle qui marchait avant
  // 🪶 lite : lecture de parcelsLite (onglet Expéditions agent pro « Toutes les villes »)
  const q = query(
    parcelsSource(lite),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  )

  // includeMetadataChanges: true — sinon Firestore ne redéclenche pas de callback quand le
  // cache contenait déjà les mêmes documents que le serveur, et fromCache resterait bloqué à
  // true à tort (même piège que subscribeAgencyParcels).
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const lastSnap = snap.docs[snap.docs.length - 1] || null
    callback(docs, lastSnap, snap.metadata.fromCache)
  }, onError)
}

// ⚡ VERSION OPTIMISÉE avec filtre de date au niveau Firestore
// Priorité au filtre de date pour éviter de charger toutes les dates
export function subscribeAllParcelsWithDateFilter(
  callback: any,
  onError: (err?: any) => void = () => {},
  options: {
    pageSize?: number
    dateFrom?: Date | null  // Date de début (inclusive)
    dateTo?: Date | null    // Date de fin (inclusive)
    lite?: boolean          // 🪶 lire parcelsLite (version allégée) au lieu de parcels
  } = {}
) {
  const {
    pageSize = FIRESTORE_PAGE_LIMITS.adminLiveParcels,
    dateFrom = null,
    dateTo = null,
    lite = false,
  } = options

  // Construction de la requête avec filtres de date
  const queryConstraints: any[] = []

  // ⚡ FILTRE DE DATE PRIORITAIRE: appliqué au niveau Firestore, pas en mémoire
  if (dateFrom) {
    queryConstraints.push(where('createdAt', '>=', Timestamp.fromDate(dateFrom)))
  }
  if (dateTo) {
    // Ajouter 1 jour pour inclure toute la journée
    const endOfDay = new Date(dateTo)
    endOfDay.setHours(23, 59, 59, 999)
    queryConstraints.push(where('createdAt', '<=', Timestamp.fromDate(endOfDay)))
  }

  // Toujours trier et limiter
  queryConstraints.push(orderBy('createdAt', 'desc'))
  queryConstraints.push(limit(pageSize))

  const q = query(parcelsSource(lite), ...queryConstraints)

  console.log(`⚡ Firestore query optimisée avec filtres:`, {
    dateFrom: dateFrom?.toLocaleDateString('fr-MA'),
    dateTo: dateTo?.toLocaleDateString('fr-MA'),
    pageSize,
  })

  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const lastSnap = snap.docs[snap.docs.length - 1] || null
    callback(docs, lastSnap, snap.metadata.fromCache)
  }, onError)
}

// 📄 Charger plus de colis avec filtre de date (pagination)
export async function loadMoreParcelsWithDateFilter(
  lastDoc: any,
  options: {
    pageSize?: number
    dateFrom?: Date | null
    dateTo?: Date | null
    lite?: boolean // 🪶 parcelsLite — doit correspondre à la collection du curseur lastDoc
  } = {}
) {
  const {
    pageSize = 1000,
    dateFrom = null,
    dateTo = null,
    lite = false,
  } = options

  if (!lastDoc) {
    return { docs: [], lastSnap: null, hasMore: false }
  }

  try {
    const queryConstraints: any[] = []

    if (dateFrom) {
      queryConstraints.push(where('createdAt', '>=', Timestamp.fromDate(dateFrom)))
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo)
      endOfDay.setHours(23, 59, 59, 999)
      queryConstraints.push(where('createdAt', '<=', Timestamp.fromDate(endOfDay)))
    }

    queryConstraints.push(orderBy('createdAt', 'desc'))
    queryConstraints.push(startAfter(lastDoc))
    queryConstraints.push(limit(pageSize))

    const q = query(parcelsSource(lite), ...queryConstraints)
    const snap = await getDocs(q)

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const lastSnap = snap.docs[snap.docs.length - 1] || null
    const hasMore = docs.length >= pageSize

    console.log(`📄 [loadMoreParcelsWithDateFilter] ${docs.length} colis supplémentaires chargés`)

    return { docs, lastSnap, hasMore }
  } catch (error) {
    console.error('loadMoreParcelsWithDateFilter error:', error)
    return { docs: [], lastSnap: null, hasMore: false }
  }
}

// 🚀 SYSTÈME DE CHARGEMENT PROGRESSIF ET INTELLIGENT
// Charge initialement un petit lot, puis continue automatiquement en arrière-plan
export function subscribeAllParcelsWithArchives(callback: any, onError: (err?: any) => void = () => {}, initialPageSize = 1000) {
  let parcelsData: any[] = []
  let archivesData: any[] = []
  let parcelsLastSnap: any = null
  let archivesLastSnap: any = null
  let isLoadingMore = false

  const mergeAndCallback = () => {
    // Fusionner les deux listes et dédupliquer par ID
    // Si une expédition existe dans les deux collections, on garde celle de parcels (plus récente)
    const seenIds = new Set<string>()
    const allDocs: any[] = []

    // D'abord les parcels (prioritaires)
    for (const doc of parcelsData) {
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id)
        allDocs.push(doc)
      }
    }

    // Puis les archives (seulement si pas déjà dans parcels)
    for (const doc of archivesData) {
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id)
        allDocs.push(doc)
      }
    }

    // Trier par date décroissante (optimisé avec cache des timestamps)
    const docsWithTime = allDocs.map(doc => ({
      doc,
      time: doc.createdAt?.toMillis?.() || 0
    }))
    docsWithTime.sort((a, b) => b.time - a.time)
    const sortedDocs = docsWithTime.map(item => item.doc)

    // Retourner les documents triés avec info de pagination
    callback({
      docs: sortedDocs,
      parcelsLastSnap,
      archivesLastSnap,
      totalLoaded: sortedDocs.length,
      canLoadMore: !!(parcelsLastSnap || archivesLastSnap)
    })
  }

  // Chargement initial réduit pour démarrage rapide
  const qParcels = query(
    collection(db, 'parcels'),
    orderBy('createdAt', 'desc'),
    limit(initialPageSize)
  )

  const qArchives = query(
    collection(db, 'parcels_archive'),
    orderBy('createdAt', 'desc'),
    limit(initialPageSize)
  )

  const unsubParcels = onSnapshot(qParcels, snap => {
    parcelsData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    parcelsLastSnap = snap.docs.length === initialPageSize ? snap.docs[snap.docs.length - 1] : null
    mergeAndCallback()
  }, onError)

  const unsubArchives = onSnapshot(qArchives, snap => {
    archivesData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    archivesLastSnap = snap.docs.length === initialPageSize ? snap.docs[snap.docs.length - 1] : null
    mergeAndCallback()
  }, onError)

  return () => {
    unsubParcels()
    unsubArchives()
  }
}

// Charge le lot suivant (appelé manuellement ou par infinite scroll)
export async function loadMoreParcelsWithArchives(
  parcelsLastSnap: any,
  archivesLastSnap: any,
  currentDocs: any[],
  batchSize = 1000
) {
  const promises: Promise<any>[] = []

  // Charger depuis parcels si on a encore des données
  if (parcelsLastSnap) {
    const qParcels = query(
      collection(db, 'parcels'),
      orderBy('createdAt', 'desc'),
      startAfter(parcelsLastSnap),
      limit(batchSize)
    )
    promises.push(getDocs(qParcels))
  } else {
    promises.push(Promise.resolve({ docs: [] }))
  }

  // Charger depuis archives si on a encore des données
  if (archivesLastSnap) {
    const qArchives = query(
      collection(db, 'parcels_archive'),
      orderBy('createdAt', 'desc'),
      startAfter(archivesLastSnap),
      limit(batchSize)
    )
    promises.push(getDocs(qArchives))
  } else {
    promises.push(Promise.resolve({ docs: [] }))
  }

  const [snapParcels, snapArchives] = await Promise.all(promises)

  // Fusionner avec les docs existants
  const newParcels = snapParcels.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  const newArchives = snapArchives.docs.map((d: any) => ({ id: d.id, ...d.data() }))

  // Créer un Map pour éviter les doublons
  const docsMap = new Map()
  currentDocs.forEach(doc => docsMap.set(doc.id, doc))
  newParcels.forEach(doc => docsMap.set(doc.id, doc))
  newArchives.forEach(doc => docsMap.set(doc.id, doc))

  const allDocs = Array.from(docsMap.values())

  // Trier
  const docsWithTime = allDocs.map(doc => ({
    doc,
    time: doc.createdAt?.toMillis?.() || 0
  }))
  docsWithTime.sort((a, b) => b.time - a.time)
  const sortedDocs = docsWithTime.map(item => item.doc)

  // Nouveaux curseurs
  const newParcelsLastSnap = snapParcels.docs.length === batchSize
    ? snapParcels.docs[snapParcels.docs.length - 1]
    : null
  const newArchivesLastSnap = snapArchives.docs.length === batchSize
    ? snapArchives.docs[snapArchives.docs.length - 1]
    : null

  return {
    docs: sortedDocs,
    parcelsLastSnap: newParcelsLastSnap,
    archivesLastSnap: newArchivesLastSnap,
    totalLoaded: sortedDocs.length,
    newItemsCount: newParcels.length + newArchives.length,
    canLoadMore: !!(newParcelsLastSnap || newArchivesLastSnap)
  }
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

// Charge une page supplémentaire depuis parcels + archives
// Note: getParcelsPageWithArchives supprimée - utilisez loadMoreParcelsWithArchives à la place

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

  // ⚡ OPTIMISATION : Limiter à 90 jours et 200 documents pour chargement rapide
  const since = daysAgoTimestamp(90)
  const q1 = query(collection(db, 'parcels'), where('agentId', '==', agentId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))
  const q2 = query(collection(db, 'parcels'), where('destinationAgentId', '==', agentId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))

  const unsub1 = onSnapshot(q1, snap => { created = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge() }, onError)
  const unsub2 = onSnapshot(q2, snap => { claimed  = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge() }, onError)

  return () => { unsub1(); unsub2(); clearTimeout(timer) }
}
export async function getMoreAgentParcels(agentId: any, beforeTimestamp: any, pageSize = 800) {
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
export function subscribeAgencyParcels(
  city: any,
  callback: any,
  onError: (err?: any) => void = () => {},
  pageLimit = 200, // ⚡ OPTIMISATION : Réduit de 1000 à 200 pour chargement rapide
  callbackWithLastDoc?: (lastDoc: any) => void,
  dateFrom?: Date | null,
  dateTo?: Date | null,
  // 🗄️ true = garder les colis isArchived (toujours dans 'parcels'). L'onglet Expéditions du chef
  // d'agence le passe à true (comme le Facturier et l'onglet Ports en compte) : sinon une période
  // de plus de 30 jours perdait l'essentiel de ses colis (archivage auto après 30/45 jours).
  includeArchived = false,
  // 🪶 true = lire parcelsLite (version allégée, onglet Expéditions du chef d'agence / agent pro)
  lite = false
) {
  const col = parcelsSource(lite)
  let created: any[] = [], arrived: any[] = []
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  let lastCreatedDoc: any = null
  let lastArrivedDoc: any = null
  // ⚠️ Avec le cache local Firestore (persistentLocalCache), chaque onSnapshot renvoie d'abord
  // un résultat DEPUIS LE CACHE (potentiellement incomplet si le cache ne contient pas encore
  // tous les documents de la plage demandée), puis un second une fois le serveur interrogé.
  // On propage cet état pour que l'appelant sache si les données affichées sont définitives.
  let fromCache1 = true, fromCache2 = true
  let createdFull = false, arrivedFull = false

  const merge = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const map = new Map()
      created.forEach(p => map.set(p.id, p))
      arrived.forEach(p => map.set(p.id, p))
      const sorted = sortByCreatedDesc([...map.values()])
      callback(sorted, fromCache1 || fromCache2)
      if (callbackWithLastDoc) {
        // createdFull / arrivedFull : la requête a atteint pageLimit (il reste peut-être des colis
        // plus anciens) — sinon la page temps réel couvre déjà toute la plage pour cette requête.
        callbackWithLastDoc({ lastCreatedDoc, lastArrivedDoc, createdFull, arrivedFull })
      }
    }, 50)
  }

  // ⚡ OPTIMISATION : Chargement 30 jours au lieu de 365 pour performances
  const since = dateFrom ? Timestamp.fromDate(dateFrom) : daysAgoTimestamp(30)
  const until = dateTo ? Timestamp.fromDate(dateTo) : Timestamp.now()

  const q1 = dateTo
    ? query(col, where('originCity', '==', city), where('createdAt', '>=', since), where('createdAt', '<=', until), orderBy('createdAt', 'desc'), limit(pageLimit))
    : query(col, where('originCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))

  const q2 = dateTo
    ? query(col, where('destinationCity', '==', city), where('createdAt', '>=', since), where('createdAt', '<=', until), orderBy('createdAt', 'desc'), limit(pageLimit))
    : query(col, where('destinationCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))

  // ⚠️ includeMetadataChanges: true — sinon, quand le cache contient déjà les mêmes documents
  // que le serveur, Firestore ne redéclenche PAS de callback lors de la confirmation serveur
  // (snapshot "identique" ignoré par défaut), et fromCache resterait bloqué à true à tort.
  const unsub1 = onSnapshot(q1, { includeMetadataChanges: true }, snap => {
    // 🗄️ Filtrer les archivés côté client
    created = (snap.docs
      .map(d => ({ id: d.id, ...d.data() })) as any[])
      .filter(p => includeArchived || !p.isArchived)
    lastCreatedDoc = snap.docs[snap.docs.length - 1] || null
    createdFull = snap.metadata.fromCache || snap.docs.length >= pageLimit // cache : prudence, supposé plein
    fromCache1 = snap.metadata.fromCache
    merge()
  }, onError)
  const unsub2 = onSnapshot(q2, { includeMetadataChanges: true }, snap => {
    // 🗄️ Filtrer les archivés côté client
    arrived = (snap.docs
      .map(d => ({ id: d.id, ...d.data() })) as any[])
      .filter(p => includeArchived || !p.isArchived)
    lastArrivedDoc = snap.docs[snap.docs.length - 1] || null
    arrivedFull = snap.metadata.fromCache || snap.docs.length >= pageLimit
    fromCache2 = snap.metadata.fromCache
    merge()
  }, onError)

  return () => { unsub1(); unsub2(); clearTimeout(timer) }
}

// 📡 Colis d'une agence (envoyés + reçus) sur une plage de dates, chargés JUSQU'À ÉPUISEMENT,
// en temps réel, archivés inclus par défaut.
// ⚠️ subscribeAgencyParcels ci-dessus est plafonné (pageLimit par requête) : une page qui s'en
// sert seule (Caisse Agence : 300/1200) ne voyait que les N colis les plus récents de la plage —
// Casablanca crée ≈ 400 colis/jour, donc « Ce mois » ou une période de 45 jours y était tronqué à
// quelques jours. Ici chaque requête (originCity / destinationCity) est découpée en pages de
// `pageSize` documents, chacune écoutée en temps réel ; la page suivante démarre dès que la
// précédente est confirmée PLEINE par le serveur, jusqu'à la dernière page incomplète.
// - Les colis poussés hors d'une page par l'arrivée de nouveaux colis (effet du limit) sont
//   conservés (dernière version connue) pour ne jamais créer de trou à la jonction de deux pages.
// - Sans dateFrom : 45 derniers jours (durée maximale avant archivage automatique).
// - meta.complete = toutes les pages sont confirmées par le serveur et la dernière est incomplète.
export function subscribeAgencyParcelsFull(
  city: string,
  opts: { dateFrom?: Date | null; dateTo?: Date | null; pageSize?: number; includeArchived?: boolean; lite?: boolean },
  onData: (parcels: any[], meta: { loaded: number; complete: boolean; fromCache: boolean }) => void,
  onError: (err?: any) => void = () => {}
): () => void {
  // ⚡ Chargement JOUR PAR JOUR en PARALLÈLE (12 journées à la fois) au lieu d'une chaîne de pages
  // successives : même ensemble de colis, résultat complet beaucoup plus rapide.
  // - Journée(s) d'opération en cours ou à venir : écoute TEMPS RÉEL (sans limite, bornée par dates).
  // - Journées passées : lecture ponctuelle (getAgencyParcelsDaySlice, paginée jusqu'à épuisement).
  const pageSize = opts.pageSize ?? 2000
  const includeArchived = opts.includeArchived ?? true
  const lite = opts.lite ?? false // 🪶 parcelsLite (onglet Expéditions) ; Caisse / Chef d'exploitation : parcels
  const start = opts.dateFrom ?? new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const end = opts.dateTo ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const FIELDS = ['originCity', 'destinationCity'] as const
  const slices = buildDaySlices(start, end)
  const today = opDayOf(new Date())
  const liveSlices = slices.filter(sl => sl.day >= today)
  const pastSlices = slices.filter(sl => sl.day < today)

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastEmit = 0
  const liveDocs = new Map<string, any[]>()      // clé : jour|champ
  const liveServer = new Map<string, boolean>()
  const pastDocs: any[] = []
  let pastDone = pastSlices.length === 0
  const unsubs: (() => void)[] = []

  const emitNow = () => {
    if (stopped) return
    lastEmit = Date.now()
    const map = new Map<string, any>()
    pastDocs.forEach(p => map.set(p.id, p))
    liveDocs.forEach(list => list.forEach(p => map.set(p.id, p)))
    const all = [...map.values()].filter(p => includeArchived || !p.isArchived)
    const liveOk = [...liveServer.values()].every(Boolean) && liveServer.size === liveSlices.length * FIELDS.length
    onData(sortByCreatedDesc(all), { loaded: all.length, complete: liveOk && pastDone, fromCache: !liveOk })
  }
  // Au plus une mise à jour / 800 ms pendant la lecture des jours passés (chaque mise à jour
  // relance les calculs de la page), immédiate (60 ms) pour le temps réel et à la fin.
  const emit = (urgent = false) => {
    clearTimeout(timer)
    const wait = urgent ? 60 : Math.max(60, 800 - (Date.now() - lastEmit))
    timer = setTimeout(emitNow, wait)
  }

  liveSlices.forEach(sl => FIELDS.forEach(field => {
    const key = sl.day + '|' + field
    liveServer.set(key, false)
    const q = query(parcelsSource(lite),
      where(field, '==', city),
      where('createdAt', '>=', Timestamp.fromDate(sl.start)),
      where('createdAt', sl.endInclusive ? '<=' : '<', Timestamp.fromDate(sl.end)),
      orderBy('createdAt', 'desc'))
    unsubs.push(onSnapshot(q, { includeMetadataChanges: true }, snap => {
      if (stopped) return
      liveDocs.set(key, snap.docs.map(d => ({ id: d.id, ...d.data() })))
      liveServer.set(key, !snap.metadata.fromCache)
      emit(true)
    }, err => { if (!stopped) onError(err) }))
  }))

  if (pastSlices.length) {
    let next = 0
    const worker = async () => {
      while (next < pastSlices.length && !stopped) {
        const sl = pastSlices[next++]
        const docs = (await Promise.all(FIELDS.map(field =>
          getAgencyParcelsDaySlice(city, field, sl.start, sl.end, sl.endInclusive, null, pageSize, lite)))).flat()
        if (stopped) return
        for (const d of docs) pastDocs.push(d)
        emit()
      }
    }
    Promise.all(Array.from({ length: Math.min(12, pastSlices.length) }, worker))
      .then(() => { if (!stopped) { pastDone = true; emit(true) } })
      .catch(err => { if (!stopped) { pastDone = true; onError(err); emit(true) } })
  } else {
    emit(true)
  }

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubs.forEach(u => u())
  }
}

// Charger plus de colis pour une agence (pagination)
export async function getMoreAgencyParcels(
  city: string,
  lastDocs: { lastCreatedDoc: any; lastArrivedDoc: any },
  pageSize = 1000,
  dateFrom?: Date | null,
  dateTo?: Date | null,
  includeArchived = false, // voir subscribeAgencyParcels
  lite = false // 🪶 parcelsLite — doit correspondre à la collection des curseurs lastDocs
): Promise<{ docs: any[]; lastDocs: any; hasMore: boolean }> {
  const col = parcelsSource(lite)
  // ⚡ OPTIMISATION : Chargement 30 jours au lieu de 365 pour performances
  const since = dateFrom ? Timestamp.fromDate(dateFrom) : daysAgoTimestamp(30)
  const until = dateTo ? Timestamp.fromDate(dateTo) : Timestamp.now()
  const results: any[] = []
  let newLastCreatedDoc: any = null
  let newLastArrivedDoc: any = null
  // ⚠️ "Il en reste" se décide sur la taille BRUTE de chaque requête (une page pleine = peut-être
  // encore des colis), jamais sur le nombre de colis gardés après filtrage/fusion : en excluant les
  // archivés, une page de 2000 docs pouvait n'en garder que quelques centaines, et le chargement
  // automatique s'arrêtait à tort (ex: Casablanca, août : 2 692 colis affichés sur 12 673).
  let createdFull = false
  let arrivedFull = false

  try {
    // Query 1: colis créés dans cette ville
    if (lastDocs.lastCreatedDoc) {
      const q1 = dateTo
        ? query(
            col,
            where('originCity', '==', city),
            where('createdAt', '>=', since),
            where('createdAt', '<=', until),
            orderBy('createdAt', 'desc'),
            startAfter(lastDocs.lastCreatedDoc),
            limit(pageSize)
          )
        : query(
            col,
            where('originCity', '==', city),
            where('createdAt', '>=', since),
            orderBy('createdAt', 'desc'),
            startAfter(lastDocs.lastCreatedDoc),
            limit(pageSize)
          )
      const snap1 = await getDocs(q1)
      // 🗄️ Filtrer les archivés côté client (sauf includeArchived)
      const created = (snap1.docs
        .map(d => ({ id: d.id, ...d.data() })) as any[])
        .filter(p => includeArchived || !p.isArchived)
      results.push(...created)
      newLastCreatedDoc = snap1.docs[snap1.docs.length - 1] || lastDocs.lastCreatedDoc
      createdFull = snap1.docs.length >= pageSize
    }

    // Query 2: colis arrivés dans cette ville
    if (lastDocs.lastArrivedDoc) {
      const q2 = dateTo
        ? query(
            col,
            where('destinationCity', '==', city),
            where('createdAt', '>=', since),
            where('createdAt', '<=', until),
            orderBy('createdAt', 'desc'),
            startAfter(lastDocs.lastArrivedDoc),
            limit(pageSize)
          )
        : query(
            col,
            where('destinationCity', '==', city),
            where('createdAt', '>=', since),
            orderBy('createdAt', 'desc'),
            startAfter(lastDocs.lastArrivedDoc),
            limit(pageSize)
          )
      const snap2 = await getDocs(q2)
      // ⚠️ Même filtrage que la première page (subscribeAgencyParcels) : seulement les archivés.
      // La visibilité côté agence de destination est appliquée par l'appelant (AgentPage) sur
      // TOUS les colis — la filtrer ici aussi rendait le total dépendant de la page où tombait
      // le colis (1re page : gardé ; pages suivantes : exclu).
      const arrived = (snap2.docs.map(d => ({ id: d.id, ...d.data() })) as any[])
        .filter((p: any) => includeArchived || !p.isArchived)
      results.push(...arrived)
      newLastArrivedDoc = snap2.docs[snap2.docs.length - 1] || lastDocs.lastArrivedDoc
      arrivedFull = snap2.docs.length >= pageSize
    }

    // Fusionner et dédupliquer
    const map = new Map()
    results.forEach(p => map.set(p.id, p))
    const docs = sortByCreatedDesc([...map.values()])

    return {
      docs,
      lastDocs: {
        lastCreatedDoc: newLastCreatedDoc,
        lastArrivedDoc: newLastArrivedDoc
      },
      hasMore: createdFull || arrivedFull
    }
  } catch (error) {
    console.error('getMoreAgencyParcels error:', error)
    return { docs: [], lastDocs, hasMore: false }
  }
}

// 📅 Colis d'une agence pour UNE tranche de temps (une journée d'opération), une requête
// (originCity OU destinationCity), archivés inclus, paginée par pageSize jusqu'à épuisement.
// Sert au chargement « jour par jour » de l'onglet Expéditions du chef d'agence / agent pro :
// - [start, end[ (ou [start, end] si endInclusive) ;
// - afterDoc : curseur de la page temps réel — seuls les colis PLUS ANCIENS que lui sont lus
//   (ceux au-dessus sont déjà affichés par l'écoute temps réel).
export async function getAgencyParcelsDaySlice(
  city: string,
  field: 'originCity' | 'destinationCity',
  start: Date,
  end: Date,
  endInclusive: boolean,
  afterDoc: any = null,
  pageSize = 2000,
  lite = false // 🪶 parcelsLite (version allégée)
): Promise<any[]> {
  const out: any[] = []
  let cursor: any = afterDoc
  for (let guard = 0; guard < 200; guard++) {
    const constraints: any[] = [
      where(field, '==', city),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', endInclusive ? '<=' : '<', Timestamp.fromDate(end)),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ]
    const snap = await getDocs(query(parcelsSource(lite), ...constraints))
    snap.docs.forEach(d => out.push({ id: d.id, ...d.data() }))
    if (snap.docs.length < pageSize) break
    cursor = snap.docs[snap.docs.length - 1]
  }
  return out
}

// Colis retournés pour une agence (à charger, reçus, historique)
export function subscribeAgencyReturnParcels(
  city: any,
  callback: any,
  onError: (err?: any) => void = () => {},
  dateFrom?: Date | null,
  dateTo?: Date | null
) {
  // 📅 Filtres de date pour la requête Firestore
  const since = dateFrom ? Timestamp.fromDate(dateFrom) : daysAgoTimestamp(30)
  const until = dateTo ? Timestamp.fromDate(dateTo) : Timestamp.now()

  // ⚡ Filtre ville côté serveur : une requête par champ ville utilisé par le filtre
  // local (destinationCity / returnToCity / createdByCity), fusionnées et dédupliquées.
  // Le filtre local ci-dessous est conservé tel quel → sortie identique.
  const CITY_FIELDS = ['destinationCity', 'returnToCity', 'createdByCity'] as const
  const byField: Record<string, any[] | null> = { destinationCity: null, returnToCity: null, createdByCity: null }

  const emit = () => {
    if (CITY_FIELDS.some(f => byField[f] === null)) return
    const map = new Map<string, any>()
    CITY_FIELDS.forEach(f => (byField[f] as any[]).forEach(p => map.set(p.id, p)))
    const allReturns = sortByCreatedDesc([...map.values()])

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
  }

  const unsubs = CITY_FIELDS.map(field => {
    const q = query(
      collection(db, 'parcels'),
      where(field, '==', city),
      where('status', 'in', ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']),
      where('createdAt', '>=', since),
      ...(dateTo ? [where('createdAt', '<=', until)] : []),
      orderBy('createdAt', 'desc'),
      limit(5000)
    )
    return onSnapshot(q, snap => {
      byField[field] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      emit()
    }, onError)
  })
  return () => unsubs.forEach(u => u())
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

  const now = new Date().toISOString()
  const updates = {
    destinationAgentId:     agentId,
    destinationAgentName:   agentName,
    destinationArrivedAt:   null as any,
    status:                 'Arrivé en agence',
    history: arrayUnion({
      status: 'Arrivé en agence',
      timestamp: now,
      note: `Pris en charge par ${agentName}`
    })
  }

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new Error('Colis introuvable.')

    const parcel = snap.data()
    if (parcel.destinationAgentId && parcel.destinationAgentId !== agentId) {
      throw new Error(`Colis déjà pris en charge par ${parcel.destinationAgentName || 'un autre agent'}.`)
    }

    captured = parcel
    updates.destinationArrivedAt = parcel.destinationArrivedAt || now
    transaction.update(ref, updates)
  })

  // 🔄 TEMPS RÉEL: Émettre un événement pour synchronisation immédiate
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parcelUpdated', {
      detail: {
        parcelId,
        updates,
        timestamp: now,
        source: 'database'
      }
    }))
  }

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

    // 🗄️ Compter total ET archivés pour soustraire
    const [totalSnapshot, archivedSnapshot, ...statusSnapshots] = await Promise.all([
      getCountFromServer(collection(db, 'parcels')),
      getCountFromServer(query(collection(db, 'parcels'), where('isArchived', '==', true))),
      ...statuses.map(status =>
        getCountFromServer(query(collection(db, 'parcels'), where('status', '==', status)))
      )
    ])

    const total = totalSnapshot.data().count
    const archived = archivedSnapshot.data().count

    // 📊 Soustraire archivés du total et de chaque statut
    // Note: Les statuts incluent encore les archivés car on ne peut pas combiner where('status') + where('isArchived')
    // sans index composite. On soustrait une proportion estimée.
    const livresTotal = statusSnapshots[0].data().count
    const retournesTotal = statusSnapshots[1].data().count + statusSnapshots[2].data().count

    // Estimation: soustraire proportionnellement
    const archivedRatio = total > 0 ? archived / total : 0
    const livres = Math.max(0, Math.round(livresTotal * (1 - archivedRatio)))
    const retournes = Math.max(0, Math.round(retournesTotal * (1 - archivedRatio)))
    const active = total - archived
    const enCours = Math.max(0, active - livres - retournes)

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
    agencyCity?: string      // Pour filtrer par ville (chefs d'agence)
    includeArchived?: boolean // Pour chercher aussi dans archives
    // 🔍 Restreint la recherche par NOM à l'expéditeur seul, au destinataire seul, ou les deux
    // (défaut). N'affecte pas les recherches par tracking/NIC/téléphone.
    nameScope?: 'all' | 'sender' | 'receiver'
  } = {}
): Promise<any[]> {
  try {
    if (!term || term.trim().length === 0) return []

    const searchTerm = term.trim()
    const includeArchived = options.includeArchived ?? false // Par défaut: NE PAS inclure archives (performance)
    const results: any[] = []
    const uniqueIds = new Set<string>()
    const agencyCity = options.agencyCity

    // Collections à chercher
    const collections = ['parcels']
    if (includeArchived) {
      collections.push('parcels_archive')
    }

    // Chercher dans chaque collection
    for (const collectionName of collections) {
      const parcelsCol = collection(db, collectionName)
      const isArchived = collectionName === 'parcels_archive'

      // Test 1: Recherche EXACTE par senderNic ou nic
      try {
        const qSenderNic = query(parcelsCol, where('senderNic', '==', searchTerm))
        const qNic = query(parcelsCol, where('nic', '==', searchTerm))
        const [snapSenderNic, snapNic] = await Promise.all([getDocs(qSenderNic), getDocs(qNic)])
        for (const d of [...snapSenderNic.docs, ...snapNic.docs]) {
          if (!uniqueIds.has(d.id)) {
            uniqueIds.add(d.id)
            results.push({ id: d.id, ...d.data(), isArchived })
          }
        }
      } catch (e) {
        console.error('Erreur requête senderNic/nic:', e)
      }

      // Test 2: trackingId
      const trackingId = searchTerm.toUpperCase().replace(/[\s-]/g, '')
      if (/^LMA/.test(trackingId)) {
        try {
          const qTrack = query(parcelsCol, where('trackingId', '==', trackingId))
          const snapTrack = await getDocs(qTrack)
          for (const d of snapTrack.docs) {
            if (!uniqueIds.has(d.id)) {
              uniqueIds.add(d.id)
              results.push({ id: d.id, ...d.data(), isArchived })
            }
          }
        } catch (e) {
          console.error('Erreur requête trackingId:', e)
        }
      }

      // Test 3: Téléphone (≥9 chiffres)
      const phone = searchTerm.replace(/[\s\-\(\)\.]/g, '')
      if (/^\d{9,}$/.test(phone)) {
        try {
          const qPhone1 = query(parcelsCol, where('senderTel', '==', phone))
          const qPhone2 = query(parcelsCol, where('receiverTel', '==', phone))
          const [snap1, snap2] = await Promise.all([getDocs(qPhone1), getDocs(qPhone2)])
          for (const d of [...snap1.docs, ...snap2.docs]) {
            if (!uniqueIds.has(d.id)) {
              uniqueIds.add(d.id)
              results.push({ id: d.id, ...d.data(), isArchived })
            }
          }
        } catch (e) {
          console.error('Erreur requête téléphone:', e)
        }
      }

      // Test 4: Chèque ou Traite (C/c + montant ou T/t + montant)
      if (/^[ct]/i.test(searchTerm)) {
        const firstChar = searchTerm[0].toUpperCase()
        const amount = searchTerm.substring(1).trim()

        if (/^\d+(\.\d+)?$/.test(amount)) {
          const numAmount = parseFloat(amount)

          try {
            // Pour chèque: serviceType = 'cheque' ET codAmount = numAmount
            if (firstChar === 'C') {
              const qCheque = query(
                parcelsCol,
                where('serviceType', '==', 'cheque'),
                where('codAmount', '==', numAmount)
              )
              const snapCheque = await getDocs(qCheque)
              for (const d of snapCheque.docs) {
                if (!uniqueIds.has(d.id)) {
                  uniqueIds.add(d.id)
                  results.push({ id: d.id, ...d.data(), isArchived })
                }
              }
            }

            // Pour traite: serviceType = 'traite' ET codAmount = numAmount
            if (firstChar === 'T') {
              const qTraite = query(
                parcelsCol,
                where('serviceType', '==', 'traite'),
                where('codAmount', '==', numAmount)
              )
              const snapTraite = await getDocs(qTraite)
              for (const d of snapTraite.docs) {
                if (!uniqueIds.has(d.id)) {
                  uniqueIds.add(d.id)
                  results.push({ id: d.id, ...d.data(), isArchived })
                }
              }
            }
          } catch (e) {
            console.error('Erreur requête chèque/traite:', e)
          }
        }
      }

      // Test 5: Nom (expéditeur ou destinataire) - seulement si contient des lettres
      const nameLower = searchTerm.toLowerCase().trim()
      if (/[a-zA-Zà-ÿ]/.test(searchTerm)) {
        try {
          // ⚠️ nameScope restreint à un seul champ : on n'interroge même pas l'autre, pour
          // que "expéditeur seul" n'affiche jamais un colis matché via le destinataire.
          const nameScope = options.nameScope || 'all'
          const nameNorm = normName(searchTerm)
          const PREFIX_END = '\uf8ff'
          const doPrefix = nameNorm.length >= 3
          const wantSender = nameScope !== 'receiver'
          const wantReceiver = nameScope !== 'sender'
          const nameQueryList: Query<DocumentData>[] = []
          // Recherche exacte (champs historiques en minuscules + champs normalisés sans accents)
          if (wantSender) nameQueryList.push(query(parcelsCol, where('senderNameLower', '==', nameLower)))
          if (wantReceiver) nameQueryList.push(query(parcelsCol, where('receiverNameLower', '==', nameLower)))
          if (nameNorm) {
            if (wantSender) nameQueryList.push(query(parcelsCol, where('senderNameNorm', '==', nameNorm)))
            if (wantReceiver) nameQueryList.push(query(parcelsCol, where('receiverNameNorm', '==', nameNorm)))
          }
          // Recherche par préfixe (commence par) — seulement à partir de 3 caractères
          if (doPrefix) {
            if (wantSender) {
              nameQueryList.push(query(parcelsCol, where('senderNameLower', '>=', nameLower), where('senderNameLower', '<=', nameLower + PREFIX_END)))
              nameQueryList.push(query(parcelsCol, where('senderNameNorm', '>=', nameNorm), where('senderNameNorm', '<=', nameNorm + PREFIX_END)))
            }
            if (wantReceiver) {
              nameQueryList.push(query(parcelsCol, where('receiverNameLower', '>=', nameLower), where('receiverNameLower', '<=', nameLower + PREFIX_END)))
              nameQueryList.push(query(parcelsCol, where('receiverNameNorm', '>=', nameNorm), where('receiverNameNorm', '<=', nameNorm + PREFIX_END)))
            }
          }
          const nameSnaps = await Promise.all(nameQueryList.map(q => getDocs(q)))

          for (const d of nameSnaps.flatMap(snap => snap.docs)) {
            if (!uniqueIds.has(d.id)) {
              uniqueIds.add(d.id)
              results.push({ id: d.id, ...d.data(), isArchived })
            }
          }
        } catch (e) {
          console.error('Erreur requête nom:', e)
        }
      }
    } // Fin de la boucle for collections

    // Filtrer par ville si spécifié (pour chefs d'agence)
    if (agencyCity) {
      return results.filter(p =>
        p.originCity === agencyCity || p.destinationCity === agencyCity
      )
    }

    return results
  } catch (error) {
    console.error('❌ Erreur searchParcels:', error)
    return []
  }
}

// -- Archivage dynamique -------------------------------------

/**
 * 📦 Archiver manuellement une expédition
 */
export async function archiveParcelManual(parcelId: string): Promise<void> {
  const parcelRef = doc(db, 'parcels', parcelId)
  const parcelSnap = await getDoc(parcelRef)

  if (!parcelSnap.exists()) {
    throw new Error('Colis introuvable')
  }

  const parcelData = { id: parcelSnap.id, ...parcelSnap.data() }

  // Ajouter à la collection archives avec metadata
  const archiveRef = doc(db, 'parcels_archive', parcelId)
  await setDoc(archiveRef, {
    ...parcelData,
    archivedAt: serverTimestamp(),
    archivedManually: true
  })

  // Supprimer de la collection active
  await deleteDoc(parcelRef)
}

/**
 * 📦 Restaurer une expédition archivée
 */
export async function unarchiveParcel(parcelId: string): Promise<void> {
  const archiveRef = doc(db, 'parcels_archive', parcelId)
  const archiveSnap = await getDoc(archiveRef)

  if (!archiveSnap.exists()) {
    throw new Error('Archive introuvable')
  }

  const parcelData = archiveSnap.data()

  // Retirer les champs d'archivage
  const { archivedAt, archivedManually, ...originalData } = parcelData

  // Restaurer dans la collection active
  const parcelRef = doc(db, 'parcels', parcelId)
  await setDoc(parcelRef, originalData)

  // Supprimer de la collection archives
  await deleteDoc(archiveRef)
}

/**
 * 📦 Archiver plusieurs expéditions en masse
 */
export async function bulkArchiveParcels(
  parcelIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; errors: number }> {
  let success = 0
  let errors = 0

  for (let i = 0; i < parcelIds.length; i++) {
    try {
      await archiveParcelManual(parcelIds[i])
      success++
    } catch (error) {
      console.error('Erreur archivage:', parcelIds[i], error)
      errors++
    }

    if (onProgress) {
      onProgress(i + 1, parcelIds.length)
    }
  }

  return { success, errors }
}

/**
 * 📦 Archivage automatique selon règles métier
 */
export async function autoArchiveParcels(options: {
  deliveredDays?: number  // Livrés > X jours (défaut: 90)
  returnedDays?: number   // Retournés > X jours (défaut: 60)
  canceledDays?: number   // Annulés > X jours (défaut: 30)
  dryRun?: boolean        // Test sans archiver
} = {}): Promise<{ candidates: number; archived: number; errors: number }> {
  const deliveredDays = options.deliveredDays ?? 90
  const returnedDays = options.returnedDays ?? 60
  const canceledDays = options.canceledDays ?? 30
  const dryRun = options.dryRun ?? false

  const now = new Date()
  const candidates: string[] = []

  // Règle 1: Colis livrés anciens
  const deliveredCutoff = new Date(now)
  deliveredCutoff.setDate(deliveredCutoff.getDate() - deliveredDays)

  const qDelivered = query(
    collection(db, 'parcels'),
    where('status', '==', 'Livré'),
    where('createdAt', '<', Timestamp.fromDate(deliveredCutoff))
  )
  const snapDelivered = await getDocs(qDelivered)
  snapDelivered.docs.forEach(d => candidates.push(d.id))

  // Règle 2: Retours finalisés anciens
  const returnedCutoff = new Date(now)
  returnedCutoff.setDate(returnedCutoff.getDate() - returnedDays)

  const qReturned = query(
    collection(db, 'parcels'),
    where('status', '==', 'Retour finalisé'),
    where('createdAt', '<', Timestamp.fromDate(returnedCutoff))
  )
  const snapReturned = await getDocs(qReturned)
  snapReturned.docs.forEach(d => candidates.push(d.id))

  if (dryRun) {
    return { candidates: candidates.length, archived: 0, errors: 0 }
  }

  // Archiver par batch
  let archived = 0
  let errors = 0

  for (const id of candidates) {
    try {
      await archiveParcelManual(id)
      archived++
    } catch (error) {
      console.error('Erreur auto-archivage:', id, error)
      errors++
    }
  }

  return { candidates: candidates.length, archived, errors }
}

/**
 * Convertir un colis "Port Dû" en "En compte destinataire"
 * Utilisé par le chef d'agence ou le livreur lors de la livraison
 */
// ─────────────────────────────────────────────────────────────────────────────
// COD (Contre-remboursement) - Distribution retours de fond
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S'abonner aux expéditions COD en espèces
 */
// ⚡ DRFE / DRFC : fenêtre de lecture = COD des COD_RECENT_DAYS derniers jours
// + COD non soldés (pending / collected / sans statut) quel que soit leur âge.
// Les COD soldés (remis) plus anciens restent accessibles via « Charger plus ».
const COD_RECENT_DAYS = 90
const COD_UNSETTLED_STATUSES = ['pending', 'collected', null]

export type CodSubscriptionMeta = { hasOlder: boolean }

function subscribeCodByServiceType(
  serviceTypeFilter: ReturnType<typeof where>,
  callback: (data: Parcel[], lastDoc: any, meta?: CodSubscriptionMeta) => void,
  onError: ((err: any) => void) | undefined,
  codStatusFilter: 'pending' | 'collected' | 'remis' | undefined,
  limitCount: number
) {
  const onErr = onError || (() => {})
  const toParcels = (snapshot: any) => snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Parcel))

  // Filtre sur un statut non soldé : aucune borne de date (rien ne doit disparaître)
  if (codStatusFilter === 'pending' || codStatusFilter === 'collected') {
    const q = query(
      collection(db, 'parcels'),
      serviceTypeFilter,
      where('codStatus', '==', codStatusFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    )
    return onSnapshot(q, (snapshot) => {
      const data = toParcels(snapshot)
      callback(data, snapshot.docs[snapshot.docs.length - 1], { hasOlder: data.length >= limitCount })
    }, onErr)
  }

  const cutoff = daysAgoTimestamp(COD_RECENT_DAYS)
  let recent: Parcel[] | null = null
  let recentLast: any = null
  // Filtre 'remis' : seulement la fenêtre récente (le reste via « Charger plus »)
  let older: Parcel[] | null = codStatusFilter ? [] : null

  const emit = () => {
    if (recent === null || older === null) return
    const map = new Map<string, Parcel>()
    ;[...recent, ...older].forEach((p) => map.set(p.id, p))
    const data = sortByCreatedDesc([...map.values()] as any[]) as Parcel[]
    // Curseur « Charger plus » : dernier doc récent, ou la date limite si aucun doc récent
    // (startAfter accepte une valeur de createdAt avec orderBy('createdAt','desc')).
    callback(data, recentLast || cutoff, { hasOlder: true })
  }

  const qRecent = query(
    collection(db, 'parcels'),
    serviceTypeFilter,
    ...(codStatusFilter ? [where('codStatus', '==', codStatusFilter)] : []),
    where('createdAt', '>=', cutoff),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )
  const unsubRecent = onSnapshot(qRecent, (snapshot) => {
    recent = toParcels(snapshot)
    recentLast = snapshot.docs[snapshot.docs.length - 1] || null
    emit()
  }, onErr)

  if (codStatusFilter) return unsubRecent

  const qOlder = query(
    collection(db, 'parcels'),
    serviceTypeFilter,
    where('codStatus', 'in', COD_UNSETTLED_STATUSES),
    where('createdAt', '<', cutoff),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )
  const unsubOlder = onSnapshot(qOlder, (snapshot) => {
    older = toParcels(snapshot)
    emit()
  }, onErr)

  return () => { unsubRecent(); unsubOlder() }
}

export function subscribeCodParcelsEspeces(
  callback: (data: Parcel[], lastDoc: any, meta?: CodSubscriptionMeta) => void,
  onError?: (err: any) => void,
  codStatusFilter?: 'pending' | 'collected' | 'remis',
  limitCount = 9000
) {
  // 💵+📋 RF MIXTE : un colis Espèces + chèque/traite (serviceType = document) apparaît AUSSI
  // ici pour sa part espèces (codAmount = part espèces dans la vue, voir codPartView).
  let especes: Parcel[] | null = null
  let mixed: Parcel[] | null = null
  let lastDoc: any = null
  let metaEsp: CodSubscriptionMeta | undefined
  let metaMix: CodSubscriptionMeta | undefined
  const emit = () => {
    if (especes === null || mixed === null) return
    const map = new Map<string, Parcel>()
    especes.forEach(p => map.set(p.id, p))
    mixed.forEach(p => map.set(p.id, codPartView(p as any, 'especes') as Parcel))
    const data = sortByCreatedDesc([...map.values()] as any[]) as Parcel[]
    callback(data, lastDoc, { hasOlder: !!(metaEsp?.hasOlder || metaMix?.hasOlder) })
  }
  const unsubEsp = subscribeCodByServiceType(where('serviceType', '==', 'especes'), (data, last, meta) => {
    especes = data; lastDoc = last; metaEsp = meta; emit()
  }, onError, codStatusFilter, limitCount)
  const unsubMix = subscribeCodByServiceType(where('codMixed', '==', true), (data, _last, meta) => {
    mixed = data.filter(p => isMixedCod(p)); metaMix = meta; emit()
  }, (err) => {
    // Jamais bloquant pour la page espèces (ex. index en cours de création)
    console.warn('[DRFE] RF mixtes indisponibles :', err?.message || err)
    mixed = []; emit()
  }, codStatusFilter, limitCount)
  return () => { unsubEsp(); unsubMix() }
}

/**
 * Charger plus d'expéditions COD en espèces
 */
export async function getMoreCodParcelsEspeces(
  lastDoc: any,
  codStatusFilter?: 'pending' | 'collected' | 'remis',
  limitCount = 9000
) {
  let q = query(
    collection(db, 'parcels'),
    where('serviceType', '==', 'especes'),
    orderBy('createdAt', 'desc'),
    startAfter(lastDoc),
    limit(limitCount)
  )

  if (codStatusFilter) {
    q = query(
      collection(db, 'parcels'),
      where('serviceType', '==', 'especes'),
      where('codStatus', '==', codStatusFilter),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(limitCount)
    )
  }

  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel))
  const newLastDoc = snapshot.docs[snapshot.docs.length - 1]
  // 💵+📋 RF mixtes plus anciens : part espèces (non bloquant)
  let mixedMore = false
  try {
    const qMix = query(
      collection(db, 'parcels'),
      where('codMixed', '==', true),
      ...(codStatusFilter ? [where('codStatus', '==', codStatusFilter)] : []),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(limitCount)
    )
    const snapMix = await getDocs(qMix)
    mixedMore = snapMix.docs.length === limitCount
    snapMix.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((p) => isMixedCod(p) && !data.some((x) => x.id === p.id))
      .forEach((p) => data.push(codPartView(p, 'especes') as Parcel))
  } catch (err: any) {
    console.warn('[DRFE] RF mixtes (charger plus) indisponibles :', err?.message || err)
  }
  return { data: sortByCreatedDesc(data as any[]) as Parcel[], lastDoc: newLastDoc, hasMore: snapshot.docs.length === limitCount || mixedMore }
}

/**
 * S'abonner aux expéditions COD en chèques/traites
 */
export function subscribeCodParcelsCheques(
  callback: (data: Parcel[], lastDoc: any, meta?: CodSubscriptionMeta) => void,
  onError?: (err: any) => void,
  codStatusFilter?: 'pending' | 'collected' | 'remis',
  limitCount = 9000
) {
  // 💵+📋 RF MIXTE : seule la part chèque/traite est présentée ici (codAmount = part document)
  return subscribeCodByServiceType(where('serviceType', 'in', ['cheque', 'traite']), (data, last, meta) => {
    callback(data.map(p => codPartView(p as any, 'document') as Parcel), last, meta)
  }, onError, codStatusFilter, limitCount)
}

/**
 * Charger plus d'expéditions COD en chèques/traites
 */
export async function getMoreCodParcelsCheques(
  lastDoc: any,
  codStatusFilter?: 'pending' | 'collected' | 'remis',
  limitCount = 9000
) {
  let q = query(
    collection(db, 'parcels'),
    where('serviceType', 'in', ['cheque', 'traite']),
    orderBy('createdAt', 'desc'),
    startAfter(lastDoc),
    limit(limitCount)
  )

  if (codStatusFilter) {
    q = query(
      collection(db, 'parcels'),
      where('serviceType', 'in', ['cheque', 'traite']),
      where('codStatus', '==', codStatusFilter),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(limitCount)
    )
  }

  const snapshot = await getDocs(q)
  // RF mixte : part chèque/traite uniquement
  const data = snapshot.docs.map((d) => codPartView({ id: d.id, ...d.data() } as any, 'document') as Parcel)
  const newLastDoc = snapshot.docs[snapshot.docs.length - 1]
  return { data, lastDoc: newLastDoc, hasMore: snapshot.docs.length === limitCount }
}

/**
 * Marquer COD comme collecté (reçu du collecteur central)
 */
export async function markCodAsCollected(
  parcelId: string,
  collectedBy: string,
  collectedByName: string
) {
  const docRef = doc(db, 'parcels', parcelId)
  await updateDoc(docRef, {
    codStatus: 'collected',
    codCollectedAt: new Date().toISOString(),
    codCollectedBy: collectedBy,
  })
}

/**
 * Marquer COD comme remis au client propriétaire
 */
export async function markCodAsRemis(
  parcelId: string,
  remisBy: string,
  remisByName: string
) {
  const docRef = doc(db, 'parcels', parcelId)
  await updateDoc(docRef, {
    codStatus: 'remis',
    codRemisAt: new Date().toISOString(),
    codRemisBy: remisBy,
  })
}

// -- Règlements (Pointeur-Encaisseur) -------------------------------------
// 🧾 Facturier : charger TOUTES les expéditions dont createdAt est dans [start, end]
// (pagination par tranches de 1000, sans limite globale). Requête mono-champ : aucun index composite requis.
// onProgress(n) : appelé après chaque tranche avec le nombre total reçu (indicateur visible).
// endExclusive = true : borne haute stricte (<) — utilisé pour découper une plage en tranches
// jour par jour contiguës sans doublon ni trou (voir FacturierExpeditionsTab).
export async function getParcelsByCreatedAtRange(
  start: Date, end: Date, pageSize = 1000, onProgress?: (loaded: number) => void, endExclusive = false
): Promise<any[]> {
  const out: any[] = []
  let cursor: any = null
  for (let guard = 0; guard < 200; guard++) {
    const constraints: any[] = [
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', endExclusive ? '<' : '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'desc'),
    ]
    if (cursor) constraints.push(startAfter(cursor))
    constraints.push(limit(pageSize))
    const snap = await getDocs(query(collection(db, 'parcels'), ...constraints))
    snap.docs.forEach(d => out.push({ id: d.id, ...d.data() }))
    onProgress?.(out.length)
    if (snap.docs.length < pageSize) break
    cursor = snap.docs[snap.docs.length - 1]
  }
  return out
}

// 💼 Ports en compte d'une agence (page Chef d'agence), SANS plafond ni fenêtre de dates :
// - compte expéditeur (+ ancien type générique) expédiés DEPUIS la ville,
// - compte destinataire (+ ancien type générique) livrés DANS la ville.
// ⚠️ Ne PAS s'appuyer sur la liste temps réel de l'agence (plafonnée à 2000 colis par requête et
// sans les colis archivés) : pour une agence très active (Casablanca ≈ 13 000 expéditions/mois),
// elle ne couvrait que les derniers jours du mois et le décompte divergeait du Facturier.
// Comme le Facturier, les colis marqués isArchived (toujours dans 'parcels') sont inclus.
// Requêtes à égalité seule (== + in) : aucun index composite requis.
export async function getAgencyPortEnCompteParcels(city: string): Promise<any[]> {
  if (!city) return []
  const [snapOrig, snapDest] = await Promise.all([
    getDocs(query(collection(db, 'parcels'), where('originCity', '==', city), where('portType', 'in', ['port_en_compte_expediteur', 'port_en_compte']))),
    getDocs(query(collection(db, 'parcels'), where('destinationCity', '==', city), where('portType', 'in', ['port_en_compte_destinataire', 'port_en_compte']))),
  ])
  const map = new Map<string, any>()
  ;[...snapOrig.docs, ...snapDest.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  return sortByCreatedDesc([...map.values()])
}
