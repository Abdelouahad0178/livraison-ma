
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { CITIES, STATUSES } from './constants'
import { daysAgoTimestamp } from './firestoreUtils'
import { isParcelVisibleInDestinationAgency } from './parcels'

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
          .filter(p => p.codStatus === 'collected' && p.codAmount > 0 && p.codPaymentType !== 'bon_livraison')
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
  callbackWithLastDoc?: (lastDocs: any) => void // Callback pour retourner les derniers documents (pagination)
) {
  const since = daysAgoTimestamp(30)

  // Deux requêtes : colis assignés + colis retournés par ce livreur (historique)
  const q1 = query(collection(db, 'parcels'), where('deliveryDriverId', '==', driverId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))
  const q2 = query(collection(db, 'parcels'), where('returnedByDriverId', '==', driverId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(pageLimit))

  let assigned: any[] = []
  let returned: any[] = []
  let lastAssignedDoc: any = null
  let lastReturnedDoc: any = null

  const merge = () => {
    // Fusionner et dédupliquer par ID
    const map = new Map()
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

  return () => {
    unsub1()
    unsub2()
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

  // Colis arrivés ? "Arrivé en agence"
  await Promise.all(arrivedColisDetail.map(({ parcelId, arrived, total }: any) => {
    const isPartial = arrived < total
    const noteText = isPartial
      ? `Arrivage partiel — ${arrived}/${total} colis reçus (Réf : ${arrivageRef})`
      : `Arrivage confirmé — Réf : ${arrivageRef}`
    return updateDoc(doc(db, 'parcels', parcelId), {
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
  }))

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

  return { id: ref.id, arrivageRef }
}

const sortArrivagesDocs = (docs: any) => docs.sort((a: any, b: any) => {
  const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.confirmedAt || 0)
  const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.confirmedAt || 0)
  return tb - ta
})
export function subscribeArrivages(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'arrivages'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(60))
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
