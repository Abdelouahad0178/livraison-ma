import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './db'
import { daysAgoTimestamp } from './firestoreUtils'

const CLIENTS_PAGE_LIMIT = 500
type FirestoreRow = Record<string, any> & { id: string; createdAt?: any }
type DynamicData = Record<string, any>

export interface Client {
  id: string
  name: string
  tel: string
  email?: string
  address: string
  city: string
  nic?: string
  accountType: 'cash' | 'compte'
  remise: number
  balance: number
  notes?: string
  createdAt: any
  createdBy?: string | null
  createdByName?: string
  createdByRole?: string
  portalUid?: string | null
  portalEmail?: string
  // Nouveaux champs
  isExpediteur?: boolean
  isDestinataire?: boolean
  secteurId?: string
  secteurName?: string
  livreurIds?: string[]
  isLocal?: boolean // true = client de passage (localStorage), false/undefined = client régulier (Firestore)
}

const rowFromDoc = (d: { id: string; data: () => DynamicData }): FirestoreRow => ({ id: d.id, ...d.data() })

export async function createClient(data: DynamicData) {
  const ref = await addDoc(collection(db, 'clients'), {
    name:        data.name        || '',
    tel:         data.tel         || '',
    email:       data.email       || '',
    address:     data.address     || '',
    city:        data.city        || '',
    nic:         data.nic         || '',
    accountType: data.accountType || 'cash',
    remise:      parseFloat(data.remise) || 0,
    balance:     0,
    notes:       data.notes       || '',
    createdAt:   serverTimestamp(),
    createdBy:   data.createdBy   || null,
    createdByName: data.createdByName || '',
    createdByRole: data.createdByRole || '',
    portalUid:   data.portalUid   || null,
    portalEmail: data.portalEmail || data.email || '',
    // Nouveaux champs
    isExpediteur: data.isExpediteur || false,
    isDestinataire: data.isDestinataire || false,
    secteurId: data.secteurId || '',
    secteurName: data.secteurName || '',
    livreurIds: data.livreurIds || [],
  })
  return ref.id
}

/**
 * Trouve un client existant ou en crée un nouveau automatiquement
 * Recherche par téléphone OU par (nom + ville)
 */
export async function findOrCreateClientForReceiver(
  receiverData: {
    name: string
    tel: string
    city: string
    address?: string
  },
  createdBy: string,
  createdByName: string
): Promise<string> {
  console.log('🔍 Recherche/création client pour:', receiverData)

  // Normaliser les données
  const normalizedTel = receiverData.tel?.trim() || ''
  const normalizedName = receiverData.name?.trim() || ''
  const normalizedCity = receiverData.city?.trim() || ''

  if (!normalizedName || !normalizedCity) {
    throw new Error('Le nom et la ville du destinataire sont requis')
  }

  // 1. Chercher par téléphone si disponible
  if (normalizedTel) {
    const telQuery = query(
      collection(db, 'clients'),
      where('tel', '==', normalizedTel),
      limit(1)
    )
    const telSnapshot = await getDocs(telQuery)

    if (!telSnapshot.empty) {
      const existingClient = telSnapshot.docs[0]
      console.log('✅ Client trouvé par téléphone:', existingClient.id)

      // Marquer comme destinataire s'il ne l'est pas déjà
      if (!existingClient.data().isDestinataire) {
        await updateDoc(doc(db, 'clients', existingClient.id), {
          isDestinataire: true
        })
      }

      return existingClient.id
    }
  }

  // 2. Chercher par nom + ville
  const nameQuery = query(
    collection(db, 'clients'),
    where('name', '==', normalizedName),
    where('city', '==', normalizedCity),
    limit(1)
  )
  const nameSnapshot = await getDocs(nameQuery)

  if (!nameSnapshot.empty) {
    const existingClient = nameSnapshot.docs[0]
    console.log('✅ Client trouvé par nom+ville:', existingClient.id)

    // Mettre à jour le téléphone si on en a un et qu'il n'en avait pas
    const updateData: any = { isDestinataire: true }
    if (normalizedTel && !existingClient.data().tel) {
      updateData.tel = normalizedTel
    }

    await updateDoc(doc(db, 'clients', existingClient.id), updateData)

    return existingClient.id
  }

  // 3. Créer un nouveau client
  console.log('➕ Création d\'un nouveau client destinataire')
  const newClientId = await createClient({
    name: normalizedName,
    tel: normalizedTel,
    city: normalizedCity,
    address: receiverData.address || '',
    accountType: 'compte', // Par défaut en compte pour les ports
    remise: 0,
    createdBy,
    createdByName,
    createdByRole: 'livreur',
    isDestinataire: true,
    isExpediteur: false,
    notes: 'Client créé automatiquement lors d\'une livraison en compte destinataire'
  })

  console.log('✅ Nouveau client créé:', newClientId)
  return newClientId
}

export async function updateClient(clientId: string, data: DynamicData) {
  await updateDoc(doc(db, 'clients', clientId), data)
}

export async function deleteClient(clientId: string) {
  await deleteDoc(doc(db, 'clients', clientId))
}

export function subscribeClients(callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'), limit(CLIENTS_PAGE_LIMIT))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(rowFromDoc))
  }, onError)
}

export async function addPayment(data: DynamicData) {
  const paymentRef = doc(collection(db, 'payments'))
  await runTransaction(db, async tx => {
    tx.set(paymentRef, {
      clientId:    data.clientId,
      parcelId:    data.parcelId    || null,
      amount:      parseFloat(data.amount) || 0,
      type:        data.type        || 'debit',
      invoiced:    data.invoiced !== false,
      description: data.description || '',
      createdAt:   serverTimestamp(),
      createdBy:   data.createdBy   || null,
    })
    const delta = data.type === 'debit' ? parseFloat(data.amount) : -parseFloat(data.amount)
    tx.update(doc(db, 'clients', data.clientId), { balance: increment(delta) })
  })
  return paymentRef.id
}

export async function deletePayment(paymentId: string, clientId: string, amount: string | number, type: string) {
  await runTransaction(db, async tx => {
    tx.delete(doc(db, 'payments', paymentId))
    const numericAmount = Number(amount) || 0
    const delta = type === 'debit' ? -numericAmount : numericAmount
    tx.update(doc(db, 'clients', clientId), { balance: increment(delta) })
  })
}

export function subscribeClientParcels(clientId: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)
  const q = query(collection(db, 'parcels'), where('clientId', '==', clientId), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(100))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(rowFromDoc))
  }, onError)
}

// Charge les colis destinés à un client destinataire
export function subscribeDestinataireDeliveries(client: Client, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(60)

  // Filtrer par receiverClientId si disponible, sinon par ville + nom/tél
  const q = query(
    collection(db, 'parcels'),
    where('destinationCity', '==', client.city),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(200)
  )

  return onSnapshot(q, snap => {
    const allParcels = snap.docs.map(rowFromDoc)

    // Filtrer pour garder uniquement ceux où le destinataire correspond au client
    const filtered = allParcels.filter((p: any) => {
      // Priorité au receiverClientId si défini
      if (p.receiverClientId) {
        return p.receiverClientId === client.id
      }

      // Fallback : match par nom/téléphone (pour les anciens colis)
      const receiverName = p.receiver?.name || p.receiverName || ''
      const receiverTel = p.receiver?.tel || p.receiverTel || ''
      const receiverNameMatch = receiverName.toLowerCase().trim() === client.name.toLowerCase().trim()
      const receiverTelMatch = receiverTel.replace(/\s/g, '') === client.tel?.replace(/\s/g, '')

      return receiverNameMatch || receiverTelMatch
    })

    callback(filtered)
  }, onError)
}

export function subscribeClientPayments(clientId: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'payments'), where('clientId', '==', clientId), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(rowFromDoc))
  }, onError)
}

export async function createClientMessage(data: DynamicData) {
  const ref = await addDoc(collection(db, 'clientMessages'), {
    clientId:     data.clientId,
    clientUid:    data.clientUid || '',
    clientName:   data.clientName || '',
    clientEmail:  data.clientEmail || '',
    portalToken:  data.portalToken || '',
    parcelId:     data.parcelId || '',
    trackingId:   data.trackingId || '',
    agencyCity:   data.agencyCity || '',
    targetRole:   data.targetRole || 'staff',
    targetLabel:  data.targetLabel || '',
    validationRequest: !!data.validationRequest,
    parcelStatus: data.parcelStatus || '',
    type:         data.type || 'question',
    message:      data.message || '',
    status:       'open',
    createdAt:    serverTimestamp(),
    deliveredToStaffAt: null,
    readByStaffAt: null,
    readByStaffBy: '',
    readByClientAt: null,
    readByClientUid: '',
    lastReplyAt: null,
    resolvedAt:   null,
    resolvedBy:   '',
  })
  return ref.id
}

export function subscribeClientMessages(clientId: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'clientMessages'), where('clientId', '==', clientId))
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(rowFromDoc)
    rows.sort((a, b) => {
      const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime()
      const db_ = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime()
      return db_ - da
    })
    callback(rows)
  }, onError)
}

export function subscribeAllClientMessages(callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  // Récupérer tous les messages sans filtre de date
  const q = query(collection(db, 'clientMessages'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(rowFromDoc)), onError)
}

export function subscribeAgencyClientMessages(city: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'clientMessages'), where('agencyCity', '==', city))
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(rowFromDoc)
    rows.sort((a, b) => {
      const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime()
      const db_ = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime()
      return db_ - da
    })
    callback(rows)
  }, onError)
}

export async function resolveClientMessage(id: string, resolvedBy = 'Admin') {
  await updateDoc(doc(db, 'clientMessages', id), {
    status:     'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy,
  })
}

export async function deleteClientMessage(id: string) {
  await deleteDoc(doc(db, 'clientMessages', id))
}

export async function removeReplyFromMessage(id: string, replyCreatedAt: string, replyAuthorRole: string) {
  const ref = doc(db, 'clientMessages', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const replies = snap.data().replies || []
  const idx = replies.findIndex((r: any) => r.createdAt === replyCreatedAt && r.authorRole === replyAuthorRole)
  if (idx === -1) return
  await updateDoc(ref, { replies: [...replies.slice(0, idx), ...replies.slice(idx + 1)] })
}

export async function markClientMessageReadByStaff(id: string, reader = 'Admin') {
  await updateDoc(doc(db, 'clientMessages', id), {
    deliveredToStaffAt: serverTimestamp(),
    readByStaffAt: serverTimestamp(),
    readByStaffBy: reader,
  })
}

export async function markClientMessageReadByClient(id: string, uid = '') {
  await updateDoc(doc(db, 'clientMessages', id), {
    readByClientAt: serverTimestamp(),
    readByClientUid: uid,
  })
}

export async function addClientMessageReply(id: string, data: DynamicData) {
  const messageRef = doc(db, 'clientMessages', id)
  await updateDoc(messageRef, {
    status: 'open',
    lastReplyAt: serverTimestamp(),
    readByClientAt: null,
    readByClientUid: '',
    replies: arrayUnion({
      message: data.message || '',
      authorName: data.authorName || '',
      authorEmail: data.authorEmail || '',
      authorRole: data.authorRole || 'staff',
      createdAt: new Date().toISOString(),
    }),
  })
}

export async function addClientPortalReply(id: string, data: DynamicData) {
  const messageRef = doc(db, 'clientMessages', id)
  await updateDoc(messageRef, {
    status: 'open',
    lastReplyAt: serverTimestamp(),
    readByStaffAt: null,
    readByStaffBy: '',
    replies: arrayUnion({
      message: data.message || '',
      authorName: data.authorName || '',
      authorEmail: data.authorEmail || '',
      authorRole: 'client',
      createdAt: new Date().toISOString(),
    }),
  })
}

export async function createModificationRequest(data: DynamicData) {
  const docData: any = {
    parcelId:         data.parcelId || '',
    trackingId:       data.trackingId || '',
    clientId:         data.clientId || '',
    clientUid:        data.clientUid || '',
    clientName:       data.clientName || '',
    clientEmail:      data.clientEmail || '',
    agencyCity:       data.agencyCity || '',
    parcelStatus:     data.parcelStatus || '',
    modificationType: data.modificationType || '',
    typeLabel:        data.typeLabel || '',
    currentValue:     data.currentValue || '',
    newValue:         data.newValue || '',
    note:             data.note || '',
    status:           'pending',
    createdAt:        serverTimestamp(),
    resolvedAt:       null,
    resolvedBy:       '',
    agentNote:        '',
  }

  // Nouveaux champs pour le workflow destinataire→expéditeur→transporteur
  if (data.type) docData.type = data.type
  if (data.requestedBy) docData.requestedBy = data.requestedBy
  if (data.requestedByName) docData.requestedByName = data.requestedByName
  if (data.requestedByClientId) docData.requestedByClientId = data.requestedByClientId
  if (data.targetClientId) docData.targetClientId = data.targetClientId

  await addDoc(collection(db, 'modificationRequests'), docData)
}

export function subscribeClientModificationRequests(clientId: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'modificationRequests'), where('clientId', '==', clientId))
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(rowFromDoc)
    rows.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime()
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime()
      return tb - ta
    })
    callback(rows)
  }, onError)
}

export function subscribeAgencyModificationRequests(city: string, callback: (rows: FirestoreRow[]) => void, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'modificationRequests'), where('agencyCity', '==', city))
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(rowFromDoc)
    rows.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime()
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime()
      return tb - ta
    })
    callback(rows)
  }, onError)
}

export async function resolveModificationRequest(id: string, status: string, agentName: string, agentNote = '') {
  const reqRef = doc(db, 'modificationRequests', id)
  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) return
  const req = reqSnap.data() as DynamicData

  let parcel: DynamicData | null = null
  if (req.parcelId) {
    const parcelSnap = await getDoc(doc(db, 'parcels', req.parcelId))
    parcel = parcelSnap.exists() ? parcelSnap.data() as DynamicData : null
  }
  const deliveredLocked = parcel?.status === 'Livré' || parcel?.status === 'Livr\u00c3\u00a9'
  const changesStatus = req.modificationType === 'annulation' || req.modificationType === 'status'
  if (status === 'approved' && deliveredLocked && changesStatus) {
    await updateDoc(reqRef, {
      status: 'rejected',
      resolvedAt: serverTimestamp(),
      resolvedBy: agentName,
      agentNote: agentNote || 'Colis deja livre : le statut Livré est verrouille.',
    })
    return
  }

  await updateDoc(reqRef, {
    status,
    resolvedAt: serverTimestamp(),
    resolvedBy: agentName,
    agentNote,
  })

  if (status === 'approved' && req.parcelId) {
    const parcelRef = doc(db, 'parcels', req.parcelId)
    const update: DynamicData = {}
    switch (req.modificationType) {
      case 'type_paiement':
        update.serviceType = req.newValue
        update.codPaymentType = req.newValue
        break
      case 'adresse':
        update['receiver.address'] = req.newValue
        break
      case 'telephone':
        update['receiver.tel'] = req.newValue
        break
      case 'nom':
        update['receiver.name'] = req.newValue
        break
      case 'montant_cod':
        update.codAmount = parseFloat(req.newValue) || 0
        break
      case 'annulation':
        update.status = 'Retourné'
        break
    }
    if (Object.keys(update).length > 0) {
      update.modificationHistory = arrayUnion({
        requestId: id,
        modificationType: req.modificationType || '',
        typeLabel: req.typeLabel || req.modificationType || '',
        currentValue: req.currentValue || '',
        newValue: req.newValue || '',
        requestedBy: req.clientName || req.clientEmail || 'Client',
        approvedBy: agentName,
        approvedAt: new Date().toISOString(),
        note: req.note || '',
        agentNote: agentNote || '',
        parcelStatusAtApproval: parcel?.status || req.parcelStatus || '',
      })
      update.lastModificationRequestId = id
      update.lastModificationAt = new Date().toISOString()
      update.lastModificationBy = agentName
      update.lastModificationByRole = 'chef_agence'
      await updateDoc(parcelRef, update)
    }
  }
}

export async function deleteModificationRequest(id: string) {
  await deleteDoc(doc(db, 'modificationRequests', id))
}

export async function findPortalClient(uid: string, email = '') {
  if (uid) {
    const byUid = await getDocs(query(collection(db, 'clients'), where('portalUid', '==', uid)))
    if (!byUid.empty) return rowFromDoc(byUid.docs[0])
  }
  if (email) {
    const cleanEmail = email.trim().toLowerCase()
    const byEmail = await getDocs(query(collection(db, 'clients'), where('email', '==', cleanEmail)))
    if (!byEmail.empty) return rowFromDoc(byEmail.docs[0])
    const byPortalEmail = await getDocs(query(collection(db, 'clients'), where('portalEmail', '==', cleanEmail)))
    if (!byPortalEmail.empty) return rowFromDoc(byPortalEmail.docs[0])
  }
  return null
}

export async function ensurePortalClient({ uid, email, name, tel, city, address, accountType = 'compte' }: DynamicData) {
  const cleanEmail = (email || '').trim().toLowerCase()
  const existing = await findPortalClient(uid, cleanEmail)
  if (existing) {
    await updateDoc(doc(db, 'clients', existing.id), {
      portalUid: uid,
      portalEmail: cleanEmail,
      email: existing.email || cleanEmail,
    })
    return existing.id
  }
  return createClient({
    name: name || cleanEmail || 'Client',
    tel: tel || '',
    email: cleanEmail,
    address: address || '',
    city: city || '',
    accountType,
    remise: 0,
    notes: 'Compte cree depuis le portail client.',
    portalUid: uid,
    portalEmail: cleanEmail,
    createdBy: uid,
    createdByName: name || cleanEmail || 'Client',
    createdByRole: 'client',
  })
}

// Recherche clients expéditeurs avec autocomplétion
// Pour l'instant, tous les clients peuvent être expéditeurs
export async function searchExpediteurs(searchTerm: string, filterCity?: string, onlyEnCompte?: boolean): Promise<Client[]> {
  const normalizedSearch = searchTerm.toLowerCase().trim()
  if (!normalizedSearch) return []

  // Rechercher dans Firestore (clients réguliers enregistrés par chef d'agence)
  const q = query(collection(db, 'clients'), limit(200))
  const snap = await getDocs(q)
  let firestoreClients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))

  // 💼 Filtrer seulement les clients "en compte" si demandé
  if (onlyEnCompte) {
    firestoreClients = firestoreClients.filter(c => c.accountType === 'compte')
  }

  // Rechercher dans les clients locaux (clients de passage)
  const { searchLocalClients } = await import('../utils/localClients')
  const localClients = searchLocalClients(normalizedSearch).map(lc => ({
    id: lc.id,
    name: lc.name,
    tel: lc.tel,
    address: lc.address,
    city: lc.city,
    isLocal: true, // Marqueur pour identifier les clients locaux
  } as Client))

  // Combiner les deux sources
  const allClients = [...firestoreClients, ...localClients]

  // Filtrer par recherche et optionnellement par ville
  const filtered = allClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(normalizedSearch) ||
      c.tel?.includes(normalizedSearch) ||
      c.address?.toLowerCase().includes(normalizedSearch)

    const matchCity = !filterCity || c.city === filterCity

    return matchSearch && matchCity
  })

  filtered.sort((a, b) => a.name.localeCompare(b.name))
  return filtered.slice(0, 20)
}

// Recherche clients destinataires avec autocomplétion
// Pour l'instant, tous les clients peuvent être destinataires
export async function searchDestinataires(searchTerm: string, filterCity?: string): Promise<Client[]> {
  const normalizedSearch = searchTerm.toLowerCase().trim()
  if (!normalizedSearch) return []

  // Rechercher dans Firestore (clients réguliers enregistrés par chef d'agence)
  const q = query(collection(db, 'clients'), limit(200))
  const snap = await getDocs(q)
  const firestoreClients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))

  // Rechercher dans les clients locaux (clients de passage)
  const { searchLocalClients } = await import('../utils/localClients')
  const localClients = searchLocalClients(normalizedSearch).map(lc => ({
    id: lc.id,
    name: lc.name,
    tel: lc.tel,
    address: lc.address,
    city: lc.city,
    isLocal: true, // Marqueur pour identifier les clients locaux
  } as Client))

  // Combiner les deux sources
  const allClients = [...firestoreClients, ...localClients]

  // Filtrer par recherche et optionnellement par ville
  const filtered = allClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(normalizedSearch) ||
      c.tel?.includes(normalizedSearch) ||
      c.address?.toLowerCase().includes(normalizedSearch)

    const matchCity = !filterCity || c.city === filterCity

    return matchSearch && matchCity
  })

  filtered.sort((a, b) => a.name.localeCompare(b.name))
  return filtered.slice(0, 20)
}

// Récupérer tous les expéditeurs
export async function getAllExpediteurs(): Promise<Client[]> {
  const q = query(
    collection(db, 'clients'),
    where('isExpediteur', '==', true),
    orderBy('name')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))
}

// Récupérer tous les destinataires
export async function getAllDestinataires(): Promise<Client[]> {
  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true),
    orderBy('name')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))
}
