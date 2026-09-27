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
  portType: 'port-du' | 'port-paye' | 'port-en-compte'
  senderName?: string
  recipientName?: string
  recipientCity?: string
  createdAt?: Date
  // Champs complémentaires (factures créées depuis l'interface Facturier)
  portTypeRaw?: string
  originCity?: string
  nbColis?: number
  codAmount?: number
  operationDate?: string
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
  // Période facturée (factures créées depuis l'interface Facturier)
  periodFrom?: string
  periodTo?: string
  periodLabel?: string
  invoiceDate?: string
  totals?: {
    count: number
    nbColis: number
    portPaye: number
    portDu: number
    portEnCompte: number
    cod: number
  }
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
  const q = query(
    collection(db, 'invoices'),
    where('agencyCity', '==', agencyCity),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q,
    snapshot => {
      const invoices = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Invoice[]
      callback(invoices)
    },
    error => {
      console.error('Erreur lors du chargement des factures:', error)
      callback([])
    }
  )
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

export type InvoicePortChoice = 'all' | 'port-du' | 'port-paye' | 'port-en-compte'

/** Famille de facturation d'un type de port brut (port_du, port_du_cheque, port_paye, port_en_compte_*) */
export function invoicePortFamily(raw?: string): 'port-du' | 'port-paye' | 'port-en-compte' {
  if (raw === 'port_du' || raw === 'port_du_cheque') return 'port-du'
  if (raw && raw.startsWith('port_en_compte')) return 'port-en-compte'
  return 'port-paye'
}

export const INVOICE_PORT_LABELS: Record<string, string> = {
  all: 'Tous les ports',
  'port-du': 'Port dû',
  'port-paye': 'Port payé',
  'port-en-compte': 'Port en compte',
}

// Récupérer les colis non facturés d'un client — TOUS les types de port (dû, dû chèque, payé, en compte)
// Expéditions envoyées par le client depuis l'agence (originCity) + expéditions reçues par le client
// en « port en compte destinataire » dans l'agence (destinationCity).
export async function getUnbilledParcelsForClient(
  clientId: string,
  portType: InvoicePortChoice = 'all',
  clientName?: string,
  agencyCity?: string
): Promise<any[]> {
  try {
    if (!agencyCity || !clientName) {
      return []
    }

    const norm = (v: any) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const searchTerm = norm(clientName)
    const matchesSender = (p: any) =>
      p.clientId === clientId ||
      norm(p.clientName).includes(searchTerm) ||
      norm(p.sender?.name).includes(searchTerm) ||
      norm(p.sender?.nic).includes(searchTerm)
    const matchesReceiver = (p: any) =>
      p.receiverClientId === clientId ||
      norm(p.receiver?.name).includes(searchTerm)

    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(db, 'parcels'), where('originCity', '==', agencyCity), orderBy('createdAt', 'desc'))),
      portType === 'all' || portType === 'port-en-compte'
        ? getDocs(query(collection(db, 'parcels'), where('destinationCity', '==', agencyCity), where('portType', '==', 'port_en_compte_destinataire')))
        : Promise.resolve(null as any),
    ])

    const out = new Map<string, any>()
    sentSnap.docs.forEach(d => {
      const p: any = { id: d.id, ...d.data() }
      if (p.invoiced === true) return
      if (p.portType === 'port_en_compte_destinataire') return // facturé au destinataire
      if (portType !== 'all' && invoicePortFamily(p.portType) !== portType) return
      if (matchesSender(p)) out.set(p.id, p)
    })
    receivedSnap?.docs?.forEach((d: any) => {
      const p: any = { id: d.id, ...d.data() }
      if (p.invoiced === true) return
      if (matchesReceiver(p)) out.set(p.id, p)
    })

    const list = [...out.values()].sort((a: any, b: any) =>
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    console.log(`✅ ${list.length} parcels non facturés trouvés pour "${clientName}" à ${agencyCity} (${portType})`)
    return list
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
