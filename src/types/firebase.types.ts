/**
 * Types stricts pour Firebase - Migration progressive depuis 'any'
 *
 * Usage: Importer ces types et remplacer progressivement les 'any' dans le code
 * Exemple: const parcel: any = ... → const parcel: Parcel = ...
 */

import { Timestamp } from 'firebase/firestore'

// ============================================================================
// TYPES DE BASE
// ============================================================================

export type ParcelStatus =
  | 'Initialisé'
  | 'En transit'
  | 'Arrivé en agence'
  | 'En cours de livraison'
  | 'Livré'
  | 'Retourné'
  | 'Retourné à l\'expéditeur'

export type CODStatus = 'pending' | 'collected' | 'remis' | 'paid'

export type UserRole =
  | 'admin'
  | 'directeur'
  | 'chef_agence'
  | 'agent'
  | 'aide_agent'
  | 'pointeur_encaisseur'
  | 'encaisseur_central'
  | 'chauffeur'
  | 'livreur'
  | 'caissier'
  | 'salarie'
  | 'client'

export type PaymentMode = 'especes' | 'cheque' | 'virement' | 'cod'

export type PortType = 'port_paye' | 'port_du'

// ============================================================================
// INTERFACES PRINCIPALES
// ============================================================================

export interface Address {
  name: string
  tel: string
  city: string
  address?: string
  nic?: string
}

export interface HistoryEntry {
  timestamp: string
  status: ParcelStatus
  agentName: string
  agentId: string | null
  note?: string
}

export interface Parcel {
  id: string
  trackingId: string

  // Status
  status: ParcelStatus
  createdAt: Timestamp | string
  history: HistoryEntry[]

  // Sender & Receiver
  sender: Address
  receiver: Address
  senderNic?: string

  // Location
  originCity: string
  destinationCity: string

  // Package details
  weight: number
  nbColis: number
  price: number
  portType: PortType
  content?: string

  // COD
  codAmount: number
  codStatus?: CODStatus
  codCollectedAt?: string
  codCollectedBy?: string
  codSentToSource?: boolean
  codReceivedBySource?: boolean
  codSenderPaid?: boolean
  codSenderPaidAt?: string

  // Agent tracking
  agentId?: string
  agentName?: string
  agentRole?: UserRole
  destinationAgentId?: string
  destinationAgentName?: string

  // Driver tracking
  chauffeurId?: string
  chauffeurName?: string
  deliveryDriverId?: string
  deliveryDriverName?: string
  returnedByDriverId?: string

  // Client
  clientId?: string

  // Arrivage
  arrivageId?: string
  arrivageDate?: string

  // Return
  returnToCity?: string
  returnReason?: string
  returnOf?: string

  // Central payments
  centralSupplierPaymentId?: string
  centralSupplierPaymentStatus?: 'prepared' | 'paid'
  centralChequeNum?: string
  centralChequeBank?: string
  centralChequeDate?: string

  // Timestamps
  deliveredAt?: string
  returnedAt?: string

  // Modifications
  modifiedAt?: string
  modifiedBy?: string
  modificationNote?: string
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  city?: string
  tel?: string
  cin?: string
  cnss?: string
  code?: string
  createdAt: string

  // Driver specific
  vehicleType?: 'camion' | 'fourgon' | 'voiture' | 'moto'
  vehiclePlate?: string

  // Employee specific
  salary?: number
  contractType?: string
  hireDate?: string

  // Portal
  portalUid?: string
  portalEmail?: string
}

export interface Client {
  id: string
  name: string
  email?: string
  tel: string
  city: string
  address?: string
  nic?: string

  // Portal
  portalUid?: string
  portalEmail?: string
  portalActivated?: boolean

  // Stats
  totalParcels?: number
  totalPaid?: number
  balance?: number

  createdAt: Timestamp | string
}

export interface CaisseEntry {
  id: string
  type: 'entree' | 'sortie'
  category: string
  amount: number
  description: string

  // Location & User
  city: string
  agentId?: string
  agentName?: string
  cashierId?: string
  cashierName?: string

  // Payment details
  paymentMode?: PaymentMode
  reference?: string
  chequeNum?: string
  bankName?: string

  // Metadata
  note?: string
  createdAt: Timestamp | string
  createdBy?: string
}

export interface CentralCodDeposit {
  id: string
  city: string
  agentId: string | null
  agentName: string
  amount: number
  parcelIds: string[]
  parcelCount: number
  parcels: Array<{
    id: string
    trackingId: string
    senderName: string
    senderNic: string
    senderTel: string
    receiverName: string
    receiverTel: string
    originCity: string
    destinationCity: string
    amount: number
  }>
  status: 'verse'
  note: string
  cashBefore: number
  cashAfter: number
  cashShortage: number
  createdAt: Timestamp | string
}

export interface CentralSupplierPayment {
  id: string
  senderName: string
  senderTel: string
  senderNic: string
  amount: number
  parcelIds: string[]
  parcelCount: number
  parcels: Array<{
    id: string
    trackingId: string
    senderNic: string
    receiverName: string
    receiverTel: string
    originCity: string
    destinationCity: string
    amount: number
  }>
  chequeNum: string
  bankName: string
  chequeDate: string
  preparedBy: string
  preparedById: string | null
  note: string
  status: 'prepared' | 'paid' | 'deleted'
  createdAt: Timestamp | string
  paidAt?: Timestamp | string
  paidBy?: string
  paidById?: string | null
  updatedAt?: string
  updatedBy?: string
  updatedById?: string | null
  deletedAt?: string
  deletedBy?: string
  deletedById?: string | null
}

export interface BankDeposit {
  id: string
  parcelId: string | null
  trackingId: string
  senderName: string
  receiverName: string
  amount: number
  bankName: string
  refNum: string
  depositDate: string
  city: string
  agentId: string | null
  agentName: string
  note: string
  createdAt: Timestamp | string
  adminConfirmed?: boolean
  adminConfirmedAt?: string
  adminConfirmedBy?: string
}

export interface Reglement {
  id: string
  agencyCity: string
  pointeurId: string
  pointeurName: string
  amount: number
  parcelIds: string[]
  parcelCount: number
  mode: PaymentMode
  chequeNum?: string
  bankName?: string
  status: 'prepared' | 'sent_to_source' | 'received_by_source' | 'rejected'
  createdAt: Timestamp | string
  sentAt?: string
  receivedAt?: string
  rejectedAt?: string
  rejectedReason?: string
}

// ============================================================================
// TYPES UTILITAIRES
// ============================================================================

export interface FirestoreTimestamp {
  toDate(): Date
  seconds: number
  nanoseconds: number
}

export type FirestoreDate = Timestamp | FirestoreTimestamp | string | Date

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  hasMore: boolean
  lastDoc: unknown
  total?: number
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as FirestoreTimestamp).toDate === 'function'
  )
}

export function isParcel(value: unknown): value is Parcel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'trackingId' in value &&
    'status' in value
  )
}

export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'email' in value &&
    'role' in value
  )
}
