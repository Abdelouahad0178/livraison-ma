
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, getDocs, onSnapshot, limit, startAfter, getCountFromServer,
  serverTimestamp, arrayUnion, increment, writeBatch, setDoc, Timestamp, runTransaction, deleteField
} from 'firebase/firestore'
import { db } from './db'
import { REGLEMENT_MODES, REGLEMENT_STATUSES } from './constants'
import { daysAgoTimestamp, sortByCreatedDesc } from './firestoreUtils'
import { buildCaisseEntryPayload } from './caisse'

export async function createReglement(data: any) {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'reglements'), {
    trackingNumber:   data.trackingNumber   || '',
    parcelId:         data.parcelId         || null,
    expediteur:       data.expediteur       || '',
    expediteurTel:    data.expediteurTel    || '',
    expediteurNic:    data.expediteurNic || data.senderNic || data.nexp || '',
    destinataire:     data.destinataire     || '',
    destinataireTel:  data.destinataireTel  || '',
    villeExpedition:  data.villeExpedition  || '',
    agencyCity:       data.agencyCity       || '',
    pointeurId:       data.pointeurId       || '',
    pointeurName:     data.pointeurName     || '',
    modeReglement:    data.modeReglement    || 'especes',
    montant:          parseFloat(data.montant) || 0,
    banque:           data.banque           || '',
    numeroPiece:      data.numeroPiece      || '',
    dateEmission:     data.dateEmission     || '',
    dateEcheance:     data.dateEcheance     || '',
    status:           'en_attente',
    rapportId:        null,
    rejectionReason:  '',
    rejectedAt:       null,
    remisChefAt:      null,
    remisChefId:      null,
    verseBanqueAt:    null,
    verseBanqueRef:   '',
    verseBanqueBy:    '',
    notes:            data.notes            || '',
    docVerified:      false,
    docControlStatus: '',
    docControlChecks: {},
    docControlNotes:  '',
    createdAt:        now,
    updatedAt:        now,
  })
  return ref.id
}
export async function updateReglement(id: any, data: any) {
  await updateDoc(doc(db, 'reglements', id), { ...data, updatedAt: new Date().toISOString() })
}
export async function deleteReglement(id: any) {
  await deleteDoc(doc(db, 'reglements', id))
}
export async function markReglementRejete(id: any, reason: any) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'reglements', id), {
    status: 'rejete',
    rejectionReason: reason || '',
    rejectedAt: now,
    updatedAt: now,
  })
}
export async function markReglementVerseBanque(id: any, ref: any, by: any) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'reglements', id), {
    status: 'verse_banque',
    verseBanqueAt: now,
    verseBanqueRef: ref || '',
    verseBanqueBy: by || '',
    updatedAt: now,
  })
}
export function subscribeReglements(agencyCity: any, pointeurId: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'reglements'),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    let list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (pointeurId) list = list.filter(r => r.pointeurId === pointeurId)
    callback(list)
  }, onError)
}
export function subscribeAllReglements(agencyCity: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(90)
  const q = query(
    collection(db, 'reglements'),
    where('agencyCity', '==', agencyCity),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(200)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeSourceReglements(villeExpedition: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'reglements'),
    where('villeExpedition', '==', villeExpedition)
  )
  return onSnapshot(q, snap => {
    callback(sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]))
  }, onError)
}
export async function confirmReglementReceivedBySource(reglementId: any, data: any = {}) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'reglements', reglementId), {
    sourceReceived: true,
    sourceReceivedAt: now,
    sourceReceivedBy: data.receivedBy || '',
    sourceReceivedById: data.receivedById || '',
    sourceReceivedMode: data.modeReglement || '',
    sourceReceivedMontant: parseFloat(data.montant) || 0,
    sourceReceivedBanque: data.banque || '',
    sourceReceivedNumeroPiece: data.numeroPiece || '',
    sourceReceivedDateEcheance: data.dateEcheance || '',
    sourceDataMatches: data.matches !== false,
    sourceReceivedNote: data.note || '',
    updatedAt: now,
  })
}

// -- Rapports -------------------------------------------------------------
export async function markReglementDocVerified(id: any, pointeurId: any, pointeurName: any, control: any = {}) {
  const now = new Date().toISOString()
  await updateDoc(doc(db, 'reglements', id), {
    docVerified:     true,
    docVerifiedAt:   now,
    docVerifiedBy:   pointeurName,
    docVerifiedById: pointeurId,
    docControlStatus: control.status || 'correct',
    docControlChecks: control.checks || {},
    docControlNotes:  control.notes || '',
    updatedAt:       now,
  })
}

// -- Retour Documents (bordereau de retour chèques/traites) -------------------
export async function createRapport(data: any) {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'reglementsRapports'), {
    date:          data.date          || now.split('T')[0],
    agencyCity:    data.agencyCity    || '',
    pointeurId:    data.pointeurId    || '',
    pointeurName:  data.pointeurName  || '',
    totalEspeces:  data.totalEspeces  || 0,
    totalCheques:  data.totalCheques  || 0,
    totalTraites:  data.totalTraites  || 0,
    totalMontant:  data.totalMontant  || 0,
    nbEntries:     data.nbEntries     || 0,
    entryIds:      data.entryIds      || [],
    status:        'brouillon',
    validatedBy:   '',
    validatedById: '',
    validatedAt:   null,
    chefNotes:     '',
    notes:         data.notes         || '',
    createdAt:     now,
    submittedAt:   null,
  })
  return ref.id
}
export async function submitRapport(rapportId: any, entryIds: any) {
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  batch.update(doc(db, 'reglementsRapports', rapportId), {
    status: 'soumis',
    submittedAt: now,
    entryIds,
  })
  entryIds.forEach((eid: any) => {
    batch.update(doc(db, 'reglements', eid), {
      status: 'remis_chef',
      rapportId,
      remisChefAt: now,
      updatedAt: now,
    })
  })
  await batch.commit()
}
export async function validerRapport(rapportId: any, chefId: any, chefName: any, chefNotes = '') {
  const now = new Date().toISOString()

  await runTransaction(db, async tx => {
    // 1. Lire le rapport
    const rapportRef  = doc(db, 'reglementsRapports', rapportId)
    const rapportSnap = await tx.get(rapportRef)
    if (!rapportSnap.exists()) throw new Error('Rapport introuvable')
    const rapport = rapportSnap.data()

    const city         = rapport.agencyCity || ''
    if (!city) throw new Error('Ville manquante dans ce rapport. Contactez le pointeur.')
    const totalEspeces = parseFloat(rapport.totalEspeces) || 0
    const totalCheques = parseFloat(rapport.totalCheques) || 0
    const totalTraites = parseFloat(rapport.totalTraites) || 0
    const totalMontant = totalEspeces + totalCheques + totalTraites

    // 2. Lire la caisse agence
    const cashRef  = doc(db, 'agencyCashes', city)
    const cashSnap = await tx.get(cashRef)
    const cash     = cashSnap.exists()
      ? cashSnap.data()
      : { solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }

    // 3. Valider le rapport
    tx.update(rapportRef, {
      status:        'valide',
      validatedById: chefId,
      validatedBy:   chefName,
      validatedAt:   now,
      chefNotes,
    })

    // 4. Créer les entrées caisse par type
    ;(rapport.entryIds || []).forEach((eid: any) => {
      tx.update(doc(db, 'reglements', eid), {
        status:        'valide',
        validatedById: chefId,
        validatedBy:   chefName,
        validatedAt:   now,
        chefNotes,
        updatedAt:     now,
      })
    })

    const desc = `Rapport pointeur · ${rapport.pointeurName || ''} · ${rapport.date || now.slice(0,10)}`
    if (totalEspeces > 0) {
      tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
        type: 'entree', category: 'cod_agence', amount: totalEspeces,
        city, agentId: chefId, agentName: chefName,
        description: desc, reference: rapportId,
      }))
    }
    if (totalCheques > 0) {
      tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
        type: 'entree', category: 'cod_cheque', amount: totalCheques,
        city, agentId: chefId, agentName: chefName,
        description: desc, reference: rapportId,
      }))
    }
    if (totalTraites > 0) {
      tx.set(doc(collection(db, 'caisseEntries')), buildCaisseEntryPayload({
        type: 'entree', category: 'cod_traite', amount: totalTraites,
        city, agentId: chefId, agentName: chefName,
        description: desc, reference: rapportId,
      }))
    }

    // 5. Mettre à jour le solde de l'agence
    tx.set(cashRef, {
      city,
      solde:        (parseFloat(cash.solde        || 0) || 0) + totalMontant,
      soldeEspeces: (parseFloat(cash.soldeEspeces || 0) || 0) + totalEspeces,
      soldeCheques: (parseFloat(cash.soldeCheques || 0) || 0) + totalCheques + totalTraites,
      soldeVirement:(parseFloat(cash.soldeVirement|| 0) || 0),
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: chefName,
    }, { merge: true })
  })
}
export async function rejeterRapport(rapportId: any, chefId: any, chefName: any, chefNotes = '') {
  const now = new Date().toISOString()
  const snap = await getDoc(doc(db, 'reglementsRapports', rapportId))
  const rapport = snap.data()
  const batch = writeBatch(db)
  batch.update(doc(db, 'reglementsRapports', rapportId), {
    status: 'rejete',
    validatedById: chefId,
    validatedBy: chefName,
    validatedAt: now,
    chefNotes,
  })
  ;(rapport?.entryIds || []).forEach((eid: any) => {
    batch.update(doc(db, 'reglements', eid), {
      status: 'encaisse',
      rapportId: null,
      remisChefAt: null,
      updatedAt: now,
    })
  })
  await batch.commit()
}
export function subscribeRapports(agencyCity: any, callback: any, onError: (err?: any) => void = () => {}) {
  const since = daysAgoTimestamp(90)
  const q = query(
    collection(db, 'reglementsRapports'),
    where('agencyCity', '==', agencyCity),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
    limit(100)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeAllReglementsGlobal(callback: any, onError: (err?: any) => void = () => {}) {
  // Pas de filtre createdAt pour éviter les problèmes d'index ou de format de date
  const q = query(collection(db, 'reglements'), orderBy('createdAt', 'desc'), limit(500))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeAllRapportsGlobal(callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(collection(db, 'reglementsRapports'), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}
export function subscribeMyRapports(pointeurId: any, agencyCity: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'reglementsRapports'),
    where('pointeurId', '==', pointeurId),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, onError)
}

// -- RETOUR FOND Parcels (pour le Pointeur-Encaisseur) --------------------------------
export async function markPortDuRemisPointeur(parcelId: any, pointeurName: any, pointeurId: any) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    portPointeurId:   pointeurId,
    portPointeurName: pointeurName,
    portPointeurAt:   new Date().toISOString(),
  })
}
export async function markPortDuReceivedByChef(parcelId: any, chefName: any, chefId: any, extra: any = {}) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    portChefReceivedAt:  new Date().toISOString(),
    portChefReceivedBy:  chefName,
    portChefReceivedById: chefId,
    ...(extra.portCaisseEntryId ? { portCaisseEntryId: extra.portCaisseEntryId } : {}),
  })
}
export async function markCodRefundedToClient(parcelId: any, pointeurName: any, pointeurId: any) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    codRefunded:      true,
    codRefundedAt:    new Date().toISOString(),
    codRefundedBy:    pointeurName,
    codRefundedById:  pointeurId,
  })
}

// Pointage physique des colis par le chef d'agence
export async function markParcelChefPointed(parcelId: any, chefId: any, chefName: any) {
  await updateDoc(doc(db, 'parcels', parcelId), {
    chefPointedAt:   new Date().toISOString(),
    chefPointedBy:   chefName,
    chefPointedById: chefId,
  })
}

// Contrôle physique d'un document (chèque/traite) par le pointeur-encaisseur
export async function createRetourDocument(data: any) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand  = Math.random().toString(36).slice(2, 6).toUpperCase()
  const docs  = data.documents || []
  await addDoc(collection(db, 'retourDocuments'), {
    retourRef:         `RET-${stamp}-${rand}`,
    agencyCity:        data.agencyCity        || '',
    destinationAgency: data.destinationAgency || '',
    pointeurId:        data.pointeurId        || '',
    pointeurName:      data.pointeurName      || '',
    documents:         docs,
    totalMontant:      docs.reduce((s: any, d: any) => s + (d.montant || 0), 0),
    nbDocuments:       docs.length,
    status:            'brouillon',
    notes:             data.notes             || '',
    createdAt:         new Date().toISOString(),
    expedieAt:         null,
    receivedAt:        null,
  })
}
export function subscribeRetourDocuments(agencyCity: any, callback: any, onError: (err?: any) => void = () => {}) {
  const q = query(
    collection(db, 'retourDocuments'),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export async function expedierRetourDocument(id: any) {
  await updateDoc(doc(db, 'retourDocuments', id), { status: 'expedie', expedieAt: new Date().toISOString() })
}
export async function confirmRetourDocumentArrived(id: any, by = '') {
  await updateDoc(doc(db, 'retourDocuments', id), {
    status: 'recu_expediteurs',
    receivedAt: new Date().toISOString(),
    receivedBy: by || '',
  })
}
export async function deleteRetourDocument(id: any) {
  await deleteDoc(doc(db, 'retourDocuments', id))
}

export {
  createBankDeposit,
  subscribeBankDepositsByCity,
  subscribeAllBankDeposits,
  confirmBankDeposit,
  deleteBankDeposit,
} from './bankDeposits'

// -- Encaisseur central : versements société et chèques fournisseurs ----------

export const centralCodParcelPatch = (data: any) => ({
  centralDeposited:     true,
  centralDepositId:     data.depositId,
  centralDepositAt:     data.now,
  centralDepositBy:     data.agentName || '',
  centralDepositById:   data.agentId || null,
  centralDepositCity:   data.city || '',
})
