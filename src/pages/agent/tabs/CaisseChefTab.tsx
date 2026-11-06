import { Fragment, useState, useMemo, useEffect, useDeferredValue, startTransition } from 'react'
import { summarizeEcarts, transferEcart, transferSent } from '../../../utils/versementEcarts'
import { loadVersementDay, useVersementDays, type VersementDayDetail } from '../../../firebase/versementCopy'
import { docPartKeepingTotal } from '../../../utils/codParts'
import PendingBadge from '../../../components/PendingBadge'
import {
  Wallet, TrendingUp, AlertCircle, User, Package, Clock, Check, X,
  Send, Eye, Search, Calendar, Filter, Banknote, Printer
} from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import DateFilter from '../DateFilter'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import { VIA_EXPLOITATION_MSG, isCodMoneyBeforeStart } from '../../../utils/moneyFlow'
import { chefCancelCod, chefCancelPortDu, chefCancelPortPaye, chefReceiveCod, chefReceivePortDu, chefReceivePortPaye } from '../../../firebase/chefPortReception'
import {
  createAdminTransferFromAgent,
  createRegularisationTransfer,
  subscribeAdminTransfersByCity
} from '../../../firebase/caisse'
import {
  createDeliveryDelay,
  updateDeliveryDelay,
  deleteDeliveryDelay,
  subscribeDeliveryDelays
} from '../../../firebase/delivery'
import { collectPortDu, uncollectPortDu } from '../../../firebase/cod'
import { updateParcel, searchParcels, subscribeAgencyReturnParcels, portTypeChangeFields, undoAutoDeliveryAfterUncollect } from '../../../firebase/parcels'
import { useRecentCollected } from '../../../hooks/useRecentCollected'
import { useAgencyParcelsFull } from '../../../hooks/useAgencyParcelsFull'
import LoadProgress from '../../../components/LoadProgress'
import OldUnsettledCard from '../../../components/caisse/OldUnsettledCard'
import { collection, query, where, onSnapshot, documentId, doc as fsDoc, getDoc, arrayUnion, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/db'
import { auth } from '../../../firebase/config'
import { shouldTriggerSearch } from '../../../utils/searchUtils'
import { deliveryCityBlock } from '../../../utils/deliveryCity'
import { useDebounce } from '../../../components/DebouncedSearchInput'
import { printVersementParcels, printDriverExpeditionsTable, printBilanJournee, printInstancesRetards } from '../../../utils/agentPrintUtils'
import HScrollArrows from '../../../components/HScrollArrows'
import DriverCaisseCard from '../../../components/caisse/DriverCaisseCard'
import CollectesParJour, { CodCollectesParJour } from '../../../components/caisse/CollectesParJour'
import { CARD, SectionTitle } from '../../exploitation/ui'
import { printFeuilleDeCharge } from '../../../utils/printFeuilleDeCharge'
import { useGarePending } from '../../exploitation/useGarePending'
import { useDepotIds, useAgencyHolderIds, useCityDriverNames } from '../../exploitation/useDepotIds'
import {
  firestoreBoundsFor, caisseFilterByDate, safeParseAmount, computeCaisseView, caisseDateBounds,
  caisseCodAmountOfType, caisseCodTotals, CAISSE_DEFAULT_PRESET, caisseDefaultOperationalDay, CAISSE_STATUS_OPTIONS,
  isRamasseGuichet, guichetGroupIdOf, GARE_GROUP_ID, ramasseGuichetEtat, toDateSafe, isPortDuHeldByAgency, isAdminTransferred,
  caisseStatusMatches, isReturnPortDu,
} from '../../../utils/agencyCaisseRules'
import { getOperationalDayString } from '../../../config/operationalDay'
import BilanPeriode from '../../../components/caisse/BilanPeriode'
import { opDayKeyOf } from '../../../utils/versementPeriod'
import { isPortDuMoneyBeforeStart } from '../../../utils/moneyFlow'
import { isMixedCod, codPartsBreakdown, codCashPartOf, codDocPartOf, codEditResult } from '../../../utils/codParts'

// Types
interface DelayReason {
  key: string
  label: string
}

// ⚖️ Date de référence, filtre de date et TOUS les calculs de cette page : module partagé
// src/utils/agencyCaisseRules.ts — la MÊME source que la page Chef d'exploitation.

const DELAY_REASONS: DelayReason[] = [
  { key: 'client_absent', label: 'Client absent' },
  { key: 'adresse_incorrecte', label: 'Adresse incorrecte' },
  { key: 'trop_colis', label: 'Trop de colis' },
  { key: 'report_client', label: 'Report demandé par client' },
  { key: 'autre', label: 'Autre' },
]

export default function CaisseChefTab() {
  const {
    uid,
    profile,
    agentEntries,
    updateParcelOptimistic,
    pendingVersements,
    setTab,
  } = useAgentCtx()

  // État des onglets
  const [activeTab, setActiveTab] = useState<'livreurs' | 'journee' | 'instances' | 'versements' | 'historique'>('livreurs')

  // Filtres date
  // ⚡ RÉACTIVITÉ DES BOUTONS : les valeurs « …Ui » sont URGENTES (bouton/sélecteur mis à jour
  // immédiatement, chargement Firestore lancé aussitôt) ; les calculs lourds (soldes, livreurs,
  // totaux) utilisent les copies DIFFÉRÉES (mêmes noms qu'avant), recalculées en arrière-plan.
  const [datePresetUi, setDatePreset] = useState<any>(CAISSE_DEFAULT_PRESET)
  const [dateFromUi, setDateFrom] = useState('')
  const [dateToUi, setDateTo] = useState('')
  // 🗓️ Journée d'opération (8h → 6h lendemain) — remplace "Jour précis" sur cette page
  const [operationalDayUi, setOperationalDay] = useState<Date | null>(() => caisseDefaultOperationalDay())
  const handleDatePresetChange = (key: any) => {
    // Au premier passage sur "Journée d'opération", initialiser sur aujourd'hui
    if (key === 'operational' && !operationalDayUi) setOperationalDay(new Date())
    setDatePreset(key)
  }
  // 📅 Période APPLIQUÉE (chargement + calculs) : avec « Période », la recherche ne part qu'une fois les
  // DEUX dates choisies (et dans l'ordre) — d'ici là, la période précédente reste affichée.
  const [appliedDates, setAppliedDates] = useState({ preset: datePresetUi, from: dateFromUi, to: dateToUi })
  useEffect(() => {
    if (datePresetUi === 'custom' && (!dateFromUi || !dateToUi || dateFromUi > dateToUi)) return
    setAppliedDates(prev => (prev.preset === datePresetUi && prev.from === dateFromUi && prev.to === dateToUi ? prev : { preset: datePresetUi, from: dateFromUi, to: dateToUi }))
  }, [datePresetUi, dateFromUi, dateToUi])

  // 📡 Chargement des expéditions PROPRE à cette page, indépendant de l'onglet Expéditions.
  // Avant, Caisse Agence lisait passivement les colis déjà chargés en mémoire par un AUTRE
  // onglet (Expéditions, Accueil...) : pour voir une date ancienne ici, il fallait d'abord
  // aller la sélectionner côté Expéditions pour déclencher son chargement Firestore. Cette
  // page pilote maintenant sa propre requête, bornée par SES PROPRES datePreset/dateFrom/
  // dateTo/operationalDay (locaux à ce fichier, voir plus haut).
  // ⚠️ CORRECTIF : la requête était plafonnée à 300 colis par sens (1200 avec Période/Journée) et
  // excluait les archivés, sur une fenêtre par défaut de 30 jours. Casablanca crée ≈ 400 colis/jour :
  // « Ce mois », « 7 jours » ou une Période de 45 jours n'affichaient que les derniers jours, et les
  // totaux (ports à collecter, collectés, versements) étaient faux. Désormais : bornes Firestore
  // exactes pour chaque preset (firestoreBoundsFor, sur-ensemble du filtre client), chargement
  // jusqu'à épuisement en temps réel, archivés inclus, 45 jours pour les filtres larges.
  const caisseBounds = firestoreBoundsFor(appliedDates.preset, appliedDates.from, appliedDates.to, operationalDayUi)
  const caisseFromMs = caisseBounds.from ? caisseBounds.from.getTime() : 0
  const caisseToMs = caisseBounds.to ? caisseBounds.to.getTime() : 0
  const isChefCaisse = profile?.role === 'chef_agence' && !!profile?.city
  const {
    parcels: caisseParcels,
    loaded: caisseLoadedCount,
    loading: caisseLoadingMore,
  } = useAgencyParcelsFull(
    profile?.city,
    caisseFromMs ? new Date(caisseFromMs) : null,
    caisseToMs ? new Date(caisseToMs) : null,
    isChefCaisse,
    true, // journées passées en version allégée (parcelsLite), journée en cours complète
  )
  // 🧾 Collectées ces 14 derniers jours mais créées hors période → complètent les cartes « par jour »
  // ⚡ Gardées en mémoire / rattrapées (useRecentCollected) ; sur téléphone, lancées APRÈS la période affichée
  const { docs: recentCollected, ready: recentReady } = useRecentCollected(profile?.city,
    caisseFromMs ? new Date(caisseFromMs) : null, caisseToMs ? new Date(caisseToMs) : null, isChefCaisse, !caisseLoadingMore)
  const [caisseReturnParcels, setCaisseReturnParcels] = useState<any[]>([])
  useEffect(() => {
    if (!isChefCaisse || !profile?.city) return
    setCaisseReturnParcels([])
    const onErr = (err: any) => console.error('CaisseChefTab chargement retours:', err)
    const unsubReturns = subscribeAgencyReturnParcels(
      profile.city,
      (data: any) => startTransition(() => setCaisseReturnParcels(data)),
      onErr,
      caisseFromMs ? new Date(caisseFromMs) : null,
      caisseToMs ? new Date(caisseToMs) : null,
    )
    return () => { unsubReturns() }
  }, [isChefCaisse, profile?.city, caisseFromMs, caisseToMs])

  // 📬 Temps réel : ports payés ramassés au guichet encore « à verser » (portStatus collected) — une réception
  // ou une annulation faite par le chef d'exploitation se voit aussitôt, même sur une journée passée
  // (les journées passées sont sinon lues une seule fois à l'ouverture)
  // ⚡ Bornée aux dates de la période affichée (mêmes bornes createdAt que le chargement) : seules les expéditions
  // déjà présentes dans la page sont remplacées (allDisplayParcels) → résultat identique. Avant : toutes dates
  // confondues, ≈ 540 expéditions complètes (1,3 Mo) lues à Agadir à chaque ouverture.
  const [liveRamasses, setLiveRamasses] = useState<Map<string, any>>(() => new Map())
  useEffect(() => {
    if (!isChefCaisse || !profile?.city) return
    const q = query(collection(db, 'parcels'),
      where('originCity', '==', profile.city), where('portType', '==', 'port_paye'), where('portStatus', '==', 'collected'),
      ...(caisseFromMs ? [where('createdAt', '>=', Timestamp.fromMillis(caisseFromMs))] : []),
      ...(caisseToMs ? [where('createdAt', '<=', Timestamp.fromMillis(caisseToMs))] : []))
    return onSnapshot(q, snap => startTransition(() => setLiveRamasses(new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }])))),
      err => console.error('CaisseChefTab ramassés temps réel:', err))
  }, [isChefCaisse, profile?.city, caisseFromMs, caisseToMs])

  // 🔄 Temps réel : RÉCEPTIONS du chef d'exploitation des 2 derniers jours (ports dus, COD, ports payés ramassés) —
  // avant, une réception faite le soir sur une expédition d'une journée passée n'apparaissait dans Caisse Agence
  // qu'au rechargement (journées passées lues une seule fois), alors que la Collecte du soir l'affichait aussitôt.
  // Version allégée (quelques centaines d'expéditions au plus) ; une annulation fait sortir l'expédition de la
  // requête → sa version à jour est relue une fois.
  const [liveExpReceived, setLiveExpReceived] = useState<Map<string, any>>(() => new Map())
  useEffect(() => {
    if (!isChefCaisse || !profile?.city) return
    const city = profile.city
    setLiveExpReceived(new Map())
    const sinceIso = new Date(Date.now() - 2 * 86400000).toISOString()
    const put = (id: string, data: any) => startTransition(() => setLiveExpReceived(prev => new Map(prev).set(id, { id, ...data })))
    const watch = (cityField: string, dateField: string) => onSnapshot(
      query(collection(db, 'parcelsLite'), where(cityField, '==', city), where(dateField, '>=', sinceIso)),
      snap => {
        // ⚡ Une seule copie de la liste par signal (avant : une copie PAR expédition → coût quadratique à l'ouverture)
        const ups: [string, any][] = []
        snap.docChanges().forEach(ch => {
          if (ch.type === 'removed') getDoc(fsDoc(db, 'parcelsLite', ch.doc.id)).then(d => { if (d.exists()) put(d.id, d.data()) }).catch(() => {})
          else ups.push([ch.doc.id, ch.doc.data()])
        })
        if (ups.length) startTransition(() => setLiveExpReceived(prev => { const m = new Map(prev); ups.forEach(([id, d]) => m.set(id, { id, ...d })); return m }))
      },
      err => console.error("CaisseChefTab réceptions chef d'exploitation temps réel:", err),
    )
    const unsubs = [
      watch('destinationCity', 'portExpReceivedAt'),
      watch('destinationCity', 'codExpReceivedAt'),
      watch('originCity', 'portPayeExpReceivedAt'),
    ]
    return () => unsubs.forEach(u => u())
  }, [isChefCaisse, profile?.city])

  // Fusion colis + retours, même logique que allDisplayParcels côté Expéditions
  const allDisplayParcels = useMemo(() => {
    const map = new Map()
    ;(caisseParcels || []).forEach((p: any) => map.set(p.id, p))
    ;(caisseReturnParcels || []).forEach((p: any) => map.set(p.id, p))
    // Versions temps réel à la place de la version lue à l'ouverture (réceptions du chef d'exploitation, puis
    // ports payés ramassés en document complet)
    liveExpReceived.forEach((p, id) => { if (map.has(id)) map.set(id, p) })
    liveRamasses.forEach((p, id) => { if (map.has(id)) map.set(id, p) })
    return [...map.values()]
  }, [caisseParcels, caisseReturnParcels, liveExpReceived, liveRamasses])

  // Filtres
  const [driverFilterUi, setDriverFilter] = useState('all')
  const [statusFilterUi, setStatusFilter] = useState('all')
  // Copies DIFFÉRÉES des filtres (lues par tous les calculs) — un seul objet pour qu'elles
  // changent ensemble dans le même rendu d'arrière-plan.
  const urgentCaisseFilters = useMemo(
    () => ({ datePreset: appliedDates.preset, dateFrom: appliedDates.from, dateTo: appliedDates.to, operationalDay: operationalDayUi, driverFilter: driverFilterUi, statusFilter: statusFilterUi }),
    [appliedDates, operationalDayUi, driverFilterUi, statusFilterUi]
  )
  const deferredCaisseFilters = useDeferredValue(urgentCaisseFilters)
  const { datePreset, dateFrom, dateTo, operationalDay, driverFilter, statusFilter } = deferredCaisseFilters
  const caisseFiltersPending = deferredCaisseFilters !== urgentCaisseFilters
  const [searchQuery, setSearchQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(true) // 🗄️ archives TOUJOURS comprises (lot 2, 05/11/2026)
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)

  // Cache local des modifications faites dans searchResults
  const [modifiedParcels, setModifiedParcels] = useState<Record<string, any>>({})

  // 🗄️ Colis collectés en mode recherche qui ne sont pas dans allDisplayParcels (vieux colis > 30j)
  const [extraCollectedParcels, setExtraCollectedParcels] = useState<Record<string, any>>({})

  // État livreurs
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set())
  const [delayModal, setDelayModal] = useState<any>(null)
  const [delayForm, setDelayForm] = useState({ reason: '', reasonDetail: '' })
  const [savingDelay, setSavingDelay] = useState(false)

  // 🗂️ Colonnes visibles du tableau des expéditions par livreur : le chef d'agence peut
  // décocher/recocher n'importe quelle colonne à tout moment, à l'affichage comme à
  // l'impression. Persisté en localStorage pour rester d'une session à l'autre.
  const DRIVER_TABLE_COLUMNS_KEY = 'caisseChef_driverTableColumns'
  const DEFAULT_DRIVER_TABLE_COLUMNS = {
    nexp: true, dateCreation: true, dateLivraison: true, client: true,
    type: true, montant: true, status: true,
    cod: true, especes: true, cheque: true, traite: true,
  }
  const [driverTableColumns, setDriverTableColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(DRIVER_TABLE_COLUMNS_KEY)
      return saved ? { ...DEFAULT_DRIVER_TABLE_COLUMNS, ...JSON.parse(saved) } : DEFAULT_DRIVER_TABLE_COLUMNS
    } catch {
      return DEFAULT_DRIVER_TABLE_COLUMNS
    }
  })
  const [showDriverColumnsMenu, setShowDriverColumnsMenu] = useState(false)
  const toggleDriverColumn = (key: string) => {
    setDriverTableColumns(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(DRIVER_TABLE_COLUMNS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const DRIVER_TABLE_COLUMN_LABELS: Record<string, string> = {
    nexp: 'N° EXP', dateCreation: 'Date création', dateLivraison: 'Date livraison',
    client: 'Client', type: 'Type', montant: 'Montant', status: 'Status',
    cod: 'COD', especes: 'Espèces', cheque: 'Chèque', traite: 'Traite',
  }

  // État versements
  const [versementForm, setVersementForm] = useState({ amount: '', note: '' })
  // 💼 Onglet Versements (30/10/2026) : fenêtre « Verser » d'une journée + filtre de l'historique
  const [verserOpen, setVerserOpen] = useState(false)
  const [histFilter, setHistFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all')
  const [openDay, setOpenDay] = useState<string | null>(null) // journée de collecte dépliée (détail + versements)
  const [showAllDays, setShowAllDays] = useState(false)        // aussi les journées entièrement versées
  // 💼 Régularisation d'un écart (versement validé par l'admin pour moins que le montant envoyé)
  const [regulForm, setRegulForm] = useState<{ amount: string; note: string } | null>(null)
  const [sendingRegul, setSendingRegul] = useState(false)
  const [sendingVersement, setSendingVersement] = useState(false)
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])
  const [deliveryDelays, setDeliveryDelays] = useState<any[]>([])

  // État collecte ports
  const [collectingPortIds, setCollectingPortIds] = useState<Set<string>>(new Set())
  // 📋 Port dû payé PAR CHÈQUE, collecté depuis la recherche (04/11/2026) : détails du chèque
  const [portChequeModal, setPortChequeModal] = useState<null | { parcel: any; banque: string; numero: string; dateEncaissement: string; error: string }>(null)

  // État livraison
  const [deliveringParcelIds, setDeliveringParcelIds] = useState<Set<string>>(new Set())

  // État édition rapide
  const [quickEditModal, setQuickEditModal] = useState<{
    open: boolean
    parcel: any
    price: string
    portType: string
    codAmount: string
    /** RF mixte : codAmount = part chèque/traite, codCashAmount = part espèces */
    codMixed?: boolean
    codCashAmount?: string
    loading: boolean
    error: string
  }>({
    open: false,
    parcel: null,
    price: '',
    portType: '',
    codAmount: '',
    loading: false,
    error: ''
  })

  // Vérification du rôle
  const isChef = profile?.role === 'chef_agence'

  // Abonnement aux versements admin — de TOUTE l'agence (30/10/2026) : avant, seulement ceux créés par ce compte
  // (fromId) ; une régularisation d'écart enregistrée par l'admin (« reçu directement ») n'était pas vue par le chef
  // d'agence et son écart restait affiché.
  useEffect(() => {
    if (!profile?.city || !isChef) return

    const unsubscribe = subscribeAdminTransfersByCity(
      profile.city,
      setAdminTransfers,
      (err: any) => console.error('Erreur chargement versements:', err)
    )

    return () => unsubscribe()
  }, [profile?.city, isChef])

  // Abonnement aux retards de livraison
  useEffect(() => {
    if (!profile?.city) return

    const unsubscribe = subscribeDeliveryDelays(
      profile.city,
      setDeliveryDelays,
      (err: any) => console.error('Erreur chargement retards:', err)
    )

    return () => unsubscribe()
  }, [profile?.city])

  // ⚡ Recherche lancée 300 ms après la dernière frappe (avant : une recherche serveur PAR touche).
  // Champ vidé : réinitialisation immédiate.
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const effectiveSearchQuery = searchQuery.trim() === '' ? '' : debouncedSearchQuery

  // 🔍 Recherche serveur dans TOUTES les expéditions + Écoute temps réel
  useEffect(() => {
    const searchTerm = effectiveSearchQuery.trim()

    // Si champ complètement vide, tout réinitialiser
    if (searchTerm === '') {
      setSearchResults(null)
      setSearching(false)
      setStatusFilter('all')
      setIncludeArchived(true)
      // Ne PAS vider le cache ici - il persiste pour l'affichage normal
      return
    }

    // Vérifier si la recherche doit être déclenchée (5 chiffres ou 3 lettres min)
    if (!shouldTriggerSearch(searchTerm)) {
      setSearchResults(null)
      setSearching(false)
      setStatusFilter('all')
      // Ne PAS vider le cache ici - il persiste pour l'affichage normal
      return
    }

    // Nouvelle recherche déclenchée : vider le cache des modifications précédentes
    setModifiedParcels({})

    let unsubscribeRealtime: (() => void) | null = null
    // ⚠️ Recherche dépassée (terme changé entre-temps) : ses résultats arrivés APRÈS ceux de la
    // recherche plus récente les écrasaient. Désormais ignorés (ni résultats, ni écoute temps réel).
    let cancelled = false

    const performSearch = async () => {
      setSearching(true)
      try {
        console.log(`🔍 Recherche serveur: "${searchTerm}" (archives: ${includeArchived})`)
        // 🪶 parcelsLite (archives : version complète) : chaque résultat est aussitôt remplacé par sa version
        // COMPLÈTE via l'écoute temps réel ci-dessous ; Caisse Agence calcule déjà sur parcelsLite (journées passées).
        // limit : plafond des recherches par DÉBUT de nom — aucun plafond effectif, comme avant (l'option
        // était ignorée) : les chiffres affichés en mode recherche restent identiques.
        const results = await searchParcels(searchTerm, { limit: 50000, includeArchived, lite: true, wordSearch: true })
        if (cancelled) return
        // Filtrer par ville si chef d'agence (départ, arrivée ou ville de retour)
        const filtered = results.filter((p: any) =>
          p.destinationCity === profile?.city || p.originCity === profile?.city || p.returnToCity === profile?.city
        )
        setSearchResults(filtered)
        console.log(`✅ ${filtered.length} résultats trouvés`)

        // 🎯 Activer l'écoute temps réel pour ces parcels
        if (filtered.length > 0) {
          const parcelIds = filtered.map((p: any) => p.id)

          // Firestore limite à 30 IDs max par requête 'in'
          // On divise en batches de 30
          const batchSize = 30
          const batches: string[][] = []
          for (let i = 0; i < parcelIds.length; i += batchSize) {
            batches.push(parcelIds.slice(i, i + batchSize))
          }

          const unsubscribers: (() => void)[] = []

          batches.forEach((batch) => {
            const q = query(
              collection(db, 'parcels'),
              where(documentId(), 'in', batch)
            )

            const unsub = onSnapshot(q, (snapshot) => {
              const updatedParcels = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }))

              // Mettre à jour searchResults avec les nouvelles données
              setSearchResults((prev) => {
                if (!prev) return prev

                // Remplacer les parcels mis à jour
                const updated = prev.map((p: any) => {
                  const newData = updatedParcels.find((up: any) => up.id === p.id)
                  return newData || p
                })

                return updated
              })
            }, (error) => {
              console.error('❌ Erreur listener temps réel:', error)
            })

            unsubscribers.push(unsub)
          })

          // Combiner tous les unsubscribers
          unsubscribeRealtime = () => {
            unsubscribers.forEach(unsub => unsub())
          }

          console.log(`🔄 Écoute temps réel activée pour ${parcelIds.length} parcels`)
        }
      } catch (error) {
        if (cancelled) return
        console.error('❌ Erreur recherche:', error)
        setSearchResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }

    performSearch()

    // Nettoyage: arrêter l'écoute quand la recherche change
    return () => {
      cancelled = true
      if (unsubscribeRealtime) {
        unsubscribeRealtime()
        console.log('🔇 Écoute temps réel arrêtée')
      }
    }
  }, [effectiveSearchQuery, includeArchived, profile?.city])

  // Filtrer les résultats de recherche par statut de collecte
  const filteredSearchResults = useMemo(() => {
    if (!searchResults) return searchResults

    // 🔧 Merger extraCollectedParcels avec searchResults (éviter doublons)
    const extraParcels = Object.values(extraCollectedParcels).filter(
      (extra: any) => !searchResults.some((sr: any) => sr.id === extra.id)
    )
    const mergedResults = [...searchResults, ...extraParcels]

    const resultsWithModifications = mergedResults.map((p: any) => {
      const modified = modifiedParcels[p.id]
      return modified ? { ...p, ...modified } : p
    })

    if (statusFilter === 'all') return resultsWithModifications

    // 🔎 Lot 2 (25/10/2026) : MÊME règle de statut que les cartes (caisseStatusMatches, agencyCaisseRules) — avant, une
    // copie locale ignorait « pending » et « Arrivé en agence » dans « À collecter » (expéditions absentes en recherche).
    const now = new Date()
    return resultsWithModifications.filter((p: any) => caisseStatusMatches(p, statusFilter, p.deliveryDriverId || '', now))
  }, [searchResults, statusFilter, modifiedParcels])

  // 🏬 Colis arrivés en attente en gare (hors fenêtre de dates) + comptes « Livreur en gare »
  const garePending = useGarePending(profile?.city)
  const depotIds = useDepotIds(profile?.city)
  const agencyHolderIds = useAgencyHolderIds(profile?.city)
  const driverNames = useCityDriverNames(profile?.city)

  // ⚖️ TOUS les calculs de l'écran (source datée, soldes, livreurs, totaux, bilan, instances,
  // collectes par jour) : computeCaisseView (src/utils/agencyCaisseRules.ts), la MÊME fonction que
  // la page Chef d'exploitation — même agence + mêmes filtres ⇒ mêmes nombres sur les deux pages.
  const caisseView = useMemo(() => computeCaisseView({
    city: profile?.city || '',
    allDisplayParcels,
    garePending,
    datePreset, dateFrom, dateTo, operationalDay,
    driverFilter, statusFilter,
    searchResults,
    modifiedParcels,
    extraCollectedParcels,
    recentCollected,
    depotIds,
    deliveryDelays,
    // 💼 « À verser » = seulement les ports dus réellement reçus par le chef d'agence
    agencyHolderIds,
    driverNames,
  }), [allDisplayParcels, garePending, datePreset, dateFrom, dateTo, operationalDay, driverFilter, statusFilter,
    searchResults, modifiedParcels, extraCollectedParcels, recentCollected, depotIds, deliveryDelays, agencyHolderIds, driverNames, profile?.city])
  const {
    stats, soldeCaisseGlobal, soldeLivreur, portsCollectesForPrint, drivers, filteredDrivers,
    bilanJournee, instances, collectesParJour, codCollectesParJour, periodLabel, statusFilterLabel, nonRecuTotal,
  } = caisseView
  const filteredStats = caisseView.filteredStats

  // 💼 VERSEMENT À L'ADMIN PAR JOUR DE COLLECTE : la somme versée = ce qui a été collecté ce jour-là (même montant
  // que la carte « Collectes par jour »), ports des expéditions du jour ET des expéditions antérieures.
  const todayOpKey = getOperationalDayString(new Date())
  const [versementDay, setVersementDay] = useState<string>('')
  // 💼 Copie allégée (30/10/2026) : totaux par journée de l'agence, en temps réel (versementDays — même règle que les
  // cartes) ; le détail d'une journée n'est lu qu'à l'ouverture (loadVersementDay) → l'onglet Versements n'attend plus
  // le chargement des « Collectes par jour ».
  const vDays = useVersementDays(isChef ? profile?.city : null)
  const [copyDays, setCopyDays] = useState<Record<string, VersementDayDetail | 'loading'>>({})
  const ensureCopyDay = (k: string) => {
    if (!profile?.city) return
    setCopyDays(prev => ({ ...prev, [k]: 'loading' }))
    loadVersementDay(profile.city, k)
      .then(d => setCopyDays(prev => ({ ...prev, [k]: d })))
      .catch(e => { console.error('Détail de la journée', e); setCopyDays(prev => { const n = { ...prev }; delete n[k]; return n }) })
  }
  const dayKeys = useMemo(() => [...new Set([...collectesParJour.map(([k]) => k), ...(vDays || []).map(d => d.day)])], [collectesParJour, vDays])
  // Par défaut : la plus ancienne journée qui reste à verser, sinon aujourd'hui
  const defaultVersementDay = useMemo(() => {
    const pending = (vDays || []).filter(d => (d.aVerser || 0) > 0.009).map(d => d.day).sort()
    return pending[0] || (dayKeys.includes(todayOpKey) ? todayOpKey : dayKeys[0] || todayOpKey)
  }, [vDays, dayKeys, todayOpKey])
  const selectedVersementDay = versementDay && dayKeys.includes(versementDay) ? versementDay : defaultVersementDay
  // Journée à verser : expéditions « dans ma caisse » lues dans la copie allégée (à l'ouverture de « Verser »)
  const copySel = copyDays[selectedVersementDay]
  const verserDayData = useMemo(() => {
    if (!copySel || copySel === 'loading') return null
    const ids = copySel.contribs.filter(c => c.bucket === 'aVerser').map(c => c.id)
    return {
      aVerser: Math.round(copySel.contribs.filter(c => c.bucket === 'aVerser').reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100,
      aVerserIds: ids,
      parcels: copySel.parcels,
      nonRecu: copySel.contribs.filter(c => c.bucket === 'nonRecu').reduce((s, c) => s + (Number(c.amount) || 0), 0),
    }
  }, [copySel])
  const fmtKeyFr = (k: string) => k.split('-').reverse().join('/')
  const verserJour = useMemo(() => {
    const ids = new Set(verserDayData?.aVerserIds || [])
    let duJour = 0
    const anciens = new Map<string, number>()
    ;(verserDayData?.parcels || []).forEach((p: any) => {
      if (!ids.has(p.id)) return
      const m = safeParseAmount(p.price)
      const d = toDateSafe(p.createdAt)
      const expDay = d ? getOperationalDayString(d) : ''
      if (expDay === selectedVersementDay) duJour += m
      else anciens.set(expDay || '?', (anciens.get(expDay || '?') || 0) + m)
    })
    return {
      days: collectesParJour.map(([k, d]) => ({ key: k, label: fmtKeyFr(k), aVerser: d.aVerser || 0 })),
      selected: selectedVersementDay,
      onSelect: setVersementDay,
      montant: verserDayData?.aVerser || 0,
      duJour,
      anciens: [...anciens.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      totalNonVerse: soldeCaisseGlobal,
      nonRecu: verserDayData?.nonRecu || 0,
      totalNonRecu: nonRecuTotal,
    }
  }, [verserDayData, selectedVersementDay, collectesParJour, soldeCaisseGlobal, nonRecuTotal])

  // 💼 Versement EXCEPTIONNEL (une seule fois) fixé par l'admin : versementExceptions/{ville} = { dayKey, amount, used }
  const [versementException, setVersementException] = useState<any>(null)
  useEffect(() => {
    if (!profile?.city) return
    return onSnapshot(fsDoc(db, 'versementExceptions', profile.city),
      s => setVersementException(s.exists() && !s.data()?.used ? { id: s.id, ...s.data() } : null),
      () => setVersementException(null))
  }, [profile?.city])
  /** Exception active pour la journée choisie */
  const activeException = versementException && versementException.dayKey === selectedVersementDay ? versementException : null

  // 💼 Versement partiel = TOUJOURS des expéditions entières (les plus anciennes d'abord) : jamais d'écart non rattaché
  const versementSplit = useMemo(() => {
    const ids = new Set(verserDayData?.aVerserIds || [])
    const list = (verserDayData?.parcels || []).filter((p: any) => ids.has(p.id))
      .sort((a: any, b: any) => (toDateSafe(a.createdAt)?.getTime() || 0) - (toDateSafe(b.createdAt)?.getTime() || 0))
    const total = Math.round(list.reduce((s: number, p: any) => s + safeParseAmount(p.price), 0) * 100) / 100
    const typed = versementForm.amount === '' ? total : safeParseAmount(versementForm.amount)
    let lower = 0
    const lowerIds: string[] = []
    let next: any = null
    for (const p of list) {
      const m = safeParseAmount(p.price)
      if (lower + m > typed + 0.001) { next = p; break }
      lower += m; lowerIds.push(p.id)
    }
    lower = Math.round(lower * 100) / 100
    const upper = next ? Math.round((lower + safeParseAmount(next.price)) * 100) / 100 : lower
    return { total, typed: Math.round(typed * 100) / 100, lower, lowerIds, upper, upperIds: next ? [...lowerIds, next.id] : lowerIds, exact: Math.abs(typed - lower) < 0.005 }
  }, [verserDayData, versementForm.amount])

  // Toggle expansion d'un livreur
  const toggleDriver = (driverId: string) => {
    const newSet = new Set(expandedDrivers)
    if (newSet.has(driverId)) {
      newSet.delete(driverId)
    } else {
      newSet.add(driverId)
    }
    setExpandedDrivers(newSet)
  }

  // Ouvrir modal retard
  const openDelayModal = (parcel: any, driver: any) => {
    // Vérifier si un retard existe déjà pour ce colis
    const existingDelay = deliveryDelays.find((d: any) =>
      d.parcelId === parcel.id && !d.resolvedAt
    )

    setDelayModal({ parcel, driver, existingDelay })
    setDelayForm({
      reason: existingDelay?.reason || '',
      reasonDetail: existingDelay?.reasonDetail || '',
    })
  }

  // Enregistrer retard
  const handleSaveDelay = async () => {
    if (!delayModal || !delayForm.reason) {
      alert('⚠️ Veuillez sélectionner une raison')
      return
    }

    setSavingDelay(true)
    try {
      if (delayModal.existingDelay) {
        // Mettre à jour le retard existant
        await updateDeliveryDelay(delayModal.existingDelay.id, {
          reason: delayForm.reason,
          reasonDetail: delayForm.reasonDetail,
        })
      } else {
        // Créer un nouveau retard
        await createDeliveryDelay({
          parcelId: delayModal.parcel.id,
          senderNic: delayModal.parcel.senderNic || delayModal.parcel.sender?.nic || delayModal.parcel.trackingId || 'N/A',
          driverId: delayModal.driver?.id || delayModal.parcel.deliveryDriverId || '',
          driverName: delayModal.driver?.name || '—',
          city: profile?.city || '',
          reason: delayForm.reason,
          reasonDetail: delayForm.reasonDetail,
          createdBy: profile?.name || '',
          createdById: uid || null,
        })
      }

      setDelayModal(null)
      setDelayForm({ reason: '', reasonDetail: '' })
      alert('✅ Retard enregistré!')
    } catch (err: any) {
      console.error('Erreur enregistrement retard:', err)
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setSavingDelay(false)
    }
  }

  // Résoudre un retard
  const handleResolveDelay = async (delayId: string) => {
    if (!confirm('Marquer ce retard comme résolu ?')) return

    try {
      await updateDeliveryDelay(delayId, {
        resolvedAt: new Date().toISOString(),
        resolvedBy: profile?.name || '',
        resolvedById: uid || null,
      })
      alert('✅ Retard résolu!')
    } catch (err: any) {
      console.error('Erreur résolution retard:', err)
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  // Annuler/Supprimer un retard signalé par erreur
  const handleDeleteDelay = async (delayId: string) => {
    if (!confirm('⚠️ Annuler ce signalement de retard ?\n\nCette action supprimera complètement le retard.')) return

    try {
      await deleteDeliveryDelay(delayId)
      alert('✅ Signalement de retard annulé!')
    } catch (err: any) {
      console.error('Erreur suppression retard:', err)
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  // Collecter un port dû
  // 🆕 Réception des ports payés ramassés par le livreur
  // 🏢 Chef d'agence EN REMPLACEMENT du chef d'exploitation (absent) : collecte / réception des ports
  // marquée à son nom (rôle « chef_agence ») et écrite directement en caisse (src/firebase/chefPortReception.ts)
  const chefActor = { id: uid || '', name: profile?.name || '', city: profile?.city || '' }
  const runChefPort = async (parcel: any, question: string, fn: () => Promise<Record<string, any>>) => {
    if (!chefActor.id || !chefActor.name) { alert("❌ Impossible d'identifier le chef d'agence connecté. Reconnectez-vous."); return }
    if (!confirm(question)) return
    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const { linkedError, ...fields } = await fn()
      if (linkedError) alert(`⚠️ ${nicOf(parcel)} : ${linkedError}`)
      setModifiedParcels(prev => ({ ...prev, [parcel.id]: { ...(prev[parcel.id] || {}), ...fields } }))
      updateParcelOptimistic(parcel.id, fields)
      if (searchResults) setSearchResults(prev => prev ? prev.map(p => p.id === parcel.id ? { ...p, ...fields } : p) : prev)
    } catch (err: any) {
      console.error('❌ [chef d\'agence ports]', err)
      alert(`❌ Erreur: ${err?.message || err}`)
    } finally {
      setCollectingPortIds(prev => { const s = new Set(prev); s.delete(parcel.id); return s })
    }
  }
  const nicOf = (parcel: any) => parcel.senderNic || parcel.trackingId
  const handleReceivePortPaye = (parcel: any) => runChefPort(parcel,
    `Recevoir vous-même le port payé à ramasser de ${fmtAmt(parcel.price)} DH (${nicOf(parcel)}), en l'absence du chef d'exploitation ?\n\nIl sera marqué reçu par vous (chef d'agence) et enregistré en caisse.`,
    () => chefReceivePortPaye(parcel, chefActor))

  // 🆕 Annuler la réception d'un port payé (pour corriger les erreurs)
  const handleUncollectPortPaye = async (parcel: any) => {
    // Reçu par la validation d'un envoi du chef d'exploitation : déjà écrit en caisse, non annulable ici
    if (parcel.valeursEnvoiId) { alert("Port payé reçu par un envoi validé du chef d'exploitation : annulation impossible ici."); return }
    // Reçu par moi en remplacement du chef d'exploitation : entrée de caisse supprimée
    if (parcel.portPayeExpReceivedRole === 'chef_agence') {
      return runChefPort(parcel, `Annuler votre réception du port payé de ${fmtAmt(parcel.price)} DH (${nicOf(parcel)}) ?\n\nL'entrée de caisse sera supprimée.`,
        () => chefCancelPortPaye(parcel, chefActor))
    }
    if (!confirm(`Annuler la réception du port payé de ${fmtAmt(parcel.price)} DH pour l'expédition ${parcel.senderNic || parcel.trackingId} ?\n\nLe port sera remis en état « À ramasser » (à recevoir).`)) {
      return
    }

    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const updatedData = {
        portStatus: 'collected',  // Remettre en état ramassé
        portReceivedBy: null,
        portReceivedById: null,
        portReceivedAt: null,
      }

      setModifiedParcels(prev => ({ ...prev, [parcel.id]: updatedData }))
      updateParcelOptimistic(parcel.id, updatedData)

      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p => p.id === parcel.id ? { ...p, ...updatedData } : p) : prev
        )
      }

      await updateParcel(parcel.id, updatedData)
    } catch (err: any) {
      console.error('❌ [handleUncollectPortPaye] ERREUR:', err)
      alert(`❌ Erreur: ${err.message}`)

      setModifiedParcels(prev => {
        const updated = { ...prev }
        delete updated[parcel.id]
        return updated
      })

      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p => p.id === parcel.id ? parcel : p) : prev
        )
      }
    } finally {
      setCollectingPortIds(prev => {
        const updated = new Set(prev)
        updated.delete(parcel.id)
        return updated
      })
    }
  }
  // Port dû : collecter (pas encore encaissé) ou recevoir (encaissé par le livreur / la gare), en remplacement
  // du chef d'exploitation — marqué à mon nom et écrit en caisse
  // 🔗 Port dû espèces + COD 100 % espèces : collectés / reçus ENSEMBLE (même règle que le chef d'exploitation)
  const linkedPair = (parcel: any) => parcel.portType === 'port_du' && !parcel.portPayeMethod
    && (parseFloat(parcel.codAmount) || 0) > 0 && !parcel.codMixed
    && !['cheque', 'traite', 'cod_cheque', 'cod_traite', 'bon_livraison', 'retour_bl'].includes(String(parcel.codPaymentType || parcel.serviceType || '').toLowerCase())
  const linkedMsg = (parcel: any) => (linkedPair(parcel)
    ? `\n\n🔗 Le port dû (${fmtAmt(parcel.price)} DH) et le RETOUR FOND espèces (${fmtAmt(parcel.codAmount)} DH) seront collectés ensemble.` : '')
  const autoDeliverMsg = (parcel: any) => (parcel.status === 'En cours de livraison' || parcel.status === 'Arrivé en agence'
    ? `\n\n📦 Encore « ${parcel.status} » : elle sera marquée « Livré » automatiquement.`
    : parcel.status !== 'Livré' ? `\n\n⛔ Statut « ${parcel.status || '—'} » : une collecte sera refusée (l'expédition doit être livrée ou en cours de livraison).` : '')
  const handleCollectPort = (parcel: any) => runChefPort(parcel,
    `${parcel.portStatus === 'collected' ? 'Recevoir' : 'Collecter'} vous-même le port dû de ${fmtAmt(parcel.price)} DH (${nicOf(parcel)}), en l'absence du chef d'exploitation ?\n\nIl sera marqué reçu par vous (chef d'agence) et enregistré en caisse.`
      + autoDeliverMsg(parcel) + linkedMsg(parcel),
    () => chefReceivePortDu(parcel, chefActor))
  // 📋 Port dû payé PAR CHÈQUE (recherche, comme le chef d'exploitation) : détails du chèque, pas d'entrée de caisse espèces
  const openPortCheque = (parcel: any) => setPortChequeModal({ parcel, banque: '', numero: '', dateEncaissement: new Date().toISOString().slice(0, 10), error: '' })
  const submitPortCheque = () => {
    if (!portChequeModal) return
    const { parcel, banque, numero, dateEncaissement } = portChequeModal
    if (!banque.trim() || !numero.trim()) { setPortChequeModal({ ...portChequeModal, error: 'Banque et numéro du chèque obligatoires.' }); return }
    setPortChequeModal(null)
    return runChefPort(parcel,
      `Collecter vous-même le port dû de ${fmtAmt(parcel.price)} DH (${nicOf(parcel)}) payé PAR CHÈQUE (${banque.trim()} n° ${numero.trim()}) ?\n\nLe chèque suit le circuit des chèques (onglet « Ports dû chèque ») : rien n'entre en caisse espèces.`
        + autoDeliverMsg(parcel) + linkedMsg(parcel),
      () => chefReceivePortDu(parcel, chefActor, true, { banque: banque.trim(), numero: numero.trim(), dateEncaissement }))
  }
  // 💰 COD (RETOUR FOND) : collecter (pas encore encaissé) ou recevoir (encaissé par le livreur / la gare), en
  // remplacement du chef d'exploitation — marqué à mon nom, part espèces écrite en caisse (chefReceiveCod)
  const handleCollectCod = (parcel: any) => runChefPort(parcel,
    `${parcel.codStatus === 'collected' ? 'Recevoir' : 'Collecter'} vous-même le RETOUR FOND de ${fmtAmt(parcel.codAmount)} DH (${nicOf(parcel)}), en l'absence du chef d'exploitation ?`
      + autoDeliverMsg(parcel)
      + '\n\nIl sera marqué reçu par vous (chef d\'agence) et la part espèces enregistrée en caisse.'
      + linkedMsg(parcel),
    () => chefReceiveCod(parcel, chefActor))
  // ✂️ Collecte « chèque + espèces » : part espèces saisie (total inchangé) → en caisse ; le reste = chèque / traite
  const handleCollectCodSplit = (parcel: any) => {
    const total = parseFloat(parcel.codAmount) || 0
    const docLabel = String(parcel.serviceType) === 'traite' ? 'traite' : 'chèque'
    const raw = window.prompt(`${nicOf(parcel)} — RETOUR FOND ${docLabel} de ${fmtAmt(total)} DH.

Montant payé EN ESPÈCES par le destinataire (DH) ?
Le reste sera le ${docLabel} (total inchangé).`)
    if (raw === null) return
    const cash = Number.parseFloat(String(raw).replace(',', '.'))
    if (!Number.isFinite(cash) || cash <= 0 || cash >= total) { alert(`Montant espèces invalide : entre 0 et ${fmtAmt(total)} DH (exclus).`); return }
    return runChefPort(parcel,
      `Collecter vous-même ${nicOf(parcel)} :
  💵 Espèces : ${fmtAmt(cash)} DH (en caisse)
  📋 ${docLabel === 'traite' ? 'Traite' : 'Chèque'} : ${fmtAmt(Math.round((total - cash) * 100) / 100)} DH (encaisseur central)
  = Total ${fmtAmt(total)} DH`
        + autoDeliverMsg(parcel),
      () => chefReceiveCod(parcel, chefActor, true, cash))
  }
  const handleCancelCod = (parcel: any) => runChefPort(parcel,
    `Annuler votre ${parcel.codCollectedById === uid ? 'collecte' : 'réception'} du RETOUR FOND de ${fmtAmt(parcel.codAmount)} DH (${nicOf(parcel)}) ?\n\nL'entrée de caisse sera supprimée.`
      + (linkedPair(parcel) && parcel.portExpReceivedRole === 'chef_agence' && parcel.portChefReceivedById === uid ? `\n\n🔗 Le port dû lié (${fmtAmt(parcel.price)} DH) sera annulé aussi.` : ''),
    () => chefCancelCod(parcel, chefActor))
  /** Action COD sous le montant (tableau des livreurs) : Collecter / Recevoir / Reçu (+ Annuler si reçu par moi). */
  // 🚚 Expédition livrée par MON agence (destination = ma ville ; une locale aussi) : seules celles-ci ont « Livrer »
  // et la collecte du COD — une expédition partie vers une autre ville n'a ici que son port payé du guichet (23/10/2026)
  const isDestinationHere = (p: any) => (p?.destinationCity || p?.receiver?.city) === profile?.city
  // 🏬 Port payé encaissé AU GUICHET (pas par un livreur de ramassage) : « à recevoir », pas « à ramasser »
  const isGuichetPP = (p: any) => !p?.pickupDriverId && isRamasseGuichet(p, profile?.city || '')
  const ppLabel = (p: any) => (isGuichetPP(p) ? 'PP guichet' : 'PP à ramasser')

  const codActionCell = (parcel: any) => {
    if (!((parseFloat(parcel.codAmount) || 0) > 0) || parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné' || isCodMoneyBeforeStart(parcel)) return null
    // 🚚 COD encaissé à la DESTINATION : rien à collecter / recevoir ici pour une expédition partie vers une autre ville
    if (!isDestinationHere(parcel)) return null
    const busy = collectingPortIds.has(parcel.id)
    const st = parcel.codStatus
    if (st === 'remis' || st === 'regle') {
      const mine = parcel.codExpReceivedRole === 'chef_agence' && parcel.codChefReceivedById === uid
      return (
        <div className="mt-1 flex flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
            <Check className="w-3 h-3" />
            {parcel.codExpReceivedRole === 'chef_agence' ? `Reçu · chef d'agence ${parcel.codChefReceivedBy || ''}` : "Reçu (envoi chef d'exploitation)"}
          </span>
          {mine && st === 'remis' && !parcel.valeursEnvoiId && (
            <button onClick={() => handleCancelCod(parcel)} disabled={busy}
              className="text-[11px] px-2 py-0.5 rounded-lg font-medium transition disabled:opacity-50 bg-red-100 text-red-700 hover:bg-red-200">
              {busy ? '...' : 'Annuler'}
            </button>
          )}
        </div>
      )
    }
    if (st === 'collected' && parcel.codExpReceivedAt && parcel.codExpReceivedRole !== 'chef_agence') {
      return <div className="mt-1 text-[10px] text-indigo-700 font-semibold">Reçu chef d'exploitation{parcel.codExpReceivedBy ? ` · ${parcel.codExpReceivedBy}` : ''}</div>
    }
    return (
      <div className="mt-1 flex flex-col items-end gap-0.5">
        {st === 'collected' && <span className="text-[10px] text-gray-500">encaissé par {parcel.codCollectedBy || 'le livreur'}</span>}
        <button onClick={() => handleCollectCod(parcel)} disabled={busy}
          className="text-[11px] px-2 py-0.5 rounded-lg font-medium transition disabled:opacity-50 bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
          {busy ? '...' : st === 'collected' ? 'Recevoir' : 'Collecter'}
        </button>
        {/* ✂️ Le destinataire a payé une partie en espèces : collecte « chèque + espèces » */}
        {(!st || st === 'pending') && !isMixedCod(parcel) && ['cheque', 'traite'].includes(String(parcel.serviceType || '').toLowerCase()) && (
          <button onClick={() => handleCollectCodSplit(parcel)} disabled={busy} title="Le destinataire a payé une partie en chèque / traite et le reste en espèces"
            className="text-[11px] px-2 py-0.5 rounded-lg font-medium transition disabled:opacity-50 bg-amber-100 text-amber-800 hover:bg-amber-200">
            ✂️ {String(parcel.serviceType) === 'traite' ? 'Traite' : 'Chèque'} + espèces
          </button>
        )}
      </div>
    )
  }
  /** Port dû encaissé mais pas encore reçu (ni par moi, ni via un envoi) → « Recevoir ». */
  // ⚠️ Déjà reçu par le chef d'exploitation (il l'a mis ou le mettra dans son envoi) : plus « à recevoir » ici —
  // sinon le même port entrait deux fois en caisse (réception directe puis validation de l'envoi)
  const portExpReceivedByOther = (parcel: any) => !!parcel.portExpReceivedAt && parcel.portExpReceivedRole !== 'chef_agence'
  const portPayeExpReceived = (parcel: any) => !!parcel.portPayeExpReceivedAt && parcel.portPayeExpReceivedRole !== 'chef_agence'
  const portDuToReceive = (parcel: any) => (parcel.portStatus === 'collected') && !parcel.portChefReceivedAt && parcel.portCollectedById !== uid && !portExpReceivedByOther(parcel)

  // Annuler la collecte d'un port dû
  const handleUncollectPort = async (parcel: any) => {
    // Reçu par moi en remplacement du chef d'exploitation : entrée de caisse supprimée
    if (parcel.portExpReceivedRole === 'chef_agence' && parcel.portChefReceivedById === uid) {
      return runChefPort(parcel, `Annuler votre ${parcel.portCollectedById === uid ? 'collecte' : 'réception'} du port dû de ${fmtAmt(parcel.price)} DH (${nicOf(parcel)}) ?\n\nL'entrée de caisse sera supprimée.`
        + (linkedPair(parcel) && parcel.codStatus === 'remis' && parcel.codExpReceivedRole === 'chef_agence' && parcel.codChefReceivedById === uid ? `\n\n🔗 Le RETOUR FOND espèces lié (${fmtAmt(parcel.codAmount)} DH) sera annulé aussi.` : ''),
        () => chefCancelPortDu(parcel, chefActor))
    }
    if (parcel.portChefReceivedAt) { alert("Port dû reçu via un envoi du chef d'exploitation ou par un autre chef : annulation impossible ici."); return }
    // 💸 Seule une ancienne collecte faite par moi peut être annulée ici ; celles des livreurs / du chef
    // d'exploitation se gèrent dans la Collecte du soir (circuit livreur → chef d'exploitation → chef d'agence)
    if (parcel.portCollectedById && parcel.portCollectedById !== uid) { alert(VIA_EXPLOITATION_MSG); return }
    if (!confirm(`Annuler la collecte du port de ${fmtAmt(parcel.price)} DH pour l'expédition ${parcel.senderNic || parcel.trackingId} ?`)) {
      return
    }

    console.log('🔵 [handleUncollectPort] DÉBUT:', {
      parcelId: parcel.id,
      nic: parcel.senderNic || parcel.trackingId,
      currentPortStatus: parcel.portStatus
    })

    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const updatedData = {
        portStatus: null,
        portCollectedBy: null,
        portCollectedById: null,
        portCollectedAt: null,
        portDuReceivedMethod: null,
      }

      console.log('🟢 [handleUncollectPort] ANNULATION avec:', updatedData)

      // SOLUTION SIMPLIFIÉE : Supprimer du cache pour revenir à l'état Firebase
      setModifiedParcels(prev => {
        const updated = { ...prev }
        delete updated[parcel.id]
        console.log('🟡 [handleUncollectPort] modifiedParcels nettoyé:', {
          parcelId: parcel.id,
          totalModified: Object.keys(updated).length
        })
        return updated
      })

      // Mise à jour optimiste pour le contexte
      updateParcelOptimistic(parcel.id, updatedData)

      // Mise à jour de searchResults si en mode recherche
      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, ...updatedData } : p
          ) : prev
        )
        console.log('🔵 [handleUncollectPort] searchResults mis à jour')
      }

      console.log('🟢 [handleUncollectPort] Appel Firebase uncollectPortDu...')
      await uncollectPortDu(parcel.id, !!parcel.isArchived)
      console.log('✅ [handleUncollectPort] Firebase OK')
      // ↩️ Livraison mise automatiquement par cette collecte : annulée aussi (statut + date de livraison)
      const undone = !parcel.isArchived ? await undoAutoDeliveryAfterUncollect(parcel.id, profile?.name || '').catch(() => null) : null
      if (undone) {
        updateParcelOptimistic(parcel.id, undone)
        if (searchResults) setSearchResults(prev => prev ? prev.map(p => p.id === parcel.id ? { ...p, ...undone } : p) : prev)
      }
    } catch (err: any) {
      console.error('❌ [handleUncollectPort] ERREUR:', err)
      alert(`❌ Erreur: ${err.message}`)

      // Restaurer l'état en cas d'erreur
      const restoredData = {
        portStatus: 'collected',
        portCollectedBy: parcel.portCollectedBy,
        portCollectedById: parcel.portCollectedById,
        portCollectedAt: parcel.portCollectedAt,
        portDuReceivedMethod: parcel.portDuReceivedMethod,
      }

      setModifiedParcels(prev => ({ ...prev, [parcel.id]: restoredData }))

      updateParcelOptimistic(parcel.id, restoredData)

      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, ...restoredData } : p
          ) : prev
        )
      }
    } finally {
      setCollectingPortIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(parcel.id)
        return newSet
      })
      console.log('🏁 [handleUncollectPort] FIN')
    }
  }

  // Marquer une expédition comme livrée
  const handleMarkAsDelivered = async (parcel: any) => {
    const blocked = deliveryCityBlock(profile?.role, profile?.city, parcel)
    if (blocked) { alert(`❌ ${blocked}`); return }
    if (!confirm(`Confirmer la livraison de l'expédition ${parcel.senderNic || parcel.trackingId} ?`)) {
      return
    }

    console.log('🔵 [handleMarkAsDelivered] DÉBUT:', {
      parcelId: parcel.id,
      nic: parcel.senderNic || parcel.trackingId,
      currentStatus: parcel.status
    })

    setDeliveringParcelIds(prev => new Set(prev).add(parcel.id))
    try {
      // ⚠️ deliveredAt doit être une chaîne ISO (comme partout ailleurs dans l'app), pas un
      // objet Date natif : Firestore convertit silencieusement un Date en Timestamp à
      // l'écriture, ce qui cassait l'affichage ("Invalid Date") des pages qui font
      // new Date(parcel.deliveredAt) en supposant une chaîne.
      const now = new Date().toISOString()
      const updatedData = {
        status: 'Livré',
        deliveredAt: now,
        deliveredBy: profile?.name || '',
        deliveredById: uid || '',
      }

      console.log('🟢 [handleMarkAsDelivered] MISE À JOUR avec:', updatedData)

      // SOLUTION SIMPLIFIÉE : Une seule source de vérité via modifiedParcels
      setModifiedParcels(prev => {
        const updated = { ...prev, [parcel.id]: updatedData }
        console.log('🟡 [handleMarkAsDelivered] modifiedParcels mis à jour:', {
          parcelId: parcel.id,
          totalModified: Object.keys(updated).length
        })
        return updated
      })

      // Mise à jour optimiste pour le contexte
      updateParcelOptimistic(parcel.id, updatedData)

      // Mise à jour de searchResults si en mode recherche
      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, ...updatedData } : p
          ) : prev
        )
        console.log('🔵 [handleMarkAsDelivered] searchResults mis à jour')
      }

      console.log('🟢 [handleMarkAsDelivered] Appel Firebase updateParcel...')
      // Trace dans l'historique (qui a livré, quand) — hors mise à jour optimiste : le listener apporte la valeur finale
      await updateParcel(parcel.id, {
        ...updatedData,
        history: arrayUnion({ status: 'Livré', timestamp: now, note: `Marqué livré par ${profile?.name || 'le chef d\'agence'} (caisse chef d'agence)` }),
      })
      console.log('✅ [handleMarkAsDelivered] Firebase OK')
    } catch (err: any) {
      console.error('❌ [handleMarkAsDelivered] ERREUR:', err)
      alert(`❌ Erreur lors de la livraison: ${err.message}`)

      // Annuler TOUTES les mises à jour en cas d'erreur
      setModifiedParcels(prev => {
        const updated = { ...prev }
        delete updated[parcel.id]
        return updated
      })

      updateParcelOptimistic(parcel.id, {
        status: parcel.status,
        deliveredAt: parcel.deliveredAt,
      })

      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, status: parcel.status } : p
          ) : prev
        )
      }
    } finally {
      setDeliveringParcelIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(parcel.id)
        return newSet
      })
      console.log('🏁 [handleMarkAsDelivered] FIN')
    }
  }

  // Envoyer versement à l'admin
  const handleSendVersement = async () => {
    // 💼 Versement PAR JOUR DE COLLECTE : montant choisi par le chef d'agence (par défaut, le total de la journée),
    // jamais plus que ce qui reste à verser pour cette journée
    // ⭐ Exception autorisée par l'admin (une seule fois) : montant imposé, toutes les expéditions de la journée marquées
    if (activeException) {
      const exAmount = Math.round((Number(activeException.amount) || 0) * 100) / 100
      const exIds = verserDayData?.aVerserIds || []
      if (!(exAmount > 0)) return
      if (!confirm(`Créer le versement EXCEPTIONNEL de ${fmtAmt(exAmount)} DH vers l'admin ?\n\nMontant autorisé une seule fois par l'admin pour les collectes du ${fmtKeyFr(selectedVersementDay)} (montant calculé : ${fmtAmt(verserDayData?.aVerser || 0)} DH).\n${exIds.length} expédition(s) seront marquées versées. Ensuite, le calcul redevient automatique.`)) return
      setSendingVersement(true)
      try {
        const transferId = await createAdminTransferFromAgent({
          fromId: uid, fromName: profile?.name || '', city: profile?.city, amount: exAmount,
          note: `Collectes du ${fmtKeyFr(selectedVersementDay)} — versement exceptionnel autorisé par l'admin (calculé ${fmtAmt(verserDayData?.aVerser || 0)} DH)${versementForm.note ? ` — ${versementForm.note}` : ''}`,
          codParcelIds: exIds,
          kind: 'port', // ports collectés de la journée : seule la marque « port versé » (jamais « COD versé »)
          exceptionCity: profile?.city, // 🔒 exception marquée « utilisée » dans la même transaction que le versement
        })
        void transferId
        setVersementForm({ amount: '', note: '' })
        setVerserOpen(false)
        alert('✅ Versement exceptionnel créé ! En attente de validation admin.')
      } catch (err: any) {
        alert(`❌ Erreur: ${err.message}`)
      } finally {
        setSendingVersement(false)
      }
      return
    }

    const dayTotal = Math.round((verserDayData?.aVerser || 0) * 100) / 100
    const typed = versementForm.amount === '' ? dayTotal : safeParseAmount(versementForm.amount)
    const amount = Math.round(typed * 100) / 100
    void portsCollectesForPrint
    if (dayTotal <= 0) { alert(`⚠️ Rien à verser pour les collectes du ${fmtKeyFr(selectedVersementDay)}.`); return }
    if (!(amount > 0)) { alert('⚠️ Veuillez entrer un montant valide.'); return }
    if (amount > dayTotal + 0.001) { alert(`⚠️ Le montant ne peut pas dépasser ce qui reste à verser pour le ${fmtKeyFr(selectedVersementDay)} (${fmtAmt(dayTotal)} DH).`); return }

    // Expéditions ENTIÈRES uniquement (les plus anciennes d'abord) : le montant doit tomber pile
    if (!versementSplit.exact) {
      alert(`⚠️ ${fmtAmt(amount)} DH ne correspond pas à des expéditions entières.\n\nChoisissez ${fmtAmt(versementSplit.lower)} DH ou ${fmtAmt(versementSplit.upper)} DH (boutons sous le montant).`)
      return
    }
    const portsCollectesIds = versementSplit.lowerIds
    const covered = versementSplit.lower
    const partial = amount < dayTotal - 0.001

    if (!confirm(`Créer un versement de ${fmtAmt(amount)} DH vers l'admin ?\n\nCollectes du ${fmtKeyFr(selectedVersementDay)} (total à verser : ${fmtAmt(dayTotal)} DH)`
      + (partial ? `\n⚠️ Versement PARTIEL : ${portsCollectesIds.length} expédition(s) (${fmtAmt(covered)} DH) seront marquées versées ; il restera ${fmtAmt(dayTotal - covered)} DH à verser pour cette journée.` : `\n${portsCollectesIds.length} expédition(s) seront marquées versées.`))) {
      return
    }

    setSendingVersement(true)
    try {
      await createAdminTransferFromAgent({
        fromId: uid,
        fromName: profile?.name || '',
        city: profile?.city,
        amount,
        note: `Collectes du ${fmtKeyFr(selectedVersementDay)}${partial ? ` (partiel ${fmtAmt(amount)} / ${fmtAmt(dayTotal)} DH)` : ''}${versementForm.note ? ` — ${versementForm.note}` : ''}`,
        codParcelIds: portsCollectesIds, // IDs des ports collectés à marquer comme versés
        kind: 'port', // seule la marque « port versé » (avant : « COD versé » aussi, sur des COD non encaissés)
      })

      setVersementForm({ amount: '', note: '' })
      setVerserOpen(false)
      alert('✅ Versement créé! En attente de validation admin.')
    } catch (err: any) {
      console.error('Erreur création versement:', err)
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setSendingVersement(false)
    }
  }

  // Imprimer les expéditions d'un versement
  const handlePrintVersement = async (transfer: any) => {
    if (!transfer.codParcelIds || transfer.codParcelIds.length === 0) {
      alert('⚠️ Aucune expédition associée à ce versement')
      return
    }

    try {
      // Récupérer les expéditions depuis Firestore
      const parcelIds = transfer.codParcelIds
      const parcels: any[] = []

      // Firestore limite à 30 éléments par requête "in", donc on divise en chunks
      const chunkSize = 30
      for (let i = 0; i < parcelIds.length; i += chunkSize) {
        const chunk = parcelIds.slice(i, i + chunkSize)
        const q = query(collection(db, 'parcels'), where(documentId(), 'in', chunk))
        const snapshot = await new Promise<any>((resolve) => {
          const unsubscribe = onSnapshot(q, (snap) => {
            unsubscribe()
            resolve(snap)
          })
        })
        snapshot.forEach((doc: any) => {
          parcels.push({ id: doc.id, ...doc.data() })
        })
      }

      if (parcels.length === 0) {
        alert('⚠️ Aucune expédition trouvée')
        return
      }

      // Imprimer les expéditions
      printVersementParcels(parcels, transfer, profile)
    } catch (err: any) {
      console.error('Erreur récupération expéditions:', err)
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  // Rendu conditionnel si pas chef d'agence
  if (!isChef) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">
            Cette section est réservée aux chefs d'agence
          </p>
        </div>
      </div>
    )
  }

  // 📅 Journées d'opération du filtre (AAAA-MM-JJ) : « Personnalisé / Jour » = dates saisies, sinon bornes du préréglage
  const filterKeys = (() => {
    const bb = caisseDateBounds(datePreset, dateFrom, dateTo, operationalDay || undefined)
    const fromKey = datePreset === 'all' ? null
      : (datePreset === 'custom' || datePreset === 'day') ? (dateFrom || null)
      : bb?.start ? getOperationalDayString(new Date(bb.start.getTime() + 2 * 3600e3)) : null
    const toKey = datePreset === 'custom' ? (dateTo || todayOpKey) : datePreset === 'day' ? (dateFrom || null)
      : bb ? getOperationalDayString(bb.end) : null
    return { fromKey, toKey: fromKey ? toKey : null }
  })()

  // 💼 « À verser » à l'admin — même présentation que la Collecte du soir : argent DANS MA CAISSE (ports dus reçus ou
  // encaissés par l'agence, ports payés ramassés reçus), pas encore versé à l'admin, encaissé / reçu pendant la
  // période du filtre ; deux lignes : expéditions de la période / expéditions plus anciennes.
  const city = profile?.city || ''
  const inKeys = (k: string | null) => !filterKeys.fromKey || (!!k && k >= filterKeys.fromKey && k <= (filterKeys.toKey || filterKeys.fromKey))
  const agenceAVerserDetail = (() => {
    const seen = new Set<string>()
    let pN = 0, pM = 0, oN = 0, oM = 0
    for (const p of [...caisseView.collectSource, ...caisseView.dataSource]) {
      if (!p?.id || seen.has(p.id)) continue
      seen.add(p.id)
      if (isAdminTransferred(p)) continue
      const amount = safeParseAmount(p.price)
      if (amount <= 0) continue
      let dates: any[] = []
      if (p.portType === 'port_du' && !p.portPayeMethod && p.destinationCity === city && (p.portStatus === 'collected' || p.portStatus === 'received')
        && !isPortDuMoneyBeforeStart(p) && p.portDuReceivedMethod !== 'cheque' && isPortDuHeldByAgency(p, agencyHolderIds || new Set())) {
        dates = [p.portCollectedAt || p.portExpReceivedAt || p.portChefReceivedAt]
      } else if (isRamasseGuichet(p, city) && p.portStatus === 'received') {
        dates = [p.portCollectedAt || p.portPayeExpReceivedAt || p.portReceivedAt]
      } else continue
      if (filterKeys.fromKey && !dates.some(d => inKeys(opDayKeyOf(d)))) continue
      const expKey = opDayKeyOf(p.workDate ? `${p.workDate}T12:00:00` : p.createdAt)
      if (!filterKeys.fromKey || inKeys(expKey)) { pN++; pM += amount } else { oN++; oM += amount }
    }
    const r = (n: number) => Math.round(n * 100) / 100
    const one = filterKeys.fromKey && filterKeys.fromKey === filterKeys.toKey
    return {
      total: r(pM + oM),
      note: filterKeys.fromKey
        ? `Collectés ${one ? `le ${filterKeys.fromKey.split('-').reverse().join('/')}` : 'sur la période'} — ports dus + ports payés ramassés reçus, pas encore versés à l'admin`
        : "Ports dus + ports payés ramassés reçus, pas encore versés à l'admin",
      lines: [
        { label: '📦 Expéditions de la période', n: pN, m: r(pM), hint: 'Expéditions de la période, dans votre caisse' },
        { label: '💵 Expéditions plus anciennes', n: oN, m: r(oM), hint: 'Expéditions antérieures à la période, encaissées / reçues pendant la période' },
      ],
    }
  })()

  // 📅 Filtre de date de la caisse (même composant, mêmes réglages qu'avant dans l'onglet Livreurs) — affiché en haut
  // et recopié au-dessus des cartes par jour (même état)
  const dateFilterEl = (
    <DateFilter value={datePresetUi} onChange={handleDatePresetChange} from={dateFromUi} onFromChange={setDateFrom}
      to={dateToUi} onToChange={setDateTo} tone="blue" bare operationalMode
      operationalDay={operationalDayUi} onOperationalDayChange={setOperationalDay} />
  )

  return (
    <div className="space-y-4">
      <PendingBadge show={caisseFiltersPending} />
      {/* 🔁 MÊME DISPOSITION que la Collecte du soir du chef d'exploitation (demande de l'admin, 20/10/2026) :
          filtre de date en haut · Bilan (résumé en bas) · section Caisse Agence avec la bande ② · cartes par jour
          qui suivent le filtre. Propre au chef d'agence : versements à confirmer, « Pas encore reçu », onglets
          Journée / Instances / Versements / Historique. */}
      <div className={`${CARD} px-4 py-3`}>
        <div className="mb-1.5 text-xs font-bold text-blue-800">📅 Période — Bilan, cartes par jour et livreurs</div>
        {dateFilterEl}
      </div>
      {/* 📅 Bilan de la date / période filtrée : théorique à encaisser, encaissé, à verser à l'admin (ports + COD) */}
      <BilanPeriode periodParcels={caisseView.dataSource} moneyParcels={caisseView.collectSource} city={profile?.city || ''} role="agence"
        fromKey={filterKeys.fromKey} toKey={filterKeys.toKey} label={periodLabel} agencyHolderIds={agencyHolderIds}
        encaisseTargetId="bilan-encaisse-agence"
        footer={(
          <div className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-left text-sm">
            <span className="text-blue-800">💰 Ports dus <b className="tabular-nums">{fmtAmt(filteredStats.portsCollectesMontant + filteredStats.portsACollecterMontant)} DH</b> <span className="text-xs text-slate-500">(reste {fmtAmt(filteredStats.portsACollecterMontant)})</span></span>
            <span className="text-indigo-800">📬 Ports payés <b className="tabular-nums">{fmtAmt(filteredStats.portsPayesRecusMontant + filteredStats.portsPayesARecevoirMontant)} DH</b></span>
            <span className="text-purple-800">💼 À verser à l'admin <b className="tabular-nums">{fmtAmt(searchResults === null && driverFilter === 'all' ? agenceAVerserDetail.total : (searchResults !== null ? filteredStats.soldeAVerser : soldeLivreur))} DH</b></span>
            {nonRecuTotal > 0 && <span className="text-orange-700" title="Encore chez le chef d'exploitation ou les livreurs">🚚 Pas encore reçu <b className="tabular-nums">{fmtAmt(nonRecuTotal)} DH</b></span>}
            {filteredStats.enRetardCount > 0 && <span className="text-amber-700 font-semibold">⏰ {filteredStats.enRetardCount} en retard</span>}
          </div>
        )} />
      {/* 📥 Versements du chef d'exploitation en attente de confirmation : l'argent n'entre en caisse qu'après « Reçu » */}
      {pendingVersements?.n > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-violet-300 bg-violet-50 px-4 py-3">
          <span className="text-2xl">📥</span>
          <div className="flex-1 min-w-0 text-sm text-violet-900">
            <b>{pendingVersements.n} versement{pendingVersements.n > 1 ? 's' : ''} du chef d'exploitation à confirmer</b>
            {' '}— <b className="tabular-nums">{fmtAmt(pendingVersements.amount)} DH</b>
            <div className="text-xs text-violet-700">Comptez l'argent reçu puis confirmez : il entrera alors dans votre caisse (et dans « À verser » à l'admin).</div>
          </div>
          <button type="button" onClick={() => setTab('valeurs')}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold">Voir et confirmer</button>
        </div>
      )}
      <section className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <SectionTitle emoji="🏛️" title="Caisse Agence"
          subtitle={<>{periodLabel} — recevez les versements du chef d'exploitation, puis versez à l'admin 📤</>} />
        {/* ② Encaissé à la date (bande du Bilan, déplacée ici — comme la Collecte du soir) */}
        <div id="bilan-encaisse-agence" />
      </section>

      {/* 📅 Même filtre que le haut (changer l'un change l'autre) : la journée choisie est sélectionnée ci-dessous */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3">
        <div className="mb-1.5 text-xs font-bold text-violet-800">📅 Période — même filtre que le haut de la page</div>
        {dateFilterEl}
      </div>
      {/* 📊 Collectes par jour + 💰 Valeurs (COD) collectées par jour — mêmes blocs, côte à côte, que la Collecte du soir */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Versements cachés tant que les collectes des derniers jours ne sont pas toutes chargées (chiffres complets) */}
        <CollectesParJour collectesParJour={collectesParJour} profile={profile} showVersement={driverFilter === 'all' && recentReady}
          loadingRecent={!recentReady}
          selectedRange={filterKeys.fromKey ? { fromKey: filterKeys.fromKey, toKey: filterKeys.toKey || filterKeys.fromKey } : null} />
        <CodCollectesParJour codCollectesParJour={codCollectesParJour} profile={profile}
          selectedRange={filterKeys.fromKey ? { fromKey: filterKeys.fromKey, toKey: filterKeys.toKey || filterKeys.fromKey } : null} />
      </div>

      {/* ⏳ Chargement jusqu'à épuisement de la période sélectionnée */}
      {isChefCaisse && (
        <div className="flex justify-end">
          <LoadProgress loading={caisseLoadingMore} count={caisseLoadedCount} />
        </div>
      )}

      {/* Onglets */}
      <div className="bg-white border border-gray-200 rounded-xl p-1 flex gap-1">
        <button
          onClick={() => setActiveTab('livreurs')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'livreurs'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <User className="w-4 h-4 inline-block mr-2" />
          Livreurs
        </button>
        <button
          onClick={() => setActiveTab('journee')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'journee'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline-block mr-2" />
          Journée
        </button>
        <button
          onClick={() => setActiveTab('instances')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'instances'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <AlertCircle className="w-4 h-4 inline-block mr-2" />
          Instances
        </button>
        <button
          onClick={() => setActiveTab('versements')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'versements'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Send className="w-4 h-4 inline-block mr-2" />
          Versements
        </button>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'livreurs' && (
        <div className="space-y-4">
          {/* 🗂️ Anciennes à régler (05/11/2026) : plus de 45 jours, pas rangées car pas terminées / pas réglées — 🔎 ouvre
              l'expédition dans la recherche ci-dessous (encaisser le port dû / le COD, livrer…) */}
          {profile?.city && <OldUnsettledCard city={profile.city} onOpen={nic => setSearchQuery(nic)} />}
          {/* (Filtre de date déplacé en haut de la page — même filtre) */}
          {/* Filtres */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />

              {/* Filtre par livreur */}
              <select
                value={driverFilterUi}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les livreurs</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              {/* Filtre par statut de collecte */}
              <select
                value={statusFilterUi}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {CAISSE_STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>

              {/* Recherche */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Rechercher dans TOUTES les expéditions..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* 🗄️ Archives TOUJOURS comprises dans la recherche (lot 2, 05/11/2026) : plus de case à cocher */}
              {searchQuery.trim() && includeArchived && (
                <span className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-900 whitespace-nowrap">🗄️ archives comprises</span>
              )}
            </div>
          </div>

          {/* Résultats de recherche OU Liste des livreurs */}
          {searchResults !== null ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-blue-50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Résultats de recherche
                  {statusFilter !== 'all' && (
                    <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded">
                      {statusFilterLabel}
                    </span>
                  )}
                </h3>
                <span className="text-sm text-gray-600">
                  {filteredSearchResults?.length || 0} résultat{(filteredSearchResults?.length || 0) > 1 ? 's' : ''}
                  {statusFilter !== 'all' && searchResults && (
                    <span className="ml-2 text-gray-500">
                      (sur {searchResults.length})
                    </span>
                  )}
                  {(filteredSearchResults?.length || 0) === 50 && (
                    <span className="ml-2 text-amber-600 font-medium">
                      (max 50)
                    </span>
                  )}
                </span>
              </div>

              {!filteredSearchResults || filteredSearchResults.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>Aucune expédition trouvée</p>
                </div>
              ) : (
                <div className="p-4 bg-gray-50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">N° EXP</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Date création</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Date livraison</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Client</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-700">Type</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700">Port</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700">COD</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-700">Status</th>
                          <th className="text-center py-2 px-3 font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSearchResults!.map((parcel: any) => {
                          const isPortDu = parcel.portType === 'port_du' && !parcel.portPayeMethod
                          // 🆕 Port payé ramassé localement (même si envoyé ailleurs après)
                          const isPortPayeRamasse = parcel.portType === 'port_paye' &&
                            !parcel.portPayeMethod &&
                            (parcel.portStatus === 'collected' || !parcel.portStatus) &&
                            (parcel.createdByCity === profile?.city || parcel.originCity === profile?.city) &&
                            (parcel.pickupDriverId || parcel.status === 'En cours de ramassage' || isRamasseGuichet(parcel, profile?.city || ''))  // Nouveau OU ancien système, ou guichet (« En gare »)
                          // 🆕 Port payé reçu (ramassage local uniquement)
                          const isPortPayeRecu = parcel.portType === 'port_paye' &&
                            !parcel.portPayeMethod &&
                            parcel.portStatus === 'received' &&
                            (parcel.createdByCity === profile?.city || parcel.originCity === profile?.city)
                          const delay = deliveryDelays.find((d: any) =>
                            d.parcelId === parcel.id && !d.resolvedAt
                          )
                          const isLate = (() => {
                            if (!isPortDu) return false
                            if (parcel.status !== 'En cours de livraison' || !parcel.deliveryAssignedAt) return false
                            const assignedDate = parcel.deliveryAssignedAt?.toDate ? parcel.deliveryAssignedAt.toDate() : new Date(parcel.deliveryAssignedAt)
                            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
                            return assignedDate < oneDayAgo
                          })()
                          const isCollected = parcel.portStatus === 'collected' || parcel.portStatus === 'received'

                          return (
                            <tr key={parcel.id} className="border-b border-gray-100 hover:bg-white transition">
                              <td className="py-2 px-3">
                                <div className="flex flex-col gap-1">
                                  <span className="font-mono text-xs font-semibold text-blue-600">
                                    {parcel.senderNic || parcel.sender?.nic || parcel.trackingId}
                                  </span>
                                  {(parcel.isArchived || parcel.rangee) && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded w-fit" title="Expédition rangée — toujours encaissable">
                                      🗄️ rangée
                                    </span>
                                  )}
                                  {/* 🎯 La recherche couvre toute la base : expédition hors de la période choisie signalée */}
                                  {datePreset !== 'all' && !caisseView.passesDateFilter(parcel) && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-[11px] font-semibold rounded w-fit" title="Expédition hors de la période choisie dans le filtre de date">
                                      📅 hors période
                                    </span>
                                  )}
                                  {parcel.deliveryDriverName && (
                                    <span className="text-xs text-gray-500">
                                      👤 {parcel.deliveryDriverName}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-sm text-gray-600">
                                {parcel.createdAt?.toDate ? parcel.createdAt.toDate().toLocaleDateString('fr-FR') : '-'}
                              </td>
                              <td className="py-2 px-3 text-sm text-gray-600">
                                {parcel.status === 'Livré' && parcel.deliveredAt?.toDate
                                  ? parcel.deliveredAt.toDate().toLocaleDateString('fr-FR')
                                  : parcel.status === 'Livré' && parcel.deliveredAt
                                    ? new Date(parcel.deliveredAt).toLocaleDateString('fr-FR')
                                    : '-'}
                              </td>
                              <td className="py-2 px-3">
                                <div className="text-gray-900">{parcel.receiver?.name || '-'}</div>
                                <div className="text-xs text-gray-500">{parcel.receiver?.tel || '-'}</div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isPortDu ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium">
                                    Port dû
                                  </span>
                                ) : parcel.portType === 'port_en_compte_destinataire' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-xs font-medium">
                                    C/Dest
                                  </span>
                                ) : parcel.portType === 'port_en_compte_expediteur' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium">
                                    C/Exp
                                  </span>
                                ) : isPortPayeRamasse || isPortPayeRecu ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-700 text-xs font-medium">
                                    {ppLabel(parcel)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-xs font-medium">
                                    Port payé
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                {fmtAmt(parcel.price)} DH
                                {isPortDu && isCollected && parcel.portDuReceivedMethod === 'cheque' && <div className="text-[10px] font-medium text-blue-700">📋 chèque{parcel.portDuChequeNumero ? ` n° ${parcel.portDuChequeNumero}` : ''}</div>}
                              </td>
                              {/* 💰 COD (RETOUR FOND) : mêmes actions que les tableaux des livreurs — collecter / recevoir, chèque + espèces, annuler (04/11/2026) */}
                              <td className="py-2 px-3 text-right">
                                {(parseFloat(parcel.codAmount) || 0) > 0 ? (
                                  <>
                                    <div className="font-semibold text-gray-900 whitespace-nowrap">{fmtAmt(parcel.codAmount)} DH</div>
                                    <div className="text-[10px] text-gray-500">{isMixedCod(parcel) ? codPartsBreakdown(parcel) : ({ especes: '💵 espèces', cheque: '📋 chèque', traite: '📝 traite' } as Record<string, string>)[String(parcel.codPaymentType || parcel.serviceType || '').toLowerCase()] || ''}</div>
                                    {codActionCell(parcel)}
                                  </>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isReturnPortDu(parcel) && <div className="text-[10px] font-semibold text-red-600 mb-0.5">↩️ Retour — port dû ici</div>}
                                {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') && !isReturnPortDu(parcel) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                                    <X className="w-3 h-3" />
                                    Retourné
                                  </span>
                                ) : !isPortDu && (parcel.portType === 'port_en_compte_destinataire' || parcel.portType === 'port_en_compte_expediteur') ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
                                    <Check className="w-3 h-3" />
                                    En compte
                                  </span>
                                ) : isCollected ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                    <Check className="w-3 h-3" />
                                    Collecté
                                  </span>
                                ) : isLate ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                                    <AlertCircle className="w-3 h-3" />
                                    En retard
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                                    <Clock className="w-3 h-3" />
                                    À collecter
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') && !isReturnPortDu(parcel) ? (
                                    <span className="text-xs text-gray-500 italic">-</span>
                                  ) : (
                                    <>
                                      {/* 📬 Port payé ramassé : recevoir / annuler — même logique que les tableaux des livreurs (lot 3, 05/11/2026) */}
                                      {(isPortPayeRamasse || isPortPayeRecu) && (
                                        guichetGroupIdOf(parcel, profile?.city || '') ? (
                                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" title={`Port payé encaissé au guichet : il se reçoit dans la carte « ${parcel.portGuichetHolderName || 'En gare'} »`}>Payé au guichet · {ramasseGuichetEtat(parcel).label}</span>
                                        ) : isPortPayeRecu ? (
                                          <button onClick={() => handleUncollectPortPaye(parcel)} disabled={collectingPortIds.has(parcel.id)}
                                            className="px-3 py-1 rounded-lg text-xs font-semibold transition bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">
                                            {collectingPortIds.has(parcel.id) ? '...' : 'Annuler PP'}
                                          </button>
                                        ) : portPayeExpReceived(parcel) ? (
                                          <span className="text-[11px] font-semibold text-indigo-700" title="Déjà remis au chef d'exploitation : il arrivera par son envoi (Valeurs à valider)">Remis chef d'exploitation (envoi)</span>
                                        ) : (
                                          <button onClick={() => handleReceivePortPaye(parcel)} disabled={collectingPortIds.has(parcel.id)}
                                            className="px-3 py-1 rounded-lg text-xs font-semibold transition bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50">
                                            {collectingPortIds.has(parcel.id) ? '...' : '📬 Recevoir PP'}
                                          </button>
                                        )
                                      )}
                                      {isPortDu && (
                                        <>
                                          <button
                                            onClick={() => isCollected && !portDuToReceive(parcel) ? handleUncollectPort(parcel) : handleCollectPort(parcel)}
                                            disabled={collectingPortIds.has(parcel.id)}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                              isCollected
                                                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                                : 'bg-green-600 hover:bg-green-700 text-white'
                                            } disabled:opacity-50`}
                                          >
                                            {collectingPortIds.has(parcel.id) ? (
                                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : portDuToReceive(parcel) ? (
                                              'Recevoir'
                                            ) : isCollected ? (
                                              'Annuler'
                                            ) : (
                                              '💵 Espèces'
                                            )}
                                          </button>
                                          {/* 📋 Port dû payé par chèque — comme la page du chef d'exploitation (pas pour un retour : espèces seulement) */}
                                          {!isCollected && !isReturnPortDu(parcel) && !parcel.wasReturned && (
                                            <button
                                              onClick={() => openPortCheque(parcel)}
                                              disabled={collectingPortIds.has(parcel.id)}
                                              className="px-3 py-1 rounded-lg text-xs font-semibold transition bg-blue-100 hover:bg-blue-200 text-blue-800 disabled:opacity-50"
                                            >
                                              📋 Chèque
                                            </button>
                                          )}

                                          {parcel.status === 'En cours de livraison' && isDestinationHere(parcel) && (
                                            <button
                                              onClick={() => handleMarkAsDelivered(parcel)}
                                              disabled={deliveringParcelIds.has(parcel.id)}
                                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                                            >
                                              {deliveringParcelIds.has(parcel.id) ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                              ) : (
                                                'Livrer'
                                              )}
                                            </button>
                                          )}

                                          {isLate && !delay && (
                                            <button
                                              onClick={() => setDelayModal(parcel)}
                                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
                                            >
                                              Retard
                                            </button>
                                          )}

                                          {delay && (
                                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
                                              Retard signalé
                                            </span>
                                          )}
                                        </>
                                      )}

                                      <button
                                        onClick={() => setQuickEditModal({
                                          open: true,
                                          parcel: parcel,
                                          price: String(parcel.price || ''),
                                          portType: parcel.portType || '',
                                          codAmount: isMixedCod(parcel) ? String(codDocPartOf(parcel)) : String(parcel.codAmount || ''),
                                          codMixed: isMixedCod(parcel),
                                          codCashAmount: isMixedCod(parcel) ? String(codCashPartOf(parcel)) : '',
                                          loading: false,
                                          error: ''
                                        })}
                                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                                      >
                                        🖐️ Éditer
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* 🗂️ Sélecteur de colonnes : s'applique à l'affichage ET à l'impression du
                  tableau des expéditions de chaque livreur ci-dessous. */}
              <div className="flex justify-end relative">
                <button
                  onClick={() => setShowDriverColumnsMenu(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Colonnes ({Object.values(driverTableColumns).filter(Boolean).length}/{Object.keys(driverTableColumns).length})
                </button>
                {showDriverColumnsMenu && (
                  <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-52">
                    {Object.keys(DEFAULT_DRIVER_TABLE_COLUMNS).map(key => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={!!driverTableColumns[key]}
                          onChange={() => toggleDriverColumn(key)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        {DRIVER_TABLE_COLUMN_LABELS[key]}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {filteredDrivers.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                  <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Aucun livreur trouvé</p>
                </div>
              )}

            {filteredDrivers.map(driver => (
              <DriverCaisseCard
                key={driver.id}
                driver={driver}
                statusFilter={statusFilter}
                statusFilterLabel={statusFilterLabel}
                open={expandedDrivers.has(driver.id)}
                onToggle={() => toggleDriver(driver.id)}
                onPrint={() => printFeuilleDeCharge(driver.name, profile?.city || '', driver.parcels, profile?.name || '', periodLabel, statusFilterLabel)}
              >
                {/* ⚡ Lignes construites SEULEMENT carte ouverte (fermée : rien n'est calculé ni rendu) */}
                {expandedDrivers.has(driver.id) && (<>
                {/* Détails des expéditions (en-tête : composant partagé DriverCaisseCard) */}
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <HScrollArrows>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {driverTableColumns.nexp && <th className="text-left py-2 px-3 font-semibold text-gray-700">N° EXP</th>}
                            {driverTableColumns.dateCreation && <th className="text-left py-2 px-3 font-semibold text-gray-700">Date création</th>}
                            {driverTableColumns.dateLivraison && <th className="text-left py-2 px-3 font-semibold text-gray-700">Date livraison</th>}
                            {driverTableColumns.client && <th className="text-left py-2 px-3 font-semibold text-gray-700">Client</th>}
                            {driverTableColumns.type && <th className="text-center py-2 px-3 font-semibold text-gray-700">Type</th>}
                            {driverTableColumns.montant && <th className="text-right py-2 px-3 font-semibold text-gray-700">Montant</th>}
                            {driverTableColumns.status && <th className="text-center py-2 px-3 font-semibold text-gray-700">Status</th>}
                            {driverTableColumns.cod && <th className="text-right py-2 px-3 font-semibold text-gray-700">COD</th>}
                            {driverTableColumns.especes && <th className="text-right py-2 px-3 font-semibold text-gray-700">💵 Espèces</th>}
                            {driverTableColumns.cheque && <th className="text-right py-2 px-3 font-semibold text-gray-700">📋 Chèque</th>}
                            {driverTableColumns.traite && <th className="text-right py-2 px-3 font-semibold text-gray-700">📝 Traite</th>}
                            <th className="text-center py-2 px-3 font-semibold text-gray-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {driver.parcels.map((parcel: any) => {
                              // LOGIQUE COHÉRENTE : Port dû seulement si portType='port_du' ET pas de portPayeMethod
                              const isPortDu = parcel.portType === 'port_du' && !parcel.portPayeMethod
                              // 🆕 Port payé ramassé localement (même si envoyé ailleurs après)
                              const isPortPayeRamasse = parcel.portType === 'port_paye' &&
                                !parcel.portPayeMethod &&
                                (parcel.portStatus === 'collected' || !parcel.portStatus) &&
                                (parcel.createdByCity === profile?.city || parcel.originCity === profile?.city) &&
                                (parcel.pickupDriverId || parcel.status === 'En cours de ramassage' || isRamasseGuichet(parcel, profile?.city || ''))  // Nouveau OU ancien système, ou guichet (« En gare »)
                              // 🆕 Port payé reçu (ramassage local uniquement)
                              const isPortPayeRecu = parcel.portType === 'port_paye' &&
                                !parcel.portPayeMethod &&
                                parcel.portStatus === 'received' &&
                                (parcel.createdByCity === profile?.city || parcel.originCity === profile?.city)
                              const delay = deliveryDelays.find((d: any) =>
                                d.parcelId === parcel.id && !d.resolvedAt
                              )
                              const isLate = (() => {
                                if (!isPortDu) return false // Port payé ne peut pas être en retard de collecte
                                if (parcel.status !== 'En cours de livraison' || !parcel.deliveryAssignedAt) return false
                                const assignedDate = parcel.deliveryAssignedAt?.toDate ? parcel.deliveryAssignedAt.toDate() : new Date(parcel.deliveryAssignedAt)
                                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
                                return assignedDate < oneDayAgo
                              })()
                              const isCollected = parcel.portStatus === 'collected' || parcel.portStatus === 'received'

                              return (
                                <tr key={parcel.id} className="border-b border-gray-100 hover:bg-white transition">
                                  {driverTableColumns.nexp && (
                                    <td className="py-2 px-3">
                                      <span className="font-mono text-xs font-semibold text-blue-600">
                                        {parcel.senderNic || parcel.sender?.nic || parcel.trackingId}
                                      </span>
                                    </td>
                                  )}
                                  {driverTableColumns.dateCreation && (
                                    <td className="py-2 px-3 text-sm text-gray-600">
                                      {parcel.createdAt?.toDate ? parcel.createdAt.toDate().toLocaleDateString('fr-FR') : '-'}
                                    </td>
                                  )}
                                  {driverTableColumns.dateLivraison && (
                                    <td className="py-2 px-3 text-sm text-gray-600">
                                      {parcel.status === 'Livré' && parcel.deliveredAt?.toDate
                                        ? parcel.deliveredAt.toDate().toLocaleDateString('fr-FR')
                                        : parcel.status === 'Livré' && parcel.deliveredAt
                                          ? new Date(parcel.deliveredAt).toLocaleDateString('fr-FR')
                                          : '-'}
                                    </td>
                                  )}
                                  {driverTableColumns.client && (
                                    <td className="py-2 px-3">
                                      <div className="text-gray-900">{parcel.receiver?.name || '-'}</div>
                                      <div className="text-xs text-gray-500">{parcel.receiver?.tel || '-'}</div>
                                    </td>
                                  )}
                                  {driverTableColumns.type && (
                                  <td className="py-2 px-3 text-center">
                                    {isPortDu ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium">
                                        Port dû
                                      </span>
                                    ) : parcel.portType === 'port_en_compte_destinataire' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-xs font-medium">
                                        C/Dest
                                      </span>
                                    ) : parcel.portType === 'port_en_compte_expediteur' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium">
                                        C/Exp
                                      </span>
                                    ) : isPortPayeRamasse || isPortPayeRecu ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-700 text-xs font-medium">
                                        {ppLabel(parcel)}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-xs font-medium">
                                        Port payé
                                      </span>
                                    )}
                                  </td>
                                  )}
                                  {driverTableColumns.montant && (
                                  <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                    {fmtAmt(parcel.price)} DH
                                  </td>
                                  )}
                                  {driverTableColumns.status && (
                                  <td className="py-2 px-3 text-center">
                                    {isReturnPortDu(parcel) && <div className="text-[10px] font-semibold text-red-600 mb-0.5">↩️ Retour — port dû ici</div>}
                                    {parcel.status === 'Retourné' && !isReturnPortDu(parcel) ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                                        <X className="w-3 h-3" />
                                        Retourné
                                      </span>
                                    ) : isPortPayeRecu ? (
                                      <span title={parcel.portReceivedBy ? `Reçu par ${parcel.portReceivedBy}` : undefined} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                        <Check className="w-3 h-3" />
                                        Reçu{parcel.portPayeExpReceivedRole === 'chef_agence' ? ` · chef d'agence ${parcel.portReceivedBy || ''}` : ''}
                                      </span>
                                    ) : isPortPayeRamasse ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                        <Banknote className="w-3 h-3" />
                                        {parcel.portPayeExpReceivedAt ? "Reçu chef d'exploitation" : isGuichetPP(parcel) ? 'À recevoir' : 'À ramasser'}
                                      </span>
                                    ) : !isPortDu && (parcel.portType === 'port_en_compte_destinataire' || parcel.portType === 'port_en_compte_expediteur') ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
                                        <Check className="w-3 h-3" />
                                        En compte
                                      </span>
                                    ) : !isPortDu ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                                        <Check className="w-3 h-3" />
                                        Déjà payé
                                      </span>
                                    ) : isCollected ? (
                                      <span title={parcel.portCollectedBy ? `Collecté par ${parcel.portCollectedBy}` : undefined} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                        <Check className="w-3 h-3" />
                                        {parcel.portExpReceivedRole === 'chef_agence'
                                          ? `Reçu · chef d'agence ${parcel.portChefReceivedBy || ''}`
                                          : parcel.portChefReceivedAt ? "Reçu (envoi chef d'exploitation)" : 'Collecté'}
                                      </span>
                                    ) : isLate ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                                        <AlertCircle className="w-3 h-3" />
                                        En retard
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                                        <Clock className="w-3 h-3" />
                                        À collecter
                                      </span>
                                    )}
                                  </td>
                                  )}
                                  {driverTableColumns.cod && (
                                    <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                      {parcel.codAmount ? `${fmtAmt(parcel.codAmount)} DH` : '-'}
                                      {isMixedCod(parcel) && <div className="text-[10px] font-semibold text-gray-500">{codPartsBreakdown(parcel)}</div>}
                                      {codActionCell(parcel)}
                                    </td>
                                  )}
                                  {driverTableColumns.especes && (
                                    <td className="py-2 px-3 text-right text-green-700">
                                      {caisseCodAmountOfType(parcel, 'especes') ? `${fmtAmt(caisseCodAmountOfType(parcel, 'especes'))} DH` : '-'}
                                    </td>
                                  )}
                                  {driverTableColumns.cheque && (
                                    <td className="py-2 px-3 text-right text-blue-700">
                                      {caisseCodAmountOfType(parcel, 'cheque') ? `${fmtAmt(caisseCodAmountOfType(parcel, 'cheque'))} DH` : '-'}
                                    </td>
                                  )}
                                  {driverTableColumns.traite && (
                                    <td className="py-2 px-3 text-right text-indigo-700">
                                      {caisseCodAmountOfType(parcel, 'traite') ? `${fmtAmt(caisseCodAmountOfType(parcel, 'traite'))} DH` : '-'}
                                    </td>
                                  )}
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') && !isReturnPortDu(parcel) ? (
                                        <span className="text-xs text-gray-500 italic">-</span>
                                      ) : (
                                        <>
                                          {/* 🏬 Port payé encaissé AU GUICHET : l'argent est chez « En gare » (reçu dans SA carte), pas chez ce livreur —
                                              même règle que la Collecte du soir ; l'expédition reste visible ici pour le suivi de sa livraison */}
                                          {(guichetGroupIdOf(parcel, profile?.city || '') && guichetGroupIdOf(parcel, profile?.city || '') !== driver.id) ? (
                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ramasseGuichetEtat(parcel).tone === 'gare' ? 'bg-amber-100 text-amber-800' : ramasseGuichetEtat(parcel).tone === 'exp' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`} title={`Port payé encaissé au guichet : il se reçoit dans la carte « ${parcel.portGuichetHolderName || 'En gare'} »`}>Payé au guichet · {ramasseGuichetEtat(parcel).label}</span>
                                          ) : isPortPayeRecu ? (
                                            <button
                                              onClick={() => handleUncollectPortPaye(parcel)}
                                              disabled={collectingPortIds.has(parcel.id)}
                                              className="text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed bg-red-100 text-red-700 hover:bg-red-200"
                                            >
                                              {collectingPortIds.has(parcel.id) ? '...' : 'Annuler'}
                                            </button>
                                          ) : isPortPayeRamasse && portPayeExpReceived(parcel) ? (
                                            <span className="text-[11px] font-semibold text-indigo-700" title="Déjà remis au chef d'exploitation : il arrivera par son envoi (Valeurs à valider)">Remis chef d'exploitation (envoi)</span>
                                          ) : isPortPayeRamasse ? (
                                            <button
                                              onClick={() => handleReceivePortPaye(parcel)}
                                              disabled={collectingPortIds.has(parcel.id)}
                                              className="text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                            >
                                              {collectingPortIds.has(parcel.id) ? '...' : 'Recevoir'}
                                            </button>
                                          ) : isPortDu && (
                                            <>
                                              <button
                                                onClick={() => isCollected && !portDuToReceive(parcel) ? handleUncollectPort(parcel) : handleCollectPort(parcel)}
                                                disabled={collectingPortIds.has(parcel.id)}
                                                className={`text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                                  isCollected
                                                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                }`}
                                              >
                                                {collectingPortIds.has(parcel.id)
                                                  ? '...'
                                                  : portDuToReceive(parcel)
                                                    ? 'Recevoir'
                                                    : isCollected
                                                      ? 'Annuler'
                                                      : 'Collecter'}
                                              </button>
                                              {!isCollected && !isReturnPortDu(parcel) && (
                                                <>
                                                  <button
                                                    onClick={() => openDelayModal(parcel, driver)}
                                                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                                                      delay
                                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                                  >
                                                    {delay ? 'Modifier retard' : 'Signaler retard'}
                                                  </button>
                                                  {delay && (
                                                    <button
                                                      onClick={() => handleDeleteDelay(delay.id)}
                                                      className="text-xs px-3 py-1 rounded-lg font-medium transition bg-red-100 text-red-700 hover:bg-red-200"
                                                      title="Annuler ce signalement de retard"
                                                    >
                                                      Annuler retard
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                            </>
                                          )}
                                          {/* Bouton Livrer : seulement les expéditions livrées par MON agence (destination = ma ville, ou locale) */}
                                          {parcel.status !== 'Livré' && parcel.status !== 'Retourné' && !isReturnPortDu(parcel) && isDestinationHere(parcel) && (
                                            <button
                                              onClick={() => handleMarkAsDelivered(parcel)}
                                              disabled={deliveringParcelIds.has(parcel.id)}
                                              className="text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed bg-blue-100 text-blue-700 hover:bg-blue-200"
                                            >
                                              {deliveringParcelIds.has(parcel.id) ? '...' : 'Livrer'}
                                            </button>
                                          )}
                                          {/* Bouton Éditer pour TOUTES les expéditions */}
                                          <button
                                            onClick={() => setQuickEditModal({
                                              open: true,
                                              parcel: parcel,
                                              price: String(parcel.price || ''),
                                              portType: parcel.portType || '',
                                              codAmount: isMixedCod(parcel) ? String(codDocPartOf(parcel)) : String(parcel.codAmount || ''),
                                              codMixed: isMixedCod(parcel),
                                              codCashAmount: isMixedCod(parcel) ? String(codCashPartOf(parcel)) : '',
                                              loading: false,
                                              error: ''
                                            })}
                                            className="text-xs px-3 py-1 rounded-lg font-medium transition bg-purple-100 text-purple-700 hover:bg-purple-200 flex items-center gap-1"
                                          >
                                            🖐️ Éditer
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-blue-600 bg-blue-50 font-bold">
                            {driverTableColumns.nexp && <td className="py-2 px-3 text-blue-900">TOTAL ({driver.parcels.length})</td>}
                            {driverTableColumns.dateCreation && <td className="py-2 px-3"></td>}
                            {driverTableColumns.dateLivraison && <td className="py-2 px-3"></td>}
                            {driverTableColumns.client && <td className="py-2 px-3">{!driverTableColumns.nexp && `TOTAL (${driver.parcels.length})`}</td>}
                            {driverTableColumns.type && <td className="py-2 px-3"></td>}
                            {driverTableColumns.montant && (
                              <td className="py-2 px-3 text-right text-blue-900">
                                {fmtAmt(driver.parcels.reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0))} DH
                              </td>
                            )}
                            {driverTableColumns.status && <td className="py-2 px-3"></td>}
                            {driverTableColumns.cod && (
                              <td className="py-2 px-3 text-right text-blue-900">
                                {fmtAmt(caisseCodTotals(driver.parcels).total)} DH
                              </td>
                            )}
                            {driverTableColumns.especes && (
                              <td className="py-2 px-3 text-right text-green-700">
                                {fmtAmt(caisseCodTotals(driver.parcels).especes)} DH
                              </td>
                            )}
                            {driverTableColumns.cheque && (
                              <td className="py-2 px-3 text-right text-blue-700">
                                {fmtAmt(caisseCodTotals(driver.parcels).cheque)} DH
                              </td>
                            )}
                            {driverTableColumns.traite && (
                              <td className="py-2 px-3 text-right text-indigo-700">
                                {fmtAmt(caisseCodTotals(driver.parcels).traite)} DH
                              </td>
                            )}
                            <td className="py-2 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </HScrollArrows>

                    {driver.parcels.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        Aucune expédition
                      </div>
                    )}
                  </div>
                </>)}
              </DriverCaisseCard>
            ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'journee' && (
        <div className="space-y-4">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                  Bilan de Journée — Suivi Quotidien par Livreur
                </h2>
                <p className="text-sm text-gray-600 mb-2">
                  Revue de fin d'après-midi: état de livraison et collecte des ports dûs
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                    {periodLabel}
                  </span>
                </div>
              </div>
              {bilanJournee.length > 0 && (
                <button
                  onClick={() => printBilanJournee(bilanJournee, profile, periodLabel)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-sm shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer Bilan
                </button>
              )}
            </div>
          </div>

          {/* Tableau de bilan */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  <tr>
                    <th colSpan={7} className="px-4 py-4 text-center border-b border-blue-500">
                      <div className="flex items-center justify-center gap-2">
                        <Calendar className="w-5 h-5" />
                        <span className="text-lg font-bold">Période: {periodLabel}</span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Livreur</th>
                    <th className="px-4 py-3 text-center font-semibold">Assignés</th>
                    <th className="px-4 py-3 text-center font-semibold">Livrés</th>
                    <th className="px-4 py-3 text-center font-semibold">Taux %</th>
                    <th className="px-4 py-3 text-center font-semibold">En cours</th>
                    <th className="px-4 py-3 text-right font-semibold">Collectés (DH)</th>
                    <th className="px-4 py-3 text-right font-semibold">🚨 Livrés non encaissés</th>
                  </tr>
                </thead>
                <tbody>
                  {bilanJournee.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Aucun livreur avec des expéditions sur la période sélectionnée
                      </td>
                    </tr>
                  ) : (
                    bilanJournee.map((b, idx) => (
                      <tr key={b.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 font-semibold text-gray-900">{b.name}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-600">
                          {b.total}
                          {b.enCompteCount > 0 && <div className="text-[10px] font-normal text-gray-500">dont {b.enCompteCount} en compte</div>}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-green-600">{b.livresCount}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            b.tauxLivraison >= 80 ? 'bg-green-100 text-green-700' :
                            b.tauxLivraison >= 50 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {b.tauxLivraison}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-orange-600">
                          {b.enCoursCount}
                          {b.enAgenceCount > 0 && <div className="text-[10px] font-normal text-gray-500">+{b.enAgenceCount} en agence</div>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold text-green-700">
                            {b.portsCollectesMontant.toFixed(2)} DH
                          </div>
                          <div className="text-xs text-gray-500">
                            ({b.portsCollectesCount} colis)
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {b.montantManquant > 0 ? (
                            <div className="bg-red-50 border border-red-200 rounded px-2 py-1 inline-block">
                              <div className="font-bold text-red-700">
                                {b.montantManquant.toFixed(2)} DH
                              </div>
                              <div className="text-xs text-red-600">
                                ({b.livresNonCollectes.length} colis)
                              </div>
                              <div className="text-[10px] text-red-600/80">
                                {b.montantManquantPort > 0 && <>port {b.montantManquantPort.toFixed(2)}</>}
                                {b.montantManquantPort > 0 && b.montantManquantCod > 0 && ' · '}
                                {b.montantManquantCod > 0 && <>COD {b.montantManquantCod.toFixed(2)}</>}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {bilanJournee.length > 0 && (
                  <tfoot className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-200">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-gray-900">TOTAL</td>
                      <td className="px-4 py-3 text-center text-blue-700">
                        {bilanJournee.reduce((s, b) => s + b.total, 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-green-700">
                        {bilanJournee.reduce((s, b) => s + b.livresCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {bilanJournee.reduce((s, b) => s + b.total, 0) > 0
                          ? Math.round(
                              (bilanJournee.reduce((s, b) => s + b.livresCount, 0) /
                                bilanJournee.reduce((s, b) => s + b.total, 0)) *
                                100
                            )
                          : 0}%
                      </td>
                      <td className="px-4 py-3 text-center text-orange-700">
                        {bilanJournee.reduce((s, b) => s + b.enCoursCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-800">
                        {bilanJournee.reduce((s, b) => s + b.portsCollectesMontant, 0).toFixed(2)} DH
                      </td>
                      <td className="px-4 py-3 text-right text-red-800">
                        {bilanJournee.reduce((s, b) => s + b.montantManquant, 0).toFixed(2)} DH
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Légende */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Légende:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li><strong>Assignés:</strong> Nombre total d'expéditions confiées au livreur</li>
              <li><strong>Livrés:</strong> Expéditions livrées avec succès</li>
              <li><strong>Taux %:</strong> Pourcentage de livraison (🟢 ≥80% | 🟡 50-79% | 🔴 &lt;50%)</li>
              <li><strong>En cours:</strong> Expéditions encore chez le livreur</li>
              <li><strong>Collectés:</strong> Montant des ports dûs encaissés</li>
              <li><strong>🚨 Livrés non encaissés:</strong> Port dû et/ou COD d'expéditions livrées, pas encore collectés (ANOMALIE!)</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'instances' && (
        <div className="space-y-4">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                  Instances / Retards — Suivi par ancienneté
                </h2>
                <p className="text-sm text-gray-600 mb-2">
                  Ports dûs non collectés en instance, triés du plus ancien au plus récent
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-700 bg-orange-100 px-3 py-1 rounded-full">
                    {periodLabel}
                  </span>
                </div>
              </div>
              {instances.length > 0 && (
                <button
                  onClick={() => printInstancesRetards(instances, profile, periodLabel, DELAY_REASONS)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-semibold text-sm shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer Retards
                </button>
              )}
            </div>
          </div>

          {/* Résumé par bucket */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: '<24h', label: 'Moins de 24h', color: 'yellow' },
              { key: '1-7j', label: '1 à 7 jours', color: 'orange' },
              { key: '7-30j', label: '7 à 30 jours', color: 'red' },
              { key: '30j+', label: 'Plus de 30 jours', color: 'red-dark' }
            ].map(({ key, label, color }) => {
              const count = instances.filter(i => i.bucket === key).length
              const montant = instances.filter(i => i.bucket === key).reduce((s, i) => s + safeParseAmount(i.parcel.price), 0)
              const bgColor = color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                              color === 'orange' ? 'bg-orange-50 border-orange-200' :
                              color === 'red' ? 'bg-red-50 border-red-200' : 'bg-red-100 border-red-300'
              const textColor = color === 'yellow' ? 'text-yellow-700' :
                                color === 'orange' ? 'text-orange-700' :
                                color === 'red' ? 'text-red-700' : 'text-red-800'
              return (
                <div key={key} className={`${bgColor} border rounded-xl p-4`}>
                  <div className={`text-xs font-semibold ${textColor} mb-1`}>{label}</div>
                  <div className={`text-2xl font-bold ${textColor}`}>{count}</div>
                  <div className="text-xs text-gray-600 mt-1">{montant.toFixed(2)} DH</div>
                </div>
              )
            })}
          </div>

          {/* Tableau des instances */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-orange-600 to-red-600 text-white">
                  <tr>
                    <th colSpan={7} className="px-4 py-4 text-center border-b border-orange-500">
                      <div className="flex items-center justify-center gap-2">
                        <Calendar className="w-5 h-5" />
                        <span className="text-lg font-bold">Période: {periodLabel}</span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Depuis</th>
                    <th className="px-4 py-3 text-left font-semibold">N° EXP</th>
                    <th className="px-4 py-3 text-left font-semibold">Livreur</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th className="px-4 py-3 text-left font-semibold">Raison</th>
                    <th className="px-4 py-3 text-left font-semibold">Détail</th>
                    <th className="px-4 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        ✅ Aucune instance en retard — Tout est à jour!
                      </td>
                    </tr>
                  ) : (
                    instances.map((inst, idx) => {
                      const { parcel, ageJours, delay, bucket, driver, driverName } = inst
                      const badgeColor = bucket === '<24h' ? 'bg-yellow-100 text-yellow-800' :
                                        bucket === '1-7j' ? 'bg-orange-100 text-orange-800' :
                                        bucket === '7-30j' ? 'bg-red-100 text-red-800' : 'bg-red-200 text-red-900'
                      const delayReason = delay ? DELAY_REASONS.find(r => r.key === delay.reason) : null
                      return (
                        <tr key={parcel.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3">
                            <span title={`${ageJours} jour${ageJours > 1 ? 's' : ''}`} className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${badgeColor}`}>
                              depuis le {new Date(Date.now() - ageJours * 86400000).toLocaleDateString('fr-FR')}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">
                            {parcel.senderNic || parcel.sender?.nic || parcel.trackingId}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {driverName}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {safeParseAmount(parcel.price).toFixed(2)} DH
                          </td>
                          <td className="px-4 py-3">
                            {delayReason ? (
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {delayReason.label}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {delay?.details || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openDelayModal(parcel, driver)}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold hover:bg-blue-200 transition"
                              >
                                {delay ? 'Modifier' : 'Saisir'}
                              </button>
                              {delay && (
                                <>
                                  <button
                                    onClick={() => handleDeleteDelay(delay.id)}
                                    className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200 transition"
                                    title="Annuler ce signalement de retard"
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    onClick={() => handleResolveDelay(delay.id)}
                                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold hover:bg-green-200 transition"
                                  >
                                    Résoudre
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Légende */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Légende:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li><strong>Âge:</strong> Nombre de jours depuis la création de l'expédition</li>
              <li><strong>🟡 &lt;24h:</strong> Instance récente (surveillance)</li>
              <li><strong>🟠 1-7j:</strong> Retard modéré (suivi requis)</li>
              <li><strong>🔴 7-30j:</strong> Retard sérieux (action urgente)</li>
              <li><strong>🔴 30j+:</strong> Retard critique (escalade)</li>
              <li><strong>Saisir/Modifier:</strong> Documenter la raison du retard</li>
              <li><strong>Résoudre:</strong> Marquer le retard comme résolu (port collecté ou situation clarifiée)</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'versements' && (() => {
        // 💼 Versements à l'admin (30/10/2026) : soldes, journées à verser (bouton « Verser »), historique — même calcul qu'avant
        // Journées avec de l'argent à verser (dans ma caisse) OU pas encore reçu (chez le chef d'exploitation / livreurs)
        // 💼 Journées lues dans la COPIE ALLÉGÉE (versementDays, temps réel) — mêmes montants que les « Collectes par jour »
        const copyRows: [string, any][] = (vDays || []).map(d => [d.day, {
          aVerser: Number(d.aVerser) || 0, nonRecu: Number(d.nonRecu) || 0, verse: Number(d.verse) || 0,
          montant: (Number(d.aVerser) || 0) + (Number(d.nonRecu) || 0) + (Number(d.verse) || 0),
          count: (d.n_aVerser || 0) + (d.n_nonRecu || 0) + (d.n_verse || 0), nAVerser: d.n_aVerser || 0,
        }])
        const recentReady = vDays !== null
        const toVerse = copyRows.filter(([, d]) => d.aVerser > 0.009 || d.nonRecu > 0.009).sort((a, b) => a[0].localeCompare(b[0]))
        const totalAVerser = toVerse.reduce((s, [, d]) => s + (d.aVerser || 0), 0)
        const totalNonRecu = toVerse.reduce((s, [, d]) => s + (d.nonRecu || 0), 0)
        const daysAVerser = toVerse.filter(([, d]) => (d.aVerser || 0) > 0.009).length
        // Journées affichées : celles qui ont encore de l'argent (à verser / pas encore reçu), ou toutes (« entrées » complètes)
        const shownDays = (showAllDays ? [...copyRows] : toVerse).sort((a, b) => b[0].localeCompare(a[0]))
        const totalCollecte = shownDays.reduce((s, [, d]) => s + (d.montant || 0), 0)
        const totalVerse = shownDays.reduce((s, [, d]) => s + (d.verse || 0), 0)
        /** Versements à l'admin d'une journée de collecte (note « Collectes du JJ/MM/AAAA… ») */
        const transfersOfDay = (k: string) => adminTransfers.filter((t: any) => String(t.note || '').startsWith(`Collectes du ${fmtKeyFr(k)}`))
        const tDate = (t: any): Date => t.createdAt?.toDate?.() || new Date(t.createdAt || 0)
        const tSum = (l: any[]) => l.reduce((s, t) => s + (safeParseAmount(t.amount) || 0), 0)
        const pendingT = adminTransfers.filter((t: any) => t.status === 'pending')
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
        const monthT = adminTransfers.filter((t: any) => t.status === 'confirmed' && tDate(t) >= monthStart)
        const hist = [...adminTransfers].filter((t: any) => histFilter === 'all' || t.status === histFilter).sort((a, b) => tDate(b).getTime() - tDate(a).getTime())
        const STATUS: Record<string, { label: string; cls: string }> = {
          pending: { label: '⏳ En attente de l\'admin', cls: 'bg-amber-100 text-amber-800' },
          confirmed: { label: '✅ Validé', cls: 'bg-emerald-100 text-emerald-800' },
          rejected: { label: '❌ Refusé', cls: 'bg-red-100 text-red-800' },
        }
        // Ouverture de « Verser » / du détail : expéditions de la journée relues à chaque fois (état à jour)
        const openVerser = (k: string) => { setVersementDay(k); setVersementForm({ amount: '', note: '' }); ensureCopyDay(k); setVerserOpen(true) }
        // 💼 Écarts : versements validés par l'admin pour moins que le montant envoyé, moins les régularisations
        const ecart = summarizeEcarts(adminTransfers)
        const regulMax = Math.max(0, Math.round((ecart.reste - ecart.regulEnAttente) * 100) / 100)
        const sendRegul = async () => {
          if (!regulForm) return
          const amount = regulForm.amount === '' ? regulMax : safeParseAmount(regulForm.amount)
          if (!(amount > 0)) { alert('⚠️ Montant invalide.'); return }
          if (amount > regulMax + 0.001) { alert(`⚠️ Le montant ne peut pas dépasser l'écart restant (${fmtAmt(regulMax)} DH).`); return }
          if (!confirm(`Verser ${fmtAmt(amount)} DH à l'admin pour régulariser l'écart ?`)) return
          setSendingRegul(true)
          try {
            await createRegularisationTransfer({ fromId: uid, fromName: profile?.name || '', city: profile?.city, amount, note: regulForm.note })
            setRegulForm(null)
            alert('✅ Régularisation envoyée. En attente de validation admin.')
          } catch (err: any) { alert(`❌ Erreur : ${err.message}`) } finally { setSendingRegul(false) }
        }
        return (
        <div className="space-y-4">
          {/* Soldes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-bold text-violet-700">💼 Dans ma caisse — à verser à l'admin</p>
              <p className="mt-1 text-2xl font-black text-violet-800 tabular-nums">{recentReady ? `${fmtAmt(totalAVerser)} DH` : '⏳ calcul…'}</p>
              <p className="text-xs text-violet-700">{daysAVerser} journée(s) de collecte</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4" title="Ports collectés pas encore remis au chef d'agence : chez le chef d'exploitation ou les livreurs. Ils deviennent « à verser » une fois reçus.">
              <p className="text-xs font-bold text-orange-700">🚚 Pas encore reçu du chef d'exploitation</p>
              <p className="mt-1 text-2xl font-black text-orange-800 tabular-nums">{recentReady ? `${fmtAmt(totalNonRecu)} DH` : '⏳ calcul…'}</p>
              <p className="text-xs text-orange-700">collecté, à recevoir avant de verser</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-700">⏳ En attente de validation</p>
              <p className="mt-1 text-2xl font-black text-amber-800 tabular-nums">{fmtAmt(tSum(pendingT))} DH</p>
              <p className="text-xs text-amber-700">{pendingT.length} versement(s) envoyé(s) à l'admin</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold text-emerald-700">✅ Validé ce mois</p>
              <p className="mt-1 text-2xl font-black text-emerald-800 tabular-nums">{fmtAmt(tSum(monthT))} DH</p>
              <p className="text-xs text-emerald-700">{monthT.length} versement(s)</p>
            </div>
          </div>

          {/* ⚠️ Écarts à régulariser (versements validés pour moins que le montant envoyé) */}
          {(ecart.reste > 0 || ecart.list.length > 0) && (
            <div className={`rounded-xl border p-4 ${ecart.reste > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-56">
                  <p className="font-bold text-red-800">⚠️ Écart à régulariser avec l'admin : {fmtAmt(ecart.reste)} DH</p>
                  <p className="text-xs text-red-700">Versements validés par l'admin pour moins que le montant envoyé : {fmtAmt(ecart.ecarts)} DH · déjà régularisé {fmtAmt(ecart.regulValidees)} DH{ecart.regulEnAttente > 0 ? ` · en attente de validation ${fmtAmt(ecart.regulEnAttente)} DH` : ''}</p>
                </div>
                {regulMax > 0 && <button onClick={() => setRegulForm({ amount: '', note: '' })} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold">Verser la régularisation ▸</button>}
              </div>
              <div className="mt-2 space-y-1">
                {ecart.list.map((t: any) => (
                  <p key={t.id} className="text-xs text-red-800">
                    • {tDate(t).toLocaleDateString('fr-FR')} — {t.note || 'Versement'} : envoyé <b>{fmtAmt(transferSent(t))} DH</b>, reçu par l'admin <b>{fmtAmt(t.amount)} DH</b> → écart <b>{fmtAmt(transferEcart(t))} DH</b>
                  </p>
                ))}
              </div>
            </div>
          )}
          {regulForm && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !sendingRegul && setRegulForm(null)}>
              <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900">Régulariser l'écart avec l'admin</h3>
                <p className="text-sm text-gray-600">Écart restant : <b>{fmtAmt(regulMax)} DH</b></p>
                <input type="number" step="0.01" min="0" max={regulMax} value={regulForm.amount} onChange={e => setRegulForm(f => f && ({ ...f, amount: e.target.value }))}
                  placeholder={`${fmtAmt(regulMax)} (tout l'écart)`} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                <textarea value={regulForm.note} onChange={e => setRegulForm(f => f && ({ ...f, note: e.target.value }))} placeholder="Note (optionnel)" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setRegulForm(null)} disabled={sendingRegul} className="py-2 rounded-lg border border-gray-200 font-semibold text-gray-600">Annuler</button>
                  <button onClick={sendRegul} disabled={sendingRegul} className="py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50">{sendingRegul ? 'Envoi…' : 'Verser'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Journées à verser */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Send className="w-5 h-5 text-blue-600" /> Journées à verser</h3>
            {!recentReady ? <p className="text-sm text-amber-700">⏳ Chargement des collectes… (quelques secondes)</p>
              : (
                <div className="overflow-x-auto">
                  <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={showAllDays} onChange={e => setShowAllDays(e.target.checked)} className="w-4 h-4" />
                    Afficher aussi les journées entièrement versées (toutes les entrées)
                  </label>
                  {!shownDays.length ? <p className="text-sm font-semibold text-emerald-700">✓ Tout est versé : rien à verser pour le moment.</p> : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b border-gray-100"><tr>
                      <th className="text-left py-2 pr-3">Journée de collecte</th>
                      <th className="text-right py-2 px-3">📥 Collecté (entrées)</th>
                      <th className="text-right py-2 px-3">✅ Déjà versé</th>
                      <th className="text-right py-2 px-3">💼 Dans ma caisse (à verser)</th>
                      <th className="text-right py-2 px-3">🚚 Pas encore reçu</th>
                      <th className="py-2 pl-3"></th>
                    </tr></thead>
                    <tbody>
                      {shownDays.map(([k, d]) => {
                        const isOpen = openDay === k
                        const detail = copyDays[k]
                        const dayTransfers = isOpen ? transfersOfDay(k).sort((a: any, b: any) => tDate(b).getTime() - tDate(a).getTime()) : []
                        // Où est l'argent : d'après la copie allégée (même règle que les cartes)
                        const stateOf = (p: any) => p.__bucket === 'verse'
                          ? { label: '✅ Versé à l\'admin', cls: 'bg-emerald-100 text-emerald-800' }
                          : p.__bucket === 'aVerser' ? { label: '💼 Dans ma caisse', cls: 'bg-violet-100 text-violet-800' }
                          : { label: `🚚 Chez ${p.portExpReceivedBy || p.portPayeExpReceivedBy || p.portCollectedBy || 'le livreur'}`, cls: 'bg-orange-100 text-orange-800' }
                        return (<Fragment key={k}>
                          <tr className={`border-b border-gray-50 ${isOpen ? 'bg-blue-50/40' : ''}`}>
                            <td className="py-2 pr-3 font-bold text-gray-800 whitespace-nowrap">{fmtKeyFr(k)}
                              {versementException && versementException.dayKey === k && <span className="ml-2 text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">⭐ exception admin</span>}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-800">{fmtAmt(d.montant || 0)} DH <span className="text-xs text-gray-500">({d.count} exp.)</span></td>
                            <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{(d.verse || 0) > 0 ? `${fmtAmt(d.verse || 0)} DH` : <span className="text-gray-300">—</span>}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-black text-violet-800">{(d.aVerser || 0) > 0 ? <>{fmtAmt(d.aVerser || 0)} DH <span className="text-xs font-normal text-gray-500">({d.nAVerser} exp.)</span></> : <span className="text-gray-300">—</span>}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-orange-700">{(d.nonRecu || 0) > 0 ? `${fmtAmt(d.nonRecu || 0)} DH` : <span className="text-gray-300">—</span>}</td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap">
                              <button onClick={() => { if (!isOpen) ensureCopyDay(k); setOpenDay(isOpen ? null : k) }} className="mr-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold">{isOpen ? 'Fermer ▴' : 'Détail ▾'}</button>
                              {(d.aVerser || 0) > 0 && (
                                <button onClick={() => openVerser(k)} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">Verser ▸</button>)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-blue-50/40"><td colSpan={6} className="px-3 pb-4">
                              {/* Historique des versements de la journée */}
                              <div className="mt-1 mb-3 rounded-lg border border-gray-200 bg-white p-3">
                                <p className="text-xs font-bold text-gray-700 mb-1">🧾 Versements de cette journée ({dayTransfers.length})</p>
                                {!dayTransfers.length ? <p className="text-xs text-gray-500">Aucun versement pour cette journée.</p> : dayTransfers.map((t: any) => {
                                  const st = STATUS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-700' }
                                  const dd = tDate(t)
                                  return (
                                    <div key={t.id} className="flex flex-wrap items-center gap-2 py-1 text-xs border-t border-gray-100 first:border-t-0">
                                      <span className="text-gray-600 w-32">{dd.toLocaleDateString('fr-FR')} {dd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                      <b className="tabular-nums">{fmtAmt(t.amount)} DH</b>
                                      <span className="text-gray-500">{t.codParcelCount ? `${t.codParcelCount} exp.` : ''}</span>
                                      <span className={`px-2 py-0.5 rounded-full font-bold ${st.cls}`}>{st.label}</span>
                                      {t.status === 'rejected' && t.rejectionReason && <span className="text-red-700">Motif : {t.rejectionReason}</span>}
                                      <button onClick={() => handlePrintVersement(t)} className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 font-semibold"><Printer className="w-3 h-3" /> Imprimer</button>
                                    </div>
                                  )
                                })}
                              </div>
                              {/* Détail des expéditions collectées ce jour-là */}
                              <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 text-gray-600"><tr>
                                    <th className="text-left py-1.5 px-2">N° EXP</th><th className="text-left py-1.5 px-2">Type</th><th className="text-left py-1.5 px-2">Créée</th>
                                    <th className="text-left py-1.5 px-2">Encaissé par</th><th className="text-right py-1.5 px-2">Montant</th><th className="text-left py-1.5 px-2">Où est l'argent</th>
                                  </tr></thead>
                                  <tbody>
                                    {detail === 'loading' || !detail ? (
                                      <tr><td colSpan={6} className="py-3 px-2 text-center text-gray-500">⏳ Chargement des expéditions de la journée…</td></tr>
                                    ) : [...detail.parcels].sort((a: any, b: any) => (toDateSafe(a.createdAt)?.getTime() || 0) - (toDateSafe(b.createdAt)?.getTime() || 0)).map((p: any) => {
                                      const s = stateOf(p)
                                      const cd = toDateSafe(p.createdAt)
                                      return (
                                        <tr key={p.id} className="border-t border-gray-100">
                                          <td className="py-1 px-2 font-mono font-bold text-blue-700">{p.senderNic || p.trackingId || p.id}</td>
                                          <td className="py-1 px-2">{p.portType === 'port_du' ? 'Port dû' : 'Port payé (guichet)'}</td>
                                          <td className="py-1 px-2">{cd ? cd.toLocaleDateString('fr-FR') : '—'}</td>
                                          <td className="py-1 px-2">{p.portCollectedBy || '—'}</td>
                                          <td className="py-1 px-2 text-right tabular-nums font-semibold">{fmtAmt(p.price)} DH</td>
                                          <td className="py-1 px-2"><span className={`px-2 py-0.5 rounded-full font-bold ${s.cls}`}>{s.label}</span></td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td></tr>
                          )}
                        </Fragment>)
                      })}
                    </tbody>
                    <tfoot><tr className="font-black">
                      <td className="py-2 pr-3">Total</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{fmtAmt(totalCollecte)} DH</td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{fmtAmt(totalVerse)} DH</td>
                      <td className="py-2 px-3 text-right tabular-nums text-violet-800">{fmtAmt(totalAVerser)} DH</td>
                      <td className="py-2 px-3 text-right tabular-nums text-orange-700">{fmtAmt(totalNonRecu)} DH</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                  )}
                  <p className="mt-2 text-[11px] text-gray-500">📥 Collecté = toutes les entrées de la journée (ports dus encaissés + ports payés ramassés au guichet). « Pas encore reçu » : encore chez le chef d'exploitation ou les livreurs ; ils passent « dans ma caisse » (et deviennent versables) quand vous les recevez. « Détail » : expéditions de la journée et versements déjà faits.</p>
                </div>
              )}
          </div>

          {/* Historique */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-gray-900 flex-1">Historique des versements</h3>
              {([['all', 'Tous'], ['pending', 'En attente'], ['confirmed', 'Validés'], ['rejected', 'Refusés']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setHistFilter(k)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${histFilter === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
            {!hist.length ? <p className="text-center py-8 text-gray-500">Aucun versement</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600"><tr>
                    <th className="text-left py-2 px-3">Envoyé le</th><th className="text-right py-2 px-3">Montant</th><th className="text-left py-2 px-3">Journée / note</th>
                    <th className="text-left py-2 px-3">Statut</th><th className="text-center py-2 px-3"></th>
                  </tr></thead>
                  <tbody>
                    {hist.map((t: any) => {
                      const st = STATUS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-700' }
                      const d = tDate(t)
                      return (
                        <tr key={t.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{d.toLocaleDateString('fr-FR')} {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums">{fmtAmt(t.amount)} DH
                            {transferEcart(t) > 0 && <div className="text-[11px] font-semibold text-red-700">envoyé {fmtAmt(transferSent(t))} · écart {fmtAmt(transferEcart(t))}</div>}
                            {t.kind === 'regul' && <div className="text-[11px] font-semibold text-violet-700">Régularisation</div>}
                          </td>
                          <td className="py-2 px-3 text-gray-600">{t.note || '—'}{t.codParcelCount ? <span className="text-xs text-gray-400"> · {t.codParcelCount} exp.</span> : null}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${st.cls}`}>{st.label}</span>
                            {t.status === 'confirmed' && t.confirmedBy && <div className="text-[11px] text-gray-500 mt-0.5">par {t.confirmedBy}</div>}
                            {t.status === 'rejected' && <div className="text-[11px] text-red-700 mt-0.5">{t.rejectionReason ? `Motif : ${t.rejectionReason}` : ''}{t.rejectedBy ? ` (${t.rejectedBy})` : ''}</div>}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => handlePrintVersement(t)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold" title="Imprimer les expéditions de ce versement">
                              <Printer className="w-3.5 h-3.5" /> Imprimer
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Fenêtre « Verser » : même formulaire et mêmes contrôles qu'avant */}
          {verserOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !sendingVersement && setVerserOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                Verser les collectes du {fmtKeyFr(selectedVersementDay)}
              </h3>
              <button onClick={() => setVerserOpen(false)} disabled={sendingVersement} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              {(!copySel || copySel === 'loading') && <p className="text-sm font-semibold text-amber-700">⏳ Chargement des expéditions de la journée…</p>}
              <div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
                  {activeException && (
                    <div className="mb-2 rounded-md bg-amber-100 border border-amber-300 px-2 py-1.5 text-xs font-bold text-amber-900">
                      ⭐ Versement exceptionnel autorisé par l'admin (une seule fois) : <span className="tabular-nums">{fmtAmt(Number(activeException.amount) || 0)} DH</span> au lieu de {fmtAmt(verserJour.montant)} DH
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-700">Montant à verser</span><b className="text-blue-800 text-lg tabular-nums">{fmtAmt(activeException ? (Number(activeException.amount) || 0) : verserJour.montant)} DH</b></div>
                  <div className="flex justify-between text-xs text-gray-600 mt-1"><span>dont expéditions du jour</span><span className="tabular-nums">{fmtAmt(verserJour.duJour)} DH</span></div>
                  <div className="flex justify-between text-xs text-gray-600"><span>dont expéditions antérieures</span><span className="tabular-nums">{fmtAmt(verserJour.montant - verserJour.duJour)} DH</span></div>
                </div>
                {!activeException && (<>
                <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">Montant versé (DH)</label>
                <input
                  type="number" step="0.01" min="0" max={verserJour.montant}
                  value={versementForm.amount}
                  onChange={(e) => setVersementForm({ ...versementForm, amount: e.target.value })}
                  placeholder={`${fmtAmt(verserJour.montant)} (total de la journée)`}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
                {versementForm.amount !== '' && !versementSplit.exact && versementSplit.total > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    {fmtAmt(versementSplit.typed)} DH ne correspond pas à des expéditions entières. Choisissez :
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {versementSplit.lower > 0 && (
                        <button type="button" onClick={() => setVersementForm(f => ({ ...f, amount: String(versementSplit.lower) }))}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100">
                          {fmtAmt(versementSplit.lower)} DH ({versementSplit.lowerIds.length} exp.)
                        </button>
                      )}
                      {versementSplit.upper > versementSplit.lower && (
                        <button type="button" onClick={() => setVersementForm(f => ({ ...f, amount: String(versementSplit.upper) }))}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100">
                          {fmtAmt(versementSplit.upper)} DH ({versementSplit.upperIds.length} exp.)
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-1">
                  Vide = le total de la journée ({fmtAmt(verserJour.montant)} DH). Un montant plus petit fait un versement <b>partiel</b>,
                  toujours en <b>expéditions entières</b> (les plus anciennes d'abord) : les autres restent « à verser ».
                </p>
                </>)}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (optionnel)
                </label>
                <textarea
                  value={versementForm.note}
                  onChange={(e) => setVersementForm({ ...versementForm, note: e.target.value })}
                  placeholder="Ajouter une note..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={handleSendVersement}
                disabled={sendingVersement || !(verserJour.montant > 0)}
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sendingVersement ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Créer le versement
                  </>
                )}
              </button>
            </div>
          </div>
          </div>
          )}
        </div>
        )
      })()}

      {/* 📋 Port dû payé par chèque (recherche) */}
      {portChequeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setPortChequeModal(null)}>
          <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">📋 Port dû payé par chèque</h3>
              <button onClick={() => setPortChequeModal(null)} className="text-gray-400 hover:text-gray-600 transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between">
                <span className="font-mono font-semibold text-blue-600">{nicOf(portChequeModal.parcel)}</span>
                <span className="font-bold text-gray-900">{fmtAmt(portChequeModal.parcel.price)} DH</span>
              </div>
              <label className="block text-sm font-medium text-gray-700">Banque
                <input value={portChequeModal.banque} onChange={e => setPortChequeModal({ ...portChequeModal, banque: e.target.value, error: '' })}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" autoFocus />
              </label>
              <label className="block text-sm font-medium text-gray-700">N° du chèque
                <input value={portChequeModal.numero} onChange={e => setPortChequeModal({ ...portChequeModal, numero: e.target.value, error: '' })}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </label>
              <label className="block text-sm font-medium text-gray-700">Date d'encaissement
                <input type="date" value={portChequeModal.dateEncaissement} onChange={e => setPortChequeModal({ ...portChequeModal, dateEncaissement: e.target.value, error: '' })}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </label>
              {portChequeModal.error && <p className="text-sm text-red-600">{portChequeModal.error}</p>}
              <p className="text-xs text-gray-500">Le chèque suit le circuit des chèques (onglet « Ports dû chèque ») : rien n'entre en caisse espèces.</p>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setPortChequeModal(null)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">Annuler</button>
              <button onClick={submitPortCheque} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white">Collecter le chèque</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal retard */}
      {delayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {delayModal.existingDelay ? 'Modifier' : 'Signaler'} retard de livraison
              </h3>
              <button
                onClick={() => setDelayModal(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Info colis */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">N° EXP:</span>
                  <span className="font-mono font-semibold text-blue-600">
                    {delayModal.parcel.senderNic || delayModal.parcel.sender?.nic || delayModal.parcel.trackingId}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Livreur:</span>
                  <span className="font-semibold text-gray-900">
                    {delayModal.driver?.name || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Client:</span>
                  <span className="font-semibold text-gray-900">
                    {delayModal.parcel.receiver?.name || '-'}
                  </span>
                </div>
              </div>

              {/* Raison */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Raison du retard *
                </label>
                <select
                  value={delayForm.reason}
                  onChange={(e) => setDelayForm({ ...delayForm, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Sélectionner...</option>
                  {DELAY_REASONS.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Détails */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Détails (optionnel)
                </label>
                <textarea
                  value={delayForm.reasonDetail}
                  onChange={(e) => setDelayForm({ ...delayForm, reasonDetail: e.target.value })}
                  placeholder="Informations complémentaires..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setDelayModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveDelay}
                  disabled={savingDelay || !delayForm.reason}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDelay ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🖐️ Modal Édition Rapide */}
      {quickEditModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-lg">🖐️</span>
                  Édition rapide
                </h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">
                  {quickEditModal.parcel?.senderNic || quickEditModal.parcel?.trackingId}
                </p>
              </div>
              <button
                onClick={() => setQuickEditModal({
                  open: false,
                  parcel: null,
                  price: '',
                  portType: '',
                  codAmount: '',
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

            <div className="grid grid-cols-1 gap-4 mb-6">
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
                </select>
              </div>

              {/* RF mixte : part espèces */}
              {quickEditModal.codMixed && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">💵 Montant espèces (DH)</label>
                  <input
                    type="number"
                    value={quickEditModal.codCashAmount || ''}
                    onChange={e => { const v = e.target.value; setQuickEditModal(m => ({ ...m, codCashAmount: v, codAmount: docPartKeepingTotal(m.codAmount, m.codCashAmount, v), error: '' })) }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
              )}
              {/* Montant COD */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">{quickEditModal.codMixed ? (quickEditModal.parcel?.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)') : '💵 Montant COD (DH)'}</label>
                <input
                  type="number"
                  value={quickEditModal.codAmount}
                  onChange={e => setQuickEditModal(m => ({ ...m, codAmount: e.target.value, error: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                  placeholder="Ex: 150"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setQuickEditModal({
                  open: false,
                  parcel: null,
                  price: '',
                  portType: '',
                  codAmount: '',
                  loading: false,
                  error: ''
                })}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!quickEditModal.parcel) return

                  setQuickEditModal(m => ({ ...m, loading: true, error: '' }))

                  try {
                    const updates: any = {}

                    if (quickEditModal.price !== String(quickEditModal.parcel.price || '')) {
                      updates.price = parseFloat(quickEditModal.price) || 0
                    }

                    if (quickEditModal.portType && quickEditModal.portType !== quickEditModal.parcel.portType) {
                      // 🔒 État RELU (pas celui de l'écran) : un port encaissé entre-temps refuse le changement de type
                      const fresh = (await getDoc(fsDoc(db, 'parcels', quickEditModal.parcel.id))).data() || {}
                      Object.assign(updates, portTypeChangeFields({ ...quickEditModal.parcel, ...fresh }, quickEditModal.portType, { uid: auth.currentUser?.uid || null, name: profile?.name || "Chef d'agence" }))
                    }

                    if (quickEditModal.codMixed) {
                      // RF mixte : total = chèque/traite + espèces
                      const res = codEditResult({ value: quickEditModal.codAmount, cashValue: quickEditModal.codCashAmount, mixed: true })
                      if (res.error) { setQuickEditModal(m => ({ ...m, loading: false, error: res.error || '' })); return }
                      if (res.total !== (parseFloat(quickEditModal.parcel.codAmount) || 0)) updates.codAmount = res.total
                      if (!res.mixed) { updates.codMixed = false; updates.codCashAmount = 0 }
                      else if (res.cash !== (parseFloat(quickEditModal.parcel.codCashAmount) || 0)) updates.codCashAmount = res.cash
                    } else if (quickEditModal.codAmount !== String(quickEditModal.parcel.codAmount || '')) {
                      updates.codAmount = parseFloat(quickEditModal.codAmount) || 0
                    }

                    if (Object.keys(updates).length === 0) {
                      setQuickEditModal(m => ({ ...m, error: 'Aucune modification détectée' }))
                      return
                    }

                    await updateParcel(quickEditModal.parcel.id, updates)

                    // ✅ Mettre à jour le cache local ET le contexte pour recalculer les stats
                    setModifiedParcels(prev => ({ ...prev, [quickEditModal.parcel.id]: updates }))
                    updateParcelOptimistic(quickEditModal.parcel.id, updates)

                    // ✅ Mettre à jour searchResults si en mode recherche
                    if (searchResults) {
                      setSearchResults(prev =>
                        prev ? prev.map(p => p.id === quickEditModal.parcel.id ? { ...p, ...updates } : p) : prev
                      )
                    }

                    // Fermer le modal
                    setQuickEditModal({
                      open: false,
                      parcel: null,
                      price: '',
                      portType: '',
                      codAmount: '',
                      loading: false,
                      error: ''
                    })
                  } catch (err: any) {
                    console.error('Erreur édition:', err)
                    setQuickEditModal(m => ({ ...m, loading: false, error: err.message || 'Erreur lors de la sauvegarde' }))
                  }
                }}
                disabled={quickEditModal.loading}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {quickEditModal.loading ? 'Enregistrement...' : '💾 Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
