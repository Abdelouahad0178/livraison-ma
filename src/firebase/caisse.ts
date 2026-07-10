
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import type { CaisseEntry } from '../types'
import { CAISSE_CATEGORIES, REGLEMENT_MODES, CITIES } from './constants'
import { daysAgoTimestamp, sortByCreatedDesc } from './firestoreUtils'

// 🔒 Fonction sécurisée pour parser les montants
const safeParseAmount = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0
  const num = parseFloat(String(value).replace(',', '.'))
  return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
}

export async function createCaisseEntry(data: Record<string, unknown>): Promise<string> {
  const amount = safeParseAmount(data.amount)

  // 🛡️ VALIDATION: Port dû ne peut JAMAIS être une sortie
  if (data.type === 'sortie' && data.category === 'port_du') {
    console.error('❌ ERREUR CRITIQUE: Tentative de créer une SORTIE avec category port_du!', data)
    throw new Error('Un encaissement de port dû ne peut pas être une sortie. Type forcé à "entree".')
  }

  const ref = await addDoc(collection(db, 'caisseEntries'), {
    type:        data.type,
    category:    data.category,
    amount,
    description: data.description  || '',
    reference:   data.reference    || '',
    agentId:     data.agentId      || null,
    agentName:   data.agentName    || null,
    sourceAgentId:   data.sourceAgentId   || null,
    sourceAgentName: data.sourceAgentName || '',
    staffId:     data.staffId      || null,
    staffName:   data.staffName    || null,
    staffRole:   data.staffRole    || '',
    salaryMonth: data.salaryMonth  || '',
    paymentKind: data.paymentKind  || '',
    city:        data.city,
    cashierId:   data.cashierId    || null,
    cashierName: data.cashierName  || '',
    note:        data.note         || '',
    createdById:   data.createdById   || null,  // ⭐ NOUVEAU : ID du créateur
    createdByRole: data.createdByRole || null,  // ⭐ NOUVEAU : Rôle du créateur
    cashAdjusted:  false,  // ✅ FIX C5: Tag pour tracer si agencyCashes a été ajusté
    createdAt:   serverTimestamp(),
  })
  return ref.id
}
export async function deleteCaisseEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, 'caisseEntries', id))
}
export async function updateCaisseEntry(id: string, data: Partial<CaisseEntry> & Record<string, unknown>): Promise<void> {
  const amount = safeParseAmount(data.amount)
  if (!id) throw new Error('Mouvement invalide.')
  if (!amount || amount <= 0) throw new Error('Le montant doit etre superieur a 0.')
  await updateDoc(doc(db, 'caisseEntries', id), {
    type:        data.type,
    category:    data.category,
    amount,
    description: data.description || '',
    reference:   data.reference || '',
    agentName:   data.agentName || null,
    staffId:     data.staffId || null,
    staffName:   data.staffName || null,
    staffRole:   data.staffRole || '',
    salaryMonth: data.salaryMonth || '',
    paymentKind: data.paymentKind || '',
    note:        data.note || '',
    updatedAt:   serverTimestamp(),
    updatedBy:   data.updatedBy || '',
  })
}
export async function deleteCaisseEntries(ids: string[] = []): Promise<number> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < uniqueIds.length; i += 450) {
    const batch = writeBatch(db)
    uniqueIds.slice(i, i + 450).forEach(id => {
      batch.delete(doc(db, 'caisseEntries', id))
    })
    await batch.commit()
  }
  return uniqueIds.length
}

async function deleteDocsFromQueries(queryList: any[] = []) {
  const docsByPath = new Map()
  for (const q of queryList) {
    const snap = await getDocs(q)
    snap.docs.forEach(d => docsByPath.set(d.ref.path, d.ref))
  }

  const refs = [...docsByPath.values()]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref))
    await batch.commit()
  }
  return refs.length
}
export async function deleteAgentCashierHistory(agentId: any) {
  if (!agentId) return 0
  return deleteDocsFromQueries([
    query(collection(db, 'caissierTransactions'), where('agentId', '==', agentId)),
    query(collection(db, 'agentCashRecoveryRequests'), where('agentId', '==', agentId)),
    query(collection(db, 'caissierRemarks'), where('agentId', '==', agentId)),
    query(collection(db, 'agentRemises'), where('agentId', '==', agentId)),
  ])
}
export async function createAgentRemise(data: any) {
  const ref = await addDoc(collection(db, 'agentRemises'), {
    agentId:      data.agentId,
    agentName:    data.agentName,
    city:         data.city,
    totalEspeces: parseFloat(data.totalEspeces) || 0,
    totalCheques: parseFloat(data.totalCheques) || 0,
    totalVirement:parseFloat(data.totalVirement)|| 0,
    totalAutres:  parseFloat(data.totalAutres)  || 0,
    total:        parseFloat(data.total)        || 0,
    note:         data.note || '',
    createdAt:    serverTimestamp(),
  })
  return ref.id
}
export function subscribeAgentRemises(agentId: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'agentRemises'),
    where('agentId', '==', agentId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeCaisseByCity(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'caisseEntries'), where('city', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(300))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeAllCaisse(callback: any, onError: (err?: any) => void = () => {}) {
  // 180 jours pour plus de données sans crasher Firestore
  const since = daysAgoTimestamp(180)
  const q = query(collection(db, 'caisseEntries'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(300))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Remarques caissier ------------------------------------------
export const REMARK_TYPES = [
  { key: 'manque_especes',  label: 'Manque espèces',   emoji: '!', color: 'bg-red-100 text-red-700 border-red-200'       },
  { key: 'manque_cheques',  label: 'Manque chèques',   emoji: '!', color: 'bg-orange-100 text-orange-700 border-orange-200'},
  { key: 'manque_virement', label: 'Manque virement',  emoji: '!', color: 'bg-yellow-100 text-yellow-700 border-yellow-200'},
  { key: 'manque_cod',      label: 'Manque RETOUR FOND',       emoji: '!', color: 'bg-amber-100 text-amber-700 border-amber-200'  },
  { key: 'defaut_agent',    label: 'Défaut agent',     emoji: '!', color: 'bg-purple-100 text-purple-700 border-purple-200'},
  { key: 'retard_remise',   label: 'Retard de remise', emoji: '!', color: 'bg-blue-100 text-blue-700 border-blue-200'     },
  { key: 'autre',           label: 'Autre remarque',   emoji: 'i', color: 'bg-gray-100 text-gray-700 border-gray-200'     },
]
export async function createCaissierRemark(data: any) {
  const ref = await addDoc(collection(db, 'caissierRemarks'), {
    agentName:    data.agentName   || '',
    agentId:      data.agentId     || null,
    type:         data.type,
    amount:       parseFloat(data.amount) || 0,
    description:  data.description || '',
    city:         data.city,
    caissierName: data.caissierName || '',
    caissierId:   data.caissierId  || null,
    resolved:     false,
    resolvedAt:   null,
    createdAt:    serverTimestamp(),
  })
  return ref.id
}
export async function resolveRemark(id: any) {
  await updateDoc(doc(db, 'caissierRemarks', id), {
    resolved:   true,
    resolvedAt: serverTimestamp(),
  })
}
export async function deleteRemark(id: any) {
  await deleteDoc(doc(db, 'caissierRemarks', id))
}
export function subscribeCaissierRemarks(city: any, callback: any) {
  const q = query(
    collection(db, 'caissierRemarks'),
    where('city', '==', city)
  )
  return onSnapshot(
    q,
    snap => {
      const docs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return db_ - da
      })
      callback(docs)
    },
    err => { console.error('subscribeCaissierRemarks:', err); callback([]) }
  )
}
export function subscribeAllCaissierRemarks(callback: any) {
  // Récupérer toutes les remarques sans filtre de date
  const q = query(collection(db, 'caissierRemarks'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('subscribeAllCaissierRemarks:', err); callback([]) }
  )
}

// -- Clôtures de caisse ------------------------------------------
export async function createCaisseCloture(data: any) {
  const ref = await addDoc(collection(db, 'caisseClotures'), {
    city:         data.city,
    closedBy:     data.closedBy,
    closedById:   data.closedById,
    periodFrom:   data.periodFrom || null,
    periodTo:     new Date().toISOString(),
    totalEntrees: parseFloat(data.totalEntrees) || 0,
    totalSorties: parseFloat(data.totalSorties) || 0,
    solde:        parseFloat(data.solde) || 0,
    entriesCount: parseInt(data.entriesCount)  || 0,
    note:         data.note || '',
    closedAt:     serverTimestamp(),
  })
  return ref.id
}
export function subscribeAllCaisseClotures(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'caisseClotures'), orderBy('closedAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

export {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  subscribeVehicles,
} from './vehicles'

export {
  DIRECTOR_ACTION_ICONS,
  logDirectorAction,
  subscribeDirectorLogs,
} from './directorLogs'

// -- Transactions Caissier (Dépôts des Agents) ------------------
export async function createCaissierTransaction(data: any) {
  const ref = await addDoc(collection(db, 'caissierTransactions'), {
    city:         data.city,
    agentId:      data.agentId,
    agentName:    data.agentName,
    caisserId:    data.caisserId,
    cashierName:  data.cashierName,
    amount:       parseFloat(data.amount) || 0,
    amountEspeces:   parseFloat(data.amountEspeces) || 0,
    amountCheques:   parseFloat(data.amountCheques) || 0,
    amountVirement:  parseFloat(data.amountVirement) || 0,
    description:  data.description || '',
    reference:    data.reference || '',
    createdAt:    serverTimestamp(),
  })
  return ref.id
}
export function subscribeCaissierTransactions(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'caissierTransactions'),
    where('city', '==', city)
  )
  return onSnapshot(q, snap => callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])), onError)
}
export function subscribeAllCaissierTransactions(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'caissierTransactions'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Demandes de Caisse (Approbation Admin) ------------------
export async function createAgentCashRecoveryRequest(data: any) {
  const ref = await addDoc(collection(db, 'agentCashRecoveryRequests'), {
    city:         data.city,
    agentId:      data.agentId,
    agentName:    data.agentName,
    cashierId:    data.cashierId,
    cashierName:  data.cashierName,
    amount:       parseFloat(data.amount) || 0,
    description:  data.description || '',
    status:       'pending',
    approvedBy:   null,
    approvedById: null,
    approvedAt:   null,
    rejectedBy:   null,
    rejectedById: null,
    rejectedAt:   null,
    rejectionReason: '',
    completedAt:  null,
    reference:    '',
    createdAt:    serverTimestamp(),
  })
  return ref.id
}
export async function approveAgentCashRecoveryRequest(requestId: any, data: any = {}) {
  await updateDoc(doc(db, 'agentCashRecoveryRequests', requestId), {
    status:       'approved',
    approvedBy:   data.approvedBy || 'Caissier',
    approvedById: data.approvedById || '',
    approvedAt:   serverTimestamp(),
    completedAt:  serverTimestamp(),
    reference:    data.reference || '',
  })
}
export async function rejectAgentCashRecoveryRequest(requestId: any, data: any = {}) {
  await updateDoc(doc(db, 'agentCashRecoveryRequests', requestId), {
    status:          'rejected',
    rejectedBy:      data.rejectedBy || 'Caissier',
    rejectedById:    data.rejectedById || '',
    rejectedAt:      serverTimestamp(),
    rejectionReason: data.rejectionReason || '',
  })
}
export function subscribeAgentCashRecoveryRequests(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'agentCashRecoveryRequests'),
    where('city', '==', city)
  )
  return onSnapshot(q, snap => callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])), onError)
}
export const CAISSE_REQUEST_TYPES = [
  { key: 'virement_banque',  label: 'Virement à la banque', emoji: 'B', color: 'bg-blue-100 text-blue-700' },
  { key: 'stockage_coffre',  label: 'Stockage au coffre',   emoji: 'C', color: 'bg-amber-100 text-amber-700' },
  { key: 'retrait_especes',  label: 'Retrait espèces',     emoji: '$', color: 'bg-green-100 text-green-700' },
]
export async function createCaisseRequest(data: any) {
  const ref = await addDoc(collection(db, 'caissierRequests'), {
    city:         data.city,
    caisserId:    data.caisserId || null,
    cashierName:  data.cashierName || '',
    source:       data.source || 'caissier',
    requestedBy:  data.requestedBy || data.cashierName || '',
    requestedById:data.requestedById || data.caisserId || null,
    type:         data.type,
    amount:       parseFloat(data.amount) || 0,
    description:  data.description || '',
    reference:    data.reference || '',
    category:     data.category || '',
    staffId:      data.staffId || null,
    staffName:    data.staffName || '',
    staffRole:    data.staffRole || '',
    salaryMonth:  data.salaryMonth || '',
    paymentKind:  data.paymentKind || '',
    note:         data.note || '',
    status:       'pending',
    approvedBy:   null,
    approvedById: null,
    approvedAt:   null,
    rejectionReason: null,
    createdAt:    serverTimestamp(),
    completedAt:  null,
  })
  return ref.id
}
export async function approveCaisseRequest(requestId: any, approvedBy = 'Admin', approvedById = '') {
  await updateDoc(doc(db, 'caissierRequests', requestId), {
    status:       'approved',
    approvedBy,
    approvedById,
    approvedAt:   serverTimestamp(),
  })
}
export async function rejectCaisseRequest(requestId: any, rejectionReason = '') {
  await updateDoc(doc(db, 'caissierRequests', requestId), {
    status:       'rejected',
    rejectionReason,
  })
}
export async function completeCaisseRequest(requestId: any, extra = {}) {
  await updateDoc(doc(db, 'caissierRequests', requestId), {
    status:     'completed',
    completedAt: serverTimestamp(),
    ...extra,
  })
}
export async function completeRhSalaryCaisseRequest(requestId: any, cashier: any = {}) {
  if (!requestId) throw new Error('Demande RH invalide.')

  await runTransaction(db, async tx => {
    const requestRef = doc(db, 'caissierRequests', requestId)
    const requestSnap = await tx.get(requestRef)
    if (!requestSnap.exists()) throw new Error('Demande RH introuvable.')

    const req = requestSnap.data()
    if (req.source !== 'rh') throw new Error('Cette demande n est pas une demande RH.')
    if (req.status !== 'pending') throw new Error('Cette demande RH est deja traitee.')

    const amount = parseFloat(req.amount || 0) || 0
    const city = req.city || cashier.city
    if (!city) throw new Error('Agence invalide.')
    if (amount <= 0) throw new Error('Montant RH invalide.')

    const cashRef = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    const currentSolde = parseFloat(cash.solde || 0) || 0
    const currentEspeces = parseFloat(cash.soldeEspeces ?? cash.solde ?? 0) || 0
    if (currentSolde < amount || currentEspeces < amount) {
      throw new Error(`Solde insuffisant. Disponible: ${Math.min(currentSolde, currentEspeces)} DH.`)
    }

    const category = req.category || req.paymentKind || (req.type === 'rh_avance' ? 'avance' : 'salaire')
    const entryRef = doc(collection(db, 'caisseEntries'))
    tx.set(entryRef, {
      type:        'sortie',
      category,
      amount,
      description: req.description || `${category === 'salaire' ? 'Salaire' : 'Avance salaire'} ${req.staffName || ''}`,
      reference:   req.reference || requestId,
      staffId:     req.staffId || null,
      staffName:   req.staffName || '',
      staffRole:   req.staffRole || '',
      salaryMonth: req.salaryMonth || '',
      paymentKind: category,
      city,
      cashierId:   cashier.cashierId || null,
      cashierName: cashier.cashierName || 'Caissier',
      note:        req.note || `Demande RH ${req.requestedBy || ''}`,
      rhRequestId: requestId,
      createdAt:   serverTimestamp(),
    })

    tx.set(cashRef, {
      city,
      solde: Math.max(0, currentSolde - amount),
      soldeEspeces: Math.max(0, currentEspeces - amount),
      soldeCheques: parseFloat(cash.soldeCheques || 0) || 0,
      soldeVirement: parseFloat(cash.soldeVirement || 0) || 0,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: cashier.cashierName || 'Caissier',
    }, { merge: true })

    tx.update(requestRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      completedBy: cashier.cashierName || 'Caissier',
      completedById: cashier.cashierId || null,
      cashEntryId: entryRef.id,
    })
  })
}
export function subscribeCaisseRequests(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'caissierRequests'),
    where('city', '==', city)
  )
  return onSnapshot(q, snap => callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])), onError)
}
export function subscribeAllCaisseRequests(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'caissierRequests'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Caisse Agence (Solde consolidé par agence) ------------------
export async function updateAgencyCash(city: any, data: any) {
  await setDoc(doc(db, 'agencyCashes', city), {
    city,
    solde:        parseFloat(data.solde) || 0,
    soldeEspeces: parseFloat(data.soldeEspeces) || 0,
    soldeCheques: parseFloat(data.soldeCheques) || 0,
    soldeVirement:parseFloat(data.soldeVirement) || 0,
    lastUpdatedAt: serverTimestamp(),
    lastUpdatedBy: data.lastUpdatedBy || 'System',
  }, { merge: true })
}
export async function adjustAgencyCash(city: any, data: any) {
  const soldeDelta = parseFloat(data.soldeDelta || 0) || 0
  const especesDelta = parseFloat(data.especesDelta ?? soldeDelta) || 0
  const chequesDelta = parseFloat(data.chequesDelta || 0) || 0
  const virementDelta = parseFloat(data.virementDelta || 0) || 0

  if (!city) throw new Error('Agence invalide.')

  await runTransaction(db, async tx => {
    const ref = doc(db, 'agencyCashes', city)
    const snap = await tx.get(ref)
    const cash = snap.exists()
      ? snap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const nextSolde = (parseFloat(cash.solde || 0) || 0) + soldeDelta
    const nextEspeces = (parseFloat(cash.soldeEspeces || 0) || 0) + especesDelta
    const nextCheques = (parseFloat(cash.soldeCheques || 0) || 0) + chequesDelta
    const nextVirement = (parseFloat(cash.soldeVirement || 0) || 0) + virementDelta
    if (nextSolde < 0 || nextEspeces < 0 || nextCheques < 0 || nextVirement < 0) {
      throw new Error('Solde de caisse insuffisant.')
    }
    tx.set(ref, {
      city,
      solde: nextSolde,
      soldeEspeces: nextEspeces,
      soldeCheques: nextCheques,
      soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: data.lastUpdatedBy || 'System',
    }, { merge: true })
  })
}

// Ajuster le solde de la caisse centrale (Encaisseur central)
export async function adjustCentralCash(data: any) {
  const soldeDelta = parseFloat(data.soldeDelta || 0) || 0
  const especesDelta = parseFloat(data.especesDelta ?? soldeDelta) || 0
  const chequesDelta = parseFloat(data.chequesDelta || 0) || 0
  const virementDelta = parseFloat(data.virementDelta || 0) || 0

  await runTransaction(db, async tx => {
    const ref = doc(db, 'centralCash', 'main')
    const snap = await tx.get(ref)
    const cash = snap.exists()
      ? snap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    const nextSolde = (parseFloat(cash.solde || 0) || 0) + soldeDelta
    const nextEspeces = (parseFloat(cash.soldeEspeces || 0) || 0) + especesDelta
    const nextCheques = (parseFloat(cash.soldeCheques || 0) || 0) + chequesDelta
    const nextVirement = (parseFloat(cash.soldeVirement || 0) || 0) + virementDelta

    if (nextSolde < 0 || nextEspeces < 0 || nextCheques < 0 || nextVirement < 0) {
      throw new Error('Solde de caisse centrale insuffisant.')
    }

    tx.set(ref, {
      solde: nextSolde,
      soldeEspeces: nextEspeces,
      soldeCheques: nextCheques,
      soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: data.lastUpdatedBy || 'Admin',
      reason: data.reason || '',
    }, { merge: true })
  })
}

// Subscribe au solde de la caisse centrale
export function subscribeCentralCash(callback: any, onError: (err?: any) => void = () => {}) {
  const ref = doc(db, 'centralCash', 'main')
  return onSnapshot(ref, snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  }, onError)
}

// -- Helpers internes ----------------------------------------------------------

export function buildCaisseEntryPayload(data: Record<string, any>) {
  // 🛡️ VALIDATION: Port dû ne peut JAMAIS être une sortie
  if (data.type === 'sortie' && data.category === 'port_du') {
    console.error('❌ ERREUR CRITIQUE: Tentative de créer une SORTIE avec category port_du!', data)
    throw new Error('Un encaissement de port dû ne peut pas être une sortie. Type forcé à "entree".')
  }

  return {
    type:            data.type,
    category:        data.category,
    amount:          parseFloat(data.amount) || 0,
    description:     data.description  || '',
    reference:       data.reference    || '',
    agentId:         data.agentId      || null,
    agentName:       data.agentName    || null,
    sourceAgentId:   data.sourceAgentId   || null,
    sourceAgentName: data.sourceAgentName || '',
    staffId:         data.staffId      || null,
    staffName:       data.staffName    || null,
    staffRole:       data.staffRole    || '',
    salaryMonth:     data.salaryMonth  || '',
    paymentKind:     data.paymentKind  || '',
    city:            data.city,
    cashierId:       data.cashierId    || null,
    cashierName:     data.cashierName  || '',
    note:            data.note         || '',
    createdAt:       serverTimestamp(),
  }
}

function _applyCashAdjust(cash: any, adj: any) {
  const soldeDelta    = parseFloat(adj.soldeDelta    || 0) || 0
  const especesDelta  = parseFloat(adj.especesDelta  ?? soldeDelta) || 0
  const chequesDelta  = parseFloat(adj.chequesDelta  || 0) || 0
  const virementDelta = parseFloat(adj.virementDelta || 0) || 0
  const nextSolde     = (parseFloat(cash.solde        || 0) || 0) + soldeDelta
  const nextEspeces   = (parseFloat(cash.soldeEspeces || 0) || 0) + especesDelta
  const nextCheques   = (parseFloat(cash.soldeCheques || 0) || 0) + chequesDelta
  const nextVirement  = (parseFloat(cash.soldeVirement|| 0) || 0) + virementDelta
  if (nextSolde < 0 || nextEspeces < 0 || nextCheques < 0 || nextVirement < 0)
    throw new Error(`Solde de caisse insuffisant. Disponible: ${Math.max(0, parseFloat(cash.solde || 0))} DH.`)
  return { nextSolde, nextEspeces, nextCheques, nextVirement }
}

// Crée une entrée caisse ET ajuste le solde agence en une seule transaction atomique.
export async function createCaisseEntryAtomic(entryData: any, adjustData: any) {
  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', entryData.city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, adjustData)

    const entryRef = doc(collection(db, 'caisseEntries'))
    const payload = buildCaisseEntryPayload(entryData)
    // ✅ FIX C5: Marquer que cette entrée a ajusté agencyCashes
    tx.set(entryRef, { ...payload, cashAdjusted: true })
    tx.set(cashRef, {
      city: entryData.city,
      solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: adjustData.lastUpdatedBy || 'System',
    }, { merge: true })

    return entryRef.id
  })
}

// Supprime une entrée caisse ET ajuste le solde agence atomiquement.
export async function deleteCaisseEntryAtomic(id: any, city: any, adjustData: any) {
  await runTransaction(db, async tx => {
    // ✅ FIX C4: Lire l'entrée d'abord pour éviter double suppression
    const entryRef = doc(db, 'caisseEntries', id)
    const entrySnap = await tx.get(entryRef)
    if (!entrySnap.exists()) {
      throw new Error('Mouvement déjà supprimé.')
    }

    // ✅ FIX C5: Vérifier si l'entrée a ajusté agencyCashes lors de sa création
    const entry = entrySnap.data()
    const shouldAdjustCash = entry.cashAdjusted !== false  // Par défaut true pour rétro-compatibilité

    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    // N'ajuster que si l'entrée avait ajusté à la création
    if (shouldAdjustCash) {
      const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, adjustData)

      tx.set(cashRef, {
        city,
        solde: nextSolde, soldeEspeces: nextEspeces,
        soldeCheques: nextCheques, soldeVirement: nextVirement,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: adjustData.lastUpdatedBy || 'System',
      }, { merge: true })
    }

    tx.delete(entryRef)
  })
}

// Met à jour une entrée caisse ET ajuste le solde agence (delta = différence signée) atomiquement.
export async function updateCaisseEntryAtomic(id: any, entryData: any, city: any, delta: any, by: any) {
  if (!id) throw new Error('Mouvement invalide.')
  await runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    if (delta !== 0) {
      const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, { soldeDelta: delta })
      tx.set(cashRef, {
        city,
        solde: nextSolde, soldeEspeces: nextEspeces,
        soldeCheques: nextCheques, soldeVirement: nextVirement,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: by || 'System',
      }, { merge: true })
    }

    tx.update(doc(db, 'caisseEntries', id), {
      type:        entryData.type,
      category:    entryData.category,
      amount:      parseFloat(entryData.amount) || 0,
      description: entryData.description || '',
      reference:   entryData.reference   || '',
      agentName:   entryData.agentName   || null,
      staffId:     entryData.staffId     || null,
      staffName:   entryData.staffName   || null,
      staffRole:   entryData.staffRole   || '',
      salaryMonth: entryData.salaryMonth || '',
      paymentKind: entryData.paymentKind || '',
      note:        entryData.note        || '',
    })
  })
}

// Dépôt agent ? caissier : caissierTransaction + 2 caisseEntries + solde agence, tout atomique.
export async function depositAgentCashAtomic(data: any) {
  const city     = data.city
  const total    = parseFloat(data.amount) || 0
  const especes  = parseFloat(data.amountEspeces  || 0) || 0
  const cheques  = parseFloat(data.amountCheques  || 0) || 0
  const virement = parseFloat(data.amountVirement || 0) || 0
  if (!city || total <= 0) throw new Error('Données invalides.')
  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, {
      soldeDelta: total, especesDelta: especes, chequesDelta: cheques, virementDelta: virement,
    })
    const transRef = doc(collection(db, 'caissierTransactions'))
    tx.set(transRef, {
      city, agentId: data.agentId, agentName: data.agentName,
      caisserId: data.caisserId, cashierName: data.cashierName,
      amount: total, amountEspeces: especes, amountCheques: cheques, amountVirement: virement,
      description: data.description || 'Depot especes', reference: '',
      createdAt: serverTimestamp(),
    })
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'sortie', category: 'remise_caissier', amount: total,
      description: `Remise au caissier - ${data.agentName}`, reference: transRef.id,
      agentId: data.agentId, agentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.note || '',
    }))
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'entree', category: 'depot_agent', amount: total,
      description: `Depot agent recu - ${data.agentName}`, reference: transRef.id,
      sourceAgentId: data.agentId, sourceAgentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.depositNote || '',
    }))
    tx.set(cashRef, {
      city, solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(), lastUpdatedBy: data.cashierName || 'System',
    }, { merge: true })
    return transRef.id
  })
}

// Transfert direct agent ? caissier : caissierTransaction + 2 caisseEntries + solde agence, tout atomique.
export async function directTransferAgentToCashierAtomic(data: any) {
  const city   = data.city
  const amount = parseFloat(data.amount) || 0
  if (!city || amount <= 0) throw new Error('Données invalides.')
  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, {
      soldeDelta: amount, especesDelta: amount,  // ✅ Le caissier REÇOIT l'argent → agencyCashes augmente
    })
    const transRef = doc(collection(db, 'caissierTransactions'))
    tx.set(transRef, {
      city, agentId: data.agentId, agentName: data.agentName,
      caisserId: data.caisserId, cashierName: data.cashierName,
      amount, amountEspeces: amount, amountCheques: 0, amountVirement: 0,
      description: data.description || 'Transfert direct agent vers caissier', reference: '',
      createdAt: serverTimestamp(),
    })
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'sortie', category: 'remise_caissier', amount,
      description: `Transfert direct au caissier - ${data.cashierName}`, reference: transRef.id,
      agentId: data.agentId, agentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.note || '',
    }))
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'entree', category: 'depot_agent', amount,
      description: `Transfert direct recu - ${data.agentName}`, reference: transRef.id,
      sourceAgentId: data.agentId, sourceAgentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.note || 'Especes',
    }))
    tx.set(cashRef, {
      city, solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(), lastUpdatedBy: data.agentName || 'System',
    }, { merge: true })
    return transRef.id
  })
}

// Approbation récupération agent : caissierTransaction + 2 caisseEntries + solde agence + statut demande, tout atomique.
export async function approveRecoveryAtomic(requestId: any, data: any) {
  const city   = data.city
  const amount = parseFloat(data.amount) || 0
  if (!city || amount <= 0) throw new Error('Données invalides.')
  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, {
      soldeDelta: -amount, especesDelta: -amount,
    })
    const transRef = doc(collection(db, 'caissierTransactions'))
    tx.set(transRef, {
      city, agentId: data.agentId, agentName: data.agentName,
      caisserId: data.caisserId, cashierName: data.cashierName,
      amount, amountEspeces: amount, amountCheques: 0, amountVirement: 0,
      description: data.description || 'Recuperation agent acceptee', reference: '',
      createdAt: serverTimestamp(),
    })
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'sortie', category: 'restitution_agent', amount,
      description: `Restitution au agent - ${data.agentName}`, reference: transRef.id,
      sourceAgentId: data.agentId, sourceAgentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.note || '',
    }))
    tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
      type: 'entree', category: 'recuperation_caissier', amount,
      description: `Recuperation du caissier - ${data.cashierName}`, reference: transRef.id,
      agentId: data.agentId, agentName: data.agentName, city,
      cashierId: data.caisserId, cashierName: data.cashierName, note: data.note || '',
    }))
    tx.set(cashRef, {
      city, solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(), lastUpdatedBy: data.cashierName || 'System',
    }, { merge: true })
    tx.update(doc(db, 'agentCashRecoveryRequests', requestId), {
      status:       'approved',
      approvedBy:   data.approvedBy   || data.cashierName || 'Caissier',
      approvedById: data.approvedById || data.caisserId   || '',
      approvedAt:   serverTimestamp(),
      completedAt:  serverTimestamp(),
      reference:    transRef.id,
    })
    return transRef.id
  })
}
export function subscribeAgencyCash(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  return onSnapshot(doc(db, 'agencyCashes', city), snap => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() })
    } else {
      callback({ id: city, city, solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 })
    }
  }, onError)
}
export function subscribeAllAgencyCashes(callback: any, onError: (err?: any) => void = () => {}) {
  return onSnapshot(collection(db, 'agencyCashes'), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(data.length > 0 ? data : CITIES.map(city => ({ id: city, city, solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 })))
  }, onError)
}

// -- Driver port dû transactions (versements + avances) ----------------------
export async function addDriverPortDuTransaction(data: any) {
  return addDoc(collection(db, 'driverPortDuTransactions'), {
    driverId:   data.driverId,
    driverName: data.driverName,
    type:       data.type,
    amount:     parseFloat(data.amount) || 0,
    note:       data.note || '',
    adminId:    data.adminId   || '',
    adminName:  data.adminName || '',
    city:       data.city      || '',
    status:     'confirmed',
    createdAt:  serverTimestamp(),
  })
}

// Driver submits versement — pending until chef d'agence/admin confirms
export async function submitDriverVersement(data: any) {
  return addDoc(collection(db, 'driverPortDuTransactions'), {
    driverId:    data.driverId,
    driverName:  data.driverName,
    type:        'versement',
    amount:      parseFloat(data.amount) || 0,
    note:        data.note || '',
    adminId:     '',
    adminName:   '',
    city:        data.city || '',
    status:      'pending',
    submittedBy: 'driver',
    createdAt:   serverTimestamp(),
  })
}

// Legacy: confirms pending versement without touching caisse.
// Port dû is now received by the chef per parcel, which creates the caisse entry.
export async function confirmDriverVersement(txId: any, { confirmedById, confirmedBy, city, amount, driverName, driverId }: any) {
  return runTransaction(db, async tx => {
    const txRef = doc(db, 'driverPortDuTransactions', txId)
    tx.update(txRef, {
      status:        'confirmed',
      confirmedBy,
      confirmedById,
      confirmedAt:   serverTimestamp(),
      adminId:       confirmedById,
      adminName:     confirmedBy,
      ignoredByDirectReception: true,
      note:          'Ancien versement groupé confirmé sans mouvement caisse: port dû reçu colis par colis.',
    })
  })
}

// Driver subscribes to their own port dû transactions
export function subscribeDriverOwnPortDuTransactions(driverId: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'driverPortDuTransactions'),
    where('driverId', '==', driverId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export async function deleteDriverPortDuTransaction(id: any) {
  return deleteDoc(doc(db, 'driverPortDuTransactions', id))
}
export async function updateDriverPortDuTransaction(id: any, data: any) {
  return updateDoc(doc(db, 'driverPortDuTransactions', id), {
    amount: parseFloat(data.amount) || 0,
    note:   data.note || '',
  })
}
export function subscribeAllDriverPortDuTransactions(callback: any, onError: (err?: any) => void = () => {}) {
  // Récupérer toutes les transactions sans filtre de date
  const q = query(collection(db, 'driverPortDuTransactions'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeDriverPortDuTransactionsByCity(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'driverPortDuTransactions'),
    where('city', '==', city),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// ═══════════════════════════════════════════════════════════════════════════
// -- Versements Livreur → Chef d'agence (collection `driverVersements`) ------
//
// Workflow (identique au système de versements Chef → Admin) :
//   1. Le livreur crée un versement (Port Dû ou COD)  → statut 'pending'
//      Le montant est déduit immédiatement de son solde disponible côté UI
//      (solde = collecté sur colis − versements pending/confirmed).
//   2. Le chef d'agence VALIDE  → caisse agence créditée + entrée caisse
//      (catégorie 'versement_livreur'), le tout dans une transaction atomique.
//   3. Le chef d'agence REJETTE → statut 'rejected' + motif,
//      le montant est automatiquement recrédité au livreur (les versements
//      rejetés ne comptent plus dans la déduction du solde).
// ═══════════════════════════════════════════════════════════════════════════

export const DRIVER_VERSEMENT_TYPES = [
  { key: 'port_du', label: 'Port Dû', emoji: '📮', color: 'orange' },
  { key: 'cod',     label: 'COD',     emoji: '💰', color: 'green'  },
]
export const DRIVER_VERSEMENT_PAYMENT_TYPES = [
  { key: 'especes',  label: 'Espèces',  emoji: '💵', color: 'green'  },
  { key: 'cheque',   label: 'Chèque',   emoji: '📋', color: 'blue'   },
  { key: 'virement', label: 'Virement', emoji: '🏦', color: 'purple' },
]

// Création d'un versement livreur (transaction atomique) — statut 'pending'
export async function createDriverVersement(data: any): Promise<string> {
  const amount = safeParseAmount(data.amount)
  const type = data.type
  const paymentType = data.paymentType || 'especes'

  if (!data.driverId) throw new Error('Livreur invalide.')
  if (!data.city) throw new Error('Agence invalide.')
  if (!amount || amount <= 0) throw new Error('Le montant doit être supérieur à 0.')
  if (!DRIVER_VERSEMENT_TYPES.some(t => t.key === type)) throw new Error('Type de versement invalide.')
  if (!DRIVER_VERSEMENT_PAYMENT_TYPES.some(t => t.key === paymentType)) throw new Error('Mode de paiement invalide.')

  return runTransaction(db, async tx => {
    const versementRef = doc(collection(db, 'driverVersements'))
    tx.set(versementRef, {
      status:          'pending',
      driverId:        data.driverId,
      driverName:      data.driverName || 'Livreur',
      city:            data.city,
      type,                          // 'port_du' | 'cod'
      paymentType,                   // 'especes' | 'cheque' | 'virement'
      amount,
      note:            data.note || '',
      caisseEntryId:   null,
      confirmedBy:     null,
      confirmedById:   null,
      confirmedAt:     null,
      rejectedBy:      null,
      rejectedById:    null,
      rejectedAt:      null,
      rejectionReason: '',
      createdAt:       serverTimestamp(),
    })
    return versementRef.id
  })
}

// Validation par le chef d'agence : crédite la caisse agence + crée l'entrée
// caisse correspondante + met à jour le versement — tout atomique.
// (Nom distinct de l'ancien confirmDriverVersement qui gère la collection legacy
//  driverPortDuTransactions.)
export async function confirmDriverVersementChef(id: any, confirmedBy: any, confirmedById: any) {
  if (!id) throw new Error('Versement invalide.')
  return runTransaction(db, async tx => {
    const versementRef = doc(db, 'driverVersements', id)
    const versementSnap = await tx.get(versementRef)
    if (!versementSnap.exists()) throw new Error('Versement introuvable.')

    const v = versementSnap.data()
    if (v.status !== 'pending') throw new Error('Ce versement a déjà été traité.')

    const amount = safeParseAmount(v.amount)
    const city = v.city
    const paymentType = v.paymentType || 'especes'
    if (!city) throw new Error('Agence invalide.')
    if (amount <= 0) throw new Error('Montant invalide.')

    // 1. Créditer la caisse agence (solde global + solde du mode de paiement)
    const cashRef = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const { nextSolde, nextEspeces, nextCheques, nextVirement } = _applyCashAdjust(cash, {
      soldeDelta:    amount,
      especesDelta:  paymentType === 'especes'  ? amount : 0,
      chequesDelta:  paymentType === 'cheque'   ? amount : 0,
      virementDelta: paymentType === 'virement' ? amount : 0,
    })
    tx.set(cashRef, {
      city,
      solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: confirmedBy || 'Chef Agence',
    }, { merge: true })

    // 2. Créer l'entrée caisse (traçabilité)
    const typeLabel = DRIVER_VERSEMENT_TYPES.find(t => t.key === v.type)?.label || v.type
    const payLabel  = DRIVER_VERSEMENT_PAYMENT_TYPES.find(t => t.key === paymentType)?.label || paymentType
    const entryRef = doc(collection(db, 'caisseEntries'))
    tx.set(entryRef, {
      type:        'entree',
      category:    'versement_livreur',
      amount,
      description: `Versement livreur ${v.driverName || ''} — ${typeLabel} (${payLabel})`,
      reference:   id,
      agentId:     v.driverId || null,
      agentName:   v.driverName || null,
      sourceAgentId: null, sourceAgentName: '',
      staffId: null, staffName: null, staffRole: '',
      salaryMonth: '',
      paymentKind: paymentType,
      city,
      cashierId:   confirmedById || null,
      cashierName: confirmedBy || '',
      note:        v.note || '',
      cashAdjusted: true,
      createdAt:   serverTimestamp(),
    })

    // 3. Marquer le versement comme confirmé
    tx.update(versementRef, {
      status:        'confirmed',
      confirmedBy:   confirmedBy || 'Chef Agence',
      confirmedById: confirmedById || '',
      confirmedAt:   serverTimestamp(),
      caisseEntryId: entryRef.id,
    })
    return entryRef.id
  })
}

// Rejet par le chef d'agence : statut 'rejected' + motif.
// Le montant est recrédité au livreur automatiquement (un versement rejeté
// n'est plus déduit de son solde disponible). Aucune caisse n'est touchée
// puisque rien n'avait été encaissé.
export async function rejectDriverVersementChef(id: any, rejectedBy: any, rejectedById: any, reason = '') {
  if (!id) throw new Error('Versement invalide.')
  return runTransaction(db, async tx => {
    const versementRef = doc(db, 'driverVersements', id)
    const versementSnap = await tx.get(versementRef)
    if (!versementSnap.exists()) throw new Error('Versement introuvable.')

    const v = versementSnap.data()
    if (v.status !== 'pending') throw new Error('Ce versement a déjà été traité.')

    tx.update(versementRef, {
      status:          'rejected',
      rejectedBy:      rejectedBy || 'Chef Agence',
      rejectedById:    rejectedById || '',
      rejectedAt:      serverTimestamp(),
      rejectionReason: reason || '',
    })
  })
}

// Abonnement chef d'agence : tous les versements livreurs de sa ville
// (tri côté client pour éviter un index composite Firestore)
export function subscribeDriverVersements(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'driverVersements'),
    where('city', '==', city)
  )
  return onSnapshot(q, snap => callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])), onError)
}

// Abonnement livreur : ses propres versements
export function subscribeMyDriverVersements(driverId: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'driverVersements'),
    where('driverId', '==', driverId)
  )
  return onSnapshot(q, snap => callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])), onError)
}

// Abonnement admin : tous les versements livreurs (toutes agences)
export function subscribeAllDriverVersements(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'driverVersements'), orderBy('createdAt', 'desc'), limit(300))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Transferts vers l'Admin --------------------------------------------------
export async function createAdminTransferFromAgent(data: any) {
  const amount = parseFloat(data.amount) || 0
  const codParcelIds = (data.codParcelIds || []).filter(Boolean)
  if (!data.city || amount <= 0) throw new Error('Donnees invalides.')

  const now = new Date().toISOString()
  const entryRef = await addDoc(collection(db, 'caisseEntries'), {
    type: 'sortie', category: 'remise_admin', amount,
    description: data.note || "Transfert a l'Admin",
    reference: '', city: data.city,
    agentId: data.fromId || null, agentName: data.fromName || null,
    cashierId: null, cashierName: '',
    sourceAgentId: null, sourceAgentName: '', staffId: null, staffName: null,
    note: data.note || '', createdAt: serverTimestamp(),
  })
  const transferRef = await addDoc(collection(db, 'adminTransfers'), {
    fromRole: 'agent', fromId: data.fromId, fromName: data.fromName,
    city: data.city, amount, note: data.note || '',
    caisseEntryId: entryRef.id,
    codParcelIds: codParcelIds,
    codParcelCount: codParcelIds.length,
    status: 'pending', confirmedBy: null, confirmedById: null, confirmedAt: null,
    createdAt: serverTimestamp(),
  })

  // Marquer les COD inclus dans ce transfert pour éviter double versement
  if (codParcelIds.length > 0) {
    const batch = writeBatch(db)
    codParcelIds.forEach((id: string) => {
      batch.update(doc(db, 'parcels', id), {
        adminTransferred: true,
        adminTransferId: transferRef.id,
        adminTransferAt: now,
        adminTransferBy: data.fromName || '',
        adminTransferById: data.fromId || null,
      })
    })
    await batch.commit()
  }

  return transferRef.id
}
export async function createAdminTransferFromCaissier(data: any) {
  const amount = parseFloat(data.amount) || 0
  if (!data.city || amount <= 0) throw new Error('Donnees invalides.')
  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', data.city)
    const cashSnap = await tx.get(cashRef)
    const cash = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
    const nextSolde    = (cash.solde    || 0) - amount
    const nextEspeces  = (cash.soldeEspeces  || 0) - amount
    const nextCheques  = cash.soldeCheques  || 0
    const nextVirement = cash.soldeVirement || 0
    if (nextEspeces < 0) throw new Error('Solde caisse insuffisant.')
    const entryRef = doc(collection(db, 'caisseEntries'))
    tx.set(entryRef, {
      type: 'sortie', category: 'remise_admin', amount,
      description: data.note || "Transfert a l'Admin",
      reference: '', city: data.city,
      cashierId: data.fromId || null, cashierName: data.fromName || '',
      agentId: null, agentName: null,
      sourceAgentId: null, sourceAgentName: '', staffId: null, staffName: null,
      note: data.note || '', createdAt: serverTimestamp(),
    })
    tx.set(cashRef, {
      city: data.city, solde: nextSolde, soldeEspeces: nextEspeces,
      soldeCheques: nextCheques, soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(), lastUpdatedBy: data.fromName || 'Caissier',
    }, { merge: true })
    const transferRef = doc(collection(db, 'adminTransfers'))
    tx.set(transferRef, {
      fromRole: 'caissier', fromId: data.fromId, fromName: data.fromName,
      city: data.city, amount, note: data.note || '',
      caisseEntryId: entryRef.id,
      status: 'pending', confirmedBy: null, confirmedById: null, confirmedAt: null,
      createdAt: serverTimestamp(),
    })
    return transferRef.id
  })
}
export async function createAdminTransferFromChefAgence(data: any) {
  const amount = parseFloat(data.amount) || 0
  const paymentType = data.paymentType || 'especes' // especes, cheque, virement
  if (!data.city || amount <= 0) throw new Error('Données invalides.')

  return runTransaction(db, async tx => {
    const cashRef  = doc(db, 'agencyCashes', data.city)
    const cashSnap = await tx.get(cashRef)
    const cash = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    const currentSolde = cash.solde || 0
    const currentEspeces = cash.soldeEspeces || 0
    const currentCheques = cash.soldeCheques || 0
    const currentVirement = cash.soldeVirement || 0

    // Vérifier le solde selon le type de paiement
    if (paymentType === 'especes' && currentEspeces < amount) {
      throw new Error('Solde espèces insuffisant.')
    }
    if (paymentType === 'cheque' && currentCheques < amount) {
      throw new Error('Solde chèques insuffisant.')
    }
    if (paymentType === 'virement' && currentVirement < amount) {
      throw new Error('Solde virement insuffisant.')
    }

    // Calculer nouveaux soldes
    const nextSolde = currentSolde - amount
    const nextEspeces = paymentType === 'especes' ? currentEspeces - amount : currentEspeces
    const nextCheques = paymentType === 'cheque' ? currentCheques - amount : currentCheques
    const nextVirement = paymentType === 'virement' ? currentVirement - amount : currentVirement

    // Créer l'entrée de caisse (sortie)
    const entryRef = doc(collection(db, 'caisseEntries'))
    tx.set(entryRef, {
      type: 'sortie',
      category: 'remise_admin',
      amount,
      description: `Versement à l'Admin (${paymentType})`,
      reference: '',
      city: data.city,
      agentId: data.fromId || null,
      agentName: data.fromName || '',
      cashierId: null,
      cashierName: '',
      sourceAgentId: null,
      sourceAgentName: '',
      staffId: null,
      staffName: null,
      paymentKind: paymentType,
      note: data.note || '',
      createdAt: serverTimestamp(),
    })

    // Mettre à jour la caisse de l'agence
    tx.set(cashRef, {
      city: data.city,
      solde: nextSolde,
      soldeEspeces: nextEspeces,
      soldeCheques: nextCheques,
      soldeVirement: nextVirement,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: data.fromName || 'Chef Agence',
    }, { merge: true })

    // Créer le transfert en attente de validation
    const transferRef = doc(collection(db, 'adminTransfers'))
    tx.set(transferRef, {
      fromRole: 'chef_agence',
      fromId: data.fromId,
      fromName: data.fromName,
      city: data.city,
      amount,
      paymentType,
      note: data.note || '',
      caisseEntryId: entryRef.id,
      status: 'pending',
      confirmedBy: null,
      confirmedById: null,
      confirmedAt: null,
      createdAt: serverTimestamp(),
    })
    return transferRef.id
  })
}

export async function confirmAdminTransfer(id: any, confirmedBy: any, confirmedById: any) {
  return updateDoc(doc(db, 'adminTransfers', id), {
    status: 'confirmed',
    confirmedBy:   confirmedBy   || 'Admin',
    confirmedById: confirmedById || '',
    confirmedAt:   serverTimestamp(),
  })
}

export async function rejectAdminTransfer(id: any, rejectedBy: any, rejectedById: any, reason: string) {
  return updateDoc(doc(db, 'adminTransfers', id), {
    status: 'rejected',
    rejectedBy,
    rejectedById,
    rejectionReason: reason,
    rejectedAt: serverTimestamp(),
  })
}
export function subscribeAdminTransfers(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'adminTransfers'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeMyAdminTransfers(fromId: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'adminTransfers'),
    where('fromId', '==', fromId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function subscribeAdminTransfersByCity(city: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'adminTransfers'),
    where('city', '==', city),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

// -- Secteurs ------------------------------------------------------------------
