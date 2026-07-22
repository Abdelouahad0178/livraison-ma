
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
  // 180 jours pour éviter surcharge Firestore
  const since = daysAgoTimestamp(180)
  const q = query(collection(db, 'centralCodDeposits'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))
  // Filtrer les versements supprimés (status: 'deleted')
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((dep: any) => dep.status !== 'deleted')), onError)
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

export async function updateCentralSupplierPayment(paymentId: any, { amount, senderName, senderTel, chequeNum, bankName, chequeDate, note, updatedBy, updatedById }: any) {
  if (!paymentId) throw new Error('Paiement invalide.')

  const paymentRef = doc(db, 'centralSupplierPayments', paymentId)
  const snap = await getDoc(paymentRef)
  if (!snap.exists()) throw new Error('Paiement introuvable.')

  const payment: any = snap.data()
  if (payment.status === 'paid') {
    throw new Error('Ce paiement a déjà été réglé. Seul l\'admin peut le modifier.')
  }

  const total = parseFloat(amount) || payment.amount
  const now = new Date().toISOString()

  await updateDoc(paymentRef, {
    amount: total,
    senderName: senderName || payment.senderName,
    senderTel: senderTel || payment.senderTel,
    chequeNum: chequeNum || payment.chequeNum,
    bankName: bankName || payment.bankName,
    chequeDate: chequeDate || payment.chequeDate,
    note: note !== undefined ? note : payment.note,
    updatedAt: now,
    updatedBy: updatedBy || 'Encaisseur central',
    updatedById: updatedById || null,
  })

  // Mettre à jour les colis associés
  const ids = payment.parcelIds || []
  const chunks: any[][] = []
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((id: string) => {
      batch.update(doc(db, 'parcels', id), {
        centralChequeNum: chequeNum || payment.chequeNum,
        centralChequeBank: bankName || payment.bankName,
        centralChequeDate: chequeDate || payment.chequeDate,
      })
    })
    await batch.commit()
  }

  return paymentId
}

export async function deleteCentralSupplierPayment(paymentId: any, deletedBy: any, deletedById: any) {
  if (!paymentId) throw new Error('Paiement invalide.')

  const paymentRef = doc(db, 'centralSupplierPayments', paymentId)
  const snap = await getDoc(paymentRef)
  if (!snap.exists()) throw new Error('Paiement introuvable.')

  const payment: any = snap.data()
  const ids = payment.parcelIds || []

  // Retirer les champs de paiement des colis (utiliser set avec merge pour ignorer les inexistants)
  const chunks: any[][] = []
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((id: string) => {
      // Utiliser set avec merge:true pour ignorer les documents inexistants
      batch.set(doc(db, 'parcels', id), {
        centralSupplierPaymentId: null,
        centralSupplierPaymentStatus: null,
        centralSupplierPreparedAt: null,
        centralSupplierPreparedBy: null,
        centralSupplierPreparedById: null,
        centralChequeNum: null,
        centralChequeBank: null,
        centralChequeDate: null,
      }, { merge: true })
    })
    try {
      await batch.commit()
    } catch (err: any) {
      console.warn(`Erreur ignorée lors de la mise à jour des colis:`, err.message)
    }
  }

  // Supprimer le paiement
  await updateDoc(paymentRef, {
    status: 'deleted',
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy || 'Encaisseur central',
    deletedById: deletedById || null,
  })

  return paymentId
}

export async function updateCentralCodDeposit(depositId: any, { amount, agentName, note, updatedBy, updatedById }: any) {
  if (!depositId) throw new Error('Versement invalide.')

  const depositRef = doc(db, 'centralCodDeposits', depositId)
  const snap = await getDoc(depositRef)
  if (!snap.exists()) throw new Error('Versement introuvable.')

  const updates: any = {
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'Encaisseur central',
    updatedById: updatedById || null,
  }

  if (amount !== undefined) updates.amount = parseFloat(amount) || 0
  if (agentName !== undefined) updates.agentName = agentName
  if (note !== undefined) updates.note = note

  await updateDoc(depositRef, updates)
  return depositId
}

export async function deleteCentralCodDeposit(depositId: any, deletedBy: any, deletedById: any) {
  if (!depositId) throw new Error('Versement invalide.')

  const depositRef = doc(db, 'centralCodDeposits', depositId)
  const snap = await getDoc(depositRef)
  if (!snap.exists()) throw new Error('Versement introuvable.')

  // ÉTAPE 1 : D'abord marquer le versement comme supprimé
  try {
    await updateDoc(depositRef, {
      status: 'deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || 'Encaisseur central',
      deletedById: deletedById || null,
    })
  } catch (err: any) {
    throw new Error(`Erreur lors de la suppression du versement : ${err.message}`)
  }

  // ÉTAPE 2 : Ensuite retirer le flag des colis (utiliser set avec merge pour éviter les erreurs de documents inexistants)
  const deposit: any = snap.data()
  const ids = deposit.parcelIds || []

  try {
    const chunks: any[][] = []
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach((id: string) => {
        // Utiliser set avec merge:true au lieu de update pour ignorer les documents inexistants
        batch.set(doc(db, 'parcels', id), {
          centralDeposited: false,
          centralDepositedAt: null,
          centralDepositCity: null,
        }, { merge: true })
      })
      await batch.commit()
    }
  } catch (err: any) {
    // Le versement est déjà supprimé, on log juste l'erreur sans bloquer
    console.warn(`Versement ${depositId} supprimé. Avertissement lors de la mise à jour des colis:`, err.message)
  }

  return depositId
}

export async function resetAllAgencyCashBalances(resetBy: string, resetById: string) {
  if (!window.confirm('⚠️ ATTENTION : Vous êtes sur le point de réinitialiser TOUTES les soldes de caisse de TOUTES les agences à 0 DH.\n\nCette action ne peut pas être annulée.\n\nÊtes-vous absolument certain de vouloir continuer ?')) {
    throw new Error('Opération annulée.')
  }

  // Récupérer toutes les caisses
  const snapshot = await getDocs(collection(db, 'agencyCashes'))
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  let count = 0

  snapshot.docs.forEach(docSnap => {
    batch.update(docSnap.ref, {
      solde: 0,
      soldeEspeces: 0,
      soldeCheques: 0,
      soldeVirement: 0,
      lastResetAt: now,
      lastResetBy: resetBy || 'Encaisseur central',
      lastResetById: resetById || null,
    })
    count++
  })

  await batch.commit()

  return {
    success: true,
    count,
    message: `${count} caisse(s) réinitialisée(s) avec succès.`
  }
}

export async function deleteAllCentralCodDeposits(deletedBy: string, deletedById: string) {
  if (!window.confirm('⚠️ ATTENTION : Vous êtes sur le point de SUPPRIMER TOUS LES VERSEMENTS.\n\nTous les versements seront marqués comme supprimés et les colis seront démarqués.\n\nCette action ne peut pas être annulée.\n\nÊtes-vous absolument certain de vouloir continuer ?')) {
    throw new Error('Opération annulée.')
  }

  // Récupérer tous les versements non supprimés
  const snapshot = await getDocs(query(collection(db, 'centralCodDeposits'), where('status', '!=', 'deleted')))
  let count = 0
  const now = new Date().toISOString()

  for (const docSnap of snapshot.docs) {
    const deposit: any = docSnap.data()
    const ids = deposit.parcelIds || []

    // Retirer le flag centralDeposited des colis (utiliser set avec merge pour ignorer les inexistants)
    const chunks: any[][] = []
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach((id: string) => {
        // Utiliser set avec merge:true pour ignorer les documents inexistants
        batch.set(doc(db, 'parcels', id), {
          centralDeposited: false,
          centralDepositedAt: null,
          centralDepositCity: null,
        }, { merge: true })
      })
      try {
        await batch.commit()
      } catch (err: any) {
        console.warn(`Erreur ignorée lors de la mise à jour des colis:`, err.message)
      }
    }

    // Marquer le versement comme supprimé
    await updateDoc(doc(db, 'centralCodDeposits', docSnap.id), {
      status: 'deleted',
      deletedAt: now,
      deletedBy: deletedBy || 'Encaisseur central',
      deletedById: deletedById || null,
    })
    count++
  }

  return {
    success: true,
    count,
    message: `${count} versement(s) supprimé(s) avec succès.`
  }
}

export async function deleteAllCentralSupplierPayments(deletedBy: string, deletedById: string) {
  if (!window.confirm('⚠️ ATTENTION : Vous êtes sur le point de SUPPRIMER TOUS LES CHÈQUES (PAYÉS ET NON PAYÉS).\n\nTous les paiements seront marqués comme supprimés et les champs de paiement seront retirés des colis.\n\nCette action ne peut pas être annulée.\n\nÊtes-vous absolument certain de vouloir continuer ?')) {
    throw new Error('Opération annulée.')
  }

  // Récupérer TOUS les paiements (payés et non payés), sauf les déjà supprimés
  const snapshot = await getDocs(query(collection(db, 'centralSupplierPayments'), where('status', '!=', 'deleted')))
  let count = 0
  const now = new Date().toISOString()

  for (const docSnap of snapshot.docs) {
    const payment: any = docSnap.data()
    const ids = payment.parcelIds || []

    // Retirer les champs de paiement des colis (utiliser set avec merge pour ignorer les inexistants)
    const chunks: any[][] = []
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach((id: string) => {
        // Utiliser set avec merge:true pour ignorer les documents inexistants
        batch.set(doc(db, 'parcels', id), {
          centralSupplierPaymentId: null,
          centralSupplierPaymentStatus: null,
          centralSupplierPreparedAt: null,
          centralSupplierPreparedBy: null,
          centralSupplierPreparedById: null,
          centralChequeNum: null,
          centralChequeBank: null,
          centralChequeDate: null,
        }, { merge: true })
      })
      try {
        await batch.commit()
      } catch (err: any) {
        console.warn(`Erreur ignorée lors de la mise à jour des colis:`, err.message)
      }
    }

    // Marquer le paiement comme supprimé
    await updateDoc(doc(db, 'centralSupplierPayments', docSnap.id), {
      status: 'deleted',
      deletedAt: now,
      deletedBy: deletedBy || 'Encaisseur central',
      deletedById: deletedById || null,
    })
    count++
  }

  return {
    success: true,
    count,
    message: `${count} paiement(s) supprimé(s) avec succès.`
  }
}

export function subscribeAllCentralSupplierPayments(callback: any, onError: (err?: any) => void = () => {}) {
  // 180 jours pour éviter surcharge Firestore
  const since = daysAgoTimestamp(180)
  const q = query(collection(db, 'centralSupplierPayments'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.status !== 'deleted')), onError)
}

// ── Pointage / Contrôle Encaisseur Central ─────────────────────────────────
// Marque des colis COD comme "contrôlés" par l'encaisseur central.
// Champs ajoutés sur le colis : controlled, controlledBy, controlledById, controlledAt
const CONTROL_BATCH_SIZE = 450

export async function markParcelsControlled(parcelIds: string[], controlledBy: string, controlledById: string) {
  const ids = [...new Set((parcelIds || []).filter(Boolean))]
  if (ids.length === 0) return { updated: 0 }
  const now = new Date().toISOString()
  for (let i = 0; i < ids.length; i += CONTROL_BATCH_SIZE) {
    const chunk = ids.slice(i, i + CONTROL_BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(id => {
      batch.update(doc(db, 'parcels', id), {
        controlled: true,
        controlledBy: controlledBy || 'Encaisseur central',
        controlledById: controlledById || '',
        controlledAt: now,
      })
    })
    await batch.commit()
  }
  return { updated: ids.length, controlledAt: now }
}

export async function unmarkParcelsControlled(parcelIds: string[]) {
  const ids = [...new Set((parcelIds || []).filter(Boolean))]
  if (ids.length === 0) return { updated: 0 }
  for (let i = 0; i < ids.length; i += CONTROL_BATCH_SIZE) {
    const chunk = ids.slice(i, i + CONTROL_BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(id => {
      batch.update(doc(db, 'parcels', id), {
        controlled: false,
        controlledBy: deleteField(),
        controlledById: deleteField(),
        controlledAt: deleteField(),
      })
    })
    await batch.commit()
  }
  return { updated: ids.length }
}
