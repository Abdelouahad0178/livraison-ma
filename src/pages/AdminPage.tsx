import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react'
import { signOut, createUserWithEmailAndPassword, signOut as fbSignOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { collection, doc, setDoc, getDoc, getDocs, writeBatch, query, where } from 'firebase/firestore'
import { auth, authSecondary, db } from '../firebase/config'
import { useNavigate } from 'react-router-dom'
import { useFuseSearch } from '../hooks/useFuseSearch'
import { ADMIN_SEARCH_CONFIG, SEARCH_PLACEHOLDERS } from '../config/searchConfig'
import {
  subscribeAllParcels, subscribeAllUsers,
  updateParcel, updateParcelStatus, markParcelAsReturned, remitCod, settleCodToSender, batchSettleCods, updateUser, deleteUserDoc,
  subscribeAllCaisse, subscribeAllCaisseClotures,
  subscribeAllCaissierRemarks,
  createCaisseRequest, subscribeAllCaisseRequests, completeRhSalaryCaisseRequest,
  subscribeAllDriverPortDuTransactions, addDriverPortDuTransaction, deleteDriverPortDuTransaction, updateDriverPortDuTransaction,
  confirmDriverVersement,
  subscribeAdminTransfers, confirmAdminTransfer, rejectAdminTransfer,
  createAdminTransferDirect, updateAdminTransfer, deleteAdminTransfer,
  createCaisseEntry,
  adjustCentralCash, subscribeCentralCash, resetCentralCashToZero, resetEverythingToZero,
  subscribeAllAgencyCashes, updateAgencyCash,
  subscribeAllSectors,
  createReturnParcel,
  subscribeAllReglementsGlobal, subscribeAllRapportsGlobal,
  getParcelsPage,
  searchParcelByNicOptimized,
  searchParcels,
} from '../firebase/firestore'
import { deleteParcel, getRealParcelsStats } from '../firebase/parcels'
import {
  createAgentCodRequest, subscribeAllAgentCodRequests, addAgentCodRequestReply, resolveAgentCodRequest,
} from '../firebase/agentCodRequests'
import {
  createClient, updateClient, subscribeAllClientMessages, resolveClientMessage,
  addClientMessageReply, deleteClientMessage, markClientMessageReadByStaff,
} from '../firebase/clients'
import { subscribeDirectorLogs, DIRECTOR_ACTION_ICONS } from '../firebase/directorLogs'
import { subscribeAllBankDeposits, deleteBankDeposit } from '../firebase/bankDeposits'
import { subscribeAllCentralCodDeposits, subscribeAllCentralSupplierPayments } from '../firebase/central'
import { BACKUP_COLLECTIONS } from '../firebase/backupCollections'
import { subscribeTariffConfig, saveTariffConfig } from '../firebase/tariffs'
import { subscribeAllAgentNotes } from '../firebase/agentNotes'
import {
  DEFAULT_OPERATION_LOCKS, subscribeOperationLocks, updateGlobalSiteLock, updateAgencyLock,
} from '../firebase/operationLocks'
import {
  CAISSE_CATEGORIES, CITIES, STATUSES, STATUS_COLORS, COD_PAYMENT_TYPES, COD_STATUS,
  DIRECTOR_PERMISSIONS, DEFAULT_TARIFF_CONFIG, calculateTariff, normalizeTariffConfig,
  codCollectedLabel, REGLEMENT_MODES, REGLEMENT_STATUSES,
} from '../firebase/constants'
import {
  LayoutDashboard, LogOut, Package, Clock, CheckCircle,
  Banknote, Filter, ExternalLink, Edit2, X, Calendar, Users, Wallet,
  ChevronDown, Save, Search, UserPlus, Eye, EyeOff, Contact, Menu,
  BarChart2, Truck, MapPin, ArrowRight, Car, Ban, ShieldCheck, Trash2, TrendingUp, TrendingDown,
  Building2, AlertTriangle, Download, Calculator, RotateCcw, Lock, CheckCircle2, FileText, Upload, Power, Copy, MessageCircle, Monitor, Star, Archive, Settings,
} from 'lucide-react'
import CompanyContact from '../components/CompanyContact'
import SignatureViewerModal from '../components/SignatureViewerModal'
import LiveClock from '../components/LiveClock'
import WorkingDateIndicator from '../components/WorkingDateIndicator'

const AdminCaisseTab = lazy(() => import('./admin/tabs/AdminCaisseTab'))
const AdminVersementsTab = lazy(() => import('./admin/tabs/AdminVersementsTab'))
const AdminBanqueTab = lazy(() => import('./admin/tabs/AdminBanqueTab'))
const AdminReglementsTab = lazy(() => import('./admin/tabs/AdminReglementsTab'))
const AdminUsersTab = lazy(() => import('./admin/tabs/AdminUsersTab'))
const AdminActivityTab = lazy(() => import('./admin/tabs/AdminActivityTab'))
const AdminExpeditionsTab = lazy(() => import('./admin/tabs/AdminExpeditionsTab'))
const AdminEmployeesTab = lazy(() => import('./admin/tabs/AdminEmployeesTab'))
const AdminNotesTab = lazy(() => import('./admin/tabs/AdminNotesTab'))
const AdminReturnsTab = lazy(() => import('./admin/tabs/AdminReturnsTab'))
const AdminHomeTab   = lazy(() => import('./admin/tabs/AdminHomeTab'))
const AdminCodTab    = lazy(() => import('./admin/tabs/AdminCodTab'))
const AdminAgenciesTab = lazy(() => import('./admin/tabs/AdminAgenciesTab'))
const AdminAlertsTab = lazy(() => import('./admin/tabs/AdminAlertsTab'))
const AdminTariffsTab = lazy(() => import('./admin/tabs/AdminTariffsTab'))
const AdminExportsTab = lazy(() => import('./admin/tabs/AdminExportsTab'))
const AdminArchivageTab = lazy(() => import('./admin/tabs/AdminArchivageTab'))
const AdminPortAgenciesTab = lazy(() => import('./admin/tabs/AdminPortAgenciesTab'))
const AdminLostParcelsTab = lazy(() => import('./admin/tabs/AdminLostParcelsTab'))
const AdminClientsTab = lazy(() => import('./admin/tabs/AdminClientsTab'))
const AdminUtilitiesTab = lazy(() => import('./admin/tabs/AdminUtilitiesTab'))
const AdminPermissionsTab = lazy(() => import('./admin/tabs/AdminPermissionsTab'))
const EmployeeContractModal = lazy(() => import('./admin/components/EmployeeContractModal'))
import { useAdminHandlers, downloadCsv, downloadJson, copyText } from './admin/hooks/useAdminHandlers'
import UserEditModal from './admin/modals/UserEditModal'
import UserActivityModal from './admin/modals/UserActivityModal'
import DirectorLogsModal from './admin/modals/DirectorLogsModal'
import DriverPortDuModal from './admin/modals/DriverPortDuModal'
import AdminEditParcelModal from './admin/modals/AdminEditParcelModal'
import { fmt } from '../utils/formatNumber'

const parcelDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const userDate = (u: any) => u.createdAt ? new Date(u.createdAt) : new Date(0)
const logDate = (l: any) => {
  if (l.timestamp?.toDate) return l.timestamp.toDate()
  if (l.timestamp) return new Date(l.timestamp)
  return new Date(0)
}
const anyDate = (value: any) => {
  if (!value) return new Date(0)
  if (value?.toDate) return value.toDate()
  return new Date(value)
}
const caisseEntryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}
const filterByDate = (list: any, preset: any, from: any, to: any, getDate = parcelDate) => {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end: any = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  if (!Array.isArray(list)) return []
  return list.filter((p: any) => {
    const d = getDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}

const formatPeriod = (preset: any, from: any, to: any) => {
  const fmtDate = (value: any) => value ? new Date(value + 'T00:00:00').toLocaleDateString('fr-MA') : ''
  if (preset === 'today') return "Aujourd'hui"
  if (preset === 'week') return '7 derniers jours'
  if (preset === 'month') return 'Ce mois'
  if (preset === 'custom') {
    if (from && to) return `Du ${fmtDate(from)} au ${fmtDate(to)}`
    if (from) return `Depuis le ${fmtDate(from)}`
    if (to) return `Jusqu'au ${fmtDate(to)}`
    return 'Période personnalisée'
  }
  return 'Toutes les dates'
}

// 🔬 Algorithme de distance de Levenshtein (mesure similarité entre 2 chaînes)
const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  if (len1 === 0) return len2
  if (len2 === 0) return len1

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[len2][len1]
}

// 🎯 Score de similarité avancé (0-100, 100 = match parfait)
const calculateSimilarity = (value: string, query: string): number => {
  const v = String(value ?? '').toLowerCase().trim()
  const q = query.toLowerCase().trim()

  if (!v || !q) return 0

  // Match exact = 100 points
  if (v === q) return 100

  // Commence par la recherche = 90 points
  if (v.startsWith(q)) return 90

  // Contient la recherche = 80 points
  if (v.includes(q)) return 80

  // Normalisation (enlever espaces/caractères spéciaux)
  const normalizeStr = (s: string) => s.replace(/[^a-z0-9]/g, '')
  const vNorm = normalizeStr(v)
  const qNorm = normalizeStr(q)

  // Match normalisé exact = 85 points
  if (vNorm === qNorm) return 85

  // Contient normalisé = 75 points
  if (vNorm.includes(qNorm)) return 75

  // Distance de Levenshtein (fuzzy matching - tolère fautes de frappe)
  const distance = levenshteinDistance(vNorm, qNorm)
  const maxLen = Math.max(vNorm.length, qNorm.length)

  // Si distance est petite par rapport à la longueur = match flou
  if (maxLen > 0) {
    const similarity = ((maxLen - distance) / maxLen) * 100
    // Seuil minimum : 60% de similarité
    if (similarity >= 60) return similarity
  }

  return 0
}

// 🔍 Recherche multi-champs avec pondération intelligente
const advancedSearch = (parcel: any, query: string): boolean => {
  if (!query?.trim()) return true

  const q = query.trim().toUpperCase()

  // 🔢 Si recherche numérique pure (N° EXP) → MATCH EXACT uniquement
  if (/^[0-9]+$/.test(q)) {
    return (
      parcel.senderNic === q ||
      parcel.sender?.nic === q ||
      parcel.trackingId === q
    )
  }

  // 📝 Sinon → recherche avancée pour texte (noms, tél, etc.)
  const fields = [
    { value: parcel.trackingId,     weight: 10 },
    { value: parcel.senderNic,      weight: 10 },
    { value: parcel.sender?.nic,    weight: 10 },
    { value: parcel.sender?.name,   weight: 5 },
    { value: parcel.sender?.tel,    weight: 7 },
    { value: parcel.receiver?.name, weight: 5 },
    { value: parcel.receiver?.tel,  weight: 7 },
    { value: parcel.sender?.city,   weight: 3 },
    { value: parcel.receiver?.city, weight: 3 },
  ]

  let maxScore = 0
  for (const field of fields) {
    const score = calculateSimilarity(field.value, query)
    const weightedScore = score * field.weight
    maxScore = Math.max(maxScore, weightedScore)
  }

  return maxScore >= 300
}

// Fonction legacy pour compatibilité
const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/\s+/g, '')
const matchesSearch = (values: any, query: any) => advancedSearch({
  trackingId: values[0],
  senderNic: values[1],
  sender: { nic: values[2], name: values[3], tel: values[4], city: values[5] },
  receiver: { name: values[6], tel: values[7], city: values[8] }
}, query)
const parsePositiveNumber = (value: any, fallback = 0) => {
  const num = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) && num >= 0 ? num : fallback
}
const currentSalaryMonth = () => new Date().toISOString().slice(0, 7)
const salaryMonthLabel = (month: any) => month
  ? new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
  : 'Mois non précisé'
const getLastHistoryDate = (p: any) => {
  const last = Array.isArray(p.history) ? p.history[p.history.length - 1] : null
  return last?.timestamp ? new Date(last.timestamp) : parcelDate(p)
}
const hoursSince = (date: any) => Math.max(0, Math.round((Date.now() - date.getTime()) / 36e5))
const getDelayLimit = (status: string): number => (({
  'Initialisé': 24,
  'En transit': 48,
  'Arrivé en agence': 24,
  'En cours de livraison': 12,
} as Record<string, number>)[status] || 48)
const RETURN_REASONS = [
  'Client absent',
  'Refus client',
  'Adresse introuvable',
  'Téléphone incorrect',
  'Colis endommagé',
  'Autre',
]
const csvEscape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`
const ROLES = [
  { key: 'admin',       label: 'Admin',          emoji: '🔐',   badge: 'bg-red-100 text-red-700'         },
  { key: 'directeur',   label: 'Directeur',       emoji: '👔',   badge: 'bg-purple-100 text-purple-700'   },
  { key: 'chef_agence', label: "Chef d'agence",   emoji: '🏢',   badge: 'bg-indigo-100 text-indigo-700'   },
  { key: 'agent',       label: 'Agent',           emoji: '👤', badge: 'bg-blue-100 text-blue-700'      },
  { key: 'aide_agent',           label: 'Aide Agent',         emoji: '🙋',   badge: 'bg-violet-100 text-violet-700'  },
  { key: 'agentpro',             label: 'Agent Pro',          emoji: '⭐',   badge: 'bg-purple-100 text-purple-700'  },
  { key: 'pointeur_encaisseur', label: 'Pointeur-Encaisseur', emoji: '💰',   badge: 'bg-indigo-100 text-indigo-700'  },
  { key: 'encaisseur_central',   label: 'Encaisseur central',  emoji: '🏦',   badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'chauffeur',            label: 'Chauffeur',           emoji: '🚗',   badge: 'bg-orange-100 text-orange-700'  },
  { key: 'livreur',              label: 'Livreur',             emoji: '🚚',   badge: 'bg-amber-100 text-amber-700'    },
  { key: 'livreur-gare',         label: 'Livreur en gare',     emoji: '🚉',   badge: 'bg-yellow-100 text-yellow-700'  },
  { key: 'caissier',             label: 'Caissier',            emoji: '💵',   badge: 'bg-teal-100 text-teal-700'     },
  { key: 'salarie',     label: 'Salarié',         emoji: '👷',   badge: 'bg-rose-100 text-rose-700'      },
  { key: 'client',      label: 'Client',          emoji: '🧑',   badge: 'bg-sky-100 text-sky-700'        },
]

export default function AdminPage() {
  const navigate = useNavigate()

  // Main tab
  const [mainTab, setMainTab] = useState('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminDatePreset, setAdminDatePreset] = useState('all')
  const [adminDateFrom,   setAdminDateFrom]   = useState('')
  const [adminDateTo,     setAdminDateTo]     = useState('')
  const [codDatePreset, setCodDatePreset] = useState('all')
  const [codDateFrom,   setCodDateFrom]   = useState('')
  const [codDateTo,     setCodDateTo]     = useState('')

  // Parcels - Système de chargement progressif comme CentralCollectorPage
  const PAGE_SIZE = 800 // Chargement par tranches de 800
  const [parcels,      setParcels]      = useState<any[]>([]) // Pour compatibilité - alias de liveParcels
  const [liveParcels,  setLiveParcels]  = useState<any[]>([]) // Temps réel (premiers 800)
  const [moreParcels,  setMoreParcels]  = useState<any[]>([]) // Chargés progressivement
  const lastPageDocRef = useRef<any>(null)
  const pagedRef = useRef(false) // true si on a déjà chargé des pages
  const [hasMore,      setHasMore]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [loadingAll,   setLoadingAll]   = useState(false)
  const [loadAllProgress, setLoadAllProgress] = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [realStats,    setRealStats]    = useState<any>(null)
  const [cityFilter,       setCityFilter]       = useState('Toutes')
  const [statusFilter,     setStatusFilter]     = useState<string[]>([])
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string[]>([])
  const [portTypeFilter,   setPortTypeFilter]   = useState<string[]>([])
  const [driverFilter,     setDriverFilter]     = useState('Tous')

  // ✅ NOUVEAU: Recherche gérée par hook professionnel useFuseSearch (défini plus bas après periodParcels)
  const [isSearchActive, setIsSearchActive] = useState(false) // Pour recharger plus de colis quand recherche active
  const [serverSearchResults, setServerSearchResults] = useState<any[] | null>(null) // Résultats recherche serveur

  // Limite d'affichage des expéditions filtrées
  const DISPLAY_LIMIT = 150
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_LIMIT)

  const [statusModal,       setStatusModal]       = useState<any>(null)
  const [returnModal,       setReturnModal]       = useState<any>(null)
  const [returnParcelModal, setReturnParcelModal] = useState<any>(null) // { parcel, loading, result, error }
  const [viewSignature,     setViewSignature]     = useState<any>(null)
  const [archiveModal,      setArchiveModal]      = useState<any>(null)
  const [deleteConfirm,     setDeleteConfirm]     = useState<string | null>(null) // parcelId en attente de confirmation
  const [deleting,          setDeleting]          = useState<string | null>(null) // parcelId en cours de suppression
  const [archiveProgress,   setArchiveProgress]   = useState({ done: 0, total: 0 })

  // RETOUR FOND tab
  const [codFilter,     setCodFilter]     = useState('all')
  const [codSearch,     setCodSearch]     = useState('')
  const [alertFilter,   setAlertFilter]   = useState('all')

  // Section
  const [adminReglements,      setAdminReglements]      = useState<any[]>([])
  const [adminRapports,        setAdminRapports]        = useState<any[]>([])
  const [rgAgenceFilter,       setRgAgenceFilter]       = useState('all')
  const [rgModeFilter,         setRgModeFilter]         = useState('all')
  const [rgStatusFilter,       setRgStatusFilter]       = useState('all')
  const [rgPointeurFilter,     setRgPointeurFilter]     = useState('all')
  const [rgDatePreset,         setRgDatePreset]         = useState('all')
  const [rgDateFrom,           setRgDateFrom]           = useState('')
  const [rgDateTo,             setRgDateTo]             = useState('')
  const [rgSearch,             setRgSearch]             = useState('')
  const [rgTab,                setRgTab]                = useState('reglements')
  const [rapportValidating,    setRapportValidating]    = useState<any>(null)
  const [rapportNoteInput,     setRapportNoteInput]     = useState<any>({})

  // Users tab
  const [users,        setUsers]        = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userEdit,          setUserEdit]          = useState<any>(null)
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any>(null)
  const [userSearch,        setUserSearch]        = useState('')
  const [roleFilter,        setRoleFilter]        = useState('Tous')
  const [salaryModal,       setSalaryModal]       = useState<any>(null)
  const [pwdForm,  setPwdForm]  = useState({ current: '', next: '', confirm: '', loading: false, error: '', success: '' })

  const EMPTY_CREATE = {
    name: '', email: '', password: '', role: 'chef_agence', city: '', code: '', tel: '', showPwd: false,
    matricule: '', chauffeurType: 'transport', sectorId: '',
    cin: '', cnss: '', assurance: '', dateEmbauche: '', dateSortie: '',
    dateNaissance: '', salaire: '', adresse: '', situationFamiliale: '',
    contactUrgence: '', noteRH: '',
  }
  const [createModal,  setCreateModal]  = useState<any>(null) // null | form data
  const [createLoading,setCreateLoading]= useState(false)
  const [createError,  setCreateError]  = useState('')
  const [allSectors,   setAllSectors]   = useState<any[]>([])

  // Activity tab
  const [activityRoleFilter,   setActivityRoleFilter]   = useState('all')
  const [userActivityModal,    setUserActivityModal]    = useState<any>(null)
  const [userDetailTab,        setUserDetailTab]        = useState('created')

  // Agent Notes tab
  const [agentNotes,           setAgentNotes]           = useState<any[]>([])

  // Section
  const [driverPortDuTxs,      setDriverPortDuTxs]      = useState<any[]>([])
  const [driverPortDuModal,    setDriverPortDuModal]    = useState<any>(null) // { driver, stat }
  const [portDuForm,           setPortDuForm]           = useState({ type: 'versement', amount: '', note: '' })
  const [portDuLoading,        setPortDuLoading]        = useState(false)
  const [portDuError,          setPortDuError]          = useState('')
  const [portDuEditId,         setPortDuEditId]         = useState<any>(null) // tx.id en cours d'édition
  const [portDuEditForm,       setPortDuEditForm]       = useState({ amount: '', note: '' })

  // Caisse centrale
  const [centralCash, setCentralCash] = useState<any>(null)
  const [centralCashModal, setCentralCashModal] = useState(false)
  const [centralCashForm, setCentralCashForm] = useState({ amount: '', type: 'especes', operation: 'add', reason: '' })
  const [centralCashLoading, setCentralCashLoading] = useState(false)
  const [centralCashError, setCentralCashError] = useState('')
  const [resetCentralCashModal, setResetCentralCashModal] = useState(false)
  const [resetCentralCashLoading, setResetCentralCashLoading] = useState(false)
  const [superResetModal, setSuperResetModal] = useState(false)
  const [superResetLoading, setSuperResetLoading] = useState(false)

  // Director logs
  const [directorLogs,      setDirectorLogs]      = useState<any[]>([])
  const [directorLogsModal, setDirectorLogsModal] = useState<any>(null) // director user object

  // Caisse
  const [caisseEntries,   setCaisseEntries]   = useState<any[]>([])
  const [allRhRequests,   setAllRhRequests]   = useState<any[]>([])
  const [agencyCashes,    setAgencyCashes]    = useState<any[]>([])
  const [caisseClotures,  setCaisseClotures]  = useState<any[]>([])
  const [adminTransfers,  setAdminTransfers]  = useState<any[]>([])
  const [caisseCityFilter, setCaisseCityFilter] = useState('Toutes')
  const [caisseTypeFilter, setCaisseTypeFilter] = useState('all')
  const [clotureModal,    setClotureModal]    = useState<any>(null)
  const [clotureLoading,  setClotureLoading]  = useState(false)
  const [clotureError,    setClotureError]    = useState('')

  // Section
  const [allRemarks,       setAllRemarks]       = useState<any[]>([])
  const [clientMessages,   setClientMessages]   = useState<any[]>([])
  const [clientReplyDrafts, setClientReplyDrafts] = useState<any>({})
  const [agentCodRequests, setAgentCodRequests] = useState<any[]>([])
  const [codRequestDrafts, setCodRequestDrafts] = useState<any>({})
  const [codRequestBusy,   setCodRequestBusy]   = useState('')
  const [codRequestMsg,    setCodRequestMsg]    = useState<any>(null)
  const staffReadMarks = useRef(new Set())
  const [remarkFilter,     setRemarkFilter]     = useState('open')
  const [remarkCityFilter, setRemarkCityFilter] = useState('Toutes')

  // Section
  const [allBankDeposits,    setAllBankDeposits]    = useState<any[]>([])
  const [centralCodDeposits, setCentralCodDeposits] = useState<any[]>([])
  const [centralSupplierPayments, setCentralSupplierPayments] = useState<any[]>([])
  const [bankCityFilter,     setBankCityFilter]     = useState('Toutes')
  const [bankDatePreset,     setBankDatePreset]     = useState('all')
  const [bankDateFrom,       setBankDateFrom]       = useState('')
  const [bankDateTo,         setBankDateTo]         = useState('')
  const [bankSearch,         setBankSearch]         = useState('')
  const [bankConfirmBusy,    setBankConfirmBusy]    = useState('')
  const [bankDeleteConfirm,  setBankDeleteConfirm]  = useState<any>(null) // deposit id

  // Section
  const [userEditTab,      setUserEditTab]      = useState('access')
  const [contractModal,    setContractModal]    = useState<any>(null) // null | { employee, form }
  const [codEditModal,     setCodEditModal]     = useState<any>(null) // null | { parcel, value, loading, error }
  const [nicEditModal,     setNicEditModal]     = useState<any>(null) // null | { parcel, value, loading, error }
  const [newParcelModal,   setNewParcelModal]   = useState<any>(null) // null | { form, loading, error }
  const [adminEditModal,   setAdminEditModal]   = useState<any>(null) // null | { parcel, form, loading, error }
  const [backupBusy,       setBackupBusy]       = useState(false)
  const [backupMessage,    setBackupMessage]    = useState<any>(null)
  const [copyMessage,      setCopyMessage]      = useState<any>(null)
  const [importPreview,    setImportPreview]    = useState<any>(null)
  const [operationLocks,   setOperationLocks]   = useState(DEFAULT_OPERATION_LOCKS)
  const [lockBusy,         setLockBusy]         = useState('')
  const [lockPanelOpen,    setLockPanelOpen]    = useState(false)
  const [tariffDraft,      setTariffDraft]      = useState(DEFAULT_TARIFF_CONFIG)
  const [tariffSaving,     setTariffSaving]     = useState(false)
  const [tariffMessage,    setTariffMessage]    = useState<any>(null)

  const datePreset = adminDatePreset
  const dateFrom = adminDateFrom
  const dateTo = adminDateTo
  const setDatePreset = setAdminDatePreset
  const setDateFrom = setAdminDateFrom
  const setDateTo = setAdminDateTo
  // codDatePreset, codDateFrom, codDateTo and their setters are now independent states (defined above)
  const usersDatePreset = adminDatePreset
  const usersDateFrom = adminDateFrom
  const usersDateTo = adminDateTo
  const setUsersDatePreset = setAdminDatePreset
  const setUsersDateFrom = setAdminDateFrom
  const setUsersDateTo = setAdminDateTo
  const activityDatePreset = adminDatePreset
  const activityDateFrom = adminDateFrom
  const activityDateTo = adminDateTo
  const setActivityDatePreset = setAdminDatePreset
  const setActivityDateFrom = setAdminDateFrom
  const setActivityDateTo = setAdminDateTo
  const periodLabel = formatPeriod(adminDatePreset, adminDateFrom, adminDateTo)

  // ✅ useEffect de recherche déplacés après useFuseSearch hook (ligne ~1090)

  // Subscriptions de base � ddémarrent au montage du composant
  useEffect(() => {
    setLoading(false) // Pas de loading initial - on attend les filtres
    // Ne PAS charger les colis au départ - uniquement quand filtres actifs
    const unsubParcels = () => {} // Subscription vide au départ
    const unsubUsers          = subscribeAllUsers(setUsers)
    const unsubLocks          = subscribeOperationLocks(setOperationLocks)
    const unsubTariffs        = subscribeTariffConfig((config: any) => { setTariffDraft(config) })
    const unsubClientMessages = subscribeAllClientMessages(setClientMessages)
    const unsubSectors        = subscribeAllSectors(setAllSectors)
    const unsubCentralCash    = subscribeCentralCash(setCentralCash)
    const unsubAgencyCashes   = subscribeAllAgencyCashes(setAgencyCashes)
    // Règlements + Rapports : chargés d�s le montage (pas lazy) pour éviter le blank
    const unsubReglements     = subscribeAllReglementsGlobal(setAdminReglements, err => console.error('reglements:', err))
    const unsubRapports       = subscribeAllRapportsGlobal(setAdminRapports, err => console.error('rapports:', err))
    return () => { unsubParcels(); unsubUsers(); unsubLocks(); unsubTariffs(); unsubClientMessages(); unsubSectors(); unsubCentralCash(); unsubAgencyCashes(); unsubReglements(); unsubRapports() }
  }, [])

  // ⚡ Abonnement temps réel : 800 premiers colis (rapide)
  useEffect(() => {
    if (isSearchActive) {
      // Mode recherche : on utilise searchParcels - GARDER liveParcels/moreParcels pour éviter l'affichage à 0
      console.log(`🔍 Mode recherche: searchParcels cherche dans TOUTE la base`)
      setLoading(false)
      return () => {}
    }

    setLoading(true)
    console.log(`📦 Chargement ${PAGE_SIZE} colis récents en temps réel`)

    const unsubParcels = subscribeAllParcels(
      (data: any, lastSnap: any) => {
        console.log(`✅ ${data.length} colis chargés en temps réel`)
        setLiveParcels(data)
        setLoading(false)
        if (!pagedRef.current) lastPageDocRef.current = lastSnap
        if (data.length < PAGE_SIZE) setHasMore(false)
      },
      (err: any) => {
        console.error('❌ Erreur chargement:', err)
        setLoading(false)
      },
      0,
      PAGE_SIZE
    )

    return () => unsubParcels()
  }, [isSearchActive])

  // 🚀 Chargement automatique de toute la base en arrière-plan (après premiers 800)
  useEffect(() => {
    if (!hasMore || loadingAll || loadingMore || !lastPageDocRef.current || isSearchActive) return
    if (liveParcels.length === 0) return // attendre le chargement initial

    // Lancer le chargement complet automatiquement après 2 secondes
    const timer = setTimeout(() => {
      if (hasMore && !loadingAll && !loadingMore && lastPageDocRef.current) {
        console.log(`🚀 Démarrage du chargement automatique de toute la base...`)
        loadAllParcels()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [liveParcels.length, hasMore, isSearchActive])

  // Charger 800 colis de plus
  const loadMoreParcels = async () => {
    if (!hasMore || loadingMore || loadingAll || !lastPageDocRef.current) return
    setLoadingMore(true)
    try {
      const { docs, lastDocSnap, hasMore: moreAvailable } = await getParcelsPage(lastPageDocRef.current, PAGE_SIZE)
      pagedRef.current = true
      setMoreParcels(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        docs.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      })
      if (lastDocSnap) lastPageDocRef.current = lastDocSnap
      if (!moreAvailable) setHasMore(false)
      console.log(`✅ ${docs.length} colis supplémentaires chargés (total moreParcels: ${docs.length})`)
    } catch (err) {
      console.error('AdminPage loadMore:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  // Tout charger : boucle par tranches de 800 jusqu'à la fin
  const loadAllParcels = async () => {
    if (loadingAll || loadingMore || !hasMore || !lastPageDocRef.current) return
    setLoadingAll(true)
    setLoadAllProgress(0)
    try {
      let cursor = lastPageDocRef.current
      let more = true
      let loaded = 0
      let safety = 0
      while (more && cursor && safety < 500) {
        const page = await getParcelsPage(cursor, PAGE_SIZE)
        pagedRef.current = true
        const pageDocs = page.docs
        loaded += pageDocs.length
        setLoadAllProgress(loaded)
        console.log(`📦 Chargement automatique: +${pageDocs.length} colis (total: ${loaded})`)
        setMoreParcels(prev => {
          const map = new Map()
          prev.forEach((p: any) => map.set(p.id, p))
          pageDocs.forEach((p: any) => map.set(p.id, p))
          return [...map.values()]
        })
        cursor = page.lastDocSnap
        more = page.hasMore && !!page.lastDocSnap
        safety += 1
      }
      if (cursor) lastPageDocRef.current = cursor
      setHasMore(false)
      console.log(`✅ Chargement automatique terminé: ${loaded} colis chargés`)
    } catch (err) {
      console.error('AdminPage loadAll:', err)
    } finally {
      setLoadingAll(false)
    }
  }

  // Charger les vrais compteurs au montage uniquement (économie forfait gratuit)
  const loadRealStats = async () => {
    const stats = await getRealParcelsStats()
    setRealStats(stats)
  }
  useEffect(() => {
    loadRealStats()
  }, [])

  // Subscriptions lazy � ddémarrent seulement � la premi�re visite de l'onglet
  const _lazyStarted = useRef<any>({})
  useEffect(() => {
    const started = _lazyStarted.current
    if ((mainTab === 'caisse' || mainTab === 'employees' || mainTab === 'activity') && !started.caisseEntries) {
      started.caisseEntries = [subscribeAllCaisse(setCaisseEntries)]
    }
    if (mainTab === 'caisse' && !started.caisseDetails) {
      started.caisseDetails = [
        subscribeAllCaisseClotures(setCaisseClotures),
        subscribeAllCaissierRemarks(setAllRemarks),
      ]
    }
    if (mainTab === 'versements' && !started.versements) {
      started.versements = [subscribeAdminTransfers(setAdminTransfers)]
    }
    // reglements/rapports: abonnés d�s le montage (voir useEffect de base)
    if (mainTab === 'banque' && !started.banque) {
      started.banque = [
        subscribeAllBankDeposits(setAllBankDeposits, err => console.error('bankDeps:', err)),
        subscribeAllCentralCodDeposits(setCentralCodDeposits, err => console.error('centralDeps:', err)),
        subscribeAllCentralSupplierPayments(setCentralSupplierPayments, err => console.error('centralPayments:', err))
      ]
    }
    if (mainTab === 'cod' && !started.cod) {
      started.cod = [subscribeAllAgentCodRequests(setAgentCodRequests)]
    }
    if (mainTab === 'activity' && !started.activity) {
      started.activity = [subscribeDirectorLogs(setDirectorLogs)]
    }
    if ((mainTab === 'employees' || mainTab === 'expeditions' || mainTab === 'activity') && !started.portdu) {
      started.portdu = [subscribeAllDriverPortDuTransactions(setDriverPortDuTxs)]
    }
    if (mainTab === 'employees' && !started.rhRequests) {
      started.rhRequests = [subscribeAllCaisseRequests(setAllRhRequests)]
    }
    if (mainTab === 'notes' && !started.agentNotes) {
      started.agentNotes = [subscribeAllAgentNotes(setAgentNotes, err => console.error('agentNotes:', err))]
    }
  }, [mainTab])

  // Nettoyage des subscriptions lazy au démontage
  useEffect(() => {
    return () => {
      ;(Object.values(_lazyStarted.current).flat() as any[]).forEach(unsub => unsub?.())
    }
  }, [])

  useEffect(() => {
    setUserActivityModal(null)
    setDirectorLogsModal(null)
  }, [adminDatePreset, adminDateFrom, adminDateTo])

  useEffect(() => {
    clientMessages.slice(0, 8).forEach(m => {
      if (m.readByStaffAt || staffReadMarks.current.has(m.id)) return
      staffReadMarks.current.add(m.id)
      markClientMessageReadByStaff(m.id, auth.currentUser?.email || 'Admin').catch(() => {
        staffReadMarks.current.delete(m.id)
      })
    })
  }, [clientMessages])

  // Section
  // -- State vars used by archive/return handlers -----------------------------
  const [archiveDone,    setArchiveDone]    = useState<any>(null)
  const [archiving,      setArchiving]      = useState(false)

  // -- Admin handlers hook -----------------------------------------------------
  const _as = useRef<Record<string, any>>({})
  Object.assign(_as.current, {
    adminEditModal, setAdminEditModal, salaryModal, setSalaryModal,
    statusModal, setStatusModal, allRhRequests, caisseEntries, users,
    bankDeleteConfirm, setBankDeleteConfirm,
    driverPortDuModal, setDriverPortDuModal, driverPortDuTxs,
    portDuForm, setPortDuForm, portDuLoading, setPortDuLoading,
    portDuError, setPortDuError, portDuEditId, setPortDuEditId,
    portDuEditForm, setPortDuEditForm,
    userEdit, setUserEdit, userEditTab, setUserEditTab,
    contractModal, setContractModal, pwdForm, setPwdForm,
    returnModal, setReturnModal,
    archiveModal, setArchiveModal, archiveProgress, setArchiveProgress,
    archiveDone, setArchiveDone, archiving, setArchiving,
    codEditModal, setCodEditModal,
    nicEditModal, setNicEditModal,
    newParcelModal, setNewParcelModal,
    createModal, setCreateModal, createLoading, setCreateLoading, createError, setCreateError,
    deleteConfirmUser, setDeleteConfirmUser,
    copyMessage, setCopyMessage, mainTab, setMainTab,
    tariffDraft, setTariffDraft, tariffSaving, setTariffSaving, tariffMessage, setTariffMessage,
    clientMessages, clientReplyDrafts, setClientReplyDrafts,
    agentCodRequests, codRequestDrafts, setCodRequestDrafts, codRequestBusy, setCodRequestBusy,
    codRequestMsg, setCodRequestMsg,
    importPreview, setImportPreview, backupBusy, setBackupBusy, backupMessage, setBackupMessage,
    lockBusy, setLockBusy, operationLocks, allSectors, allUsers: users,
    confirmDriverVersement,
  })
  const adminHandlers = useAdminHandlers(_as)
  const {
    handleDeleteBankDeposit, openAdminEdit, handleAdminEditSave,
    handleSaveCodAmount, handleSaveNic, handleCreateParcel, handleAddPortDuTx, handleDeletePortDuTx,
    handleSavePortDuEdit, handleConfirmDriverVersement,
    handleStatusUpdate, handleCreateReturnParcel,
    handleRemitCod, handleSettleCodAdmin, handleBatchSettleAdmin,
    handleReturnSave, handleExportBackup, handleBackupFile,
    handleConfirmImportBackup, makeClientPortalLink, handleCopyClientPortalLink,
    handleToggleGlobalLock, handleToggleAgencyLock,
    updateTariffCityPrice, updateTariffWeightRule, handleSaveTariffs, handleResetTariffs,
    handleReplyClientMessage, handleDeleteClientMessage,
    handleSendCodRequest, handleReplyAgentCodRequest,
    handleSaveUser, openContractModal, handleChangePassword,
    handleToggleBlock, handleDeleteUser, handleCreateUser,
    openSalaryPayment, handleSalaryPayment, handleCompleteRhRequest,
    openArchiveModal, toggleArchiveStatus, downloadLocalArchiveFile, handleArchiveParcels,
  } = adminHandlers
  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
  const inputCls  = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 focus:outline-none w-full transition"

  // -- Computed values (useMemo) ---------------------------------------------
  // Fusion : temps réel + pages chargées + résultats serveur (comme CentralCollectorPage)
  const allParcels = useMemo(() => {
    const map = new Map()
    // 1. Ajouter les pages chargées progressivement
    moreParcels.forEach((p: any) => map.set(p.id, p))
    // 2. Ajouter les résultats de recherche serveur (si recherche active)
    if (serverSearchResults) {
      serverSearchResults.forEach((p: any) => map.set(p.id, p))
    }
    // 3. Le temps réel gagne (données les plus fraîches)
    liveParcels.forEach((p: any) => map.set(p.id, p))

    const arr = [...map.values()]
    console.log(`📊 allParcels: ${arr.length} colis (liveParcels: ${liveParcels.length}, moreParcels: ${moreParcels.length}, serverSearch: ${serverSearchResults?.length || 0})`)

    // Trier par date de création (plus récent en premier)
    return arr.sort((a: any, b: any) => {
      const ta = a.createdAt?.toDate?.()?.getTime() || (a.createdAt ? new Date(a.createdAt).getTime() : 0)
      const tb = b.createdAt?.toDate?.()?.getTime() || (b.createdAt ? new Date(b.createdAt).getTime() : 0)
      return tb - ta
    })
  }, [liveParcels, moreParcels, serverSearchResults])

  // Alias pour compatibilité (setParcels met à jour liveParcels)
  useEffect(() => {
    setParcels(liveParcels)
  }, [liveParcels])

  // Mise à jour de allParcels dans _as.current après sa définition
  _as.current.allParcels = allParcels

  const periodParcels = useMemo(() =>
    filterByDate(allParcels, adminDatePreset, adminDateFrom, adminDateTo, (p: any) => {
      // 📅 Utiliser workDate (date de travail) au lieu de createdAt pour respecter les shifts de nuit
      if (p.workDate) return new Date(p.workDate + 'T12:00:00')
      if (p.createdAt?.toDate) return p.createdAt.toDate()
      if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
      return new Date(0)
    })
  , [allParcels, adminDatePreset, adminDateFrom, adminDateTo])

  const periodUsers = useMemo(() =>
    filterByDate(users, adminDatePreset, adminDateFrom, adminDateTo, (u: any) =>
      u.createdAt ? new Date(u.createdAt) : new Date(0))
  , [users, adminDatePreset, adminDateFrom, adminDateTo])

  const periodDirectorLogs = useMemo(() =>
    filterByDate(directorLogs, adminDatePreset, adminDateFrom, adminDateTo, (l: any) =>
      l.timestamp?.toDate ? l.timestamp.toDate() : l.timestamp ? new Date(l.timestamp) : new Date(0))
  , [directorLogs, adminDatePreset, adminDateFrom, adminDateTo])

  const codDateFiltered = useMemo(() =>
    filterByDate(allParcels.filter((p: any) => parseFloat(p.codAmount) > 0),
      codDatePreset, codDateFrom, codDateTo, (p: any) => {
        // 📅 Utiliser workDate (date de travail) au lieu de createdAt
        if (p.workDate) return new Date(p.workDate + 'T12:00:00')
        if (p.createdAt?.toDate) return p.createdAt.toDate()
        return new Date(p.createdAt || 0)
      })
  , [allParcels, codDatePreset, codDateFrom, codDateTo])

  const filteredCod = useMemo(() => {
    if (!Array.isArray(codDateFiltered)) return []
    let list = codDateFiltered
    // Utiliser serviceType en priorité, puis codPaymentType
    const getPaymentType = (p: any) => (p.serviceType || p.codPaymentType || '').toLowerCase()
    if (codFilter === 'especes')   list = list.filter((p: any) => getPaymentType(p).includes('espece'))
    if (codFilter === 'cheque')    list = list.filter((p: any) => getPaymentType(p).includes('cheque'))
    if (codFilter === 'traite')    list = list.filter((p: any) => getPaymentType(p).includes('traite'))
    if (codFilter === 'autres')    list = list.filter((p: any) => {
      const pt = getPaymentType(p)
      return pt && !pt.includes('espece') && !pt.includes('cheque') && !pt.includes('traite')
    })
    if (codSearch) {
      const q = codSearch.toLowerCase()
      list = list.filter((p: any) =>
        (p.trackingId||'').toLowerCase().includes(q) ||
        (p.receiver?.name||'').toLowerCase().includes(q) ||
        (p.sender?.name||'').toLowerCase().includes(q) ||
        (p.receiver?.city||'').toLowerCase().includes(q))
    }
    return list
  }, [codDateFiltered, codFilter, codSearch])

  const codStats = useMemo(() => {
    if (!Array.isArray(allParcels)) return { pendingDH: 0, collectedDH: 0, remisDH: 0, regleDH: 0 }
    return {
      pendingDH:   allParcels.filter((p: any) => parseFloat(p.codAmount) > 0 && (!p.codStatus || p.codStatus === 'pending')).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      collectedDH: allParcels.filter((p: any) => p.codStatus === 'collected').reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      remisDH:     allParcels.filter((p: any) => p.codStatus === 'remis' && !p.codSenderPaid).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      regleDH:     allParcels.filter((p: any) => p.codSenderPaid).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
    }
  }, [allParcels])

  const codStatsFiltered = useMemo(() => {
    if (!Array.isArray(codDateFiltered)) return { pendingDH: 0, collectedDH: 0, remisDH: 0, regleDH: 0, byType: [] }
    return {
      pendingDH:   codDateFiltered.filter((p: any) => !p.codStatus || p.codStatus === 'pending').reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      collectedDH: codDateFiltered.filter((p: any) => p.codStatus === 'collected').reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      remisDH:     codDateFiltered.filter((p: any) => p.codStatus === 'remis' && !p.codSenderPaid).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      regleDH:     codDateFiltered.filter((p: any) => p.codSenderPaid).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
      byType: COD_PAYMENT_TYPES.map(pt => ({
        ...pt,
        total: codDateFiltered.filter((p: any) => p.codPaymentType === pt.key).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
        count: codDateFiltered.filter((p: any) => p.codPaymentType === pt.key).length,
      })).filter(pt => pt.total > 0),
    }
  }, [codDateFiltered])

  const kpis = useMemo(() => {
    if (!Array.isArray(periodParcels)) return { total: 0, delivered: 0, returned: 0, inTransit: 0, cod: 0 }
    return {
      total:     periodParcels.length,
      delivered: periodParcels.filter((p: any) => p.status === 'Livré').length,
      returned:  periodParcels.filter((p: any) => p.status === 'Retourné').length,
      inTransit: periodParcels.filter((p: any) => !['Livré','Retourné'].includes(p.status)).length,
      cod:       periodParcels.filter((p: any) => parseFloat(p.codAmount) > 0 && (!p.codStatus || p.codStatus === 'pending')).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0),
    }
  }, [periodParcels])

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(periodUsers)) return []
    const roleOk = (u: any) => roleFilter === 'Tous' || u.role === roleFilter
    const searchOk = (u: any) => !userSearch || [u.name, u.email, u.city, u.code, u.cin, u.cnss, u.tel].some(v => v?.toLowerCase().includes(userSearch.toLowerCase()))
    return periodUsers.filter((u: any) => roleOk(u) && searchOk(u))
  }, [periodUsers, roleFilter, userSearch])

  const activityStats = useMemo(() => {
    // Protection: s'assurer que tous les tableaux sont valides
    if (!Array.isArray(users) || !Array.isArray(periodParcels) || !Array.isArray(caisseEntries) || !Array.isArray(driverPortDuTxs)) {
      return []
    }
    const pDate = (p: any) => p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
    const eDate = (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
    const periodEntries = filterByDate(caisseEntries, adminDatePreset, adminDateFrom, adminDateTo, eDate)
    if (!Array.isArray(periodEntries)) return []
    return users
      .filter((u: any) => ['agent','chauffeur','livreur','caissier'].includes(u.role))
      .filter((u: any) => activityRoleFilter === 'all' || u.role === activityRoleFilter)
      .map((u: any) => {
        const created    = periodParcels.filter((p: any) => p.agentId === u.id && p.agentRole !== 'aide_agent')
        const claimed    = periodParcels.filter((p: any) => p.destinationAgentId === u.id)
        const transports = periodParcels.filter((p: any) => p.chauffeurId === u.id)
        const deliveries = periodParcels.filter((p: any) => p.deliveryDriverId === u.id)
        const myParcels  = [...new Map([...created, ...claimed, ...transports, ...deliveries].map((p: any) => [p.id, p])).values()]
        const myEntries  = periodEntries.filter((e: any) => e.cashierId === u.id || e.agentId === u.id)
        // Agent fields
        const livres     = created.filter((p: any) => p.status === 'Livré').length
        const enCours    = created.filter((p: any) => !['Livré','Retourné'].includes(p.status)).length
        const retournes  = created.filter((p: any) => p.status === 'Retourné').length
        const totalRevenue = created.reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)
        const codTotal   = created.reduce((s: number, p: any) => s + (parseFloat(p.codAmount) || 0), 0)
        // Cashier fields
        const totalEntrees = myEntries.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (e.amount || 0), 0)
        const totalSorties = myEntries.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (e.amount || 0), 0)
        const depotsAgents = myEntries.filter((e: any) => e.category === 'depot_agent')
        const charges      = myEntries.filter((e: any) => ['charge','frais','salaire','avance'].includes(e.category))
        // Driver fields
        const colisLivres      = [...transports, ...deliveries].filter((p: any) => p.status === 'Livré').length
        const activeTransports = transports.filter((p: any) => p.status === 'En transit').length
        const activeDeliveries = deliveries.filter((p: any) => p.status === 'En cours de livraison').length
        const codCollected     = deliveries.reduce((s: number, p: any) => p.codStatus === 'collected' ? s + (parseFloat(p.codAmount) || 0) : s, 0)
        const driverTxs        = driverPortDuTxs.filter((t: any) => t.driverId === u.id)
        const portDuCollecte   = deliveries.filter((p: any) => p.portType === 'port_du' && p.portStatus === 'collected').reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)
        const versements       = driverTxs.filter((t: any) => t.type === 'versement').reduce((s: number, t: any) => s + (t.amount || 0), 0)
        const avances          = driverTxs.filter((t: any) => t.type === 'avance').reduce((s: number, t: any) => s + (t.amount || 0), 0)
        const remises          = driverTxs.filter((t: any) => t.type === 'remise').reduce((s: number, t: any) => s + (t.amount || 0), 0)
        const solde            = portDuCollecte - versements - remises + avances
        const allDates = myParcels.map((p: any) => pDate(p).getTime())
        const lastActivity = allDates.length ? Math.max(...allDates) : null
        return {
          user: u, parcels: myParcels, created, claimed, transports, deliveries,
          entries: myEntries,
          entrees: myEntries.filter((e: any) => e.type === 'entree'),
          sorties: myEntries.filter((e: any) => e.type === 'sortie'),
          livres, enCours, retournes, totalRevenue, codTotal,
          totalEntrees, totalSorties, depotsAgents, charges,
          colisLivres, activeTransports, activeDeliveries, codCollected,
          portDuCollecte, versements, avances, remises, solde, txs: driverTxs,
          lastActivity,
        }
      })
      .sort((a, b) => (b.parcels.length || 0) - (a.parcels.length || 0))
  }, [periodParcels, caisseEntries, driverPortDuTxs, users, activityRoleFilter, adminDatePreset, adminDateFrom, adminDateTo])

  const agencyStats = useMemo(() => {
    if (!Array.isArray(periodParcels) || !Array.isArray(users)) return []
    return CITIES.map(city => {
    const cityParcels = periodParcels.filter((p: any) => p.originCity === city || p.destinationCity === city || p.sender?.city === city || p.receiver?.city === city)
    const incoming  = cityParcels.filter((p: any) => p.destinationCity === city || p.receiver?.city === city)
    const outgoing  = cityParcels.filter((p: any) => p.originCity === city || p.sender?.city === city)
    const active    = cityParcels.filter((p: any) => !['Livré','Retourné'].includes(p.status))
    const delivered = cityParcels.filter((p: any) => p.status === 'Livré')
    const returned  = cityParcels.filter((p: any) => p.status === 'Retourné')
    const agents    = users.filter((u: any) => u.city === city && u.role !== 'client')
    const manager   = users.find((u: any) => u.city === city && (u.role === 'chef_agence' || u.role === 'admin'))
    const codPending = cityParcels.filter((p: any) => parseFloat(p.codAmount) > 0 && (!p.codStatus || p.codStatus === 'pending')).reduce((s: number,p: any) => s+(parseFloat(p.codAmount)||0), 0)
    return { city, incoming, outgoing, active, delivered, returned, agents, manager, codPending }
  })}, [periodParcels, users])

  const delayedAlerts = useMemo(() => {
    if (!Array.isArray(periodParcels)) return []
    const limits: Record<string, number> = { 'Initialisé': 24, 'En transit': 48, 'Arrivé en agence': 24, 'En cours de livraison': 12 }
    return periodParcels
      .filter((p: any) => limits[p.status])
      .map((p: any) => {
        const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
        const ageHours = Math.round((Date.now() - d.getTime()) / 3.6e6)
        const limit = limits[p.status] || 48
        return { parcel: p, ageHours, overdue: Math.max(0, ageHours - limit), type: 'delay' }
      })
      .filter((a: any) => a.ageHours > (limits[a.parcel.status] || 48))
  }, [periodParcels])

  const codAlerts = useMemo(() => {
    if (!Array.isArray(periodParcels)) return []
    return periodParcels
      .filter((p: any) => p.codStatus === 'collected' && parseFloat(p.codAmount) > 0 && !p.codSenderPaid)
      .map((p: any) => {
        const d = p.codCollectedAt ? new Date(p.codCollectedAt) : new Date(p.createdAt || 0)
        return { parcel: p, ageHours: Math.round((Date.now() - d.getTime()) / 3.6e6), type: 'cod' }
      })
  }, [periodParcels])

  const returnParcels = useMemo(() => {
    if (!Array.isArray(periodParcels)) return []
    return periodParcels.filter((p: any) => p.status === 'Retourné' || p.returnToCity || p.returnOf)
  }, [periodParcels])

  const visibleAlerts = useMemo(() => {
    if (!Array.isArray(delayedAlerts) || !Array.isArray(codAlerts)) return []
    const all = [...delayedAlerts, ...codAlerts]
    if (alertFilter === 'delay') return delayedAlerts
    if (alertFilter === 'cod')   return codAlerts
    return all
  }, [delayedAlerts, codAlerts, alertFilter])

  const exportRows = useMemo(() => ({
    expeditions: Array.isArray(periodParcels) ? periodParcels.map((p: any) => ({
      tracking: p.trackingId, status: p.status, expediteur: p.sender?.name, destinataire: p.receiver?.name,
      origine: p.originCity, destination: p.destinationCity, poids: p.weight, nbColis: p.nbColis,
      cod: p.codAmount, portType: p.portType, prix: p.price,
    })) : [],
    cod: Array.isArray(filteredCod) ? filteredCod.map((p: any) => ({
      tracking: p.trackingId, destinataire: p.receiver?.name, ville: p.receiver?.city,
      montant: p.codAmount, statut: p.codStatus, mode: p.codPaymentType,
    })) : [],
    retours: Array.isArray(returnParcels) ? returnParcels.map((p: any) => ({ tracking: p.trackingId, status: p.status, motif: p.returnReason, destinataire: p.receiver?.name })) : [],
    agences: Array.isArray(agencyStats) ? agencyStats.map((a: any) => ({ ville: a.city, entrants: a.incoming.length, sortants: a.outgoing.length, livres: a.delivered.length, retours: a.returned.length })) : [],
    alertes: Array.isArray(visibleAlerts) ? visibleAlerts.map((a: any) => ({ tracking: a.parcel.trackingId, type: a.type, age: a.ageHours + 'h', statut: a.parcel.status })) : [],
  }), [periodParcels, filteredCod, returnParcels, agencyStats, visibleAlerts])

  // 🚀 NOUVEAU: Hook de recherche professionnel avec Fuse.js
  // ⚡ Optimisations:
  // - Détection automatique recherche numérique (N° EXP)
  // - Scoring intelligent (préfixe exact prioritaire pour numéros)
  // - Debounce intégré (300ms) pour performance
  // - 14 champs indexés avec poids optimaux
  const {
    search: fuseSearchValue,
    setSearch: setFuseSearch,
    debouncedSearch: fuseDebouncedSearch,
    results: fuseResults,
    detailedResults: fuseDetailedResults,
    isSearching: fuseIsSearching,
    totalResults: fuseTotalResults,
  } = useFuseSearch({
    items: periodParcels || [],
    keys: ADMIN_SEARCH_CONFIG.keys,
    threshold: ADMIN_SEARCH_CONFIG.threshold,
    debounceMs: ADMIN_SEARCH_CONFIG.debounceMs,
    limit: ADMIN_SEARCH_CONFIG.limit,
  })

  // ✅ Alias pour compatibilité avec le reste du code
  const search = fuseSearchValue
  const setSearch = setFuseSearch
  const debouncedSearch = fuseDebouncedSearch
  const isSearching = fuseIsSearching

  // ⚡ Détecter si recherche active - MAIS sans charger 2000 colis
  // On garde isSearchActive pour la logique, mais loadLimit reste à 500
  useEffect(() => {
    const hasSearch = fuseDebouncedSearch.trim() !== ''
    setIsSearchActive(hasSearch)
  }, [fuseDebouncedSearch])

  // 🔍 RECHERCHE SERVEUR: searchParcels dans toute la base
  // Note: Cette recherche est lancée en parallèle de Fuse.js local
  // Fuse.js donne des résultats instantanés, puis searchParcels cherche dans toute la base
  useEffect(() => {
    if (!fuseDebouncedSearch || fuseDebouncedSearch.trim().length === 0) {
      setServerSearchResults(null)
      return
    }

    let cancelled = false

    // Lancer recherche serveur immédiatement pour chercher dans TOUTE la base (actifs + archives)
    searchParcels(fuseDebouncedSearch.trim(), { limit: 50000, includeArchived: true })
      .then(results => {
        if (!cancelled) {
          setServerSearchResults(results)
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('❌ Erreur searchParcels:', error)
          setServerSearchResults(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fuseDebouncedSearch])

  const filtered = useMemo(() => {
    if (!Array.isArray(periodParcels)) return []

    // 🔍 STRATÉGIE SIMPLE ET EFFICACE:
    // 1️⃣ Si recherche serveur disponible → utiliser ça (TOUTE la base)
    // 2️⃣ Sinon utiliser Fuse.js dans les 2000 chargés (fallback)
    // 3️⃣ Sinon afficher tous les periodParcels
    let results = periodParcels

    if (debouncedSearch.trim()) {
      // 🔍 STRATÉGIE OPTIMISÉE:
      // 1️⃣ Recherche serveur si disponible (toute la base)
      // 2️⃣ Sinon résultats Fuse.js optimisés (scoring intelligent)
      if (serverSearchResults !== null) {
        results = serverSearchResults
        console.log(`✅ Serveur: ${results.length} résultats (toute la base)`)
      } else {
        // ⚡ NOUVEAU: Utiliser résultats du hook professionnel
        // Scoring automatique (préfixe exact prioritaire pour numéros)
        results = fuseResults
        console.log(`🔍 Fuse.js PRO: ${fuseTotalResults} résultats sur ${periodParcels.length} colis (${fuseIsSearching ? 'recherche...' : 'terminé'})`)
      }
    }

    // Appliquer les autres filtres (ville, driver, statut)
    results = results.filter((p: any) => {
      // Filtre par ville
      if (cityFilter !== 'Toutes') {
        const cityMatch = p.originCity === cityFilter || p.destinationCity === cityFilter || p.sender?.city === cityFilter || p.receiver?.city === cityFilter
        if (!cityMatch) return false
      }

      // Filtre par livreur/chauffeur
      if (driverFilter !== 'Tous') {
        const driverMatch = p.deliveryDriverId === driverFilter || p.chauffeurId === driverFilter
        if (!driverMatch) return false
      }

      // Filtre statut multi-select
      if (statusFilter.length > 0) {
        // Logique : "Retourné" inclut tous les statuts du circuit retour
        if (statusFilter.includes('Retourné')) {
          const returnStatuses = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
          if (returnStatuses.includes(p.status)) return true
        }
        // Match exact pour les autres statuts
        if (!statusFilter.includes(p.status)) return false
      }

      // Filtre type de service multi-select
      if (serviceTypeFilter.length > 0) {
        const serviceTypes = p.serviceType?.split(',').filter(Boolean) || ['simple']
        const hasMatch = serviceTypes.some((st: string) => serviceTypeFilter.includes(st))
        if (!hasMatch) return false
      }

      if (portTypeFilter.length > 0 && !portTypeFilter.includes(p.portType)) {
        return false
      }

      return true
    })

    // ✅ SUPPRIMÉ: Tri numérique manuel (maintenant géré automatiquement par useFuseSearch)
    // Le hook détecte les recherches numériques et applique scoring intelligent:
    // - Préfixe exact (^123): score 1000
    // - Contient: score 100
    // Résultats déjà triés par pertinence ⚡

    // 2️⃣ Si recherche serveur → appliquer tri manuel (fallback)
    if (serverSearchResults !== null && debouncedSearch && /^[0-9]+$/.test(debouncedSearch.trim())) {
      const searchNum = debouncedSearch.trim().toUpperCase()
      results.sort((a, b) => {
        const scoreA = (a.trackingId === searchNum || a.senderNic === searchNum ? 1000 : 0) +
                       (a.trackingId?.startsWith(searchNum) || a.senderNic?.startsWith(searchNum) ? 100 : 0) +
                       (a.trackingId?.includes(searchNum) || a.senderNic?.includes(searchNum) ? 10 : 0)
        const scoreB = (b.trackingId === searchNum || b.senderNic === searchNum ? 1000 : 0) +
                       (b.trackingId?.startsWith(searchNum) || b.senderNic?.startsWith(searchNum) ? 100 : 0) +
                       (b.trackingId?.includes(searchNum) || b.senderNic?.includes(searchNum) ? 10 : 0)
        return scoreB - scoreA
      })
    }

    return results
  }, [periodParcels, cityFilter, driverFilter, statusFilter, serviceTypeFilter, portTypeFilter, debouncedSearch, fuseResults, fuseTotalResults, fuseIsSearching, serverSearchResults])

  // Expéditions affichées avec limite (200 premiers)
  const displayedFiltered = useMemo(() => {
    return filtered.slice(0, displayLimit)
  }, [filtered, displayLimit])

  // Fonction pour charger plus d'expéditions
  const loadMoreDisplayed = () => {
    setDisplayLimit(prev => prev + DISPLAY_LIMIT)
  }

  // Fonction pour tout afficher
  const showAllDisplayed = () => {
    setDisplayLimit(filtered.length)
  }

  // Réinitialiser la limite quand les filtres changent
  useEffect(() => {
    setDisplayLimit(DISPLAY_LIMIT)
  }, [cityFilter, driverFilter, statusFilter, serviceTypeFilter, portTypeFilter, debouncedSearch])

  const handleAdjustCentralCash = async () => {
    const amount = parseFloat(centralCashForm.amount)
    if (!amount || amount <= 0) {
      setCentralCashError('Montant invalide')
      return
    }
    if (!centralCashForm.reason.trim()) {
      setCentralCashError('Raison obligatoire')
      return
    }

    setCentralCashLoading(true)
    setCentralCashError('')
    try {
      const delta = centralCashForm.operation === 'add' ? amount : -amount
      const data: any = {
        soldeDelta: delta,
        lastUpdatedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
        reason: centralCashForm.reason,
      }

      // Appliquer selon le type
      if (centralCashForm.type === 'especes') {
        data.especesDelta = delta
      } else if (centralCashForm.type === 'cheques') {
        data.chequesDelta = delta
      } else if (centralCashForm.type === 'virement') {
        data.virementDelta = delta
      }

      await adjustCentralCash(data)
      setCentralCashModal(false)
      setCentralCashForm({ amount: '', type: 'especes', operation: 'add', reason: '' })
    } catch (err: any) {
      setCentralCashError(err.message || 'Erreur lors de l\'ajustement')
    } finally {
      setCentralCashLoading(false)
    }
  }

  const handleResetCentralCash = async () => {
    setResetCentralCashLoading(true)
    try {
      await resetCentralCashToZero(auth.currentUser?.displayName || auth.currentUser?.email || 'Admin')
      setResetCentralCashModal(false)
      alert('✅ Caisse Centrale réinitialisée à 0 DH!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setResetCentralCashLoading(false)
    }
  }

  const handleSuperReset = async () => {
    setSuperResetLoading(true)
    try {
      await resetEverythingToZero(auth.currentUser?.displayName || auth.currentUser?.email || 'Admin')
      setSuperResetModal(false)
      alert('🔥 SUPER RESET EFFECTUÉ!\n\n✅ Caisse Centrale: 0 DH\n✅ Toutes les caisses d\'agences: 0 DH\n✅ Tous les versements livreurs supprimés!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setSuperResetLoading(false)
    }
  }

  const handleDeleteParcel = async (parcelId: string) => {
    // Premi�re clique : demander confirmation
    if (deleteConfirm !== parcelId) {
      setDeleteConfirm(parcelId)
      setTimeout(() => setDeleteConfirm(null), 3000) // Reset apr�s 3 secondes
      return
    }

    // Deuxi�me clique : supprimer
    setDeleting(parcelId)
    try {
      await deleteParcel(parcelId)
      setDeleteConfirm(null)
      alert('✅ Expédition supprimée avec succès')
      // Les parcels seront automatiquement mis à jour par le listener
    } catch (error: any) {
      alert('❌ Erreur : ' + (error.message || 'Impossible de supprimer l\'expédition'))
    } finally {
      setDeleting(null)
    }
  }

  const activityFeed = useMemo(() => {
    // Protection: s'assurer que periodDirectorLogs est un tableau
    if (!Array.isArray(periodDirectorLogs)) return []
    const logDate = (l: any) => l.timestamp?.toDate ? l.timestamp.toDate() : l.timestamp ? new Date(l.timestamp) : new Date(0)
    return periodDirectorLogs
      .map((l: any) => ({
        ts:        logDate(l).getTime(),
        date:      logDate(l),
        userId:    l.uid,
        userName:  l.userName || l.userEmail || 'Utilisateur',
        role:      l.userRole || '',
        city:      l.city || '',
        action:    l.action || '',
        title:     l.actionLabel || l.action || '',
        reference: l.parcelId || l.targetId || '',
        details:   l.details || {},
      }))
      .sort((a: any, b: any) => b.ts - a.ts)
  }, [periodDirectorLogs])

  const getArchiveDays = (modal: any) => modal?.days === 'custom' ? parseInt(modal.customDays, 10) : Number(modal?.days || 0)
  const getArchivePreviewCount = (modal: any) => {
    const days = getArchiveDays(modal)
    if (!days || !modal?.city) return 0
    if (!Array.isArray(allParcels)) return 0
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); cutoff.setHours(0,0,0,0)
    return allParcels.filter((p: any) => {
      if (modal.city !== 'Toutes' && p.originCity !== modal.city) return false
      if (!modal.statuses?.includes(p.status)) return false
      const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
      return d < cutoff
    }).length
  }


  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <CompanyContact />

      {/* Section */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                <LayoutDashboard className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Dashboard Admin</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <WorkingDateIndicator />
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Temps réel
              </span>
              <button onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition">
                <LogOut className="w-4 h-4" /> Déconnexion
              </button>
              <button onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition">
                {menuOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
              </button>
            </div>
          </div>

          {/* Breadcrumb quand on est dans une section */}
          {mainTab !== 'home' && (
            <div className="hidden md:flex border-t border-gray-50 items-center gap-2 py-2.5 px-1">
              <button onClick={() => setMainTab('home')}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition font-medium">
                <ChevronDown className="w-4 h-4 rotate-90" /> Accueil
              </button>
              <span className="text-gray-200 font-light">/</span>
              <span className="text-sm font-bold text-blue-600">
                {{ expeditions:'Expéditions', cod:'RETOUR FOND', users:'Utilisateurs', activity:'Activité', agencies:'Agences', alerts:'Alertes', tariffs:'Tarifs', returns:'Retours', lostparcels:'Colis perdus', clients:'Clients', exports:'Exports', caisse:'Caisse', versements:'Versements Admin', employees:'Dossiers RH', reglements:'Règlements', notes:'Notes agents', utilities:'Utilitaires' }[mainTab] || mainTab}
              </span>
            </div>
          )}

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 space-y-1">
              <button onClick={() => { setMainTab('home'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                ?? <span>Accueil</span>
              </button>
              {[
                { key: 'expeditions', label: 'Expéditions',         icon: Package   },
                { key: 'cod',         label: 'RETOUR FOND / Remboursement', icon: Wallet    },
                { key: 'port_agencies', label: '📮 Port par agence', icon: Building2 },
                { key: 'archivage',   label: '🗄️ Archives',          icon: Archive   },
                { key: 'users',       label: 'Utilisateurs',         icon: Users     },
                { key: 'activity',    label: 'Activité',             icon: BarChart2 },
                { key: 'agencies',    label: 'Agences',              icon: Building2 },
                { key: 'alerts',      label: 'Alertes',              icon: AlertTriangle },
                { key: 'tariffs',     label: 'Tarifs',               icon: Calculator },
                { key: 'returns',     label: 'Retours',              icon: RotateCcw },
                { key: 'lostparcels', label: 'Colis perdus',         icon: AlertTriangle },
                { key: 'clients',     label: 'Clients',              icon: Users },
                { key: 'exports',     label: 'Exports',              icon: Download },
                { key: 'caisse',      label: 'Caisse',               icon: Wallet    },
                { key: 'versements',  label: '💰 Versements Admin',  icon: Banknote  },
                { key: 'employees',   label: 'Dossiers RH',          icon: FileText  },
                { key: 'reglements',  label: 'Règlements',            icon: Banknote  },
                { key: 'banque',      label: 'Banque RETOUR FOND',    icon: Building2 },
                { key: 'notes',       label: 'Notes agents',          icon: Star      },
                { key: 'utilities',   label: '🔧 Utilitaires',        icon: Settings  },
                { key: 'permissions', label: '🔐 Permissions',        icon: ShieldCheck },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setMainTab(key); setMenuOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition ${
                    mainTab === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{label}</span>
                  {key === 'cod' && codStats.collectedDH > 0 && (
                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">{fmt(codStats.collectedDH)} DH</span>
                  )}
                </button>
              ))}
              <button onClick={() => { navigate('/fleet'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                <Car className="w-5 h-5" /> Parc véhicules
              </button>
              <button onClick={() => { navigate('/dashboard'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                <TrendingUp className="w-5 h-5" /> Tableau de bord
              </button>
              <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Temps réel
                </span>
                <button onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 py-1 transition">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 pb-16">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Période admin</p>
                <p className="text-sm font-bold text-gray-800 truncate">{periodLabel}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center lg:ml-auto">
              {[
                { key: 'all',    label: 'Tout' },
                { key: 'today',  label: "Aujourd'hui" },
                { key: 'week',   label: '7 derniers jours' },
                { key: 'month',  label: 'Ce mois' },
                { key: 'custom', label: 'Personnalisé' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setAdminDatePreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    adminDatePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >{label}</button>
              ))}
              {adminDatePreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={adminDateFrom} onChange={e => setAdminDateFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-gray-400 text-xs">?</span>
                  <input type="date" value={adminDateTo} onChange={e => setAdminDateTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1">
                {periodParcels.length} colis à {periodUsers.length} utilisateurs
              </span>
            </div>
          </div>
        </div>

        {/* Section */}
        {mainTab === 'home' && (
          <Suspense fallback={<div className="mt-6 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminHomeTab
              periodParcels={periodParcels}
              periodUsers={periodUsers}
              users={users}
              codStats={codStats}
              agencyStats={agencyStats}
              caisseEntries={caisseEntries}
              adminRapports={adminRapports}
              allBankDeposits={allBankDeposits}
              returnParcels={returnParcels}
              delayedAlerts={delayedAlerts}
              codAlerts={codAlerts}
              lockPanelOpen={lockPanelOpen}
              setLockPanelOpen={setLockPanelOpen}
              operationLocks={operationLocks}
              lockBusy={lockBusy}
              backupBusy={backupBusy}
              backupMessage={backupMessage}
              realStats={realStats}
              onRefreshStats={loadRealStats}
              importPreview={importPreview}
              setImportPreview={setImportPreview}
              handleExportBackup={handleExportBackup}
              handleBackupFile={handleBackupFile}
              handleConfirmImportBackup={handleConfirmImportBackup}
              handleToggleGlobalLock={handleToggleGlobalLock}
              handleToggleAgencyLock={handleToggleAgencyLock}
              setMainTab={setMainTab}
              navigate={navigate}
            />
          </Suspense>
        )}

        {/* TAB: EXPEDITIONS */}
        {mainTab === 'expeditions' && (
          <Suspense fallback={<div className="py-10 text-center text-sm text-gray-400">Chargement des expeditions...</div>}>
            <AdminExpeditionsTab
              kpis={kpis}
              search={search}
              setSearch={setSearch}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              driverFilter={driverFilter}
              setDriverFilter={setDriverFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              serviceTypeFilter={serviceTypeFilter}
              setServiceTypeFilter={setServiceTypeFilter}
              portTypeFilter={portTypeFilter}
              setPortTypeFilter={setPortTypeFilter}
              users={users}
              datePreset={datePreset}
              setDatePreset={setDatePreset}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              filtered={displayedFiltered}
              totalFiltered={filtered.length}
              displayLimit={displayLimit}
              loadMoreDisplayed={loadMoreDisplayed}
              showAllDisplayed={showAllDisplayed}
              loading={loading}
              setCodEditModal={setCodEditModal}
              setNicEditModal={setNicEditModal}
              setNewParcelModal={setNewParcelModal}
              setStatusModal={setStatusModal}
              openAdminEdit={openAdminEdit}
              allParcels={allParcels}
              hasMore={hasMore}
              loadMoreParcels={loadMoreParcels}
              loadingMore={loadingMore}
              openArchiveModal={openArchiveModal}
              selectCls={selectCls}
              handleDeleteParcel={handleDeleteParcel}
              deleteConfirm={deleteConfirm}
              deleting={deleting}
            />
          </Suspense>
        )}

        {/* TAB: RETOUR */}
        {mainTab === 'cod' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminCodTab
              codDatePreset={codDatePreset}
              codDateFrom={codDateFrom}
              codDateTo={codDateTo}
              setCodDatePreset={setCodDatePreset}
              setCodDateFrom={setCodDateFrom}
              setCodDateTo={setCodDateTo}
              codDateFiltered={codDateFiltered}
              codStatsFiltered={codStatsFiltered}
              codFilter={codFilter}
              setCodFilter={setCodFilter}
              codSearch={codSearch}
              setCodSearch={setCodSearch}
              codRequestMsg={codRequestMsg}
              codRequestDrafts={codRequestDrafts}
              setCodRequestDrafts={setCodRequestDrafts}
              codRequestBusy={codRequestBusy}
              agentCodRequests={agentCodRequests}
              filteredCod={filteredCod}
              adminEmail={auth.currentUser?.email || 'Admin'}
              handleBatchSettleAdmin={handleBatchSettleAdmin}
              handleRemitCod={handleRemitCod}
              handleSettleCodAdmin={handleSettleCodAdmin}
              handleSendCodRequest={handleSendCodRequest}
              handleReplyAgentCodRequest={handleReplyAgentCodRequest}
              resolveAgentCodRequest={resolveAgentCodRequest}
            />
          </Suspense>
        )}

        {/* TAB: AGENCES */}
        {mainTab === 'agencies' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminAgenciesTab
              agencyStats={agencyStats}
              periodLabel={periodLabel}
              exportRows={exportRows}
              downloadCsv={downloadCsv}
              backupBusy={backupBusy}
              backupMessage={backupMessage}
              importPreview={importPreview}
              setImportPreview={setImportPreview}
              handleExportBackup={handleExportBackup}
              handleBackupFile={handleBackupFile}
              handleConfirmImportBackup={handleConfirmImportBackup}
            />
          </Suspense>
        )}

        {/* TAB: ALERTES */}
        {mainTab === 'alerts' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminAlertsTab
              delayedAlerts={delayedAlerts}
              codAlerts={codAlerts}
              visibleAlerts={visibleAlerts}
              alertFilter={alertFilter}
              setAlertFilter={setAlertFilter}
              clientMessages={clientMessages}
              clientReplyDrafts={clientReplyDrafts}
              setClientReplyDrafts={setClientReplyDrafts}
              exportRows={exportRows}
              adminEmail={auth.currentUser?.email || 'Admin'}
              downloadCsv={downloadCsv}
              handleRemitCod={handleRemitCod}
              handleDeleteClientMessage={handleDeleteClientMessage}
              handleReplyClientMessage={handleReplyClientMessage}
              resolveClientMessage={resolveClientMessage}
            />
          </Suspense>
        )}

        {/* TAB: TARIFS */}
        {mainTab === 'tariffs' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminTariffsTab
              tariffDraft={tariffDraft}
              setTariffDraft={setTariffDraft}
              tariffSaving={tariffSaving}
              tariffMessage={tariffMessage}
              handleSaveTariffs={handleSaveTariffs}
              handleResetTariffs={handleResetTariffs}
              updateTariffCityPrice={updateTariffCityPrice}
              updateTariffWeightRule={updateTariffWeightRule}
            />
          </Suspense>
        )}

        {/* TAB: RETOURS */}
        {mainTab === 'returns' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminReturnsTab
              returnParcels={returnParcels}
              exportRows={exportRows}
              downloadCsv={downloadCsv}
              setReturnModal={setReturnModal}
            />
          </Suspense>
        )}

        {/* TAB: COLIS PERDUS */}
        {mainTab === 'lostparcels' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminLostParcelsTab />
          </Suspense>
        )}

        {/* TAB: CLIENTS */}
        {mainTab === 'clients' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminClientsTab />
          </Suspense>
        )}

        {/* TAB: EXPORTS */}
        {mainTab === 'exports' && (
          <Suspense fallback={<div className="mt-4 h-72 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminExportsTab
              periodLabel={periodLabel}
              exportRows={exportRows}
              downloadCsv={downloadCsv}
              backupBusy={backupBusy}
              backupMessage={backupMessage}
              importPreview={importPreview}
              setImportPreview={setImportPreview}
              handleExportBackup={handleExportBackup}
              handleBackupFile={handleBackupFile}
              handleConfirmImportBackup={handleConfirmImportBackup}
            />
          </Suspense>
        )}

        {/* TAB: CAISSE */}
        {mainTab === 'caisse' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminCaisseTab
              caisseEntries={caisseEntries}
              caisseClotures={caisseClotures}
              agencyCashes={agencyCashes}
              updateAgencyCash={updateAgencyCash}
              users={users}
              allRemarks={allRemarks}
              adminDatePreset={adminDatePreset}
              adminDateFrom={adminDateFrom}
              adminDateTo={adminDateTo}
              caisseCityFilter={caisseCityFilter}
              setCaisseCityFilter={setCaisseCityFilter}
              caisseTypeFilter={caisseTypeFilter}
              setCaisseTypeFilter={setCaisseTypeFilter}
              clotureModal={clotureModal}
              setClotureModal={setClotureModal}
              clotureLoading={clotureLoading}
              setClotureLoading={setClotureLoading}
              clotureError={clotureError}
              setClotureError={setClotureError}
              remarkCityFilter={remarkCityFilter}
              setRemarkCityFilter={setRemarkCityFilter}
              remarkFilter={remarkFilter}
              setRemarkFilter={setRemarkFilter}
              centralCash={centralCash}
              setResetCentralCashModal={setResetCentralCashModal}
              setSuperResetModal={setSuperResetModal}
            />
          </Suspense>
        )}

        {/* TAB: VERSEMENTS ADMIN */}
        {mainTab === 'versements' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminVersementsTab
              adminTransfers={adminTransfers}
              confirmAdminTransfer={confirmAdminTransfer}
              rejectAdminTransfer={rejectAdminTransfer}
              createAdminTransferDirect={createAdminTransferDirect}
              updateAdminTransfer={updateAdminTransfer}
              deleteAdminTransfer={deleteAdminTransfer}
              auth={auth}
            />
          </Suspense>
        )}

        {/* TAB: UTILISATEURS */}
        {mainTab === 'users' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminUsersTab
              filteredUsers={filteredUsers}
              periodUsers={periodUsers}
              loadingUsers={loadingUsers}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              ROLES={ROLES}
              EMPTY_CREATE={EMPTY_CREATE}
              setCreateModal={setCreateModal}
              setCreateError={setCreateError}
              usersDatePreset={usersDatePreset}
              setUsersDatePreset={setUsersDatePreset}
              usersDateFrom={usersDateFrom}
              setUsersDateFrom={setUsersDateFrom}
              usersDateTo={usersDateTo}
              setUsersDateTo={setUsersDateTo}
              copyMessage={copyMessage}
              makeClientPortalLink={makeClientPortalLink}
              handleCopyClientPortalLink={handleCopyClientPortalLink}
              setUserEditTab={setUserEditTab}
              setPwdForm={setPwdForm}
              setUserEdit={setUserEdit}
              handleToggleBlock={handleToggleBlock}
              setDeleteConfirmUser={setDeleteConfirmUser}
            />
          </Suspense>
        )}

        {/* TAB: ACTIVITÉ */}
        {mainTab === 'activity' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminActivityTab
              activityRoleFilter={activityRoleFilter}
              setActivityRoleFilter={setActivityRoleFilter}
              activityDatePreset={activityDatePreset}
              setActivityDatePreset={setActivityDatePreset}
              activityDateFrom={activityDateFrom}
              setActivityDateFrom={setActivityDateFrom}
              activityDateTo={activityDateTo}
              setActivityDateTo={setActivityDateTo}
              activityStats={Array.isArray(activityStats) ? activityStats : []}
              activityFeed={Array.isArray(activityFeed) ? activityFeed : []}
              users={Array.isArray(users) ? users : []}
              periodDirectorLogs={Array.isArray(periodDirectorLogs) ? periodDirectorLogs : []}
              setDirectorLogsModal={setDirectorLogsModal}
              setDriverPortDuModal={setDriverPortDuModal}
              setPortDuForm={setPortDuForm}
              setPortDuError={setPortDuError}
              setUserActivityModal={setUserActivityModal}
              setUserDetailTab={setUserDetailTab}
            />
          </Suspense>
        )}

        {/* TAB: DOSSIERS */}
        {mainTab === 'employees' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminEmployeesTab
              users={users}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              roles={ROLES}
              caisseEntries={caisseEntries}
              openSalaryPayment={openSalaryPayment}
              setUserEditTab={setUserEditTab}
              setUserEdit={setUserEdit}
              rhRequests={allRhRequests}
              onCompleteRhRequest={handleCompleteRhRequest}
            />
          </Suspense>
        )}

        {/* TAB: RÈGLEMENTS */}
        {mainTab === 'reglements' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminReglementsTab
              adminReglements={adminReglements}
              adminRapports={adminRapports}
              parcels={parcels}
              rgAgenceFilter={rgAgenceFilter}
              setRgAgenceFilter={setRgAgenceFilter}
              rgModeFilter={rgModeFilter}
              setRgModeFilter={setRgModeFilter}
              rgStatusFilter={rgStatusFilter}
              setRgStatusFilter={setRgStatusFilter}
              rgPointeurFilter={rgPointeurFilter}
              setRgPointeurFilter={setRgPointeurFilter}
              rgDatePreset={rgDatePreset}
              setRgDatePreset={setRgDatePreset}
              rgDateFrom={rgDateFrom}
              setRgDateFrom={setRgDateFrom}
              rgDateTo={rgDateTo}
              setRgDateTo={setRgDateTo}
              rgSearch={rgSearch}
              setRgSearch={setRgSearch}
              rgTab={rgTab}
              setRgTab={setRgTab}
              rapportValidating={rapportValidating}
              setRapportValidating={setRapportValidating}
              rapportNoteInput={rapportNoteInput}
              setRapportNoteInput={setRapportNoteInput}
            />
          </Suspense>
        )}

        {/* TAB: BANQUE */}
        {mainTab === 'banque' && (
          <>
            <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
              <AdminBanqueTab
                allBankDeposits={allBankDeposits}
                centralCodDeposits={centralCodDeposits}
                centralSupplierPayments={centralSupplierPayments}
                centralCash={centralCash}
                onOpenCentralCashModal={() => setCentralCashModal(true)}
              bankCityFilter={bankCityFilter}
              setBankCityFilter={setBankCityFilter}
              bankDatePreset={bankDatePreset}
              setBankDatePreset={setBankDatePreset}
              bankDateFrom={bankDateFrom}
              setBankDateFrom={setBankDateFrom}
              bankDateTo={bankDateTo}
              setBankDateTo={setBankDateTo}
              bankSearch={bankSearch}
              setBankSearch={setBankSearch}
              bankConfirmBusy={bankConfirmBusy}
              setBankConfirmBusy={setBankConfirmBusy}
              setBankDeleteConfirm={setBankDeleteConfirm}
              />
            </Suspense>
          </>
        )}

        {/* TAB: NOTES AGENTS */}
        {mainTab === 'notes' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminNotesTab
              agentNotes={agentNotes}
              users={users}
            />
          </Suspense>
        )}

        {/* TAB: UTILITAIRES */}
        {mainTab === 'utilities' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminUtilitiesTab />
          </Suspense>
        )}

        {/* TAB: PERMISSIONS */}
        {mainTab === 'permissions' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminPermissionsTab />
          </Suspense>
        )}

        {/* TAB: PORT PAR AGENCE */}
        {mainTab === 'port_agencies' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminPortAgenciesTab
              datePreset={datePreset}
              setDatePreset={setDatePreset}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
          </Suspense>
        )}

        {/* TAB: ARCHIVAGE */}
        {mainTab === 'archivage' && (
          <Suspense fallback={<div className="mt-4 h-96 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
            <AdminArchivageTab />
          </Suspense>
        )}

      </main>

      {/* Modal suppression versement banque */}
      {bankDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => setBankDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-800">Supprimer ce versement ?</h3>
              <p className="text-xs text-gray-500 mt-1">Cette action est irréversible.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBankDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={() => handleDeleteBankDeposit(bankDeleteConfirm)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAIEMENT */}
      {salaryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800">
                  {salaryModal.category === 'salaire' ? 'Paiement salaire' : 'Avance sur salaire'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {salaryModal.employee.name} ◆ {ROLES.find(r => r.key === salaryModal.employee.role)?.label || salaryModal.employee.role}
                </p>
              </div>
              <button onClick={() => setSalaryModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {salaryModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {salaryModal.error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Salaire mensuel</p>
                  <p className="font-black text-gray-800">{fmt(parseFloat(salaryModal.employee.salaire || 0) || 0)} DH</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Agence</p>
                  <p className="font-bold text-gray-800">{salaryModal.employee.city || '�'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">MOIS CONCERNÉ</label>
                <input
                  type="month"
                  value={salaryModal.month}
                  onChange={e => setSalaryModal((m: any) => ({ ...m, month: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">MONTANT PAYÉ (DH)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salaryModal.amount}
                  onChange={e => setSalaryModal((m: any) => ({ ...m, amount: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">RÉFÉRENCE</label>
                <input
                  value={salaryModal.reference}
                  onChange={e => setSalaryModal((m: any) => ({ ...m, reference: e.target.value }))}
                  placeholder="N° reçu, virement, bon de caisse..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note</label>
                <textarea
                  rows={3}
                  value={salaryModal.note}
                  onChange={e => setSalaryModal((m: any) => ({ ...m, note: e.target.value }))}
                  placeholder="Observation RH ou mode de paiement..."
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSalaryModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleSalaryPayment} disabled={salaryModal.loading}
                  className="py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold transition flex items-center justify-center gap-2">
                  {salaryModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi...</>
                    : <><Banknote className="w-4 h-4" /> Envoyer au caissier</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOTIF */}
      {archiveModal && (() => {
        const days = getArchiveDays(archiveModal)
        const previewCount = getArchivePreviewCount(archiveModal)
        const periodOptions = [
          { value: 7, label: '7 jours' },
          { value: 15, label: '15 jours' },
          { value: 30, label: '30 jours' },
          { value: 60, label: '60 jours' },
          { value: 90, label: '90 jours' },
          { value: 180, label: '180 jours' },
          { value: 'custom', label: 'Personnalisé' },
        ]
        return (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h3 className="font-bold text-gray-800">Archive locale des expeditions</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Cree un fichier local. Rien n'est envoye ni supprime dans le cloud.</p>
                </div>
                <button onClick={() => setArchiveModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                {archiveModal.error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{archiveModal.error}</div>
                )}
                {archiveModal.result !== null && (
                  <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl text-sm font-semibold">
                    {archiveModal.result === 0 ? 'Aucune expedition a archiver pour ces criteres.' : `${archiveModal.result} expedition(s) archivee(s) localement.`}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Ville</label>
                  <select value={archiveModal.city} onChange={e => setArchiveModal((m: any) => ({ ...m, city: e.target.value, result: null, error: '' }))} className={selectCls}>
                    <option value="Toutes">Toutes les villes</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Statuts a archiver</label>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => {
                      const active = archiveModal.statuses.includes(s)
                      const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                      return (
                        <button key={s} type="button" onClick={() => toggleArchiveStatus(s)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${active ? `${sc.bg} ${sc.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Periode</label>
                  <div className="flex flex-wrap gap-2">
                    {periodOptions.map(opt => (
                      <button key={String(opt.value)} type="button" onClick={() => setArchiveModal((m: any) => ({ ...m, days: opt.value, result: null, error: '' }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${archiveModal.days === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {archiveModal.days === 'custom' && (
                    <input type="number" min="1" value={archiveModal.customDays}
                      onChange={e => setArchiveModal((m: any) => ({ ...m, customDays: e.target.value, result: null, error: '' }))}
                      placeholder="Nombre de jours"
                      className={`${inputCls} mt-3`}
                    />
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-800">Apercu de l'archive locale</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Statuts: {archiveModal.statuses.join(', ') || '-'} - plus ancien que {days || 0} jour(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900">{previewCount}</p>
                      <p className="text-xs text-gray-400">visible(s)</p>
                    </div>
                  </div>
                  {archiveModal.loading && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${archiveProgress.total ? Math.round((archiveProgress.done / archiveProgress.total) * 100) : 20}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Preparation locale... {archiveProgress.done}/{archiveProgress.total}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setArchiveModal(null)} disabled={archiveModal.loading}
                    className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-60 transition">
                    Annuler
                  </button>
                  <button onClick={handleArchiveParcels} disabled={archiveModal.loading || !days || !archiveModal.statuses.length}
                    className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold transition flex items-center justify-center gap-2">
                    {archiveModal.loading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Preparation...</>
                      : 'Archiver localement'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {returnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800">Motif du retour</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{returnModal.parcel.trackingId}</p>
              </div>
              <button onClick={() => setReturnModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {returnModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{returnModal.error}</div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Motif</label>
                <select value={returnModal.reason} onChange={e => setReturnModal((m: any) => ({ ...m, reason: e.target.value }))}
                  className={selectCls}>
                  {RETURN_REASONS.map(reason => <option key={reason}>{reason}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note</label>
                <textarea value={returnModal.note} onChange={e => setReturnModal((m: any) => ({ ...m, note: e.target.value }))}
                  rows={3}
                  placeholder="Ex : client absent deux fois, téléphone injoignable..."
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setReturnModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleReturnSave} disabled={returnModal.loading}
                  className="py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2">
                  {returnModal.loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RETOUR FOND */}
      {codEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Banknote className="w-4 h-4 text-orange-500" /> Modifier le RETOUR FOND</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{codEditModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">{codEditModal.parcel.receiver?.name} ◆ {codEditModal.parcel.receiver?.city}</p>
              </div>
              <button onClick={() => setCodEditModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {codEditModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {codEditModal.error}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Montant RETOUR FOND (DH)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={codEditModal.value}
                  onChange={e => setCodEditModal((m: any) => ({ ...m, value: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveCodAmount()}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none bg-gray-50 focus:bg-white transition font-bold text-orange-600"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Mettre 0 pour supprimer le RETOUR FOND.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setCodEditModal(null)}
                  className="py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm"
                >Annuler</button>
                <button onClick={handleSaveCodAmount} disabled={codEditModal.loading}
                  className="py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold transition text-sm disabled:opacity-50"
                >{codEditModal.loading ? 'Sauvegarde...' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL N° EXP */}
      {nicEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Edit2 className="w-4 h-4 text-blue-500" /> Modifier le N° EXP</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{nicEditModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">{nicEditModal.parcel.sender?.name}</p>
              </div>
              <button onClick={() => setNicEditModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {nicEditModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {nicEditModal.error}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">N° EXP</label>
                <input
                  type="text"
                  value={nicEditModal.value}
                  onChange={e => setNicEditModal((m: any) => ({ ...m, value: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveNic()}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none bg-gray-50 focus:bg-white transition font-bold text-blue-600"
                  autoFocus
                  placeholder="N° d'expédition"
                />
                <p className="text-xs text-gray-400 mt-1">Numéro unique d'expédition.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setNicEditModal(null)}
                  className="py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm"
                >Annuler</button>
                <button onClick={handleSaveNic} disabled={nicEditModal.loading}
                  className="py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition text-sm disabled:opacity-50"
                >{nicEditModal.loading ? 'Sauvegarde...' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOUVELLE EXPÉDITION */}
      {newParcelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between z-10">
              <h3 className="font-bold text-xl text-gray-800">📦 Nouvelle Expédition</h3>
              <button onClick={() => setNewParcelModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition"><X className="w-5 h-5" /></button>
            </div>
            <form autoComplete="off" className="p-6 space-y-6">
              {newParcelModal.error && (<div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {newParcelModal.error}</div>)}

              {/* Expéditeur */}
              <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-pink-700">📤 Expéditeur</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="N° EXP" value={newParcelModal.form.senderNic} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, senderNic: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Nom *" value={newParcelModal.form.senderName} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, senderName: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Téléphone" value={newParcelModal.form.senderTel} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, senderTel: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Ville" value={newParcelModal.form.senderCity} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, senderCity: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Adresse" value={newParcelModal.form.senderAddress} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, senderAddress: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm col-span-2" />
                </div>
              </div>

              {/* Destinataire */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-blue-700">📥 Destinataire</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Nom *" value={newParcelModal.form.receiverName} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, receiverName: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Téléphone" value={newParcelModal.form.receiverTel} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, receiverTel: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Ville *" value={newParcelModal.form.receiverCity} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, receiverCity: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Adresse" value={newParcelModal.form.receiverAddress} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, receiverAddress: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm col-span-2" />
                </div>
              </div>

              {/* Détails */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-500 block mb-1">Poids (kg)</label><input type="number" min="0" step="0.1" value={newParcelModal.form.weight} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, weight: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" /></div>
                <div><label className="text-xs font-semibold text-gray-500 block mb-1">Nb Colis</label><input type="number" min="1" value={newParcelModal.form.nbColis} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, nbColis: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" /></div>
                <div><label className="text-xs font-semibold text-gray-500 block mb-1">Type</label><select value={newParcelModal.form.serviceType} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, serviceType: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full"><option value="simple">Simple</option><option value="especes">C/Espèces</option><option value="cheque">C/Chèque</option></select></div>
              </div>

              {/* Port */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-purple-700">💰 Port</h4>
                <div className="flex gap-2 mb-2">
                  {[{k:'port_paye',l:'Port Payé'},{k:'port_du',l:'Port Dû'},{k:'port_en_compte',l:'En Compte'}].map(p=><button key={p.k} onClick={()=>setNewParcelModal((m:any)=>({...m,form:{...m.form,portType:p.k}}))} className={`px-3 py-2 rounded-xl text-xs font-bold ${newParcelModal.form.portType===p.k?'bg-purple-600 text-white':'bg-white border'}`}>{p.l}</button>)}
                </div>
                <input type="number" min="0" step="0.01" placeholder="Montant port (DH)" value={newParcelModal.form.portPrice} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, portPrice: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
              </div>

              {/* RETOUR FOND */}
              <div><label className="text-xs font-semibold text-gray-500 block mb-1">RETOUR FOND (DH)</label><input type="number" min="0" step="0.01" value={newParcelModal.form.codAmount} onChange={e => setNewParcelModal((m: any) => ({ ...m, form: { ...m.form, codAmount: e.target.value } }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" /></div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t">
                <button type="button" onClick={() => setNewParcelModal(null)} className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">Annuler</button>
                <button type="button" onClick={handleCreateParcel} disabled={newParcelModal.loading} className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50">{newParcelModal.loading ? 'Création...' : 'Créer l\'expédition'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {statusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800">Changer le statut</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{statusModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">{statusModal.parcel.receiver?.name} ◆ {statusModal.parcel.receiver?.city}</p>
              </div>
              <button onClick={() => setStatusModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {statusModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">?? {statusModal.error}</div>
              )}
              {statusModal.parcel.signatureConfirmedAt && (
                <button
                  onClick={() => setViewSignature(statusModal.parcel)}
                  className="w-full flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  ?? Voir la signature �lectronique du destinataire
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map(s => {
                  const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                  const selected = statusModal.status === s
                  return (
                    <button key={s} onClick={() => setStatusModal((m: any) => ({ ...m, status: s }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition border ${
                        selected ? `${sc.bg} ${sc.text} border-current ring-2 ring-offset-1 ring-current` : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} /> {s}
                    </button>
                  )
                })}
              </div>
              {/* Avertissement incoh�rences */}
              {statusModal.status !== 'Livré' && (() => {
                const p = statusModal.parcel
                const items: any[] = []
                if (p.portStatus === 'collected') items.push('Port d� encaiss� ? remis � "en attente"')
                if (p.signatureConfirmedAt) items.push('Signature �lectronique ? effac�e')
                if (p.codStatus === 'collected' && !p.codSentToSource && !p.codSenderPaid) items.push('RETOUR FOND encaiss� ? remis � "en attente"')
                if (!items.length) return null
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1">?? Champs qui seront r�initialis�s automatiquement :</p>
                    {items.map(item => (
                      <p key={item} className="text-xs text-amber-700 flex items-center gap-1.5 pl-3">� {item}</p>
                    ))}
                  </div>
                )
              })()}
              <input placeholder="Note (optionnel)" value={statusModal.note}
                onChange={e => setStatusModal((m: any) => ({ ...m, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition"
              />
              {statusModal.status === 'Retourné' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Motif du retour</label>
                  <select value={statusModal.returnReason}
                    onChange={e => setStatusModal((m: any) => ({ ...m, returnReason: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition">
                    {RETURN_REASONS.map(reason => <option key={reason}>{reason}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setStatusModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                >Annuler</button>
                <button onClick={handleStatusUpdate}
                  disabled={statusModal.loading || statusModal.status === statusModal.parcel.status}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2"
                >
                  {statusModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mise � jour...</>
                    : <><CheckCircle className="w-4 h-4" /> Confirmer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CRÉATION */}
      {createModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Créer un membre</h3>
                  <p className="text-xs text-gray-400">Compte système ou fiche salarié RH</p>
                </div>
              </div>
              <button onClick={() => setCreateModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} autoComplete="off" className="p-5 space-y-3">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {createError}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Nom complet *</label>
                  <input required value={createModal.name}
                    onChange={e => setCreateModal((m: any) => ({ ...m, name: e.target.value }))}
                    placeholder="Prénom et nom" className={inputCls}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Téléphone</label>
                  <input type="tel" value={createModal.tel}
                    onChange={e => setCreateModal((m: any) => ({ ...m, tel: e.target.value }))}
                    placeholder="06XXXXXXXX" className={inputCls}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Email {createModal.role !== 'salarie' && '*'}
                  </label>
                  <input required={createModal.role !== 'salarie'} type="email" value={createModal.email}
                    onChange={e => setCreateModal((m: any) => ({ ...m, email: e.target.value }))}
                    placeholder={createModal.role === 'salarie' ? 'optionnel' : 'exemple@domaine.com'} className={inputCls}
                  />
                </div>

                {createModal.role !== 'salarie' && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Mot de passe * (min. 6 caractères)</label>
                    <div className="relative">
                      <input required
                        type={createModal.showPwd ? 'text' : 'password'}
                        value={createModal.password}
                        onChange={e => setCreateModal((m: any) => ({ ...m, password: e.target.value }))}
                        placeholder="••••••" className={inputCls + ' pr-10'}
                      />
                      <button type="button"
                        onClick={() => setCreateModal((m: any) => ({ ...m, showPwd: !m.showPwd }))}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition"
                      >
                        {createModal.showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Rôle *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLES.filter(r => r.key !== 'admin').map(r => (
                      <button type="button" key={r.key}
                        onClick={() => setCreateModal((m: any) => ({ ...m, role: r.key }))}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-sm font-semibold transition ${
                          createModal.role === r.key
                            ? `${r.badge} border-current shadow-sm`
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-xl">{r.emoji}</span>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    {createModal.role === 'salarie' ? 'Matricule' : 'Code agent'}
                  </label>
                  <input value={createModal.code}
                    onChange={e => setCreateModal((m: any) => ({ ...m, code: e.target.value }))}
                    placeholder={createModal.role === 'salarie' ? 'Ex: SAL-001' : 'Ex: A123'} className={inputCls}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Ville / Agence</label>
                  <div className="relative">
                    <select value={createModal.city}
                      onChange={e => setCreateModal((m: any) => ({ ...m, city: e.target.value }))}
                      className={inputCls + ' appearance-none'}
                    >
                      <option value="">🏙️ Sélectionner une ville 🏙️</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Matricule transport + secteur livreur */}
              {createModal.role === 'chauffeur' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      ?? Matricule du camion
                    </label>
                    <input
                      value={createModal.matricule || ''}
                      onChange={e => setCreateModal((m: any) => ({ ...m, matricule: e.target.value.toUpperCase() }))}
                      placeholder="Ex: 12345 أ 1"
                      className={inputCls}
                    />
                  </div>
                </>
              )}
              {createModal.role === 'livreur' && (
                <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      🏘️ Secteur assigné
                    </label>
                    <div className="relative">
                      <select
                        value={createModal.sectorId || ''}
                        onChange={e => setCreateModal((m: any) => ({ ...m, sectorId: e.target.value }))}
                        className={`${inputCls} appearance-none`}>
                        <option value="">🚫 Aucun secteur 🚫</option>
                        {allSectors.filter(s => !createModal.city || s.city === createModal.city).map(s => (
                          <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` • ${s.name}` : ''} ({s.city})</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
              )}

              {/* Role badge preview */}
              {(() => {
                const r = ROLES.find(x => x.key === createModal.role)
                return (
                  <div className={`rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${r?.badge || 'bg-gray-50 text-gray-700 border border-gray-200'} border`}>
                    <span className="text-lg">{r?.emoji}</span>
                    {createModal.role === 'salarie'
                      ? <>Fiche salarié société, sans accès obligatoire à l'application</>
                      : <>Ce compte aura accès à l'interface <strong>{r?.label || createModal.role}</strong></>
                    }
                    {createModal.city && <span> • Agence de <strong>{createModal.city}</strong></span>}
                  </div>
                )
              })()}

              {/* Permissions directeur */}
              {createModal.role === 'directeur' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
                    🔐 Permissions accordées
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIRECTOR_PERMISSIONS.map(p => {
                      const active = (createModal.directorPermissions || []).includes(p.key)
                      return (
                        <button type="button" key={p.key}
                          onClick={() => setCreateModal((m: any) => ({
                            ...m,
                            directorPermissions: active
                              ? (m.directorPermissions || []).filter((k: any) => k !== p.key)
                              : [...(m.directorPermissions || []), p.key]
                          }))}
                          className={`flex items-start gap-2 p-3 rounded-xl border-2 text-left transition ${
                            active ? 'bg-purple-50 border-purple-400 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-lg shrink-0">{p.emoji}</span>
                          <div>
                            <p className="text-xs font-bold leading-tight">{p.label}</p>
                            <p className="text-xs opacity-70 leading-tight mt-0.5">{p.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" onClick={() => setCreateModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button type="submit" disabled={createLoading}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold transition flex items-center justify-center gap-2"
                >
                  {createLoading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Création...</>
                    : <><UserPlus className="w-4 h-4" /> {createModal.role === 'salarie' ? 'Créer la fiche' : 'Créer le compte'}</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ÉDITION */}
      <UserEditModal
        userEdit={userEdit}
        setUserEdit={setUserEdit}
        userEditTab={userEditTab}
        setUserEditTab={setUserEditTab}
        pwdForm={pwdForm}
        setPwdForm={setPwdForm}
        allSectors={allSectors}
        ROLES={ROLES}
        DIRECTOR_PERMISSIONS={DIRECTOR_PERMISSIONS}
        CITIES={CITIES}
        inputCls={inputCls}
        handleSaveUser={handleSaveUser}
        handleChangePassword={handleChangePassword}
        openContractModal={openContractModal}
      />

      {contractModal && (
        <Suspense fallback={null}>
          <EmployeeContractModal contractModal={contractModal} setContractModal={setContractModal} />
        </Suspense>
      )}
      {/* MODAL ACTIVITÉ */}
      <UserActivityModal
        userActivityModal={userActivityModal}
        setUserActivityModal={setUserActivityModal}
        userDetailTab={userDetailTab}
        setUserDetailTab={setUserDetailTab}
      />

      {/* MODAL JOURNAL */}
      <DirectorLogsModal
        directorLogsModal={directorLogsModal}
        setDirectorLogsModal={setDirectorLogsModal}
        periodDirectorLogs={periodDirectorLogs}
      />

      {/* MODAL SUPPRESSION */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg text-center mb-1">Supprimer l'utilisateur ?</h3>
            <p className="text-gray-500 text-sm text-center mb-1">
              <span className="font-semibold text-gray-700">{deleteConfirmUser.name}</span>
            </p>
            <p className="text-gray-400 text-xs text-center mb-6">
              Cette action supprime uniquement les données du profil. Le compte email reste actif.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirmUser(null)}
                className="py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm">
                Annuler
              </button>
              <button onClick={handleDeleteUser}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition text-sm flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTION */}
      <DriverPortDuModal
        driverPortDuModal={driverPortDuModal}
        setDriverPortDuModal={setDriverPortDuModal}
        driverPortDuTxs={driverPortDuTxs}
        parcels={allParcels}
        portDuForm={portDuForm}
        setPortDuForm={setPortDuForm}
        portDuLoading={portDuLoading}
        portDuError={portDuError}
        portDuEditId={portDuEditId}
        setPortDuEditId={setPortDuEditId}
        portDuEditForm={portDuEditForm}
        setPortDuEditForm={setPortDuEditForm}
        handleAddPortDuTx={handleAddPortDuTx}
        handleDeletePortDuTx={handleDeletePortDuTx}
        handleSavePortDuEdit={handleSavePortDuEdit}
        handleConfirmDriverVersement={handleConfirmDriverVersement}
      />

      {/* Modal colis retour */}
      {returnParcelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => !returnParcelModal.loading && setReturnParcelModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            {returnParcelModal.result ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
                <h3 className="font-bold text-gray-900 text-lg">Colis retour créé !</h3>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                  <p className="text-xs text-gray-500">Nouveau tracking ID</p>
                  <p className="font-mono font-bold text-green-700 text-base">{returnParcelModal.result.trackingId}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {returnParcelModal.parcel.receiver?.city} ◆ {returnParcelModal.parcel.sender?.city}
                  </p>
                </div>
                <button onClick={() => setReturnParcelModal(null)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition">
                  Fermer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">🔄</div>
                  <div>
                    <h3 className="font-bold text-gray-900">Créer un colis retour ?</h3>
                    <p className="text-xs text-gray-500">Expédition inversée automatiquement</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">Expéditeur</span>
                    <span className="font-semibold text-gray-800">{returnParcelModal.parcel.receiver?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">Destinataire</span>
                    <span className="font-semibold text-gray-800">{returnParcelModal.parcel.sender?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                    <span className="text-gray-400 text-xs w-20">Trajet</span>
                    <span className="font-semibold text-blue-700 text-xs">
                      {returnParcelModal.parcel.destinationCity} ? {returnParcelModal.parcel.originCity}
                    </span>
                  </div>
                </div>
                {returnParcelModal.error && <p className="text-xs text-red-600">{returnParcelModal.error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setReturnParcelModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                  >
                    Non, ignorer
                  </button>
                  <button
                    onClick={handleCreateReturnParcel}
                    disabled={returnParcelModal.loading}
                    className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold transition"
                  >
                    {returnParcelModal.loading ? 'Cr�ation...' : 'Oui, cr�er'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visionneuse signature */}
      {viewSignature && (
        <SignatureViewerModal
          parcelId={viewSignature.id}
          trackingId={viewSignature.trackingId}
          recipientName={viewSignature.receiver?.name}
          nexpCode={viewSignature.sender?.nic}
          onClose={() => setViewSignature(null)}
          canEdit={true}
          userName={auth.currentUser?.displayName || auth.currentUser?.email || 'Admin'}
          isReturn={!!(viewSignature.returnedAt || viewSignature.returnToCity)}
        />
      )}

      {/* Section */}
      <AdminEditParcelModal
        adminEditModal={adminEditModal}
        setAdminEditModal={setAdminEditModal}
        handleAdminEditSave={handleAdminEditSave}
      />

      {/* Visionneuse signature */}
      {viewSignature && (
        <SignatureViewerModal
          parcelId={viewSignature.id}
          trackingId={viewSignature.trackingId}
          recipientName={viewSignature.receiver?.name}
          nexpCode={viewSignature.sender?.nic}
          onClose={() => setViewSignature(null)}
          canEdit={true}
          userName={auth.currentUser?.displayName || auth.currentUser?.email || 'Admin'}
          isReturn={!!(viewSignature.returnedAt || viewSignature.returnToCity)}
        />
      )}

      {/* Modal: Ajuster caisse centrale */}
      {centralCashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-6 h-6" />
                  <h3 className="font-bold text-lg">Ajuster Caisse Centrale</h3>
                </div>
                <button
                  onClick={() => {
                    setCentralCashModal(false)
                    setCentralCashError('')
                  }}
                  className="text-white/80 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {centralCashError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {centralCashError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Op�ration
                </label>
                <select
                  value={centralCashForm.operation}
                  onChange={(e) => setCentralCashForm({ ...centralCashForm, operation: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="add">? Ajouter de l'argent</option>
                  <option value="remove">? Retirer de l'argent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant (DH)
                </label>
                <input
                  type="number"
                  value={centralCashForm.amount}
                  onChange={(e) => setCentralCashForm({ ...centralCashForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type de paiement
                </label>
                <select
                  value={centralCashForm.type}
                  onChange={(e) => setCentralCashForm({ ...centralCashForm, type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="especes">?? Esp�ces</option>
                  <option value="cheques">?? Ch�ques</option>
                  <option value="virement">?? Virement</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Raison (obligatoire)
                </label>
                <textarea
                  value={centralCashForm.reason}
                  onChange={(e) => setCentralCashForm({ ...centralCashForm, reason: e.target.value })}
                  placeholder="Ex: Versement soci�t�, Ajustement inventaire..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 resize-none"
                  rows={3}
                />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="text-sm text-emerald-700">
                  <strong>Aper�u :</strong>
                  <div className="mt-2">
                    {centralCashForm.operation === 'add' ? '?' : '?'} {centralCashForm.amount || '0'} DH
                    {' '}({{'especes': '?? Esp�ces', 'cheques': '?? Ch�ques', 'virement': '?? Virement'}[centralCashForm.type]})
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCentralCashModal(false)
                  setCentralCashError('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={handleAdjustCentralCash}
                disabled={centralCashLoading}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition"
              >
                {centralCashLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* Modal Réinitialisation Caisse Centrale */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {resetCentralCashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Réinitialiser Caisse Centrale</h3>
                <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-700 font-semibold mb-2">
                ⚠️ Attention : Vous êtes sur le point de réinitialiser la Caisse Centrale Admin à 0 DH
              </p>
              <p className="text-xs text-red-600">
                <strong>Solde actuel : {fmt(centralCash?.solde || 0)} DH</strong>
                <br />
                • Espèces : {fmt(centralCash?.soldeEspeces || 0)} DH
                <br />
                • Chèques : {fmt(centralCash?.soldeCheques || 0)} DH
                <br />
                • Virement : {fmt(centralCash?.soldeVirement || 0)} DH
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setResetCentralCashModal(false)}
                disabled={resetCentralCashLoading}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleResetCentralCash}
                disabled={resetCentralCashLoading}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {resetCentralCashLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Réinitialisation...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Confirmer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 🔥 Modal SUPER RESET - Réinitialise TOUT */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {superResetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl w-full max-w-2xl p-8 shadow-2xl border-4 border-red-600">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center animate-pulse">
                <AlertTriangle className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="font-black text-2xl text-red-900">🔥 SUPER RESET 🔥</h3>
                <p className="text-sm text-red-700 mt-1 font-bold">ATTENTION : Cette action est IRRÉVERSIBLE</p>
              </div>
            </div>

            <div className="bg-red-100 border-4 border-red-600 rounded-2xl p-6 mb-6">
              <p className="text-base text-red-900 font-black mb-4 text-center">
                ⚠️ VOUS ÊTES SUR LE POINT DE RÉINITIALISER TOUT LE SYSTÈME À ZÉRO ⚠️
              </p>

              <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 border-2 border-red-400">
                  <p className="text-sm font-bold text-red-800 mb-2">1️⃣ Caisse Centrale Admin → 0 DH</p>
                  <p className="text-xs text-red-700 pl-6">
                    • Solde actuel: {fmt(centralCash?.solde || 0)} DH
                    <br />
                    • Espèces: {fmt(centralCash?.soldeEspeces || 0)} DH
                    <br />
                    • Chèques: {fmt(centralCash?.soldeCheques || 0)} DH
                    <br />
                    • Virement: {fmt(centralCash?.soldeVirement || 0)} DH
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 border-2 border-red-400">
                  <p className="text-sm font-bold text-red-800 mb-2">2️⃣ Toutes les Caisses d'Agences → 0 DH</p>
                  <p className="text-xs text-red-700 pl-6">
                    • {agencyCashes.length} caisses d'agences seront réinitialisées
                    <br />
                    • Total actuel: {fmt(agencyCashes.reduce((sum: number, ac: any) => sum + (ac.solde || 0), 0))} DH
                  </p>
                </div>

                <div className="bg-white rounded-xl p-4 border-2 border-red-400">
                  <p className="text-sm font-bold text-red-800 mb-2">3️⃣ Tous les Versements Livreurs SUPPRIMÉS</p>
                  <p className="text-xs text-red-700 pl-6">
                    • Tous les versements en attente seront SUPPRIMÉS définitivement
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-red-900 text-white rounded-xl p-4 text-center">
                <p className="text-sm font-black">
                  ⚡ CETTE OPÉRATION NE PEUT PAS ÊTRE ANNULÉE ⚡
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSuperResetModal(false)}
                disabled={superResetLoading}
                className="py-4 rounded-xl border-2 border-gray-400 text-gray-700 font-bold hover:bg-gray-100 transition disabled:opacity-50"
              >
                ❌ Annuler
              </button>
              <button
                onClick={handleSuperReset}
                disabled={superResetLoading}
                className="py-4 rounded-xl bg-gradient-to-r from-red-700 via-red-800 to-red-900 hover:from-red-800 hover:via-red-900 hover:to-black disabled:opacity-50 text-white font-black transition-all transform hover:scale-105 flex items-center justify-center gap-3 shadow-xl border-2 border-red-500"
              >
                {superResetLoading ? (
                  <>
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    RÉINITIALISATION EN COURS...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                    🔥 CONFIRMER SUPER RESET 🔥
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
