import {
  AlertTriangle, Banknote, Calendar, Car, Check, CheckSquare,
  ChevronDown, ChevronLeft, ChevronRight, Download, Edit, Edit2, Filter, Hand,
  LayoutGrid, Lock, Package, Pencil, PenTool, Printer, Search, Table2, Trash2, Truck,
  Unlock, User, X,
} from 'lucide-react'
import { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react'
import PendingBadge from '../../../components/PendingBadge'
import { deleteField, Timestamp, collection, documentId, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { loadExcel } from '../../../utils/loadExcel'
import {
  loadReturnedParcelOnTruck, validateReturnArrival, getMoreAgentParcels,
} from '../../../firebase/firestore'
import { isInReturnCircuit, updateParcel, buildParcelCorrectionPatch, describeParcelSaveError, ensureFullParcel, ensureFullParcels } from '../../../firebase/parcels'
import { reservePrintWindow, releasePrintWindow } from '../../../utils/printWindow'

// 🪶 La liste vient de parcelsLite (version allégée, sans historique…) : toute ouverture d'un colis
// (modification, historique, livraison, impression) relit d'abord le document COMPLET dans parcels.
// Au-delà de ce nombre de lignes, « Imprimer tout » imprime la liste telle quelle (toutes les colonnes
// imprimées sont présentes dans la version allégée) plutôt que de relire des milliers de colis.
const PRINT_FULL_FETCH_MAX = 300
import {
  STATUSES, STATUS_COLORS, COD_PAYMENT_TYPES, COD_STATUS, codCollectedLabel,
  CITIES, ALL_SERVICE_TYPES, codPaymentTypeOf, normalizeServiceType,
} from '../../../firebase/constants'
import {
  isMixedCod, codCashPartOf, codDocPartOf, codPartsBreakdown, codPartsOf, codEditInitial,
  codServiceLabel, codPartsLabel, codPartRows, codTotalsByType,
  buildCodWriteFields, validateCodChoice, toggleCodService, codSelectionOf, COD_PART_EMOJI, COD_PART_LABEL,
} from '../../../utils/codParts'
import { useAgentCtx } from '../AgentCtx'
import { OperationalDaySelector } from '../../../components/OperationalDaySelector'
import QuickStatusToggles from '../../../components/QuickStatusToggles'
import HScrollArrows from '../../../components/HScrollArrows'
import LoadProgress from '../../../components/LoadProgress'
import { useLoadProgress, type LoadProgressStore } from '../../../utils/loadProgressStore'

import { parcelDate, filterByDate } from '../../../utils/dateFilter'
import { formatOperationalDay } from '../../../config/operationalDay'
import { normText } from '../../../utils/normText'
import { makeTableSearchMatcher } from '../../../utils/parcelSearch'
import { agencyPortAmounts } from '../../../utils/billingAgency'

const normalizeSearch = (value: any) => normText(value).replace(/[^a-z0-9]/g, '')
const matchesSearch = (values: any, query: any) => {
  const q = normText(query)
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = normText(v)
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}

// ALL_SERVICE_TYPES importé depuis constants.ts

// Mode de règlement d'une valeur (RETOUR FOND, port dû, port payé…) : le type saisi à
// l'encaissement (codPaymentType) prime, sinon on le déduit du service choisi à la création.
const VALUE_TYPE_INFO: Record<string, { label: string; emoji: string }> = {
  especes:       { label: 'Espèces',          emoji: '💵' },
  cheque:        { label: 'Chèque',           emoji: '📋' },
  traite:        { label: 'Traite',           emoji: '📝' },
  bon_livraison: { label: 'Bon de livraison', emoji: '🧾' },
  retour_bl:     { label: 'Bon de livraison', emoji: '🧾' },
  simple:        { label: 'Simple',           emoji: '📦' },
}
// serviceType fait foi : codPaymentType n'est retenu que s'il est cohérent (codPaymentTypeOf).
const valueTypeOf = (p: any): string => {
  // Ligne « part » d'un RF mixte (codPartRows) : le type de la part
  if (p?.codPartMixed && p.codPartType && VALUE_TYPE_INFO[p.codPartType]) return p.codPartType
  const t = codPaymentTypeOf(p)
  if (t && VALUE_TYPE_INFO[t]) return t
  return p?.serviceType === 'simple' ? 'simple' : 'especes'
}
const valueTypeLabel = (p: any) => {
  const info = VALUE_TYPE_INFO[valueTypeOf(p)]
  return `${info.emoji} ${info.label}`
}
// Totaux par mode de règlement d'une liste RETOUR FOND (lignes codPartRows : un RF mixte
// compte sa part espèces en espèces et sa part document en chèque/traite).
const CAT_MODE_TOTAL_LABEL: Record<string, string> = {
  especes: '💵 Total espèces', cheque: '📋 Total chèques', traite: '📝 Total traites', bon_livraison: '🧾 Total BL', simple: '📦 Total simple',
}
const codModeTotals = (rows: any[]): { type: string; label: string; total: number }[] => {
  const t: Record<string, number> = {}
  for (const r of rows || []) { const k = valueTypeOf(r); t[k] = (t[k] || 0) + (parseFloat(r?.codAmount) || 0) }
  return ['especes', 'cheque', 'traite', 'bon_livraison', 'simple']
    .filter(k => t[k] > 0)
    .map(k => ({ type: k, label: CAT_MODE_TOTAL_LABEL[k], total: t[k] }))
}
const uniqueParcelCount = (rows: any[]) => new Set((rows || []).map((r: any, i: number) => r?.id ?? `#${i}`)).size

// ─────────────────────────────────────────────────────────────────────────────

// ⚡ Jauge de chargement abonnée SEULE au store de progression (useLoadProgress) : l'avancement
// jour par jour ne re-rend plus la page Chef d'agence ni cet onglet (≈ 6 000 lignes).
function AgencyLoadProgress({ store, displayCount, agencyLoading, citiesProgress }: {
  store: LoadProgressStore | null; displayCount: number; agencyLoading: boolean; citiesProgress: number
}) {
  const { loaded, day } = useLoadProgress(store)
  const extra = agencyLoading ? loaded : citiesProgress
  return (
    <LoadProgress
      loading
      count={Math.max(displayCount, agencyLoading && day ? loaded : 0)}
      detail={agencyLoading && day && day.total > 1
        ? `jour par jour : ${day.label} (jour ${day.done + 1}/${day.total}) — liste et totaux complets à la fin du chargement`
        : extra > 0 ? `+${extra.toLocaleString('fr-MA')} en arrière-plan` : undefined}
    />
  )
}

export default function ParcelsTab() {
  const {
    // Identity
    uid, profile,

    // Style helpers
    inputCls, selectCls,

    // Parcel data
    allDisplayParcels,
    filteredParcels,
    parcelFiltersPending,
    parcelMovementCount,
    loadingParcels,
    syncingParcels,
    loadingAllAgency, agencyProgressStore, agencyOneShot,
    loadingAllCities, loadAllCitiesProgress,
    hasMoreParcels, setHasMoreParcels,
    hasMoreWithDateFilter,
    loadingMoreWithDateFilter,
    handleLoadMoreWithDateFilter,
    loadingMore, setLoadingMore,
    setExtraParcels,
    hasMoreAgency,
    loadMoreAgencyParcels,
    loadingMoreAgency,

    // Search / filters
    search, setSearch,
    searchScope, setSearchScope,
    includeArchived, setIncludeArchived,
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
    driverFilter, setDriverFilter,  // ⭐ Filtre par livreur
    portTypeFilter, setPortTypeFilter,  // ⭐ Filtre par type de port
    encaissementFilter, setEncaissementFilter,  // ⭐ Filtre par type d'encaissement
    encaissementTypesFilter, setEncaissementTypesFilter,  // ⭐ Sélection multiple espèces/chèque/traite
    codDocumentStatusFilter, setCodDocumentStatusFilter,  // ⭐ Filtre par statut document COD
    showFilters, setShowFilters,
    subTab, setSubTab,
    parcelPage, setParcelPage,

    // Agent Pro: Toutes villes (chargement progressif)
    showAllCities, setShowAllCities,
    loadMoreAllCitiesParcels,
    allCitiesTotalLoaded,

    // Azerty fix (component-level, in context)
    needsAzertyFix, azertyFix,

    // Parcel logic helpers
    canActAsParcelOwner,
    canEditParcelDetails,
    canEditField,
    canManageStatus,
    canManageReturnDelivery,
    isReturnOriginCity,
    canManageDeliveryAssignment,
    isPointedForDelivery,
    canLoadTransportParcel,
    isPendingAideParcelForAgency,
    isParcelCreator,
    isChefAgencyAideParcel,
    isAideParcelLockedForEdit,

    // Aide agents
    aideAgents,

    // Action handlers
    handlePrintTicket,
    handlePrintTable,
    handleEditClick,
    handleDeleteClick,
    handleReturnDirect,
    handleValidateParcelEntry,
    handleBulkValidateAideEntries,
    handleToggleAideParcelAccess,
    handleCodeVerify,
    handleEditSave,
    handleAssignTransport,
    handleAssignDelivery,
    handleBulkLoadTransport,
    handleBulkAssignDriver,

    // State: bulk transport load
    bulkLoadSelectedIds, setBulkLoadSelectedIds,
    bulkLoadName, setBulkLoadName,
    bulkLoadPhone, setBulkLoadPhone,
    bulkLoadBusy,
    bulkLoadError, setBulkLoadError,

    // State: bulk assign driver
    bulkAssignSelectedIds, setBulkAssignSelectedIds,
    bulkAssignDriverId, setBulkAssignDriverId,
    bulkAssignSectorId, setBulkAssignSectorId,
    bulkAssignBusy,
    bulkAssignError, setBulkAssignError,

    // State: aide bulk validation
    selectedAideEntryIds, setSelectedAideEntryIds,
    bulkAideValidating,
    bulkAideValidationError, setBulkAideValidationError,

    // State: transport modal
    transportModal, setTransportModal,

    // State: delivery modal
    deliveryModal, setDeliveryModal,

    // State: edit modal
    editingParcel, setEditingParcel,
    editForm, setEditForm,
    editLoading,
    editError,
    ef,

    // State: code modal
    codeModal, setCodeModal,

    // State: truck / return loading
    loadingTruckId, setLoadingTruckId,
    validatingReturnId, setValidatingReturnId,

    // State: signature
    setViewSignature,

    // State: validation
    validatingEntryId,
    togglingAideAccessId,

    // State: price helper
    price,

    // Drivers / sectors / vehicles
    drivers,
    allSectors,
    vehicles,

    // Returner
    returningParcelId,
    RETURN_REASONS,
    returnReasonModal, setReturnReasonModal,
    submitReturnWithReason,
    handleChangeParcelStatus,

    // 💰 État et handler pour édition COD
    codEditModal, setCodEditModal,
    handleSaveCodAmount,
  } = useAgentCtx()

  const PAGE_SIZE = 25

  // État pour afficher les expéditions livrées par d'autres agences
  const [showDeliveredByOthers, setShowDeliveredByOthers] = useState(false)

  // 🔍 Filtre local par adresse
  const [addressFilter, setAddressFilter] = useState('')

  // 🔍 Filtres locaux par plage (Nb Colis et COD)
  const [nbColisFilterMin, setNbColisFilterMin] = useState('')
  const [nbColisFilterMax, setNbColisFilterMax] = useState('')
  const [codFilterMin, setCodFilterMin] = useState('')
  const [codFilterMax, setCodFilterMax] = useState('')

  // État pour gérer les colonnes visibles
  const [visibleColumns, setVisibleColumns] = useState({
    nexp: true, date: true, dateLivraison: true, statut: true, expediteur: true, telExp: true, villeExp: true,
    destinataire: true, telDest: true, villeDest: true, adresse: true, service: true,
    nbColis: true, poids: true, port: true, typePort: true, cod: true, livreur: true
  })

  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait')

  // État pour l'édition de date
  const [editingDateId, setEditingDateId] = useState<string | null>(null)
  const [editingDateValue, setEditingDateValue] = useState<string>('')

  // État pour le modal de statut document COD
  const [codDocumentModal, setCodDocumentModal] = useState<{ open: boolean; parcelId: string | null; currentStatus: string | null; serviceType: string | null }>({
    open: false,
    parcelId: null,
    currentStatus: null,
    serviceType: null
  })

  // ⭐ États pour l'assignation de ramassage
  const [selectedPickupParcelIds, setSelectedPickupParcelIds] = useState<Set<string>>(new Set())
  const [assignPickupModal, setAssignPickupModal] = useState(false)
  const [assigningPickupDriver, setAssigningPickupDriver] = useState('')
  const [assigningPickupInProgress, setAssigningPickupInProgress] = useState(false)

  // 🛒 Panier d'export Excel pour résultats de recherche
  const [selectedSearchResults, setSelectedSearchResults] = useState<string[]>([])
  const [selectedSearchParcels, setSelectedSearchParcels] = useState<any[]>([])

  // ⚡ Système de mise à jour en temps réel
  const [localParcelUpdates, setLocalParcelUpdates] = useState<Record<string, any>>({})
  const [forceUpdateCounter, setForceUpdateCounter] = useState(0)

  // ⚠️ Les surcharges locales ne sont qu'un pont en attendant les données serveur : dès que
  // la liste source change (listener Firestore, événement parcelUpdated, rechargement), on les
  // abandonne. Avant, elles restaient indéfiniment et masquaient les valeurs réellement en
  // base (ex. « RF 9000 DH » / « C/Chèque » affichés alors que Firestore avait 2000 DH / traite).
  useEffect(() => {
    setLocalParcelUpdates(prev => (Object.keys(prev).length ? {} : prev))
  }, [filteredParcels])

  // Rafraîchissement automatique en arrière-plan quand des données sont modifiées
  useEffect(() => {
    const handleDataUpdate = () => {
      // Rafraîchir la page en silence
      window.location.reload()
    }

    // Écouter les modifications de données
    window.addEventListener('parcelDataUpdated', handleDataUpdate)

    // Nettoyer l'écouteur
    return () => {
      window.removeEventListener('parcelDataUpdated', handleDataUpdate)
    }
  }, [])

  // Sécurité : s'assurer que les tableaux ne sont jamais undefined
  const safeParcels = useMemo(() => {
    if (showDeliveredByOthers) {
      // Afficher les colis expédiés par cette agence et livrés par d'autres
      return (allDisplayParcels || []).filter((p: any) => {
        const isOriginAgency = p.originCity === profile?.city || p.sender?.city === profile?.city
        const isDelivered = p.status === 'Livré' && p.deliveredAt
        const deliveredByOther = p.destinationCity !== profile?.city
        return isOriginAgency && isDelivered && deliveredByOther
      })
    }
    return filteredParcels || []
  }, [allDisplayParcels, filteredParcels, showDeliveredByOthers, profile?.city])

  // ⭐ Filtrer les livreurs de l'agence uniquement (même ville)
  const agencyDrivers = useMemo(() => {
    if (!profile?.city) return drivers || []
    return (drivers || []).filter((d: any) =>
      d.city === profile.city &&
      (d.role === 'livreur' || (d.role === 'chauffeur' && d.chauffeurType !== 'transport'))
    )
  }, [drivers, profile?.city])

  // ⚡ Villes / livreurs disponibles : 4 parcours de TOUTES les expéditions, autrefois refaits à
  // chaque rendu (chaque frappe, chaque tic de progression…) → recalculés seulement si la liste change.
  // ⭐ Calculer les villes de destination disponibles
  const availableDestCities = useMemo(() => {
    const cities = new Set<string>()
    const parcels = allDisplayParcels || []
    parcels.forEach((p: any) => {
      const destCity = p.destinationCity || p.receiver?.city
      if (destCity) cities.add(destCity)
    })
    return Array.from(cities).sort()
  }, [allDisplayParcels])

  // ⭐ Calculer les villes d'origine (expédition) disponibles
  const availableOriginCities = useMemo(() => {
    const cities = new Set<string>()
    const parcels = allDisplayParcels || []
    parcels.forEach((p: any) => {
      const originCity = p.originCity || p.sender?.city
      if (originCity) cities.add(originCity)
    })
    return Array.from(cities).sort()
  }, [allDisplayParcels])

  // ⭐ Toutes les villes (origine + destination) pour direction "Tous"
  const availableAllCities = useMemo(() => {
    const cities = new Set<string>()
    const parcels = allDisplayParcels || []
    parcels.forEach((p: any) => {
      const originCity = p.originCity || p.sender?.city
      const destCity = p.destinationCity || p.receiver?.city
      if (originCity) cities.add(originCity)
      if (destCity) cities.add(destCity)
    })
    return Array.from(cities).sort()
  }, [allDisplayParcels])

  // ⭐ Calculer les livreurs/chauffeurs disponibles (ceux qui ont des colis assignés dans la ville de l'agent)
  const availableDrivers = useMemo(() => {
    const driverIds = new Set<string>()
    const parcels = allDisplayParcels || []
    const agentCity = profile?.city

    parcels.forEach((p: any) => {
      if (p.deliveryDriverId) driverIds.add(p.deliveryDriverId)
      if (p.chauffeurId) driverIds.add(p.chauffeurId)
    })

    return (drivers || [])
      .filter((d: any) =>
        driverIds.has(d.id) &&
        (!agentCity || d.city === agentCity) &&  // Filtrer par ville de l'agent
        d.sectorId  // ⭐ Ne montrer que les livreurs associés à un secteur
      )
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  }, [allDisplayParcels, drivers, profile?.city])

  // ⚡ Listes des panneaux d'actions groupées (chargement camion, assignation, Port dû) : 3 filtres
  // de toute la liste filtrée, autrefois refaits à chaque rendu → mémoïsés. Mêmes règles.
  const loadableParcelsMemo = useMemo(
    () => (filteredParcels || []).filter(canLoadTransportParcel),
    // canLoadTransportParcel ne dépend que du rôle
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredParcels, profile?.role]
  )
  const loadableIdSet = useMemo(() => new Set(loadableParcelsMemo.map((p: any) => p.id)), [loadableParcelsMemo])
  const assignableParcelsMemo = useMemo(() => (filteredParcels || []).filter((p: any) => {
    // Colis assignables: arrivés dans la ville du chef, pas encore livrés
    const isInMyCity = (p.destinationCity === profile?.city || p.receiver?.city === profile?.city)
    // Tous les colis dans ma ville qui ne sont pas livrés ni retournés
    const notDelivered = !p.deliveredAt && !p.returnedAt && p.status !== 'Livré'
    return isInMyCity && notDelivered
  }), [filteredParcels, profile?.city])
  const portDuParcelsMemo = useMemo(() => (filteredParcels || []).filter((p: any) => {
    // Filtrer les parcels Port Dû dans ma ville de destination (non livrés)
    const isDestinationAgency = p.destinationCity === profile?.city || p.receiver?.city === profile?.city
    const isPortDu = p.portType === 'port_du'
    const notDelivered = !p.deliveredAt && p.status !== 'Livré'
    return isPortDu && isDestinationAgency && notDelivered
  }), [filteredParcels, profile?.city])

  // État pour basculer entre vue cartes et vue tableau
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table')

  // ⭐ État pour recherche spécifique dans le tableau
  const [tableSearch, setTableSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ⭐ Navigation au clavier - Focus sur les checkboxes uniquement
  const [focusedIndex, setFocusedIndex] = useState(0)
  const checkboxRefs = useRef<(HTMLInputElement | null)[]>([])

  // ⭐ État pour gérer les couleurs des colis par livreur
  const [parcelColors, setParcelColors] = useState<{[key: string]: string}>({})

  // ⭐ État pour transformation groupée Port Dû → Compte Destinataire
  const [bulkPortDuSelectedIds, setBulkPortDuSelectedIds] = useState<string[]>([])
  const [bulkPortDuBusy, setBulkPortDuBusy] = useState(false)
  const [bulkPortDuError, setBulkPortDuError] = useState('')
  const [isPortDuSectionOpen, setIsPortDuSectionOpen] = useState(false) // ⭐ Section fermée par défaut

  // ⚡ Sélections (cases à cocher) en Set : appartenance O(1) au lieu de .includes() sur des
  // tableaux de milliers d'identifiants (rendu des lignes, impression, export, compteurs).
  const bulkAssignSelectedSet = useMemo(() => new Set<string>(bulkAssignSelectedIds || []), [bulkAssignSelectedIds])
  const bulkLoadSelectedSet = useMemo(() => new Set<string>(bulkLoadSelectedIds || []), [bulkLoadSelectedIds])
  const bulkPortDuSelectedSet = useMemo(() => new Set<string>(bulkPortDuSelectedIds), [bulkPortDuSelectedIds])
  // 🖨️ Impression de la sélection en cours (lecture des documents complets) : bouton occupé
  const [printSelectionBusy, setPrintSelectionBusy] = useState(false)

  // ⭐ Palette de couleurs pour les livreurs (12 couleurs vives)
  const DRIVER_COLORS = [
    '#FFE5E5', // Rose pâle
    '#E5F5FF', // Bleu pâle
    '#FFF5E5', // Orange pâle
    '#E5FFE5', // Vert pâle
    '#F5E5FF', // Violet pâle
    '#FFFFE5', // Jaune pâle
    '#FFE5F5', // Magenta pâle
    '#E5FFFF', // Cyan pâle
    '#FFEEDD', // Pêche
    '#E5F0E5', // Vert menthe
    '#FFE5CC', // Saumon pâle
    '#E5E5FF', // Lavande
  ]

  // Fonction pour sauvegarder la date modifiée
  const handleSaveDate = async (parcelId: string, newDate: string) => {
    try {
      // Utiliser expeditionDate au lieu de modifier createdAt
      // pour ne pas affecter les filtres système
      const { updateParcel } = await import('../../../firebase/parcels')
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(newDate || '')) { alert('❌ Date invalide.'); return }
      // expeditionDate = date affichée ; workDate = jour d'opération utilisé par les filtres de date
      // La date de CRÉATION suit aussi (même heure de la journée) pour que toutes les pages
      // (caisse, admin, impressions, filtres, requêtes serveur) restent cohérentes ; l'originale est conservée.
      const cur = (filteredParcels || []).find((p: any) => p.id === parcelId) || {}
      const oldCreated: Date | null = cur.createdAt?.toDate ? cur.createdAt.toDate() : (cur.createdAt?.seconds ? new Date(cur.createdAt.seconds * 1000) : null)
      const [yy, mo, dd] = newDate.split('-').map(Number)
      const base = oldCreated || new Date()
      const newCreated = new Date(yy, mo - 1, dd, base.getHours(), base.getMinutes(), base.getSeconds())
      const updates: any = {
        expeditionDate: newDate, // Format YYYY-MM-DD
        workDate: newDate,
        createdAt: Timestamp.fromDate(newCreated),
      }
      if (oldCreated && !cur.createdAtOriginal) updates.createdAtOriginal = Timestamp.fromDate(oldCreated)
      await updateParcel(parcelId, updates)
      setLocalParcelUpdates(prev => ({ ...prev, [parcelId]: { ...prev[parcelId], expeditionDate: newDate, workDate: newDate, createdAt: Timestamp.fromDate(newCreated) } }))

      setEditingDateId(null)
      setEditingDateValue('')
    } catch (err: any) {
      console.error('Erreur modification date:', err)
      alert(err?.code === 'permission-denied' ? '❌ Modification refusée : le colis est chargé/verrouillé ou vous n’avez pas le droit de modifier sa date.' : `❌ Erreur: ${err.message}`)
    }
  }

  // ⭐ Générer une couleur pour un livreur basée sur son ID
  const getDriverColor = (driverId: string) => {
    if (!driverId) return ''
    const hash = driverId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return DRIVER_COLORS[hash % DRIVER_COLORS.length]
  }

  // ⭐ Fonction pour vider et focus la recherche après sélection d'un colis
  const handleParcelRowClick = (e: React.MouseEvent) => {
    // Ne pas déclencher si on clique sur un bouton, input, select, ou lien
    const target = e.target as HTMLElement
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('a')
    ) {
      return
    }

    // Si une recherche est active, la vider et remettre le focus
    if (tableSearch) {
      setTableSearch('')
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }

  // ⭐ Fonction helper pour calculer les résultats filtrés par la recherche tableau
  const getTableFilteredParcels = (
    allParcels: any[],
    search: string = tableSearch,
    // Valeurs de filtre à appliquer (par défaut : les valeurs courantes ; le tableau passe leur copie différée)
    f = { parcelStatusFilter, addressFilter, nbColisFilterMin, nbColisFilterMax, codFilterMin, codFilterMax },
  ) => {
    const { parcelStatusFilter, addressFilter, nbColisFilterMin, nbColisFilterMax, codFilterMin, codFilterMax } = f
    // Filtrer par statut d'abord
    let filtered = allParcels
    if (parcelStatusFilter && parcelStatusFilter !== 'all') {
      filtered = filtered.filter((p: any) => p.status === parcelStatusFilter)
    }

    // Puis filtrer par recherche texte
    if (search) {
      // Accents/casse/espaces ignorés (COPÏMA = COPIMA), comme le Facturier.
      // ⚡ Champs normalisés mis en cache par expédition (utils/parcelSearch) : même règle qu'avant.
      filtered = filtered.filter(makeTableSearchMatcher(search))
    }

    // 🔍 Filtre spécifique par adresse
    if (addressFilter && addressFilter.trim() !== '') {
      const addressLower = addressFilter.toLowerCase().trim()
      filtered = filtered.filter((p: any) => {
        const address = p.receiver?.address || ''
        return address.toLowerCase().includes(addressLower)
      })
    }

    // 🔍 Filtre par plage Nb Colis
    if (nbColisFilterMin !== '') {
      const min = Number.parseFloat(nbColisFilterMin)
      if (!Number.isNaN(min)) filtered = filtered.filter((p: any) => (p.nbColis || 1) >= min)
    }
    if (nbColisFilterMax !== '') {
      const max = Number.parseFloat(nbColisFilterMax)
      if (!Number.isNaN(max)) filtered = filtered.filter((p: any) => (p.nbColis || 1) <= max)
    }

    // 🔍 Filtre par plage COD
    if (codFilterMin !== '') {
      const min = Number.parseFloat(codFilterMin)
      if (!Number.isNaN(min)) filtered = filtered.filter((p: any) => (p.codAmount || 0) >= min)
    }
    if (codFilterMax !== '') {
      const max = Number.parseFloat(codFilterMax)
      if (!Number.isNaN(max)) filtered = filtered.filter((p: any) => (p.codAmount || 0) <= max)
    }

    return filtered
  }

  // ⚡ PERF : la fusion avec les mises à jour locales, la recherche du tableau et les 5 totaux
  // étaient recalculés sur TOUTES les expéditions (≈15 000 copies d'objets + 5 parcours) à CHAQUE
  // rendu — chaque frappe dans une barre de recherche, chaque journée chargée, chaque tic du
  // compteur de progression… (~150 ms par rendu). Ils ne sont plus recalculés que lorsque leurs
  // données changent. On ne copie plus que les expéditions réellement modifiées localement.
  const mergedFilteredParcels = useMemo(() => {
    const list = filteredParcels || []
    if (!localParcelUpdates || Object.keys(localParcelUpdates).length === 0) return list
    return list.map((p: any) => (localParcelUpdates[p.id] ? { ...p, ...localParcelUpdates[p.id] } : p))
  }, [filteredParcels, localParcelUpdates])
  // La saisie reste fluide : le filtrage du tableau suit la frappe en priorité basse.
  const deferredTableSearch = useDeferredValue(tableSearch)
  // ⚡ Même principe pour les filtres (statut, adresse, Nb colis, COD) : le bouton/champ réagit
  // immédiatement, le filtrage + les totaux suivent en priorité basse (interruptible).
  const tableFilterOpts = useMemo(
    () => ({ parcelStatusFilter, addressFilter, nbColisFilterMin, nbColisFilterMax, codFilterMin, codFilterMax }),
    [parcelStatusFilter, addressFilter, nbColisFilterMin, nbColisFilterMax, codFilterMin, codFilterMax]
  )
  const deferredTableFilterOpts = useDeferredValue(tableFilterOpts)
  const tableFilteredParcelsMemo = useMemo(
    () => getTableFilteredParcels(mergedFilteredParcels, deferredTableSearch, deferredTableFilterOpts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergedFilteredParcels, deferredTableSearch, deferredTableFilterOpts]
  )
  // ⏳ Résultat en cours de recalcul après un clic de filtre (le bouton est déjà sélectionné)
  const tablePending = !!parcelFiltersPending || deferredTableFilterOpts !== tableFilterOpts || deferredTableSearch !== tableSearch
  // ⚡ Lignes « Validation des saisies aide-agent » : mémoïsées (autrefois refiltrées à chaque rendu)
  const aideValidationParcelsMemo = useMemo(
    () => (profile?.role === 'chef_agence' || profile?.role === 'agentpro')
      ? (filteredParcels || []).filter(isPendingAideParcelForAgency)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredParcels, profile?.role]
  )
  const aideValidationIdSet = useMemo(() => new Set<string>((aideValidationParcelsMemo || []).map((p: any) => p.id)), [aideValidationParcelsMemo])
  const tableTotals = useMemo(() => {
    const agencyCity = profile?.city
    const isDest = (p: any) => p.destinationCity === agencyCity || p.receiver?.city === agencyCity
    let totalCod = 0, totalPortDu = 0, totalPortPaye = 0, totalPortEnCompteExp = 0, totalPortEnCompteDest = 0
    const codByType: Record<string, number> = {}
    for (const p of tableFilteredParcelsMemo) {
      totalCod += isDest(p) ? (parseFloat(p.codAmount) || 0) : 0
      // Répartition par mode (RF mixte : espèces + document) — mêmes lignes que le détail
      if (isDest(p) && (parseFloat(p.codAmount) || 0) > 0) {
        for (const r of codPartRows([p])) { const k = valueTypeOf(r); codByType[k] = (codByType[k] || 0) + (parseFloat(r.codAmount) || 0) }
      }
      // 🔗 Répartition des ports partagée avec Admin « Port par Agence » (utils/billingAgency)
      const a = agencyPortAmounts(p, agencyCity)
      totalPortDu += a.portDu + a.portDuCheque // Port dû inclut le Port dû chèque
      totalPortPaye += a.portPaye
      totalPortEnCompteExp += a.enCompteExp
      totalPortEnCompteDest += a.enCompteDest
    }
    return { totalCod, codByType, totalPortDu, totalPortPaye, totalPortEnCompteExp, totalPortEnCompteDest }
  }, [tableFilteredParcelsMemo, profile?.city])

  // 📡 Période lue PONCTUELLEMENT (journées passées, voir AgentPage) : pas d'écoute temps réel sur
  // toute la période. Les ≤ 25 lignes AFFICHÉES restent néanmoins à jour en temps réel (écoute par
  // identifiant, ≤ 30 par requête) : une modification (livreur assigné, statut…) faite ici ou
  // ailleurs apparaît aussitôt sur la page visible ; elle est propagée à toutes les listes via
  // l'événement 'parcelUpdated' (même chemin que les écritures directes en base).
  const visibleIdsKey = useMemo(() => {
    if (!agencyOneShot) return ''
    const list = tableFilteredParcelsMemo
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
    const safePage = Math.min(parcelPage, totalPages - 1)
    return list.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((p: any) => p.id).sort().join(',')
  }, [agencyOneShot, tableFilteredParcelsMemo, parcelPage])
  useEffect(() => {
    if (!visibleIdsKey) return
    const ids = visibleIdsKey.split(',')
    const unsubs: (() => void)[] = []
    for (let i = 0; i < ids.length; i += 30) {
      let initial = true
      unsubs.push(onSnapshot(
        query(collection(db, 'parcels'), where(documentId(), 'in', ids.slice(i, i + 30))),
        snap => {
          if (initial) { initial = false; return } // 1er instantané = données déjà affichées
          snap.docChanges().forEach(ch => {
            if (ch.type !== 'modified') return
            window.dispatchEvent(new CustomEvent('parcelUpdated', {
              detail: { parcelId: ch.doc.id, updates: ch.doc.data(), timestamp: new Date().toISOString(), source: 'firestore', replace: true },
            }))
          })
        },
        err => console.warn('ParcelsTab visible rows listener:', err?.code || err)
      ))
    }
    return () => unsubs.forEach(u => u())
  }, [visibleIdsKey])

  // ⭐ Fonctions de gestion des couleurs
  const colorSelectedParcels = () => {
    if (!bulkAssignDriverId || bulkAssignSelectedIds.length === 0) return

    const driverColor = getDriverColor(bulkAssignDriverId)
    const newColors: {[key: string]: string} = {}

    bulkAssignSelectedIds.forEach((id: string) => {
      newColors[id] = driverColor
    })

    setParcelColors(prev => ({ ...prev, ...newColors }))
  }

  const clearParcelColors = (parcelIds?: string[]) => {
    if (parcelIds && parcelIds.length > 0) {
      // Effacer uniquement les colis spécifiés
      setParcelColors(prev => {
        const updated = { ...prev }
        parcelIds.forEach(id => delete updated[id])
        return updated
      })
    } else {
      // Effacer toutes les couleurs
      setParcelColors({})
    }
  }

  // ⭐ Wrapper pour l'assignation qui ajoute les couleurs
  const handleBulkAssignDriverWithColor = async (assignableParcels: any[]) => {
    console.log('🔍 DEBUG handleBulkAssignDriverWithColor:', {
      assignableCount: assignableParcels.length,
      selectedIds: bulkAssignSelectedIds,
      selectedCount: bulkAssignSelectedIds.length,
      driverId: bulkAssignDriverId
    })

    // D'abord colorer les colis
    colorSelectedParcels()

    // Ensuite faire l'assignation normale
    await handleBulkAssignDriver(assignableParcels)
  }

  // ⭐ Transformation groupée Port Dû → Compte Destinataire
  const handleBulkPortDuToCompte = async () => {
    if (bulkPortDuSelectedIds.length === 0) {
      setBulkPortDuError('Aucune expédition sélectionnée')
      return
    }

    if (!confirm(`Transformer ${bulkPortDuSelectedIds.length} expédition(s) Port Dû en Port en compte destinataire ?`)) {
      return
    }

    setBulkPortDuBusy(true)
    setBulkPortDuError('')

    try {
      // Transformer chaque expédition sélectionnée
      for (const parcelId of bulkPortDuSelectedIds) {
        await updateParcel(parcelId, {
          portType: 'port_en_compte_destinataire'
        })
      }

      alert(`✅ ${bulkPortDuSelectedIds.length} expédition(s) transformée(s) en Compte Destinataire`)

      // Réinitialiser la sélection
      setBulkPortDuSelectedIds([])
    } catch (err: any) {
      console.error('Erreur transformation groupée:', err)
      setBulkPortDuError(err.message || 'Erreur lors de la transformation')
    } finally {
      setBulkPortDuBusy(false)
    }
  }

  // ⭐ Assignation de ramassage à un livreur local
  const handleAssignPickupToDriver = async () => {
    if (!assigningPickupDriver) {
      alert('Veuillez sélectionner un livreur')
      return
    }

    if (selectedPickupParcelIds.size === 0) {
      alert('Aucune expédition sélectionnée')
      return
    }

    const driver = agencyDrivers.find((d: any) => d.id === assigningPickupDriver)
    if (!driver) {
      alert('Livreur introuvable')
      return
    }

    if (!confirm(`Assigner ${selectedPickupParcelIds.size} expédition(s) à ${driver.name} pour ramassage ?`)) {
      return
    }

    setAssigningPickupInProgress(true)

    try {
      const promises = Array.from(selectedPickupParcelIds).map(parcelId => {
        // Trouver l'expédition pour vérifier si c'est un port payé
        const parcel = allDisplayParcels.find((p: any) => p.id === parcelId)
        const updates: any = {
          // 🆕 Champs dédiés au ramassage (séparés de la livraison)
          pickupDriverId: assigningPickupDriver,
          pickupDriverName: driver.name,
          pickupAssignedAt: new Date(),
          pickupAssignedBy: profile?.name || '',
          status: 'En cours de ramassage'
        }

        // Si c'est un port payé, marquer comme collecté par le livreur
        if (parcel?.portType === 'port_paye' && !parcel?.portPayeMethod) {
          updates.portStatus = 'collected'
        }

        return updateParcel(parcelId, updates)
      })

      await Promise.all(promises)

      alert(`✅ ${selectedPickupParcelIds.size} expédition(s) assignée(s) à ${driver.name} pour ramassage`)

      // Réinitialiser
      setSelectedPickupParcelIds(new Set())
      setAssigningPickupDriver('')
      setAssignPickupModal(false)
    } catch (err: any) {
      console.error('Erreur assignation ramassage:', err)
      alert('Erreur lors de l\'assignation: ' + (err.message || 'Erreur inconnue'))
    } finally {
      setAssigningPickupInProgress(false)
    }
  }

  // ⭐ Fonction pour gérer la touche Espace sur le champ de recherche
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    // Si la touche Espace est pressée
    if (e.key === ' ' && tableSearch) {
      // Calculer les résultats filtrés
      const tableFilteredParcels = getTableFilteredParcels(filteredParcels)

      // Si exactement 1 résultat
      if (tableFilteredParcels.length === 1) {
        e.preventDefault() // Empêcher l'ajout d'espace dans le champ

        const singleParcel = tableFilteredParcels[0]

        // Vérifier si le colis peut être assigné (pour chef_agence et agentpro)
        if (profile?.role === 'chef_agence' || profile?.role === 'agentpro') {
          const isInMyCity = (singleParcel.destinationCity === profile?.city || singleParcel.receiver?.city === profile?.city)
          const canAssign = !singleParcel.deliveredAt && !singleParcel.returnedAt && singleParcel.status !== 'Livré'

          if (isInMyCity && canAssign) {
            // Ajouter/retirer de la sélection
            setBulkAssignError('')
            setBulkAssignSelectedIds((prev: any) => {
              const isAlreadySelected = prev.includes(singleParcel.id)
              if (isAlreadySelected) {
                return prev.filter((id: any) => id !== singleParcel.id)
              } else {
                return [...new Set([...prev, singleParcel.id])]
              }
            })

            // Vider la recherche et remettre le focus
            setTableSearch('')
            setTimeout(() => {
              searchInputRef.current?.focus()
            }, 100)
          }
        }
      }
    }
  }

  // État pour modal détails ports
  // amountKey : 'price' pour les ports, 'codAmount' pour le RETOUR FOND
  const [portDetailsModal, setPortDetailsModal] = useState<{ open: boolean; portType: string; title: string; amountKey?: string; parcels: any[] }>({
    open: false,
    portType: '',
    title: '',
    amountKey: 'price',
    parcels: []
  })
  const [printChoiceMenuOpen, setPrintChoiceMenuOpen] = useState(false)
  // 📅 Période affichée dans le titre des tableaux de détail (jour d'opération ou période choisie)
  const periodLabel = useMemo(() => {
    if (datePreset === 'operational' && operationalDay) return formatOperationalDay(operationalDay, true)
    if (datePreset === 'today') return "Aujourd'hui"
    if (datePreset === 'week') return '7 derniers jours'
    if (datePreset === 'month') return 'Ce mois'
    if (datePreset === 'day' && dateFrom) return new Date(dateFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    if (datePreset === 'custom' && dateFrom && dateTo) {
      return `${new Date(dateFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${new Date(dateTo).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    if (datePreset === 'custom' && dateFrom) return `À partir du ${new Date(dateFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    if (datePreset === 'custom' && dateTo) return `Jusqu'au ${new Date(dateTo).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    return 'Toutes périodes'
  }, [datePreset, dateFrom, dateTo, operationalDay])

  const detailAmount = (p: any) => parseFloat(p?.[portDetailsModal.amountKey || 'price']) || 0
  const detailTotal = () => portDetailsModal.parcels.reduce((s: number, p: any) => s + detailAmount(p), 0)
  const detailColor = portDetailsModal.portType === 'cod' ? 'text-green-700'
    : portDetailsModal.portType === 'port_paye' ? 'text-blue-700'
    : portDetailsModal.portType === 'port_du' ? 'text-orange-700' : 'text-gray-700'

  // État pour modal changement livreur
  const [changeDriverModal, setChangeDriverModal] = useState<{ open: boolean; parcel: any; newDriverId: string; loading: boolean; error: string }>({
    open: false,
    parcel: null,
    newDriverId: '',
    loading: false,
    error: ''
  })

  // ⭐ Modal édition complète pour Chef d'Agence et AGENT PRO
  const [quickEditModal, setQuickEditModal] = useState<{
    open: boolean
    parcel: any
    price: string
    portType: string
    status: string
    codAmount: string
    serviceType: string
    /** RF mixte : codAmount = part chèque/traite, codCashAmount = part espèces */
    codMixed?: boolean
    codCashAmount?: string
    nbColis: string
    poids: string
    contenu: string
    remarque: string
    loading: boolean
    error: string
  }>({
    open: false,
    parcel: null,
    price: '',
    portType: '',
    status: '',
    codAmount: '',
    serviceType: '',
    nbColis: '',
    poids: '',
    contenu: '',
    remarque: '',
    loading: false,
    error: ''
  })

  // ⭐ Modal historique des modifications de type de service
  const [historyModal, setHistoryModal] = useState<{
    open: boolean
    parcel: any
  }>({
    open: false,
    parcel: null
  })

  // ⭐ Navigation au clavier - Focus uniquement sur les checkboxes d'assignation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab: Navigation entre checkboxes d'assignation dans le tableau
      if (e.key === 'Tab') {
        // Chercher tous les checkboxes d'assignation
        const allCheckboxes = Array.from(document.querySelectorAll('.checkbox-assign-table')) as HTMLElement[]

        // Si pas de checkboxes, laisser Tab fonctionner normalement
        if (allCheckboxes.length === 0) return

        // Vérifier si on est déjà sur un checkbox d'assignation
        const isOnAssignCheckbox = e.target instanceof HTMLElement && e.target.classList.contains('checkbox-assign-table')

        // ⚠️ Le champ de recherche (searchInputRef) est volontairement EXCLU de cette exception :
        // après une recherche, Tab doit sauter vers la première checkbox correspondante (le
        // tableau n'affiche déjà que les lignes filtrées par la recherche), pour permettre de la
        // sélectionner ensuite avec Espace. Avant ce correctif, Tab depuis la recherche suivait
        // l'ordre de tabulation normal du navigateur et ne pointait jamais sur le résultat trouvé.
        const isSearchInput = e.target === searchInputRef.current
        // Si on est ailleurs (input text, select, etc.), laisser Tab normal
        if (e.target instanceof HTMLInputElement && !isOnAssignCheckbox && !isSearchInput) return
        if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

        // On a des checkboxes d'assignation, bloquer Tab
        e.preventDefault()
        e.stopPropagation()

        // Trouver lequel a le focus
        let currentIndex = allCheckboxes.findIndex(cb => cb === document.activeElement)

        // Si aucun n'a le focus, focuser le premier
        if (currentIndex === -1) {
          allCheckboxes[0].focus()
          allCheckboxes[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          setFocusedIndex(0)
          return
        }

        // Calculer le prochain index
        let nextIndex
        if (e.ctrlKey) {
          // Ctrl+Tab: Monter
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0
        } else {
          // Tab: Descendre
          nextIndex = currentIndex < allCheckboxes.length - 1 ? currentIndex + 1 : currentIndex
        }

        // Focuser la prochaine checkbox
        allCheckboxes[nextIndex].focus()
        allCheckboxes[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        setFocusedIndex(nextIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // Focus automatique sur la première checkbox au chargement et changement de page
  useEffect(() => {
    setFocusedIndex(0)
    setTimeout(() => {
      checkboxRefs.current[0]?.focus()
    }, 100)
  }, [parcelPage])

  // ⚠️ CORRECTIF : ces filtres sont locaux à cet onglet (AgentPage ne les connaît pas, donc
  // son propre effet de reset de page ne peut pas les surveiller). Sans ça, changer l'un
  // d'eux depuis une page &gt; 0 laissait la pagination sur une tranche intermédiaire des
  // nouveaux résultats filtrés.
  useEffect(() => {
    setParcelPage(0)
  }, [tableSearch, addressFilter, nbColisFilterMin, nbColisFilterMax, codFilterMin, codFilterMax, showDeliveredByOthers])

  // 🖨️ Fonction d'impression des détails des ports
  const printPortDetails = (title: string, parcels: any[], total: number, portType: string, agencyName: string, amountKey = 'price', mode: 'normal' | 'bordereau' = 'normal') => {
    const amountOf = (p: any) => parseFloat(p?.[amountKey]) || 0
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const colorClass = portType === 'cod' ? 'text-green-700'
      : portType === 'port_paye' ? 'text-blue-700'
      : portType === 'port_du' ? 'text-orange-700' : 'text-gray-700'
    const bgColorClass = portType === 'cod' ? 'bg-green-50'
      : portType === 'port_paye' ? 'bg-blue-50'
      : portType === 'port_du' ? 'bg-orange-50' : 'bg-gray-50'

    const tableRows = parcels.map((p: any, idx: number) => `
      <tr class="border-b border-gray-200">
        <td class="px-3 py-2 text-xs text-gray-400 text-center">${idx + 1}</td>
        <td class="px-3 py-2 text-xs font-mono">${p.senderNic || p.sender?.nic || '-'}</td>
        <td class="px-3 py-2 text-xs">${valueTypeLabel(p)}${p.codPartMixed ? `<div class="text-gray-500" style="font-size:9px">RF mixte · total ${(p.codAmountTotal || 0).toLocaleString('fr-MA')} DH</div>` : ''}</td>
        <td class="px-3 py-2 text-xs">${p.workDate || (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('fr-FR') : '-')}</td>
        <td class="px-3 py-2 text-xs">
          <div class="font-medium">${p.senderName || p.sender?.name || '-'}</div>
          <div class="text-gray-500">${p.senderTel || p.sender?.tel || ''}</div>
        </td>
        <td class="px-3 py-2 text-xs">${p.originCity || p.sender?.city || '-'}</td>
        <td class="px-3 py-2 text-xs">
          <div class="font-medium">${p.receiverName || p.receiver?.name || '-'}</div>
          <div class="text-gray-500">${p.receiverTel || p.receiver?.tel || ''}</div>
        </td>
        <td class="px-3 py-2 text-xs">${p.destinationCity || p.receiver?.city || '-'}</td>
        <td class="px-3 py-2 text-xs text-right font-bold ${colorClass}">${amountOf(p).toLocaleString('fr-MA')} DH</td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title} - ${agencyName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: white;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #1e40af;
            font-size: 28px;
            font-weight: 800;
            margin-bottom: 8px;
          }
          .header .subtitle {
            color: #64748b;
            font-size: 14px;
            margin-top: 8px;
          }
          .info-box {
            background: ${bgColorClass};
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .info-box .title {
            font-size: 18px;
            font-weight: 700;
            color: #1f2937;
          }
          .info-box .count {
            color: #64748b;
            font-size: 14px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          thead {
            background: linear-gradient(to right, #2563eb, #3b82f6);
            color: white;
          }
          th {
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
          }
          th:last-child, td:last-child {
            text-align: right;
          }
          tbody tr:nth-child(even) {
            background: #f9fafb;
          }
          tbody tr:hover {
            background: #f3f4f6;
          }
          .total-row {
            background: #f1f5f9;
            font-weight: 700;
            border-top: 2px solid #cbd5e1;
          }
          .total-row td {
            padding: 15px 8px;
            font-size: 14px;
          }
          .text-blue-700 { color: #1d4ed8; }
          .text-orange-700 { color: #c2410c; }
          .bg-blue-50 { background: #eff6ff; }
          .bg-orange-50 { background: #fff7ed; }
          .text-gray-500 { color: #6b7280; }
          .border-b { border-bottom: 1px solid #e5e7eb; }
          .border-gray-200 { border-color: #e5e7eb; }
          .font-mono { font-family: 'Courier New', monospace; }
          .font-medium { font-weight: 500; }
          .text-xs { font-size: 11px; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚚 BG EXPRESS</h1>
          <div style="font-size: 16px; color: #1e40af; font-weight: 600; margin: 8px 0;">${agencyName}</div>
          ${mode === 'bordereau' ? `
            <div style="font-size: 26px; font-weight: 900; color: #111827; letter-spacing: 1px; margin: 14px 0 4px; text-transform: uppercase;">
              Bordereau — Accusé de réception
            </div>
          ` : `
            <div class="subtitle">${title}</div>
          `}
          <div class="subtitle">Imprimé le ${now}</div>
        </div>

        <div class="info-box">
          <div>
            ${mode === 'bordereau' ? '' : `<div class="title">${title}</div>`}
            <div class="count">${uniqueParcelCount(parcels)} expédition${uniqueParcelCount(parcels) > 1 ? 's' : ''}</div>
          </div>
          <div style="font-size: 24px; font-weight: 800;" class="${colorClass}">
            ${total.toLocaleString('fr-MA')} DH
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px;text-align:center">#</th>
              <th>N° EXP</th>
              <th>Mode de règlement</th>
              <th>Date</th>
              <th>Expéditeur</th>
              <th>Ville Origine</th>
              <th>Destinataire</th>
              <th>Ville Dest.</th>
              <th>${amountKey === 'codAmount' ? 'Montant' : 'Port'}</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            ${portType === 'cod' && codModeTotals(parcels).length > 1 ? codModeTotals(parcels).map(m => `
            <tr>
              <td colspan="8" style="text-align: right; padding: 6px 8px; font-size: 12px; font-weight: 600;">${m.label} :</td>
              <td style="padding: 6px 8px; font-size: 12px; font-weight: 700;">${m.total.toLocaleString('fr-MA')} DH</td>
            </tr>`).join('') : ''}
            <tr class="total-row">
              <td colspan="8" style="text-align: right;">TOTAL:</td>
              <td class="${colorClass}" style="font-size: 16px;">${total.toLocaleString('fr-MA')} DH</td>
            </tr>
          </tfoot>
        </table>

        ${mode === 'bordereau' ? `
          <div style="display:flex; justify-content:space-between; margin-top:50px; font-size:12px;">
            <div style="width:45%;">
              <div style="border-top:1px solid #111827; padding-top:6px;">Signature et cachet — Remis par</div>
            </div>
            <div style="width:45%;">
              <div style="border-top:1px solid #111827; padding-top:6px;">Signature et cachet — Reçu par (accusé de réception)</div>
            </div>
          </div>
        ` : ''}
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  return (
    <>
      <div className="mt-4 space-y-3">
        {/* Sub-tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 flex-1">
            <button onClick={() => setSubTab('mine')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') ? 'Mes créations' : 'Mes colis'}
            </button>
            <button onClick={() => setSubTab('all')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') ? "Toute l'agence" : 'Tous les colis'}
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-2.5 py-2 bg-white border border-gray-200 rounded-xl">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
          </span>
        </div>

        {/* Search - Zone de recherche améliorée */}
        {<div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
          <input
            placeholder="🔍 Rechercher par N° EXP, Nom, Téléphone | C4500 (chèque) | T3000 (traite)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // La douchette finit toujours par Entrée → corriger AZERTY→QWERTY ici
                const fixed = needsAzertyFix(search) ? azertyFix(search) : search
                if (fixed !== search) setSearch(fixed)
                // ⏎ Entrée : recherche immédiate, même pour un N° EXP de moins de 7 chiffres
                window.dispatchEvent(new CustomEvent('force-search', { detail: fixed }))
              }
            }}
            className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 pl-12 pr-32 py-3.5 rounded-xl text-sm font-medium text-gray-800 placeholder-gray-500 focus:border-blue-500 focus:bg-white focus:shadow-lg focus:outline-none transition-all"
          />
          {isSearching && (
            <div className="absolute right-20 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded shadow-sm animate-pulse">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Recherche...
            </div>
          )}
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 transition"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>}

        {/* 🔍 Portée de la recherche par nom : Tous / Expéditeur seul / Destinataire seul —
            évite qu'un colis remonte juste parce que l'AUTRE partie porte ce nom. */}
        {search && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {[
              { key: 'all', label: 'Tous' },
              { key: 'sender', label: '📤 Expéditeur' },
              { key: 'receiver', label: '📥 Destinataire' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSearchScope(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ${
                  searchScope === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 🗄️ Checkbox Archives - visible seulement quand recherche active */}
        {search && (
          <label className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
              className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-amber-900">
              🗄️ Inclure archives (+30 jours)
            </span>
          </label>
        )}

        {/* 🛒 PANIER D'EXPORT EXCEL */}
        {selectedSearchResults.length > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-3 md:p-4 shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛒</span>
                <h3 className="font-bold text-green-800 text-sm md:text-base">
                  Panier d'export: {selectedSearchResults.length} expédition{selectedSearchResults.length > 1 ? 's' : ''}
                </h3>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={async () => {
                    if (selectedSearchParcels.length === 0) {
                      alert('Aucune expédition sélectionnée à exporter')
                      return
                    }

                    const today = new Date().toLocaleDateString('fr-FR')
                    const timeNow = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

                    const data: any[] = []
                    data.push(['', '', '', '', '', '', ''])
                    data.push(['', '', '', '', '', '', ''])
                    data.push(['', '', '', '', '', '', ''])
                    data.push([`Date: ${today} ${timeNow}`, '', '', '', '', '', ''])
                    data.push([`Total: ${selectedSearchParcels.length} expédition(s)`, '', '', '', '', '', ''])
                    data.push(['', '', '', '', '', '', ''])
                    data.push(['N° EXP (NIC)', 'Expéditeur', 'Destinataire', 'Ville Exp.', 'Ville Dest.', 'Date Exp.', 'Prix'])

                    selectedSearchParcels.forEach((p: any) => {
                      let codText = ''
                      const amount = parseFloat(p.codAmount)
                      if (!isNaN(amount) && amount > 0) {
                        codText = String(amount).replace('.', ',')
                      }
                      const expeditionDate = p.expeditionDate || (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('fr-FR') : '')

                      data.push([
                        p.sender?.nic || '',
                        p.sender?.name || '',
                        p.receiver?.name || '',
                        p.sender?.city || p.originCity || '',
                        p.destinationCity || p.receiver?.city || '',
                        expeditionDate,
                        codText
                      ])
                    })

                    const XLSX = await loadExcel()
                    if (!XLSX) return
                    const wb = XLSX.utils.book_new()
                    const ws = XLSX.utils.aoa_to_sheet(data)
                    ws['!cols'] = [
                      { wch: 15 },
                      { wch: 20 },
                      { wch: 20 },
                      { wch: 18 },
                      { wch: 18 },
                      { wch: 12 },
                      { wch: 12 }
                    ]
                    XLSX.utils.book_append_sheet(wb, ws, 'Expéditions')
                    XLSX.writeFile(wb, `Panier_Expeditions_${today.replace(/\//g, '-')}_${timeNow.replace(/:/g, 'h')}.xlsx`)

                    setSelectedSearchResults([])
                    setSelectedSearchParcels([])
                  }}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs sm:text-sm font-bold transition shadow-lg flex-1 sm:flex-none"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Exporter en Excel</span>
                  <span className="sm:hidden">Excel</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedSearchResults([])
                    setSelectedSearchParcels([])
                  }}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs sm:text-sm font-bold transition flex-1 sm:flex-none"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Vider
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSearchParcels.map(parcel => (
                <div
                  key={parcel.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-green-300 rounded-lg shadow-sm"
                >
                  <span className="font-mono font-bold text-green-700 text-xs">
                    {parcel.sender?.nic || parcel.trackingId}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedSearchResults(prev => prev.filter(id => id !== parcel.id))
                      setSelectedSearchParcels(prev => prev.filter(p => p.id !== parcel.id))
                    }}
                    className="text-red-500 hover:text-red-700 transition"
                    title="Retirer du panier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🔍 ZONE RÉSULTATS DE RECHERCHE RAPIDE */}
        {search && filteredParcels.length > 0 && !isSearching && (
          <div className="bg-white border-2 border-blue-300 rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white">
                  {filteredParcels.length} résultat{filteredParcels.length > 1 ? 's' : ''} trouvé{filteredParcels.length > 1 ? 's' : ''}
                </span>
                {datePreset !== 'all' && (
                  <span className="text-xs font-medium text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                    Toutes dates — filtre date ignoré pendant la recherche
                  </span>
                )}
              </div>
              <button
                onClick={() => setSearch('')}
                className="text-white hover:bg-white/20 rounded-full p-1 transition"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
              {(() => {
                // ⚡ Version fusionnée (mémoïsée) des résultats de recherche : seules les 10 premières sont affichées
                return mergedFilteredParcels.slice(0, 10).map((parcel: any) => {
                  // Les données sont déjà fusionnées
                const sc = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                return (
                  <div
                    key={parcel.id}
                    className="p-3 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* ✅ Checkbox pour sélection */}
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedSearchResults.includes(parcel.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSearchResults(prev => [...prev, parcel.id])
                              setSelectedSearchParcels(prev => [...prev, parcel])
                            } else {
                              setSelectedSearchResults(prev => prev.filter(id => id !== parcel.id))
                              setSelectedSearchParcels(prev => prev.filter(p => p.id !== parcel.id))
                            }
                          }}
                          className="w-5 h-5 text-blue-600 bg-white border-2 border-blue-400 rounded cursor-pointer focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Infos colis */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-black text-blue-600 text-sm">
                            {parcel.sender?.nic || parcel.trackingId || '—'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${sc}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {parcel.status || 'Initialisé'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-700">📤 {parcel.sender?.name || '—'}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-semibold text-gray-700">📥 {parcel.receiver?.name || '—'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                              {parcel.sender?.city || parcel.originCity || '—'}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded text-xs font-semibold">
                              {parcel.receiver?.city || parcel.destinationCity || '—'}
                            </span>
                          </div>
                          {parcel.receiver?.tel && (
                            <div className="font-mono text-gray-500">
                              📞 {parcel.receiver.tel}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {parcel.codAmount > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">
                                💰 COD: {parcel.codAmount} DH{isMixedCod(parcel) && ` (${codPartsBreakdown(parcel)})`}
                              </span>
                            )}
                            {parcel.price > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold">
                                📮 Port: {parcel.price} DH
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Boutons toggle - version compacte */}
                      {canManageStatus(parcel) && (
                        <div className="flex-shrink-0">
                          <QuickStatusToggles
                            parcel={parcel}
                            profile={profile}
                            compact={true}
                            onSuccess={(updates) => {
                              // ⚡ Mise à jour locale immédiate pour affichage temps réel
                              setLocalParcelUpdates(prev => ({
                                ...prev,
                                [parcel.id]: { ...prev[parcel.id], ...updates }
                              }))
                              setForceUpdateCounter(c => c + 1)
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
              })()}
              {filteredParcels.length > 10 && (
                <div className="p-3 bg-gray-50 text-center">
                  <span className="text-xs font-semibold text-gray-500">
                    + {filteredParcels.length - 10} autre{filteredParcels.length - 10 > 1 ? 's' : ''} résultat{filteredParcels.length - 10 > 1 ? 's' : ''} (voir le tableau ci-dessous)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Message si aucun résultat */}
        {search && filteredParcels.length === 0 && !isSearching && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
            <div className="text-amber-700 font-semibold mb-1">
              🔍 Aucun résultat trouvé
            </div>
            <div className="text-sm text-amber-600">
              Essayez avec un autre terme de recherche ou activez l'option "Inclure archives" ci-dessus
            </div>
          </div>
        )}

        {!search && (<>
        {/* ── TOGGLE FILTRES ── */}
        {(() => {
          const activeCount = [
            parcelDirection !== 'all',
            serviceFilter !== 'all',
            parcelStatusFilter !== 'all',
            destinationCityFilter !== 'all',
            driverFilter !== 'all',
            portTypeFilter !== 'all',
            datePreset !== 'all',
          ].filter(Boolean).length
          return (
            <div className="space-y-2">
              {/* Toggle pour afficher les expéditions livrées par d'autres agences */}
              <button
                onClick={() => setShowDeliveredByOthers((v) => !v)}
                className={`w-full flex items-center justify-between px-4 py-2.5 border rounded-xl shadow-sm transition ${
                  showDeliveredByOthers
                    ? 'bg-green-50 border-green-300 hover:bg-green-100'
                    : 'bg-white border-gray-200 hover:border-green-400 hover:bg-green-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package className={`w-3.5 h-3.5 transition ${showDeliveredByOthers ? 'text-green-600' : 'text-gray-400'}`} />
                  <span className={`text-xs font-semibold transition ${showDeliveredByOthers ? 'text-green-700' : 'text-gray-600'}`}>
                    Expéditions livrées par d'autres agences
                  </span>
                </div>
                <div className={`w-4 h-4 rounded border transition flex items-center justify-center ${
                  showDeliveredByOthers ? 'bg-green-600 border-green-600' : 'border-gray-300'
                }`}>
                  {showDeliveredByOthers && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>

              {/* ✅ Bouton "Toutes les villes" - UNIQUEMENT pour Agent Pro */}
              {profile?.role === 'agentpro' && (
                <button
                  onClick={() => setShowAllCities(!showAllCities)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-purple-400 hover:bg-purple-50 transition"
                >
                  <div className={`w-4 h-4 rounded border transition flex items-center justify-center ${
                    showAllCities ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                  }`}>
                    {showAllCities && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-xs font-semibold text-gray-700">
                    {showAllCities ? '🌍 Toutes les villes' : '📍 Ma ville uniquement'}
                  </span>
                </button>
              )}

              <button
                onClick={() => setShowFilters((v: any) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-400 hover:bg-blue-50 transition group"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition" />
                  <span className="text-xs font-semibold text-gray-600 group-hover:text-blue-600 transition">Filtres</span>
                  {activeCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold">
                      {activeCount}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                  {/* Direction */}
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Direction</span>
                    {[
                      { key: 'all', label: 'Tous' },
                      { key: 'sent', label: 'Envoyés' },
                      { key: 'received', label: 'Reçus' },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => setParcelDirection(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          parcelDirection === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{label}</button>
                    ))}
                  </div>

                  {/* ⭐ Agence de destination / expédition */}
                  {(() => {
                    const cities = parcelDirection === 'all'
                      ? availableAllCities
                      : parcelDirection === 'received'
                      ? availableOriginCities
                      : availableDestCities
                    return cities.length > 0 && (
                      <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">
                          {parcelDirection === 'all' ? 'Ville' : parcelDirection === 'received' ? 'Expéd.' : 'Dest.'}
                        </span>
                        <button onClick={() => setDestinationCityFilter('all')}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                            destinationCityFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >Toutes</button>
                        {cities.map(city => (
                          <button key={city} onClick={() => setDestinationCityFilter(city)}
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                              destinationCityFilter === city ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >{city}</button>
                        ))}
                      </div>
                    )
                  })()}

                  {/* ⭐ Filtre par livreur/chauffeur */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Livreur</span>
                    <button onClick={() => setDriverFilter('all')}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                        driverFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >Tous</button>
                    <button onClick={() => setDriverFilter('unassigned')}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                        driverFilter === 'unassigned' ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >🏬 En gare - {profile?.city}</button>
                    {availableDrivers.map((driver: any) => (
                      <button key={driver.id} onClick={() => setDriverFilter(driver.id)}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          driverFilter === driver.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{driver.name}</button>
                    ))}
                  </div>

                  {/* Type de port */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Type port</span>
                    {[
                      { key: 'all', label: 'Tous', emoji: '' },
                      { key: 'port_paye', label: 'Port payé', emoji: '✅' },
                      { key: 'port_du', label: 'Port dû', emoji: '📮' },
                      { key: 'port_en_compte_expediteur', label: 'En compte Exp', emoji: '📤' },
                      { key: 'port_en_compte_destinataire', label: 'En compte Dest', emoji: '📥' },
                      { key: 'port_en_compte', label: 'En compte', emoji: '💼' },
                    ].map(({ key, label, emoji }) => (
                      <button key={key} onClick={() => setPortTypeFilter(key)}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          portTypeFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{emoji ? `${emoji} ${label}` : label}</button>
                    ))}
                  </div>

                  {/* Type d'encaissement */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Encaiss.</span>
                    {/* "Tous" / "Simple" restent exclusifs et effacent la sélection multiple ci-dessous */}
                    {[
                      { key: 'all', label: 'Tous', emoji: '📦' },
                      { key: 'simple', label: 'Simple', emoji: '💰' },
                    ].map(({ key, label, emoji }) => (
                      <button key={key} onClick={() => { setEncaissementFilter(key); setEncaissementTypesFilter([]) }}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          encaissementFilter === key && encaissementTypesFilter.length === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{emoji} {label}</button>
                    ))}
                    <span className="w-px h-4 bg-gray-200 mx-0.5" />
                    {/* ⭐ Espèces/Chèque/Traite : sélection MULTIPLE — on peut cocher plusieurs
                        types d'encaissement en même temps (ex: Chèque + Traite ensemble). */}
                    {[
                      { key: 'especes', label: 'Espèces', emoji: '💵' },
                      { key: 'cheque', label: 'Chèque', emoji: '📝' },
                      { key: 'traite', label: 'Traite', emoji: '📄' },
                    ].map(({ key, label, emoji }) => {
                      const isSelected = encaissementTypesFilter.includes(key)
                      return (
                        <button key={key} onClick={() => {
                            setEncaissementFilter('all')
                            setEncaissementTypesFilter(isSelected
                              ? encaissementTypesFilter.filter((k: string) => k !== key)
                              : [...encaissementTypesFilter, key])
                          }}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{isSelected ? '☑' : '☐'} {emoji} {label}</button>
                      )
                    })}
                    {encaissementTypesFilter.length > 0 && (
                      <button
                        onClick={() => setEncaissementTypesFilter([])}
                        className="text-[9px] text-red-600 hover:text-red-700 font-semibold ml-1"
                      >
                        ✕ Effacer
                      </button>
                    )}
                  </div>

                  {/* Statut document COD (sélection multiple) */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Doc COD</span>
                      {codDocumentStatusFilter.length > 0 && (
                        <button
                          onClick={() => setCodDocumentStatusFilter([])}
                          className="text-[9px] text-red-600 hover:text-red-700 font-semibold"
                        >
                          ✕ Tout effacer
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { key: 'simple', label: 'Simple', emoji: '📦', color: 'gray' },
                        { key: 'cheque_recu', label: 'Chèque reçu', emoji: '✅', color: 'green' },
                        { key: 'cheque_encours', label: 'Chèque encours', emoji: '⏳', color: 'orange' },
                        { key: 'traite_recu', label: 'Traite reçue', emoji: '✅', color: 'green' },
                        { key: 'traite_encours', label: 'Traite encours', emoji: '⏳', color: 'orange' },
                      ].map(({ key, label, emoji, color }) => {
                        const isSelected = codDocumentStatusFilter.includes(key)
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (isSelected) {
                                setCodDocumentStatusFilter(codDocumentStatusFilter.filter(k => k !== key))
                              } else {
                                setCodDocumentStatusFilter([...codDocumentStatusFilter, key])
                              }
                            }}
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                              isSelected
                                ? color === 'green' ? 'bg-green-600 text-white'
                                : color === 'orange' ? 'bg-orange-600 text-white'
                                : 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {emoji} {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Créateur */}
                  {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                    <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Créateur</span>
                      {[
                        { key: 'all', label: 'Tous', emoji: '👥' },
                        { key: 'chef', label: 'Chef d\'agence', emoji: '👔' },
                        { key: 'aide', label: 'Aide agent', emoji: '🤝' },
                      ].map(({ key, label, emoji }) => (
                        <button key={key} onClick={() => setParcelEditorFilter(key)}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                            parcelEditorFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{emoji} {label}</button>
                      ))}
                    </div>
                  )}

                  {/* Statut */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Statut</span>
                    <button onClick={() => setParcelStatusFilter('all')}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${parcelStatusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >Tous</button>
                    {STATUSES.map(s => {
                      const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                      const active = parcelStatusFilter === s
                      return (
                        <button key={s} onClick={() => setParcelStatusFilter(s)}
                          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap border ${
                            active ? `${sc.bg} ${sc.text} border-current` : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {s}
                        </button>
                      )
                    })}
                  </div>

                  {/* Date */}
                  <div className="px-4 py-3 space-y-2">
                    {/* Type de date */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0">Type:</span>
                      <button
                        onClick={() => setDateFilterType('creation')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          dateFilterType === 'creation' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        📅 Création
                      </button>
                      <button
                        onClick={() => setDateFilterType('livraison')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          dateFilterType === 'livraison' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        ✅ Livraison
                      </button>
                      {/* ⚠️ Les données affichées viennent du cache local le temps que le
                          serveur confirme — évite de croire le total "final" trop tôt. */}
                      {tablePending && !loadingParcels && (
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[11px] font-semibold">
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                          Mise à jour…
                        </span>
                      )}
                      {syncingParcels && (
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[11px] font-semibold">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          Synchronisation…
                        </span>
                      )}
                      {/* 🔵 Pagination progressive VISIBLE : au-delà du 1er lot rapide (2000
                          colis/requête), le reste se charge automatiquement en arrière-plan par
                          tranches — cet indicateur montre que les totaux ne sont pas encore
                          complets, plutôt que de laisser croire à tort qu'ils le sont. */}
                      {(loadingAllAgency || loadingAllCities) && (
                        <AgencyLoadProgress
                          store={agencyProgressStore}
                          displayCount={(allDisplayParcels || []).length}
                          agencyLoading={!!loadingAllAgency}
                          citiesProgress={loadAllCitiesProgress || 0}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Période</span>
                      {[
                        { key: 'all',    label: 'Récent' },
                        { key: 'today',  label: "Auj." },
                        { key: 'week',   label: '7 j' },
                        { key: 'month',  label: 'Mois' },
                        { key: 'operational', label: '🗓️ J.Opé' },
                        { key: 'day',    label: 'Jour' },
                        { key: 'custom', label: 'Période' },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => {
                          setDatePreset(key)
                          // 🗓️ Si J.Opé et pas de date définie, utiliser dateFrom ou aujourd'hui
                          if (key === 'operational' && !operationalDay) {
                            setOperationalDay(
                              dateFrom
                                ? new Date(dateFrom + 'T00:00:00')  // ✅ Heure locale
                                : new Date()  // OK, new Date() sans argument est déjà en heure locale
                            )
                          }
                        }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            datePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{label}</button>
                      ))}
                    </div>

                    {datePreset === 'operational' && (
                      <div className="flex items-center gap-2 pl-20">
                        <span className="text-xs text-gray-500">Jour d'opération (8H → 6H lendemain)</span>
                        <input type="date" value={operationalDay ? `${operationalDay.getFullYear()}-${String(operationalDay.getMonth() + 1).padStart(2, '0')}-${String(operationalDay.getDate()).padStart(2, '0')}` : ''}
                          onChange={e => {
                            if (!e.target.value) {
                              setOperationalDay(null)
                              return
                            }
                            // ✅ Forcer l'interprétation en heure locale avec 'T00:00:00'
                            setOperationalDay(new Date(e.target.value + 'T00:00:00'))
                          }}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                    {datePreset === 'day' && (
                      <div className="flex items-center gap-2 pl-20">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                      </div>
                    )}
                    {datePreset === 'custom' && (
                      <div className="flex items-center gap-2 pl-20">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                        <span className="text-gray-400 text-xs shrink-0">→</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                      </div>
                    )}
                  </div>

                  {/* Reset si filtres actifs */}
                  {activeCount > 0 && (
                    <div className="px-4 py-2.5 bg-gray-50 flex justify-end">
                      <button
                        onClick={() => { setParcelDirection('all'); setServiceFilter('all'); setParcelStatusFilter('all'); setParcelEditorFilter('all'); setDatePreset('all') }}
                        className="text-[10px] text-red-500 hover:text-red-700 font-semibold transition"
                      >
                        ✕ Réinitialiser les filtres
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          const loadableParcels = loadableParcelsMemo
          // ⚡ Set d'ids : l'ancien .some() imbriqué était O(sélection × colis)
          const selectedCount = bulkLoadSelectedIds.filter((id: any) => loadableIdSet.has(id)).length
          const allSelected = loadableParcels.length > 0 && selectedCount === loadableParcels.length
          const aideValidationParcels = aideValidationParcelsMemo

          const selectedAideCount = selectedAideEntryIds.filter((id: any) => aideValidationIdSet.has(id)).length
          const allAideSelected = aideValidationParcels.length > 0 && selectedAideCount === aideValidationParcels.length
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <p className="text-xs text-gray-400">{parcelMovementCount} expédition(s)</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Toggle vue cartes / tableau */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        viewMode === 'cards'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Cartes
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        viewMode === 'table'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      Tableau
                    </button>
                  </div>

                  {/* Boutons imprimer */}
                  {bulkAssignSelectedIds.length > 0 && (
                    <button
                      disabled={printSelectionBusy}
                      onClick={() => {
                        if (printSelectionBusy) return
                        // ⚡ Set (O(1)) : l'ancien .includes() parcourait toute la sélection pour
                        // CHACUNE des milliers d'expéditions filtrées (gel de l'interface).
                        const selSet = bulkAssignSelectedSet
                        let parcelsToPrint = filteredParcels.filter((p: any) => selSet.has(p.id))
                        // Sélection faite sur des lignes déjà affichées mais pas (encore) dans la
                        // liste filtrée courante : on les retrouve dans toutes les expéditions chargées.
                        if (parcelsToPrint.length < selSet.size) {
                          const found = new Set(parcelsToPrint.map((p: any) => p.id))
                          const extra = (allDisplayParcels || []).filter((p: any) => selSet.has(p.id) && !found.has(p.id))
                          if (extra.length) parcelsToPrint = [...parcelsToPrint, ...extra]
                        }
                        if (parcelsToPrint.length === 0) return

                        // Trouver le livreur soit via le filtre, soit via les colis sélectionnés
                        let selectedDriver = driverFilter !== 'all'
                          ? availableDrivers.find((d: any) => d.id === driverFilter)
                          : null

                        // Si pas de filtre livreur, détecter automatiquement depuis les colis sélectionnés
                        if (!selectedDriver && parcelsToPrint.length > 0) {
                          const firstParcel = parcelsToPrint[0]
                          const driverId = firstParcel.deliveryDriverId || firstParcel.chauffeurId
                          if (driverId) {
                            selectedDriver = availableDrivers.find((d: any) => d.id === driverId)
                          }
                        }

                        const driverInfo = selectedDriver ? {
                          id: selectedDriver.id,
                          name: selectedDriver.name,
                          phone: selectedDriver.phone,
                          sectorId: selectedDriver.sectorId,
                          sectorName: selectedDriver.sectorName,
                          sectorCode: selectedDriver.sectorCode,
                        } : undefined

                        // 🖨️ Fenêtre ouverte TOUT DE SUITE (dans le clic) : après la lecture des
                        // documents complets, le bloqueur de pop-up empêchait l'impression.
                        reservePrintWindow()
                        setPrintSelectionBusy(true)
                        ensureFullParcels(parcelsToPrint)
                          .then(full =>
                            handlePrintTable(full, selectedDriver?.name || (driverFilter === 'unassigned' ? `En gare - ${profile?.city || ''}` : undefined), visibleColumns, printOrientation, driverInfo))
                          .catch((err: any) => { console.error('Impression sélection:', err); alert(`❌ Erreur impression: ${err?.message || err}`) })
                          .finally(() => { releasePrintWindow(); setPrintSelectionBusy(false) })
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60 disabled:cursor-wait transition"
                      title="Imprimer uniquement les colis sélectionnés"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {printSelectionBusy ? 'Préparation…' : `Sélection (${bulkAssignSelectedIds.length})`}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      console.log('🔍 Début détection livreur')
                      console.log('driverFilter:', driverFilter)
                      console.log('availableDrivers:', availableDrivers)
                      console.log('filteredParcels:', filteredParcels.length, 'colis')

                      // Trouver le livreur soit via le filtre, soit via les colis à imprimer
                      let selectedDriver = driverFilter !== 'all'
                        ? availableDrivers.find((d: any) => d.id === driverFilter)
                        : null

                      console.log('selectedDriver (via filtre):', selectedDriver)

                      // Si pas de filtre livreur, détecter automatiquement depuis les colis
                      if (!selectedDriver && filteredParcels.length > 0) {
                        const firstParcel = filteredParcels[0]
                        console.log('Premier colis pour détection:', {
                          trackingId: firstParcel.trackingId,
                          deliveryDriverId: firstParcel.deliveryDriverId,
                          chauffeurId: firstParcel.chauffeurId,
                          chauffeurName: firstParcel.chauffeurName,
                          allKeys: Object.keys(firstParcel)
                        })

                        const driverId = firstParcel.deliveryDriverId || firstParcel.chauffeurId
                        console.log('driverId détecté:', driverId)

                        if (driverId) {
                          selectedDriver = availableDrivers.find((d: any) => d.id === driverId)
                          console.log('Livreur trouvé dans availableDrivers:', selectedDriver)
                        }
                      }

                      const driverInfo = selectedDriver ? {
                        id: selectedDriver.id,
                        name: selectedDriver.name,
                        phone: selectedDriver.phone,
                        sectorId: selectedDriver.sectorId,
                        sectorName: selectedDriver.sectorName,
                        sectorCode: selectedDriver.sectorCode,
                      } : undefined

                      console.log('driverInfo final:', driverInfo)

                      reservePrintWindow() // 🖨️ ouverte dans le clic (voir utils/printWindow)
                      ;(filteredParcels.length <= PRINT_FULL_FETCH_MAX ? ensureFullParcels(filteredParcels) : Promise.resolve(filteredParcels)).then(list =>
                        handlePrintTable(list, selectedDriver?.name || (driverFilter === 'unassigned' ? `En gare - ${profile?.city || ''}` : undefined), visibleColumns, printOrientation, driverInfo))
                        .finally(() => releasePrintWindow())
                    }}
                    disabled={filteredParcels.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title={driverFilter !== 'all' ? "Imprimer tous les colis de ce livreur" : "Imprimer tous les colis visibles"}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {driverFilter !== 'all' ? `Tout (${parcelMovementCount})` : `Imprimer (${parcelMovementCount})`}
                  </button>

                  {/* Toggle orientation impression */}
                  <button
                    onClick={() => setPrintOrientation(prev => prev === 'portrait' ? 'landscape' : 'portrait')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      printOrientation === 'portrait'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                    }`}
                    title={`Format: ${printOrientation === 'portrait' ? 'Vertical ↕' : 'Horizontal ↔'}`}
                  >
                    {printOrientation === 'portrait' ? '↕' : '↔'} {printOrientation === 'portrait' ? 'Vertical' : 'Horizontal'}
                  </button>

                  {/* Bouton sélection colonnes */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Colonnes ({Object.values(visibleColumns).filter(Boolean).length})
                    </button>

                    {showColumnSelector && (
                      <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 min-w-[280px]">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b">
                          <h3 className="text-sm font-bold text-gray-700">Colonnes visibles</h3>
                          <button
                            onClick={() => setShowColumnSelector(false)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {[
                            { key: 'nexp', label: '📦 N° EXP' },
                            { key: 'date', label: '📅 Date' },
                            { key: 'statut', label: '🎯 Statut' },
                            { key: 'expediteur', label: '📤 Expéditeur' },
                            { key: 'telExp', label: '📞 Tél Exp.' },
                            { key: 'villeExp', label: '🏙️ Ville Exp.' },
                            { key: 'destinataire', label: '📥 Destinataire' },
                            { key: 'telDest', label: '📞 Tél Dest.' },
                            { key: 'villeDest', label: '🏙️ Ville Dest.' },
                            { key: 'adresse', label: '📍 Adresse' },
                            { key: 'service', label: '🔧 Service' },
                            { key: 'nbColis', label: '📦 Nb Colis' },
                            { key: 'poids', label: '⚖️ Poids' },
                            { key: 'port', label: '💰 Port' },
                            { key: 'typePort', label: '📋 Type Port' },
                            { key: 'cod', label: '💵 COD' },
                            { key: 'livreur', label: '🚚 Livreur' },
                          ].map((col) => (
                            <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                                onChange={(e) => setVisibleColumns(prev => ({ ...prev, [col.key]: e.target.checked }))}
                                className="w-4 h-4 text-purple-600 rounded"
                              />
                              <span className="text-sm text-gray-700">{col.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t flex gap-2">
                          <button
                            onClick={() => setVisibleColumns({
                              nexp: true, date: true, statut: true, expediteur: true, telExp: true, villeExp: true,
                              destinataire: true, telDest: true, villeDest: true, adresse: true, service: true,
                              nbColis: true, poids: true, port: true, typePort: true, cod: true, livreur: true
                            })}
                            className="flex-1 px-2 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                          >
                            Tout sélectionner
                          </button>
                          <button
                            onClick={() => setVisibleColumns({
                              nexp: false, date: false, statut: false, expediteur: false, telExp: false, villeExp: false,
                              destinataire: false, telDest: false, villeDest: false, adresse: false, service: false,
                              nbColis: false, poids: false, port: false, typePort: false, cod: false, livreur: false
                            })}
                            className="flex-1 px-2 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                          >
                            Tout déselectionner
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* NOUVELLE POLITIQUE : Plus de validation nécessaire - section retirée */}

              {/* ⚡ Toujours afficher la section de chargement camion */}
              {true && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                        <Truck className="w-4 h-4" /> Chargement camion groupé
                      </h3>
                      <p className="text-xs text-blue-500 mt-0.5">
                        {selectedCount} sélectionné(s) sur {loadableParcels.length} colis au dépôt source
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkLoadError('')
                          setBulkLoadSelectedIds(allSelected ? [] : loadableParcels.map((p: any) => p.id))
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          allSelected
                            ? 'bg-white text-blue-700 border-blue-300'
                            : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {allSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                      </button>
                      {/* ⭐ Bouton pour sélectionner uniquement les colis de la ville filtrée */}
                      {destinationCityFilter !== 'all' && (() => {
                        const cityLoadables = loadableParcels.filter((p: any) => {
                          const destCity = p.destinationCity || p.receiver?.city
                          return destCity === destinationCityFilter
                        })
                        const citySelectedCount = cityLoadables.reduce((n: number, p: any) => n + (bulkLoadSelectedSet.has(p.id) ? 1 : 0), 0)
                        const allCitySelected = cityLoadables.length > 0 && citySelectedCount === cityLoadables.length
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setBulkLoadError('')
                              setBulkLoadSelectedIds(allCitySelected ? [] : cityLoadables.map((p: any) => p.id))
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                              allCitySelected
                                ? 'bg-white text-orange-700 border-orange-300'
                                : 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700'
                            }`}
                          >
                            {allCitySelected ? `Désélect. ${destinationCityFilter}` : `Sélect. ${destinationCityFilter} (${cityLoadables.length})`}
                          </button>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-white border border-blue-100 rounded-xl px-3 py-2">
                      <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">Nom du chauffeur *</label>
                      <input
                        type="text"
                        value={bulkLoadName}
                        onChange={e => { setBulkLoadError(''); setBulkLoadName(e.target.value) }}
                        placeholder="Ex: Mohammed Alami"
                        className="w-full text-sm font-semibold text-gray-800 focus:outline-none bg-transparent"
                      />
                    </div>
                    <div className="bg-white border border-blue-100 rounded-xl px-3 py-2">
                      <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">Téléphone</label>
                      <input
                        type="tel"
                        value={bulkLoadPhone}
                        onChange={e => setBulkLoadPhone(e.target.value)}
                        placeholder="Ex: 0661 23 45 67"
                        className="w-full text-sm text-gray-700 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs font-semibold text-blue-600">
                      {selectedCount} colis sélectionné(s)
                    </p>
                    {bulkLoadError && <p className="text-xs font-semibold text-red-600">{bulkLoadError}</p>}
                    <div className="ml-auto flex items-center gap-2">
                      {/* Bouton Exporter Excel */}
                      <button
                        type="button"
                        onClick={async () => {
                          // ✅ CORRECTION: Utiliser allDisplayParcels au lieu de loadableParcels
                          // pour inclure TOUS les parcels, même ceux filtrés après sélection
                          const selectedParcels = allDisplayParcels.filter((p: any) => bulkLoadSelectedSet.has(p.id))

                          if (selectedParcels.length === 0) {
                            alert('Aucune expédition sélectionnée à exporter')
                            return
                          }

                          const today = new Date().toLocaleDateString('fr-FR')
                          const timeNow = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

                          // Déterminer le type de paiement prédominant
                          const paymentTypes = selectedParcels
                            .filter((p: any) => p.codAmount && p.codAmount > 0)
                            .map((p: any) => codPaymentTypeOf(p) || 'especes')
                          const paymentCounts: any = {}
                          paymentTypes.forEach((t: string) => {
                            paymentCounts[t] = (paymentCounts[t] || 0) + 1
                          })
                          const mainPaymentType = Object.keys(paymentCounts).length > 0
                            ? Object.keys(paymentCounts).reduce((a, b) => paymentCounts[a] > paymentCounts[b] ? a : b)
                            : null
                          const paymentLabel = mainPaymentType === 'cheque' ? 'Contre Chèque' :
                                              mainPaymentType === 'especes' ? 'Contre Espèces' :
                                              mainPaymentType === 'traite' ? 'Contre Traite' : ''

                          // Créer les données pour Excel
                          const data: any[] = []

                          // Lignes vides au début (pour que le tableau commence à la ligne 4)
                          data.push(['', '', '', '', '', '', ''])
                          data.push(['', '', '', '', '', '', ''])
                          data.push(['', '', '', '', '', '', ''])

                          // Ligne 4 : Date et type de paiement
                          data.push([`Date: ${today} ${timeNow}${paymentLabel ? ' - ' + paymentLabel : ''}`, '', '', '', '', '', ''])

                          // Ligne 5 : Total
                          data.push([`Total: ${selectedParcels.length} expédition(s)`, '', '', '', '', '', ''])

                          // Ligne 6 : Vide
                          data.push(['', '', '', '', '', '', ''])

                          // Ligne 7 : Headers
                          data.push(['N° EXP (NIC)', 'Expéditeur', 'Destinataire', 'Ville Exp.', 'Ville Dest.', 'Date Exp.', 'Prix'])

                          // Lignes 5+ : Données
                          selectedParcels.forEach((p: any) => {
                            // Formater le COD - seulement le montant avec virgule
                            let codText = ''
                            const amount = parseFloat(p.codAmount)
                            if (!isNaN(amount) && amount > 0) {
                              codText = String(amount).replace('.', ',')
                            }

                            // Date d'expédition
                            const expeditionDate = p.expeditionDate || (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('fr-FR') : '')

                            data.push([
                              p.sender?.nic || '',
                              p.sender?.name || '',
                              p.receiver?.name || '',
                              p.sender?.city || p.originCity || '',
                              p.destinationCity || p.receiver?.city || '',
                              expeditionDate,
                              codText
                            ])
                          })

                          // Créer le workbook et la worksheet
                          const XLSX = await loadExcel()
                          if (!XLSX) return
                          const wb = XLSX.utils.book_new()
                          const ws = XLSX.utils.aoa_to_sheet(data)

                          // Largeurs des colonnes
                          ws['!cols'] = [
                            { wch: 15 }, // N° EXP
                            { wch: 20 }, // Expéditeur
                            { wch: 20 }, // Destinataire
                            { wch: 18 }, // Ville Exp.
                            { wch: 18 }, // Ville Dest.
                            { wch: 12 }, // Date Exp.
                            { wch: 12 }  // Prix
                          ]

                          // Ajouter la feuille au workbook
                          XLSX.utils.book_append_sheet(wb, ws, 'Expéditions')

                          // Télécharger le fichier
                          XLSX.writeFile(wb, `Expeditions_${today.replace(/\//g, '-')}_${timeNow.replace(/:/g, 'h')}.xlsx`)
                        }}
                        disabled={selectedCount === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold transition"
                      >
                        <Download className="w-4 h-4" />
                        Exporter Excel
                      </button>

                      {/* Bouton Charger les colis */}
                      <button
                        type="button"
                        onClick={() => handleBulkLoadTransport(loadableParcels)}
                        disabled={bulkLoadBusy || selectedCount === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold transition"
                      >
                        {bulkLoadBusy
                          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                          : <><Truck className="w-4 h-4" /> Charger les colis</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ⭐ NOUVEAU: Panneau d'assignation en masse à un livreur (chef d'agence et agentpro) */}
              {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (() => {
                // Colis assignables: arrivés dans la ville du chef, pas encore livrés
                const assignableParcels = assignableParcelsMemo
                const selectedCount = bulkAssignSelectedIds.length
                const allSelected = assignableParcels.length > 0 && selectedCount === assignableParcels.length

                if (assignableParcels.length === 0) return null

                return (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-bold text-green-800 flex items-center gap-2">
                          <User className="w-4 h-4" /> Assignation livreur groupée
                        </h3>
                        <p className="text-xs text-green-500 mt-0.5">
                          {selectedCount} sélectionné(s) sur {assignableParcels.length} colis à assigner
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setBulkAssignError('')
                            setBulkAssignSelectedIds(allSelected ? [] : assignableParcels.map((p: any) => p.id))
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                            allSelected
                              ? 'bg-white text-green-700 border-green-300'
                              : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                          }`}
                        >
                          {allSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                        </button>
                        {selectedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setBulkAssignError('')
                              setBulkAssignSelectedIds([])
                            }}
                            className="px-3 py-2 rounded-xl text-xs font-bold border border-red-300 bg-white text-red-700 hover:bg-red-50 transition flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Annuler ({selectedCount})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-white border border-green-100 rounded-xl px-3 py-2">
                        <label className="text-[10px] font-bold text-green-600 uppercase tracking-wider block mb-1">Livreur *</label>
                        <select
                          value={bulkAssignDriverId}
                          onChange={e => { setBulkAssignError(''); setBulkAssignDriverId(e.target.value) }}
                          className="w-full text-sm font-semibold text-gray-800 focus:outline-none bg-transparent"
                        >
                          <option value="">-- Choisir un livreur --</option>
                          {(drivers || [])
                            .filter((d: any) => d.city === profile?.city && ['livreur', 'chauffeur'].includes(d.role) && d.sectorId)
                            .map((d: any) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                      </div>
                      <div className="bg-white border border-green-100 rounded-xl px-3 py-2">
                        <label className="text-[10px] font-bold text-green-600 uppercase tracking-wider block mb-1">Secteur (optionnel)</label>
                        <select
                          value={bulkAssignSectorId}
                          onChange={e => setBulkAssignSectorId(e.target.value)}
                          className="w-full text-sm text-gray-700 focus:outline-none bg-transparent"
                        >
                          <option value="">-- Aucun --</option>
                          {(allSectors || [])
                            .filter((s: any) => s.city === profile?.city)
                            .map((s: any) => (
                              <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs font-semibold text-green-600">
                        {selectedCount} colis sélectionné(s)
                      </p>
                      {bulkAssignError && !bulkAssignError.includes('au moins un colis') && <p className="text-xs font-semibold text-red-600">{bulkAssignError}</p>}
                      {bulkAssignError && bulkAssignError.includes('au moins un colis') && selectedCount === 0 && <p className="text-xs font-semibold text-red-600">{bulkAssignError}</p>}
                      <div className="ml-auto flex items-center gap-2">
                        {/* Bouton Exporter Excel */}
                        <button
                          type="button"
                          onClick={async () => {
                            // ✅ CORRECTION: Utiliser allDisplayParcels au lieu de filteredParcels
                            // pour inclure TOUS les parcels sélectionnés, même si les filtres ont changé
                            const selectedParcels = allDisplayParcels.filter((p: any) => bulkAssignSelectedSet.has(p.id))

                            if (selectedParcels.length === 0) {
                              alert('Aucune expédition sélectionnée à exporter')
                              return
                            }

                            const today = new Date().toLocaleDateString('fr-FR')
                            const timeNow = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

                            // Déterminer le type de paiement prédominant
                            const paymentTypes = selectedParcels
                              .filter((p: any) => p.codAmount && p.codAmount > 0)
                              .map((p: any) => codPaymentTypeOf(p) || 'especes')
                            const paymentCounts: any = {}
                            paymentTypes.forEach((t: string) => {
                              paymentCounts[t] = (paymentCounts[t] || 0) + 1
                            })
                            const mainPaymentType = Object.keys(paymentCounts).length > 0
                              ? Object.keys(paymentCounts).reduce((a, b) => paymentCounts[a] > paymentCounts[b] ? a : b)
                              : null
                            const paymentLabel = mainPaymentType === 'cheque' ? 'Contre Chèque' :
                                                mainPaymentType === 'especes' ? 'Contre Espèces' :
                                                mainPaymentType === 'traite' ? 'Contre Traite' : ''

                            // Créer les données pour Excel
                            const data: any[] = []

                            // Lignes vides au début (pour que le tableau commence à la ligne 4)
                            data.push(['', '', '', '', '', '', ''])
                            data.push(['', '', '', '', '', '', ''])
                            data.push(['', '', '', '', '', '', ''])

                            // Ligne 4 : Date et type de paiement
                            data.push([`Date: ${today} ${timeNow}${paymentLabel ? ' - ' + paymentLabel : ''}`, '', '', '', '', '', ''])

                            // Ligne 5 : Total
                            data.push([`Total: ${selectedParcels.length} expédition(s)`, '', '', '', '', '', ''])

                            // Ligne 6 : Vide
                            data.push(['', '', '', '', '', '', ''])

                            // Ligne 7 : Headers
                            data.push(['N° EXP (NIC)', 'Expéditeur', 'Destinataire', 'Ville Exp.', 'Ville Dest.', 'Date Exp.', 'Prix'])

                            // Lignes 5+ : Données
                            selectedParcels.forEach((p: any) => {
                              // Formater le COD - seulement le montant avec virgule
                              let codText = ''
                              const amount = parseFloat(p.codAmount)
                              if (!isNaN(amount) && amount > 0) {
                                codText = String(amount).replace('.', ',')
                              }

                              // Date d'expédition
                              const expeditionDate = p.expeditionDate || (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('fr-FR') : '')

                              data.push([
                                p.sender?.nic || '',
                                p.sender?.name || '',
                                p.receiver?.name || '',
                                p.sender?.city || p.originCity || '',
                                p.destinationCity || p.receiver?.city || '',
                                expeditionDate,
                                codText
                              ])
                            })

                            // Créer le workbook et la worksheet
                            const XLSX = await loadExcel()
                            if (!XLSX) return
                            const wb = XLSX.utils.book_new()
                            const ws = XLSX.utils.aoa_to_sheet(data)

                            // Largeurs des colonnes
                            ws['!cols'] = [
                              { wch: 15 }, // N° EXP
                              { wch: 20 }, // Expéditeur
                              { wch: 20 }, // Destinataire
                              { wch: 18 }, // Ville Exp.
                              { wch: 18 }, // Ville Dest.
                              { wch: 12 }, // Date Exp.
                              { wch: 12 }  // Prix
                            ]

                            // Ajouter la feuille au workbook
                            XLSX.utils.book_append_sheet(wb, ws, 'Expéditions')

                            // Télécharger le fichier
                            XLSX.writeFile(wb, `Expeditions_a_assigner_${today.replace(/\//g, '-')}_${timeNow.replace(/:/g, 'h')}.xlsx`)
                          }}
                          disabled={selectedCount === 0}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold transition"
                        >
                          <Download className="w-4 h-4" />
                          Exporter Excel
                        </button>

                        {/* Bouton Assigner au livreur */}
                        <button
                          type="button"
                          onClick={() => handleBulkAssignDriverWithColor(assignableParcels)}
                          disabled={bulkAssignBusy || selectedCount === 0}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold transition"
                        >
                          {bulkAssignBusy
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Assignation...</>
                            : <><User className="w-4 h-4" /> Assigner au livreur</>
                          }
                        </button>

                        {/* Bouton Assigner pour ramassage */}
                        <button
                          type="button"
                          onClick={() => setAssignPickupModal(true)}
                          disabled={selectedPickupParcelIds.size === 0}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-bold transition"
                        >
                          <Package className="w-4 h-4" />
                          Assigner pour ramassage ({selectedPickupParcelIds.size})
                        </button>

                        {Object.keys(parcelColors).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearParcelColors(selectedCount > 0 ? bulkAssignSelectedIds : undefined)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold transition border border-red-300"
                            title={selectedCount > 0 ? "Effacer couleurs sélectionnées" : "Effacer toutes couleurs"}
                          >
                            <X className="w-4 h-4" />
                            {selectedCount > 0 ? 'Effacer couleurs' : 'Tout effacer'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ⭐ TRANSFORMATION GROUPÉE PORT DÛ → COMPTE DESTINATAIRE */}
              {(() => {
                // Filtrer les parcels Port Dû dans ma ville de destination (non livrés)
                const portDuParcels = portDuParcelsMemo
                const portDuIds = new Set(portDuParcels.map((p: any) => p.id))
                const selectedPortDuCount = bulkPortDuSelectedIds.filter((id: string) => portDuIds.has(id)).length
                const allPortDuSelected = portDuParcels.length > 0 && selectedPortDuCount === portDuParcels.length

                if ((profile?.role === 'chef_agence' || profile?.role === 'agentpro') && portDuParcels.length > 0) {
                  return (
                    <div className="mb-4 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl overflow-hidden">
                      {/* Header avec flèche toggle */}
                      <button
                        type="button"
                        onClick={() => setIsPortDuSectionOpen(!isPortDuSectionOpen)}
                        className="w-full p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-teal-100/50 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl sm:text-2xl shrink-0">🖐️</span>
                          <h3 className="font-bold text-teal-800 text-sm sm:text-base">
                            <span className="hidden sm:inline">Transformation </span>Port Dû → <span className="hidden sm:inline">Compte </span>Destinataire
                          </h3>
                          <span className="text-xs text-teal-600 font-semibold">
                            ({portDuParcels.length})
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 text-teal-700 transition-transform shrink-0 ${isPortDuSectionOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {/* Contenu collapsible */}
                      {isPortDuSectionOpen && (
                        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 border-t border-teal-200">
                          <div className="flex items-center justify-between gap-3 flex-wrap pt-3">
                            <p className="text-xs text-teal-700">
                              {portDuParcels.length} expédition(s) Port Dû disponible(s) · Sélectionnez celles à mettre en compte destinataire
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setBulkPortDuError('')
                                if (allPortDuSelected) {
                                  setBulkPortDuSelectedIds([])
                                } else {
                                  setBulkPortDuSelectedIds(portDuParcels.map((p: any) => p.id))
                                }
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 whitespace-nowrap ${
                                allPortDuSelected
                                  ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                                  : 'bg-white text-teal-700 border-teal-300 hover:bg-teal-50'
                              }`}
                            >
                              {allPortDuSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-sm font-semibold text-teal-800">
                              {selectedPortDuCount} expédition(s) sélectionnée(s)
                            </p>
                            {bulkPortDuError && <p className="text-xs font-semibold text-red-600">{bulkPortDuError}</p>}
                            <div className="ml-auto flex items-center gap-2">
                              {selectedPortDuCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBulkPortDuError('')
                                    setBulkPortDuSelectedIds([])
                                  }}
                                  className="px-3 py-2 rounded-xl text-xs font-bold border border-red-300 bg-white text-red-700 hover:bg-red-50 transition flex items-center gap-1"
                                >
                                  <X className="w-3 h-3" />
                                  Annuler ({selectedPortDuCount})
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={handleBulkPortDuToCompte}
                                disabled={bulkPortDuBusy || selectedPortDuCount === 0}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-bold transition"
                              >
                                {bulkPortDuBusy
                                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transformation...</>
                                  : <>🖐️ Transformer en Compte Dest</>
                                }
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )
        })()}
        </>)}

        {/* ⏳ Indicateur flottant (position fixe : la mise en page ne bouge pas) pendant le recalcul */}
        <PendingBadge show={tablePending && !loadingParcels} />
        {(loadingParcels ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune expédition trouvée</p>
          </div>
        ) : (() => {
          // ⭐ Fusion + filtre de recherche du tableau sur TOUS les parcels : mémoïsés plus haut
          const tableFilteredParcels = tableFilteredParcelsMemo

          const totalPages = Math.max(1, Math.ceil(tableFilteredParcels.length / PAGE_SIZE))
          const safePage = Math.min(parcelPage, totalPages - 1)
          const pagedParcels = tableFilteredParcels.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

          // ⚡ Créer une version fusionnée avec les mises à jour locales
          const mergedPagedParcels = pagedParcels.map((p: any) => ({
            ...p,
            ...(localParcelUpdates[p.id] || {})
          }))

          const isLastPage = safePage >= totalPages - 1

          // Calcul des totaux (sur TOUS les colis filtrés par la recherche, pas seulement la page)
          const agencyCity = profile?.city
          // ⭐ Utiliser tableFilteredParcels pour refléter la recherche du tableau
          const parcelsForTotals = tableFilteredParcels

          // RETOUR FOND (COD) / Port dû / En compte dest. : à la DESTINATION ; Port payé / En compte exp. : à l'ORIGINE.
          // ⚠️ Port dû inclut 'port_du_cheque'. ⚡ Totaux mémoïsés (tableTotals) : recalculés seulement si la liste change.
          const isPortDuType = (p: any) => p.portType === 'port_du' || p.portType === 'port_du_cheque'
          const { totalCod: totalCodAll, codByType, totalPortDu, totalPortPaye, totalPortEnCompteExp, totalPortEnCompteDest } = tableTotals
          // Types de valeur filtrés (Encaiss.) : un RF mixte ne compte que la part du/des type(s) choisi(s).
          const activeCodTypes: string[] | null = encaissementTypesFilter.length > 0
            ? encaissementTypesFilter
            : ['especes', 'cheque', 'traite'].includes(encaissementFilter) ? [encaissementFilter] : null
          const codTypeEntries = Object.entries(codByType as Record<string, number>)
            .filter(([k, v]) => v > 0 && (!activeCodTypes || activeCodTypes.includes(k)))
            .sort(([a], [b]) => ['especes', 'cheque', 'traite', 'bon_livraison', 'simple'].indexOf(a) - ['especes', 'cheque', 'traite', 'bon_livraison', 'simple'].indexOf(b))
          const totalCod = activeCodTypes ? codTypeEntries.reduce((s, [, v]) => s + v, 0) : totalCodAll
          const codHeaderBreakdown = codTypeEntries.length > 1
            ? codTypeEntries.map(([k, v]) => `${VALUE_TYPE_INFO[k]?.emoji || ''} ${v.toLocaleString('fr-MA')}`).join(' · ')
            : ''

          // 🔎 Détail cliquable de chaque solde : la liste ouverte doit correspondre
          // exactement au total affiché, donc on repart de parcelsForTotals.
          const isOrigin = (p: any) => p.originCity === agencyCity || p.sender?.city === agencyCity
          const isDestination = (p: any) => p.destinationCity === agencyCity || p.receiver?.city === agencyCity
          // Titre du tableau RETOUR FOND : reflète le type de valeur sélectionné dans le
          // filtre "Encaiss." (Espèces / Chèque / Traite), sinon libellé générique.
          // Les espèces s'"encaissent", les chèques et traites se "collectent" (ce sont des
          // documents remis, pas de l'argent perçu directement).
          const codTitleByType: Record<string, string> = {
            especes: 'Espèces',
            cheque:  'Chèques',
            traite:  'Traites',
          }
          // ⭐ Sélection multiple : combine les libellés des types cochés (ex: "Chèques + Traites")
          const codTitleDetail = encaissementTypesFilter.length > 0
            ? `${encaissementTypesFilter.map((k: string) => codTitleByType[k]).join(' + ')} à collecter`
            : codTitleByType[encaissementFilter]
              ? `${codTitleByType[encaissementFilter]} à ${encaissementFilter === 'especes' ? 'encaisser' : 'collecter'}`
              : null
          const codTitle = codTitleDetail
            ? `RETOUR FOND Clients — ${codTitleDetail} à la livraison (${agencyCity || 'agence'})`
            : `RETOUR FOND Clients — Valeurs à encaisser à la livraison (${agencyCity || 'agence'})`
          const openDetails = (key: string) => {
            const defs: Record<string, { title: string; amountKey: string; filter: (p: any) => boolean }> = {
              cod:            { title: codTitle, amountKey: 'codAmount', filter: p => isDestination(p) && (parseFloat(p.codAmount) || 0) > 0 && (!activeCodTypes || !p.codPartMixed || activeCodTypes.includes(p.codPartType)) },
              port_paye:      { title: `Ports Payés — Expéditions envoyées depuis ${agencyCity || 'l\'agence'}`,               amountKey: 'price',     filter: p => p.portType === 'port_paye' && isOrigin(p) },
              port_du:        { title: `Ports Dûs — Expéditions à encaisser à la livraison (${agencyCity || 'agence'})`,       amountKey: 'price',     filter: p => isPortDuType(p) && isDestination(p) },
              en_compte_exp:  { title: `Ports en Compte Expéditeur — Facturés au client expéditeur`,                           amountKey: 'price', filter: p => (p.portType === 'port_en_compte' || p.portType === 'port_en_compte_expediteur') && isOrigin(p) },
              en_compte_dest: { title: `Ports en Compte Destinataire — Facturés au client destinataire`,                       amountKey: 'price', filter: p => p.portType === 'port_en_compte_destinataire' && isDestination(p) },
            }
            const def = defs[key]
            // Nom du livreur filtré, ajouté au titre pour que l'impression reste explicite
            // une fois sortie de son contexte à l'écran.
            const driverLabel = driverFilter === 'unassigned' ? `En gare - ${profile?.city || ''}`
              : driverFilter !== 'all' ? availableDrivers.find((d: any) => d.id === driverFilter)?.name : null
            const titleWithDriver = driverLabel ? `${def.title} — Livreur : ${driverLabel}` : def.title
            // RETOUR FOND : un colis mixte = une ligne par part (💵 espèces / 📋 chèque ou 📝 traite)
            const source = key === 'cod' ? codPartRows(parcelsForTotals.filter(isDestination)) : parcelsForTotals
            setPortDetailsModal({ open: true, portType: key, title: `${titleWithDriver} — ${periodLabel}`, amountKey: def.amountKey, parcels: source.filter(def.filter) })
          }

          return viewMode === 'table' ? (
            // ═══════════════════════════════════════════════════════════════════
            // VUE TABLEAU (Excel-like avec scroll horizontal)
            // ═══════════════════════════════════════════════════════════════════
            <div className="space-y-4">
              {/* Résumé des totaux */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-4 shadow-lg">
                {/* 🗓️ "Période" est basée sur la journée d'opération (8h → 6h lendemain) : on
                    l'affiche explicitement pour que le total corresponde bien à ce qui est
                    montré, plutôt que de laisser croire à une plage calendaire simple. */}
                {datePreset === 'custom' && dateFrom && dateTo && (
                  <p className="text-xs text-gray-500 mb-2">
                    🗓️ Journée d'opération : {new Date(dateFrom + 'T12:00:00').toLocaleDateString('fr-MA')} 08h00 → {new Date(dateTo + 'T12:00:00').toLocaleDateString('fr-MA')} +1j 06h00
                  </p>
                )}
                <div className="flex items-center justify-between gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-bold text-gray-700">
                      {parcelMovementCount} expédition{parcelMovementCount > 1 ? 's' : ''}
                    </span>
                    {portTypeFilter !== 'all' && (
                      <span className="ml-2 px-2 py-1 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                        Filtre: {portTypeFilter === 'port_paye' ? '✅ Port payé' : portTypeFilter === 'port_du' ? '📮 Port dû' : '💼 En compte'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => openDetails('cod')}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-green-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                      <Banknote className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-xs text-gray-600 whitespace-nowrap">Total RETOUR FOND :</span>
                      <span className="text-sm font-black text-green-700">{totalCod.toLocaleString('fr-MA')} DH</span>
                      {codHeaderBreakdown && <span className="text-[11px] font-semibold text-green-700 whitespace-nowrap">({codHeaderBreakdown})</span>}
                    </button>
                    <button onClick={() => openDetails('port_paye')}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                      <span className="text-lg shrink-0">✅</span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">Total Port payé :</span>
                      <span className="text-sm font-black text-blue-700">{totalPortPaye.toLocaleString('fr-MA')} DH</span>
                    </button>
                    <button onClick={() => openDetails('port_du')}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                      <span className="text-lg shrink-0">📮</span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">Total Port dû :</span>
                      <span className="text-sm font-black text-orange-700">{totalPortDu.toLocaleString('fr-MA')} DH</span>
                    </button>
                    <button onClick={() => openDetails('en_compte_exp')}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                      <span className="text-lg shrink-0">💼</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">Port en compte Exp. :</span>
                      <span className="text-sm font-bold text-gray-600">{totalPortEnCompteExp.toLocaleString('fr-MA')} DH</span>
                    </button>
                    <button onClick={() => openDetails('en_compte_dest')}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                      <span className="text-lg shrink-0">🎯</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">Port en compte Dest. :</span>
                      <span className="text-sm font-bold text-gray-600">{totalPortEnCompteDest.toLocaleString('fr-MA')} DH</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ⭐ Bouton effacer couleurs */}
              {Object.keys(parcelColors).length > 0 && (
                <div className="flex items-center justify-between bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-3 shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-700">
                      {Object.keys(parcelColors).length} expédition{Object.keys(parcelColors).length > 1 ? 's' : ''} colorée{Object.keys(parcelColors).length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => clearParcelColors()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition shadow-md"
                  >
                    <X className="w-4 h-4" />
                    Effacer toutes les couleurs
                  </button>
                </div>
              )}

              {/* ⭐ Filtre de statut actif */}
              {parcelStatusFilter && parcelStatusFilter !== 'all' && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-gray-600 font-semibold">Filtre actif:</span>
                  <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[parcelStatusFilter]?.bg || 'bg-gray-100'} ${STATUS_COLORS[parcelStatusFilter]?.text || 'text-gray-700'}`}>
                    {parcelStatusFilter}
                  </span>
                  <button
                    onClick={() => setParcelStatusFilter && setParcelStatusFilter('all')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                  >
                    Voir tous les colis
                  </button>
                </div>
              )}

              {/* ⭐ Barre de recherche spécifique au tableau */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500" />
                <input
                  ref={searchInputRef}
                  placeholder="🔍 Recherche dans le tableau: N° EXP, Nom Expéditeur, Nom Destinataire, Adresse..."
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 pl-12 pr-12 py-3.5 rounded-xl text-sm font-medium text-gray-800 placeholder-gray-500 focus:border-purple-500 focus:bg-white focus:shadow-lg focus:outline-none transition-all"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 transition"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>

              <HScrollArrows className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 rounded-2xl shadow-xl border-2 border-purple-200">
                <table className="w-full text-xs">
                  <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white sticky top-0 shadow-lg">
                    <tr>
                      {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                        <th className="px-3 py-4 text-center font-bold whitespace-nowrap border-r border-green-400/30 bg-green-600/40">
                          <div className="flex items-center justify-center gap-1">
                            <CheckSquare className="w-4 h-4" />
                          </div>
                        </th>
                      )}
                      {visibleColumns.nexp && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            N° EXP
                          </div>
                        </th>
                      )}
                      {visibleColumns.date && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Date Création
                          </div>
                        </th>
                      )}
                      {visibleColumns.dateLivraison && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Date Livraison
                          </div>
                        </th>
                      )}
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">Statut</th>
                      {visibleColumns.expediteur && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">
                          <div className="flex items-center gap-1">
                            📤 Expéditeur
                          </div>
                        </th>
                      )}
                      {visibleColumns.telExp && <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">Tél Exp.</th>}
                      {visibleColumns.villeExp && <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">Ville Exp.</th>}
                      {visibleColumns.destinataire && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">
                          <div className="flex items-center gap-1">
                            📥 Destinataire
                          </div>
                        </th>
                      )}
                      {visibleColumns.telDest && <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">Tél Dest.</th>}
                      {visibleColumns.villeDest && <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">Ville Dest.</th>}
                      {visibleColumns.adresse && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">
                          <div className="flex flex-col gap-1">
                            <span>Adresse</span>
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={addressFilter}
                              onChange={e => setAddressFilter(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="w-20 px-2 py-1 text-xs border border-pink-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                            />
                          </div>
                        </th>
                      )}
                      {visibleColumns.service && <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30">Service</th>}
                      {visibleColumns.nbColis && (
                        <th className="px-4 py-4 text-center font-bold whitespace-nowrap border-r border-purple-400/30">
                          <div className="flex flex-col items-center gap-1">
                            <span>Nb Colis</span>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input
                                type="number"
                                placeholder="Min"
                                value={nbColisFilterMin}
                                onChange={e => setNbColisFilterMin(e.target.value)}
                                className="w-12 px-1 py-1 text-xs border border-purple-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                              />
                              <input
                                type="number"
                                placeholder="Max"
                                value={nbColisFilterMax}
                                onChange={e => setNbColisFilterMax(e.target.value)}
                                className="w-12 px-1 py-1 text-xs border border-purple-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                              />
                            </div>
                          </div>
                        </th>
                      )}
                      {visibleColumns.poids && <th className="px-4 py-4 text-center font-bold whitespace-nowrap border-r border-purple-400/30">Poids</th>}
                      {visibleColumns.port && (
                        <th className="px-4 py-4 text-right font-bold whitespace-nowrap border-r border-purple-400/30 bg-green-600/30">
                          <div className="flex items-center justify-end gap-1">
                            💰 Port
                          </div>
                        </th>
                      )}
                      {visibleColumns.typePort && (
                        <th className="px-4 py-4 text-center font-bold whitespace-nowrap border-r border-purple-400/30 bg-green-600/30">
                          <div className="flex items-center justify-center gap-1">
                            📋 Type Port
                          </div>
                        </th>
                      )}
                      {visibleColumns.cod && (
                        <th className="px-4 py-4 text-right font-bold whitespace-nowrap border-r border-purple-400/30 bg-green-600/30">
                          <div className="flex flex-col items-end gap-1">
                            <span className="flex items-center gap-1">💵 COD</span>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input
                                type="number"
                                placeholder="Min"
                                value={codFilterMin}
                                onChange={e => setCodFilterMin(e.target.value)}
                                className="w-14 px-1 py-1 text-xs border border-green-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-1 focus:ring-green-500 focus:border-green-500"
                              />
                              <input
                                type="number"
                                placeholder="Max"
                                value={codFilterMax}
                                onChange={e => setCodFilterMax(e.target.value)}
                                className="w-14 px-1 py-1 text-xs border border-green-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-1 focus:ring-green-500 focus:border-green-500"
                              />
                            </div>
                          </div>
                        </th>
                      )}
                      {visibleColumns.livreur && (
                        <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30">
                          <div className="flex items-center gap-1">
                            🚚 Livreur
                          </div>
                        </th>
                      )}
                      <th className="px-4 py-4 text-center font-bold whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {/* pagedParcels est déjà filtré par la recherche tableau (getTableFilteredParcels) */}
                    {pagedParcels.map((parcel: any, idx: number) => {
                      const isOwn = canActAsParcelOwner(parcel)
                      const sc = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                      const serviceType = ALL_SERVICE_TYPES.find(st => st.key === parcel.serviceType)
                      const driver = drivers?.find((d: any) => d.id === parcel.deliveryDriverId || d.id === parcel.chauffeurId)

                      // Checkbox toujours affiché quelque soit le statut ou l'agence
                      const isInMyCity = (parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city)
                      const isFromMyCity = (parcel.originCity === profile?.city || parcel.sender?.city === profile?.city)
                      const isAssignable = (profile?.role === 'chef_agence' || profile?.role === 'agentpro')
                      const assignSelected = bulkAssignSelectedSet.has(parcel.id)

                      return (
                        <tr
                          key={parcel.id}
                          onClick={handleParcelRowClick}
                          tabIndex={-1}
                          style={{ backgroundColor: parcelColors[parcel.id] || 'transparent' }}
                          className={`border-b border-gray-100 transition-all hover:shadow-lg hover:scale-[1.01] hover:z-10 relative cursor-pointer ${
                            !parcelColors[parcel.id] && (idx % 2 === 0 ? 'bg-white' : 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30')
                          } ${isOwn ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-orange-400'}`}
                        >
                          {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                            <td className="px-3 py-3 text-center border-r border-gray-100 bg-green-50/30">
                              <div className="flex flex-col items-center gap-1">
                                {/* Checkbox assignation livreur */}
                                {isAssignable ? (
                                  <input
                                    type="checkbox"
                                    key={`assign-${parcel.id}-${assignSelected}`}
                                    checked={assignSelected}
                                    onChange={e => {
                                      e.stopPropagation()
                                      setBulkAssignError('')
                                      const checked = e.target.checked

                                      setBulkAssignSelectedIds((prev: any) => {
                                        if (checked) {
                                          return [...new Set([...prev, parcel.id])]
                                        } else {
                                          return prev.filter((id: any) => id !== parcel.id)
                                        }
                                      })

                                      // Colorer immédiatement si un livreur est sélectionné et on coche
                                      if (checked && bulkAssignDriverId) {
                                        const driverColor = getDriverColor(bulkAssignDriverId)
                                        setParcelColors(prev => ({ ...prev, [parcel.id]: driverColor }))
                                      }

                                      // ⚠️ Sélection atteinte via une recherche (Tab depuis le champ,
                                      // voir handleKeyDown) : vider la recherche et remettre le focus
                                      // dessus pour enchaîner directement sur une nouvelle recherche,
                                      // sans avoir à cliquer sur le champ à chaque colis.
                                      if (checked && tableSearch) {
                                        setTableSearch('')
                                        setTimeout(() => {
                                          searchInputRef.current?.focus()
                                        }, 100)
                                      }
                                    }}
                                    tabIndex={0}
                                    className="w-4 h-4 accent-green-600 cursor-pointer checkbox-assign-table"
                                    title="Assignation livreur"
                                  />
                                ) : (
                                  <span className="text-gray-300 text-xs">—</span>
                                )}

                                {/* Checkbox transformation Port Dû → Compte Destinataire */}
                                {(() => {
                                  const isDestinationAgency = parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city
                                  const isPortDu = parcel.portType === 'port_du'
                                  const notDelivered = !parcel.deliveredAt && parcel.status !== 'Livré'

                                  if (!isPortDu || !isDestinationAgency || !notDelivered) return null

                                  const portDuSelected = bulkPortDuSelectedSet.has(parcel.id)
                                  return (
                                    <input
                                      type="checkbox"
                                      checked={portDuSelected}
                                      onChange={e => {
                                        e.stopPropagation()
                                        setBulkPortDuError('')
                                        setBulkPortDuSelectedIds((prev: string[]) => e.target.checked
                                          ? [...new Set([...prev, parcel.id])]
                                          : prev.filter((id: string) => id !== parcel.id)
                                        )
                                      }}
                                      tabIndex={0}
                                      className="w-4 h-4 accent-teal-600 cursor-pointer"
                                      title="🖐️ Transformer en Compte Destinataire"
                                    />
                                  )
                                })()}

                                {/* Checkbox assignation ramassage */}
                                {isAssignable && isFromMyCity && (
                                  <input
                                    type="checkbox"
                                    checked={selectedPickupParcelIds.has(parcel.id)}
                                    onChange={e => {
                                      e.stopPropagation()
                                      setBulkAssignError('')
                                      const checked = e.target.checked
                                      setSelectedPickupParcelIds(prev => {
                                        const newSet = new Set(prev)
                                        if (checked) {
                                          newSet.add(parcel.id)
                                        } else {
                                          newSet.delete(parcel.id)
                                        }
                                        return newSet
                                      })
                                    }}
                                    tabIndex={0}
                                    className="w-4 h-4 accent-orange-600 cursor-pointer"
                                    title="📦 Assigner pour ramassage"
                                  />
                                )}
                              </div>
                            </td>
                          )}
                          {visibleColumns.nexp && (
                            <td className="px-4 py-3 font-mono font-black text-blue-600 whitespace-nowrap text-sm border-r border-gray-100">
                              <div className="flex items-center gap-2">
                                <span>{parcel.sender?.nic || '—'}</span>
                                {(() => {
                                  const isOriginAgency = parcel.originCity === profile?.city || parcel.sender?.city === profile?.city
                                  const isDestinationAgency = parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city

                                  // Afficher 🖐️ seulement dans l'agence DESTINATAIRE
                                  if (parcel.portType === 'port_en_compte_destinataire' && isDestinationAgency) {
                                    return (
                                      <span className="inline-flex items-center px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-bold border border-teal-300" title="Port en compte destinataire">
                                        🖐️
                                      </span>
                                    )
                                  }

                                  // Afficher 💼 seulement dans l'agence EXPÉDITEUR
                                  if ((parcel.portType === 'port_en_compte' || parcel.portType === 'port_en_compte_expediteur') && isOriginAgency) {
                                    return (
                                      <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold border border-purple-300" title="Port en compte expéditeur">
                                        💼
                                      </span>
                                    )
                                  }

                                  return null
                                })()}
                              </div>
                            </td>
                          )}
                          {visibleColumns.date && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                              {(() => {
                                const isOriginAgency = parcel.originCity === profile?.city || parcel.sender?.city === profile?.city
                                const canEditDate = (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && isOriginAgency

                                // Utiliser expeditionDate si défini, sinon createdAt
                                let currentDate: Date | null = null
                                if (parcel.expeditionDate) {
                                  currentDate = new Date(parcel.expeditionDate)
                                } else if (parcel.createdAt) {
                                  currentDate = new Date(parcel.createdAt.seconds * 1000)
                                }

                                const isEditing = editingDateId === parcel.id

                                if (canEditDate && isEditing) {
                                  return (
                                    <div className="flex flex-col gap-2 py-1">
                                      <input
                                        type="date"
                                        value={editingDateValue}
                                        onChange={e => setEditingDateValue(e.target.value)}
                                        className="border-2 border-blue-500 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 shadow-sm"
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleSaveDate(parcel.id, editingDateValue)
                                          if (e.key === 'Escape') {
                                            setEditingDateId(null)
                                            setEditingDateValue('')
                                          }
                                        }}
                                      />
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleSaveDate(parcel.id, editingDateValue)}
                                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition shadow-sm"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                          Enregistrer
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingDateId(null)
                                            setEditingDateValue('')
                                          }}
                                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition shadow-sm"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          Annuler
                                        </button>
                                      </div>
                                    </div>
                                  )
                                }

                                return (
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-700 font-semibold text-sm">
                                      {currentDate ? currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                    </span>
                                    {canEditDate && (
                                      <button
                                        onClick={() => {
                                          setEditingDateId(parcel.id)
                                          if (currentDate) {
                                            const yyyy = currentDate.getFullYear()
                                            const mm = String(currentDate.getMonth() + 1).padStart(2, '0')
                                            const dd = String(currentDate.getDate()).padStart(2, '0')
                                            setEditingDateValue(`${yyyy}-${mm}-${dd}`)
                                          }
                                        }}
                                        className="p-1 hover:opacity-70 transition text-sm cursor-pointer"
                                        title="Modifier la date"
                                      >
                                        ✏️
                                      </button>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                          )}
                          {visibleColumns.dateLivraison && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                              <span className="text-gray-600 font-medium text-sm">
                                {/* ⚠️ deliveredAt existe en base sous deux formats (chaîne ISO ou
                                    Timestamp Firestore selon le chemin d'écriture) — new Date() seul
                                    sur un Timestamp produit "Invalid Date". Gérer les deux. */}
                                {parcel.deliveredAt?.toDate
                                  ? parcel.deliveredAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                  : parcel.deliveredAt
                                    ? new Date(parcel.deliveredAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                    : '—'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') ? (
                                <>
                                  <button
                                    onClick={async () => {
                                      if (parcel.status === 'Livré') {
                                        // Revenir au statut précédent (chercher le dernier statut qui n'est pas "Livré")
                                        let previousStatus = 'En cours de livraison'
                                        // 🪶 historique absent de la version allégée → relu dans le document complet
                                        const hist: any[] = ((await ensureFullParcel(parcel)) as any).history || []
                                        if (hist.length > 0) {
                                          // Parcourir l'historique en sens inverse pour trouver le dernier statut différent de "Livré"
                                          for (let i = hist.length - 1; i >= 0; i--) {
                                            if (hist[i].status && hist[i].status !== 'Livré') {
                                              previousStatus = hist[i].status
                                              break
                                            }
                                          }
                                        }

                                        try {
                                          const { updateParcelStatus } = await import('../../../firebase/parcels')
                                          const { doc, updateDoc, deleteField } = await import('firebase/firestore')
                                          const { db } = await import('../../../firebase/config')

                                          // D'abord changer le statut
                                          await updateParcelStatus(parcel.id, previousStatus, {
                                            note: 'Annulation livraison - retour au statut précédent'
                                          })

                                          // Ensuite supprimer deliveredAt dans une opération séparée
                                          await updateDoc(doc(db, 'parcels', parcel.id), {
                                            deliveredAt: deleteField()
                                          })

                                          // ⚡ Mise à jour locale pour affichage temps réel
                                          setLocalParcelUpdates(prev => ({
                                            ...prev,
                                            [parcel.id]: { ...prev[parcel.id], status: previousStatus, deliveredAt: null }
                                          }))
                                          setForceUpdateCounter(c => c + 1)
                                        } catch (err: any) {
                                          console.error('Erreur annulation livraison:', err)
                                        }
                                      } else {
                                        // Marquer comme livré directement
                                        try {
                                          const { updateParcelStatus } = await import('../../../firebase/parcels')
                                          const deliveredAt = new Date().toISOString()
                                          await updateParcelStatus(parcel.id, 'Livré', {
                                            deliveredAt,
                                          })

                                          // ⚡ Mise à jour locale pour affichage temps réel
                                          setLocalParcelUpdates(prev => ({
                                            ...prev,
                                            [parcel.id]: { ...prev[parcel.id], status: 'Livré', deliveredAt }
                                          }))
                                          setForceUpdateCounter(c => c + 1)
                                        } catch (err: any) {
                                          console.error('Erreur changement statut:', err)
                                        }
                                      }
                                    }}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all hover:scale-105 hover:shadow-md cursor-pointer ${sc}`}
                                    title={parcel.status === 'Livré' ? 'Cliquer pour annuler la livraison' : 'Cliquer pour marquer comme Livré'}
                                  >
                                    {parcel.status || 'Initialisé'}
                                    {parcel.status === 'Livré' && <span className="text-xs">↶</span>}
                                  </button>
                                </>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm ${sc}`}>
                                  {parcel.status || 'Initialisé'}
                                </span>
                              )}
                              {/* 🖐️ Éditer : à côté du statut */}
                              {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                                <button
                                  onClick={() => ensureFullParcel(parcel).then((parcel: any) => setQuickEditModal({
                                    open: true,
                                    parcel,
                                    price: parcel.price?.toString() || '',
                                    portType: parcel.portType || '',
                                    status: parcel.status || '',
                                    codAmount: isMixedCod(parcel) ? String(codDocPartOf(parcel)) : (parcel.codAmount?.toString() || ''),
                                    codMixed: isMixedCod(parcel),
                                    codCashAmount: isMixedCod(parcel) ? String(codCashPartOf(parcel)) : '',
                                    serviceType: normalizeServiceType(parcel.serviceType) || '',
                                    nbColis: parcel.nbColis?.toString() || '',
                                    poids: parcel.poids?.toString() || '',
                                    contenu: parcel.contenu || '',
                                    remarque: parcel.remarque || '',
                                    loading: false,
                                    error: ''
                                  }))}
                                  tabIndex={-1}
                                  className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-sm hover:shadow-md transition-all transform hover:scale-105 flex items-center gap-1"
                                  title="Édition complète"
                                >
                                  <span className="text-base">🖐️</span>
                                  <span className="font-semibold text-xs">Éditer</span>
                                </button>
                              )}
                            </div>
                          </td>
                          {visibleColumns.expediteur && (
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[200px] truncate border-r border-gray-100 bg-blue-50/30">
                              {parcel.sender?.name || '—'}
                            </td>
                          )}
                          {visibleColumns.telExp && (
                            <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap border-r border-gray-100 bg-blue-50/30">
                              {parcel.sender?.tel || '—'}
                            </td>
                          )}
                          {visibleColumns.villeExp && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100 bg-blue-50/30">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                                📍 {parcel.sender?.city || '—'}
                              </span>
                            </td>
                          )}
                          {visibleColumns.destinataire && (
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[200px] border-r border-gray-100 bg-pink-50/30">
                              <div className="flex items-center gap-2">
                                <span className="truncate">{parcel.receiver?.name || '—'}</span>
                                {parcel.portType === 'port_en_compte_destinataire' && (
                                  <span className="text-lg shrink-0" title="Port en compte destinataire">🖐️</span>
                                )}
                              </div>
                            </td>
                          )}
                          {visibleColumns.telDest && (
                            <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap border-r border-gray-100 bg-pink-50/30">
                              {parcel.receiver?.tel || '—'}
                            </td>
                          )}
                          {visibleColumns.villeDest && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100 bg-pink-50/30">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 text-pink-700 rounded-lg text-xs font-semibold">
                                📍 {parcel.receiver?.city || parcel.destinationCity || '—'}
                              </span>
                            </td>
                          )}
                          {visibleColumns.adresse && (
                            <td className="px-4 py-3 text-xs whitespace-nowrap max-w-[250px] truncate border-r border-gray-100 bg-pink-50/30">
                              {parcel.enGare ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 text-orange-700 rounded-lg font-bold">
                                  🚉 En gare
                                </span>
                              ) : (
                                <span className="text-gray-600">{parcel.receiver?.address || '—'}</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.service && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                              {parcel.serviceType === 'simple' || !parcel.serviceType ? (
                                <button
                                  onClick={() => ensureFullParcel(parcel).then((parcel: any) => setHistoryModal({ open: true, parcel }))}
                                  className="flex flex-col gap-0.5 text-left hover:bg-gray-50 px-2 py-1 rounded-lg transition-colors"
                                  title="Cliquez pour voir l'historique des modifications"
                                >
                                  <span className="text-sm text-gray-600 font-medium">Simple</span>
                                  {parcel.lastModifiedByName && (
                                    <span className="text-xs text-orange-600 font-semibold">
                                      Modifié par {parcel.lastModifiedByName}
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg font-semibold">
                                  {isMixedCod(parcel) ? codServiceLabel(parcel) : <>{serviceType?.emoji} {serviceType?.label}</>}
                                </span>
                              )}
                            </td>
                          )}
                          {visibleColumns.nbColis && (
                            <td className="px-4 py-3 text-center border-r border-gray-100">
                              <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg font-bold">
                                {parcel.nbColis || 1}
                              </span>
                            </td>
                          )}
                          {visibleColumns.poids && (
                            <td className="px-4 py-3 text-center border-r border-gray-100">
                              <span className="text-gray-700 font-semibold">
                                {parcel.weight ? `${parcel.weight} kg` : '—'}
                              </span>
                            </td>
                          )}
                          {visibleColumns.port && (
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap border-r border-gray-100 bg-green-50/30">
                              <span className="text-green-700 text-sm">
                                {parcel.price ? `${parcel.price} DH` : '—'}
                              </span>
                            </td>
                          )}
                          {visibleColumns.typePort && (
                            <td className="px-4 py-3 text-center whitespace-nowrap border-r border-gray-100 bg-green-50/30">
                              {parcel.portType === 'port_paye' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                                  ✅ Payé
                                </span>
                              ) : parcel.portType === 'port_du' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold">
                                  📮 Dû
                                </span>
                              ) : parcel.portType === 'port_du_cheque' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                                  📋 Dû Chèque
                                </span>
                              ) : parcel.portType === 'port_en_compte_destinataire' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 text-pink-700 rounded-lg text-xs font-bold">
                                  🖐️ C/Dest
                                </span>
                              ) : (parcel.portType === 'port_en_compte' || parcel.portType === 'port_en_compte_expediteur') ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-bold">
                                  💼 C/Exp
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.cod && (
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap border-r border-gray-100 bg-green-50/30">
                              {parcel.serviceType === 'simple' || parcel.serviceType === 'retour_bl' ? (
                                <span></span>
                              ) : parcel.codAmount && parcel.codAmount > 0 ? (
                                <div className="flex flex-col items-end gap-1">
                                  {(parcel.serviceType === 'cheque' || parcel.serviceType === 'traite') && parcel.codDocumentStatus && (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                      parcel.codDocumentStatus === 'cheque_recu' || parcel.codDocumentStatus === 'traite_recu'
                                        ? 'bg-green-100 text-green-700'
                                        : parcel.codDocumentStatus === 'cheque_encours' || parcel.codDocumentStatus === 'traite_encours'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {parcel.codDocumentStatus === 'cheque_recu' && '✅ Chèque reçu'}
                                      {parcel.codDocumentStatus === 'cheque_encours' && '⏳ Chèque encours'}
                                      {parcel.codDocumentStatus === 'traite_recu' && '✅ Traite reçue'}
                                      {parcel.codDocumentStatus === 'traite_encours' && '⏳ Traite encours'}
                                      {isMixedCod(parcel) && ` (${codDocPartOf(parcel).toLocaleString('fr-MA')} DH)`}
                                    </span>
                                  )}
                                  <div className="inline-flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-lg text-sm font-black">
                                      💰 {parcel.codAmount} DH
                                    </span>
                                    {isMixedCod(parcel) && (
                                      <span className="text-[10px] font-semibold text-green-700 whitespace-nowrap" title="Retour de fonds mixte">{codPartsBreakdown(parcel)}</span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        ensureFullParcel(parcel).then((parcel: any) => setCodEditModal({ parcel, ...codEditInitial(parcel), loading: false, error: '' }))
                                      }}
                                      className="hover:scale-125 transition-transform cursor-pointer text-lg"
                                      title={`Modifier COD (role: ${profile?.role})`}
                                    >
                                      ✏️
                                    </button>
                                    {(parcel.serviceType === 'cheque' || parcel.serviceType === 'traite') && (
                                      <button
                                        onClick={() => setCodDocumentModal({
                                          open: true,
                                          parcelId: parcel.id,
                                          currentStatus: parcel.codDocumentStatus || null,
                                          serviceType: parcel.serviceType
                                        })}
                                        className="hover:scale-125 transition-transform cursor-pointer text-lg"
                                        title="Gérer le statut du document"
                                      >
                                        ✋
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.livreur && (
                            <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                              {parcel.deliveryDriverName ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-lg font-semibold">
                                    🚚 {parcel.deliveryDriverName}
                                  </span>
                                  {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                                    <button
                                      onClick={() => setChangeDriverModal({ open: true, parcel, newDriverId: '', loading: false, error: '' })}
                                      className="hover:scale-125 transition-transform cursor-pointer text-base"
                                      title="Changer le livreur"
                                    >
                                      🖐️
                                    </button>
                                  )}
                                </div>
                              ) : (parcel.originCity && parcel.originCity === parcel.destinationCity) ? (
                                // Expédition LOCALE (ville d'expédition = ville de destination) : « 🚚 En gare - <ville> 🖐️ »
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-lg font-semibold">
                                    🚚 En gare - {parcel.destinationCity}
                                  </span>
                                  {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                                    <button
                                      onClick={() => setChangeDriverModal({ open: true, parcel, newDriverId: '', loading: false, error: '' })}
                                      className="hover:scale-125 transition-transform cursor-pointer text-base"
                                      title="Assigner à un livreur"
                                    >
                                      🖐️
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500 text-xs">En gare - {parcel.destinationCity || profile?.city}</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              {/* ⚡ Actions rapides — Toggles de statuts (version compacte tableau) */}
                              {canManageStatus(parcel) && (
                                <QuickStatusToggles
                                  parcel={parcel}
                                  profile={profile}
                                  compact={true}
                                  onSuccess={(updates) => {
                                    // ⚡ Mise à jour locale immédiate pour affichage temps réel
                                    setLocalParcelUpdates(prev => ({
                                      ...prev,
                                      [parcel.id]: { ...prev[parcel.id], ...updates }
                                    }))
                                    setForceUpdateCounter(c => c + 1)
                                  }}
                                />
                              )}

                              {/* Boutons Éditer et Supprimer */}
                              <div className="flex items-center justify-center gap-1.5">
                                {isOwn && (
                                  <button
                                    onClick={() => handleDeleteClick(parcel)}
                                    tabIndex={-1}
                                    className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md hover:shadow-lg transition-all transform hover:scale-110"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </HScrollArrows>

              {/* Pagination pour vue tableau */}
              {totalPages > 1 && (() => {
                const goTo = (p: number) => { setParcelPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
                const pages: number[] = []
                for (let i = 0; i < totalPages; i++) {
                  if (i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1) pages.push(i)
                }
                const items: (number | string)[] = []
                pages.forEach((p, idx) => {
                  if (idx > 0 && p - pages[idx - 1] > 1) items.push('…')
                  items.push(p)
                })
                return (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400">
                      {parcelMovementCount}{hasMoreParcels ? '+' : ''} expédition{parcelMovementCount > 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => goTo(Math.max(0, safePage - 1))} disabled={safePage === 0}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>

                      {items.map((item, idx) =>
                        item === '…'
                          ? <span key={`dots-${idx}`} className="px-1 text-gray-400 text-sm select-none">…</span>
                          : <button key={item} onClick={() => goTo(Number(item))}
                              className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition border ${
                                item === safePage
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                              }`}
                            >{Number(item) + 1}</button>
                      )}

                      <button onClick={() => goTo(Math.min(totalPages - 1, safePage + 1))} disabled={isLastPage}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                    </div>
                    <span className="text-xs text-gray-400">Page {safePage + 1} / {totalPages}</span>
                  </div>
                )
              })()}

              {/* Bouton Charger plus (pagination avec filtre de date) */}
              {hasMoreWithDateFilter && (
                <div className="flex justify-center py-6">
                  <button
                    onClick={handleLoadMoreWithDateFilter}
                    disabled={loadingMoreWithDateFilter}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loadingMoreWithDateFilter ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Chargement...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-5 h-5" />
                        <span>Charger 1000 expéditions supplémentaires</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            // ═══════════════════════════════════════════════════════════════════
            // VUE CARTES (existante)
            // ═══════════════════════════════════════════════════════════════════
          <div className="space-y-4">
            {/* Résumé des totaux */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-4 shadow-lg">
              {/* 🗓️ Voir explication dans la vue tableau ci-dessus : "Période" = journée
                  d'opération (8h → 6h lendemain), affichée pour éviter toute confusion. */}
              {datePreset === 'custom' && dateFrom && dateTo && (
                <p className="text-xs text-gray-500 mb-2">
                  🗓️ Journée d'opération : {new Date(dateFrom + 'T12:00:00').toLocaleDateString('fr-MA')} 08h00 → {new Date(dateTo + 'T12:00:00').toLocaleDateString('fr-MA')} +1j 06h00
                </p>
              )}
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-bold text-gray-700">
                    {parcelMovementCount} expédition{parcelMovementCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => openDetails('cod')}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-green-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                    <Banknote className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-xs text-gray-600 whitespace-nowrap">Total RETOUR FOND :</span>
                    <span className="text-sm font-black text-green-700">{totalCod.toLocaleString('fr-MA')} DH</span>
                    {codHeaderBreakdown && <span className="text-[11px] font-semibold text-green-700 whitespace-nowrap">({codHeaderBreakdown})</span>}
                  </button>
                  <button onClick={() => openDetails('port_paye')}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                    <span className="text-lg shrink-0">✅</span>
                    <span className="text-xs text-gray-600 whitespace-nowrap">Total Port payé :</span>
                    <span className="text-sm font-black text-blue-700">{totalPortPaye.toLocaleString('fr-MA')} DH</span>
                  </button>
                  <button onClick={() => openDetails('port_du')}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                    <span className="text-lg shrink-0">📮</span>
                    <span className="text-xs text-gray-600 whitespace-nowrap">Total Port dû :</span>
                    <span className="text-sm font-black text-orange-700">{totalPortDu.toLocaleString('fr-MA')} DH</span>
                  </button>
                  <button onClick={() => openDetails('en_compte_exp')}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                    <span className="text-lg shrink-0">💼</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">Port en compte Exp. :</span>
                    <span className="text-sm font-bold text-gray-600">{totalPortEnCompteExp.toLocaleString('fr-MA')} DH</span>
                  </button>
                  <button onClick={() => openDetails('en_compte_dest')}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer shrink-0" title="Voir et imprimer le détail">
                    <span className="text-lg shrink-0">🎯</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">Port en compte Dest. :</span>
                    <span className="text-sm font-bold text-gray-600">{totalPortEnCompteDest.toLocaleString('fr-MA')} DH</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2" key={`parcels-${forceUpdateCounter}`}>
            {(() => {
              let checkboxIndex = 0 // Compteur pour les checkboxes disponibles
              return mergedPagedParcels.map((parcel: any, idx: number) => {
                // ⚡ Les données sont déjà fusionnées dans mergedPagedParcels

                const isOwn = canActAsParcelOwner(parcel)
                const isAideManagedByChef = !isParcelCreator(parcel) && isChefAgencyAideParcel(parcel)
                const sc    = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                const canLoadTransport = canLoadTransportParcel(parcel)
                const bulkSelected = bulkLoadSelectedSet.has(parcel.id)
                const canSelectAideValidation = (profile?.role === 'chef_agence' || profile?.role === 'agentpro') && isPendingAideParcelForAgency(parcel)
                const aideValidationSelected = selectedAideEntryIds.includes(parcel.id)

                // Vérifier si cette ligne a une checkbox assignation
                const hasAssignCheckbox = (() => {
                  if (profile?.role !== 'chef_agence' && profile?.role !== 'agentpro') return false
                  const isInMyCity = (parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city)
                  const canAssign = !parcel.deliveredAt && !parcel.returnedAt && parcel.status !== 'Livré'
                  return isInMyCity && canAssign
                })()

                const currentCheckboxIndex = hasAssignCheckbox ? checkboxIndex++ : -1

                return (
                  <div key={parcel.id}
                    onClick={handleParcelRowClick}
                    tabIndex={-1}
                    className={`bg-white rounded-xl p-2 sm:p-4 shadow-sm border-l-4 cursor-pointer ${isOwn ? 'border-l-blue-500 border border-blue-100' : 'border-l-orange-400 border border-orange-100'}`}
                  >
                  {/* NOUVELLE POLITIQUE : Plus de sélection validation nécessaire */}
                  {canLoadTransport && (
                    <label
                      onClick={e => e.stopPropagation()}
                      className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                        bulkSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={bulkSelected}
                        onChange={e => {
                          e.stopPropagation()
                          setBulkLoadError('')
                          setBulkLoadSelectedIds((prev: any) => e.target.checked
                            ? [...new Set([...prev, parcel.id])]
                            : prev.filter((id: any) => id !== parcel.id)
                          )
                        }}
                        tabIndex={-1}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-xs font-bold">Sélection chargement camion</span>
                    </label>
                  )}

                  {/* ⭐ NOUVEAU: Checkbox personnalisé pour assignation livreur */}
                  {hasAssignCheckbox && (() => {
                    const assignSelected = bulkAssignSelectedSet.has(parcel.id)
                    const isFocused = focusedIndex === currentCheckboxIndex
                    return (
                      <div
                        ref={el => checkboxRefs.current[currentCheckboxIndex] = el}
                        role="checkbox"
                        aria-checked={assignSelected}
                        tabIndex={0}
                        className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                          isFocused ? 'ring-2 ring-blue-500 shadow-md' : ''
                        } ${assignSelected ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-200'}`}
                        onClick={() => {
                          setBulkAssignError('')
                          setBulkAssignSelectedIds((prev: any) => assignSelected
                            ? prev.filter((id: any) => id !== parcel.id)
                            : [...new Set([...prev, parcel.id])]
                          )
                        }}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault()
                            setBulkAssignError('')
                            setBulkAssignSelectedIds((prev: any) => assignSelected
                              ? prev.filter((id: any) => id !== parcel.id)
                              : [...new Set([...prev, parcel.id])]
                            )
                          }
                        }}
                      >
                        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                          assignSelected ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
                        }`}>
                          {assignSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                        <span className="text-xs font-bold">Sélection assignation livreur</span>
                      </div>
                    )
                  })()}

                  {/* ⭐ NOUVEAU: Checkbox pour transformation Port Dû → Compte Destinataire */}
                  {(() => {
                    if (profile?.role !== 'chef_agence' && profile?.role !== 'agentpro') return null
                    const isDestinationAgency = parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city
                    const isPortDu = parcel.portType === 'port_du'
                    const notDelivered = !parcel.deliveredAt && parcel.status !== 'Livré'

                    if (!isPortDu || !isDestinationAgency || !notDelivered) return null

                    const portDuSelected = bulkPortDuSelectedSet.has(parcel.id)
                    return (
                      <label
                        onClick={e => e.stopPropagation()}
                        className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                          portDuSelected ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-teal-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={portDuSelected}
                          onChange={e => {
                            e.stopPropagation()
                            setBulkPortDuError('')
                            setBulkPortDuSelectedIds((prev: string[]) => e.target.checked
                              ? [...new Set([...prev, parcel.id])]
                              : prev.filter((id: string) => id !== parcel.id)
                            )
                          }}
                          tabIndex={-1}
                          className="w-4 h-4 accent-teal-600"
                        />
                        <span className="text-xs font-bold flex items-center gap-1">
                          🖐️ Transformer en Compte Destinataire
                        </span>
                      </label>
                    )
                  })()}

                  <div className="space-y-2">
                    {/* Ligne 1: Agent + N EXP */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`inline-flex items-center gap-1 text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium ${isOwn ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                        <User className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-[120px] sm:max-w-none">
                          {isAideManagedByChef
                            ? `${parcel.agentRole === 'client_portal' ? 'Portail' : 'Aide'} (${parcel.agentName || 'agence'})`
                            : isOwn ? `Moi (${profile?.name || 'vous'})` : (parcel.agentName || 'Autre')}
                        </span>
                        {!isOwn && <Lock className="w-2.5 h-2.5 opacity-60 shrink-0" />}
                      </div>
                      {parcel.sender?.nic && (
                        <span className="font-mono text-xs sm:text-sm font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 shrink-0">
                          N EXP {parcel.sender.nic}
                        </span>
                      )}
                      {profile?.role === 'aide_agent' && isAideParcelLockedForEdit(parcel) && (
                        <div className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 border border-red-200 shrink-0">
                          <Lock className="w-2.5 h-2.5" />
                          Verrouillé
                        </div>
                      )}
                    </div>

                    {/* Ligne 2: Tracking ID */}
                    <div>
                      <span className="font-mono text-sm sm:text-base font-bold text-gray-800">{parcel.trackingId}</span>
                    </div>

                    {/* Ligne 3: Badges statut */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {(() => {
                        const isOriginAgency = parcel.originCity === profile?.city || parcel.sender?.city === profile?.city
                        const isDestinationAgency = parcel.destinationCity === profile?.city || parcel.receiver?.city === profile?.city

                        if (parcel.portType === 'port_en_compte_destinataire' && isDestinationAgency) {
                          return (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-bold border border-teal-300 shrink-0">
                              🖐️ Compte Dest
                            </span>
                          )
                        }

                        if ((parcel.portType === 'port_en_compte' || parcel.portType === 'port_en_compte_expediteur') && isOriginAgency) {
                          return (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold border border-purple-300 shrink-0">
                              💼 Compte Exp
                            </span>
                          )
                        }
                        return null
                      })()}
                      {isInReturnCircuit(parcel) && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-300 shrink-0">
                          🔄 RETOURNÉ
                        </span>
                      )}
                      {parcel.hasRetourBL && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 border border-blue-300 shrink-0">
                          🧾 Retour BL
                        </span>
                      )}
                      {(() => {
                        // Ne pas afficher de badge pour les services "simple"
                        if (parcel.serviceType === 'simple' || !parcel.serviceType) return null

                        // Type réel (serviceType fait foi, codPaymentType seulement s'il est cohérent)
                        const realType = codPaymentTypeOf(parcel)
                        const badgeKey = realType === 'bon_livraison' ? 'retour_bl' : (realType || parcel.serviceType)
                        const stDef = ALL_SERVICE_TYPES.find(t => t.key === badgeKey) || ALL_SERVICE_TYPES.find(t => t.key === parcel.serviceType)
                        if (!stDef) return null

                        const colors: Record<string, string> = {
                          especes:   'bg-green-100 text-green-700',
                          cheque:    'bg-blue-100 text-blue-700',
                          traite:    'bg-indigo-100 text-indigo-700',
                          retour_bl: 'bg-amber-100 text-amber-700',
                        }
                        return (
                          <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${colors[stDef.key] || 'bg-gray-100 text-gray-600'} shrink-0`}>
                            {isMixedCod(parcel) ? codServiceLabel(parcel) :<>{stDef.emoji} {stDef.label}</>}
                          </span>
                        )
                      })()}
                      {parcel.portType === 'port_paye' && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 border border-blue-300 shrink-0">
                          ✅ Port payé
                        </span>
                      )}
                      {parcel.portType === 'port_du' && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-300 shrink-0">
                          📮 Port dû
                        </span>
                      )}
                      {parcel.returnedAt && parcel.status === 'Livré' && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 shrink-0">
                          ↩️ Retourné à exp.
                        </span>
                      )}
                    </div>

                    {/* Ligne 4: Villes + Infos essentielles */}
                    <div className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1 font-bold text-gray-700 flex-wrap">
                        <span>{parcel.sender?.city || '—'}</span>
                        <span className="text-gray-400">→</span>
                        <span>{parcel.receiver?.city || '—'}</span>
                        <span className="text-gray-400">•</span>
                        <span>{parcel.weight || 0} kg</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-green-700">{parcel.price || 0} DH</span>
                        {parcel.codAmount > 0 && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="text-orange-600 font-bold">RF {parcel.codAmount} DH{isMixedCod(parcel) && <span className="font-semibold text-orange-500"> ({codPartsBreakdown(parcel)})</span>}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                ensureFullParcel(parcel).then((parcel: any) => setCodEditModal({ parcel, ...codEditInitial(parcel), loading: false, error: '' }))
                              }}
                              className="p-0.5 rounded hover:bg-orange-50 text-gray-400 hover:text-orange-500 transition shrink-0"
                              title={`Modifier COD (role: ${profile?.role})`}
                            >
                              ✏️
                            </button>
                          </>
                        )}
                      </div>
                      {/* 🔄 HISTORIQUE MONTANT COD */}
                      {parcel.codAmountHistory && parcel.codAmountHistory.length > 0 && (
                        <div className="text-[10px] text-gray-500 space-y-0.5 mt-1 border-t border-gray-100 pt-1">
                          {parcel.codAmountHistory.slice(-3).map((h: any, i: number) => {
                            const date = new Date(h.changedAt)
                            const dateStr = date.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            const timeStr = date.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
                            const userName = h.changedBy?.split('@')[0] || 'Admin'
                            return (
                              <div key={i} className="flex items-center gap-1">
                                <span className="text-gray-400">{dateStr} {timeStr}</span>
                                <span className="text-gray-600 font-medium">{userName}:</span>
                                <span className="text-red-500">{h.oldAmount} DH</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600">{h.newAmount} DH</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Ligne 5: Destinataire */}
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="truncate">{parcel.receiver?.name || '—'}</span>
                      {parcel.portType === 'port_en_compte_destinataire' && (
                        <span className="text-sm shrink-0">🖐️</span>
                      )}
                    </div>
                    {/* Ligne 6: Nature/Colis */}
                    {(parcel.natureOfGoods || (parcel.arrivedNbColis ?? parcel.nbColis) > 1) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {parcel.natureOfGoods && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                            📦 {parcel.natureOfGoods}
                          </span>
                        )}
                        {(parcel.arrivedNbColis ?? parcel.nbColis) > 1 && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                            × {parcel.arrivedNbColis ?? parcel.nbColis} colis
                            {parcel.arrivedNbColis != null && parcel.arrivedNbColis < parcel.nbColis && (
                              <span className="text-orange-500 font-bold">/{parcel.nbColis}</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Ligne 7: Téléphones */}
                    {(parcel.sender?.tel || parcel.receiver?.tel) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {parcel.sender?.tel && <span className="shrink-0">📤 {parcel.sender.tel}</span>}
                        {parcel.receiver?.tel && <span className="shrink-0">📥 {parcel.receiver.tel}</span>}
                      </div>
                    )}
                    {/* Ligne 8: Adresses */}
                    {(parcel.sender?.address || parcel.receiver?.address || parcel.enGare) && (
                      <div className="space-y-1 text-xs text-gray-500">
                        {parcel.sender?.address && (
                          <div className="flex items-start gap-1">
                            <span className="shrink-0">📤</span>
                            <span className="line-clamp-1">{parcel.sender.address}</span>
                          </div>
                        )}
                        {parcel.enGare ? (
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded px-2 py-1">
                            <span className="text-base shrink-0">🚉</span>
                            <span className="font-bold text-orange-700">Livraison en gare</span>
                          </div>
                        ) : parcel.receiver?.address && (
                          <div className="flex items-start gap-1">
                            <span className="shrink-0">📥</span>
                            <span className="line-clamp-1">{parcel.receiver.address}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Infos retour */}
                    {parcel.returnedAt && (
                      <div className="bg-orange-50 border border-orange-200 rounded px-2 py-1.5 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-orange-700">↩️ Retour</span>
                          <span className="text-[10px] text-orange-500">{new Date(parcel.returnedAt).toLocaleDateString('fr-MA')}</span>
                        </div>
                        {parcel.returnReason && (
                          <p className="text-[10px] text-orange-600 line-clamp-1">{parcel.returnReason}</p>
                        )}
                      </div>
                    )}

                    {/* Transport */}
                    {(parcel.chauffeurName || parcel.deliveryDriverName || parcel.deliverySectorCode || parcel.deliveryVehicleLabel) && (
                      <div className="flex flex-wrap gap-1.5">
                        {parcel.chauffeurName && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full border border-indigo-200">
                            <Truck className="w-2.5 h-2.5 shrink-0" /> {parcel.chauffeurName}
                          </span>
                        )}
                        {parcel.deliveryDriverName && (
                          <>
                            <span className="inline-flex items-center gap-0.5 text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-200">
                              <User className="w-2.5 h-2.5 shrink-0" /> {parcel.deliveryDriverName}
                            </span>
                            {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
                              <button
                                onClick={() => setChangeDriverModal({ open: true, parcel, newDriverId: '', loading: false, error: '' })}
                                className="p-0.5 hover:bg-orange-100 rounded-full transition"
                                title="Changer le livreur"
                              >
                                <Hand className="w-3 h-3 text-orange-600" />
                              </button>
                            )}
                          </>
                        )}
                        {parcel.deliverySectorCode && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full border border-purple-200 shrink-0">
                            <LayoutGrid className="w-2.5 h-2.5" /> Secteur {parcel.deliverySectorCode}
                          </span>
                        )}
                        {parcel.deliveryVehicleLabel && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded-full border border-slate-200">
                            <Car className="w-2.5 h-2.5 shrink-0" /> {parcel.deliveryVehicleLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      {parcel.codAmount > 0 && (() => {
                        const cs  = parcel.codSenderPaid
                          ? { label: 'Réglé ✓', bg: 'bg-green-100', text: 'text-green-700' }
                          : parcel.codReceivedBySource && !parcel.codSenderPaid
                          ? { label: 'Reçu — à régler', bg: 'bg-purple-100', text: 'text-purple-700' }
                          : parcel.codSentToSource && !parcel.codReceivedBySource
                          ? { label: 'En transit source', bg: 'bg-blue-100', text: 'text-blue-700' }
                          : COD_STATUS[parcel.codStatus || 'pending']
                        const cpt = COD_PAYMENT_TYPES.find(t => t.key === codPaymentTypeOf(parcel))
                        const st  = ALL_SERVICE_TYPES.find(t => t.key === parcel.serviceType)
                        const emoji = cpt?.emoji || st?.emoji || '💵'
                        // Ne pas afficher "Livré" si c'est un retour
                        const isReturn = parcel.wasReturned || parcel.status?.includes('Retourné')
                        const isCollected = parcel.codStatus === 'collected' && !isReturn
                        const dispBg  = isCollected && cpt ? cpt.bg   : cs.bg
                        const dispTxt = isCollected && cpt ? cpt.text : cs.text
                        const lbl = isCollected
                          ? (isMixedCod(parcel) ? `Collecté (${codPartsLabel(parcel, { emoji: false })})` : codCollectedLabel(codPaymentTypeOf(parcel)))
                          : cs.label
                        return (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${dispBg} ${dispTxt} border border-current/20`}>
                            {isMixedCod(parcel) ? '💵+' : ''}{emoji} RETOUR FOND {parcel.codAmount} DH{isMixedCod(parcel) ? ` (${codPartsBreakdown(parcel)})` : ''} — {lbl}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 flex-wrap shrink-0">
                      <button
                        onClick={() => handlePrintTicket(parcel)}
                        tabIndex={-1}
                        className="flex items-center gap-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-500 px-2.5 py-1.5 rounded-lg transition shrink-0"
                        title="Imprimer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Imprimer</span>
                      </button>
                      {parcel.signatureConfirmedAt && (
                        <button
                          onClick={() => setViewSignature(parcel)}
                          tabIndex={-1}
                          className="flex items-center gap-1 text-xs bg-violet-50 hover:bg-violet-100 text-violet-600 px-2.5 py-1.5 rounded-lg transition shrink-0"
                          title="Signature"
                        >
                          ✍️
                          <span className="hidden xs:inline">Signature</span>
                        </button>
                      )}
                      {/* Bouton Modifier - Toujours affiché pour chef d'agence, agentpro et aide agent */}
                      {(canEditParcelDetails(parcel) || profile?.role === 'chef_agence' || profile?.role === 'agentpro' || profile?.role === 'aide_agent') && (
                        <button
                          onClick={() => handleEditClick(parcel)}
                          tabIndex={-1}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition bg-blue-50 hover:bg-blue-100 text-blue-600 shrink-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="hidden xs:inline">Modifier</span>
                        </button>
                      )}
                      {/* Bouton Supprimer - Seulement si peut vraiment éditer */}
                      {canEditParcelDetails(parcel) && (
                        <button
                          onClick={() => handleDeleteClick(parcel)}
                          tabIndex={-1}
                          className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-2.5 py-2 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Badge Lecture seule - Seulement si ne peut vraiment pas modifier */}
                      {!canEditParcelDetails(parcel) && profile?.role !== 'chef_agence' && profile?.role !== 'agentpro' && profile?.role !== 'aide_agent' && (
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-500 px-2.5 py-2 rounded-lg border border-gray-100">
                          <Lock className="w-3.5 h-3.5" />
                          Lecture seule
                        </span>
                      )}
                    </div>
                  </div>

                  {!isOwn && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Bon consultable uniquement : modification reservee au createur.
                    </div>
                  )}

                  {/* Lock indicator — origin agent can't manage status */}
                  {!canManageStatus(parcel) && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Statut géré par <span className="font-semibold ml-0.5">l'Agence de {parcel.destinationCity}</span>
                    </div>
                  )}

                  {/* Port dû — badge */}
                  {parcel.portType === 'port_du' && (
                    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                      parcel.portStatus === 'collected'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}>
                      📮 Port dû {parcel.price > 0 ? `${parcel.price} DH` : ''}
                      {parcel.portStatus === 'collected'
                        ? ' — Encaissé ✓'
                        : ' — À encaisser'}
                    </div>
                  )}

                  {/* En compte — badge */}
                  {parcel.portType === 'port_en_compte_destinataire' && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border bg-pink-50 text-pink-700 border-pink-200">
                      🖐️ En compte Destinataire {parcel.price > 0 ? `${parcel.price} DH` : ''}
                    </div>
                  )}
                  {(parcel.portType === 'port_en_compte' || parcel.portType === 'port_en_compte_expediteur') && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border bg-purple-50 text-purple-700 border-purple-200">
                      💼 En compte Expéditeur {parcel.price > 0 ? `${parcel.price} DH` : ''}
                    </div>
                  )}

                  {/* ⚡ Actions rapides — Toggles de statuts en temps réel */}
                  {canManageStatus(parcel) && (
                    <QuickStatusToggles
                      parcel={parcel}
                      profile={profile}
                      onSuccess={(updates) => {
                        // ⚡ Mise à jour locale immédiate pour affichage temps réel
                        setLocalParcelUpdates(prev => ({
                          ...prev,
                          [parcel.id]: { ...prev[parcel.id], ...updates }
                        }))
                        setForceUpdateCounter(c => c + 1)
                      }}
                    />
                  )}

                  {/* RETOUR FOND collect — destination agent collects RETOUR FOND when client picks up at agency */}
                  {canLoadTransport && (
                    <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-blue-700">Colis au depot source</p>
                        <p className="text-xs text-blue-500 mt-0.5">Choisir un chauffeur pour charger vers {parcel.destinationCity || parcel.receiver?.city}</p>
                      </div>
                      {/* ⭐ Bouton change selon si un chauffeur est déjà assigné */}
                      {(() => {
                        const hasDriver = !!(parcel.chauffeurName || parcel.driverAssigned)
                        return (
                          <button
                            onClick={() => setTransportModal({ open: true, parcel, driverId: '', loading: false, error: '' })}
                            className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold transition ${
                              hasDriver
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            <Truck className="w-3.5 h-3.5" /> {hasDriver ? 'Changer camion' : 'Charger camion'}
                          </button>
                        )
                      })()}
                    </div>
                  )}

                  {/* RETOUR FOND collecté par le livreur — validation directe par le chef */}
                  {parcel.codAmount > 0 && parcel.codStatus === 'collected' && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Banknote className="w-3 h-3 shrink-0" />
                      💰 RETOUR FOND collecté par {parcel.codCollectedBy || 'le livreur'} — en attente du chef d'agence
                    </div>
                  )}

                  {/* Validation saisie aide_agent / portail client — pour le chef et agentpro */}
                  {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && ['aide_agent', 'client_portal'].includes(parcel.agentRole) && parcel.validatedByChef === false && ((parcel.originCity || parcel.sender?.city || '') === profile?.city || aideAgents.some((a: any) => a.id === (parcel.aideAgentId || parcel.agentId) && a.city === profile?.city)) && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{parcel.agentRole === 'client_portal' ? '👤' : '✏️'}</span>
                          <div>
                            <p className="text-xs font-bold text-amber-800">{parcel.agentRole === 'client_portal' ? 'Demande portail client' : 'Saisie aide agent'} — à valider</p>
                            <p className="text-[11px] text-amber-600">Saisi par : {parcel.agentName}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleValidateParcelEntry(parcel)}
                          disabled={validatingEntryId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg transition"
                        >
                          {validatingEntryId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Validation...</>
                            : <>✅ Valider la saisie</>
                          }
                        </button>
                      </div>
                    </div>
                  )}
                  {parcel.validatedByChef === true && ['aide_agent', 'client_portal'].includes(parcel.agentRole) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                        ✅ Validé par {parcel.validatedByName}
                      </span>
                      {isChefAgencyAideParcel(parcel) && (
                        <button
                          onClick={() => handleToggleAideParcelAccess(parcel)}
                          disabled={togglingAideAccessId === parcel.id}
                          className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold border transition disabled:opacity-60 ${
                            parcel.aideEditUnlocked === true
                              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {togglingAideAccessId === parcel.id ? (
                            <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          ) : parcel.aideEditUnlocked === true ? (
                            <Unlock className="w-3 h-3" />
                          ) : (
                            <Lock className="w-3 h-3" />
                          )}
                          {parcel.aideEditUnlocked === true ? 'Accès aide ouvert' : 'Accès aide verrouillé'}
                        </button>
                      )}
                    </div>
                  )}
                  {profile?.role === 'aide_agent' && parcel.agentRole === 'aide_agent' && parcel.validatedByChef === false && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                        ⏳ En attente de validation
                      </span>
                    </div>
                  )}
                  {profile?.role === 'aide_agent' && parcel.agentRole === 'aide_agent' && parcel.validatedByChef === true && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        parcel.aideEditUnlocked === true
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {parcel.aideEditUnlocked === true ? 'Accès réouvert par le chef' : 'Verrouillé après validation'}
                      </span>
                    </div>
                  )}

                  {/* Retour direct — UNIQUEMENT pour l'agence de DESTINATION sur colis Livré */}
                  {(() => {
                    const isInDestinationAgency = profile?.city && (
                      profile.city === parcel.destinationCity ||
                      profile.city === parcel.receiver?.city
                    )
                    const canReturn = isInDestinationAgency && parcel.status === 'Livré'

                    return canReturn ? (
                      <div className="mt-3 pt-3 border-t border-red-100">
                        <button
                          onClick={() => handleReturnDirect(parcel)}
                          disabled={returningParcelId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-semibold py-2.5 rounded-xl border border-red-200 transition"
                        >
                          {returningParcelId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> Retour en cours...</>
                            : <>↩️ Retourner ce colis</>
                          }
                        </button>
                      </div>
                    ) : null
                  })()}

                  {/* Bandeau retour en transit — agence physique du colis (doit l'expédier vers l'expéditeur) */}
                  {parcel.status === 'Retourné' && isReturnOriginCity(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">🚚</span>
                          <div>
                            <p className="text-xs font-bold text-orange-800">Colis retourné — à expédier</p>
                            <p className="text-[11px] text-orange-700 mt-0.5 leading-snug">
                              Charger ce colis sur le camion inter-villes vers <span className="font-bold">{parcel.returnToCity || parcel.originCity}</span> puis confirmer ci-dessous.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Réessayer la livraison de ce colis ?\n${parcel.trackingId}\n\nLe colis sera remis en circulation pour une nouvelle tentative de livraison.`)) return
                              setLoadingTruckId(parcel.id)
                              try {
                                await updateParcel(parcel.id, {
                                  status: 'En livraison',
                                  wasReturned: deleteField(),
                                  returnedAt: deleteField(),
                                  returnReason: deleteField(),
                                  returnToCity: deleteField(),
                                  loadedOnTruckAt: deleteField(),
                                  loadedOnTruckBy: deleteField(),
                                  returnLoadedAt: deleteField(),
                                  returnLoadedBy: deleteField(),
                                  retryDeliveryAt: new Date(),
                                  retryDeliveryBy: profile?.name || profile?.email || 'Inconnu'
                                } as any)
                                alert('✅ Colis remis en livraison !\n\nRafraîchissez la page pour voir les changements.')
                              }
                              catch (e: any) {
                                console.error('❌ Erreur réessai:', e)
                                alert('Erreur : ' + (e?.message || e))
                              }
                              finally { setLoadingTruckId(null) }
                            }}
                            disabled={loadingTruckId === parcel.id}
                            className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                          >
                            {loadingTruckId === parcel.id
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                              : <>🔄 Réessayer</>
                            }
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Confirmer le chargement de ce colis sur le camion vers ${parcel.returnToCity || parcel.originCity} ?\n${parcel.trackingId}`)) return
                              setLoadingTruckId(parcel.id)
                              try { await loadReturnedParcelOnTruck(parcel) }
                              catch (e: any) { alert('Erreur : ' + (e?.message || e)) }
                              finally { setLoadingTruckId(null) }
                            }}
                            disabled={loadingTruckId === parcel.id}
                            className="flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                          >
                            {loadingTruckId === parcel.id
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                              : <>🚚 Retour agence</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Colis déjà en transit retour — info pour la ville physique (expéditeur) */}
                  {parcel.status === 'Retour en transit' && isReturnOriginCity(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <span className="text-base shrink-0">🚛</span>
                        <div>
                          <p className="text-xs font-bold text-orange-800">Expédié vers l'agence d'origine</p>
                          <p className="text-[11px] text-orange-700 mt-0.5">En route vers <span className="font-bold">{parcel.returnToCity || parcel.destinationCity}</span> — en attente de l'arrivage.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Retour en attente de chargement — agence physique (destinataire original) */}
                  {parcel.status === 'Retourné' && canManageReturnDelivery(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <span className="text-base shrink-0">⏳</span>
                        <div>
                          <p className="text-xs font-bold text-orange-800">En attente du chargement retour</p>
                          <p className="text-[11px] text-orange-700 mt-0.5 leading-snug">Ce colis doit être chargé sur un camion inter-villes par l'agence de destination.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Retour en transit — bouton de validation à l'agence d'origine */}
                  {parcel.status === 'Retour en transit' && canManageReturnDelivery(parcel) && (
                    <div className="mt-3 pt-3 border-t border-green-100">
                      <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">🚚</span>
                          <div>
                            <p className="text-xs font-bold text-green-800">Colis en route vers vous</p>
                            <p className="text-[11px] text-green-700 mt-0.5 leading-snug">
                              Le colis est sur le camion. Validez son arrivée pour déclencher la livraison à l'expéditeur.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Confirmer l'arrivée du colis retourné ?\n${parcel.trackingId}\nIl passera en "Arrivé en agence" et sera prêt pour livraison à l'expéditeur.`)) return
                            setValidatingReturnId(parcel.id)
                            try { await validateReturnArrival(parcel) }
                            catch (e: any) { alert('Erreur : ' + (e?.message || e)) }
                            finally { setValidatingReturnId(null) }
                          }}
                          disabled={validatingReturnId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                        >
                          {validatingReturnId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Validation...</>
                            : <>✅ Valider l'arrivée du retour</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delivery assignment — for claimed parcels awaiting dispatch */}
                  {(() => {
                    const canManage = parcel.destinationAgentId === uid || canManageDeliveryAssignment(parcel)
                    const notDelivered = parcel.status !== 'Livré'
                    const notReturnAtOrigin = !(parcel.status === 'Retourné' && isReturnOriginCity(parcel))
                    const isPointed = isPointedForDelivery(parcel)

                    return canManage && notDelivered && notReturnAtOrigin ? (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      {!isPointed ? (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <p className="text-xs text-amber-700 font-medium">Validez d'abord ce colis dans Arrivages.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" /> {parcel.deliveryDriverId ? 'Modifier la livraison :' : 'Choisir le mode de livraison :'}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => ensureFullParcel(parcel).then((parcel: any) => setDeliveryModal({
                                open: true,
                                parcel,
                                sectorId: parcel.deliverySectorId || '',
                                driverId: parcel.deliveryDriverId || '',
                                vehicleId: parcel.deliveryVehicleId || '',
                                loading: false,
                                error: '',
                              }))}
                              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                            >
                              <Truck className="w-3.5 h-3.5" /> {parcel.deliveryDriverId ? 'Changer livreur' : 'Livreur local'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null
                  })()}
                </div>
              )
              })
            })()}
            </div>

            {/* Barre de pagination */}
            {totalPages > 1 && (() => {
              const goTo = (p: number) => { setParcelPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
              // Calcule les numéros à afficher : toujours 1, last, et les 2 autour de safePage
              const pages: number[] = []
              for (let i = 0; i < totalPages; i++) {
                if (i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1) pages.push(i)
              }
              // Insère '…' entre numéros non-consécutifs
              const items: (number | string)[] = []
              pages.forEach((p, idx) => {
                if (idx > 0 && p - pages[idx - 1] > 1) items.push('…')
                items.push(p)
              })
              return (
                <div className="pt-4 mt-2 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {parcelMovementCount}{hasMoreParcels ? '+' : ''} expédition{parcelMovementCount > 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">Page {safePage + 1} / {totalPages}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <button onClick={() => goTo(Math.max(0, safePage - 1))} disabled={safePage === 0}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                    ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>

                    {items.map((item, idx) =>
                      item === '…'
                        ? <span key={`dots-${idx}`} className="px-1 text-gray-400 text-sm select-none">…</span>
                        : <button key={item} onClick={() => goTo(Number(item))}
                            className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition border ${
                              item === safePage
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                            }`}
                          >{Number(item) + 1}</button>
                    )}

                    <button onClick={() => goTo(Math.min(totalPages - 1, safePage + 1))} disabled={isLastPage}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                    ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
              )
            })()}

            {/* Sélecteur de période rapide — chips cliquables */}
            {(() => {
              const now = new Date()
              const toISO = (d: Date) => d.toISOString().slice(0, 10)
              const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0,0,0,0)
              const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
              const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
              const months = Array.from({ length: 6 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
                const y = d.getFullYear(), m = d.getMonth()
                const lastDay = new Date(y, m + 1, 0).getDate()
                return {
                  label: `${MONTH_NAMES[m]} ${y}`,
                  from: `${y}-${String(m+1).padStart(2,'0')}-01`,
                  to:   `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
                  current: i === 5,
                }
              })
              const isActive = (f: any, t: any) => {
                const todayISO = toISO(now)
                if (f === todayISO && t === todayISO) return datePreset === 'today'
                return datePreset === 'custom' && dateFrom === f && dateTo === t
              }
              const apply    = (f: any, t: any) => {
                const todayISO = toISO(now)
                // Si c'est aujourd'hui, utiliser le preset 'today'
                if (f === todayISO && t === todayISO) {
                  setDatePreset('today')
                  setDateFrom('')
                  setDateTo('')
                } else {
                  setDatePreset('custom')
                  setDateFrom(f)
                  setDateTo(t)
                }
              }
              const clear    = ()     => { setDatePreset('all'); setDateFrom(''); setDateTo('') }
              const anyActive = datePreset === 'custom' && (dateFrom || dateTo)
              const chipCls = (active: boolean) => active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              return (
                <div className="mt-4 border border-gray-100 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Période
                    </span>
                    {anyActive && (
                      <button onClick={clear} className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition">
                        ✕ Tout afficher
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-2 bg-white">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: "Aujourd'hui", from: toISO(now),       to: toISO(now) },
                        { label: 'Cette semaine', from: toISO(weekStart), to: toISO(weekEnd) },
                      ].map(({ label, from, to }) => (
                        <button key={label} onClick={() => isActive(from, to) ? clear() : apply(from, to)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${chipCls(isActive(from, to))}`}
                        >{label}</button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {months.map(({ label, from, to, current }) => (
                        <button key={from} onClick={() => isActive(from, to) ? clear() : apply(from, to)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                            isActive(from, to)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : current
                              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-500'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    {anyActive && (
                      <p className="text-[10px] text-blue-500 font-medium pt-0.5">
                        {parcelMovementCount} expédition{parcelMovementCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Charger depuis l'historique Firestore (au-delà des 60 jours / 200 docs) */}
            {isLastPage && hasMoreParcels && (
              <button
                onClick={async () => {
                  if (loadingMore) return
                  setLoadingMore(true)
                  try {
                    const oldest = [...allDisplayParcels].sort((a, b) => {
                      const ta = a.createdAt?.toDate?.() || new Date(0)
                      const tb = b.createdAt?.toDate?.() || new Date(0)
                      return ta - tb
                    })[0]?.createdAt
                    if (!oldest || !uid) return
                    const { parcels: more, hasMore } = await getMoreAgentParcels(uid, oldest)
                    setExtraParcels((prev: any) => {
                      const map = new Map()
                      prev.forEach((p: any) => map.set(p.id, p))
                      more.forEach(p => map.set(p.id, p))
                      return [...map.values()]
                    })
                    setHasMoreParcels(hasMore)
                    setParcelPage(totalPages)
                  } catch (e: any) {
                    console.error('loadMore:', e)
                  } finally {
                    setLoadingMore(false)
                  }
                }}
                disabled={loadingMore}
                className="w-full mt-2 py-3 rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loadingMore
                  ? <><span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  : "↓ Charger l'historique plus ancien"}
              </button>
            )}
          </div>
          )
        })()
        )}
      </div>

      {/* ── MODAL MODIFICATION ── */}
      {editingParcel && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-800">Modifier l'expédition</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{editingParcel.trackingId}</p>
                {editingParcel.status && (() => {
                  const sc = STATUS_COLORS[editingParcel.status] || STATUS_COLORS['Initialisé']
                  return (
                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${sc.bg} ${sc.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {editingParcel.status}
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setEditingParcel(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div
              className="p-5 space-y-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const target = e.target as HTMLElement
                  const modal = target.closest('.overflow-y-auto')
                  if (!modal) return

                  const focusables = Array.from(
                    modal.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type="submit"], button:not([disabled])')
                  ).filter((el: any) => el.offsetParent !== null) as HTMLElement[]

                  const currentIndex = focusables.indexOf(target)
                  if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
                    focusables[currentIndex + 1].focus()
                  } else if (currentIndex === focusables.length - 1) {
                    // Dernier champ : sauvegarder
                    handleEditSave()
                  }
                }
              }}
            >
              {editError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {editError}</div>}
              {editingParcel.shipmentLoadedAt && profile?.role !== 'admin' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm flex items-start gap-2">
                  <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Colis déjà chargé dans un camion : les données du bon sont verrouillées (seul l'administrateur peut les modifier).</span>
                </div>
              )}

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Expéditeur</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      placeholder="Nom"
                      value={editForm.senderName}
                      onChange={ef('senderName')}
                      disabled={!canEditField('sender.name')}
                      className={`${inputCls} ${!canEditField('sender.name') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('sender.name') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="relative">
                    <input
                      placeholder="N EXP"
                      value={editForm.senderNic || ''}
                      onChange={ef('senderNic')}
                      disabled={!canEditField('sender.nic')}
                      className={`${inputCls} ${!canEditField('sender.nic') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('sender.nic') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="relative">
                    <input
                      placeholder="Téléphone"
                      value={editForm.senderTel}
                      onChange={ef('senderTel')}
                      disabled={!canEditField('sender.tel')}
                      className={`${inputCls} ${!canEditField('sender.tel') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('sender.tel') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="relative">
                    <select
                      value={editForm.senderCity}
                      onChange={ef('senderCity')}
                      disabled={!canEditField('sender.city')}
                      className={`${selectCls} ${!canEditField('sender.city') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    >
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    {canEditField('sender.city') ? (
                      <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    ) : (
                      <Lock className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="relative col-span-2">
                    <input
                      placeholder="Adresse"
                      value={editForm.senderAddress || ''}
                      onChange={ef('senderAddress')}
                      disabled={!canEditField('sender.address')}
                      className={`${inputCls} ${!canEditField('sender.address') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('sender.address') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Destinataire</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      placeholder="Nom"
                      value={editForm.receiverName}
                      onChange={ef('receiverName')}
                      disabled={!canEditField('receiver.name')}
                      className={`${inputCls} ${!canEditField('receiver.name') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('receiver.name') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="relative">
                    <input
                      placeholder="Téléphone"
                      value={editForm.receiverTel}
                      onChange={ef('receiverTel')}
                      disabled={!canEditField('receiver.tel')}
                      className={`${inputCls} ${!canEditField('receiver.tel') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('receiver.tel') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="col-span-2 relative">
                    <select
                      value={editForm.receiverCity}
                      onChange={ef('receiverCity')}
                      disabled={!canEditField('receiver.city')}
                      className={`${selectCls} ${!canEditField('receiver.city') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    >
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    {canEditField('receiver.city') ? (
                      <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    ) : (
                      <Lock className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="relative col-span-2">
                    <input
                      placeholder="Adresse"
                      value={editForm.receiverAddress || ''}
                      onChange={ef('receiverAddress')}
                      disabled={!canEditField('receiver.address')}
                      className={`${inputCls} ${!canEditField('receiver.address') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('receiver.address') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Détails</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      placeholder="Poids (kg)"
                      value={editForm.weight}
                      onChange={ef('weight')}
                      disabled={!canEditField('weight')}
                      className={`${inputCls} ${!canEditField('weight') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('weight') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Nb de colis"
                      value={editForm.nbColis || 1}
                      onChange={ef('nbColis')}
                      disabled={!canEditField('nbColis')}
                      className={`${inputCls} ${!canEditField('nbColis') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                    />
                    {!canEditField('nbColis') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 mb-1.5">Nature de marchandise</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: 'Palette', label: 'Palette', emoji: '📦' },
                        { key: 'Colis',   label: 'Colis',   emoji: '📮' },
                        { key: 'Bagages', label: 'Bagages', emoji: '🧳' },
                        { key: 'Autres',  label: 'Autres',  emoji: '✏️' },
                      ].map(({ key, label, emoji }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEditForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all
                            ${editForm.natureOfGoods === key
                              ? 'bg-blue-600 border-blue-600 text-white shadow'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'}`}
                        >
                          <span className="text-lg">{emoji}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                    {editForm.natureOfGoods === 'Autres' && (
                      <input
                        placeholder="Précisez la nature…"
                        value={editForm.natureOfGoodsCustom || ''}
                        onChange={e => setEditForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
                        className={`${inputCls} mt-2`}
                      />
                    )}
                  </div>

                  {/* RETOUR FOND (COD Amount) — modifiable dès qu'un type de service avec COD est choisi (même depuis « Simple ») */}
                  {(() => {
                    const isCodType = (editForm?.serviceType && !['simple','retour_bl','oc',''].includes(editForm.serviceType))
                    const codEditable = canEditField('codAmount') || (isCodType && canEditField('serviceType'))
                    return (
                  <div className="col-span-2">
                    {(() => null)()}
                    {editForm.codMixed === true && (
                      <div className="mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">💵 Montant espèces (DH)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="Montant espèces (DH)"
                          value={editForm.codCashAmount || ''}
                          onChange={ef('codCashAmount')}
                          disabled={!codEditable}
                          className={`${inputCls} ${!codEditable ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''} font-bold text-green-700`}
                        />
                      </div>
                    )}
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5 flex items-center gap-2">
                      {editForm.codMixed === true ? (editForm.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)') : 'RETOUR FOND (COD)'}
                      {isCodType && <span className="normal-case text-green-600 font-bold">← saisissez le montant</span>}
                      {!codEditable && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Montant COD (DH)"
                        value={editForm.codAmount || ''}
                        onChange={ef('codAmount')}
                        disabled={!codEditable}
                        className={`${inputCls} ${!codEditable ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''} ${editForm.codAmount > 0 ? 'font-bold text-orange-600' : ''}`}
                      />
                      {!codEditable && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                    </div>
                    {editForm.codMixed === true && (
                      <p className="mt-1 text-xs font-bold text-gray-600">
                        Total retour de fonds : {((parseFloat(editForm.codCashAmount) || 0) + (parseFloat(editForm.codAmount) || 0)).toLocaleString('fr-MA')} DH
                      </p>
                    )}
                  </div>
                    )
                  })()}

                  {/* Type de Port */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5 flex items-center gap-2">
                      Type de port
                      {!canEditField('portType') && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'port_paye', label: 'Port Payé', emoji: '✅' },
                        { key: 'port_du', label: 'Port Dû', emoji: '📮' },
                        { key: 'port_du_cheque', label: 'Port Dû Chèque', emoji: '📋' },
                        { key: 'port_en_compte_expediteur', label: 'En compte Exp', emoji: '📤' },
                        { key: 'port_en_compte_destinataire', label: 'En compte Dest', emoji: '📥' },
                        { key: 'port_en_compte', label: 'En compte', emoji: '💼' },
                      ].map(({ key, label, emoji }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => canEditField('portType') && setEditForm((p: any) => ({ ...p, portType: key }))}
                          disabled={!canEditField('portType')}
                          className={`py-2 rounded-xl border-2 text-xs font-bold transition ${
                            editForm.portType === key
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : canEditField('portType')
                                ? 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-base">{emoji}</span>
                            <span>{label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fragile */}
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => canEditField('fragile') && setEditForm((p: any) => ({ ...p, fragile: !p.fragile }))}
                      disabled={!canEditField('fragile')}
                      className={`w-full py-3 rounded-xl border-2 text-sm font-bold transition flex items-center justify-center gap-2 ${
                        editForm.fragile
                          ? 'bg-red-50 border-red-500 text-red-600'
                          : canEditField('fragile')
                            ? 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {!canEditField('fragile') && <Lock className="w-4 h-4" />}
                      <AlertTriangle className="w-4 h-4" />
                      {editForm.fragile ? 'Colis FRAGILE ⚠️' : 'Marquer comme FRAGILE'}
                    </button>
                  </div>

                  {/* Notes/Observations */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5 flex items-center gap-2">
                      Notes / Observations
                      {!canEditField('notes') && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                    </label>
                    <div className="relative">
                      <textarea
                        placeholder="Notes internes ou observations..."
                        value={editForm.notes || ''}
                        onChange={e => setEditForm((p: any) => ({ ...p, notes: e.target.value }))}
                        disabled={!canEditField('notes')}
                        rows={3}
                        className={`${inputCls} ${!canEditField('notes') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''} resize-none`}
                      />
                      {!canEditField('notes') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                      Montant du port manuel
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Prix du port (DH)"
                        value={editForm.price}
                        onChange={ef('price')}
                        disabled={!canEditField('price')}
                        className={`${inputCls} ${!canEditField('price') ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                      />
                      {!canEditField('price') && <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  Type de service
                  {!canEditField('serviceType') && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ALL_SERVICE_TYPES.map(st => (
                    <button
                      type="button"
                      key={st.key}
                      onClick={() => canEditField('serviceType') && setEditForm((p: any) => (
                        // 💵+📋 Espèces combinable avec UN chèque OU UNE traite ; les autres types sont exclusifs
                        ['especes', 'cheque', 'traite', 'simple'].includes(st.key)
                          ? toggleCodService(p, st.key)
                          : { ...p, serviceType: st.key, codMixed: false, codCashAmount: '', codAmount: st.key === 'retour_bl' ? 0 : p.codAmount }
                      ))}
                      disabled={!canEditField('serviceType')}
                      className={`py-2 rounded-xl border-2 text-xs font-bold transition ${
                        codSelectionOf({ serviceType: editForm?.serviceType || 'oc', codMixed: editForm?.codMixed }).includes(st.key)
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : canEditField('serviceType')
                            ? 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                {editingParcel?.lastModifiedByName && (editForm?.serviceType === 'simple' || editingParcel?.serviceType === 'simple') && (
                  <div className="mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs text-orange-700 font-semibold">
                      ⚠️ Modifié par : {editingParcel.lastModifiedByName}
                    </p>
                  </div>
                )}
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  Statut
                  {!canEditField('status') && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                </h4>
                {canManageStatus(editingParcel) && canEditField('status') ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUSES.map(s => {
                        const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                        const selected = editForm?.status === s
                        return (
                          <button key={s}
                            onClick={() => setEditForm((p: any) => ({ ...p, status: s }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition border ${
                              selected
                                ? `${sc.bg} ${sc.text} border-current ring-2 ring-offset-1 ring-current`
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                            {s}
                          </button>
                        )
                      })}
                    </div>
                    {editForm?.status !== editingParcel?.status && (
                      <input
                        placeholder="Note sur le changement de statut (optionnel)"
                        value={editForm?.note || ''}
                        onChange={ef('note')}
                        className={`${inputCls} mt-2 text-xs`}
                      />
                    )}
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{editForm?.status}</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Modification réservée à <span className="font-semibold">l'Agence de {editingParcel?.destinationCity}</span>
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {editError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {editError}</div>}
              <button onClick={handleEditSave} disabled={editLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {editLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
                  : <><Check className="w-4 h-4" /> Sauvegarder</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RETOUR FONDE ── */}
      {codeModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-bold text-gray-800">Code requis</h3>
              <p className="text-sm text-gray-500 mt-1">
                Entrez le code de <span className="font-semibold text-gray-700">{codeModal.parcel?.agentName || "l'agent"}</span> pour {codeModal.action === 'delete' ? 'supprimer' : 'modifier'} cette expédition
              </p>
            </div>
            {codeModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {codeModal.error}</div>
            )}
            <input
              type="text"
              placeholder="Code de l'agent"
              value={codeModal.code}
              onChange={e => setCodeModal((m: any) => ({ ...m, code: e.target.value, error: '' }))}
              onKeyDown={e => e.key === 'Enter' && handleCodeVerify()}
              className="w-full border border-gray-200 rounded-xl p-3 text-center text-lg font-mono tracking-widest focus:border-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setCodeModal({ open: false, parcel: null, action: 'edit', code: '', error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleCodeVerify}
                className="py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHARGEMENT TRANSPORT ── */}
      {transportModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Charger dans un camion</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{transportModal.parcel?.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {transportModal.parcel?.sender?.city} vers {transportModal.parcel?.destinationCity || transportModal.parcel?.receiver?.city}
                </p>
              </div>
              <button onClick={() => setTransportModal({ open: false, parcel: null, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {transportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">Attention : {transportModal.error}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nom du chauffeur *</label>
                <input
                  type="text"
                  value={transportModal.chauffeurName}
                  onChange={e => setTransportModal((m: any) => ({ ...m, chauffeurName: e.target.value, error: '' }))}
                  placeholder="Ex: Mohammed Alami"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Téléphone du chauffeur</label>
                <input
                  type="tel"
                  value={transportModal.chauffeurPhone}
                  onChange={e => setTransportModal((m: any) => ({ ...m, chauffeurPhone: e.target.value }))}
                  placeholder="Ex: 0661 23 45 67"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTransportModal({ open: false, parcel: null, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignTransport} disabled={transportModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {transportModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  : <><Truck className="w-4 h-4" /> Charger</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LIVRAISON ── */}
      {deliveryModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Assigner un livreur local</h3>
                <p className="text-xs font-mono text-purple-600 mt-0.5">{deliveryModal.parcel?.trackingId}</p>
              </div>
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {deliveryModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {deliveryModal.error}</div>
            )}
            {(() => {
              const parcel = deliveryModal.parcel

              // Détection robuste des retours (y compris anciens colis)
              const isReturn = parcel?.status?.includes('Retour')
                || parcel?.wasReturned
                || !!parcel?.returnedAt
                || !!parcel?.returnReason
                || !!parcel?.returnToCity
                || parcel?.history?.some((h: any) => h.status?.includes('Retour'))

              // Vérifier si le retour est arrivé à l'agence source
              const isReturnArrived = parcel?.status === 'Retour arrivé' || parcel?.status === 'Retour finalisé'

              // APRÈS swap des villes lors du retour:
              // - receiver = expéditeur original (où le colis doit retourner)
              // - destinationCity = ville de l'expéditeur original
              // Donc pour RETOUR et LIVRAISON normale: utiliser receiver.city ou destinationCity

              const finalDestinationCity = parcel?.receiver?.city || parcel?.destinationCity

              const destCity = finalDestinationCity || profile?.city
              const citySectors = allSectors.filter((s: any) => s.city === destCity)
              const selectedSectorId = deliveryModal.sectorId
              const cityDrivers = drivers.filter((d: any) =>
                (!destCity || d.city === destCity) &&
                (d.role === 'livreur' || (d.role === 'chauffeur' && d.chauffeurType !== 'transport')) &&
                d.sectorId &&  // ⭐ Ne montrer que les livreurs associés à un secteur
                (!selectedSectorId || d.sectorId === selectedSectorId)
              )
              const cityVehicles = vehicles.filter((v: any) =>
                !destCity ||
                v.city === destCity ||
                cityDrivers.some((d: any) => d.id === v.chauffeurId)
              )

              return cityDrivers.length === 0 ? (
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <select
                    value={deliveryModal.sectorId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, sectorId: e.target.value, driverId: '' }))}
                    className={selectCls}
                  >
                    <option value="">Tous les secteurs de {destCity || 'destination'}</option>
                    {citySectors.map((s: any) => <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {deliveryModal.sectorId && (() => {
                  const selectedSector = citySectors.find((s: any) => s.id === deliveryModal.sectorId)
                  if (selectedSector) {
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-blue-900">📍 Secteur: {selectedSector.code}</p>
                        {selectedSector.name && selectedSector.name !== selectedSector.code && (
                          <p className="text-xs text-blue-700 mt-0.5">{selectedSector.name}</p>
                        )}
                      </div>
                    )
                  }
                  return null
                })()}

                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">Aucun livreur disponible pour ce secteur.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <select
                    value={deliveryModal.sectorId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, sectorId: e.target.value, driverId: '' }))}
                    className={selectCls}
                  >
                    <option value="">Tous les secteurs de {destCity || 'destination'}</option>
                    {citySectors.map((s: any) => <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {deliveryModal.sectorId && (() => {
                  const selectedSector = citySectors.find((s: any) => s.id === deliveryModal.sectorId)
                  if (selectedSector) {
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-blue-900">📍 Secteur: {selectedSector.code}</p>
                        {selectedSector.name && selectedSector.name !== selectedSector.code && (
                          <p className="text-xs text-blue-700 mt-0.5">{selectedSector.name}</p>
                        )}
                      </div>
                    )
                  }
                  return null
                })()}

                <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto pr-1">
                  {cityDrivers.map((d: any) => {
                    const sector = allSectors.find((s: any) => s.id === d.sectorId)
                    return (
                      <button key={d.id}
                        onClick={() => setDeliveryModal((m: any) => ({ ...m, driverId: d.id, sectorId: d.sectorId || m.sectorId || '' }))}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition ${
                          deliveryModal.driverId === d.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span className="flex-1">{d.name}</span>
                        {sector?.code && <span className="text-xs opacity-70">Secteur {sector.code}</span>}
                        {d.tel && <span className="text-xs opacity-70">{d.tel}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="relative">
                  <select
                    value={deliveryModal.vehicleId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, vehicleId: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="">Véhicule optionnel</option>
                    {cityVehicles.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {[v.matricule, v.marque, v.modele].filter(Boolean).join(' - ')}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )})()}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignDelivery} disabled={deliveryModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {deliveryModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Assignation...</>
                  : <><Truck className="w-4 h-4" /> Assigner</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal raison du retour */}
      {returnReasonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !returnReasonModal.loading && setReturnReasonModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">↩️</div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Retourner ce colis</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{returnReasonModal.parcel.trackingId}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raison du retour</p>
              {RETURN_REASONS.map((r: any) => (
                <button key={r} type="button"
                  onClick={() => setReturnReasonModal((m: any) => ({ ...m, reason: r }))}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                    returnReasonModal.reason === r
                      ? 'bg-red-50 border-red-400 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {returnReasonModal.reason === r ? '● ' : '○ '}{r}
                </button>
              ))}
              {returnReasonModal.reason === 'Autre raison' && (
                <input
                  autoFocus
                  type="text"
                  placeholder="Précisez la raison…"
                  value={returnReasonModal.customReason}
                  onChange={e => setReturnReasonModal((m: any) => ({ ...m, customReason: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-400"
                />
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setReturnReasonModal(null)}
                disabled={returnReasonModal.loading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button type="button" onClick={submitReturnWithReason}
                disabled={returnReasonModal.loading || !returnReasonModal.reason}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition">
                {returnReasonModal.loading ? 'En cours…' : 'Confirmer retour'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DÉTAILS PORTS ── */}
      {portDetailsModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPortDetailsModal({ open: false, portType: '', title: '', amountKey: 'price', parcels: [] })}>
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-200">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xl text-gray-800 break-words">{portDetailsModal.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {uniqueParcelCount(portDetailsModal.parcels)} expédition{uniqueParcelCount(portDetailsModal.parcels) > 1 ? 's' : ''} • Total: {' '}
                  <span className={`font-black ${detailColor}`}>
                    {detailTotal().toLocaleString('fr-MA')} DH
                  </span>
                </p>
                {portDetailsModal.portType === 'cod' && codModeTotals(portDetailsModal.parcels).length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    {codModeTotals(portDetailsModal.parcels).map(m => (
                      <span key={m.type} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                        {m.label} : <span className="font-black">{m.total.toLocaleString('fr-MA')} DH</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 relative">
                <button
                  onClick={() => setPrintChoiceMenuOpen(v => !v)}
                  className="p-2 hover:bg-blue-100 rounded-xl transition flex items-center gap-2 px-4 bg-blue-50 text-blue-700 shrink-0"
                  title="Imprimer la liste"
                >
                  <Printer className="w-5 h-5" />
                  <span className="text-sm font-semibold whitespace-nowrap">Imprimer</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                {printChoiceMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-64">
                    <button
                      onClick={() => {
                        setPrintChoiceMenuOpen(false)
                        printPortDetails(portDetailsModal.title, portDetailsModal.parcels, detailTotal(), portDetailsModal.portType, profile?.agency || profile?.city || 'Agence', portDetailsModal.amountKey || 'price', 'normal')
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition"
                    >
                      📄 Liste normale
                    </button>
                    <button
                      onClick={() => {
                        setPrintChoiceMenuOpen(false)
                        printPortDetails(portDetailsModal.title, portDetailsModal.parcels, detailTotal(), portDetailsModal.portType, profile?.agency || profile?.city || 'Agence', portDetailsModal.amountKey || 'price', 'bordereau')
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition"
                    >
                      🧾 Bordereau — Accusé de réception
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setPortDetailsModal({ open: false, portType: '', title: '', amountKey: 'price', parcels: [] })}
                  className="p-2 hover:bg-gray-100 rounded-xl transition shrink-0"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-6">
              {portDetailsModal.parcels.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucune expédition trouvée</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 w-10">#</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">N° EXP</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Mode de règlement</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Expéditeur</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Ville Origine</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Destinataire</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Ville Destination</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">{portDetailsModal.amountKey === 'codAmount' ? 'Montant' : 'Port'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portDetailsModal.parcels.map((p: any, idx: number) => (
                        <tr key={p.codPartMixed ? `${p.id}-${p.codPartType}` : (p.id || idx)} className="border-b border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-center text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.senderNic || p.sender?.nic || '-'}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                              valueTypeOf(p) === 'especes' ? 'bg-green-50 text-green-700' :
                              valueTypeOf(p) === 'cheque' ? 'bg-blue-50 text-blue-700' :
                              valueTypeOf(p) === 'traite' ? 'bg-indigo-50 text-indigo-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {valueTypeLabel(p)}
                            </span>
                            {p.codPartMixed && (
                              <div className="text-[10px] text-gray-500 mt-0.5" title="Retour de fonds mixte">RF mixte · total {(p.codAmountTotal || 0).toLocaleString('fr-MA')} DH</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {p.workDate || (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('fr-FR') : '-')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-gray-800">{p.senderName || p.sender?.name || '-'}</div>
                            <div className="text-xs text-gray-500">{p.senderTel || p.sender?.tel || ''}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{p.originCity || p.sender?.city || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-gray-800">{p.receiverName || p.receiver?.name || '-'}</div>
                            <div className="text-xs text-gray-500">{p.receiverTel || p.receiver?.tel || ''}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{p.destinationCity || p.receiver?.city || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${detailColor}`}>
                              {detailAmount(p).toLocaleString('fr-MA')} DH
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 sticky bottom-0">
                      {portDetailsModal.portType === 'cod' && codModeTotals(portDetailsModal.parcels).length > 1 && codModeTotals(portDetailsModal.parcels).map(m => (
                        <tr key={m.type}>
                          <td colSpan={8} className="px-4 py-1.5 text-right text-xs font-semibold text-gray-600">{m.label} :</td>
                          <td className="px-4 py-1.5 text-right text-xs font-bold text-gray-700">{m.total.toLocaleString('fr-MA')} DH</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={8} className="px-4 py-3 text-right font-bold text-gray-700">TOTAL:</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-lg font-black ${detailColor}`}>
                            {detailTotal().toLocaleString('fr-MA')} DH
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setPortDetailsModal({ open: false, portType: '', title: '', amountKey: 'price', parcels: [] })}
                className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHANGEMENT LIVREUR ── */}
      {changeDriverModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Changer le livreur</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{changeDriverModal.parcel?.trackingId}</p>
              </div>
              <button
                onClick={() => setChangeDriverModal({ open: false, parcel: null, newDriverId: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {changeDriverModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">
                ⚠️ {changeDriverModal.error}
              </div>
            )}

            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 mb-1">Livreur actuel</p>
              <p className="text-sm font-bold text-gray-800">
                {changeDriverModal.parcel?.chauffeurName || changeDriverModal.parcel?.deliveryDriverName || 'Aucun'}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-2">Nouveau livreur *</label>
              <select
                value={changeDriverModal.newDriverId}
                onChange={e => setChangeDriverModal(m => ({ ...m, newDriverId: e.target.value, error: '' }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Sélectionner un livreur --</option>
                {agencyDrivers.map((driver: any) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} {driver.phone ? `(${driver.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setChangeDriverModal({ open: false, parcel: null, newDriverId: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const { parcel, newDriverId } = changeDriverModal
                  if (!newDriverId) {
                    setChangeDriverModal(m => ({ ...m, error: 'Sélectionnez un livreur' }))
                    return
                  }

                  setChangeDriverModal(m => ({ ...m, loading: true, error: '' }))
                  try {
                    const newDriver = drivers.find((d: any) => d.id === newDriverId)
                    if (!newDriver) throw new Error('Livreur introuvable')

                    // Importer et utiliser la fonction d'assignation
                    const { assignDeliveryDriver } = await import('../../../firebase/delivery')
                    await assignDeliveryDriver(
                      parcel.id,
                      newDriverId,
                      newDriver.name,
                      {
                        deliverySectorId: '',
                        deliverySectorCode: '',
                        deliverySectorName: '',
                        deliveryAssignedBy: profile?.name || 'Chef agence',
                      }
                    )

                    // Fermer le modal
                    setChangeDriverModal({ open: false, parcel: null, newDriverId: '', loading: false, error: '' })
                    alert(`✅ Livreur changé avec succès! Nouveau livreur: ${newDriver.name}`)
                  } catch (err: any) {
                    console.error('Erreur changement livreur:', err)
                    setChangeDriverModal(m => ({ ...m, loading: false, error: err.message || 'Erreur lors du changement' }))
                  }
                }}
                disabled={changeDriverModal.loading}
                className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {changeDriverModal.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Changement...
                  </>
                ) : (
                  <>
                    🖐️ Changer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ MODAL ÉDITION RAPIDE (Prix, Statut, COD) - AGENT PRO uniquement */}
      {quickEditModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-lg">🖐️</span>
                  Édition complète
                </h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">
                  {quickEditModal.parcel?.sender?.nic || quickEditModal.parcel?.trackingId}
                </p>
              </div>
              <button
                onClick={() => setQuickEditModal({
                  open: false,
                  parcel: null,
                  price: '',
                  portType: '',
                  status: '',
                  codAmount: '',
                  serviceType: '',
                  nbColis: '',
                  poids: '',
                  contenu: '',
                  remarque: '',
                  loading: false,
                  error: ''
                })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {quickEditModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">
                ⚠️ {quickEditModal.error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Prix du port */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">💰 Prix du port (DH)</label>
                <input
                  type="number"
                  value={quickEditModal.price}
                  onChange={e => setQuickEditModal(m => ({ ...m, price: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                  placeholder="Ex: 35"
                />
              </div>

              {/* Type de port */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">📋 Type de port</label>
                <select
                  value={quickEditModal.portType}
                  onChange={e => setQuickEditModal(m => ({ ...m, portType: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="port_paye">✅ Port Payé</option>
                  <option value="port_du">📮 Port Dû</option>
                  <option value="port_du_cheque">📋 Port Dû Chèque</option>
                  <option value="port_en_compte_expediteur">💼 Compte Expéditeur</option>
                  <option value="port_en_compte_destinataire">🖐️ Compte Destinataire</option>
                  <option value="port_en_compte">💼 Compte (ancien)</option>
                </select>
              </div>

              {/* Type de service */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">🏷️ Type de service</label>
                <select
                  value={quickEditModal.serviceType || ''}
                  onChange={e => {
                    const newServiceType = e.target.value
                    setQuickEditModal(m => ({
                      ...m,
                      serviceType: newServiceType,
                      codAmount: newServiceType === 'simple' || newServiceType === '' || newServiceType === 'retour_bl' ? '0' : m.codAmount,
                      ...((newServiceType === 'cheque' || newServiceType === 'traite') ? {} : { codMixed: false, codCashAmount: '' }),
                      error: ''
                    }))
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="simple">📦 Simple</option>
                  <option value="especes">💵 Espèces</option>
                  <option value="cheque">📝 Chèque</option>
                  <option value="traite">📄 Traite</option>
                  <option value="retour_bl">🧾 Retour BL</option>
                </select>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">🚦 Statut</label>
                <select
                  value={quickEditModal.status || ''}
                  onChange={e => setQuickEditModal(m => ({ ...m, status: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Statut actuel --</option>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Montant COD - Affiché uniquement pour especes, cheque, traite */}
              {quickEditModal.serviceType &&
               quickEditModal.serviceType !== '' &&
               quickEditModal.serviceType !== 'simple' &&
               quickEditModal.serviceType !== 'retour_bl' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">{quickEditModal.codMixed ? (quickEditModal.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)') : '💵 Montant COD (DH)'}</label>
                  <input
                    type="number"
                    value={quickEditModal.codAmount || ''}
                    onChange={e => setQuickEditModal(m => ({ ...m, codAmount: e.target.value, error: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                    placeholder="Ex: 150"
                  />
                  {(quickEditModal.serviceType === 'cheque' || quickEditModal.serviceType === 'traite') && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickEditModal.codMixed === true}
                        onChange={e => { const on = e.target.checked; setQuickEditModal(m => ({ ...m, codMixed: on, codCashAmount: on ? m.codCashAmount : '', error: '' })) }}
                      />
                      💵 + Espèces (retour de fonds mixte)
                    </label>
                  )}
                </div>
              )}
              {quickEditModal.codMixed === true && (quickEditModal.serviceType === 'cheque' || quickEditModal.serviceType === 'traite') && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">💵 Montant espèces (DH)</label>
                  <input
                    type="number"
                    value={quickEditModal.codCashAmount || ''}
                    onChange={e => setQuickEditModal(m => ({ ...m, codCashAmount: e.target.value, error: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                    placeholder="Ex: 1200"
                  />
                  <p className="mt-1 text-xs font-bold text-gray-600">Total : {((parseFloat(quickEditModal.codCashAmount || '') || 0) + (parseFloat(quickEditModal.codAmount) || 0)).toLocaleString('fr-MA')} DH</p>
                </div>
              )}

              {/* Nombre de colis */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">📦 Nombre de colis</label>
                <input
                  type="number"
                  value={quickEditModal.nbColis}
                  onChange={e => setQuickEditModal(m => ({ ...m, nbColis: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Ex: 2"
                />
              </div>

              {/* Poids */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">⚖️ Poids (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={quickEditModal.poids}
                  onChange={e => setQuickEditModal(m => ({ ...m, poids: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Ex: 5.5"
                />
              </div>

              {/* Contenu */}
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2">📝 Contenu</label>
                <input
                  type="text"
                  value={quickEditModal.contenu}
                  onChange={e => setQuickEditModal(m => ({ ...m, contenu: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Description du contenu"
                />
              </div>

              {/* Remarque */}
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2">💬 Remarque</label>
                <textarea
                  value={quickEditModal.remarque}
                  onChange={e => setQuickEditModal(m => ({ ...m, remarque: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Notes ou remarques..."
                  rows={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setQuickEditModal({
                  open: false,
                  parcel: null,
                  price: '',
                  portType: '',
                  status: '',
                  codAmount: '',
                  serviceType: '',
                  nbColis: '',
                  poids: '',
                  contenu: '',
                  remarque: '',
                  loading: false,
                  error: ''
                })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const { parcel, price, portType, status, codAmount, serviceType, nbColis, poids, contenu, remarque } = quickEditModal
                  // 💵+📋 RF mixte : chaque type coché doit avoir son montant
                  const qMixed = quickEditModal.codMixed === true && (serviceType === 'cheque' || serviceType === 'traite')
                  const codChoiceError = validateCodChoice({ serviceType, codAmount, cashAmount: quickEditModal.codCashAmount, mixed: qMixed })
                  if (codChoiceError) { setQuickEditModal(m => ({ ...m, error: codChoiceError })); return }
                  const qCod = buildCodWriteFields({ serviceType, codAmount, cashAmount: quickEditModal.codCashAmount, mixed: qMixed })

                  setQuickEditModal(m => ({ ...m, loading: true, error: '' }))
                  try {
                    const { updateParcelStatus } = await import('../../../firebase/parcels')
                    const { getDoc, doc } = await import('firebase/firestore')
                    const { db } = await import('../../../firebase/config')

                    // Relire le colis en base : l'objet affiché peut être périmé. Les champs que
                    // l'utilisateur a modifiés sont détectés par rapport à l'écran, mais l'ancien
                    // montant RF / l'historique / le codPaymentType sont calculés sur la BASE.
                    const snap = await getDoc(doc(db, 'parcels', parcel.id))
                    const fresh: any = snap.exists() ? { id: snap.id, ...snap.data() } : parcel
                    const modifier = { uid: uid || null, name: profile?.name || 'Utilisateur' }
                    const txt = (v: any) => String(v ?? '').trim()
                    const num = (v: any) => { const n = Number.parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

                    // 1) Champs du bon + RETOUR FOND (règle Firestore parcelBonEditFields) :
                    //    buildParcelCorrectionPatch garde codAmount / codAmountHistory / codStatus /
                    //    codPaymentType cohérents avec serviceType (serviceType fait foi).
                    const next: any = {}
                    if (serviceType && serviceType !== parcel.serviceType) next.serviceType = serviceType
                    const finalCodAmount = serviceType === 'simple' || serviceType === 'retour_bl' ? '0' : String(qCod.codAmount) // TOTAL
                    if (num(finalCodAmount) !== num(parcel.codAmount)) next.codAmount = finalCodAmount
                    if (qCod.codMixed || fresh.codMixed === true) { next.codMixed = qCod.codMixed; next.codCashAmount = qCod.codCashAmount }
                    if (num(price) !== num(parcel.price)) next.price = price
                    if (txt(nbColis) && txt(nbColis) !== txt(parcel.nbColis)) next.nbColis = nbColis
                    if (portType && portType !== parcel.portType) next.portType = portType
                    const bonPatch: Record<string, any> = buildParcelCorrectionPatch(fresh, next, modifier)

                    // 2) Champs hors bon (écriture séparée, autorisée par une autre règle)
                    const extra: Record<string, any> = {}
                    if (bonPatch.serviceType !== undefined) {
                      extra.serviceTypeHistory = [
                        ...(Array.isArray(fresh.serviceTypeHistory) ? fresh.serviceTypeHistory : []),
                        {
                          timestamp: new Date().toISOString(),
                          userName: profile?.name || 'Utilisateur inconnu',
                          userUid: uid,
                          oldServiceType: fresh.serviceType || null,
                          newServiceType: bonPatch.serviceType,
                        },
                      ].slice(-50)
                    }
                    if (txt(poids) !== txt(parcel.poids)) extra.poids = txt(poids) ? num(poids) : null
                    if (txt(contenu) !== txt(parcel.contenu)) extra.contenu = txt(contenu) || null
                    if (txt(remarque) !== txt(parcel.remarque)) extra.remarque = txt(remarque) || null

                    // 3) Statut (avec historique)
                    const statusChange = !!status && status !== parcel.status && status !== fresh.status

                    if (Object.keys(bonPatch).length === 0 && Object.keys(extra).length === 0 && !statusChange) {
                      setQuickEditModal(m => ({ ...m, loading: false, error: 'Aucune modification détectée' }))
                      return
                    }

                    const saved: Record<string, any> = {}
                    if (Object.keys(bonPatch).length > 0) {
                      await updateParcel(parcel.id, bonPatch)
                      Object.assign(saved, bonPatch)
                    }
                    try {
                      if (Object.keys(extra).length > 0) {
                        await updateParcel(parcel.id, extra)
                        Object.assign(saved, extra)
                      }
                      if (statusChange) {
                        await updateParcelStatus(parcel.id, status, { note: 'Édition complète' })
                        saved.status = status
                      }
                    } catch (e2: any) {
                      if (Object.keys(saved).length > 0) {
                        setLocalParcelUpdates(prev => ({ ...prev, [parcel.id]: { ...prev[parcel.id], ...saved } }))
                        setForceUpdateCounter(c => c + 1)
                        throw Object.assign(new Error("Une partie des modifications a été enregistrée (type de service / montants), mais le reste a été refusé : " + (e2?.message || e2)), { partial: true })
                      }
                      throw e2
                    }

                    // ⚡ Affichage immédiat des valeurs RÉELLEMENT enregistrées
                    setLocalParcelUpdates(prev => ({
                      ...prev,
                      [parcel.id]: { ...prev[parcel.id], ...saved }
                    }))
                    setForceUpdateCounter(c => c + 1)

                    // Fermer le modal
                    setQuickEditModal({
                      open: false,
                      parcel: null,
                      price: '',
                      portType: '',
                      status: '',
                      codAmount: '',
                      serviceType: '',
                      nbColis: '',
                      poids: '',
                      contenu: '',
                      remarque: '',
                      loading: false,
                      error: ''
                    })
                    alert('✅ Modifications enregistrées avec succès!')
                  } catch (err: any) {
                    console.error('Erreur édition complète:', err)
                    const msg = err?.code && !err?.partial ? describeParcelSaveError(err, parcel) : (err?.message || 'Erreur lors de la mise à jour')
                    setQuickEditModal(m => ({ ...m, loading: false, error: msg }))
                  }
                }}
                disabled={quickEditModal.loading}
                className="py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {quickEditModal.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Enregistrer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Statut Document COD */}
      {codDocumentModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-800">✋ Statut Document COD</h3>
              <button
                onClick={() => setCodDocumentModal({ open: false, parcelId: null, currentStatus: null, serviceType: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Sélectionnez le statut du document {codDocumentModal.serviceType === 'cheque' ? '(chèque)' : '(traite)'} :
            </p>

            <div className="space-y-2">
              {[
                { key: 'cheque_recu', label: 'Chèque reçu', emoji: '✅', color: 'green', type: 'cheque' },
                { key: 'cheque_encours', label: 'Chèque en cours', emoji: '⏳', color: 'orange', type: 'cheque' },
                { key: 'traite_recu', label: 'Traite reçue', emoji: '✅', color: 'green', type: 'traite' },
                { key: 'traite_encours', label: 'Traite en cours', emoji: '⏳', color: 'orange', type: 'traite' },
              ]
              .filter(option => option.type === codDocumentModal.serviceType)
              .map(({ key, label, emoji, color }) => (
                <button
                  key={key}
                  onClick={async () => {
                    try {
                      await updateParcel(codDocumentModal.parcelId!, { codDocumentStatus: key })

                      // ⚡ Mise à jour locale pour affichage temps réel
                      setLocalParcelUpdates(prev => ({
                        ...prev,
                        [codDocumentModal.parcelId!]: { ...prev[codDocumentModal.parcelId!], codDocumentStatus: key }
                      }))
                      setForceUpdateCounter(c => c + 1)

                      setCodDocumentModal({ open: false, parcelId: null, currentStatus: null, serviceType: null })
                    } catch (err) {
                      console.error('Erreur mise à jour statut document:', err)
                      alert('Erreur lors de la mise à jour du statut')
                    }
                  }}
                  className={`w-full px-4 py-3 rounded-xl font-semibold text-left flex items-center justify-between transition ${
                    codDocumentModal.currentStatus === key
                      ? `bg-${color}-100 text-${color}-800 border-2 border-${color}-500`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{emoji} {label}</span>
                  {codDocumentModal.currentStatus === key && <Check className="w-5 h-5" />}
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={async () => {
                  try {
                    await updateParcel(codDocumentModal.parcelId!, { codDocumentStatus: deleteField() })

                    // ⚡ Mise à jour locale pour affichage temps réel
                    setLocalParcelUpdates(prev => ({
                      ...prev,
                      [codDocumentModal.parcelId!]: { ...prev[codDocumentModal.parcelId!], codDocumentStatus: null }
                    }))
                    setForceUpdateCounter(c => c + 1)

                    setCodDocumentModal({ open: false, parcelId: null, currentStatus: null, serviceType: null })
                  } catch (err) {
                    console.error('Erreur suppression statut:', err)
                  }
                }}
                className="w-full px-4 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 font-semibold transition"
              >
                🗑️ Effacer le statut
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL HISTORIQUE DES MODIFICATIONS ── */}
      {historyModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-800">Historique des modifications</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{historyModal.parcel?.trackingId}</p>
              </div>
              <button
                onClick={() => setHistoryModal({ open: false, parcel: null })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5">
              {historyModal.parcel?.serviceTypeHistory && historyModal.parcel.serviceTypeHistory.length > 0 ? (
                <div className="space-y-3">
                  {[...historyModal.parcel.serviceTypeHistory].reverse().map((entry: any, index: number) => {
                    const oldType = ALL_SERVICE_TYPES.find(st => st.key === entry.oldServiceType)
                    const newType = ALL_SERVICE_TYPES.find(st => st.key === entry.newServiceType)
                    const date = new Date(entry.timestamp)

                    return (
                      <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold shrink-0">
                          {historyModal.parcel.serviceTypeHistory.length - index}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-700">{entry.userName}</span>
                            <span className="text-xs text-gray-500">•</span>
                            <span className="text-xs text-gray-500">
                              {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              {' à '}
                              {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                              {oldType?.emoji} {oldType?.label || entry.oldServiceType}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                              {newType?.emoji} {newType?.label || entry.newServiceType}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="text-gray-400 text-4xl mb-2">📋</div>
                  <p className="text-gray-600 font-medium">Aucun historique de modification</p>
                  <p className="text-sm text-gray-500 mt-1">Les modifications futures seront enregistrées ici</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 💰 MODALE: Édition rapide montant COD */}
      {codEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-gray-800">Modifier le montant COD</h3>
              <button
                onClick={() => setCodEditModal(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              {codEditModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {codEditModal.error}
                </div>
              )}
              {codEditModal.mixed && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">💵 Montant espèces (DH)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={codEditModal.cashValue}
                    onChange={(e) => setCodEditModal({ ...codEditModal, cashValue: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {codEditModal.mixed ? (codEditModal.parcel?.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)') : 'Montant COD (DH)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={codEditModal.value}
                  onChange={(e) => setCodEditModal({ ...codEditModal, value: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setCodEditModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    const parcelId = codEditModal?.parcel?.id
                    // Renvoie le patch RÉELLEMENT enregistré, ou null en cas d'échec (toast déjà affiché)
                    const saved = await handleSaveCodAmount()
                    if (!saved || !parcelId) return

                    // ⚡ Affichage immédiat des valeurs enregistrées (codAmount, historique,
                    // codPaymentType/codStatus) — remplacées par le listener dès qu'il se met à jour.
                    if (Object.keys(saved).length > 0) {
                      setLocalParcelUpdates(prev => ({
                        ...prev,
                        [parcelId]: { ...prev[parcelId], ...saved }
                      }))
                      setForceUpdateCounter(c => c + 1)
                    }
                  }}
                  disabled={codEditModal.loading}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
                >
                  {codEditModal.loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📦 MODAL ASSIGNATION RAMASSAGE */}
      {assignPickupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Assigner pour ramassage</h3>
                <p className="text-xs text-orange-600 mt-0.5">
                  {selectedPickupParcelIds.size} expédition(s) sélectionnée(s)
                </p>
              </div>
              <button
                onClick={() => setAssignPickupModal(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  Livreur local *
                </label>
                <select
                  value={assigningPickupDriver}
                  onChange={e => setAssigningPickupDriver(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- Sélectionner un livreur --</option>
                  {agencyDrivers.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAssignPickupModal(false)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleAssignPickupToDriver}
                disabled={assigningPickupInProgress || !assigningPickupDriver}
                className="py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {assigningPickupInProgress ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Assignation...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Assigner
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
