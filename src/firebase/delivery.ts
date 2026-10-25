
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { bumpPresence } from '../services/presenceCounters'
import { CITIES, STATUSES } from './constants'
import { daysAgoTimestamp } from './firestoreUtils'
import { isCodMoneyBeforeStart } from '../utils/moneyFlow'
import { isParcelVisibleInDestinationAgency } from './parcels'

// 🚉 Livreur-gare d'une ville (assignation auto « Livraison en gare »). Même requête qu'avant,
// mise en cache 5 min par ville (et préchargée par le formulaire) : évite un aller-retour serveur
// à chaque création d'expédition. Les erreurs ne sont pas mises en cache.
const GARE_DRIVER_TTL_MS = 5 * 60 * 1000
const gareDriverCache = new Map<string, { at: number; p: Promise<{ id: string } | null> }>()
export function getGareDriverForCity(city: string): Promise<{ id: string } | null> {
  const key = String(city || '').trim()
  if (!key) return Promise.resolve(null)
  const hit = gareDriverCache.get(key)
  if (hit && Date.now() - hit.at < GARE_DRIVER_TTL_MS) return hit.p
  const p = getDocs(query(collection(db, 'users'), where('role', '==', 'livreur-gare'), where('city', '==', key)))
    .then(snap => (snap.empty ? null : { id: snap.docs[0].id }))
  p.catch(() => gareDriverCache.delete(key))
  gareDriverCache.set(key, { at: Date.now(), p })
  return p
}

export async function getDrivers() {
  const q    = query(collection(db, 'users'), where('role', 'in', ['chauffeur', 'livreur']))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export function subscribeDrivers(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'users'), where('role', 'in', ['chauffeur', 'livreur']))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribePendingCods(city: any, callback: any) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'parcels'), where('destinationCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(
    q,
    snap => {
      callback(
        (snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])
          .filter(p => p.codStatus === 'collected' && p.codAmount > 0 && p.codPaymentType !== 'bon_livraison'
            && !isCodMoneyBeforeStart(p)) // 📅 encaissés avant le 05/10/2026 (essais) : hors solde
          .sort((a, b) => {
            const da = a.codCollectedAt ? new Date(a.codCollectedAt) : new Date(0)
            const db2 = b.codCollectedAt ? new Date(b.codCollectedAt) : new Date(0)
            return db2.getTime() - da.getTime()
          })
      )
    },
    err => {
      console.warn('subscribePendingCods permission error:', err.code)
      callback([])
    }
  )
}
export async function getDriverParcels(driverId: any) {
  const q    = query(collection(db, 'parcels'), where('chauffeurId', '==', driverId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function assignDriver(parcelId: any, chauffeurName: any, chauffeurPhone: any) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    chauffeurName,
    chauffeurPhone: chauffeurPhone || '',
    status: 'En transit',
    shipmentLoadedAt: now,
    visibleInDestinationAgency: true,
    history: arrayUnion({
      status: 'En transit',
      timestamp: now,
      note: `Colis chargé dans le camion de ${chauffeurName || 'chauffeur de transport'}`
    })
  })
}
export async function assignDriversBulk(assignments: any[] = []) {
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  assignments.forEach(({ parcelId, chauffeurName, chauffeurPhone }) => {
    if (!parcelId || !chauffeurName) return
    batch.update(doc(db, 'parcels', parcelId), {
      chauffeurName: chauffeurName || '',
      chauffeurPhone: chauffeurPhone || '',
      status: 'En transit',
      shipmentLoadedAt: now,
      visibleInDestinationAgency: true,
      history: arrayUnion({
        status: 'En transit',
        timestamp: now,
        note: `Colis chargé dans le camion de ${chauffeurName || 'chauffeur de transport'}`
      })
    })
  })
  await batch.commit()
}
export async function getAgencyInbox(city: any) {
  const q    = query(collection(db, 'parcels'), where('destinationCity', '==', city))
  const snap = await getDocs(q)
  return (snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]).filter(p => !p.destinationAgentId && isParcelVisibleInDestinationAgency(p))
}
export function subscribeDriverParcels(driverId: any, callback: any) {
  const since = daysAgoTimestamp(30)
  const q = query(collection(db, 'parcels'), where('chauffeurId', '==', driverId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(
    q,
    snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    },
    err => {
      console.warn('subscribeDriverParcels permission error:', err.code)
      callback([])
    }
  )
}

// Colis d'un livreur local
export function subscribeDeliveryDriverParcels(
  driverId: any,
  callback: any,
  onError: (err?: any) => void = () => {},
  pageLimit = 100, // Limite configurable (100 par défaut)
  callbackWithLastDoc?: (lastDocs: any) => void, // Callback pour retourner les derniers documents (pagination)
  opts: { lite?: boolean } = {}
) {
  const since = daysAgoTimestamp(30)

  // Deux requêtes : colis assignés + colis retournés par ce livreur (historique)
  // ⚡ opts.lite : les expéditions assignées sont lues dans parcelsLite (sans historique ni champs
  // d'audit). ⚠️ returnedByDriverId N'EST PAS dans parcelsLite (LITE_EXCLUDED_FIELDS) : la 2ᵉ
  // requête reste donc sur parcels (peu de documents : retours du livreur sur 30 jours).
  const q1 = query(collection(db, opts.lite ? 'parcelsLite' : 'parcels'), where('deliveryDriverId', '==', driverId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))
  const q2 = query(collection(db, 'parcels'), where('returnedByDriverId', '==', driverId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))

  // 🚚 TOUTES les expéditions « En cours de livraison » du livreur, sans date ni plafond : ce qu'il a à livrer
  // aujourd'hui. Avant, la liste s'arrêtait aux 100 plus récentes des 30 derniers jours (ex. Marrakech : 212 en
  // cours invisibles sans « Charger plus »). Même collection que q1 ; deux égalités → aucun index composé requis.
  const q3 = query(collection(db, opts.lite ? 'parcelsLite' : 'parcels'), where('deliveryDriverId', '==', driverId), where('status', '==', 'En cours de livraison'))

  let assigned: any[] = []
  let returned: any[] = []
  let enCours: any[] = []
  let lastAssignedDoc: any = null
  let lastReturnedDoc: any = null

  const merge = () => {
    // Fusionner et dédupliquer par ID
    const map = new Map()
    enCours.forEach(p => map.set(p.id, p))
    assigned.forEach(p => map.set(p.id, p))
    returned.forEach(p => map.set(p.id, p))
    callback([...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    // Retourner les derniers documents pour la pagination
    if (callbackWithLastDoc) {
      callbackWithLastDoc({ lastAssignedDoc, lastReturnedDoc })
    }
  }

  const unsub1 = onSnapshot(q1, snap => {
    assigned = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    lastAssignedDoc = snap.docs[snap.docs.length - 1] || null
    merge()
  }, err => {
    console.warn('subscribeDeliveryDriverParcels (assigned) permission error:', err.code)
    assigned = []
    onError(err)
    merge()
  })

  const unsub2 = onSnapshot(q2, snap => {
    returned = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    lastReturnedDoc = snap.docs[snap.docs.length - 1] || null
    merge()
  }, err => {
    console.warn('subscribeDeliveryDriverParcels (returned) permission error:', err.code)
    returned = []
    onError(err)
    merge()
  })

  const unsub3 = onSnapshot(q3, snap => {
    enCours = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    merge()
  }, err => {
    console.warn('subscribeDeliveryDriverParcels (en cours) permission error:', err.code)
    enCours = []
    merge()
  })

  return () => {
    unsub1()
    unsub2()
    unsub3()
  }
}

// Charger plus de colis pour un livreur (pagination)
export async function getMoreDeliveryDriverParcels(
  driverId: string,
  lastDocs: { lastAssignedDoc: any; lastReturnedDoc: any },
  pageSize = 50
): Promise<{ docs: any[]; lastDocs: any; hasMore: boolean }> {
  const since = daysAgoTimestamp(30)
  const results: any[] = []
  let newLastAssignedDoc: any = null
  let newLastReturnedDoc: any = null

  try {
    // Query 1: colis assignés
    if (lastDocs.lastAssignedDoc) {
      const q1 = query(
        collection(db, 'parcels'),
        where('deliveryDriverId', '==', driverId),
        where('createdAt', '>=', since),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocs.lastAssignedDoc),
        limit(pageSize)
      )
      const snap1 = await getDocs(q1)
      const assigned = snap1.docs.map(d => ({ id: d.id, ...d.data() }))
      results.push(...assigned)
      newLastAssignedDoc = snap1.docs[snap1.docs.length - 1] || lastDocs.lastAssignedDoc
    }

    // Query 2: colis retournés par ce livreur
    if (lastDocs.lastReturnedDoc) {
      const q2 = query(
        collection(db, 'parcels'),
        where('returnedByDriverId', '==', driverId),
        where('createdAt', '>=', since),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocs.lastReturnedDoc),
        limit(pageSize)
      )
      const snap2 = await getDocs(q2)
      const returned = snap2.docs.map(d => ({ id: d.id, ...d.data() }))
      results.push(...returned)
      newLastReturnedDoc = snap2.docs[snap2.docs.length - 1] || lastDocs.lastReturnedDoc
    }

    // Fusionner et dédupliquer
    const map = new Map()
    results.forEach(p => map.set(p.id, p))
    const docs = [...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    return {
      docs,
      lastDocs: {
        lastAssignedDoc: newLastAssignedDoc,
        lastReturnedDoc: newLastReturnedDoc
      },
      hasMore: docs.length >= pageSize
    }
  } catch (error) {
    console.error('getMoreDeliveryDriverParcels error:', error)
    return { docs: [], lastDocs, hasMore: false }
  }
}

export async function assignDeliveryDriver(parcelId: any, deliveryDriverId: any, deliveryDriverName: any, extra: any = {}) {
  const patch = {
    deliveryDriverId,
    deliveryDriverName,
    deliverySectorId:     extra.deliverySectorId     ?? null,
    deliverySectorCode:   extra.deliverySectorCode   ?? '',
    deliverySectorName:   extra.deliverySectorName   ?? '',
    deliveryVehicleId:    extra.deliveryVehicleId    ?? null,
    deliveryVehicleLabel: extra.deliveryVehicleLabel ?? '',
    deliveryAssignedAt:   new Date().toISOString(),
    deliveryAssignedBy:   extra.deliveryAssignedBy   || '',
  }
  await updateDoc(doc(db, 'parcels', parcelId), patch)
  bumpPresence('updated')
}
/**
 * 🚚 Après une correction de la VILLE DE DESTINATION (diagnostic du 24/10/2026, point 2.1) : le livreur affecté
 * restait celui de l'ancienne ville (souvent « En gare - Agadir » sur une expédition devenue « pour Marrakech »),
 * l'expédition disparaissait de la gare de la nouvelle ville. Réaligne, sur l'état RELU :
 * - compte « En gare » d'une autre ville → compte « En gare » de la nouvelle ville (s'il existe) ;
 * - vrai livreur d'une autre ville → assignation retirée (« En cours de livraison » redevient « Arrivé en agence »).
 * Rien n'est fait pour une expédition livrée / en retour, ni quand de l'argent est déjà encaissé (à régler à la main),
 * ni pour la paire Agadir / Ait Melloul (livreurs partagés). Renvoie un message (ou null si rien à faire).
 */
export async function realignDeliveryAfterDestinationChange(parcelId: string, by: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'parcels', parcelId))
  if (!snap.exists()) return null
  const p: any = snap.data()
  const dest = String(p.destinationCity || '')
  const { auth } = await import('./auth')
  if (auth.currentUser) {
    const actor = (await getDoc(doc(db, 'users', auth.currentUser.uid))).data()
    if (['agentpro', 'chef_agence'].includes(actor?.role) && actor?.city !== dest) {
      return 'La nouvelle agence de destination prend en charge le livreur.'
    }
  }
  if (!p.deliveryDriverId || !dest) return null
  if (p.status === 'Livré' || /Retour/.test(p.status || '') || p.status === 'Retourné') return null
  const drv: any = (await getDoc(doc(db, 'users', p.deliveryDriverId))).data() || {}
  const isGare = drv.role === 'livreur-gare' || /^En gare/i.test(p.deliveryDriverName || '')
  const drvCity = String(drv.city || (isGare ? String(p.deliveryDriverName || '').replace(/^En gare - /i, '') : ''))
  const sharedPair = (a: string, b: string) => [a, b].sort().join('|') === 'Agadir|Ait Melloul'
  if (drvCity === dest || (!isGare && sharedPair(drvCity, dest))) return null
  const portCashed = (p.portType === 'port_du' || p.portType === 'port_du_cheque') && (p.portStatus === 'collected' || p.portStatus === 'received')
  const codCashed = (parseFloat(String(p.codAmount ?? '').replace(',', '.')) || 0) > 0 && !!p.codStatus && p.codStatus !== 'pending'
  if (portCashed || codCashed) return `Livreur ${p.deliveryDriverName || ''} (${drvCity || 'autre ville'}) gardé : argent déjà encaissé — à régler par l'admin.`
  const now = new Date().toISOString()
  if (isGare) {
    const gare = await getGareDriverForCity(dest)
    if (gare) {
      await updateDoc(doc(db, 'parcels', parcelId), {
        deliveryDriverId: gare.id, deliveryDriverName: `En gare - ${dest}`, deliveryAssignedAt: now, deliveryAssignedBy: by,
        history: arrayUnion({ status: p.status, timestamp: now, note: `🚉 Destination corrigée → ${dest} : « ${p.deliveryDriverName || 'En gare'} » remplacé par « En gare - ${dest} » par ${by}` }),
      })
      return `Livreur remplacé par « En gare - ${dest} ».`
    }
  }
  await updateDoc(doc(db, 'parcels', parcelId), {
    deliveryDriverId: null, deliveryDriverName: null, deliverySectorId: null, deliverySectorCode: null, deliverySectorName: null,
    deliveryVehicleId: null, deliveryVehicleLabel: null, deliveryAssignedAt: null, deliveryAssignedBy: null,
    ...(p.status === 'En cours de livraison' ? { status: 'Arrivé en agence' } : {}),
    history: arrayUnion({ status: p.status === 'En cours de livraison' ? 'Arrivé en agence' : p.status, timestamp: now,
      note: `🚚 Destination corrigée → ${dest} : assignation à ${p.deliveryDriverName || 'un livreur'} (${drvCity || 'autre ville'}) retirée par ${by}` }),
  })
  return `Assignation à ${p.deliveryDriverName || 'un livreur'} (${drvCity || 'autre ville'}) retirée.`
}

export async function rejectDeliveryAssignment(parcelId: any, driverId: any, driverName: any, note = '') {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    // Retirer l'assignation de livraison (mettre à null au lieu de deleteField)
    deliveryDriverId:     null,
    deliveryDriverName:   null,
    deliverySectorId:     null,
    deliverySectorCode:   null,
    deliverySectorName:   null,
    deliveryVehicleId:    null,
    deliveryVehicleLabel: null,
    deliveryAssignedAt:   null,
    deliveryAssignedBy:   null,
    // Marquer le refus et remettre en agence
    status: 'Arrivé en agence',
    deliveryRejectedAt: now,
    deliveryRejectedById: driverId || null,
    deliveryRejectedBy: driverName || '',
    history: arrayUnion({
      status: 'Arrivé en agence',
      timestamp: now,
      note: note || `Livraison refusée par le livreur ${driverName || ''} - retour à l'agent destination`.trim()
    })
  })
}
// Annule l'assignation d'un colis à un livreur : le colis redevient "Arrivé en agence", sans livreur.
// ⛔ Refusé côté client ET côté règles Firestore (keepsDeliveredStatus) si le colis est déjà "Livré".
export async function cancelDeliveryAssignment(parcelId: any, previousDriverName: any, cancelledBy: any, keepStatus = false) {
  const now = new Date().toISOString()
  // 🔒 Argent déjà encaissé (port dû / COD) : l'expédition ne redevient pas « Arrivé en agence » (diagnostic du
  // 24/10/2026, point 1.4 — ex. 1086850, 1090665, 1096131 à Ait Melloul le 19/10 : encaissées puis remises en agence).
  // Il faut d'abord annuler l'encaissement. État RELU (pas celui de l'écran).
  if (!keepStatus) {
    const snap = await getDoc(doc(db, 'parcels', parcelId))
    const cur: any = snap.exists() ? snap.data() : null
    if (cur) {
      const portCashed = (cur.portType === 'port_du' || cur.portType === 'port_du_cheque') && (cur.portStatus === 'collected' || cur.portStatus === 'received')
      const codCashed = (parseFloat(String(cur.codAmount ?? '').replace(',', '.')) || 0) > 0 && !!cur.codStatus && cur.codStatus !== 'pending'
      if (portCashed || codCashed) {
        throw new Error(`${cur.senderNic || cur.trackingId || parcelId} : ${portCashed && codCashed ? 'port dû et COD déjà encaissés' : portCashed ? 'port dû déjà encaissé' : 'COD déjà encaissé'} — annulez d'abord l'encaissement avant d'annuler l'assignation.`)
      }
    }
  }
  // keepStatus : colis déjà "Livré" — le statut ne change pas (les règles Firestore interdisent de
  // quitter "Livré" hors Admin), seule l'assignation au livreur est retirée.
  await updateDoc(doc(db, 'parcels', parcelId), {
    deliveryDriverId:     null,
    deliveryDriverName:   null,
    deliverySectorId:     null,
    deliverySectorCode:   null,
    deliverySectorName:   null,
    deliveryVehicleId:    null,
    deliveryVehicleLabel: null,
    deliveryAssignedAt:   null,
    deliveryAssignedBy:   null,
    ...(keepStatus ? {} : { status: 'Arrivé en agence' }),
    history: arrayUnion({
      status: keepStatus ? 'Livré' : 'Arrivé en agence',
      timestamp: now,
      note: `Assignation annulée${previousDriverName ? ` (livreur : ${previousDriverName})` : ''}${cancelledBy ? ` par ${cancelledBy}` : ''}`
    })
  })
}
// Réassigne à un autre livreur un colis DÉJÀ "Livré" (port dû dont la collecte a été annulée).
// Le statut "Livré" est conservé : seuls les champs d'assignation changent.
export async function reassignDeliveredParcel(parcelId: any, driver: any, sector: any, by: any) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'parcels', parcelId), {
    deliveryDriverId:     driver.id,
    deliveryDriverName:   driver.name || 'Livreur',
    deliverySectorId:     sector?.id || null,
    deliverySectorCode:   sector?.code || '',
    deliverySectorName:   sector?.name || '',
    deliveryAssignedAt:   now,
    deliveryAssignedBy:   by || '',
    history: arrayUnion({
      status: 'Livré',
      timestamp: now,
      note: `Réassigné au livreur ${driver.name || 'Livreur'}${by ? ` par ${by}` : ''} (colis déjà livré, port dû à recollecter)`
    })
  })
}
export async function getDeliveryDriverParcels(driverId: any) {
  const q    = query(collection(db, 'parcels'), where('deliveryDriverId', '==', driverId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function createSector({ code, name, city, createdBy }: any) {
  const ref = doc(collection(db, 'sectors'))
  await setDoc(ref, {
    code:      code.trim().toUpperCase(),
    name:      (name || code).trim(),
    city,
    createdBy,
    createdAt: serverTimestamp(),
  })
  return ref.id
}
export async function updateSector(id: any, data: any) {
  await updateDoc(doc(db, 'sectors', id), data)
}
export async function deleteSector(id: any) {
  await deleteDoc(doc(db, 'sectors', id))
}
export function subscribeSectors(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'sectors'), where('city', '==', city), orderBy('code'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeAllSectors(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'sectors'), orderBy('code'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Bons de Ramassage ---------------------------------------------------------
export async function createBonRamasageBatch({ sectorId, sectorCode, chauffeurId, chauffeurName, count, city, createdBy }: any) {
  const stamp    = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand     = Math.random().toString(36).slice(2, 6).toUpperCase()
  const batchRef = `LOT-${stamp}-${rand}`
  const nexpCodes = Array.from({ length: count }, (_, i) =>
    `${sectorCode}-${rand}-${String(i + 1).padStart(3, '0')}`
  )
  const ref = doc(collection(db, 'bonRamasageBatches'))
  await setDoc(ref, {
    batchRef, sectorId, sectorCode, chauffeurId, chauffeurName,
    count, nexpCodes, city, createdBy, createdAt: serverTimestamp(),
  })
  return { id: ref.id, batchRef, nexpCodes }
}
export function subscribeBonRamasageBatches(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'bonRamasageBatches'),
    where('city', '==', city),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export async function deleteBonRamasageBatch(id: any) {
  await deleteDoc(doc(db, 'bonRamasageBatches', id))
}

// --- ARRIVAGES ---------------------------------------------------------------
export async function createArrivage({ city, arrivedColisDetail, missingParcelIds, missingColisDetail = [] as any[], colisWithoutBon = [] as any[], type, notes, agentId, agentName }: any) {
  // arrivedColisDetail = [{ parcelId, arrived, total }]
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand  = Math.random().toString(36).slice(2, 6).toUpperCase()
  const arrivageRef = `ARR-${stamp}-${rand}`
  const now = new Date().toISOString()

  const arrivedParcelIds   = arrivedColisDetail.map((d: any) => d.parcelId)
  const totalArrivedBoxes  = arrivedColisDetail.reduce((s: any, d: any) => s + d.arrived, 0)
  const totalExpectedBoxes = arrivedColisDetail.reduce((s: any, d: any) => s + d.total, 0)

  const ref = doc(collection(db, 'arrivages'))
  await setDoc(ref, {
    arrivageRef,
    city,
    type,
    arrivedParcelIds,
    arrivedColisDetail,
    missingParcelIds,
    missingColisDetail,
    colisWithoutBon,
    colisWithoutBonCount: colisWithoutBon.length,
    expectedCount:       arrivedColisDetail.length + missingParcelIds.length,
    arrivedCount:        arrivedColisDetail.length,
    missingCount:        missingParcelIds.length,
    partialMissingCount:  missingColisDetail.filter((d: any) => d.arrived > 0 && d.missing > 0).length,
    totalMissingBoxes:    missingColisDetail.reduce((s: any, d: any) => s + (d.missing || 0), 0),
    totalArrivedBoxes,
    totalExpectedBoxes,
    notes:               notes || '',
    agentId,
    agentName,
    confirmedAt:         serverTimestamp(),
    createdAt:           serverTimestamp(),
  })

  // Colis arrivés → "Arrivé en agence". 🔒 Chaque expédition est RELUE : une expédition déjà en livraison,
  // livrée ou en retour n'est PAS remise « Arrivé en agence » (avant : 430 expéditions livrées réécrites, stock et
  // caisse faussés) — seule une note est ajoutée à son historique.
  const NO_REARRIVAL = ['En cours de livraison', 'En livraison', 'Livré', 'Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
  const skippedParcelIds: string[] = []
  const skippedStatus: Record<string, string> = {}
  await Promise.all(arrivedColisDetail.map(({ parcelId, arrived, total }: any) => runTransaction(db, async tx => {
    const pref = doc(db, 'parcels', parcelId)
    const snap = await tx.get(pref)
    if (!snap.exists()) return
    const cur = snap.data()?.status || ''
    if (NO_REARRIVAL.includes(cur)) { skippedParcelIds.push(parcelId); skippedStatus[parcelId] = cur; return }
    const isPartial = arrived < total
    const noteText = isPartial
      ? `Arrivage partiel — ${arrived}/${total} colis reçus (Réf : ${arrivageRef})`
      : `Arrivage confirmé — Réf : ${arrivageRef}`
    tx.update(pref, {
      status: 'Arrivé en agence',
      visibleInDestinationAgency: true,
      destinationArrivedAt: now,
      destinationAgentId:   agentId,
      destinationAgentName: agentName,
      arrivedNbColis:       arrived,
      chefPointedAt:        now,
      chefPointedBy:        agentName,
      chefPointedById:      agentId,
      chefPointedSource:    'arrivage',
      history: arrayUnion({
        status: 'Arrivé en agence',
        timestamp: now,
        note: noteText,
      }),
    })
  })))
  if (skippedParcelIds.length) {
    // Traces (sans effet sur le statut) : dans l'arrivage et dans l'historique de chaque expédition ignorée
    try { await updateDoc(ref, { skippedParcelIds, skippedCount: skippedParcelIds.length }) } catch { /* trace seulement */ }
    await Promise.all(skippedParcelIds.map(id => updateDoc(doc(db, 'parcels', id), {
      history: arrayUnion({ status: skippedStatus[id], timestamp: now, note: `Présent dans l'arrivage ${arrivageRef} — déjà « ${skippedStatus[id]} », statut conservé` }),
    }).catch(() => { /* trace seulement */ })))
  }

  // Colis manquants ? note dans l'historique (status inchangé)
  await Promise.all(missingParcelIds.map((parcelId: any) =>
    updateDoc(doc(db, 'parcels', parcelId), {
      history: arrayUnion({
        status: 'En transit',
        timestamp: now,
        note: `Non reçu dans l'arrivage ${arrivageRef} — bon papier présent, colis totalement manquant`,
      }),
    })
  ))

  return { id: ref.id, arrivageRef, skippedParcelIds }
}

const sortArrivagesDocs = (docs: any) => docs.sort((a: any, b: any) => {
  const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.confirmedAt || 0)
  const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.confirmedAt || 0)
  return tb - ta
})
export function subscribeArrivages(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  // ⚡ Filtre ville CÔTÉ SERVEUR (index arrivages city+createdAt) : avant, les 60 derniers arrivages
  // de TOUTES les villes (~40 Ko chacun) étaient téléchargés puis filtrés ici. Tous les arrivages
  // portent un champ city (vérifié). 30 derniers de LA ville (avant : la part de la ville parmi les 60
  // derniers toutes villes, soit ~12 à 26). Sans ville : comportement inchangé.
  const q = city
    ? query(collection(db, 'arrivages'), where('city', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(30))
    : query(collection(db, 'arrivages'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(60))
  return onSnapshot(q, snap => {
    let docs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (city) docs = docs.filter(d => !d.city || d.city === city)
    callback(sortArrivagesDocs(docs))
  }, onError)
}
export function subscribeAllArrivedParcels(callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'parcels'), where('status', '==', 'Arrivé en agence'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeArrivedParcelsByCity(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(
    collection(db, 'parcels'),
    where('destinationCity', '==', city),
    where('status', '==', 'Arrivé en agence'),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeAllArrivages(callback: any, onError: (err?: any) => void = () => {}) {
  // Récupérer tous les arrivages sans filtre de date
  const q = query(collection(db, 'arrivages'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => {
    callback(sortArrivagesDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, onError)
}
export async function createAutoArrivageForCity(city: any, agentId: any, agentName: any, arrivedParcels: any, missingParcels: any) {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const autoRef = doc(db, 'arrivages', `auto-${city}-${today}`)
  const makeDetail = (p: any, extra = {}) => ({
    parcelId:      p.id,
    trackingId:    p.trackingId || '',
    senderName:    p.sender?.name || p.senderName || '',
    receiverName:  p.receiver?.name || p.receiverName || '',
    receiverPhone: p.receiver?.phone || p.receiverPhone || '',
    weight:        p.weight || 0,
    nbColis:       p.nbColis || 1,
    serviceType:   p.serviceType || '',
    originCity:    p.originCity || '',
    chauffeurName: p.chauffeurName || '',
    codAmount:     p.codAmount || 0,
    arrived:       p.nbColis || 1,
    total:         p.nbColis || 1,
    pointed:       false,
    ...extra,
  })
  await setDoc(autoRef, {
    arrivageRef:        `ARR-AUTO-${today}`,
    city,
    type:               'auto',
    pointageStatus:     'pending',
    arrivedParcelIds:   arrivedParcels.map((p: any) => p.id),
    arrivedColisDetail: arrivedParcels.map((p: any) => makeDetail(p)),
    missingParcelIds:   missingParcels.map((p: any) => p.id),
    missingColisDetail: missingParcels.map((p: any) => makeDetail(p, { arrived: 0 })),
    arrivedCount:       arrivedParcels.length,
    missingCount:       missingParcels.length,
    totalArrivedBoxes:  arrivedParcels.reduce((s: any, p: any) => s + (p.nbColis || 1), 0),
    totalExpectedBoxes: (arrivedParcels.length + missingParcels.length),
    agentId,
    agentName,
    createdAt:          serverTimestamp(),
  }, { merge: true })
}
export async function saveArrivagePointage(arrivageId: any, {
  arrivedColisDetail, missingColisDetail = [] as any[], missingParcelIds = [] as any[],
  arrivageRef, markDone, pointedById, pointedBy,
}: any) {
  const now = new Date().toISOString()
  const totalArrivedBoxes = arrivedColisDetail.reduce((s: any, d: any) => s + (d.arrived || 0), 0)
  const updates: Record<string, any> = {
    arrivedColisDetail,
    arrivedParcelIds:  arrivedColisDetail.map((d: any) => d.parcelId),
    arrivedCount:      arrivedColisDetail.length,
    totalArrivedBoxes,
    missingColisDetail,
    missingParcelIds,
    missingCount:      missingParcelIds.length,
    pointageStatus:    markDone ? 'done' : 'in_progress',
    pointageUpdatedAt: now,
  }
  if (markDone) {
    updates.pointedAt   = now
    updates.pointedById = pointedById
    updates.pointedBy   = pointedBy
  }
  await updateDoc(doc(db, 'arrivages', arrivageId), updates)
  if (markDone && arrivedColisDetail.length > 0) {
    await Promise.all(arrivedColisDetail.map((d: any) =>
      updateDoc(doc(db, 'parcels', d.parcelId), {
        status: 'Arrivé en agence',
        visibleInDestinationAgency: true,
        destinationArrivedAt: now,
        destinationAgentId: pointedById || null,
        destinationAgentName: pointedBy || '',
        arrivedNbColis: d.arrived || d.total || 1,
        chefPointedAt: now,
        chefPointedBy: pointedBy || '',
        chefPointedById: pointedById || null,
        chefPointedSource: 'arrivage',
        history: arrayUnion({
          status: 'Arrivé en agence',
          timestamp: now,
          note: d.addedDuringPointage
            ? `Ajouté au pointage — Réf : ${arrivageRef}`
            : `Pointage arrivage validé — Réf : ${arrivageRef}`,
        }),
      })
    ))
  }
}

// ── BONS DE LIVRAISON (DELIVERY SHEETS) ──────────────────────────────────────

/**
 * Crée un bon de livraison (snapshot des colis assignés à un livreur)
 * Appelé automatiquement à chaque impression de tableau livreur
 */
export async function createDeliverySheet(params: {
  agencyCity: string
  driverId: string
  driverName: string
  driverPhone?: string
  sectorId?: string
  sectorName?: string
  sectorCode?: string
  parcels: any[]
  createdBy: string
  createdById: string
}) {
  const now = new Date().toISOString()
  const parcelIds = params.parcels.map(p => p.id)

  // Snapshot des données des colis au moment de la création
  const parcelsSnapshot = params.parcels.map(p => ({
    id: p.id,
    trackingId: p.trackingId,
    status: p.status,
    sender: p.sender,
    receiver: p.receiver,
    destinationCity: p.destinationCity,
    price: p.price,
    codAmount: p.codAmount,
    weight: p.weight,
    nbColis: p.nbColis,
    natureOfGoods: p.natureOfGoods,
  }))

  // Calculer les stats initiales
  const stats = {
    total: parcelsSnapshot.length,
    delivered: parcelsSnapshot.filter(p => p.status === 'Livré').length,
    inTransit: parcelsSnapshot.filter(p => p.status === 'En transit').length,
    returned: parcelsSnapshot.filter(p => p.status === 'Retourné').length,
    pending: parcelsSnapshot.filter(p => !['Livré', 'En transit', 'Retourné'].includes(p.status)).length,
  }

  const sheet = {
    createdAt: serverTimestamp(),
    createdAtString: now,
    agencyCity: params.agencyCity,
    driverId: params.driverId,
    driverName: params.driverName,
    driverPhone: params.driverPhone || '',
    sectorId: params.sectorId || '',
    sectorName: params.sectorName || '',
    sectorCode: params.sectorCode || '',
    parcelIds,
    parcelsSnapshot,
    createdBy: params.createdBy,
    createdById: params.createdById,
    status: 'active' as const,
    stats,
    lastPrintedAt: now,
    printCount: 1,
  }

  const docRef = await addDoc(collection(db, 'deliverySheets'), sheet)
  return { id: docRef.id, ...sheet }
}

/**
 * Récupère les bons de livraison d'une agence
 */
export function subscribeDeliverySheets(
  agencyCity: string,
  callback: (sheets: any[]) => void,
  onError: (err?: any) => void = () => {}
) {
  const since = daysAgoTimestamp(90) // 90 jours d'historique
  const q = query(
    collection(db, 'deliverySheets'),
    where('agencyCity', '==', agencyCity),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(200)
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  )
}

/**
 * Récupère un bon de livraison par ID
 */
export async function getDeliverySheet(sheetId: string) {
  const docSnap = await getDoc(doc(db, 'deliverySheets', sheetId))
  if (!docSnap.exists()) return null
  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Met à jour un bon de livraison
 */
export async function updateDeliverySheet(sheetId: string, updates: any) {
  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Marque un bon comme réimprimé
 */
export async function markDeliverySheetReprinted(sheetId: string) {
  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    lastPrintedAt: new Date().toISOString(),
    printCount: increment(1),
  })
}

/**
 * Ajoute des colis à un bon existant
 */
export async function addParcelsToDeliverySheet(sheetId: string, parcels: any[]) {
  const sheet = await getDeliverySheet(sheetId)
  if (!sheet) throw new Error('Bon de livraison introuvable')

  const newParcelIds = parcels.map(p => p.id).filter(id => !sheet.parcelIds.includes(id))
  if (newParcelIds.length === 0) return

  const newSnapshots = parcels
    .filter(p => !sheet.parcelIds.includes(p.id))
    .map(p => ({
      id: p.id,
      trackingId: p.trackingId,
      status: p.status,
      sender: p.sender,
      receiver: p.receiver,
      destinationCity: p.destinationCity,
      price: p.price,
      codAmount: p.codAmount,
      weight: p.weight,
      nbColis: p.nbColis,
      natureOfGoods: p.natureOfGoods,
    }))

  // Recalculer les stats avec les nouveaux colis
  const updatedSnapshots = [...sheet.parcelsSnapshot, ...newSnapshots]
  const stats = {
    total: updatedSnapshots.length,
    delivered: updatedSnapshots.filter(p => p.status === 'Livré').length,
    inTransit: updatedSnapshots.filter(p => p.status === 'En transit').length,
    returned: updatedSnapshots.filter(p => p.status === 'Retourné').length,
    pending: updatedSnapshots.filter(p => !['Livré', 'En transit', 'Retourné'].includes(p.status)).length,
  }

  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    parcelIds: arrayUnion(...newParcelIds),
    parcelsSnapshot: arrayUnion(...newSnapshots),
    stats,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Retire des colis d'un bon
 */
export async function removeParcelsFromDeliverySheet(sheetId: string, parcelIds: string[]) {
  const sheet = await getDeliverySheet(sheetId)
  if (!sheet) throw new Error('Bon de livraison introuvable')

  const updatedParcelIds = sheet.parcelIds.filter((id: string) => !parcelIds.includes(id))
  const updatedSnapshots = sheet.parcelsSnapshot.filter((p: any) => !parcelIds.includes(p.id))

  // Recalculer les stats après suppression
  const stats = {
    total: updatedSnapshots.length,
    delivered: updatedSnapshots.filter(p => p.status === 'Livré').length,
    inTransit: updatedSnapshots.filter(p => p.status === 'En transit').length,
    returned: updatedSnapshots.filter(p => p.status === 'Retourné').length,
    pending: updatedSnapshots.filter(p => !['Livré', 'En transit', 'Retourné'].includes(p.status)).length,
  }

  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    parcelIds: updatedParcelIds,
    parcelsSnapshot: updatedSnapshots,
    stats,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Marque un bon comme terminé
 */
export async function completeDeliverySheet(sheetId: string) {
  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  })
}

/**
 * Annule un bon
 */
export async function cancelDeliverySheet(sheetId: string, reason?: string) {
  await updateDoc(doc(db, 'deliverySheets', sheetId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    cancelReason: reason || '',
  })
}

// -- Retards de livraison (Delivery Delays) ----------------------------------

/**
 * Crée un nouveau retard de livraison
 */
export async function createDeliveryDelay(data: {
  parcelId: string
  senderNic: string
  driverId: string
  driverName: string
  city: string
  reason: string
  reasonDetail?: string
  createdBy: string
  createdById: string | null
}) {
  const ref = await addDoc(collection(db, 'deliveryDelays'), {
    parcelId: data.parcelId,
    senderNic: data.senderNic,
    driverId: data.driverId,
    driverName: data.driverName,
    city: data.city,
    reason: data.reason,
    reasonDetail: data.reasonDetail || '',
    createdBy: data.createdBy,
    createdById: data.createdById,
    resolvedAt: null,
    resolvedBy: null,
    resolvedById: null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Met à jour un retard de livraison
 */
export async function updateDeliveryDelay(delayId: string, data: any) {
  await updateDoc(doc(db, 'deliveryDelays', delayId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Supprime un retard de livraison
 */
export async function deleteDeliveryDelay(delayId: string) {
  await deleteDoc(doc(db, 'deliveryDelays', delayId))
}

/**
 * Abonnement aux retards de livraison par ville
 */
export function subscribeDeliveryDelays(
  city: string,
  callback: (delays: any[]) => void,
  onError: (err?: any) => void = () => {}
) {
  const q = query(
    collection(db, 'deliveryDelays'),
    where('city', '==', city),
    orderBy('createdAt', 'desc'),
    limit(200)
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  )
}

/**
 * Récupère les retards non résolus pour un livreur
 */
export async function getDriverActiveDelays(driverId: string) {
  const q = query(
    collection(db, 'deliveryDelays'),
    where('driverId', '==', driverId),
    where('resolvedAt', '==', null)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Récupère les retards pour un colis spécifique
 */
export async function getParcelDelays(parcelId: string) {
  const q = query(
    collection(db, 'deliveryDelays'),
    where('parcelId', '==', parcelId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
