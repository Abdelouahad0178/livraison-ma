import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { signOut, createUserWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged } from 'firebase/auth'
import { auth, authSecondary, db } from '../firebase/config'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import ParcelScanModal from '../components/ParcelScanModal'
import { doc, onSnapshot, setDoc, collection, updateDoc, deleteDoc, getDoc, query, where, arrayUnion } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  createParcel, subscribeAgentParcels, getMoreAgentParcels, getAccurateAgencyStats,
  updateParcel, deleteParcel, markParcelAsReturned, loadReturnedParcelOnTruck, validateReturnArrival, validateParcelEntry,
  updateParcelStatus, isParcelVisibleInDestinationAgency,
  subscribeAgencyParcels, subscribeAgencyReturnParcels, subscribePendingAideAgentParcels,
  createReturnParcel, searchParcelByTrackingId,
} from '../firebase/parcels'
import { markPortDuReceivedByChef, markParcelChefPointed } from '../firebase/finance'
import { collectPortDu } from '../firebase/cod'
import { createCentralCodDeposit } from '../firebase/central'
import {
  subscribeDrivers, subscribeSectors, createSector, updateSector, deleteSector,
  subscribeAllSectors, createBonRamasageBatch, subscribeBonRamasageBatches, deleteBonRamasageBatch,
  createArrivage, subscribeArrivages, saveArrivagePointage,
  assignDriver, assignDriversBulk, assignDeliveryDriver
} from '../firebase/delivery'
import { subscribeAllUsers, getAgentCode } from '../firebase/users'
import {
  createAdminTransferFromAgent, subscribeMyAdminTransfers,
  createCaisseEntry, deleteCaisseEntry, deleteCaisseEntries, deleteAgentCashierHistory,
  subscribeCaisseByCity, subscribeAgencyCash, adjustAgencyCash,
  directTransferAgentToCashierAtomic, createAgentCashRecoveryRequest, subscribeAgentCashRecoveryRequests,
  subscribeDriverPortDuTransactionsByCity, confirmDriverVersement
} from '../firebase/caisse'
import {
  remitCod, collectCod, collectCodAtSource, collectCodAtDestination,
  settleCodToSender, batchSettleCods, fetchAllAgentCodParcels,
  markCodSentToSource, confirmCodReceivedBySource
} from '../firebase/cod'
import {
  subscribeRapports, subscribeAllReglements, subscribeSourceReglements,
  confirmReglementReceivedBySource, validerRapport, rejeterRapport
} from '../firebase/finance'
import { subscribeAgentNotesByCity } from '../firebase/agentNotes'
import {
} from '../firebase/firestore'
import {
  subscribeAgentCodRequests, markAgentCodRequestRead, addAgentCodRequestReply, resolveAgentCodRequest,
} from '../firebase/agentCodRequests'
import {
  subscribeClients, createClient, updateClient, addPayment,
  subscribeAgencyModificationRequests, resolveModificationRequest, deleteModificationRequest,
} from '../firebase/clients'
import { subscribeVehicles } from '../firebase/vehicles'
import { createBankDeposit, subscribeBankDepositsByCity } from '../firebase/bankDeposits'
import {
  CITIES, STATUS_COLORS, STATUSES, COD_PAYMENT_TYPES, COD_STATUS, codCollectedLabel,
  CAISSE_CATEGORIES, REGLEMENT_MODES, MOD_TYPES, calculateTariff,
} from '../firebase/constants'
import { isCash, isRetourFondValue } from './agent/hooks/useAgentHandlers'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import { printDeliveryList } from '../utils/printDeliveryList'
import SignatureViewerModal from '../components/SignatureViewerModal'
import {
  Package, LogOut, Printer, MessageCircle, Plus, ChevronDown,
  Edit2, X, Check, Lock, Unlock, Search, Trash2, User, Calendar, MapPin, Inbox,
  Truck, Banknote, Menu, Wallet, TrendingUp, ArrowRight, Send, Users, Phone,
  LayoutGrid, Car, Filter,
  CheckSquare, Square, ChevronLeft, ChevronRight, Clock, CheckCircle2, AlertTriangle, Minus, Plus as PlusIcon,
  RotateCcw, Save, BarChart2, Archive,
} from 'lucide-react'
import { AgentCtx } from './agent/AgentCtx'
import { useAgentHandlers } from './agent/hooks/useAgentHandlers'
import AgentHeader from './agent/AgentHeader'
import AgentReceiveModal from './agent/modals/AgentReceiveModal'
import AgentReturnModal from './agent/modals/AgentReturnModal'
import { printCharge, printTable, printBonRamassage } from '../utils/agentPrintUtils'
import DateFilter from './agent/DateFilter'
import ParcelsTab from './agent/tabs/ParcelsTab'  // ⭐ Import direct pour mise à jour temps réel
const HomeTab = lazy(() => import('./agent/tabs/HomeTab'))
const NewTab = lazy(() => import('./agent/tabs/NewTab'))
const CaisseTab = lazy(() => import('./agent/tabs/CaisseTab'))
const CodTab = lazy(() => import('./agent/tabs/CodTab'))
const AgentClientsTab = lazy(() => import('./agent/tabs/AgentClientsTab'))
const ModificationsTab = lazy(() => import('./agent/tabs/ModificationsTab'))
const ChargeTab = lazy(() => import('./agent/tabs/ChargeTab'))
const SectorsTab = lazy(() => import('./agent/tabs/SectorsTab'))
const DriversTab = lazy(() => import('./agent/tabs/DriversTab'))
const DashboardTab = lazy(() => import('./agent/tabs/DashboardTab'))
const AideAgentsTab = lazy(() => import('./agent/tabs/AideAgentsTab'))
const ArrivageTab = lazy(() => import('./agent/tabs/ArrivageTab'))
const RetoursTab = lazy(() => import('./agent/tabs/RetoursTab'))
const NotesAgentsTab = lazy(() => import('./agent/tabs/NotesAgentsTab'))
const LostParcelsTab = lazy(() => import('./agent/tabs/LostParcelsTab'))

const MOD_STATUS = {
  pending:  { label: 'En attente', bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { label: 'Approuvee',  bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Refusee',    bg: 'bg-red-100',   text: 'text-red-700'   },
}
const fmtModDate = (ts: any) => {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const parcelDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const entryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}
const filterByDate = (list: any, preset: any, from: any, to: any, getDate = parcelDate) => {
  if (preset === 'all') return list
  const now = new Date()
  const endOfToday = new Date(); endOfToday.setHours(23,59,59,999)
  let start: any = null, end: any = endOfToday
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'day')    { start = from ? new Date(from) : null; if (start) { start.setHours(0,0,0,0); end = new Date(from+'T23:59:59') } }
  else if (preset === 'custom') { start = from ? new Date(from) : null; if (start) start.setHours(0,0,0,0); end = to ? new Date(to+'T23:59:59') : endOfToday }
  return list.filter((p: any) => {
    const d = getDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}
const dateFilterLabel = (preset: string): string => (({
  all: 'Solde total',
  today: "Solde aujourd'hui",
  week: 'Solde 7 jours',
  month: 'Solde ce mois',
  custom: 'Solde filtre',
} as Record<string, string>)[preset] || 'Solde filtre')
const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const matchesSearch = (values: any, query: any) => {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = String(v ?? '').toLowerCase()
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

// Mappe le type de service convenu à la création → clé COD_PAYMENT_TYPES
const serviceToPaymentType = (st: any) =>
  st === 'retour_bl' ? 'bon_livraison' : (st === 'simple' ? 'especes' : (st || 'especes'))

function useDebounce(value: any, delay = 280) {
  const [d, setD] = useState(value)
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t) }, [value, delay])
  return d
}

const todayStr = () => new Date().toISOString().split('T')[0]
const parsePositiveNumber = (value: any, fallback = 0) => {
  const num = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) && num >= 0 ? num : fallback
}
const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '',
  weight: '', nbColis: '1', natureOfGoods: '', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', shipmentMode: 'personal',
  portType: 'port_paye', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  operationDate: todayStr(),
}

export default function AgentPage() {
  const navigate  = useNavigate()
  const ticketRef  = useRef<any>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]           = useState<any>(null)
  const [drivers, setDrivers]           = useState<any[]>([])
  const [tab, setTab]                   = useState('home')
  const [msg, setMsg]                   = useState<{ type: string; text: string } | null>(null)
  const [subTab, setSubTab]             = useState('mine')
  const [viewSignature,     setViewSignature]     = useState<any>(null)
  const [returnParcelModal, setReturnParcelModal] = useState<any>(null)
  const [returningParcelId, setReturningParcelId] = useState<any>(null)
  const [loadingTruckId,      setLoadingTruckId]      = useState<any>(null)
  const [returnReasonModal,   setReturnReasonModal]   = useState<any>(null)
  const [validatingReturnId,  setValidatingReturnId]  = useState<any>(null)

  // ── Arrivages
  const [arrivageTab,      setArrivageTab]      = useState('nouveau')
  const [transitParcels,   setTransitParcels]   = useState<any[]>([])
  const [arrivages,        setArrivages]        = useState<any[]>([])
  const [arrivedBoxes,     setArrivedBoxes]     = useState<any>({})
  const [expandedGroups,   setExpandedGroups]   = useState<any>({})
  const [arrivageNotes,    setArrivageNotes]    = useState('')
  const [arrivageScan,     setArrivageScan]      = useState('')
  const [arrivageSearch,   setArrivageSearch]    = useState('')
  const [arrivageDatePreset, setArrivageDatePreset] = useState('all')
  const [arrivageDateFrom, setArrivageDateFrom]  = useState('')
  const [arrivageDateTo,   setArrivageDateTo]    = useState('')
  const [arrivageTypeFilter, setArrivageTypeFilter] = useState('all')
  const [arrivageServiceFilter, setArrivageServiceFilter] = useState('all')
  const [arrivageDriverFilter, setArrivageDriverFilter] = useState('all')
  const [arrivageOriginFilter, setArrivageOriginFilter] = useState('all')
  const [arrivageStatusFilter, setArrivageStatusFilter] = useState('all')
  const [arrivageAgentFilter, setArrivageAgentFilter] = useState('all')
  const [arrivageExpandedIds, setArrivageExpandedIds] = useState(new Set())
  const [arrivageConfirming, setArrivageConfirming] = useState(false)

  // ── Notes agents
  const [agentNotes, setAgentNotes] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [arrivageError,    setArrivageError]    = useState('')
  const [arrivageSuccess,  setArrivageSuccess]  = useState<any>(null)
  const [arrivageShowFilters, setArrivageShowFilters] = useState(false)
  const [arrivageShowSansBon, setArrivageShowSansBon] = useState(false)
  const [arrivageShowNotes,   setArrivageShowNotes]   = useState(false)
  const [arrScanFlash,        setArrScanFlash]        = useState<any>(null)
  // ── Historique pointage ──────────────────────────────────────────────────────
  const [histPointEdits,   setHistPointEdits]   = useState<any>({})
  const [histSaving,       setHistSaving]       = useState<any>({})
  const [histPointErr,     setHistPointErr]     = useState<any>({})
  const [histExpandedPt,   setHistExpandedPt]   = useState<any>(null)
  const [histSearchQ,      setHistSearchQ]      = useState('')
  const [histSearchRes,    setHistSearchRes]    = useState<any>(null)
  const [histSearching,    setHistSearching]    = useState(false)
  const [histSearchErr,    setHistSearchErr]    = useState('')
  const [colisWithoutBon,  setColisWithoutBon]  = useState<any[]>([])
  const [colisWbForm,      setColisWbForm]      = useState({ trackingRef: '', description: '', originCity: '', nbColis: '1' })
  const [chefPointing,     setChefPointing]     = useState<any>({})
  const [showFilters,      setShowFilters]       = useState(false)


  const [form, setForm]                 = useState(EMPTY_FORM)
  const [createdParcel, setCreatedParcel] = useState<any>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const [parcels, setParcels]           = useState<any[]>([])
  const [returnParcels, setReturnParcels] = useState<any[]>([])
  const [loadingParcels, setLoadingParcels] = useState(false)
  const [pendingAideParcels, setPendingAideParcels] = useState<any[]>([])
  const [search, setSearch]             = useState('')
  const [datePreset, setDatePreset]     = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [parcelDirection, setParcelDirection] = useState('all')
  const [serviceFilter, setServiceFilter]   = useState('all')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelEditorFilter, setParcelEditorFilter] = useState('all')
  const [destinationCityFilter, setDestinationCityFilter] = useState('all')  // ⭐ Filtre ville de destination
  const [driverFilter, setDriverFilter] = useState('all')  // ⭐ Filtre par livreur/chauffeur
  const [extraParcels, setExtraParcels]             = useState<any[]>([])
  const [hasMoreParcels, setHasMoreParcels]         = useState(false)
  const [loadingMore, setLoadingMore]               = useState(false)
  const [accurateStats, setAccurateStats]           = useState<any>(null)
  const [parcelPage, setParcelPage]                 = useState(0)
  const [scanOpen, setScanOpen]             = useState(false)
  const [scanQuery, setScanQuery]           = useState('')
  const [scanResult, setScanResult]         = useState<any>(null)
  const [globalScanModal, setGlobalScanModal] = useState<any>(null)
  const scanBufferRef = useRef('')
  const scanLastKeyRef = useRef(0)
  const searchLastChangeRef = useRef(0)
  const chefDefaultTodayRef = useRef(false)
  const _s = useRef<Record<string, any>>({})
  const [caisseDatePreset, setCaisseDatePreset] = useState('all')
  const [caisseDateFrom, setCaisseDateFrom]     = useState('')
  const [caisseDateTo, setCaisseDateTo]         = useState('')
  const [caisseSearch, setCaisseSearch]         = useState('')
  const [codDatePreset, setCodDatePreset]       = useState('all')
  const [codDateFrom, setCodDateFrom]           = useState('')
  const [codDateTo, setCodDateTo]               = useState('')
  const [codSearch, setCodSearch]               = useState('')

  // ── Debounced search values (évite le recalcul à chaque frappe)
  const debouncedSearch      = useDebounce(search)
  const debouncedCaisseSearch = useDebounce(caisseSearch)
  const debouncedCodSearch    = useDebounce(codSearch)

  const [editingParcel, setEditingParcel] = useState<any>(null)
  const [editForm, setEditForm]         = useState<any>(null)
  const [editLoading, setEditLoading]   = useState(false)
  const [editError, setEditError]       = useState('')

  const [clients,         setClients]         = useState<any[]>([])
  const [clientSearch,    setClientSearch]    = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showSenderDropdown, setShowSenderDropdown] = useState(false)
  const [inlineNewClient, setInlineNewClient] = useState<any>(null)
  const [menuOpen, setMenuOpen]         = useState(false)

  // action: 'edit' | 'delete'
  const [codeModal, setCodeModal]       = useState({ open: false, parcel: null as any, action: 'edit', code: '', error: '' })
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [transportModal, setTransportModal] = useState({ open: false, parcel: null as any, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })
  const [bulkLoadSelectedIds, setBulkLoadSelectedIds] = useState<any[]>([])
  const [bulkLoadName, setBulkLoadName] = useState('')
  const [bulkLoadPhone, setBulkLoadPhone] = useState('')
  const [bulkLoadBusy, setBulkLoadBusy] = useState(false)
  const [bulkLoadError, setBulkLoadError] = useState('')
  const [deliveryModal, setDeliveryModal] = useState({ open: false, parcel: null as any, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })
  const [codCollectModal, setCodCollectModal] = useState({ open: false, parcel: null as any, paymentType: '', loading: false, withDelivery: false })
  const [portCollectModal, setPortCollectModal] = useState({ open: false, parcel: null as any, paymentType: '', loading: false })
  const collectedCodIds = useRef(new Set())
  const [agentEntries, setAgentEntries] = useState<any[]>([])
  const [agencyCashiers, setAgencyCashiers] = useState<any[]>([])
  const [allUsers,       setAllUsers]       = useState<any[]>([])
  const [validatingEntryId, setValidatingEntryId] = useState<any>(null)
  const [selectedAideEntryIds, setSelectedAideEntryIds] = useState<any[]>([])
  const [bulkAideValidating, setBulkAideValidating] = useState(false)
  const [bulkAideValidationError, setBulkAideValidationError] = useState('')
  const [modRequests, setModRequests] = useState<any[]>([])
  const [togglingAideAccessId, setTogglingAideAccessId] = useState<any>(null)
  const [createAideModal,   setCreateAideModal]   = useState(false)
  const [aideForm, setAideForm] = useState({ name: '', email: '', password: '', tel: '' })
  const [aideLoading, setAideLoading] = useState(false)
  const [aideError,   setAideError]   = useState('')

  // ── Pointeurs-Encaisseurs
  const [createPointeurModal,   setCreatePointeurModal]   = useState(false)
  const [pointeurForm, setPointeurForm] = useState({ name: '', email: '', password: '', tel: '' })
  const [pointeurLoading, setPointeurLoading] = useState(false)
  const [pointeurError,   setPointeurError]   = useState('')
  const [pointeurRapports, setPointeurRapports] = useState<any[]>([])
  const [pointeurReglements, setPointeurReglements] = useState<any[]>([])
  const [sourcePointeurReglements, setSourcePointeurReglements] = useState<any[]>([])
  const [rapportValidating, setRapportValidating] = useState<any>(null)
  const [rapportError, setRapportError] = useState('')
  const [rapportChefNotes, setRapportChefNotes] = useState('')
  const [rapportNotesMap, setRapportNotesMap] = useState<any>({})
  const [agencyCash, setAgencyCash] = useState<any>(null)
  const [directTransfer, setDirectTransfer] = useState({ cashierId: '', amount: '', description: '', loading: false, error: '', success: '' })
  const [recoveryRequest, setRecoveryRequest] = useState({ cashierId: '', amount: '', description: '', loading: false, error: '', success: '' })
  const [adminTransferForm, setAdminTransferForm] = useState({ amount: '', note: '', loading: false, error: '', success: '' })
  const [myAdminTransfers, setMyAdminTransfers] = useState<any[]>([])
  const [cashRecoveryRequests, setCashRecoveryRequests] = useState<any[]>([])
  const [agentOpsDelete, setAgentOpsDelete] = useState({ loading: false, message: '', error: '' })
  const [cashierHistoryDelete, setCashierHistoryDelete] = useState({ loading: false, message: '', error: '' })
  const [clientsSearch, setClientsSearch] = useState('')
  const [agentNewClient, setAgentNewClient] = useState<any>(null)
  const [agentClientSaving, setAgentClientSaving] = useState(false)
  const [codSettling, setCodSettling]       = useState<any>(null) // parcelId being settled
  const [allCodParcels, setAllCodParcels]   = useState<any>(null) // null = not loaded yet
  const [codLoadingAll, setCodLoadingAll]   = useState(false)
  const [batchSettling, setBatchSettling]   = useState(false)
  const [agentCodRequests, setAgentCodRequests] = useState<any[]>([])
  const [codRequestDrafts, setCodRequestDrafts] = useState<any>({})
  const [codRequestBusy, setCodRequestBusy] = useState('')

  // ── Versements bancaires
  const [bankDeposits,      setBankDeposits]      = useState<any[]>([])
  const [bankDepositModal,  setBankDepositModal]  = useState<any>(null)  // null | { parcel, bankName, refNum, depositDate, note, loading, error }
  const [bankDepositPrinting, setBankDepositPrinting] = useState(false)
  const [centralDepositState, setCentralDepositState] = useState({ loading: false, error: '', success: '' })
  const [centralDepositSelectedIds, setCentralDepositSelectedIds] = useState<any[]>([])

  // ── Feuille de charge
  const [chargeDriverId,    setChargeDriverId]    = useState('')
  const [chargeDatePreset,  setChargeDatePreset]  = useState('all')
  const [chargeDateFrom,    setChargeDateFrom]    = useState('')
  const [chargeDateTo,      setChargeDateTo]      = useState('')

  // ── Secteurs
  const [sectors,       setSectors]       = useState<any[]>([])
  const [allSectors,    setAllSectors]    = useState<any[]>([])
  const [vehicles,      setVehicles]      = useState<any[]>([])
  const [bonBatches,    setBonBatches]    = useState<any[]>([])
  const [sectorModal,   setSectorModal]   = useState<any>(null)  // null | { mode:'new'|'edit', id?, code, name, loading, error }
  const [bonPrintModal, setBonPrintModal] = useState<any>(null)  // null | { sectorId, sectorCode, chauffeurId, chauffeurName, count, loading, error }
  const [driverModal,          setDriverModal]          = useState<any>(null)
  const [confirmDeleteDriverId, setConfirmDeleteDriverId] = useState<any>(null)
  const [authTick, setAuthTick] = useState(0)

  // Restart subscriptions when Firebase Auth token changes (refresh or re-login)
  useEffect(() => {
    return onIdTokenChanged(auth, user => {
      if (user) setAuthTick(t => t + 1)
    })
  }, [])

  const profileLoadedOnce = useRef(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) {
          const data = snap.data()
          if (data.blocked) { signOut(auth).then(() => navigate('/login')); return }
          if (!profileLoadedOnce.current) {
            // First load: refresh token so Firestore rules can read the user doc before subscriptions start
            profileLoadedOnce.current = true
            auth.currentUser?.getIdToken(true)
              .then(() => setProfile(data))
              .catch(() => setProfile(data))
          } else {
            setProfile(data)
          }
        }
      },
      (err) => {
        console.warn('AgentPage user profile listener error:', err.code)
        if (err.code === 'permission-denied') {
          auth.currentUser?.getIdToken(true).catch(() => {})
        }
      }
    )
    return () => { unsubProfile() }
  }, [])

  useEffect(() => {
    if (!profile?.role) return
    const uid = auth.currentUser?.uid
    if (!uid) return
    const isAide = profile.role === 'aide_agent'
    const onListenerError = (label: any) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }
    // aide_agent has access to clients (for the parcel form) but not other staff-only data
    const unsubClients     = subscribeClients(setClients, onListenerError('subscribeClients'))
    const unsubDrivers     = isAide ? null : subscribeDrivers(setDrivers, onListenerError('subscribeDrivers'))
    const unsubUsers       = isAide ? null : subscribeAllUsers(data => {
      setAgencyCashiers(data.filter(u => u.role === 'caissier'))
      setAllUsers(data)
    }, onListenerError('subscribeAllUsers'))
    const unsubCodRequests = isAide ? null : subscribeAgentCodRequests(uid, setAgentCodRequests, onListenerError('subscribeAgentCodRequests'))
    return () => {
      unsubClients()
      unsubDrivers?.()
      unsubUsers?.()
      unsubCodRequests?.()
    }
  }, [profile?.role, authTick])

  // Souscription colis — basée sur le rôle : chef_agence voit toute l'agence, agent voit ses propres colis
  useEffect(() => {
    if (!profile) return
    const uid = auth.currentUser?.uid
    if (!uid) return
    setLoadingParcels(true)
    const onError = (err: any) => {
      console.error('AgentPage subscribeParcels:', err)
      setLoadingParcels(false)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }
    if (profile.role === 'chef_agence' && profile.city) {
      // NOUVELLE POLITIQUE : Le chef voit TOUS les colis de l'agence directement
      // Plus besoin de pending validation
      const unsubAgency = subscribeAgencyParcels(profile.city, (data: any) => {
        setParcels(data)
        setLoadingParcels(false)
      }, onError)
      // Souscrire aussi aux retours pour cette agence
      const unsubReturns = subscribeAgencyReturnParcels(profile.city, (data: any) => {
        setReturnParcels(data)
      }, onError)
      setPendingAideParcels([]) // Plus de pending
      return () => { unsubAgency(); unsubReturns() }
    }
    setPendingAideParcels([])
    const unsub = subscribeAgentParcels(uid, (data: any) => { setParcels(data); setLoadingParcels(false) }, onError)
    return () => unsub()
  }, [profile?.role, profile?.city, authTick])

  useEffect(() => {
    if (profile?.role !== 'chef_agence' || !profile?.city) {
      setModRequests([])
      return
    }
    const unsub = subscribeAgencyModificationRequests(profile.city, setModRequests, err => console.error('subscribeAgencyModificationRequests:', err))
    return () => unsub()
  }, [profile?.role, profile?.city])

  useEffect(() => {
    if (profile?.role === 'chef_agence') {
      setSubTab('all')
      if (!chefDefaultTodayRef.current) {
        setDatePreset('today')
        setCodDatePreset('today')
        setArrivageDatePreset('today')
        chefDefaultTodayRef.current = true
      }
    }
  }, [profile?.role])

  useEffect(() => {
    if (profile?.city) setForm(p => ({ ...p, senderCity: profile.city }))
  }, [profile?.city])

  useEffect(() => {
    setHasMoreParcels(parcels.length >= 200)
    setExtraParcels([])
  }, [parcels])

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setParcelPage(0)
  }, [datePreset, dateFrom, dateTo, subTab, serviceFilter, parcelStatusFilter, parcelDirection, parcelEditorFilter, debouncedSearch])

  // Fetch accurate agency stats when chef opens the home tab
  useEffect(() => {
    if (tab !== 'home' || profile?.role !== 'chef_agence' || !profile?.city) return
    let cancelled = false
    getAccurateAgencyStats(profile.city)
      .then(stats => { if (!cancelled) setAccurateStats(stats) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tab, profile?.role, profile?.city])

  useEffect(() => {
    agentCodRequests.slice(0, 10).forEach(req => {
      if (!req.readByAgentAt) markAgentCodRequestRead(req.id).catch(() => {})
    })
  }, [agentCodRequests])

  useEffect(() => {
    if (!profile?.city) return
    if (!auth.currentUser?.uid) return
    const isAide = profile.role === 'aide_agent'
    const onListenerError = (label: any) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }
    const uid2 = auth.currentUser?.uid
    const unsubAdminTx = (!isAide && uid2) ? subscribeMyAdminTransfers(uid2, setMyAdminTransfers, onListenerError('subscribeMyAdminTransfers')) : null
    const unsubSectors = isAide ? null : subscribeSectors(profile.city, setSectors, onListenerError('subscribeSectors'))
    return () => { unsubAdminTx?.(); unsubSectors?.() }
  }, [profile?.city, profile?.role, authTick])

  // ⭐ TEMPS RÉEL : toujours subscribe aux arrivages pour afficher le badge de notification
  useEffect(() => {
    if (!profile?.city) return
    const isAide = profile.role === 'aide_agent'
    if (isAide) return
    const onErr = (label: any) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }
    const unsubArrivages = subscribeArrivages(profile.city, setArrivages, onErr('subscribeArrivages'))
    const unsubBonBatch = subscribeBonRamasageBatches(profile.city, setBonBatches, onErr('subscribeBonRamasageBatches'))
    const unsubNotes = profile.role === 'chef_agence' ? subscribeAgentNotesByCity(profile.city, setAgentNotes, onErr('subscribeAgentNotes')) : null
    const unsubUsers = profile.role === 'chef_agence' ? subscribeAllUsers(setUsers, onErr('subscribeAllUsers')) : null
    let unsubT1: any = null, unsubT2: any = null
    const mergeTransit = (() => {
      let normal: any[] = [], retour: any[] = []
      const merge = () => {
        const list = [...normal, ...retour]
          .sort((a, b) => (a.chauffeurName || '').localeCompare(b.chauffeurName || ''))
        setTransitParcels(list)
        setArrivedBoxes((prev: any) => {
          const next = {}
          list.forEach(p => {
            const total = p.nbColis || 1
            ;(next as any)[p.id] = prev[p.id] !== undefined ? Math.min(prev[p.id], total) : 0
          })
          return next
        })
      }
      return {
        setNormal: (v: any) => { normal = v; merge() },
        setRetour: (v: any) => { retour = v; merge() },
      }
    })()
    const q1 = query(collection(db, 'parcels'), where('destinationCity', '==', profile.city), where('status', '==', 'En transit'))
    const q2 = query(collection(db, 'parcels'), where('destinationCity', '==', profile.city), where('status', '==', 'Retour en transit'))
    unsubT1 = onSnapshot(q1, snap => mergeTransit.setNormal(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onErr('subscribeTransitNormal'))
    unsubT2 = onSnapshot(q2, snap => mergeTransit.setRetour(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onErr('subscribeTransitRetour'))
    return () => { unsubArrivages(); unsubBonBatch?.(); unsubT1?.(); unsubT2?.(); unsubNotes?.(); unsubUsers?.() }
  }, [profile?.city, profile?.role, authTick]) // ⭐ Enlevé 'tab' - toujours actif maintenant

  // Lazy: caisse, versements, rapports — uniquement a la premiere visite de l'onglet
  const _agentLazyStarted = useRef<any>({})
  useEffect(() => {
    if (!profile?.city || profile?.role === 'aide_agent') return
    const started = _agentLazyStarted.current
    const onErr = (label: any) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
    }
    if (tab === 'caisse' && !started.caisse) {
      started.caisse = [
        subscribeCaisseByCity(profile.city, (data: any) => setAgentEntries(data), onErr('subscribeCaisseByCity')),
        subscribeBankDepositsByCity(profile.city, setBankDeposits, onErr('subscribeBankDepositsByCity')),
        subscribeAgencyCash(profile.city, setAgencyCash, onErr('subscribeAgencyCash')),
        subscribeAgentCashRecoveryRequests(profile.city, setCashRecoveryRequests, onErr('subscribeAgentCashRecoveryRequests')),
        profile.role === 'chef_agence' ? subscribeDriverPortDuTransactionsByCity(profile.city, setDriverVersements, onErr('subscribeDriverVersements')) : null,
      ].filter(Boolean)
    }
    if ((tab === 'charge' || tab === 'cod') && !started.charge && profile?.role === 'chef_agence') {
      const retry = (err: any) => { if (err.code === 'permission-denied') auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {}) }
      started.charge = [
        subscribeRapports(profile.city, setPointeurRapports, err => { console.error('subscribeRapports:', err); retry(err) }),
        subscribeAllReglements(profile.city, setPointeurReglements, err => { console.error('subscribeAllReglements:', err); retry(err) }),
        subscribeSourceReglements(profile.city, setSourcePointeurReglements, err => { console.error('subscribeSourceReglements:', err); retry(err) }),
      ]
    }
  }, [tab, profile?.city, profile?.role, authTick])
  useEffect(() => {
    return () => { ;(Object.values(_agentLazyStarted.current).flat() as any[]).forEach(unsub => unsub?.()) }
  }, [])

  useEffect(() => {
    if (profile?.role === 'aide_agent') return
    if (!profile?.role) return
    const onListenerError = (label: any) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }
    const unsubSectors = subscribeAllSectors(setAllSectors, onListenerError('subscribeAllSectors'))
    const unsubVehicles = subscribeVehicles(setVehicles, onListenerError('subscribeVehicles'))
    return () => { unsubSectors(); unsubVehicles() }
  }, [profile?.role, authTick])

  // Global barcode scan detector: captures fast keyboard sequences (douchette) from anywhere
  useEffect(() => {
    const handleKey = (e: any) => {
      const tag = e.target?.tagName?.toLowerCase()
      // Only intercept if NOT already in an input field
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const now = Date.now()
      if (now - scanLastKeyRef.current > 400) scanBufferRef.current = ''
      scanLastKeyRef.current = now
      if (e.key === 'Enter') {
        const buf = scanBufferRef.current
        if (buf.length >= 4) {
          e.preventDefault()
          setScanOpen(true)
          setScanResult(null)
          setTimeout(() => {
            const _needsAzertyFix = _s.current.needsAzertyFix || ((s: any) => false)
            const _azertyFix = _s.current.azertyFix || ((s: any) => s)
            const _findScannedParcel = _s.current.findScannedParcel || ((_q: any) => null)
            const _arrPointByCode = _s.current.arrPointByCode || ((_c: any) => {})
            const fixed = _needsAzertyFix(buf) ? _azertyFix(buf) : buf
            if (tab === 'arrivage' && arrivageTab === 'nouveau') {
              setScanOpen(false)
              _arrPointByCode(fixed)
              return
            }
            setScanQuery(fixed)
            const found = _findScannedParcel(fixed)
            setScanResult(found || 'not_found')
          }, 50)
        }
        scanBufferRef.current = ''
      } else if (e.key.length === 1) {
        scanBufferRef.current += e.key
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [parcels, tab, arrivageTab, transitParcels])


  const [codSending,    setCodSending]    = useState<any>(null)
  const [codConfirming, setCodConfirming] = useState<any>(null)
  const [receiveModal,  setReceiveModal]  = useState<any>(null)
  const [codReceptioning, setCodReceptioning] = useState<any>(null)
  const [receptionCodError, setReceptionCodError] = useState('')
  const [portDuReceiving, setPortDuReceiving] = useState<any>({})
  const [portDuReceiveError, setPortDuReceiveError] = useState('')
  const [driverVersements, setDriverVersements] = useState<any[]>([])
  const [versementConfirming, setVersementConfirming] = useState<any>({})
  const [codFromDriverReceiving, setCodFromDriverReceiving] = useState<any>({})
  const uid = auth.currentUser?.uid

  // ── stateRef: always-fresh snapshot of all state for handlers ─────────────
  Object.assign(_s.current, {
    // core
    profile, navigate, tab, setTab, uid: auth.currentUser?.uid,
    scanInputRef,
    // parcels
    parcels, setParcels, pendingAideParcels, setPendingAideParcels,
    extraParcels, setExtraParcels, hasMoreParcels, setHasMoreParcels,
    loadingParcels, setLoadingParcels, loadingMore, setLoadingMore,
    // parcel form
    form, setForm, loading, setLoading, error, setError,
    createdParcel, setCreatedParcel, price: parseFloat((form as any).portPrice) || 0,
    clients, setClients,
    inlineNewClient, setInlineNewClient,
    showClientDropdown, setShowClientDropdown,
    showSenderDropdown, setShowSenderDropdown,
    // edit / delete
    editingParcel, setEditingParcel, editForm, setEditForm,
    editLoading, setEditLoading, editError, setEditError,
    deleteConfirm, setDeleteConfirm,
    codeModal, setCodeModal,
    // transport / delivery
    transportModal, setTransportModal,
    bulkLoadSelectedIds, setBulkLoadSelectedIds,
    bulkLoadName, setBulkLoadName,
    bulkLoadPhone, setBulkLoadPhone,
    bulkLoadBusy, setBulkLoadBusy,
    bulkLoadError, setBulkLoadError,
    deliveryModal, setDeliveryModal,
    drivers, allSectors, allUsers, sectors, vehicles, bonBatches,
    // return
    returnParcelModal, setReturnParcelModal,
    returnReasonModal, setReturnReasonModal,
    returningParcelId, setReturningParcelId,
    // caisse
    agentEntries, setAgentEntries,
    agencyCashiers, setAgencyCashiers,
    agencyCash, setAgencyCash,
    directTransfer, setDirectTransfer,
    recoveryRequest, setRecoveryRequest,
    adminTransferForm, setAdminTransferForm,
    myAdminTransfers, setMyAdminTransfers,
    cashRecoveryRequests, setCashRecoveryRequests,
    agentOpsDelete, setAgentOpsDelete,
    cashierHistoryDelete, setCashierHistoryDelete,
    caisseDatePreset, caisseDateFrom, caisseDateTo,
    // COD
    codCollectModal, setCodCollectModal,
    portCollectModal, setPortCollectModal,
    codSettling, setCodSettling,
    allCodParcels, setAllCodParcels,
    codLoadingAll, setCodLoadingAll,
    batchSettling, setBatchSettling,
    agentCodRequests, setAgentCodRequests,
    codRequestDrafts, setCodRequestDrafts,
    codRequestBusy, setCodRequestBusy,
    bankDepositModal, setBankDepositModal,
    centralDepositState, setCentralDepositState,
    centralDepositSelectedIds, setCentralDepositSelectedIds,
    codSending, setCodSending,
    codConfirming, setCodConfirming,
    receiveModal, setReceiveModal,
    codReceptioning, setCodReceptioning,
    receptionCodError, setReceptionCodError,
    portDuReceiving, setPortDuReceiving,
    portDuReceiveError, setPortDuReceiveError,
    driverVersements, setDriverVersements,
    versementConfirming, setVersementConfirming,
    codFromDriverReceiving, setCodFromDriverReceiving,
    sourcePointeurReglements,
    collectedCodIds,
    // scan
    scanOpen, setScanOpen,
    scanQuery, setScanQuery,
    scanResult, setScanResult,
    // clients
    modRequests, setModRequests,
    agentNotes, setAgentNotes,
    agentNewClient, setAgentNewClient,
    agentClientSaving, setAgentClientSaving,
    // aide agents
    createAideModal, setCreateAideModal,
    aideForm, setAideForm,
    aideLoading, setAideLoading,
    aideError, setAideError,
    createPointeurModal, setCreatePointeurModal,
    pointeurForm, setPointeurForm,
    pointeurLoading, setPointeurLoading,
    pointeurError, setPointeurError,
    rapportValidating, setRapportValidating,
    rapportError, setRapportError,
    rapportNotesMap, setRapportNotesMap,
    validatingEntryId, setValidatingEntryId,
    selectedAideEntryIds, setSelectedAideEntryIds,
    bulkAideValidating, setBulkAideValidating,
    bulkAideValidationError, setBulkAideValidationError,
    togglingAideAccessId, setTogglingAideAccessId,
    // drivers
    driverModal, setDriverModal,
    chefPointing, setChefPointing,
    // arrivage
    transitParcels, arrivages,
    arrivageTab, setArrivageTab,
    arrivageScan, setArrivageScan,
    arrivageSearch, setArrivageSearch,
    arrivageDatePreset, arrivageDateFrom, arrivageDateTo,
    arrivageTypeFilter, arrivageServiceFilter, arrivageDriverFilter,
    arrivageOriginFilter, arrivageStatusFilter, arrivageAgentFilter,
    arrivageNotes, setArrivageNotes,
    arrivedBoxes, setArrivedBoxes,
    expandedGroups, setExpandedGroups,
    arrivageConfirming, setArrivageConfirming,
    arrivageError, setArrivageError,
    arrivageSuccess, setArrivageSuccess,
    colisWithoutBon, setColisWithoutBon,
    arrScanFlash, setArrScanFlash,
    // historique pointage
    histPointEdits, setHistPointEdits,
    histSaving, setHistSaving,
    histPointErr, setHistPointErr,
    histSearchQ, setHistSearchQ,
    histSearchRes, setHistSearchRes,
    histSearchErr, setHistSearchErr,
    histSearching, setHistSearching,
    // computed arrivage (populated below after handler computations)
    arrArrivedParcels: [] as any[],
    arrMissingParcels: [] as any[],
    arrMissingColisDetail: [] as any[],
    arrComputedType: 'complet',
    arrTotalArrived: 0,
    arrTotalExpected: 0,
    arrTotalMissing: 0,
    arrArrived: (p: any) => (arrivedBoxes as any)[p.id] ?? 0,
    arrNbColis: (p: any) => p.nbColis || 1,
    // helper functions set below
    canEditParcelDetails: null as any,
    isChefAgencyAideParcel: null as any,
    aideAgents: [] as any[],
  })
  const handlers = useAgentHandlers(_s)
  const {
    handleAssignTransport, handleBulkLoadTransport, handleAssignDelivery, handleChefPointParcel,
    handleAgentCollectCod, handleAgentCollectPort,
    handleDirectCashierTransfer, handleRequestCashRecovery, handleAdminTransfer,
    handleDeleteAgentOperations, handleDeleteCashierHistory,
    patchAllCod, handleRemitCod, handleSettleCod, handleLoadAllCod, handleReplyCodRequest,
    handleSettleCodFromRequest, handleBatchSettle, findSourceReglementForParcel, openReceiveModal,
    getCentralDepositEligibleCods, handleCentralCodDeposit, handleReceptionCod,
    handleReceiveCodFromDriver, handleConfirmDriverVersement, handleReceivePortDuEspeces,
    handleMarkSentToSource, handleBankDeposit, handleConfirmReceived,
    handleCreateInlineClient, handleAgentCreateClient,
    handlePrint, handlePrintCharge, handlePrintTable, handlePrintBonRamassage, handlePrintTicket,
    handleCreateDriver, handleEditDriver,
    azertyFix, needsAzertyFix, normalizeScanText: _normScanText, normalizeScanLoose: _normScanLoose,
    findScannedParcel, doScan, openScanModal,
    handleSubmit, openEditModal, handleEditClick, handleDeleteClick, confirmDelete,
    handleCodeVerify, handleEditSave, handleCreateReturnParcel, handleReturnDirect, submitReturnWithReason,
    handleValidateParcelEntry, handleBulkValidateAideEntries,
    handleResolveModification, handleDeleteMod, handleToggleAideParcelAccess,
    handleCreateAideAgent, handleCreatePointeur, handleValiderRapport, handleRejeterRapport,
    handleToggleBlockAide, handleDeleteAideAgent,
    handleConfirmArrivage, histGetEdit, histInitEdit, histPatch,
    histTogglePointed, histSetBoxes, histRemoveFromArrived, histRecoverMissing,
    histSearchParcel, histAddSearchResult, histSavePointage,
  } = handlers


  const RETURN_REASONS = [
    'Client absent',
    'Client refuse la livraison',
    'Adresse introuvable',
    'Téléphone injoignable',
    'Colis endommagé',
    'Autre raison',
  ]

  // ── Patch _s with mid-handler state (declared after useAgentHandlers call) ─
  Object.assign(_s.current, {
    codSending, setCodSending,
    codConfirming, setCodConfirming,
    receiveModal, setReceiveModal,
    codReceptioning, setCodReceptioning,
    receptionCodError, setReceptionCodError,
    portDuReceiving, setPortDuReceiving,
    portDuReceiveError, setPortDuReceiveError,
    driverVersements, setDriverVersements,
    versementConfirming, setVersementConfirming,
    codFromDriverReceiving, setCodFromDriverReceiving,
  })

  const selectExistingClient = (client: any) => {
    if (!client?.id) return
    setForm(p => ({
      ...p,
      shipmentMode:  'client',
      clientId:      client.id,
      clientName:    client.name || '',
      senderName:    client.name || p.senderName,
      senderTel:     client.tel     || p.senderTel,
      senderAddress: client.address || p.senderAddress,
      senderCity:    client.city    || p.senderCity,
      senderNic:     client.nic     || p.senderNic,
    }))
    setClientSearch('')
    setShowClientDropdown(false)
    setShowSenderDropdown(false)
  }

  const filteredClientSearch = (() => {
    const cityClients = clients.filter(c => !profile?.city || c.city === profile.city)
    if (!clientSearch.trim()) return cityClients
    const s = clientSearch.toLowerCase()
    return cityClients.filter(c =>
      c.name?.toLowerCase().includes(s) || c.tel?.includes(s) || c.nic?.toLowerCase().includes(s)
    )
  })()
  const ef = (field: any) => (e: any) => setEditForm((p: any) => ({ ...p, [field]: e.target.value }))

  const allDisplayParcels = useMemo(() => {
    const map = new Map()
    // Vérifications de sécurité pour éviter erreurs si undefined
    ;(parcels || []).forEach(p => map.set(p.id, p))
    ;(returnParcels || []).forEach(p => map.set(p.id, p))
    ;(extraParcels || []).forEach(p => map.set(p.id, p))
    return [...map.values()].sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0)
      const tb = b.createdAt?.toDate?.() || new Date(0)
      return tb - ta
    })
  }, [parcels, returnParcels, extraParcels])

  const profileCity = profile?.city
  const profileRole = profile?.role

  const filteredParcels = useMemo(() => {
    return filterByDate(allDisplayParcels, datePreset, dateFrom, dateTo).filter((p: any) => {
    if (profileCity) {
      // Pour les retours, vérifier destinationCity directement (après swap, c'est la ville de retour)
      const isReturnToThisCity = (p.status?.includes('Retour') || p.wasReturned) && p.destinationCity === profileCity
      const destinationVisible = (p.destinationCity === profileCity || p.receiver?.city === profileCity)
        && isParcelVisibleInDestinationAgency(p)
      const cityMatch = p.sender?.city === profileCity || p.originCity === profileCity || destinationVisible || isReturnToThisCity
      if (!cityMatch) return false
    }
    if (subTab === 'mine' && p.agentId !== uid && p.destinationAgentId !== uid) {
      return false
    }
    if (profileRole === 'chef_agence' && parcelEditorFilter !== 'all') {
      const isAideEntry = p.agentRole === 'aide_agent'
      const isChefEntry = p.agentRole === 'chef_agence' || p.agentId === uid
      if (parcelEditorFilter === 'chef' && !isChefEntry) return false
      if (parcelEditorFilter === 'aide' && !isAideEntry) return false
    }
    if (serviceFilter !== 'all' && p.serviceType !== serviceFilter) {
      return false
    }
    if (parcelStatusFilter !== 'all' && p.status !== parcelStatusFilter) {
      return false
    }
    if (parcelDirection === 'sent' && profileCity && p.sender?.city !== profileCity) {
      return false
    }
    if (parcelDirection === 'received' && profileCity) {
      const destinationVisible = (p.destinationCity === profileCity || p.receiver?.city === profileCity)
        && isParcelVisibleInDestinationAgency(p)
      if (!destinationVisible) return false
    }
    // ⭐ Filtre par ville de destination
    if (destinationCityFilter !== 'all') {
      const parcelDestCity = p.destinationCity || p.receiver?.city
      if (parcelDestCity !== destinationCityFilter) return false
    }
    // ⭐ Filtre par livreur/chauffeur
    if (driverFilter !== 'all') {
      const matchesDriver = p.deliveryDriverId === driverFilter || p.chauffeurId === driverFilter
      if (!matchesDriver) return false
    }
    if (debouncedSearch) {
      const matches = matchesSearch([
        p.id, p.trackingId, p.senderNic, p.sender?.nic, p.sender?.name, p.sender?.tel,
        p.sender?.city, p.receiver?.name, p.receiver?.tel, p.receiver?.city,
        p.originCity, p.destinationCity,
      ], debouncedSearch.toLowerCase())
      return matches
    }
      return true
    })
  }, [allDisplayParcels, datePreset, dateFrom, dateTo, profileCity, profileRole, subTab, uid, serviceFilter,
       parcelStatusFilter, parcelDirection, parcelEditorFilter, destinationCityFilter, driverFilter, debouncedSearch])

  // ── Phase 3: memoized stats — only recompute when Firestore sends new data ──

  // Note: homeChefStats and homeAgentStats are now calculated in HomeTab.tsx
  // to properly respect the date filter selection

  const dashCityParcels = useMemo(() => {
    const c = profile?.city
    if (!c) return parcels
    return parcels.filter(p =>
      p.sender?.city === c || p.originCity === c ||
      p.destinationCity === c || p.receiver?.city === c
    )
  }, [parcels, profile?.city])

  const dashKPIs = useMemo(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const thisMonth = todayStr.slice(0, 7)
    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999)
    let todayCount = 0, deliveredCount = 0, codPending = 0
    const statusCounts = {}
    dashCityParcels.forEach(p => {
      const pd = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      if (pd >= todayStart && pd <= todayEnd) todayCount++
      if (p.status === 'delivered') deliveredCount++
      if (p.codAmount > 0 && (!p.codStatus || p.codStatus === 'pending')) codPending++
      ;(statusCounts as any)[p.status || 'pending'] = ((statusCounts as any)[p.status || 'pending'] || 0) + 1
    })
    const totalCount = dashCityParcels.length
    const tauxLivraison = totalCount > 0 ? Math.round(deliveredCount / totalCount * 100) : 0
    return { todayCount, deliveredCount, codPending, totalCount, tauxLivraison, statusCounts, thisMonth }
  }, [dashCityParcels])

  const dashLast7 = useMemo(() => {
    const today = new Date()
    const dayMap = {}
    dashCityParcels.forEach(p => {
      const pd = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`
      ;(dayMap as any)[key] = ((dayMap as any)[key] || 0) + 1
    })
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }), count: (dayMap as any)[key] || 0 }
    })
  }, [dashCityParcels])

  const dashLast30 = useMemo(() => {
    const today = new Date()
    const dayMap = {}
    dashCityParcels.forEach(p => {
      const pd = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`
      ;(dayMap as any)[key] = ((dayMap as any)[key] || 0) + 1
    })
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (29 - i))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const label = d.getDate() === 1 || i === 0 || i === 29
        ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
      return { label, count: (dayMap as any)[key] || 0 }
    })
  }, [dashCityParcels])

  const dashPieData = useMemo(() => {
    const SC = { pending: '#94a3b8', in_transit: '#3b82f6', at_agency: '#8b5cf6', out_for_delivery: '#f59e0b', delivered: '#22c55e', returned: '#ef4444', cancelled: '#6b7280' }
    const SL = { pending: 'En attente', in_transit: 'Transit', at_agency: 'En agence', out_for_delivery: 'En cours', delivered: 'Livré', returned: 'Retourné', cancelled: 'Annulé' }
    return Object.entries(dashKPIs.statusCounts)
      .filter(([, v]) => (v as number) > 0)
      .map(([k, v]) => ({ name: (SL as any)[k] || k, value: v as number, color: (SC as any)[k] || '#94a3b8' }))
  }, [dashKPIs.statusCounts])

  const dashCaisseKPIs = useMemo(() => {
    let totalIn = 0, totalOut = 0
    agentEntries.forEach(e => {
      if (e.type === 'in') totalIn += e.amount || 0
      else if (e.type === 'out') totalOut += e.amount || 0
    })
    return { totalIn, totalOut }
  }, [agentEntries])

  const whatsappMsg  = createdParcel
    ? encodeURIComponent(
        `🚚 *BG Express* — Votre colis a été enregistré !\n\n` +
        `📦 Nature : *${createdParcel.natureOfGoods || '—'}*  •  Nb : *${createdParcel.nbColis || 1}*\n` +
        `📍 De : *${createdParcel.sender.city}* → *${createdParcel.receiver.city}*\n` +
        `👤 Destinataire : ${createdParcel.receiver.name}\n` +
        (createdParcel.codAmount > 0 ? `💰 RETOUR FOND : *${createdParcel.codAmount} DH* (à payer à la livraison)\n` : '') +
        `\n🔎 Numéro de suivi : *${createdParcel.trackingId}*\n` +
        `\n🔗 Suivez votre colis en live :\nhttps://arelanc.web.app/track?id=${createdParcel.trackingId}`
      )
    : ''
  const whatsappLink = createdParcel
    ? `https://wa.me/${createdParcel.sender.tel.replace(/\D/g, '')}?text=${whatsappMsg}`
    : ''

  const inputCls  = "w-full border border-gray-200 rounded-xl p-3 text-sm focus:border-blue-500 focus:outline-none transition bg-gray-50 focus:bg-white"
  const selectCls = inputCls + " appearance-none cursor-pointer"


  // ── Permission helpers ─────────────────────────────────────────────────────
  const sameCity = (a: any, b: any) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  const isParcelCreator = (parcel: any) => !!uid && parcel?.agentId === uid
  const isChefAgencyAideParcel = (parcel: any) =>
    profile?.role === 'chef_agence' &&
    (parcel?.agentRole === 'aide_agent' || parcel?.agentRole === 'client_portal') &&
    (parcel?.originCity === profile?.city || parcel?.sender?.city === profile?.city ||
      allUsers.find((u: any) => u.id === parcel?.agentId)?.city === profile?.city)
  const canActAsParcelOwner = (parcel: any) => isParcelCreator(parcel) || isChefAgencyAideParcel(parcel)
  const canEditParcelDetails = (parcel: any) => {
    if (profile?.role === 'admin') return true
    if (!canActAsParcelOwner(parcel)) return false

    // NOUVELLE POLITIQUE : Aide-agent ne peut éditer que si colis PAS chargé
    if (profile?.role === 'aide_agent' && isAideParcelLockedForEdit(parcel)) {
      return false // Verrouillé pour aide-agent
    }

    // Chef peut toujours éditer (sauf si livré/retourné)
    return !['Livré', 'Retourné', 'Retour en transit'].includes(parcel?.status)
  }
  const canManageStatus = (parcel: any) =>
    profile?.role === 'admin' || profile?.role === 'chef_agence' || isParcelCreator(parcel)
  const canManageReturnDelivery = (_parcel: any) =>
    profile?.role === 'chef_agence' || profile?.role === 'admin'
  const isReturnOriginCity = (parcel: any) =>
    parcel?.returnToCity === profile?.city || parcel?.sender?.city === profile?.city
  const canManageDeliveryAssignment = (_parcel: any) =>
    profile?.role === 'chef_agence' || profile?.role === 'admin' || profile?.role === 'directeur'
  const isPointedForDelivery = (parcel: any) =>
    parcel?.status === 'Arrivé en agence' &&
    (parcel?.chefPointedAt || parcel?.destinationArrivedAt)
  const canLoadTransportParcel = (parcel: any) =>
    (profile?.role === 'agent' || profile?.role === 'chef_agence' || profile?.role === 'admin') &&
    parcel?.status === 'Initialisé'
  // NOUVELLE POLITIQUE : Plus de validation requise
  // Un colis d'aide-agent est "verrouillé" seulement si chargé (transportAssignedAt existe)
  const isAideParcelLockedForEdit = (p: any) => {
    return !!p.transportAssignedAt // Verrouillé si chargé sur camion
  }

  const isPendingAideParcelForAgency = (p: any) =>
    false // Plus de pending - deprecated mais gardé pour compatibilité

  // ── User filtered lists ────────────────────────────────────────────────────
  const aideAgents = allUsers.filter((u: any) =>
    u.role === 'aide_agent' && (!profile?.city || u.city === profile.city))
  const pointeurUsers = allUsers.filter((u: any) =>
    u.role === 'pointeur_encaisseur' && (!profile?.city || u.city === profile.city))
  const agencyPendingAideParcels = pendingAideParcels.filter((p: any) =>
    p.originCity === profile?.city || p.sender?.city === profile?.city ||
    aideAgents.some((a: any) => a.id === p.agentId))
  const aideParcelsFor = (aideId: string) => pendingAideParcels.filter((p: any) => p.agentId === aideId)

  // ── Form helpers ───────────────────────────────────────────────────────────
  const f = (field: string) => (e: any) => setForm((p: any) => ({ ...p, [field]: e.target.value }))
  const price = calculateTariff(
    (form as any).receiverCity,
    parseFloat((form as any).weight) || 0,
    parseInt((form as any).nbColis) || 1
  )
  const destinationSectors = allSectors.filter((s: any) => s.city === (form as any).receiverCity)
  const destinationDrivers = drivers.filter((d: any) => d.city === (form as any).receiverCity || !d.city)

  // ── Arrivage computed values ───────────────────────────────────────────────
  const ARR_TYPE_CONFIG: Record<string, any> = {
    complet: { label: 'Complet',  color: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
    partiel: { label: 'Partiel',  color: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500' },
    sans_transit: { label: 'Sans transit', color: 'bg-gray-50 text-gray-600', dot: 'bg-gray-400' },
  }
  const arrNbColis = (p: any) => p?.nbColis || 1
  const arrArrived = (p: any) => (arrivedBoxes as any)[p?.id] ?? 0
  const arrNexp = (p: any) => p?.senderNic || p?.nexp || p?.nExp || p?.sender?.nic || ''
  const arrIsArrived = (p: any) => arrArrived(p) >= arrNbColis(p)
  const arrIsPartial = (p: any) => arrArrived(p) > 0 && arrArrived(p) < arrNbColis(p)
  const arrIsFull    = (p: any) => arrArrived(p) >= arrNbColis(p)
  const arrFilteredTransitParcels = transitParcels.filter((p: any) => {
    if (arrivageTypeFilter !== 'all' && p.chauffeurType !== arrivageTypeFilter) return false
    if (arrivageServiceFilter !== 'all' && p.serviceType !== arrivageServiceFilter) return false
    if (arrivageDriverFilter !== 'all' && (p.chauffeurName || '__none__').toLowerCase().trim() !== arrivageDriverFilter) return false
    if (arrivageOriginFilter !== 'all' && p.originCity !== arrivageOriginFilter) return false
    if (arrivageSearch.trim()) {
      const q = arrivageSearch.trim().toLowerCase()
      if (!(p.trackingId || '').toLowerCase().includes(q) &&
          !(p.sender?.name || '').toLowerCase().includes(q) &&
          !(arrNexp(p) || '').toLowerCase().includes(q)) return false
    }
    return true
  })
  const arrTotalExpected = arrFilteredTransitParcels.reduce((s: number, p: any) => s + arrNbColis(p), 0)
  const arrTotalArrived  = arrFilteredTransitParcels.reduce((s: number, p: any) => s + arrArrived(p), 0)
  const arrTotalMissing  = Math.max(0, arrTotalExpected - arrTotalArrived)
  const arrComputedType  = arrTotalExpected === 0 ? 'sans_transit' : arrTotalMissing === 0 ? 'complet' : 'partiel'
  const arrArrivedParcels  = arrFilteredTransitParcels.filter((p: any) => arrArrived(p) > 0)
  const arrMissingParcels  = arrFilteredTransitParcels.filter((p: any) => arrArrived(p) < arrNbColis(p))
  const arrMissingColisDetail = arrMissingParcels.map((p: any) => ({
    parcelId: p.id, trackingId: p.trackingId || '',
    senderNic: arrNexp(p), nexp: arrNexp(p),
    senderName: p.sender?.name || '', receiverName: p.receiver?.name || '',
    weight: p.weight || 0, nbColis: p.nbColis || 1,
    serviceType: p.serviceType || '', originCity: p.originCity || '',
    chauffeurName: p.chauffeurName || '', codAmount: p.codAmount || 0,
    arrived: arrArrived(p), total: arrNbColis(p),
    pointed: arrArrived(p) > 0,
    missing: arrNbColis(p) - arrArrived(p),
  }))
  const arrGroups = (() => {
    const map = new Map<string, any>()
    arrFilteredTransitParcels.forEach((p: any) => {
      const key = (p.chauffeurName || '__none__').toLowerCase().trim() || '__none__'
      if (!map.has(key)) map.set(key, { key, name: p.chauffeurName || 'Sans chauffeur', parcels: [], matricule: p.chauffeurMatricule || '' })
      map.get(key).parcels.push(p)
    })
    return [...map.values()]
  })()
  const arrToggle = (id: string) => {
    setArrivedBoxes((prev: any) => {
      const p = transitParcels.find((p: any) => p.id === id) || arrFilteredTransitParcels.find((p: any) => p.id === id)
      const total = p?.nbColis || 1
      const cur = prev[id] ?? 0
      return { ...prev, [id]: cur >= total ? 0 : total }
    })
  }
  const arrToggleGroup = (key: string) => {
    setExpandedGroups((prev: any) => ({ ...prev, [key]: !prev[key] }))
  }
  const arrToggleExpand = (key: string) => setExpandedGroups((prev: any) => ({ ...prev, [key]: !prev[key] }))
  const arrToggleAll = () => {
    const allOn = arrFilteredTransitParcels.every((p: any) => arrArrived(p) >= arrNbColis(p))
    setArrivedBoxes((prev: any) => {
      const next = { ...prev }
      arrFilteredTransitParcels.forEach((p: any) => { next[p.id] = allOn ? 0 : p.nbColis || 1 })
      return next
    })
  }
  const arrSetBoxes = (id: string, val: number) => {
    const p = transitParcels.find((p: any) => p.id === id)
    const total = p?.nbColis || 1
    setArrivedBoxes((prev: any) => ({ ...prev, [id]: Math.max(0, Math.min(total, val)) }))
  }
  const arrUniqueDrivers = [...new Set(transitParcels.map((p: any) => (p.chauffeurName || '__none__').toLowerCase().trim()).filter(Boolean))]
  const arrUniqueOrigins = [...new Set(transitParcels.map((p: any) => p.originCity).filter(Boolean))]
  const filteredArrivages = arrivages.filter((a: any) => {
    // Calcul du type réel basé sur le pointage
    let actualType = a.type
    if (a.totalArrivedBoxes !== undefined && a.totalExpectedBoxes !== undefined) {
      if (a.totalArrivedBoxes === 0) {
        actualType = 'documents_seulement'
      } else if (a.totalArrivedBoxes < a.totalExpectedBoxes) {
        actualType = 'partiel'
      } else {
        actualType = 'complet'
      }
    }
    if (arrivageTypeFilter !== 'all' && actualType !== arrivageTypeFilter) return false
    if (arrivageStatusFilter !== 'all' && a.pointageStatus !== arrivageStatusFilter) return false
    if (arrivageAgentFilter !== 'all' && a.agentId !== arrivageAgentFilter) return false
    if (arrivageDateFrom && a.confirmedAt) {
      const d = a.confirmedAt?.toDate ? a.confirmedAt.toDate() : new Date(a.confirmedAt)
      if (d < new Date(arrivageDateFrom)) return false
    }
    if (arrivageDateTo && a.confirmedAt) {
      const d = a.confirmedAt?.toDate ? a.confirmedAt.toDate() : new Date(a.confirmedAt)
      if (d > new Date(arrivageDateTo + 'T23:59:59')) return false
    }
    return true
  })
  const arrHistUniqueAgents = [...new Map(arrivages.map((a: any) => [a.agentId, { id: a.agentId, name: a.agentName }])).values()]
  const arrHistTotalBons = (arr: any) => (arr.arrivedColisDetail || []).reduce((s: number, d: any) => s + (d.arrived || 0), 0)
  const arrHistTotalManquants = (arr: any) => (arr.missingColisDetail || []).length
  const arrHistTotalSansBon = (arr: any) => (arr.colisWithoutBon || []).length


  const arrPointByCode = (code: string) => {
    if (!code) return
    const norm = String(code).trim().toUpperCase()
    const found = transitParcels.find((p: any) =>
      (p.trackingId || '').toUpperCase() === norm ||
      (p.senderNic || p.sender?.nic || '').toUpperCase() === norm
    )
    if (!found) { setArrScanFlash('not_found'); setTimeout(() => setArrScanFlash(null), 1200); return }
    setArrivedBoxes((prev: any) => {
      const total = found.nbColis || 1
      const cur = prev[found.id] ?? 0
      return { ...prev, [found.id]: Math.min(total, cur + 1) }
    })
    setArrScanFlash(found.id)
    setTimeout(() => setArrScanFlash(null), 1000)
  }
  // ── Update stateRef with newly computed values ─────────────────────────────
  Object.assign(_s.current, {
    uid, aideAgents, pointeurUsers, sameCity,
    isParcelCreator, isChefAgencyAideParcel, canActAsParcelOwner, canEditParcelDetails,
    canManageStatus, canManageReturnDelivery, isReturnOriginCity, canManageDeliveryAssignment,
    isPointedForDelivery, canLoadTransportParcel, isPendingAideParcelForAgency,
    isAideParcelLockedForEdit, // NOUVEAU : indique si colis verrouillé pour aide
    agencyPendingAideParcels, aideParcelsFor, RETURN_REASONS, f,
    arrNbColis, arrArrived, arrNexp, arrIsArrived, arrIsPartial, arrIsFull,
    arrArrivedParcels, arrMissingParcels, arrMissingColisDetail,
    arrTotalArrived, arrTotalExpected, arrTotalMissing, arrComputedType,
    arrGroups, arrFilteredTransitParcels,
    arrToggle, arrToggleGroup, arrToggleExpand, arrToggleAll, arrSetBoxes, arrPointByCode,
    arrUniqueDrivers, arrUniqueOrigins, filteredArrivages,
    arrHistUniqueAgents, arrHistTotalBons, arrHistTotalManquants, arrHistTotalSansBon,
    needsAzertyFix, azertyFix, findScannedParcel, openScanModal, doScan,
  })

  // Scan global automatique via douchette
  const handleGlobalBarcodeScan = useCallback(async (barcode: string) => {
    // Vérification sécurité
    if (!barcode || typeof barcode !== 'string') {
      console.warn('⚠️ Scan invalide:', barcode)
      return
    }

    console.log('📦 Scan détecté:', barcode, 'length:', barcode.length)

    // Normaliser le code scanné
    const normalized = barcode.toUpperCase().trim()

    // Rechercher dans les colis chargés - avec plusieurs stratégies
    let found = (allDisplayParcels || []).find((p: any) => {
      const tid = p.trackingId?.toUpperCase() || ''
      // 1. Match exact
      if (tid === normalized) return true
      // 2. Contient le code scanné
      if (tid.includes(normalized)) return true
      // 3. Le code scanné contient le tracking (cas rare)
      if (normalized.includes(tid)) return true
      // 4. Match partiel fin (cas douchette qui rate le début)
      if (tid.endsWith(normalized) || normalized.endsWith(tid.slice(-8))) return true
      return false
    })

    if (found) {
      console.log('✅ Trouvé localement:', found.trackingId)
      setGlobalScanModal(found)
      return
    }

    // Si pas trouvé localement, rechercher dans la base
    console.log('🔍 Recherche dans la base...')
    try {
      const result = await searchParcelByTrackingId(barcode)
      if (result) {
        console.log('✅ Trouvé dans la base:', result.trackingId)
        setGlobalScanModal(result)
      } else {
        console.error('❌ Introuvable:', barcode)
        alert(`❌ Aucune expédition trouvée\n\nCode scanné : ${barcode}\n\nVérifiez que le code-barres est lisible.`)
      }
    } catch (err: any) {
      console.error('Erreur recherche:', err)
      alert(`❌ Erreur : ${err.message}`)
    }
  }, [allDisplayParcels])

  // Hook scan automatique douchette
  useBarcodeScanner({
    onScan: handleGlobalBarcodeScan,
    minLength: 5,
    enabled: true
  })

  // ESC pour fermer le modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && globalScanModal) {
        setGlobalScanModal(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [globalScanModal])

  const ctxValue = {
    // ── Core
    profile, navigate,
    tab, setTab,
    subTab, setSubTab,
    uid,
    inputCls, selectCls,

    // ── Refs
    ticketRef, scanInputRef,

    // ── Modal/UI state
    menuOpen, setMenuOpen,
    viewSignature, setViewSignature,
    returnParcelModal, setReturnParcelModal,
    returnReasonModal, setReturnReasonModal,
    returningParcelId, setReturningParcelId,
    loadingTruckId, setLoadingTruckId,
    validatingReturnId, setValidatingReturnId,

    // ── New parcel form
    form, setForm,
    f,
    loading, setLoading,
    error, setError,
    createdParcel, setCreatedParcel,
    showClientDropdown, setShowClientDropdown,
    showSenderDropdown, setShowSenderDropdown,
    inlineNewClient, setInlineNewClient,
    clients, setClients,
    clientSearch, setClientSearch,
    whatsappMsg, whatsappLink,
    handleSubmit,
    selectExistingClient,
    filteredClientSearch,
    price,
    destinationSectors,
    destinationDrivers,

    // ── Parcels tab
    parcels, setParcels,
    extraParcels, setExtraParcels,
    hasMoreParcels, setHasMoreParcels,
    loadingParcels, setLoadingParcels,
    loadingMore, setLoadingMore,
    pendingAideParcels, setPendingAideParcels,
    search, setSearch,
    datePreset, setDatePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    parcelDirection, setParcelDirection,
    serviceFilter, setServiceFilter,
    parcelStatusFilter, setParcelStatusFilter,
    parcelEditorFilter, setParcelEditorFilter,
    destinationCityFilter, setDestinationCityFilter,  // ⭐ Filtre ville de destination
    driverFilter, setDriverFilter,  // ⭐ Filtre par livreur/chauffeur
    parcelPage, setParcelPage,
    scanOpen, setScanOpen,
    scanQuery, setScanQuery,
    scanResult, setScanResult,
    accurateStats, setAccurateStats,
    codeModal, setCodeModal,
    deleteConfirm, setDeleteConfirm,
    transportModal, setTransportModal,
    bulkLoadSelectedIds, setBulkLoadSelectedIds,
    bulkLoadName, setBulkLoadName,
    bulkLoadPhone, setBulkLoadPhone,
    bulkLoadBusy, setBulkLoadBusy,
    bulkLoadError, setBulkLoadError,
    deliveryModal, setDeliveryModal,
    editingParcel, setEditingParcel,
    editForm, setEditForm,
    editLoading, setEditLoading,
    editError, setEditError,
    ef,
    validatingEntryId, setValidatingEntryId,
    selectedAideEntryIds, setSelectedAideEntryIds,
    bulkAideValidating, setBulkAideValidating,
    bulkAideValidationError, setBulkAideValidationError,
    togglingAideAccessId, setTogglingAideAccessId,
    showFilters, setShowFilters,
    allDisplayParcels,
    filteredParcels,
    aideAgents,
    pointeurUsers,
    allUsers, setAllUsers,
    sameCity,
    isParcelCreator, isChefAgencyAideParcel,
    canActAsParcelOwner, canEditParcelDetails,
    canManageStatus, canManageReturnDelivery,
    isReturnOriginCity, canManageDeliveryAssignment,
    isPointedForDelivery, canLoadTransportParcel,
    isAideParcelLockedForEdit,
    isPendingAideParcelForAgency,
    agencyPendingAideParcels,
    aideParcelsFor,
    RETURN_REASONS,
    needsAzertyFix,
    azertyFix,
    doScan, openScanModal,
    handlePrintTicket, handlePrintTable,
    handleEditClick, handleDeleteClick, confirmDelete, openEditModal,
    handleAssignTransport,
    handleAssignDelivery,
    handleBulkLoadTransport,
    handleCodeVerify, handleEditSave,
    handleCreateReturnParcel,
    handleReturnDirect,
    submitReturnWithReason,
    handleValidateParcelEntry,
    handleBulkValidateAideEntries,
    handleToggleAideParcelAccess,

    // ── Caisse tab
    agentEntries, setAgentEntries,
    agencyCashiers, setAgencyCashiers,
    caisseDatePreset, setCaisseDatePreset,
    caisseDateFrom, setCaisseDateFrom,
    caisseDateTo, setCaisseDateTo,
    caisseSearch, setCaisseSearch,
    agentOpsDelete, setAgentOpsDelete,
    cashierHistoryDelete, setCashierHistoryDelete,
    agencyCash, setAgencyCash,
    directTransfer, setDirectTransfer,
    recoveryRequest, setRecoveryRequest,
    adminTransferForm, setAdminTransferForm,
    myAdminTransfers, setMyAdminTransfers,
    cashRecoveryRequests, setCashRecoveryRequests,
    portCollectModal, setPortCollectModal,
    rapportValidating, setRapportValidating,
    rapportError, setRapportError,
    rapportChefNotes, setRapportChefNotes,
    rapportNotesMap, setRapportNotesMap,
    pointeurRapports, setPointeurRapports,
    pointeurReglements, setPointeurReglements,
    sourcePointeurReglements, setSourcePointeurReglements,
    debouncedCaisseSearch,
    handleDirectCashierTransfer,
    handleAdminTransfer,
    handleRequestCashRecovery,
    handleDeleteAgentOperations,
    handleDeleteCashierHistory,
    handleValiderRapport,
    handleRejeterRapport,
    handleAgentCollectPort,

    // ── COD tab
    codDatePreset, setCodDatePreset,
    codDateFrom, setCodDateFrom,
    codDateTo, setCodDateTo,
    codSearch, setCodSearch,
    codSending, setCodSending,
    codConfirming, setCodConfirming,
    codReceptioning, setCodReceptioning,
    receptionCodError, setReceptionCodError,
    receiveModal, setReceiveModal,
    codSettling, setCodSettling,
    allCodParcels, setAllCodParcels,
    codLoadingAll, setCodLoadingAll,
    batchSettling, setBatchSettling,
    agentCodRequests, setAgentCodRequests,
    codRequestDrafts, setCodRequestDrafts,
    codRequestBusy, setCodRequestBusy,
    bankDeposits, setBankDeposits,
    bankDepositModal, setBankDepositModal,
    bankDepositPrinting, setBankDepositPrinting,
    centralDepositState, setCentralDepositState,
    centralDepositSelectedIds, setCentralDepositSelectedIds,
    codCollectModal, setCodCollectModal,
    handleLoadAllCod,
    handleCentralCodDeposit,
    handleReceptionCod,
    handleMarkSentToSource,
    handleSettleCod,
    handleBatchSettle,
    handleSettleCodFromRequest,
    handleReplyCodRequest,
    openReceiveModal,
    isRetourFondValue,
    isCash,
    getCentralDepositEligibleCods,

    // ── Clients tab
    modRequests, setModRequests,
    agentNotes, setAgentNotes,
    clientsSearch, setClientsSearch,
    agentNewClient, setAgentNewClient,
    agentClientSaving, setAgentClientSaving,
    handleCreateInlineClient,
    handleAgentCreateClient,
    handleResolveModification,
    handleDeleteMod,

    // ── Secteurs / Charge / Drivers tabs
    sectors, setSectors,
    allSectors, setAllSectors,
    vehicles, setVehicles,
    bonBatches, setBonBatches,
    sectorModal, setSectorModal,
    bonPrintModal, setBonPrintModal,
    driverModal, setDriverModal,
    confirmDeleteDriverId, setConfirmDeleteDriverId,
    chargeDriverId, setChargeDriverId,
    chargeDatePreset, setChargeDatePreset,
    chargeDateFrom, setChargeDateFrom,
    chargeDateTo, setChargeDateTo,
    drivers,
    portDuReceiving, setPortDuReceiving,
    portDuReceiveError, setPortDuReceiveError,
    driverVersements, setDriverVersements,
    versementConfirming, setVersementConfirming,
    codFromDriverReceiving, setCodFromDriverReceiving,
    handleReceivePortDuEspeces,
    handleReceiveCodFromDriver,
    handlePrintCharge,
    handlePrintBonRamassage,

    // ── Aide agents tab
    createAideModal, setCreateAideModal,
    aideForm, setAideForm,
    aideLoading, setAideLoading,
    aideError, setAideError,
    createPointeurModal, setCreatePointeurModal,
    pointeurForm, setPointeurForm,
    pointeurLoading, setPointeurLoading,
    pointeurError, setPointeurError,
    handleCreateAideAgent,
    handleCreatePointeur,
    handleToggleBlockAide,
    handleDeleteAideAgent,

    // ── Dashboard
    dashKPIs,
    dashCaisseKPIs,
    dashLast7,
    dashLast30,
    dashPieData,
    arrivages,

    // ── Arrivage tab
    transitParcels,
    arrivageTab, setArrivageTab,
    arrivageScan, setArrivageScan,
    arrivageSearch, setArrivageSearch,
    arrivageDatePreset, setArrivageDatePreset,
    arrivageDateFrom, setArrivageDateFrom,
    arrivageDateTo, setArrivageDateTo,
    arrivageTypeFilter, setArrivageTypeFilter,
    arrivageServiceFilter, setArrivageServiceFilter,
    arrivageDriverFilter, setArrivageDriverFilter,
    arrivageOriginFilter, setArrivageOriginFilter,
    arrivageStatusFilter, setArrivageStatusFilter,
    arrivageAgentFilter, setArrivageAgentFilter,
    arrivageExpandedIds, setArrivageExpandedIds,
    arrivageConfirming,
    arrivageError,
    arrivageSuccess, setArrivageSuccess,
    arrivageShowFilters, setArrivageShowFilters,
    arrivageShowSansBon, setArrivageShowSansBon,
    arrivageShowNotes, setArrivageShowNotes,
    arrivageNotes, setArrivageNotes,
    arrScanFlash,
    colisWithoutBon, setColisWithoutBon,
    colisWbForm, setColisWbForm,
    expandedGroups,
    arrivedBoxes,
    histPointEdits,
    histSaving,
    histPointErr,
    histExpandedPt, setHistExpandedPt,
    histSearchQ, setHistSearchQ,
    histSearchRes, setHistSearchRes,
    histSearchErr, setHistSearchErr,
    histSearching,
    ARR_TYPE_CONFIG,
    arrComputedType,
    arrFilteredTransitParcels,
    arrArrivedParcels,
    arrMissingParcels,
    arrTotalArrived,
    arrTotalExpected,
    arrTotalMissing,
    arrGroups,
    arrIsArrived,
    arrIsPartial,
    arrIsFull,
    arrNbColis,
    arrArrived,
    arrNexp,
    arrToggle,
    arrToggleGroup,
    arrToggleExpand,
    arrToggleAll,
    arrSetBoxes,
    arrPointByCode,
    arrUniqueDrivers,
    arrUniqueOrigins,
    arrHistUniqueAgents,
    filteredArrivages,
    arrHistTotalBons,
    arrHistTotalManquants,
    arrHistTotalSansBon,
    handleConfirmArrivage,
    histGetEdit,
    histInitEdit,
    histTogglePointed,
    histSetBoxes,
    histRemoveFromArrived,
    histRecoverMissing,
    histSearchParcel,
    histAddSearchResult,
    histSavePointage,
  }

  // ⭐ Calculer le nombre de COD qui nécessitent une action (badge notification)
  const newCodCount = (() => {
    if (profile?.role !== 'chef_agence' || !allCodParcels) return 0
    const uid = auth.currentUser?.uid
    const isChefAgencyCodDestination = (p: any) => {
      const destCity = p.destinationCity || p.receiver?.city
      return destCity === profile?.city
    }
    // COD collectés par le livreur en attente de réception par le chef
    const dst = (allCodParcels as any[]).filter(p => p.destinationAgentId === uid || isChefAgencyCodDestination(p))
    const dst_collected = dst.filter(p => p.codStatus === 'collected' && !p.codSenderPaid)
    return dst_collected.length
  })()

  return (
    <AgentCtx.Provider value={ctxValue}>
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <CompanyContact />

      {/* Header */}
      <AgentHeader
        profile={profile}
        tab={tab}
        setTab={setTab}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        openScanModal={openScanModal}
        modRequests={modRequests}
        aideAgents={aideAgents}
        setCreatedParcel={setCreatedParcel}
        setForm={setForm}
        setArrivageTab={setArrivageTab}
        setArrivageSuccess={setArrivageSuccess}
        EMPTY_FORM={EMPTY_FORM}
        transitParcels={transitParcels}   // ⭐ Badge arrivages
        arrivedBoxes={arrivedBoxes}       // ⭐ Badge arrivages
        newCodCount={newCodCount}          // ⭐ Badge COD
      />

      <main className="w-full max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto px-3 sm:px-4 md:px-5 pb-16">

        {/* Message notification */}
        {msg && (
          <div className={`mb-4 p-4 rounded-xl border-2 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        {/* ── ACCUEIL ── */}
        {tab === 'home' && (
          <Suspense fallback={null}>
            <HomeTab />
          </Suspense>
        )}

        {/* ── NOUVEAU COLIS ── */}
        {tab === 'new' && (
          <Suspense fallback={null}>
            <NewTab />
          </Suspense>
        )}

        {/* ── EXPÉDITIONS ── */}
        {tab === 'parcels' && <ParcelsTab />}

        {tab === 'caisse' && (
          <Suspense fallback={null}>
            <CaisseTab />
          </Suspense>
        )}

        {tab === 'cod' && (
          <Suspense fallback={null}>
            <CodTab />
          </Suspense>
        )}

        {tab === 'clients' && (
          <Suspense fallback={null}>
            <AgentClientsTab agencyCity={profile?.city || ''} profile={profile} setMsg={setMsg} />
          </Suspense>
        )}

        {tab === 'modifications' && profile?.role === 'chef_agence' && (
          <Suspense fallback={null}>
            <ModificationsTab />
          </Suspense>
        )}

                {/* ── FEUILLE DE CHARGE ── */}
        {tab === 'charge' && (
          <Suspense fallback={null}>
            <ChargeTab />
          </Suspense>
        )}

        {tab === 'secteurs' && (
          <Suspense fallback={null}>
            <SectorsTab />
          </Suspense>
        )}

        {tab === 'drivers' && (
          <Suspense fallback={null}>
            <DriversTab />
          </Suspense>
        )}

      </main>

      {/* Visionneuse signature */}
      {viewSignature && (
        <SignatureViewerModal
          parcelId={viewSignature.id}
          trackingId={viewSignature.trackingId}
          recipientName={viewSignature.receiver?.name}
          nexpCode={viewSignature.sender?.nic}
          onClose={() => setViewSignature(null)}
          canEdit={profile?.role === 'chef_agence'}
          userName={profile?.name || profile?.email || 'Chef d\'agence'}
          isReturn={!!(viewSignature.returnedAt || viewSignature.returnToCity)}
        />
      )}

      {/* ── ARRIVAGES TAB ── */}
      {tab === 'arrivage' && (
        <Suspense fallback={null}>
          <ArrivageTab />
        </Suspense>
      )}

      {/* ── RETOURS TAB ── */}
      {tab === 'retours' && (
        <Suspense fallback={null}>
          <RetoursTab
            profile={profile}
            allParcels={allDisplayParcels}
            drivers={users.filter((u: any) => u.role === 'livreur' || u.role === 'chauffeur')}
            onLoadReturnOnTruck={async (parcelIds: string[]) => {
              for (const id of parcelIds) {
                const p = parcels.find((x: any) => x.id === id)
                if (p) await loadReturnedParcelOnTruck(p)
              }
            }}
            onAssignReturnDriver={async (parcelId: string, driver: any) => {
              // Assigner le livreur de retour en utilisant des champs séparés
              const parcel = parcels.find((p: any) => p.id === parcelId)
              if (!parcel) return

              await updateDoc(doc(db, 'parcels', parcelId), {
                returnDeliveryDriverId: driver.id,
                returnDeliveryDriverName: driver.name,
                returnDeliverySectorId: driver.sectorId || null,
                returnDeliverySectorCode: driver.sectorCode || '',
                returnDeliverySectorName: driver.sectorName || '',
                returnDeliveryAssignedAt: new Date().toISOString(),
                returnDeliveryAssignedBy: profile?.name || '',
                status: 'En cours de livraison',
                history: arrayUnion({
                  status: 'En cours de livraison',
                  timestamp: new Date().toISOString(),
                  note: `Retour assigné au livreur ${driver.name} pour livraison à l'expéditeur`
                })
              })
            }}
            onMarkReturnedToSender={async (parcelId: string) => {
              await updateParcelStatus(parcelId, 'Retour finalisé', {
                note: `Retour finalisé par ${profile?.name || 'chef d\'agence'}`
              })
            }}
          />
        </Suspense>
      )}

      {/* ── COLIS PERDUS TAB ── */}
      {tab === 'lostparcels' && profile?.role !== 'aide_agent' && (
        <Suspense fallback={null}>
          <LostParcelsTab
            agencyCity={profile?.city || ''}
            profile={profile}
            setMsg={setMsg}
          />
        </Suspense>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && profile?.role === 'chef_agence' && (
        <Suspense fallback={null}>
          <DashboardTab />
        </Suspense>
      )}

      {tab === 'aideagents' && (
        <Suspense fallback={null}>
          <AideAgentsTab />
        </Suspense>
      )}

      {/* ── NOTES AGENTS TAB ── */}
      {tab === 'notes' && profile?.role === 'chef_agence' && (
        <Suspense fallback={null}>
          <NotesAgentsTab profile={profile} users={users} agentNotes={agentNotes} />
        </Suspense>
      )}

      <AgentReceiveModal
        receiveModal={receiveModal}
        setReceiveModal={setReceiveModal}
        handleConfirmReceived={handleConfirmReceived}
      />

      {/* Modal colis retour */}
      <AgentReturnModal
        returnParcelModal={returnParcelModal}
        setReturnParcelModal={setReturnParcelModal}
        handleCreateReturnParcel={handleCreateReturnParcel}
      />

      {/* Modal scan global automatique (douchette) */}
      {globalScanModal && (
        <ParcelScanModal
          parcel={globalScanModal}
          onClose={() => setGlobalScanModal(null)}
        />
      )}

      {/* Modal confirmation suppression */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-red-600 mb-4">
                ⚠️ Confirmer la suppression
              </h3>
              <p className="text-gray-700 mb-2">
                Voulez-vous vraiment supprimer cette expédition ?
              </p>
              <div className="bg-gray-50 p-3 rounded mb-4 text-sm">
                <p><strong>N° Expédition:</strong> {deleteConfirm.trackingRef || deleteConfirm.id}</p>
                <p><strong>Expéditeur:</strong> {deleteConfirm.senderName}</p>
                <p><strong>Destinataire:</strong> {deleteConfirm.receiverName}</p>
                <p><strong>Ville:</strong> {deleteConfirm.receiverCity}</p>
              </div>
              <p className="text-sm text-red-600 mb-4">
                ⚠️ Cette action est irréversible !
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    try {
                      await handlers.confirmDelete(deleteConfirm)
                      setMsg({ type: 'success', text: 'Expédition supprimée avec succès' })
                    } catch (err: any) {
                      setMsg({ type: 'error', text: err.message || 'Erreur lors de la suppression' })
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
    </AgentCtx.Provider>
  )
}
