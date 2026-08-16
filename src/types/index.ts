import type { Timestamp } from 'firebase/firestore'

// ── Unions ─────────────────────────────────────────────────────────────────

export type ParcelStatus =
  | 'Initialisé'
  | 'En transit'
  | 'Arrivé en agence'
  | 'En cours de livraison'
  | 'Livré'
  | 'Retourné'
  | 'Retour en transit'
  | 'Retour arrivé'
  | 'Retour finalisé'

export type CodStatus = 'pending' | 'collected' | 'remis'

export type CodPaymentType = 'especes' | 'cheque' | 'traite' | 'bon_livraison' | 'retour_bl'

export type PortType = 'port_paye' | 'port_du' | 'port_en_compte' | 'port_en_compte_expediteur' | 'port_en_compte_destinataire'

export type ServiceType = 'oc' | 'especes' | 'cheque' | 'traite' | 'retour_bl'

export type AgentRole = 'agent' | 'aide_agent' | 'client_portal' | 'chef_agence'

export type UserRole =
  | 'admin'
  | 'chef_agence'
  | 'agent'
  | 'aide_agent'
  | 'caissier'
  | 'pointeur'
  | 'chauffeur'
  | 'directeur'

export type CustomerMode = 'client' | 'personal'

export type DateFilterPreset = 'all' | 'operational' | 'today' | 'week' | 'month' | 'day' | 'custom'

// ── Sub-objects ────────────────────────────────────────────────────────────

export interface Address {
  name: string
  tel?: string  // 📞 Téléphone optionnel
  city: string
  address?: string
  nic?: string
  email?: string
  phone?: string
}

export interface HistoryEntry {
  status: ParcelStatus
  timestamp: string
  note?: string
  lat?: number
  lng?: number
}

export interface LastLocation {
  lat: number
  lng: number
  status: ParcelStatus
  timestamp: string
}

// ── Parcel ─────────────────────────────────────────────────────────────────

export interface Parcel {
  id: string
  trackingId: string
  sender: Address
  receiver: Address
  weight: number
  nbColis: number
  natureOfGoods: string
  serviceType: ServiceType
  customerMode: CustomerMode
  price: number
  codAmount: number
  status: ParcelStatus
  history: HistoryEntry[]
  photoUrl: string
  createdAt: Timestamp | string
  workDate?: string  // 📅 Date de travail (YYYY-MM-DD) - gère sessions de nuit 20h-06h
  agentId: string | null
  agentName: string | null
  chauffeurId: string | null
  chauffeurName: string | null
  deliveryDriverId: string | null
  deliveryDriverName: string | null
  deliverySectorId: string | null
  deliverySectorCode: string
  deliverySectorName: string
  deliveryVehicleId: string | null
  deliveryVehicleLabel: string
  deliveryMethod: 'domicile' | 'gare'  // Mode de livraison: domicile ou en gare
  destinationCity: string | null
  originCity: string | null
  shipmentLoadedAt: string | null
  destinationArrivedAt: string | null
  visibleInDestinationAgency: boolean
  destinationAgentId: string | null
  destinationAgentName: string | null
  deliveryAssignedAt: string | null
  deliveryAssignedBy: string
  codStatus: CodStatus | null
  codPaymentType: CodPaymentType | null
  codCollectedAt: string | null
  codCollectedBy: string | null
  codRemisAt: string | null
  codRemisBy: string | null
  portType: PortType
  clientId: string | null
  clientName: string | null
  returnOf: string | null
  returnOfTrackingId: string | null
  agentRole: AgentRole
  aideAgentId: string | null
  aideAgentName: string
  clientPortalUid: string | null
  clientPortalName: string
  requestedFromPortal: boolean
  requestedByClientId: string | null
  requestedByClientName: string
  requestedAt: Timestamp | null
  validatedByChef: boolean | null
  aideEditUnlocked: boolean
  // Optional fields added over time
  receiverClientId?: string | null
  returnToCity?: string
  returnShippedAt?: string
  returnedAt?: string
  returnReason?: string
  wasReturned?: boolean
  validatedAt?: string
  validatedById?: string
  validatedByName?: string
  portalDebitCreated?: boolean
  lastLocation?: LastLocation
  arrivedNbColis?: number
  // Champs pour le livreur de retour (séparés du livreur initial)
  returnDeliveryDriverId?: string | null
  returnDeliveryDriverName?: string | null
  returnDeliverySectorId?: string | null
  returnDeliverySectorCode?: string | null
  returnDeliverySectorName?: string | null
  returnDeliveryAssignedAt?: string | null
  returnDeliveryAssignedBy?: string | null
  // Signatures électroniques (double signature pour retours)
  signatureToken?: string | null
  signatureTokenCreatedAt?: string | null
  signatureConfirmedAt?: string | null
  returnSignatureToken?: string | null
  returnSignatureTokenCreatedAt?: string | null
  returnSignatureConfirmedAt?: string | null
}

// ── CaisseEntry ────────────────────────────────────────────────────────────

export type CaisseEntryType = 'entree' | 'sortie'

export interface CaisseEntry {
  id: string
  type: CaisseEntryType
  category: string
  amount: number
  description: string
  reference: string
  agentId: string | null
  agentName: string | null
  sourceAgentId: string | null
  sourceAgentName: string
  staffId: string | null
  staffName: string | null
  staffRole: string
  salaryMonth: string
  paymentKind: string
  city: string
  cashierId: string | null
  cashierName: string
  note: string
  createdAt: Timestamp
  updatedAt?: Timestamp
  updatedBy?: string
}

// ── AppUser ────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  city: string
  code?: string
  phone?: string
  createdAt?: Timestamp
  permissions?: Record<string, boolean>
  agentId?: string
}

// ── Driver (chauffeur de transport ou livreur local) ───────────────────────

export type DriverRole = 'chauffeur' | 'livreur'

export interface Driver {
  id: string
  name: string
  phone: string
  city: string
  role: DriverRole
  vehicleType?: string
  vehicleId?: string
  active?: boolean
  sectorId?: string | null
  sectorName?: string
  createdAt?: Timestamp
}

// ── Client ─────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  tel: string
  email: string
  address: string
  city: string
  nic: string
  accountType: 'cash' | 'credit'
  remise: number
  balance: number
  notes: string
  createdAt: Timestamp
  portalUid: string | null
  portalEmail: string
  autoCreated?: boolean
  autoCreatedFrom?: string
  lastReceiverParcelId?: string | null
  lastReceiverTrackingId?: string | null
  lastReceiverSeenAt?: Timestamp | null
}

// ── BankDeposit ────────────────────────────────────────────────────────────

export interface BankDeposit {
  id: string
  amount: number
  bankName: string
  reference: string
  date: string
  city: string
  agentId: string | null
  agentName: string | null
  createdAt: Timestamp
}

// ── Tariff ─────────────────────────────────────────────────────────────────

export interface WeightRule {
  max: number | null
  label: string
  extra: number
  order?: number
}

export interface TariffConfig {
  cityPrices: Record<string, number>
  weightRules: WeightRule[]
  extraPerAdditionalParcel: number
}

// ── Arrivage ───────────────────────────────────────────────────────────────

export interface ArrivageColisDetail {
  parcelId: string
  trackingId: string
  senderName: string
  receiverName: string
  receiverPhone?: string
  weight: number
  nbColis: number
  serviceType: string
  originCity: string
  chauffeurName: string
  codAmount: number
  arrived: number
  total: number
  pointed: boolean
  addedViaClaimParcel?: boolean
}

export interface Arrivage {
  id: string
  arrivageRef: string
  city: string
  type: 'auto' | 'manual'
  pointageStatus: 'pending' | 'done'
  arrivedParcelIds: string[]
  arrivedColisDetail: ArrivageColisDetail[]
  missingParcelIds: string[]
  missingColisDetail: ArrivageColisDetail[]
  colisWithoutBon?: string[]
  colisWithoutBonCount?: number
  agentId: string
  agentName: string
  createdAt: Timestamp
}

// ── AgentCodRequest ────────────────────────────────────────────────────────

export interface AgentCodRequest {
  id: string
  agentId: string
  agentName: string
  city: string
  amount: number
  paymentType: CodPaymentType
  parcelIds: string[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Timestamp
  processedAt?: Timestamp
  processedBy?: string
}

// ── CaisseRequest ──────────────────────────────────────────────────────────

export type CaisseRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed'
export type CaisseRequestType =
  | 'virement_banque' | 'stockage_coffre' | 'retrait_especes'
  | 'rh_salaire' | 'rh_avance'

export interface CaisseRequest {
  id: string
  city: string
  source: 'caissier' | 'rh'
  type: CaisseRequestType
  status: CaisseRequestStatus
  amount: number
  description: string
  reference: string
  category: string
  staffId: string | null
  staffName: string
  staffRole: string
  salaryMonth: string
  paymentKind: string
  note: string
  caisserId: string | null
  cashierName: string
  requestedBy: string
  requestedById: string | null
  approvedBy: string | null
  approvedById: string | null
  approvedAt: Timestamp | null
  rejectionReason: string | null
  createdAt: Timestamp
  completedAt: Timestamp | null
}

// ── EmployeeUser ────────────────────────────────────────────────────────────

export type FamilySituation = 'Célibataire' | 'Marié(e)' | 'Divorcé(e)' | 'Veuf/Veuve' | ''

export interface EmployeeUser {
  id: string
  name: string
  email: string
  role: UserRole
  city: string
  code: string
  tel: string
  // HR fields
  cin: string
  cnss: string
  assurance: string
  dateEmbauche: string
  dateSortie: string
  dateNaissance: string
  salaire: string
  adresse: string
  situationFamiliale: FamilySituation
  contactUrgence: string
  noteRH: string
  // optional system fields
  blocked?: boolean
  createdAt?: Timestamp
  directorPermissions?: string[]
  matricule?: string
  chauffeurType?: string
  sectorId?: string | null
}

// ── DriverPortDuTransaction ─────────────────────────────────────────────────

export type DriverTxType = 'versement' | 'avance' | 'remise'

export interface DriverPortDuTransaction {
  id: string
  driverId: string
  driverName: string
  city: string
  type: DriverTxType
  amount: number
  note: string
  createdAt: Timestamp
}
