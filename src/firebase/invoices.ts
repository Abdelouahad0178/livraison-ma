import { db } from './config'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy,
  onSnapshot, Timestamp, getDoc, getDocs, limit, startAfter, writeBatch
} from 'firebase/firestore'

export interface InvoiceItem {
  parcelId: string
  trackingId: string
  senderNic?: string
  portAmount: number
  portType: 'port-du' | 'port-paye'
  senderName?: string
  recipientName?: string
  recipientCity?: string
  createdAt?: Date
}

export interface Invoice {
  id?: string
  invoiceNumber: string
  clientId: string
  clientName: string
  agencyCity: string
  createdAt: Timestamp
  dueDate?: Timestamp
  items: InvoiceItem[]
  totalAmount: number
  status: 'pending' | 'paid' | 'cancelled'
  notes?: string
  createdBy: string
  createdByName: string
  paidAt?: Timestamp
  paymentMethod?: string
  paymentReference?: string
}

// Générer le prochain numéro de facture automatique
export async function getNextInvoiceNumber(agencyCity: string): Promise<string> {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `${agencyCity.substring(0, 3).toUpperCase()}-${year}${month}`

  const q = query(
    collection(db, 'invoices'),
    where('agencyCity', '==', agencyCity),
    where('invoiceNumber', '>=', prefix),
    where('invoiceNumber', '<=', prefix + ''),
    orderBy('invoiceNumber', 'desc'),
    limit(1)
  )

  const snapshot = await getDocs(q)

  if (snapshot.empty) {
    return `${prefix}-001`
  }

  const lastNumber = snapshot.docs[0].data().invoiceNumber
  const lastSeq = parseInt(lastNumber.split('-').pop() || '0')
  const nextSeq = String(lastSeq + 1).padStart(3, '0')

  return `${prefix}-${nextSeq}`
}

// Créer une facture
export async function createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'invoices'), {
    ...invoice,
    createdAt: Timestamp.now(),
  })
  return docRef.id
}

// Mettre à jour une facture
export async function updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), updates)
}

// Supprimer une facture
export async function deleteInvoice(invoiceId: string): Promise<void> {
  await deleteDoc(doc(db, 'invoices', invoiceId))
}

// Marquer une facture comme payée
export async function markInvoiceAsPaid(
  invoiceId: string,
  paymentMethod: string,
  paymentReference?: string
): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), {
    status: 'paid',
    paidAt: Timestamp.now(),
    paymentMethod,
    paymentReference: paymentReference || '',
  })
}

// Annuler une facture
export async function cancelInvoice(invoiceId: string): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), {
    status: 'cancelled',
  })
}

// S'abonner à toutes les factures (pour admin)
export function subscribeAllInvoices(callback: (invoices: Invoice[]) => void): () => void {
  const q = query(
    collection(db, 'invoices'),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, snapshot => {
    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Invoice[]
    callback(invoices)
  })
}

// S'abonner aux factures d'une agence (pour chef d'agence)
export function subscribeAgencyInvoices(
  agencyCity: string,
  callback: (invoices: Invoice[]) => void
): () => void {
  console.log('📡 [subscribeAgencyInvoices] REQUÊTE FIRESTORE - agencyCity:', agencyCity)

  const q = query(
    collection(db, 'invoices'),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, snapshot => {
    console.log('📥 [subscribeAgencyInvoices] RÉPONSE FIRESTORE:', {
      agencyCity,
      nombreDocuments: snapshot.docs.length,
      factures: snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          invoiceNumber: data.invoiceNumber,
          agencyCity: data.agencyCity,
          clientName: data.clientName,
          totalAmount: data.totalAmount,
          status: data.status
        }
      })
    })

    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Invoice[]
    callback(invoices)
  })
}

// S'abonner aux factures d'un client (pour chef d'agence)
export function subscribeClientInvoices(
  clientId: string,
  callback: (invoices: Invoice[]) => void
): () => void {
  const q = query(
    collection(db, 'invoices'),
    where('clientId', '==', clientId),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, snapshot => {
    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Invoice[]
    callback(invoices)
  })
}

// Récupérer les colis non facturés d'un client
export async function getUnbilledParcelsForClient(
  clientId: string,
  portType: 'port-du' | 'port-paye',
  clientName?: string,
  agencyCity?: string
): Promise<any[]> {
  const portTypeValue = portType === 'port-du' ? 'port_du' : 'port_paye'

  try {
    if (!agencyCity || !clientName) {
      return []
    }

    // Charger TOUS les parcels de cette agence avec ce type de port
    // Requiert un index: originCity + portType + createdAt
    const agencyParcelsQuery = query(
      collection(db, 'parcels'),
      where('originCity', '==', agencyCity),
      where('portType', '==', portTypeValue),
      orderBy('createdAt', 'desc')
    )

    const snapshot = await getDocs(agencyParcelsQuery)

    // Filtrer en JavaScript pour recherche partielle
    const searchTerm = clientName.toLowerCase()
    const matchingParcels = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((p: any) => {
        // Exclure les parcels déjà facturés
        if (p.invoiced === true) return false

        // Recherche partielle dans plusieurs champs
        return (
          (p.clientId === clientId) ||
          (p.clientName || '').toLowerCase().includes(searchTerm) ||
          (p.sender?.name || '').toLowerCase().includes(searchTerm) ||
          (p.sender?.nic || '').toLowerCase().includes(searchTerm)
        )
      })

    console.log(`✅ ${matchingParcels.length} parcels non facturés trouvés pour "${clientName}" à ${agencyCity}`)
    return matchingParcels
  } catch (error) {
    console.error('❌ Erreur getUnbilledParcelsForClient:', error)
    throw error
  }
}

// Marquer des colis comme facturés
export async function markParcelsAsInvoiced(parcelIds: string[], invoiceId: string): Promise<void> {
  const batch = writeBatch(db)

  parcelIds.forEach(parcelId => {
    const parcelRef = doc(db, 'parcels', parcelId)
    batch.update(parcelRef, {
      invoiced: true,
      invoiceId: invoiceId,
      invoicedAt: Timestamp.now(),
    })
  })

  await batch.commit()
}

// Démarquer des colis comme non facturés (en cas d'annulation de facture)
export async function unmarkParcelsAsInvoiced(parcelIds: string[]): Promise<void> {
  const batch = writeBatch(db)

  parcelIds.forEach(parcelId => {
    const parcelRef = doc(db, 'parcels', parcelId)
    batch.update(parcelRef, {
      invoiced: false,
      invoiceId: null,
      invoicedAt: null,
    })
  })

  await batch.commit()
}
