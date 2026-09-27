import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue, lazy, Suspense } from 'react'
import { createLoadProgressStore } from '../utils/loadProgressStore'
import { useGarePending } from './exploitation/useGarePending'
import { isGarePending, arrivalDateOf } from './exploitation/caisseRules'
import { signOut, createUserWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged } from 'firebase/auth'
import { auth, authSecondary, db } from '../firebase/config'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import ParcelScanModal from '../components/ParcelScanModal'
import { doc, onSnapshot, setDoc, collection, updateDoc, deleteDoc, getDoc, query, where, arrayUnion, deleteField, FieldValue } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  createParcel, subscribeAgentParcels, getMoreAgentParcels, getAccurateAgencyStats,
  updateParcel, deleteParcel, markParcelAsReturned, loadReturnedParcelOnTruck, validateReturnArrival, validateParcelEntry,
  updateParcelStatus, isParcelVisibleInDestinationAgency,
  subscribeAgencyParcels, subscribeAgencyParcelsFull, subscribeAgencyReturnParcels, subscribePendingAideAgentParcels, subscribeAllParcels,
  subscribeAllParcelsWithDateFilter, loadMoreParcelsWithDateFilter,
  createReturnParcel, searchParcelByTrackingId, searchParcels, getMoreAgencyParcels, getAgencyParcelsDaySlice, getParcelsPage,
  subscribeAllParcelsWithArchives, loadMoreParcelsWithArchives,
} from '../firebase/parcels'
import { shouldTriggerSearch } from '../utils/searchUtils'
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
  subscribeDriverVersements, confirmDriverVersement
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
  subscribeDeliveryDriverParcels,
} from '../firebase/firestore'
import { getAllLostParcels } from '../firebase/lostParcels'
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
import { getOperationalDayRange, getCurrentOperationalDay } from '../config/operationalDay'
import { buildDaySlices } from '../utils/daySlices'
import DateFilter from './agent/DateFilter'
import { useOperationalDaySelector } from '../hooks/useOperationalDay' // 🗓️ Journée opérationnelle
// ⚡ OPTIMISATION : Lazy loading pour tous les tabs (y compris ParcelsTab) pour chargement rapide
const ParcelsTab = lazy(() => import('./agent/tabs/ParcelsTab'))
const DirectorCaisseSimple = lazy(() => import('./director/DirectorCaisseSimple'))
const HomeTab = lazy(() => import('./agent/tabs/HomeTab'))
const NewTab = lazy(() => import('./agent/tabs/NewTab'))
const CodTab = lazy(() => import('./agent/tabs/CodTab'))
const ValeursAValiderTab = lazy(() => import('./agent/tabs/ValeursAValiderTab'))
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
const AgentClientPortDuTab = lazy(() => import('./agent/tabs/AgentClientPortDuTab'))
const AgentPortsEnCompteTab = lazy(() => import('./agent/tabs/AgentPortsEnCompteTab'))
const AgentVersementsTab = lazy(() => import('./agent/tabs/AgentVersementsTab'))
const AgentInvoicesTab = lazy(() => import('./agent/tabs/AgentInvoicesTab'))
const PortPayeChequeTab = lazy(() => import('./agent/tabs/PortPayeChequeTab'))
const PortDuChequeTab = lazy(() => import('./agent/tabs/PortDuChequeTab'))
const CaisseChefTab = lazy(() => import('./agent/tabs/CaisseChefTab'))

// ⚠️ 'caisse' est inclus volontairement : CaisseChefTab a sa PROPRE souscription indépendante
// et ne lit pas `parcels` — mais si 'caisse' est absent de cette liste, `needsParcels` passe à
// false en y accédant, ce qui déclenche le cleanup de l'effet de chargement ci-dessous et
// COUPE la requête "Expéditions" en plein milieu de sa synchronisation avec le serveur (avant
// que le snapshot serveur, potentiellement plus complet que le cache local, n'arrive). Revenir
// ensuite sur Expéditions relance alors une requête fraîche qui repart du cache — d'où des
// totaux qui semblaient incomplets après un changement de filtre, "corrigés" seulement en
// passant par un autre onglet qui remplissait le cache entre-temps.
const TABS_NEEDING_PARCELS = ['home', 'parcels', 'cod', 'charge', 'arrivage', 'retours', 'portsDu', 'portsEnCompte', 'caisse']

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
  // 🗓️ PRIORITÉ 1 : workDate — reflète la JOURNÉE D'OPÉRATION (8h → 6h le lendemain), pas le
  // jour calendaire de createdAt. Un colis saisi à 2h du matin doit compter pour la journée
  // commencée à 8h la veille. workDate est désormais calculé correctement à la création
  // (calculateWorkDate → getOperationalDayString, voir firebase/parcels.ts) ; cohérent avec
  // AdminPortAgenciesTab qui priorise déjà workDate de la même façon.
  if (p.workDate) {
    return new Date(p.workDate + 'T12:00:00')
  }
  // 📅 FALLBACK createdAt : pour les colis créés AVANT ce correctif ou sans workDate du tout.
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const entryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}
const filterByDate = (list: any, preset: any, from: any, to: any, getDate = parcelDate, operationalDay?: any) => {
  if (preset === 'all') return list
  const now = new Date()
  const endOfToday = new Date(); endOfToday.setHours(23,59,59,999)
  let start: any = null, end: any = endOfToday
  // 🗓️ "Aujourd'hui" / "7 jours" / "Mois" doivent utiliser les bornes de la JOURNÉE
  // D'OPÉRATION (8h → 6h lendemain), pas des bornes calendaires (minuit → 23h59) : getDate()
  // (parcelDate) compare désormais des dates ancrées sur workDate, qui suit cette même règle.
  // Sinon un colis saisi entre minuit et 6h (workDate = la veille) disparaissait à tort
  // du filtre "Aujourd'hui" alors que sa journée d'opération n'est pas encore terminée.
  if (preset === 'today') {
    const range = getOperationalDayRange(getCurrentOperationalDay())
    start = range.start
    end = range.end
  }
  else if (preset === 'week') {
    const todayOp = getCurrentOperationalDay()
    const weekAgoOp = new Date(todayOp); weekAgoOp.setDate(weekAgoOp.getDate() - 6)
    start = getOperationalDayRange(weekAgoOp).start
    end = getOperationalDayRange(todayOp).end
  }
  else if (preset === 'month') {
    const todayOp = getCurrentOperationalDay()
    const firstOfMonth = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1)
    start = getOperationalDayRange(firstOfMonth).start
    end = getOperationalDayRange(todayOp).end
  }
  else if (preset === 'day')    { start = from ? new Date(from) : null; if (start) { start.setHours(0,0,0,0); end = new Date(from+'T23:59:59') } }
  else if (preset === 'operational' && operationalDay) {
    // 🗓️ JOUR D'OPÉRATION : 8H → 6H lendemain
    const range = getOperationalDayRange(operationalDay)
    start = range.start
    end = range.end
  }
  else if (preset === 'custom') {
    // 📅 FILTRE PÉRIODE : Plage de dates normale (00:00 → 23:59)
    if (from) {
      start = new Date(from + 'T00:00:00')
    } else {
      start = null
    }
    if (to) {
      end = new Date(to + 'T23:59:59')
    } else {
      end = endOfToday
    }
  }
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
// ⚠️ Accents repliés AVANT de retirer les caractères spéciaux : sinon « COPÏMA » devenait « copma »
// et n'était jamais trouvé par « copima » (écart avec le Facturier, qui ignore les accents).
// ⚡ Recherche locale : utils/parcelSearch (makeAgentSearchMatcher) — même règle, champs normalisés
// mis en cache par expédition au lieu d'être recalculés à chaque frappe / chaque journée chargée.
// ⚡ Chargement jour par jour : les journées reçues sont ajoutées à la liste par LOTS (au plus une
// mise à jour toutes les APPEND_FLUSH_MS, et toujours à la fin) — chaque ajout relance tous les
// filtres/totaux sur la liste complète. Le compteur de progression, lui, reste mis à jour à chaque journée.
const APPEND_FLUSH_MS = 800

// Mappe le type de service convenu à la création → clé COD_PAYMENT_TYPES
const serviceToPaymentType = (st: any) =>
  st === 'retour_bl' ? 'bon_livraison' : (st === 'simple' ? 'especes' : (st || 'especes'))

function useDebounce(value: any, delay = 150) {
  const [d, setD] = useState(value)
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t) }, [value, delay])
  return d
}

import { getWorkingDateStr } from '../utils/workingDate'
import { normName, isBilledByAgency } from '../utils/billingAgency'
import { isAwaitingArrival } from '../utils/awaitingArrival'
import { normIncludes, normText } from '../utils/normText'
import { makeAgentSearchMatcher, sortByCreatedAtDesc } from '../utils/parcelSearch'

const parsePositiveNumber = (value: any, fallback = 0) => {
  const num = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '', receiverClientId: '',
  weight: '', nbColis: '0', natureOfGoods: 'Colis', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', hasRetourBL: false, shipmentMode: 'personal',
  portType: 'port_du', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  enGare: true,
  operationDate: getWorkingDateStr(),
}

export default function AgentPage() {
  const navigate  = useNavigate()
  const ticketRef  = useRef<any>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]           = useState<any>(null)
  const [drivers, setDrivers]           = useState<any[]>([])
  const [tab, setTab]                   = useState('home')
  // Onglets qui exploitent la liste des colis. Sert de dépendance à l'abonnement Firestore :
  // naviguer entre deux de ces onglets ne doit PAS relancer le chargement.
  const needsParcels = TABS_NEEDING_PARCELS.includes(tab)
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
  // ⚠️ Avec le cache Firestore local, un snapshot "cache" arrive souvent avant la confirmation
  // serveur — s'il ne contient pas encore tous les documents de la plage demandée (ex: après un
  // changement de filtre de date), l'affichage semblait "chargé" alors qu'il était incomplet.
  // Ce flag reste true tant que la réponse SERVEUR n'a pas confirmé les données affichées.
  const [syncingParcels, setSyncingParcels] = useState(false)
  const [pendingAideParcels, setPendingAideParcels] = useState<any[]>([])
  const [lostParcels, setLostParcels] = useState<any[]>([])  // ⭐ Pour badge Colis perdus

  // 🔄 Les données se chargent automatiquement au démarrage, mais les filtres ne rechargent PAS
  const unsubscribersRef = useRef<(() => void)[]>([])  // Stocke les unsubscribers pour cleanup

  // ⚡ Système de chargement optimisé (Option 3)
  const PAGE_SIZE = 50 // Chargement initial réduit pour performance
  const INITIAL_LOAD_SIZE = 150 // Chargement initial rapide pour chef d'agence (150 par query = ~300 total)
  // ⚠️ Était monté à 20000 pour ne jamais tronquer les totaux d'une agence active sur une
  // période chargée. Mais 2 × 20000 documents en écoute temps réel est si lourd que le
  // snapshot SERVEUR met plusieurs secondes à arriver — l'utilisateur ne voyait quasiment
  // toujours que le premier snapshot CACHE (potentiellement incomplet, voir fromCache dans
  // subscribeAgencyParcels). Depuis que "Aujourd'hui/7j/Mois/Jour précis" envoient une vraie
  // plage de dates à Firestore (voir plus bas), la requête est déjà bornée côté serveur : un
  // plafond de 2000 par requête (≈4000 avec envoyés+reçus) reste largement suffisant pour une
  // agence, et le snapshot serveur revient assez vite pour ne plus rester bloqué sur le cache.
  const FILTERED_PAGE_SIZE = 2000 // par query (envoyés + reçus) = jusqu'à ~4000 total avec filtres
  const AGENCY_PAGE_SIZE = PAGE_SIZE // Compatibilité (sera remplacé par effectivePageSize)
  const [liveParcels, setLiveParcels] = useState<any[]>([]) // Premiers 600 en temps réel
  const [moreParcels, setMoreParcels] = useState<any[]>([]) // Chargés progressivement
  const [hasMoreAgency, setHasMoreAgency] = useState(true)
  const [loadingMoreAgency, setLoadingMoreAgency] = useState(false)
  const [loadingAllAgency, setLoadingAllAgency] = useState(false)
  // ⚡ Progression (expéditions reçues + journée en cours) HORS de l'état React de la page : elle
  // change à chaque journée chargée ; en useState elle re-rendait toute la page + l'onglet
  // Expéditions à chaque journée. Seule la jauge (ParcelsTab → useLoadProgress) se re-rend.
  const agencyProgressStore = useMemo(() => createLoadProgressStore(), [])
  // 📅 true : les expéditions de la période viennent d'une lecture ponctuelle jour par jour
  // (période passée ou partie passée d'une période) — pas d'écoute temps réel dessus.
  const [agencyOneShot, setAgencyOneShot] = useState(false)
  const agencyLastDocsRef = useRef<any>(null)
  // Mode "Toutes villes" pour agent pro uniquement
  // ✅ FALSE par défaut (Ma ville) - Agent Pro peut basculer, Chef d'agence reste sur Ma ville
  const [showAllCities, setShowAllCities] = useState(false)
  // Curseurs séparés pour chargement progressif (parcels + archives)
  const [allCitiesParcelsLastSnap, setAllCitiesParcelsLastSnap] = useState<any>(null)
  const [allCitiesArchivesLastSnap, setAllCitiesArchivesLastSnap] = useState<any>(null)
  const [allCitiesTotalLoaded, setAllCitiesTotalLoaded] = useState(0)
  const agencyPagedRef = useRef(false)
  // 🔢 Génération du chargement : incrémentée à chaque (ré)abonnement (changement de filtre).
  // Une boucle loadAllAgencyParcels lancée pour l'ancien filtre s'arrête dès qu'elle la voit changer.
  const agencyLoadGenRef = useRef(0)
  const agencyDateFilterRef = useRef<{ dateFrom: Date | null; dateTo: Date | null }>({ dateFrom: null, dateTo: null })

  // États pour pagination avec filtre de date
  const [lastSnapWithDateFilter, setLastSnapWithDateFilter] = useState<any>(null)
  const [hasMoreWithDateFilter, setHasMoreWithDateFilter] = useState(false)
  const [loadingMoreWithDateFilter, setLoadingMoreWithDateFilter] = useState(false)
  // 🔵 Pagination progressive VISIBLE pour Agent Pro "Toutes les villes" (même principe que
  // loadingAllAgency côté chef d'agence) : continue de charger automatiquement en arrière-plan
  // tant qu'il reste des colis, avec un total qui se complète progressivement à l'écran.
  const [loadingAllCities, setLoadingAllCities] = useState(false)
  const [loadAllCitiesProgress, setLoadAllCitiesProgress] = useState(0)

  const [search, setSearch]             = useState('')
  const [includeArchived, setIncludeArchived] = useState(false) // 🗄️ Inclure archives dans recherche
  const [serverSearchResults, setServerSearchResults] = useState<any[] | null>(null) // Résultats recherche serveur
  const [isSearching, setIsSearching]   = useState(false) // Loading state pour recherche
  // Utiliser 'all' par défaut pour voir tous les colis, pas seulement ceux du jour de travail
  const [datePreset, setDatePreset]     = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [dateFilterType, setDateFilterType] = useState<'creation' | 'livraison'>('creation')

  // 🗓️ Journée opérationnelle
  const {
    selectedDay: operationalDay,
    setSelectedDay: setOperationalDay,
  } = useOperationalDaySelector()

  const [parcelDirection, setParcelDirection] = useState('all')
  const [serviceFilter, setServiceFilter]   = useState('all')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelEditorFilter, setParcelEditorFilter] = useState('all')
  const [destinationCityFilter, setDestinationCityFilter] = useState('all')  // ⭐ Filtre ville de destination
  const [driverFilter, setDriverFilter] = useState('all')  // ⭐ Filtre par livreur/chauffeur
  const [portTypeFilter, setPortTypeFilter] = useState('all')  // ⭐ Filtre par type de port
  const [encaissementFilter, setEncaissementFilter] = useState('all')  // ⭐ Filtre par type d'encaissement
  // ⭐ Sélection MULTIPLE de types d'encaissement (espèces/chèque/traite combinés) — distinct de
  // encaissementFilter (qui gère les options exclusives "Tous"/"Simple"). Non vide = prioritaire.
  const [encaissementTypesFilter, setEncaissementTypesFilter] = useState<string[]>([])
  const [codDocumentStatusFilter, setCodDocumentStatusFilter] = useState<string[]>([])  // ⭐ Filtre par statut document COD (sélection multiple)
  const [driverFilteredParcels, setDriverFilteredParcels] = useState<any[]>([]) // Colis du livreur filtré
  const [loadingDriverParcels, setLoadingDriverParcels] = useState(false)
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
  // 🔍 Restreint la recherche par nom à l'expéditeur seul, au destinataire seul, ou les deux
  // (défaut) — pour éviter qu'un colis remonte juste parce que l'AUTRE partie porte ce nom.
  const [searchScope, setSearchScope] = useState<'all' | 'sender' | 'receiver'>('all')

  // ── Debounced search values (évite le recalcul à chaque frappe)
  const debouncedSearch      = useDebounce(search)
  const debouncedCaisseSearch = useDebounce(caisseSearch)
  const debouncedCodSearch    = useDebounce(codSearch)

  // 🔍 RECHERCHE SERVEUR: ACTIVÉE (Option 3 - comme AdminPage)
  // Recherche dans TOUTE la base Firestore, pas seulement les colis chargés
  useEffect(() => {
    const query = debouncedSearch.trim()
    if (!shouldTriggerSearch(query)) {
      setServerSearchResults(null)
      setIsSearching(false)
      return
    }
    // ⚡ Période précise choisie (Aujourd'hui, 7 j, Mois, Journée, Période…) : les expéditions de
    // cette période sont déjà chargées pour l'agence → recherche LOCALE uniquement (accents ignorés),
    // sans interroger toute la base (toutes dates confondues). Recherche serveur seulement sur « Tout ».
    if (datePreset !== 'all' && !showAllCities) {
      setServerSearchResults(null)
      setIsSearching(false)
      return
    }

    // ⚡ Recherche serveur dans TOUTE la base
    const performServerSearch = async () => {
      setIsSearching(true)
      try {
        console.warn(`🔍 Recherche serveur AgentPage: "${query}" ${includeArchived ? '(avec archives)' : '(sans archives)'}`)
        const results = await searchParcels(query, { limit: 50000, includeArchived, nameScope: searchScope })
        setServerSearchResults(results)
        setIsSearching(false)
        console.warn(`✅ Recherche serveur AgentPage: ${results.length} résultats trouvés`)
      } catch (error) {
        console.error('❌ Erreur recherche serveur AgentPage:', error)
        setServerSearchResults(null)
        setIsSearching(false)
      }
    }

    performServerSearch()
  }, [debouncedSearch, includeArchived, searchScope, datePreset, showAllCities])

  const [editingParcel, setEditingParcel] = useState<any>(null)
  const [editForm, setEditForm]         = useState<any>(null)
  const [editLoading, setEditLoading]   = useState(false)
  const [editError, setEditError]       = useState('')

  // 💰 Édition rapide du montant COD
  const [codEditModal, setCodEditModal] = useState<any>(null)

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

  // ⭐ États pour assignation en masse à un livreur
  const [bulkAssignSelectedIds, setBulkAssignSelectedIds] = useState<any[]>([])
  const [bulkAssignDriverId, setBulkAssignDriverId] = useState('')
  const [bulkAssignSectorId, setBulkAssignSectorId] = useState('')
  const [bulkAssignBusy, setBulkAssignBusy] = useState(false)
  const [bulkAssignError, setBulkAssignError] = useState('')

  // ⭐ Permissions de modification par rôle
  const [editPermissions, setEditPermissions] = useState<any>({ chef_agence: [], aide_agent: [], agentpro: [] })
  const [actionPermissions, setActionPermissions] = useState<any>({ chef_agence: [], agentpro: [] })

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
  const [codLoadAllProgress, setCodLoadAllProgress] = useState(0) // colis parcourus pendant "Charger tout l'historique"
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

  // ⭐ Charger les permissions de modification depuis Firestore
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const docRef = doc(db, 'settings', 'editPermissions')
        const snapshot = await getDoc(docRef)
        if (snapshot.exists()) {
          const data = snapshot.data()
          setEditPermissions(data)
          setActionPermissions({ chef_agence: data.chef_agence_actions || [] })
        }
      } catch (error) {
        console.error('Erreur chargement permissions:', error)
      }
    }
    loadPermissions()
  }, [])

  // DÉSACTIVÉ TEMPORAIREMENT - cause boucle infinie
  // useEffect(() => {
  //   if (profile?.city) {
  //     initWorkingDate(profile.city).catch(err => {
  //       console.error('Erreur init date de travail:', err)
  //     })
  //   }
  // }, [profile?.city])

  // ⭐ Charger les colis perdus pour le badge de notification
  useEffect(() => {
    if (!profile?.city) return

    const loadLostParcels = async () => {
      try {
        const all = await getAllLostParcels()
        // Filtrer les colis perdus pertinents pour cette agence (ceux qui ne sont pas encore trouvés)
        const relevant = all.filter(lp =>
          lp.responses[profile.city] && lp.status !== 'found'
        )
        setLostParcels(relevant)
      } catch (error) {
        console.error('Erreur chargement colis perdus:', error)
      }
    }

    // ⚡ getAllLostParcels lit TOUTE la collection : on espace fortement le rafraîchissement
    // du badge (5 min au lieu de 30 s = 10x moins de lectures Firestore par utilisateur)
    const timer = setTimeout(loadLostParcels, 3000)
    const interval = setInterval(loadLostParcels, 5 * 60 * 1000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [profile?.city])

  // Raccourci Ctrl+Enter depuis l'accueil pour aller à Nouvelle expédition
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Seulement sur l'onglet home
      if (tab === 'home' && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        setTab('new')
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [tab])

  // ⚡ OPTIMISATION : Charger les données secondaires après un délai pour affichage rapide
  useEffect(() => {
    if (!profile?.role) return
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribers: (() => void)[] = []

    // ⏱️ Délai de 500ms pour afficher l'interface rapidement avant de charger les données
    const delayTimer = setTimeout(() => {
      const isAide = profile.role === 'aide_agent'
      const isAgentPro = profile.role === 'agentpro'
      const onListenerError = (label: any) => (err: any) => {
        console.error(`AgentPage ${label}:`, err)
        if (err.code === 'permission-denied') {
          auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
        }
      }
      // subscribeClients charge TOUS les clients de TOUTES les agences sans limite :
      // il est démarré à la demande, par les onglets qui en ont besoin (voir plus bas)
      if (!isAide) {
        unsubscribers.push(subscribeDrivers(setDrivers, onListenerError('subscribeDrivers')))
        unsubscribers.push(subscribeAllUsers(data => {
          setAgencyCashiers(data.filter(u => u.role === 'caissier'))
          setAllUsers(data)
        }, onListenerError('subscribeAllUsers')))
        // subscribeAgentCodRequests est chargé à l'ouverture de l'onglet RETOUR FOND (bloc lazy)
      }
    }, 500)

    return () => {
      clearTimeout(delayTimer)
      unsubscribers.forEach(unsub => unsub())
    }
  }, [profile?.role, authTick])

  // 🔍 Filtres autres que la date : ils sont appliqués CÔTÉ CLIENT (filteredParcels). Ils ne
  // changent la requête Firestore que via la taille de page (150 → 2000 sans filtre de date).
  // ⚠️ Avant, CHAQUE filtre (type de port, statut, direction, livreur…) figurait dans les
  // dépendances de l'effet de chargement : un simple clic sur « Port dû » détruisait les écoutes
  // et relisait toute la période (≈15 000 expéditions pour « Ce mois » à Casablanca). Seul ce
  // booléen compte désormais.
  const hasNonDateFilters =
    serviceFilter !== 'all' ||
    parcelStatusFilter !== 'all' ||
    parcelDirection !== 'all' ||
    destinationCityFilter !== 'all' ||
    driverFilter !== 'all' ||
    portTypeFilter !== 'all' ||
    encaissementFilter !== 'all' || encaissementTypesFilter.length > 0 ||
    codDocumentStatusFilter.length > 0
  // Avec une période choisie, la taille de page est déjà maximale : changer un autre filtre ne
  // doit alors RIEN relire (needsBigPage reste true).
  const needsBigPage = datePreset !== 'all' || hasNonDateFilters

  // 🔄 Chargement optimisé avec détection de filtres (Option 3)
  // ⚡ OPTIMISATION : Charger les parcels uniquement si l'onglet nécessite des parcels
  useEffect(() => {
    if (!profile) return
    const uid = auth.currentUser?.uid
    if (!uid) return

    // ⚡ Ne charger les parcels que si on est sur un onglet qui en a besoin.
    // ⚠️ La dépendance est `needsParcels` (booléen) et NON `tab` : passer d'Accueil à
    // Expéditions ne doit pas détruire puis recréer l'abonnement Firestore, sinon chaque
    // changement d'onglet re-télécharge tous les colis de l'agence.
    if (!needsParcels) {
      console.log(`⏭️ Onglet "${tab}" ne nécessite pas de parcels, chargement ignoré`)
      return
    }

    // 🔍 Détecter si des filtres sont actifs
    const hasFilters = needsBigPage

    // ⚡ Chargement progressif pour chef d'agence:
    // - Sans filtres: 150 par query au démarrage (~300 total) pour affichage rapide
    // - Avec filtres: 1200 par query (~2400 total) pour avoir toutes les données filtrées
    let effectivePageSize = PAGE_SIZE
    if (profile?.role === 'chef_agence' || profile?.role === 'agentpro') {
      effectivePageSize = hasFilters ? FILTERED_PAGE_SIZE : INITIAL_LOAD_SIZE
    } else if (hasFilters) {
      effectivePageSize = FILTERED_PAGE_SIZE
    }

    console.warn(`📊 CHARGEMENT AgentPage:`, { hasFilters, effectivePageSize, date: datePreset })

    // Nettoyer les anciennes souscriptions
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []

    // ⚠️ CORRECTIF : réinitialiser la pagination progressive à CHAQUE changement de filtre.
    // Avant, hasMoreAgency / agencyPagedRef / moreParcels n'étaient jamais remis à zéro : après
    // un premier chargement complet (ex: "Aujourd'hui" à l'ouverture), hasMoreAgency restait
    // false et le curseur figé — passer ensuite à "Ce mois" n'affichait que les 2 × 2000 colis
    // temps réel (Casablanca : 3 695 colis au lieu de 15 335).
    agencyLoadGenRef.current += 1
    agencyPagedRef.current = false
    agencyLastDocsRef.current = null
    setMoreParcels([])
    setHasMoreAgency(true)
    setLoadingAllAgency(false)
    setAgencyOneShot(false)
    agencyProgressStore.reset()

    setLoadingParcels(true)
    const onError = (err: any) => {
      console.error('AgentPage subscribeParcels:', err)
      setLoadingParcels(false)
      if (err.code === 'permission-denied') {
        auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
      }
    }

    // ✅ AGENT PRO avec "Toutes les villes" = comme ADMIN (tous les colis)
    if (profile.role === 'agentpro' && showAllCities) {
      console.log(`🚀 [Agent Pro] Chargement de TOUTES les villes (comme Admin)`)

      // 🗓️ SI JOUR D'OPÉRATION → charger avec filtre Firestore
      if (datePreset === 'operational' && operationalDay) {
        const range = getOperationalDayRange(operationalDay)
        const dateFromObj = range.start
        const dateToObj = range.end

        console.log(`🗓️ [Agent Pro] Jour d'opération Firestore (Toutes villes):`, {
          from: dateFromObj?.toLocaleString('fr-MA'),
          to: dateToObj?.toLocaleString('fr-MA')
        })

        const unsubAll = subscribeAllParcelsWithDateFilter(
          (data: any, lastSnap: any, fromCache: boolean) => {
            console.log(`✅ [Agent Pro - Jour d'opération] ${data.length} colis chargés (fromCache: ${fromCache})`)
            setParcels(data)
            setLiveParcels(data)
            setLoadingParcels(false)
            setSyncingParcels(!!fromCache)
            setLastSnapWithDateFilter(lastSnap)
            setHasMoreWithDateFilter(data.length >= effectivePageSize)
          },
          onError,
          {
            pageSize: effectivePageSize,
            dateFrom: dateFromObj,
            dateTo: dateToObj
          }
        )

        setReturnParcels([])
        setPendingAideParcels([])
        unsubscribersRef.current.push(unsubAll)
        return () => {
          unsubscribersRef.current.forEach(unsub => unsub())
          unsubscribersRef.current = []
        }
      }

      // 🔥 SI FILTRE DE DATE CUSTOM → utiliser subscribeAllParcelsWithDateFilter (comme Admin)
      if (datePreset === 'custom' && (dateFrom || dateTo)) {
        // 🗓️ "Période" suit désormais la JOURNÉE D'OPÉRATION (8h → 6h lendemain) plutôt que le
        // jour calendaire : un colis saisi à 2h du matin le jour de fin appartient encore à la
        // journée d'opération précédente (workDate), donc à la période sélectionnée si celle-ci
        // se termine ce jour-là. Bornes calendaires strictes (00:00→23:59) l'excluaient à tort.
        const dateFromObj = dateFrom ? getOperationalDayRange(new Date(dateFrom + 'T12:00:00')).start : null
        const dateToObj = dateTo ? getOperationalDayRange(new Date(dateTo + 'T12:00:00')).end : null

        console.log(`⚡ [Agent Pro] Filtre de date Firestore:`, {
          from: dateFromObj?.toLocaleDateString('fr-MA'),
          to: dateToObj?.toLocaleDateString('fr-MA')
        })

        const unsubAll = subscribeAllParcelsWithDateFilter(
          (data: any, lastSnap: any, fromCache: boolean) => {
            console.log(`✅ [Agent Pro - Avec filtre date] ${data.length} colis chargés (fromCache: ${fromCache})`)
            setParcels(data)
            setLiveParcels(data)
            setLoadingParcels(false)
            setSyncingParcels(!!fromCache)
            // Stocker lastSnap pour pagination et vérifier s'il y a plus de colis
            setLastSnapWithDateFilter(lastSnap)
            setHasMoreWithDateFilter(data.length >= effectivePageSize)
          },
          onError,
          {
            pageSize: effectivePageSize,
            dateFrom: dateFromObj,
            dateTo: dateToObj
          }
        )

        setReturnParcels([])
        setPendingAideParcels([])
        unsubscribersRef.current.push(unsubAll)
        return () => {
          unsubscribersRef.current.forEach(unsub => unsub())
          unsubscribersRef.current = []
        }
      }

      // ⚠️ CORRECTIF (mêmes raisons que côté chef d'agence ci-dessous) : today/week/month
      // passaient par subscribeAllParcels SANS aucune borne de date, chargeant les N derniers
      // colis TOUTES VILLES CONFONDUES puis filtrant côté client — une ville peu active pouvait
      // n'avoir aucun colis dans cette fenêtre. On envoie maintenant la vraie plage.
      if (datePreset === 'today' || datePreset === 'week' || datePreset === 'month') {
        const todayOp = getCurrentOperationalDay()
        let dateFromObj: Date, dateToObj: Date
        if (datePreset === 'today') {
          const range = getOperationalDayRange(todayOp)
          dateFromObj = range.start; dateToObj = range.end
        } else if (datePreset === 'week') {
          const weekAgoOp = new Date(todayOp); weekAgoOp.setDate(weekAgoOp.getDate() - 6)
          dateFromObj = getOperationalDayRange(weekAgoOp).start
          dateToObj = getOperationalDayRange(todayOp).end
        } else {
          const firstOfMonth = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1)
          dateFromObj = getOperationalDayRange(firstOfMonth).start
          dateToObj = getOperationalDayRange(todayOp).end
        }

        console.log(`📅 [Agent Pro] Préset "${datePreset}" Firestore (Toutes villes):`, {
          from: dateFromObj.toLocaleString('fr-MA'), to: dateToObj.toLocaleString('fr-MA')
        })

        const unsubAll = subscribeAllParcelsWithDateFilter(
          (data: any, lastSnap: any, fromCache: boolean) => {
            console.log(`✅ [Agent Pro - ${datePreset}] ${data.length} colis chargés (fromCache: ${fromCache})`)
            setParcels(data)
            setLiveParcels(data)
            setLoadingParcels(false)
            setSyncingParcels(!!fromCache)
            setLastSnapWithDateFilter(lastSnap)
            setHasMoreWithDateFilter(data.length >= effectivePageSize)
          },
          onError,
          { pageSize: effectivePageSize, dateFrom: dateFromObj, dateTo: dateToObj }
        )

        setReturnParcels([])
        setPendingAideParcels([])
        unsubscribersRef.current.push(unsubAll)
        return () => {
          unsubscribersRef.current.forEach(unsub => unsub())
          unsubscribersRef.current = []
        }
      }

      // SINON → subscribeAllParcels normal
      const unsubAll = subscribeAllParcels(
        (data: any, _lastSnap: any, fromCache: boolean) => {
          console.log(`✅ [Agent Pro - Toutes villes] ${data.length} colis chargés (fromCache: ${fromCache})`)
          setParcels(data)
          setLiveParcels(data)
          setLoadingParcels(false)
          setSyncingParcels(!!fromCache)
        },
        onError,
        0, // offset
        effectivePageSize // ⚡ 50 ou 1000 selon filtres
      )

      setReturnParcels([])
      setPendingAideParcels([])
      unsubscribersRef.current.push(unsubAll)
      return () => {
        unsubscribersRef.current.forEach(unsub => unsub())
        unsubscribersRef.current = []
      }
    }

    // CHEF D'AGENCE : seulement sa ville
    if ((profile.role === 'chef_agence' || profile.role === 'agentpro') && profile.city) {
      // 🔥 SI FILTRE DE DATE CUSTOM OU OPERATIONAL → passer les dates à subscribeAgencyParcels
      let filterDateFrom: Date | null = null
      let filterDateTo: Date | null = null

      if (datePreset === 'custom' && (dateFrom || dateTo)) {
        // 🗓️ FILTRE PÉRIODE : basé sur la JOURNÉE D'OPÉRATION (8h → 6h lendemain), pas le jour
        // calendaire — cohérent avec workDate. Sinon un colis saisi tôt le matin de la date de
        // fin (encore la veille en journée d'opération) sortait à tort de la période, faussant
        // les totaux Port dû par rapport à la page Admin.
        if (dateFrom) {
          filterDateFrom = getOperationalDayRange(new Date(dateFrom + 'T12:00:00')).start
        } else {
          filterDateFrom = null
        }

        if (dateTo) {
          filterDateTo = getOperationalDayRange(new Date(dateTo + 'T12:00:00')).end
        } else {
          filterDateTo = null
        }

        console.log(`📅 [Chef d'agence] Période custom pour ${profile.city}:`, {
          from: filterDateFrom?.toLocaleDateString('fr-MA'),
          to: filterDateTo?.toLocaleDateString('fr-MA')
        })
      } else if (datePreset === 'operational' && operationalDay) {
        // 🗓️ Journée opérationnelle: 8H → 6H lendemain
        const range = getOperationalDayRange(operationalDay)
        filterDateFrom = range.start
        filterDateTo = range.end

        console.log(`🗓️ [Chef d'agence] Jour d'opération Firestore pour ${profile.city}:`, {
          from: filterDateFrom?.toLocaleString('fr-MA'),
          to: filterDateTo?.toLocaleString('fr-MA')
        })
      } else if (datePreset === 'today' || datePreset === 'week' || datePreset === 'month') {
        // ⚠️ CORRECTIF : ces presets ne passaient AUCUNE borne à Firestore, qui retombait
        // alors sur un défaut fixe de 30 jours (subscribeAgencyParcels) — un "Jour précis" ou
        // "Ce mois" plus ancien que 30 jours renvoyait une liste vide, et "Aujourd'hui"/"7j"
        // chargeaient inutilement une fenêtre plus large que nécessaire. On envoie maintenant
        // la vraie plage (mêmes bornes "journée d'opération" que le filtre client, voir
        // utils/dateFilter.ts) → requête plus précise, donc moins coûteuse, pas plus.
        const todayOp = getCurrentOperationalDay()
        if (datePreset === 'today') {
          const range = getOperationalDayRange(todayOp)
          filterDateFrom = range.start
          filterDateTo = range.end
        } else if (datePreset === 'week') {
          const weekAgoOp = new Date(todayOp); weekAgoOp.setDate(weekAgoOp.getDate() - 6)
          filterDateFrom = getOperationalDayRange(weekAgoOp).start
          filterDateTo = getOperationalDayRange(todayOp).end
        } else {
          const firstOfMonth = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1)
          filterDateFrom = getOperationalDayRange(firstOfMonth).start
          filterDateTo = getOperationalDayRange(todayOp).end
        }
        console.log(`📅 [Chef d'agence] Préset "${datePreset}" Firestore pour ${profile.city}:`, {
          from: filterDateFrom?.toLocaleString('fr-MA'),
          to: filterDateTo?.toLocaleString('fr-MA')
        })
      } else if (datePreset === 'day' && dateFrom) {
        filterDateFrom = new Date(dateFrom + 'T00:00:00')
        filterDateTo = new Date(dateFrom + 'T23:59:59')
      } else {
        // 📦 "Tout" (ou "Jour précis" sans date choisie) : pas de borne, comportement inchangé.
        filterDateFrom = null
        filterDateTo = null

        console.log(`📦 [Chef] Chargement SANS LIMITE (tous les colis)`)
      }

      agencyDateFilterRef.current = { dateFrom: filterDateFrom, dateTo: filterDateTo }

      // Souscrire aussi aux retours pour cette agence (avec même filtre de date) — inchangé
      const subscribeReturns = () => subscribeAgencyReturnParcels(
        profile.city,
        (data: any) => {
          console.log(`✅ [Chef d'agence] ${data.length} colis retour chargés pour ${profile.city}`)
          setReturnParcels(data)
        },
        onError,
        filterDateFrom,
        filterDateTo
      )

      // 📅 PÉRIODE BORNÉE (Aujourd'hui, 7 j, Mois, J.Opé, Jour, Période) → même système que le
      // Facturier : lecture PONCTUELLE jour par jour (getDocs), affichage progressif pour les
      // ~3 000 premières expéditions puis le reste ajouté EN UNE FOIS à la fin. Seule la journée
      // d'opération EN COURS (si elle fait partie de la période) reste en écoute temps réel.
      // ⚠️ Avant : 2 écoutes onSnapshot × 2000 docs (avec includeMetadataChanges → la liste entière
      // retraitée une fois depuis le cache puis une fois depuis le serveur) recréées à chaque
      // changement de filtre, puis la boucle jour par jour pour le reste.
      // Mêmes requêtes (originCity / destinationCity, archivés inclus) et tranches couvrant
      // EXACTEMENT [début, fin] (buildDaySlices) → totaux finaux identiques.
      if (filterDateFrom && filterDateTo) {
        const city = profile.city
        const gen = agencyLoadGenRef.current
        const rangeStart = filterDateFrom, rangeEnd = filterDateTo
        const todayStart = getOperationalDayRange(getCurrentOperationalDay()).start
        // Partie temps réel : [max(début, début de la journée en cours), fin] si la période l'inclut
        const liveFrom = rangeEnd.getTime() >= todayStart.getTime()
          ? (rangeStart.getTime() > todayStart.getTime() ? rangeStart : todayStart)
          : null
        // Partie ponctuelle : tranches (journées d'opération) antérieures à la partie temps réel.
        // todayStart est une frontière de tranche → aucune tranche ne chevauche la partie temps réel.
        const slices = buildDaySlices(rangeStart, rangeEnd)
          .filter(s => !liveFrom || s.start.getTime() < liveFrom.getTime())

        setLiveParcels([])
        setHasMoreAgency(false) // pas de boucle « charger la suite » : tout est lu ci-dessous
        setSyncingParcels(!!liveFrom)
        setAgencyOneShot(slices.length > 0)
        let firstData = true
        const gotData = () => { if (firstData) { firstData = false; setLoadingParcels(false) } }

        if (liveFrom) {
          unsubscribersRef.current.push(subscribeAgencyParcelsFull(
            city,
            { dateFrom: liveFrom, dateTo: rangeEnd, pageSize: FILTERED_PAGE_SIZE, includeArchived: true },
            (data, meta) => {
              if (gen !== agencyLoadGenRef.current) return
              setLiveParcels(data)
              setSyncingParcels(meta.fromCache)
              gotData()
            },
            onError
          ))
        }

        if (slices.length > 0) {
          setLoadingAllAgency(true)
          agencyProgressStore.set({ loaded: 0, day: { done: 0, total: slices.length, label: slices[0].label } })
          ;(async () => {
            let loaded = 0
            let pending: any[] = []
            let lastFlush = 0
            let shown = 0 // expéditions déjà envoyées à l'affichage
            const flush = () => {
              if (!pending.length) return
              const docs = pending
              pending = []
              lastFlush = Date.now()
              shown += docs.length
              setMoreParcels(prev => {
                const map = new Map()
                prev.forEach((p: any) => map.set(p.id, p))
                docs.forEach((p: any) => map.set(p.id, p))
                return [...map.values()]
              })
              gotData()
            }
            try {
              for (let i = 0; i < slices.length; i++) {
                const s = slices[i]
                if (gen !== agencyLoadGenRef.current) return
                agencyProgressStore.set({ day: { done: i, total: slices.length, label: s.label } })
                const docs = (await Promise.all([
                  getAgencyParcelsDaySlice(city, 'originCity', s.start, s.end, s.endInclusive, null, FILTERED_PAGE_SIZE),
                  getAgencyParcelsDaySlice(city, 'destinationCity', s.start, s.end, s.endInclusive, null, FILTERED_PAGE_SIZE),
                ])).flat()
                if (gen !== agencyLoadGenRef.current) return
                loaded += docs.length
                agencyProgressStore.set({ loaded })
                if (docs.length) {
                  for (const d of docs) pending.push(d)
                  // ⚡ Comme le Facturier : 1re journée tout de suite, puis ~1 ajout / 800 ms tant
                  // que moins de ~3 000 expéditions sont affichées ; au-delà, réserve ajoutée EN UNE
                  // FOIS à la fin (chaque ajout recalcule filtres/totaux sur toute la liste).
                  if (shown < 3000 && Date.now() - lastFlush >= APPEND_FLUSH_MS) flush()
                }
              }
              console.log(`✅ [Chef d'agence] Chargement jour par jour terminé: ${loaded} colis (${slices.length} jours)`)
            } catch (err) {
              console.error('[Chef d\'agence] chargement jour par jour error:', err)
            } finally {
              if (gen === agencyLoadGenRef.current) {
                flush()
                gotData()
                setLoadingAllAgency(false)
                agencyProgressStore.reset()
              }
            }
          })()
        }

        unsubscribersRef.current.push(subscribeReturns())
        setPendingAideParcels([])
        return () => {
          agencyLoadGenRef.current += 1 // arrête la lecture jour par jour en cours
          unsubscribersRef.current.forEach(unsub => unsub())
          unsubscribersRef.current = []
          setLoadingAllAgency(false)
          agencyProgressStore.reset()
        }
      }

      const unsubAgency = subscribeAgencyParcels(
        profile.city,
        (data: any, fromCache: boolean) => {
          console.log(`✅ [Chef d'agence] ${data.length} colis chargés pour ${profile.city} (fromCache: ${fromCache})`)

          // ⚠️ NE PAS émettre un événement 'parcelUpdated' par colis ici : à 300 colis cela
          // déclenchait 300 événements, chacun re-mappant 3 tableaux complets — soit un blocage
          // du thread principal à chaque snapshot. setParcels/setLiveParcels ci-dessous
          // appliquent déjà les données fraîches en une seule fois.
          // ⚡ Plus de setParcels(data) ici : la fusion live + « charger plus » (effet plus bas)
          // s'en charge. Le faire ici déclenchait un rendu complet (tri + filtres) avec la liste
          // temps réel SEULE — les colis déjà chargés disparaissant un instant — puis un second.
          setLiveParcels(data)
          setLoadingParcels(false)
          setSyncingParcels(!!fromCache)
          // ⚠️ CORRECTIF : `data` est la fusion DÉDUPLIQUÉE de deux requêtes (envoyés +
          // reçus), chacune plafonnée à effectivePageSize. Sa longueur peut donc être
          // inférieure à effectivePageSize même quand l'une des deux requêtes a atteint sa
          // limite (donc qu'il reste potentiellement plus de données) — comparer le total
          // fusionné à effectivePageSize masquait à tort le bouton "Charger plus". On laisse
          // désormais le clic sur "Charger plus" (via getParcelsPage) déterminer lui-même la
          // fin de liste, ce qu'il fait déjà correctement plus bas.
          if (data.length === 0) setHasMoreAgency(false)
        },
        onError,
        effectivePageSize, // ⚡ 50 ou 1000 selon filtres
        (lastDocs: any) => {
          if (!agencyPagedRef.current) {
            agencyLastDocsRef.current = lastDocs
          }
        },
        filterDateFrom,
        filterDateTo,
        true // 🗄️ archivés inclus (comme Facturier / Ports en compte) : totaux exacts sur toute période
      )

      const unsubReturns = subscribeReturns()

      setPendingAideParcels([]) // Plus de pending
      unsubscribersRef.current.push(unsubAgency, unsubReturns)
      return () => {
        unsubscribersRef.current.forEach(unsub => unsub())
        unsubscribersRef.current = []
      }
    }

    setPendingAideParcels([])
    console.log(`📦 [Agent] Chargement AUTO des colis (filtres côté client)`)
    const unsub = subscribeAgentParcels(uid, (data: any) => {
      console.log(`✅ [Agent] ${data.length} colis chargés (filtres côté client)`)
      setParcels(data)
      setLoadingParcels(false)
    }, onError)
    unsubscribersRef.current.push(unsub)
    return () => {
      unsubscribersRef.current.forEach(unsub => unsub())
      unsubscribersRef.current = []
    }
  }, [needsParcels, profile?.role, profile?.city, authTick, showAllCities, datePreset, dateFrom, dateTo, operationalDay, needsBigPage]) // ⚡ needsBigPage : taille de page 150 → 2000 seulement

  // ⚡ PAGINATION PROGRESSIVE VISIBLE : le premier chargement reste rapide (plafonné à
  // FILTERED_PAGE_SIZE=2000 par requête, voir plus haut), mais si une agence active dépasse ce
  // plafond sur la période sélectionnée (hasMoreAgency reste true), on continue de charger le
  // reste automatiquement en arrière-plan par tranches — au lieu de tronquer silencieusement les
  // totaux (l'ancien comportement) ou de tout charger d'un coup au prix d'une synchronisation de
  // plusieurs secondes (FILTERED_PAGE_SIZE=50000, essayé puis abandonné). Un indicateur visible
  // ("Chargement complet… N colis") informe l'utilisateur pendant que ça se poursuit, et les
  // totaux affichés se complètent progressivement plutôt que de rester figés sur un sous-ensemble.
  // Limité aux vues FILTRÉES (datePreset !== 'all') pour ne pas charger toute l'agence par défaut.
  useEffect(() => {
    if ((profile?.role !== 'chef_agence' && profile?.role !== 'agentpro') || datePreset === 'all' || showAllCities) return
    if (!hasMoreAgency || loadingAllAgency || loadingMoreAgency || !agencyLastDocsRef.current) return
    if (liveParcels.length === 0) return // Attendre le chargement initial
    const timer = setTimeout(() => {
      if (hasMoreAgency && !loadingAllAgency && !loadingMoreAgency && agencyLastDocsRef.current) {
        console.log(`🚀 [Chef d'agence] Démarrage du chargement progressif du reste des colis...`)
        loadAllAgencyParcels()
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [liveParcels.length, hasMoreAgency, loadingAllAgency, profile?.role, datePreset, showAllCities])

  // Fusionner liveParcels et moreParcels pour le chef d'agence et agentpro
  useEffect(() => {
    if (profile?.role === 'chef_agence' || profile?.role === 'agentpro') {
      const map = new Map()
      moreParcels.forEach((p: any) => map.set(p.id, p))
      liveParcels.forEach((p: any) => map.set(p.id, p)) // Temps réel gagne
      const merged = [...map.values()]
      console.log(`📊 [Chef d'agence] Total colis: ${merged.length} (live: ${liveParcels.length}, more: ${moreParcels.length})`)
      setParcels(merged)
    }
  }, [liveParcels, moreParcels, profile?.role])

  // Charger 600 colis de plus pour le chef d'agence
  const loadMoreAgencyParcels = async () => {
    if (!hasMoreAgency || loadingMoreAgency || loadingAllAgency || !agencyLastDocsRef.current || !profile?.city) return
    setLoadingMoreAgency(true)
    const gen = agencyLoadGenRef.current
    try {
      const result = await getMoreAgencyParcels(profile.city, agencyLastDocsRef.current, AGENCY_PAGE_SIZE, agencyDateFilterRef.current.dateFrom, agencyDateFilterRef.current.dateTo, true)
      if (gen !== agencyLoadGenRef.current) return // filtre changé entre-temps : résultat périmé
      agencyPagedRef.current = true
      setMoreParcels(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        result.docs.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      })
      if (result.lastDocs) agencyLastDocsRef.current = result.lastDocs
      if (!result.hasMore) setHasMoreAgency(false)
      console.log(`✅ [Chef d'agence] ${result.docs.length} colis supplémentaires chargés`)
    } catch (err) {
      console.error('[Chef d\'agence] loadMore error:', err)
    } finally {
      setLoadingMoreAgency(false)
    }
  }

  // Charger TOUS les colis du chef d'agence en boucle
  const loadAllAgencyParcels = async () => {
    if (!profile?.city || loadingAllAgency || loadingMoreAgency || !hasMoreAgency || !agencyLastDocsRef.current) return
    setLoadingAllAgency(true)
    agencyProgressStore.set({ loaded: 0, day: null })
    const gen = agencyLoadGenRef.current
    // Bornes figées au lancement : elles doivent correspondre au curseur (même requête).
    const { dateFrom: loopFrom, dateTo: loopTo } = agencyDateFilterRef.current
    // 📅 Les périodes bornées (début ET fin) sont lues jour par jour par l'effet de chargement
    // (voir plus haut) : cette boucle ne sert plus qu'aux plages ouvertes (curseur + tranches).
    try {
      let cursor = agencyLastDocsRef.current
      let more = true
      let loaded = 0
      let safety = 0
      // ⚠️ Tranches de AGENCY_PAGE_SIZE (=50) : pour une agence à plusieurs milliers de colis,
      // ça forçait des dizaines d'allers-retours réseau avant de s'arrêter, même une fois le
      // total réel déjà atteint — d'où un badge "Chargement…" qui semblait tourner pour rien.
      // On réutilise FILTERED_PAGE_SIZE (même ordre de grandeur que le chargement initial) pour
      // finir en 1-2 tranches. Le filtre de date sélectionné doit aussi être transmis ici — il
      // ne l'était pas, cette boucle rechargeait sinon les 30 derniers jours par défaut.
      while (more && cursor && safety < 500) {
        const result = await getMoreAgencyParcels(
          profile.city, cursor, FILTERED_PAGE_SIZE, loopFrom, loopTo, true
        )
        // Filtre changé pendant le chargement : abandonner sans polluer la nouvelle liste
        // (le nouvel abonnement relancera sa propre boucle).
        if (gen !== agencyLoadGenRef.current) return
        agencyPagedRef.current = true
        loaded += result.docs.length
        agencyProgressStore.set({ loaded })
        console.log(`📦 [Chef d'agence] Chargement automatique: +${result.docs.length} colis (total: ${loaded})`)
        setMoreParcels(prev => {
          const map = new Map()
          prev.forEach((p: any) => map.set(p.id, p))
          result.docs.forEach((p: any) => map.set(p.id, p))
          return [...map.values()]
        })
        cursor = result.lastDocs
        more = result.hasMore && !!result.lastDocs
        safety += 1
      }
      if (cursor) agencyLastDocsRef.current = cursor
      setHasMoreAgency(false)
      console.log(`✅ [Chef d'agence] Chargement automatique terminé: ${loaded} colis chargés`)
    } catch (err) {
      console.error('[Chef d\'agence] loadAll error:', err)
    } finally {
      if (gen === agencyLoadGenRef.current) {
        setLoadingAllAgency(false)
        agencyProgressStore.reset()
      }
    }
  }

  // 🌍 Charger plus de colis en mode "Toutes villes" (Agent Pro uniquement)
  const loadMoreAllCitiesParcels = async () => {
    if (!showAllCities || !hasMoreAgency || loadingMoreAgency) return
    if (!allCitiesParcelsLastSnap && !allCitiesArchivesLastSnap) return

    setLoadingMoreAgency(true)
    try {
      console.log(`⏳ [Agent Pro] Chargement du lot suivant... (actuellement: ${allCitiesTotalLoaded})`)

      const result = await loadMoreParcelsWithArchives(
        allCitiesParcelsLastSnap,
        allCitiesArchivesLastSnap,
        liveParcels,
        1000 // Charger par lots de 1000
      )

      setLiveParcels(result.docs)
      setAllCitiesParcelsLastSnap(result.parcelsLastSnap)
      setAllCitiesArchivesLastSnap(result.archivesLastSnap)
      setAllCitiesTotalLoaded(result.totalLoaded)
      setHasMoreAgency(result.canLoadMore)

      console.log(`✅ [Agent Pro] +${result.newItemsCount} nouveaux colis | Total: ${result.totalLoaded}`)
    } catch (err) {
      console.error('[Agent Pro - Chargement progressif] Erreur:', err)
    } finally {
      setLoadingMoreAgency(false)
    }
  }

  useEffect(() => {
    if (profile?.role !== 'chef_agence' || !profile?.city) {
      setModRequests([])
      return
    }
    const unsub = subscribeAgencyModificationRequests(profile.city, setModRequests, err => console.error('subscribeAgencyModificationRequests:', err))
    return () => unsub()
  }, [profile?.role, profile?.city])

  useEffect(() => {
    if (profile?.role === 'chef_agence' || profile?.role === 'agentpro') {
      setSubTab('all')
      // ✅ NE PLUS forcer 'today' - laisser l'utilisateur choisir
      // Le filtre par défaut est 'all' (ligne 291)
    }
  }, [profile?.role])

  // Charger tous les colis d'un livreur quand le filtre livreur change
  useEffect(() => {
    if (driverFilter === 'all' || driverFilter === 'unassigned') {
      setDriverFilteredParcels([])
      setLoadingDriverParcels(false)
      return
    }

    console.log(`🚚 [Filtre livreur] Chargement de tous les colis du livreur ${driverFilter}...`)
    setLoadingDriverParcels(true)

    const unsub = subscribeDeliveryDriverParcels(
      driverFilter,
      (data: any) => {
        console.log(`✅ [Filtre livreur] ${data.length} colis chargés pour le livreur`)
        setDriverFilteredParcels(data)
        setLoadingDriverParcels(false)
      },
      (err: any) => {
        console.error('Erreur chargement colis livreur:', err)
        setLoadingDriverParcels(false)
      },
      1000 // Charger jusqu'à 1000 colis du livreur
    )

    return () => unsub()
  }, [driverFilter])

  useEffect(() => {
    if (profile?.city) setForm(p => ({ ...p, senderCity: profile.city }))
  }, [profile?.city])

  useEffect(() => {
    setHasMoreParcels(parcels.length >= 200)
    // ⚡ Garder la MÊME référence si déjà vide : un nouveau [] à chaque changement de `parcels`
    // invalidait allDisplayParcels → re-tri + re-filtrage complets dans un rendu supplémentaire.
    setExtraParcels(prev => (prev.length ? [] : prev))
  }, [parcels])

  // Reset to page 1 when any filter changes
  // ⚠️ CORRECTIF : cette liste omettait operationalDay, destinationCityFilter, driverFilter,
  // portTypeFilter, encaissementFilter, codDocumentStatusFilter et dateFilterType — en changeant
  // l'un de ces filtres depuis une page &gt; 0, la page restait clampée sur une tranche
  // intermédiaire/finale des nouveaux résultats au lieu de revenir au début, donnant
  // l'impression que des expéditions avaient disparu.
  useEffect(() => {
    setParcelPage(0)
  }, [datePreset, dateFrom, dateTo, operationalDay, dateFilterType, subTab, serviceFilter, parcelStatusFilter,
      parcelDirection, parcelEditorFilter, destinationCityFilter, driverFilter, portTypeFilter,
      encaissementFilter, encaissementTypesFilter, codDocumentStatusFilter, debouncedSearch])

  // Fetch accurate agency stats when chef opens the home tab
  // ⚡ Mis en cache 2 min : 4 requêtes de comptage serveur, inutile de les relancer
  // à chaque retour sur l'Accueil pendant qu'on navigue entre les onglets.
  const statsCacheRef = useRef<{ city: string; at: number } | null>(null)
  useEffect(() => {
    if (tab !== 'home' || profile?.role !== 'chef_agence' || !profile?.city) return
    const cache = statsCacheRef.current
    if (cache && cache.city === profile.city && Date.now() - cache.at < 120000) return
    let cancelled = false
    getAccurateAgencyStats(profile.city)
      .then(stats => {
        if (cancelled) return
        statsCacheRef.current = { city: profile.city, at: Date.now() }
        setAccurateStats(stats)
      })
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
  // ⚡ OPTIMISATION : Retarder de 2 secondes pour affichage rapide initial
  useEffect(() => {
    if (!profile?.city) return
    const isAide = profile.role === 'aide_agent'
    if (isAide) return

    const unsubscribers: (() => void)[] = []

    // ⏱️ Délai de 2s pour afficher l'interface rapidement
    const delayTimer = setTimeout(() => {
      const onErr = (label: any) => (err: any) => {
        console.error(`AgentPage ${label}:`, err)
        if (err.code === 'permission-denied') {
          auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
        }
      }
      unsubscribers.push(subscribeArrivages(profile.city, setArrivages, onErr('subscribeArrivages')))
      unsubscribers.push(subscribeBonRamasageBatches(profile.city, setBonBatches, onErr('subscribeBonRamasageBatches')))
      if (profile.role === 'chef_agence' || profile.role === 'agentpro') {
        unsubscribers.push(subscribeAgentNotesByCity(profile.city, setAgentNotes, onErr('subscribeAgentNotes')))
        unsubscribers.push(subscribeAllUsers(setUsers, onErr('subscribeAllUsers')))
      }

      const mergeTransit = (() => {
        let normal: any[] = [], retour: any[] = []
        const merge = () => {
          // Dédoublonnage par id : un même colis ne doit jamais compter deux fois dans le badge
          const uniq = new Map<string, any>()
          // + exclusion des colis déjà réceptionnés/assignés/livrés dont le statut est resté « En transit »
          ;[...normal, ...retour].filter(p => isAwaitingArrival(p, profile?.city)).forEach(p => uniq.set(p.id, p))
          const list = [...uniq.values()]
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
      const unsubT1 = onSnapshot(q1, snap => mergeTransit.setNormal(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onErr('subscribeTransitNormal'))
      const unsubT2 = onSnapshot(q2, snap => mergeTransit.setRetour(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onErr('subscribeTransitRetour'))
      unsubscribers.push(unsubT1, unsubT2)
    }, 2000)

    return () => {
      clearTimeout(delayTimer)
      unsubscribers.forEach(unsub => unsub())
    }
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
    // 👥 Clients : collection entière sans limite — chargée seulement pour les onglets qui l'exploitent
    if (['new', 'clients', 'invoices', 'clientportdu'].includes(tab) && !started.clients) {
      started.clients = [subscribeClients(setClients, onErr('subscribeClients'))]
    }
    if (tab === 'caisse' && !started.caisse) {
      started.caisse = [
        subscribeCaisseByCity(profile.city, (data: any) => setAgentEntries(data), onErr('subscribeCaisseByCity')),
        subscribeBankDepositsByCity(profile.city, setBankDeposits, onErr('subscribeBankDepositsByCity')),
        subscribeAgencyCash(profile.city, setAgencyCash, onErr('subscribeAgencyCash')),
        subscribeAgentCashRecoveryRequests(profile.city, setCashRecoveryRequests, onErr('subscribeAgentCashRecoveryRequests')),
        (profile.role === 'chef_agence' || profile.role === 'agentpro') ? subscribeDriverVersements(profile.city, setDriverVersements, onErr('subscribeDriverVersements')) : null,
      ].filter(Boolean)
    }
    if (tab === 'charge' && !started.charge && (profile?.role === 'chef_agence' || profile?.role === 'agentpro')) {
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

  // 💰 RETOUR FOND : listeners actifs UNIQUEMENT pendant que l'onglet est ouvert.
  // Sans ce cleanup, chaque mise à jour continuait à re-rendre AgentPage — et donc
  // l'onglet affiché — longtemps après avoir quitté la page.
  useEffect(() => {
    if (tab !== 'cod' || !profile?.city || profile?.role === 'aide_agent') return
    const started = _agentLazyStarted.current
    const codUid = auth.currentUser?.uid
    const onErr = (label: string) => (err: any) => {
      console.error(`AgentPage ${label}:`, err)
      if (err.code === 'permission-denied') auth.currentUser?.getIdToken(true).then(() => setAuthTick(t => t + 1)).catch(() => {})
    }
    const isChef = profile.role === 'chef_agence' || profile.role === 'agentpro'
    const subs = [
      codUid ? subscribeAgentCodRequests(codUid, setAgentCodRequests, onErr('subscribeAgentCodRequests')) : null,
      // Ne pas doubler un listener déjà ouvert par un autre onglet
      started.caisse ? null : subscribeBankDepositsByCity(profile.city, setBankDeposits, onErr('subscribeBankDepositsByCity')),
      (isChef && !started.charge) ? subscribeRapports(profile.city, setPointeurRapports, onErr('subscribeRapports')) : null,
      (isChef && !started.charge) ? subscribeAllReglements(profile.city, setPointeurReglements, onErr('subscribeAllReglements')) : null,
      (isChef && !started.charge) ? subscribeSourceReglements(profile.city, setSourcePointeurReglements, onErr('subscribeSourceReglements')) : null,
    ].filter(Boolean) as any[]
    return () => subs.forEach(unsub => unsub?.())
  }, [tab, profile?.city, profile?.role, authTick])

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
    codEditModal, setCodEditModal,  // 💰 Édition rapide COD
    deleteConfirm, setDeleteConfirm,
    codeModal, setCodeModal,
    // transport / delivery
    transportModal, setTransportModal,
    bulkLoadSelectedIds, setBulkLoadSelectedIds,
    bulkLoadName, setBulkLoadName,
    bulkLoadPhone, setBulkLoadPhone,
    bulkLoadBusy, setBulkLoadBusy,
    bulkLoadError, setBulkLoadError,
    bulkAssignSelectedIds, setBulkAssignSelectedIds,
    bulkAssignDriverId, setBulkAssignDriverId,
    bulkAssignSectorId, setBulkAssignSectorId,
    bulkAssignBusy, setBulkAssignBusy,
    bulkAssignError, setBulkAssignError,
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
    codLoadAllProgress, setCodLoadAllProgress,
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
    handleAssignTransport, handleBulkLoadTransport, handleBulkAssignDriver, handleAssignDelivery, handleChefPointParcel,
    handleAgentCollectCod, handleAgentCollectPort,
    handleDirectCashierTransfer, handleRequestCashRecovery, handleAdminTransfer,
    handleDeleteAgentOperations, handleDeleteCashierHistory,
    patchAllCod, handleRemitCod, handleSettleCod, handleLoadAllCod, handleReplyCodRequest,
    handleSettleCodFromRequest, handleBatchSettle, findSourceReglementForParcel, openReceiveModal,
    getCentralDepositEligibleCods, handleCentralCodDeposit, handleReceptionCod, handleCancelCodRemise,
    handleReceiveCodFromDriver, handleConfirmDriverVersement, handleReceivePortDuEspeces,
    handleMarkSentToSource, handleBankDeposit, handleConfirmReceived,
    handleCreateInlineClient, handleAgentCreateClient,
    handlePrint, handlePrintCharge, handlePrintTable, handlePrintBonRamassage, handlePrintTicket,
    handleCreateDriver, handleEditDriver,
    azertyFix, needsAzertyFix, normalizeScanText: _normScanText, normalizeScanLoose: _normScanLoose,
    findScannedParcel, doScan, openScanModal,
    handleSubmit, openEditModal, handleEditClick, handleDeleteClick, confirmDelete,
    handleCodeVerify, handleEditSave, handleSaveCodAmount, handleCreateReturnParcel, handleReturnDirect, submitReturnWithReason,
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
      // senderNic: NE PAS auto-remplir - chaque expédition a son propre N° EXP
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
      normIncludes(c.name, s) || c.tel?.includes(s) || normIncludes(c.nic, s)
    )
  })()
  const ef = (field: any) => (e: any) => setEditForm((p: any) => ({ ...p, [field]: e.target.value }))

  const allDisplayParcels = useMemo(() => {
    const map = new Map()
    // ⚠️ extraParcels (lot "Charger plus", lecture ponctuelle) D'ABORD : les listes temps réel
    // (parcels, returnParcels) doivent l'emporter, sinon une ancienne copie masquait la valeur
    // réellement en base (montant RF, type de service…).
    ;(extraParcels || []).forEach(p => map.set(p.id, p))
    ;(parcels || []).forEach(p => map.set(p.id, p))
    ;(returnParcels || []).forEach(p => map.set(p.id, p))
    // Si un livreur est filtré, inclure ses colis (filtrés par date opérationnelle si actif)
    if (driverFilter !== 'all' && driverFilter !== 'unassigned') {
      let driverParcels = driverFilteredParcels || []
      // ⚠️ FILTRE CRITIQUE: Si le jour d'opération est sélectionné, ne garder QUE les colis de ce jour
      if (datePreset === 'operational' && operationalDay) {
        const { start: opStart, end: opEnd } = getOperationalDayRange(operationalDay)
        driverParcels = driverParcels.filter((p: any) => {
          const pDate = p.createdAt?.toDate?.() || new Date(0)
          return pDate >= opStart && pDate <= opEnd
        })
      }
      driverParcels.forEach(p => map.set(p.id, p))
    }
    // ⚡ Même ordre (createdAt décroissant, tri stable) mais chaque date n'est convertie qu'une fois
    return sortByCreatedAtDesc([...map.values()])
  }, [parcels, returnParcels, extraParcels, driverFilter, driverFilteredParcels, datePreset, operationalDay])

  const profileCity = profile?.city
  const profileRole = profile?.role

  // 🏬 « En gare - ville » : toutes les expéditions ARRIVÉES en attente (hors fenêtre de dates)
  const garePendingList = useGarePending(
    (profile?.role === 'chef_agence' || profile?.role === 'agentpro') ? profile?.city : undefined)

  // ⚡ Filtrage en priorité BASSE (comme le Facturier) : la frappe, les clics sur les filtres et
  // l'arrivée de nouvelles journées restent fluides ; React calcule la nouvelle liste filtrée
  // (≈30 ms sur 15 000 expéditions, ≈90 ms avec un terme de recherche) dans un rendu
  // interruptible. Même résultat final.
  const fSearch = useDeferredValue(debouncedSearch)
  const fAllDisplay = useDeferredValue(allDisplayParcels)
  const filteredParcels = useMemo(() => {
    // 🔍 Si recherche serveur active, utiliser ses résultats en priorité
    const isGareFilter = driverFilter === 'unassigned' && (profileRole === 'chef_agence' || profileRole === 'agentpro') && !!profileCity
    // Les résultats de recherche serveur sont une lecture ponctuelle : si le colis est aussi dans
    // une liste temps réel (listener), c'est la version temps réel qui est affichée.
    const liveById = (fSearch && serverSearchResults !== null)
      ? new Map<string, any>([...(fAllDisplay || []), ...(garePendingList || [])].map((p: any) => [p.id, p]))
      : null
    // 🔍 La recherche serveur compare senderNameLower/receiverNameLower tels quels (préfixe) : elle
    // rate les variantes d'écriture (« COPÏMA », nom modifié après coup, clientName…). On complète
    // donc avec les colis DÉJÀ chargés pour la période dont un NOM (client, expéditeur, destinataire
    // selon searchScope) commence par le terme, accents/casse/espaces ignorés (utils/billingAgency) —
    // sinon le décompte d'un client différait du Facturier.
    const baseSource = (fSearch && serverSearchResults !== null)
      ? (() => {
          const out = new Map<string, any>(serverSearchResults.map((p: any) => [p.id, liveById!.get(p.id) || p]))
          const q = normName(fSearch)
          if (q) liveById!.forEach((p: any, id: string) => {
            if (out.has(id)) return
            const names = searchScope === 'sender' ? [p.clientName, p.sender?.name]
              : searchScope === 'receiver' ? [p.receiver?.name]
                : [p.clientName, p.sender?.name, p.receiver?.name]
            if (names.some((n: any) => normName(n).startsWith(q))) out.set(id, p)
          })
          return [...out.values()]
        })()
      : fAllDisplay
    // 🏬 Filtre « En gare - ville » : on ajoute TOUS les colis arrivés en attente (hors fenêtre de dates),
    // puis les autres filtres (direction, origine/destination, service, port…) s'appliquent normalement.
    // ⚡ Set d'ids : l'ancien .some() imbriqué parcourait toute la liste pour CHAQUE colis en gare.
    const displayedIds = isGareFilter && !(fSearch && serverSearchResults !== null)
      ? new Set((fAllDisplay || []).map((q: any) => q.id))
      : null
    const gareExtra = displayedIds
      ? garePendingList.filter((p: any) => !displayedIds.has(p.id))
      : []
    const sourceData = gareExtra.length ? [...baseSource, ...gareExtra] : baseSource

    // 📅 Extracteur de date selon le type de filtre (création/livraison)
    const dateExtractor = dateFilterType === 'livraison'
      ? (p: any) => {
          if (!p.deliveredAt) return new Date(0) // Pas de date de livraison
          // ⚠️ deliveredAt est parfois un Timestamp Firestore (pas toujours une chaîne ISO)
          if (p.deliveredAt?.toDate) return p.deliveredAt.toDate()
          return new Date(p.deliveredAt)
        }
      : parcelDate

    // 🔍 La recherche serveur (par nom expéditeur/destinataire, NIC, tracking...) respecte
    // désormais le filtre de date/période actif, comme la recherche locale du tableau — sinon
    // un colis trouvé par nom pouvait s'afficher hors de la période sélectionnée, ce qui ne
    // correspondait plus au contexte affiché (totaux, période) du reste de la page.
    // 🏬 « En gare » : même filtre de date que tous les autres livreurs (date de création / jour d'opération)
    const dateFilteredData = filterByDate(sourceData, datePreset, dateFrom, dateTo, dateExtractor, operationalDay)

    // 🔍 Prédicat de recherche locale construit UNE fois par recalcul (champs normalisés en cache)
    const agentSearchMatch = (fSearch && serverSearchResults === null)
      ? makeAgentSearchMatcher(fSearch.toLowerCase(), searchScope)
      : null

    const filtered = dateFilteredData.filter((p: any) => {
    // 🔒 FILTRE VILLE OBLIGATOIRE (sauf en mode "Toutes les villes")
    // Le chef d'agence ne voit QUE les colis de sa ville, SAUF si showAllCities est activé
    if (!showAllCities && profileCity && (profileRole === 'chef_agence' || profileRole === 'agentpro')) {
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
    if ((profileRole === 'chef_agence' || profileRole === 'agentpro') && parcelEditorFilter !== 'all') {
      const isAideEntry = p.agentRole === 'aide_agent'
      const isChefEntry = p.agentRole === 'chef_agence' || p.agentRole === 'agentpro' || p.agentId === uid
      if (parcelEditorFilter === 'chef' && !isChefEntry) return false
      if (parcelEditorFilter === 'aide' && !isAideEntry) return false
    }
    if (serviceFilter !== 'all' && p.serviceType !== serviceFilter) {
      return false
    }
    if (parcelStatusFilter !== 'all' && p.status !== parcelStatusFilter) {
      return false
    }
    // Filtre de direction (Envoyés/Reçus) - SEULEMENT si "Ma ville uniquement"
    // Avec "Toutes les villes", ce filtre n'a pas de sens (tous les colis sont envoyés de quelque part et reçus quelque part)
    if (!showAllCities && profileCity) {
      if (parcelDirection === 'sent') {
        // Envoyés : colis créés/envoyés DEPUIS ma ville
        const isSentFromMyCity = p.sender?.city === profileCity || p.originCity === profileCity
        if (!isSentFromMyCity) return false
      } else if (parcelDirection === 'received') {
        // Reçus : colis qui arrivent DANS ma ville
        const isReceivedInMyCity = (p.destinationCity === profileCity || p.receiver?.city === profileCity)
          && isParcelVisibleInDestinationAgency(p)
        if (!isReceivedInMyCity) return false
      } else if (parcelDirection === 'all') {
        // Tous : colis envoyés DE ma ville OU reçus DANS ma ville
        const isSentFromMyCity = p.sender?.city === profileCity || p.originCity === profileCity
        const isReceivedInMyCity = (p.destinationCity === profileCity || p.receiver?.city === profileCity)
          && isParcelVisibleInDestinationAgency(p)
        if (!isSentFromMyCity && !isReceivedInMyCity) return false
      }
    }
    // ⭐ Filtre par ville de destination / expédition
    if (destinationCityFilter !== 'all') {
      if (parcelDirection === 'all') {
        // Pour "Tous", chercher dans origine OU destination
        const matchesOrigin = (p.originCity || p.sender?.city) === destinationCityFilter
        const matchesDest = (p.destinationCity || p.receiver?.city) === destinationCityFilter
        if (!matchesOrigin && !matchesDest) return false
      } else {
        // Si direction "Reçus", filtrer par ville d'origine (expédition)
        // Sinon, filtrer par ville de destination
        const cityToFilter = parcelDirection === 'received'
          ? (p.originCity || p.sender?.city)
          : (p.destinationCity || p.receiver?.city)
        if (cityToFilter !== destinationCityFilter) return false
      }
    }
    // ⭐ Filtre par livreur/chauffeur
    if (driverFilter !== 'all') {
      if (driverFilter === 'unassigned') {
        // « 🏬 En gare - ville » : expéditions ARRIVÉES en attente (sans livreur ou tenues par le compte en gare)
        if (isGareFilter) {
          if (!isGarePending(p, profileCity)) return false
        } else if (p.deliveryDriverId || p.chauffeurId) {
          return false
        }
      } else {
        // Filtre par livreur spécifique
        const matchesDriver = p.deliveryDriverId === driverFilter || p.chauffeurId === driverFilter
        if (!matchesDriver) return false
      }
    }
    // ⭐ Filtre par type de port
    if (portTypeFilter !== 'all' && p.portType !== portTypeFilter) {
      return false
    }
    // 💼 Ports en compte (direction « Tous ») : seulement ceux FACTURÉS par l'agence — compte
    // expéditeur à l'origine, compte destinataire à la destination — même règle que la page
    // Ports en compte, les totaux « En compte » ci-dessous et le Facturier (utils/billingAgency).
    // Ex. un compte expéditeur Agadir → Casablanca (facturé à Agadir) ne compte plus à Casablanca.
    // Les directions explicites « Envoyés »/« Reçus » gardent l'affichage par mouvement.
    if ((portTypeFilter === 'port_en_compte_expediteur' || portTypeFilter === 'port_en_compte_destinataire')
      && !showAllCities && profileCity && parcelDirection === 'all'
      && (profileRole === 'chef_agence' || profileRole === 'agentpro')
      && !isBilledByAgency(p, profileCity)) {
      return false
    }
    // ⭐ Filtre par type d'encaissement : sélection MULTIPLE (espèces/chèque/traite combinés)
    // prioritaire si active, sinon repli sur l'ancien filtre exclusif (Tous/Simple).
    if (encaissementTypesFilter.length > 0) {
      if (!encaissementTypesFilter.includes(p.serviceType)) return false
    } else if (encaissementFilter !== 'all') {
      if (encaissementFilter === 'simple' && p.codAmount > 0) return false
      if (encaissementFilter === 'especes' && p.serviceType !== 'especes') return false
      if (encaissementFilter === 'cheque' && p.serviceType !== 'cheque') return false
      if (encaissementFilter === 'traite' && p.serviceType !== 'traite') return false
    }
    // ⭐ Filtre par statut document COD (sélection multiple)
    if (codDocumentStatusFilter.length > 0) {
      // "simple" = chèque ou traite sans statut défini
      const hasStatus = p.codDocumentStatus || (
        (p.serviceType === 'cheque' || p.serviceType === 'traite') ? 'simple' : null
      )
      if (!hasStatus || !codDocumentStatusFilter.includes(hasStatus)) {
        return false
      }
    }
    if (fSearch) {
      // Si on utilise serverSearchResults, pas besoin de refiltrer par recherche
      // (déjà fait par searchParcels côté serveur)
      if (serverSearchResults !== null) {
        return true
      }
      // Sinon, recherche locale dans les colis chargés
      const searchLower = fSearch.toLowerCase()

      // Recherche spéciale pour chèques/traites : "c" suivi du montant
      if (searchLower.startsWith('c') && searchLower.length > 1) {
        const amountStr = searchLower.substring(1).trim()
        if (/^\d+$/.test(amountStr)) {
          // C'est une recherche de type "c150"
          const isCheckOrTraite = p.serviceType === 'cheque' || p.serviceType === 'traite' || p.serviceType === 'especes'
          const amountMatch = Math.floor(p.codAmount || 0).toString().includes(amountStr)
          return isCheckOrTraite && amountMatch
        }
      }

      // Recherche normale
      // ⚠️ En scope restreint (sender/receiver), on retire les champs nom/tél/ville de l'AUTRE
      // partie — sinon un colis remontait ici même quand seul le destinataire (ou l'expéditeur)
      // portait le nom cherché, malgré le choix "Expéditeur seul"/"Destinataire seul".
      // Champs : id, trackingId, NIC + (expéditeur : client, nom, tél, ville) + (destinataire : nom, tél, ville)
      return agentSearchMatch ? agentSearchMatch(p) : true
    }
    return true
    })

    return filtered
  }, [fAllDisplay, datePreset, dateFrom, dateTo, dateFilterType, operationalDay, profileCity, profileRole, subTab, uid, serviceFilter,
       parcelStatusFilter, parcelDirection, parcelEditorFilter, destinationCityFilter, driverFilter, portTypeFilter, encaissementFilter, encaissementTypesFilter, codDocumentStatusFilter, fSearch, serverSearchResults, showAllCities, garePendingList, searchScope])

  // 📊 Nombre d'expéditions affichées : UNE expédition = UNE ligne = compte 1.
  // ⚠️ Avant, pour la direction « Tous », un colis LOCAL (ville d'expédition = ville de destination) était
  // compté 2 fois (1 envoi + 1 réception), alors qu'il n'apparaît qu'une seule fois dans la liste.
  const parcelMovementCount = useMemo(() => filteredParcels.length, [filteredParcels])

  // ⚠️ Ancien "scroll automatique vers le haut après filtrage" retiré : il se déclenchait à
  // CHAQUE changement de filtre (y compris la date, malgré le commentaire qui prétendait
  // l'exclure) et faisait sauter la page loin des contrôles de filtre que l'utilisateur
  // venait justement de manipuler. On laisse maintenant le scroll là où l'utilisateur l'a mis.

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

  const inputCls  = "w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-blue-500 focus:outline-none transition bg-white"
  const selectCls = inputCls + " appearance-none cursor-pointer"


  // ── Permission helpers ─────────────────────────────────────────────────────
  const sameCity = (a: any, b: any) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  const isParcelCreator = (parcel: any) => !!uid && parcel?.agentId === uid
  const isChefAgencyAideParcel = (parcel: any) =>
    (profile?.role === 'chef_agence' || profile?.role === 'agentpro') &&
    (parcel?.agentRole === 'aide_agent' || parcel?.agentRole === 'client_portal') &&
    (parcel?.originCity === profile?.city || parcel?.sender?.city === profile?.city ||
      allUsers.find((u: any) => u.id === parcel?.agentId)?.city === profile?.city)
  const canActAsParcelOwner = (parcel: any) => isParcelCreator(parcel) || isChefAgencyAideParcel(parcel)
  const canEditParcelDetails = (parcel: any) => {
    // 👑 Admin peut TOUJOURS éditer
    if (profile?.role === 'admin') return true

    // 🔒 VERROUILLAGE: Si colis chargé dans camion (shipmentLoadedAt existe),
    // SEUL admin peut modifier les données du bon
    if (parcel?.shipmentLoadedAt) return false

    if (!canActAsParcelOwner(parcel)) return false

    // NOUVELLE POLITIQUE : Aide-agent ne peut éditer que si colis PAS chargé
    if (profile?.role === 'aide_agent' && isAideParcelLockedForEdit(parcel)) {
      return false // Verrouillé pour aide-agent
    }

    // Chef peut toujours éditer (sauf si livré/retourné)
    return !['Livré', 'Retourné', 'Retour en transit'].includes(parcel?.status)
  }

  // ⭐ Vérifier si un champ spécifique peut être modifié selon les permissions Admin
  const canEditField = (fieldPath: string) => {
    // Admin peut TOUJOURS tout modifier
    if (profile?.role === 'admin') return true

    // Chef d'agence: vérifier les permissions configurées
    if (profile?.role === 'chef_agence') {
      return editPermissions?.chef_agence?.includes(fieldPath) ?? false
    }

    // Agent Pro: mêmes permissions que chef d'agence
    if (profile?.role === 'agentpro') {
      return editPermissions?.agentpro?.includes(fieldPath) ?? false
    }

    // Aide agent: vérifier les permissions configurées
    if (profile?.role === 'aide_agent') {
      return editPermissions?.aide_agent?.includes(fieldPath) ?? false
    }

    // Agent: correction de SES propres bons (le bouton Modifier n'apparaît que pour le créateur,
    // et firestore.rules n'autorise que le créateur). Liste configurable via editPermissions.agent,
    // sinon champs du bon + COD (pas le type de port ni le statut, gérés par le chef).
    if (profile?.role === 'agent') {
      const agentFields: string[] = Array.isArray(editPermissions?.agent) ? editPermissions.agent : [
        'sender.name', 'sender.nic', 'sender.tel', 'sender.city', 'sender.address',
        'receiver.name', 'receiver.tel', 'receiver.city', 'receiver.address',
        'weight', 'nbColis', 'serviceType', 'codAmount', 'price', 'notes', 'fragile',
      ]
      return agentFields.includes(fieldPath)
    }

    // Par défaut: pas autorisé
    return false
  }

  // ⭐ Vérifier si une action peut être effectuée selon les permissions Admin
  const canPerformAction = (action: string) => {
    // Admin peut TOUJOURS tout faire
    if (profile?.role === 'admin') return true

    // Chef d'agence: vérifier les permissions configurées
    if (profile?.role === 'chef_agence') {
      return actionPermissions?.chef_agence?.includes(action) ?? false
    }

    // Agent Pro: mêmes permissions que chef d'agence
    if (profile?.role === 'agentpro') {
      return actionPermissions?.agentpro?.includes(action) ?? false
    }

    // Par défaut: pas autorisé
    return false
  }

  const canManageStatus = (parcel: any) =>
    profile?.role === 'admin' || profile?.role === 'chef_agence' || profile?.role === 'agentpro' || isParcelCreator(parcel)
  const canManageReturnDelivery = (_parcel: any) =>
    profile?.role === 'chef_agence' || profile?.role === 'agentpro' || profile?.role === 'admin'
  const isReturnOriginCity = (parcel: any) =>
    parcel?.returnToCity === profile?.city || parcel?.sender?.city === profile?.city
  const canManageDeliveryAssignment = (_parcel: any) =>
    profile?.role === 'chef_agence' || profile?.role === 'agentpro' || profile?.role === 'admin' || profile?.role === 'directeur'
  const isPointedForDelivery = (parcel: any) =>
    parcel?.status === 'Arrivé en agence' &&
    (parcel?.chefPointedAt || parcel?.destinationArrivedAt)
  const canLoadTransportParcel = (parcel: any) =>
    (profile?.role === 'agent' || profile?.role === 'chef_agence' || profile?.role === 'agentpro' || profile?.role === 'admin') &&
    parcel?.status === 'Initialisé'
  // NOUVELLE POLITIQUE : Plus de validation requise
  // Un colis d'aide-agent est "verrouillé" seulement si chargé (transportAssignedAt existe)
  const isAideParcelLockedForEdit = (p: any) => {
    // Verrouillé SEULEMENT si le colis est vraiment chargé dans le camion (en transit)
    // Pas juste assigné, mais chargé et parti
    return !!p.shipmentLoadedAt
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
  const aideParcelsFor = (aideId: string) => parcels.filter((p: any) => p.createdBy === aideId || p.agentId === aideId)

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
      if (!normIncludes(p.trackingId || '', q) &&
          !normIncludes(p.sender?.name || '', q) &&
          !normIncludes(arrNexp(p) || '', q)) return false
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
      setGlobalScanModal(found)
      return
    }

    // Si pas trouvé localement, rechercher dans la base
    try {
      const result = await searchParcelByTrackingId(barcode)
      if (result) {
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

  // 🔄 TEMPS RÉEL: Écouter les événements de mise à jour de parcels
  // ✅ CORRECTION: Utiliser useCallback pour stabiliser le handler et éviter les re-renders inutiles
  const handleParcelUpdate = useCallback((event: CustomEvent) => {
    const { parcelId, timestamp } = event.detail
    // updateParcelStatus émet { data } sans `source` (écriture déjà faite en base) : même
    // traitement que 'database' — nécessaire pour les périodes lues ponctuellement (pas d'écoute
    // temps réel sur les journées passées).
    const updates = event.detail.updates ?? event.detail.data
    const source = event.detail.source ?? (event.detail.data ? 'database' : undefined)

    console.log('🔄 [Temps réel] Événement parcelUpdated reçu:', {
      parcelId,
      source,
      timestamp,
      updates
    })

    // Les mises à jour depuis Firestore (subscription ou écriture directe) ont priorité absolue
    if (source === 'firestore' || source === 'database') {
      // Valeurs réellement écrites : deleteField() → undefined, autres sentinelles
      // (serverTimestamp, arrayUnion…) ignorées ici (le listener apportera la valeur finale).
      const clean: Record<string, any> = {}
      Object.entries(updates || {}).forEach(([k, v]: [string, any]) => {
        if (k === '_optimisticUpdate') return
        if (v instanceof FieldValue) {
          if (v.isEqual(deleteField())) clean[k] = undefined
          return
        }
        clean[k] = v
      })
      const patchList = (prev: any[]) => {
        if (!Array.isArray(prev) || !prev.some(p => p?.id === parcelId)) return prev
        // replace : document COMPLET venant du serveur (écoute des lignes affichées) → remplacé tel
        // quel, pour qu'un champ supprimé en base ne reste pas affiché.
        return prev.map(p => (p?.id === parcelId ? (event.detail.replace ? { id: parcelId, ...clean } : { ...p, ...clean }) : p))
      }
      // Sources NON temps réel (lots "Charger plus", résultats de recherche serveur) :
      // sans ce patch elles gardaient l'ancienne valeur (ex. RF 9000 DH affiché alors que
      // la base contient 2000 DH).
      setMoreParcels(patchList)
      setExtraParcels(patchList)
      setDriverFilteredParcels(patchList)
      setServerSearchResults(prev => (prev ? patchList(prev) : prev))

      setParcels(patchList)
      setLiveParcels(patchList)
      setReturnParcels(patchList)

      console.log(`✅ [Temps réel] Mise à jour ${source} appliquée pour parcel:`, parcelId)
    } else if (source === 'optimistic') {
      // Les mises à jour optimistes sont déjà gérées par updateParcelOptimistic dans ce composant
      // Mais cet événement permet la sync cross-tab pour d'autres instances ouvertes
      console.log('⏩ [Temps réel] Mise à jour optimiste cross-tab pour parcel:', parcelId)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('parcelUpdated', handleParcelUpdate as EventListener)

    return () => {
      window.removeEventListener('parcelUpdated', handleParcelUpdate as EventListener)
    }
  }, [handleParcelUpdate])

  // 📄 Charger plus de colis avec filtre de date
  const handleLoadMoreWithDateFilter = async () => {
    if (!lastSnapWithDateFilter || loadingMoreWithDateFilter) return

    setLoadingMoreWithDateFilter(true)

    try {
      const dateFromObj = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
      const dateToObj = dateTo ? new Date(dateTo + 'T23:59:59') : null

      const result = await loadMoreParcelsWithDateFilter(lastSnapWithDateFilter, {
        pageSize: FILTERED_PAGE_SIZE,
        dateFrom: dateFromObj,
        dateTo: dateToObj
      })

      if (result.docs.length > 0) {
        // Ajouter les nouveaux colis à la liste existante
        const newTotal = parcels.length + result.docs.length
        setParcels(prev => [...prev, ...result.docs])
        setLiveParcels(prev => [...prev, ...result.docs])
        setLastSnapWithDateFilter(result.lastSnap)
        setHasMoreWithDateFilter(result.hasMore)

        console.log(`📄 ${result.docs.length} colis supplémentaires chargés (total: ${newTotal})`)
      } else {
        setHasMoreWithDateFilter(false)
      }
    } catch (error) {
      console.error('Erreur chargement colis supplémentaires:', error)
    } finally {
      setLoadingMoreWithDateFilter(false)
    }
  }

  // 🔵 Charge automatiquement TOUT le reste (mode "Toutes les villes") par tranches de
  // FILTERED_PAGE_SIZE, avec progression visible — même principe que loadAllAgencyParcels.
  const loadAllCitiesParcels = async () => {
    if (!showAllCities || loadingAllCities || loadingMoreWithDateFilter || !hasMoreWithDateFilter || !lastSnapWithDateFilter) return
    setLoadingAllCities(true)
    setLoadAllCitiesProgress(0)
    try {
      const dateFromObj = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
      const dateToObj = dateTo ? new Date(dateTo + 'T23:59:59') : null
      let cursor = lastSnapWithDateFilter
      let more = true
      let loaded = 0
      let safety = 0
      while (more && cursor && safety < 500) {
        const result = await loadMoreParcelsWithDateFilter(cursor, {
          pageSize: FILTERED_PAGE_SIZE, dateFrom: dateFromObj, dateTo: dateToObj
        })
        if (result.docs.length > 0) {
          setParcels(prev => [...prev, ...result.docs])
          setLiveParcels(prev => [...prev, ...result.docs])
          loaded += result.docs.length
          setLoadAllCitiesProgress(loaded)
        }
        cursor = result.lastSnap
        more = result.hasMore && !!result.lastSnap
        safety += 1
      }
      setLastSnapWithDateFilter(cursor)
      setHasMoreWithDateFilter(false)
      console.log(`✅ [Agent Pro] Chargement progressif terminé: ${loaded} colis chargés`)
    } catch (err) {
      console.error('[Agent Pro] loadAllCities error:', err)
    } finally {
      setLoadingAllCities(false)
    }
  }

  // Déclenchement automatique dès qu'il reste des données à charger (vue filtrée uniquement)
  useEffect(() => {
    if (!showAllCities || datePreset === 'all') return
    if (!hasMoreWithDateFilter || loadingAllCities || loadingMoreWithDateFilter || !lastSnapWithDateFilter) return
    if (parcels.length === 0) return // Attendre le chargement initial
    const timer = setTimeout(() => {
      if (hasMoreWithDateFilter && !loadingAllCities && !loadingMoreWithDateFilter) {
        console.log(`🚀 [Agent Pro] Démarrage du chargement progressif du reste des colis...`)
        loadAllCitiesParcels()
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [parcels.length, hasMoreWithDateFilter, showAllCities, datePreset])

  // Mise à jour optimiste d'un parcel (pour affichage instantané)
  const updateParcelOptimistic = (parcelId: string, updates: Record<string, any>) => {
    const timestamp = new Date().toISOString()

    // Mise à jour optimiste locale
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, ...updates, _optimisticUpdate: timestamp } : p))
    setLiveParcels(prev => prev.map(p => p.id === parcelId ? { ...p, ...updates, _optimisticUpdate: timestamp } : p))

    // Émettre un événement pour synchronisation cross-tab/component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('parcelUpdated', {
        detail: { parcelId, updates, timestamp, source: 'optimistic' }
      }))
    }
  }

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
    updateParcelOptimistic,
    extraParcels, setExtraParcels,
    hasMoreParcels, setHasMoreParcels,
    loadingParcels, setLoadingParcels,
    syncingParcels,
    loadingMore, setLoadingMore,
    pendingAideParcels, setPendingAideParcels,
    search, setSearch,
    searchScope, setSearchScope,
    includeArchived, setIncludeArchived,  // 🗄️ Inclure archives dans recherche
    isSearching,
    datePreset, setDatePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateFilterType, setDateFilterType,  // 📅 Type de date (création/livraison)
    operationalDay, setOperationalDay,  // 🗓️ Journée opérationnelle
    parcelDirection, setParcelDirection,
    serviceFilter, setServiceFilter,
    parcelStatusFilter, setParcelStatusFilter,
    parcelEditorFilter, setParcelEditorFilter,
    destinationCityFilter, setDestinationCityFilter,  // ⭐ Filtre ville de destination
    driverFilter, setDriverFilter,  // ⭐ Filtre par livreur/chauffeur
    portTypeFilter, setPortTypeFilter,  // ⭐ Filtre par type de port
    encaissementFilter, setEncaissementFilter, encaissementTypesFilter, setEncaissementTypesFilter,
    codDocumentStatusFilter, setCodDocumentStatusFilter,  // ⭐ Filtre par statut document COD
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
    bulkAssignSelectedIds, setBulkAssignSelectedIds,
    bulkAssignDriverId, setBulkAssignDriverId,
    bulkAssignSectorId, setBulkAssignSectorId,
    bulkAssignBusy, setBulkAssignBusy,
    bulkAssignError, setBulkAssignError,
    deliveryModal, setDeliveryModal,
    editingParcel, setEditingParcel,
    editForm, setEditForm,
    editLoading, setEditLoading,
    editError, setEditError,
    codEditModal, setCodEditModal,  // 💰 Édition rapide COD
    ef,
    validatingEntryId, setValidatingEntryId,
    selectedAideEntryIds, setSelectedAideEntryIds,
    bulkAideValidating, setBulkAideValidating,
    bulkAideValidationError, setBulkAideValidationError,
    togglingAideAccessId, setTogglingAideAccessId,
    showFilters, setShowFilters,
    allDisplayParcels,
    filteredParcels,
    parcelMovementCount,
    aideAgents,
    pointeurUsers,
    allUsers, setAllUsers,
    sameCity,
    isParcelCreator, isChefAgencyAideParcel,
    canActAsParcelOwner, canEditParcelDetails, canEditField, canPerformAction,
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
    handleBulkAssignDriver,
    handleCodeVerify, handleEditSave,
    handleSaveCodAmount,  // 💰 Sauvegarde montant COD
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
    codLoadAllProgress, setCodLoadAllProgress,
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
    handleCancelCodRemise,
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

    // ── Agency parcels loading (for chef_agence)
    hasMoreAgency,
    loadMoreAgencyParcels,
    loadingMoreAgency,
    loadingAllAgency,
    agencyProgressStore, // ⚡ progression hors état React (voir useLoadProgress)
    agencyOneShot,
    loadingAllCities,
    loadAllCitiesProgress,

    // ── Agent Pro: Toutes villes (chargement progressif)
    showAllCities, setShowAllCities,
    loadMoreAllCitiesParcels,
    allCitiesTotalLoaded,

    // ── Pagination avec filtre de date
    hasMoreWithDateFilter,
    loadingMoreWithDateFilter,
    handleLoadMoreWithDateFilter,
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

  // ⭐ Calculer le nombre de colis perdus non résolus (badge notification)
  const lostParcelsCount = lostParcels.filter(lp => lp.status !== 'found').length

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
        lostParcelsCount={lostParcelsCount} // ⭐ Badge Colis perdus
      />

      <main className="w-[95%] mx-auto px-3 sm:px-4 md:px-5 pb-16">

        {/* Message notification */}
        {msg && (
          <div className={`mb-4 p-4 rounded-xl border-2 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        {/* ── ACCUEIL ── */}
        {tab === 'home' && (
          <Suspense fallback={null}>
            <HomeTab setTab={setTab} setParcelStatusFilter={setParcelStatusFilter} />
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
          profile?.role === 'chef_agence' ? (
            <Suspense fallback={<div className="text-center py-8">Chargement...</div>}>
              <CaisseChefTab />
            </Suspense>
          ) : (
            <DirectorCaisseSimple
              profile={profile}
              agencyCash={agencyCash}
              driverVersements={driverVersements}
              adminTransfers={myAdminTransfers}
            />
          )
        )}

        {tab === 'cod' && (
          <Suspense fallback={null}>
            <CodTab />
          </Suspense>
        )}

        {tab === 'valeurs' && profile?.role === 'chef_agence' && (
          <Suspense fallback={null}>
            <ValeursAValiderTab />
          </Suspense>
        )}

        {tab === 'clients' && (
          <Suspense fallback={null}>
            <AgentClientsTab agencyCity={profile?.city || ''} profile={profile} setMsg={setMsg} />
          </Suspense>
        )}

        {tab === 'modifications' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
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
          canEdit={profile?.role === 'chef_agence' || profile?.role === 'agentpro'}
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

      {/* ── PORTS EN COMPTE TAB ── */}
      {tab === 'clientportdu' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
        <Suspense fallback={null}>
          <AgentPortsEnCompteTab
            allParcels={allDisplayParcels}
            profile={profile}
          />
        </Suspense>
      )}

      {/* ── PORTS PAYÉS PAR CHÈQUE TAB ── */}
      {tab === 'portpayecheque' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
        <Suspense fallback={null}>
          <PortPayeChequeTab
            agencyCity={profile?.city || ''}
            profile={profile}
          />
        </Suspense>
      )}

      {/* ── PORTS DÛ CHÈQUE TAB ── */}
      {tab === 'portducheque' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
        <Suspense fallback={null}>
          <PortDuChequeTab
            agencyCity={profile?.city || ''}
            profile={profile}
          />
        </Suspense>
      )}

      {/* ── VERSEMENTS ADMIN TAB ── */}
      {tab === 'versements' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
        <Suspense fallback={null}>
          <AgentVersementsTab profile={profile} />
        </Suspense>
      )}

      {/* ── FACTURES TAB ── */}
      {tab === 'invoices' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
        <Suspense fallback={null}>
          <AgentInvoicesTab profileCity={profile?.city} uid={uid} />
        </Suspense>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
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
      {tab === 'notes' && (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
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
