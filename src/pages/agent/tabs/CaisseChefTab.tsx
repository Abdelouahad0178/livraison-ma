import { useState, useMemo, useEffect, useDeferredValue, startTransition } from 'react'
import PendingBadge from '../../../components/PendingBadge'
import {
  Wallet, TrendingUp, AlertCircle, User, Package, Clock, Check, X,
  Send, Eye, Search, Calendar, Filter, Banknote, Printer
} from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import DateFilter from '../DateFilter'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import {
  createAdminTransferFromAgent,
  subscribeMyAdminTransfers
} from '../../../firebase/caisse'
import {
  createDeliveryDelay,
  updateDeliveryDelay,
  deleteDeliveryDelay,
  subscribeDeliveryDelays
} from '../../../firebase/delivery'
import { collectPortDu, uncollectPortDu } from '../../../firebase/cod'
import { updateParcel, searchParcels, subscribeAgencyReturnParcels } from '../../../firebase/parcels'
import { useAgencyParcelsFull } from '../../../hooks/useAgencyParcelsFull'
import LoadProgress from '../../../components/LoadProgress'
import { collection, query, where, onSnapshot, documentId } from 'firebase/firestore'
import { db } from '../../../firebase/db'
import { shouldTriggerSearch } from '../../../utils/searchUtils'
import { printPortsCollectes, printVersementParcels, printDriverExpeditionsTable, printBilanJournee, printInstancesRetards } from '../../../utils/agentPrintUtils'
import HScrollArrows from '../../../components/HScrollArrows'
import DriverCaisseCard from '../../../components/caisse/DriverCaisseCard'
import { printFeuilleDeCharge } from '../../../utils/printFeuilleDeCharge'
import { useGarePending } from '../../exploitation/useGarePending'
import { useDepotIds } from '../../exploitation/useDepotIds'
import {
  firestoreBoundsFor, caisseFilterByDate, safeParseAmount, computeCaisseView,
  caisseCodAmountOfType, caisseCodTotals, CAISSE_DEFAULT_PRESET, caisseDefaultOperationalDay, CAISSE_STATUS_OPTIONS,
} from '../../../utils/agencyCaisseRules'
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
  } = useAgentCtx()

  // État des onglets
  const [activeTab, setActiveTab] = useState<'livreurs' | 'journee' | 'instances' | 'versements' | 'historique'>('livreurs')

  // Filtres date
  // ⚡ RÉACTIVITÉ DES BOUTONS : les valeurs « …Ui » sont URGENTES (bouton/sélecteur mis à jour
  // immédiatement, chargement Firestore lancé aussitôt) ; les calculs lourds (soldes, livreurs,
  // totaux) utilisent les copies DIFFÉRÉES (mêmes noms qu'avant), recalculées en arrière-plan.
  // 📅 Journée de collecte ouverte (clic sur une carte « Collectes par jour »)
  const [collecteDay, setCollecteDay] = useState<any>(null)
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
  const caisseBounds = firestoreBoundsFor(datePresetUi, dateFromUi, dateToUi, operationalDayUi)
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
  )
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

  // Fusion colis + retours, même logique que allDisplayParcels côté Expéditions
  const allDisplayParcels = useMemo(() => {
    const map = new Map()
    ;(caisseParcels || []).forEach((p: any) => map.set(p.id, p))
    ;(caisseReturnParcels || []).forEach((p: any) => map.set(p.id, p))
    return [...map.values()]
  }, [caisseParcels, caisseReturnParcels])

  // Filtres
  const [driverFilterUi, setDriverFilter] = useState('all')
  const [statusFilterUi, setStatusFilter] = useState('all')
  // Copies DIFFÉRÉES des filtres (lues par tous les calculs) — un seul objet pour qu'elles
  // changent ensemble dans le même rendu d'arrière-plan.
  const urgentCaisseFilters = useMemo(
    () => ({ datePreset: datePresetUi, dateFrom: dateFromUi, dateTo: dateToUi, operationalDay: operationalDayUi, driverFilter: driverFilterUi, statusFilter: statusFilterUi }),
    [datePresetUi, dateFromUi, dateToUi, operationalDayUi, driverFilterUi, statusFilterUi]
  )
  const deferredCaisseFilters = useDeferredValue(urgentCaisseFilters)
  const { datePreset, dateFrom, dateTo, operationalDay, driverFilter, statusFilter } = deferredCaisseFilters
  const caisseFiltersPending = deferredCaisseFilters !== urgentCaisseFilters
  const [searchQuery, setSearchQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
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
  const [sendingVersement, setSendingVersement] = useState(false)
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])
  const [deliveryDelays, setDeliveryDelays] = useState<any[]>([])

  // État collecte ports
  const [collectingPortIds, setCollectingPortIds] = useState<Set<string>>(new Set())

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

  // Abonnement aux versements admin
  useEffect(() => {
    if (!uid || !isChef) return

    const unsubscribe = subscribeMyAdminTransfers(
      uid,
      setAdminTransfers,
      (err: any) => console.error('Erreur chargement versements:', err)
    )

    return () => unsubscribe()
  }, [uid, isChef])

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

  // 🔍 Recherche serveur dans TOUTES les expéditions + Écoute temps réel
  useEffect(() => {
    const searchTerm = searchQuery.trim()

    // Si champ complètement vide, tout réinitialiser
    if (searchTerm === '') {
      setSearchResults(null)
      setSearching(false)
      setStatusFilter('all')
      setIncludeArchived(false)
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

    const performSearch = async () => {
      setSearching(true)
      try {
        console.log(`🔍 Recherche serveur: "${searchTerm}" (archives: ${includeArchived})`)
        const results = await searchParcels(searchTerm, { limit: 50, includeArchived })
        // Filtrer par ville si chef d'agence
        const filtered = results.filter((p: any) =>
          p.destinationCity === profile?.city || p.originCity === profile?.city
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
        console.error('❌ Erreur recherche:', error)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }

    performSearch()

    // Nettoyage: arrêter l'écoute quand la recherche change
    return () => {
      if (unsubscribeRealtime) {
        unsubscribeRealtime()
        console.log('🔇 Écoute temps réel arrêtée')
      }
    }
  }, [searchQuery, includeArchived, profile?.city])

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

    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    return resultsWithModifications.filter((p: any) => {
      const isPortDu = p.portType === 'port_du' && !p.portPayeMethod
      const isCollected = p.portStatus === 'collected' || p.portStatus === 'received'
      const isInDelivery = p.status === 'En cours de livraison' || p.status === 'Livré'

      let isLate = false
      if (isPortDu && p.status === 'En cours de livraison' && p.deliveryAssignedAt) {
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        isLate = assignedDate < oneDayAgo
      }

      switch (statusFilter) {
        case 'a_collecter':
          return isPortDu && !p.portStatus && isInDelivery && p.status?.toLowerCase().trim() !== 'retourné'
        case 'collecte':
          return isPortDu && isCollected && p.status?.toLowerCase().trim() !== 'retourné'
        case 'en_compte':
          return String(p.portType || '').startsWith('port_en_compte') && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
        case 'ramasse':
          return p.portType === 'port_paye' && !p.portPayeMethod && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
        case 'en_retard':
          return isPortDu && isLate && p.status?.toLowerCase().trim() !== 'retourné'
        default:
          return true
      }
    })
  }, [searchResults, statusFilter, modifiedParcels])

  // 🏬 Colis arrivés en attente en gare (hors fenêtre de dates) + comptes « Livreur en gare »
  const garePending = useGarePending(profile?.city)
  const depotIds = useDepotIds(profile?.city)

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
    depotIds,
    deliveryDelays,
  }), [allDisplayParcels, garePending, datePreset, dateFrom, dateTo, operationalDay, driverFilter, statusFilter,
    searchResults, modifiedParcels, extraCollectedParcels, depotIds, deliveryDelays, profile?.city])
  const {
    stats, soldeCaisseGlobal, soldeLivreur, portsCollectesForPrint, drivers, filteredDrivers,
    bilanJournee, instances, collectesParJour, periodLabel, statusFilterLabel,
  } = caisseView
  const filteredStats = caisseView.filteredStats

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
  const handleReceivePortPaye = async (parcel: any) => {
    if (!confirm(`Confirmer la réception du port payé de ${fmtAmt(parcel.price)} DH ramassé par le livreur pour l'expédition ${parcel.senderNic || parcel.trackingId} ?`)) {
      return
    }

    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const updatedData = {
        portStatus: 'received',  // Chef a reçu l'argent du livreur
        portReceivedBy: profile?.name || '',
        portReceivedById: uid || '',
        portReceivedAt: new Date(),
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
      console.error('❌ [handleReceivePortPaye] ERREUR:', err)
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

  // 🆕 Annuler la réception d'un port payé (pour corriger les erreurs)
  const handleUncollectPortPaye = async (parcel: any) => {
    if (!confirm(`Annuler la réception du port payé de ${fmtAmt(parcel.price)} DH pour l'expédition ${parcel.senderNic || parcel.trackingId} ?\n\nLe port sera remis en état "Ramassé" (à recevoir).`)) {
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
  const handleCollectPort = async (parcel: any) => {
    if (!confirm(`Confirmer la collecte du port de ${fmtAmt(parcel.price)} DH pour l'expédition ${parcel.senderNic || parcel.trackingId} ?`)) {
      return
    }

    // ⚠️ Garde-fou : sans uid/nom d'agent valides, la mise à jour Firestore
    // sera rejetée par les règles de sécurité (portCollectedById doit être
    // l'uid de l'utilisateur connecté). On bloque AVANT toute mise à jour
    // optimiste pour ne pas afficher un état "Collecté" qui ne sera jamais
    // persisté côté serveur.
    if (!uid || !profile?.name) {
      console.error('❌ [handleCollectPort] Paramètres manquants, annulation:', {
        uid,
        profileName: profile?.name,
        parcelId: parcel.id
      })
      alert("❌ Erreur: impossible d'identifier l'agent connecté (uid ou nom manquant). Reconnectez-vous et réessayez.")
      return
    }

    console.log('🔵 [handleCollectPort] DÉBUT:', {
      parcelId: parcel.id,
      nic: parcel.senderNic || parcel.trackingId,
      price: parcel.price,
      currentPortStatus: parcel.portStatus,
      uid,
      agentName: profile.name
    })

    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const updatedData = {
        portStatus: 'collected',
        portCollectedBy: profile.name,
        portCollectedById: uid,
        portCollectedAt: new Date(),
        portDuReceivedMethod: 'especes',
      }

      console.log('🟢 [handleCollectPort] MISE À JOUR avec:', updatedData)

      // SOLUTION SIMPLIFIÉE : Une seule source de vérité via modifiedParcels
      // Cela garantit que dataSource recalcule immédiatement
      setModifiedParcels(prev => {
        const updated = { ...prev, [parcel.id]: updatedData }
        console.log('🟡 [handleCollectPort] modifiedParcels mis à jour:', {
          parcelId: parcel.id,
          totalModified: Object.keys(updated).length
        })
        return updated
      })

      // Mise à jour optimiste pour le contexte (pour d'autres composants)
      updateParcelOptimistic(parcel.id, updatedData)

      // Mise à jour de searchResults si en mode recherche (pour cohérence)
      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, ...updatedData } : p
          ) : prev
        )
        console.log('🔵 [handleCollectPort] searchResults mis à jour')
      }

      console.error('🟢 [handleCollectPort] AVANT appel Firebase collectPortDu:', {
        parcelId: parcel.id,
        agentName: profile.name,
        uid
      })
      await collectPortDu(
        parcel.id,
        profile.name,
        uid,
        !!parcel.isArchived
      )
      console.error('✅ [handleCollectPort] APRÈS appel Firebase collectPortDu: écriture confirmée par le SDK')

      // 🗄️ Si le colis collecté n'est pas dans allDisplayParcels (vieux colis > 30j),
      // le stocker dans extraCollectedParcels pour qu'il apparaisse dans les statistiques
      const isInAllParcels = (allDisplayParcels || []).some((p: any) => p.id === parcel.id)
      if (!isInAllParcels && searchResults) {
        setExtraCollectedParcels(prev => ({
          ...prev,
          [parcel.id]: { ...parcel, ...updatedData }
        }))
      }
    } catch (err: any) {
      // ⚠️ Erreur capturée explicitement (ex: permission-denied si les règles
      // Firestore ne sont pas déployées, document verrouillé, etc.)
      console.error('❌ [handleCollectPort] ERREUR Firebase collectPortDu:', {
        code: err?.code,
        message: err?.message,
        parcelId: parcel.id,
        uid,
        agentName: profile?.name,
        err
      })
      alert(`❌ Erreur lors de la collecte du port: ${err?.code || ''} ${err?.message || err}`)

      // Annuler TOUTES les mises à jour en cas d'erreur
      setModifiedParcels(prev => {
        const updated = { ...prev }
        delete updated[parcel.id]
        return updated
      })

      updateParcelOptimistic(parcel.id, {
        portStatus: null,
        portCollectedBy: null,
        portCollectedById: null,
        portCollectedAt: null,
        portDuReceivedMethod: null,
      })

      if (searchResults) {
        setSearchResults(prev =>
          prev ? prev.map(p =>
            p.id === parcel.id ? { ...p, portStatus: null } : p
          ) : prev
        )
      }

      // Annuler aussi extraCollectedParcels
      setExtraCollectedParcels(prev => {
        const updated = { ...prev }
        delete updated[parcel.id]
        return updated
      })
    } finally {
      setCollectingPortIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(parcel.id)
        return newSet
      })
      console.log('🏁 [handleCollectPort] FIN')
    }
  }

  // Annuler la collecte d'un port dû
  const handleUncollectPort = async (parcel: any) => {
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
      await updateParcel(parcel.id, updatedData)
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
    const amount = safeParseAmount(versementForm.amount)

    if (amount <= 0) {
      alert('⚠️ Veuillez entrer un montant valide')
      return
    }

    if (amount > stats.soldeAVerser) {
      alert(`⚠️ Le montant ne peut pas dépasser le solde disponible (${fmtAmt(stats.soldeAVerser)} DH)`)
      return
    }

    // 🆕 Récupérer les IDs des ports collectés non encore versés
    const portsCollectesIds = portsCollectesForPrint
      .filter((p: any) => !p.portAdminTransferred && !p.adminTransferred)
      .map((p: any) => p.id)

    if (!confirm(`Créer un versement de ${fmtAmt(amount)} DH vers l'admin ?\n\n${portsCollectesIds.length} port(s) collecté(s) seront marqués comme versés.`)) {
      return
    }

    setSendingVersement(true)
    try {
      await createAdminTransferFromAgent({
        fromId: uid,
        fromName: profile?.name || '',
        city: profile?.city,
        amount,
        note: versementForm.note || 'Versement caisse chef d\'agence',
        codParcelIds: portsCollectesIds, // IDs des ports collectés à marquer comme versés
      })

      setVersementForm({ amount: '', note: '' })
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

  // Versements filtrés par date
  const filteredVersements = useMemo(() => {
    const versementDate = (v: any) => {
      if (v.createdAt?.toDate) return v.createdAt.toDate()
      if (v.createdAt) return new Date(v.createdAt)
      return new Date(0)
    }
    return caisseFilterByDate(adminTransfers, datePreset, dateFrom, dateTo, versementDate)
  }, [adminTransfers, datePreset, dateFrom, dateTo])

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

  return (
    <div className="space-y-4">
      <PendingBadge show={caisseFiltersPending} />
      {/* En-tête avec statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Ports à collecter */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-600">À collecter</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {filteredStats.portsACollecterCount}
          </div>
          <div className="text-sm text-blue-700 font-medium mt-1">
            {fmtAmt(filteredStats.portsACollecterMontant)} DH
          </div>
        </div>

        {/* Ports collectés (ports dus) */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Wallet className="w-5 h-5 text-green-600" />
            <span className="text-xs font-semibold text-green-600">Collectés</span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {filteredStats.portsCollectes}
          </div>
          <div className="text-sm text-green-700 font-medium mt-1">
            {fmtAmt(filteredStats.portsCollectesMontant)} DH
          </div>
        </div>

        {/* 🆕 Ports payés à recevoir */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Banknote className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-semibold text-indigo-600">À recevoir</span>
          </div>
          <div className="text-2xl font-bold text-indigo-900">
            {filteredStats.portsPayesARecevoirCount}
          </div>
          <div className="text-sm text-indigo-700 font-medium mt-1">
            {fmtAmt(filteredStats.portsPayesARecevoirMontant)} DH
          </div>
        </div>

        {/* 🆕 Ports payés reçus */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Check className="w-5 h-5 text-teal-600" />
            <span className="text-xs font-semibold text-teal-600">Reçus</span>
          </div>
          <div className="text-2xl font-bold text-teal-900">
            {filteredStats.portsPayesRecusCount}
          </div>
          <div className="text-sm text-teal-700 font-medium mt-1">
            {fmtAmt(filteredStats.portsPayesRecusMontant)} DH
          </div>
        </div>

        {/* En retard */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-600">En retard</span>
          </div>
          <div className="text-2xl font-bold text-amber-900">
            {filteredStats.enRetardCount}
          </div>
          <div className="text-sm text-amber-700 font-medium mt-1">
            &gt; 24 heures
          </div>
        </div>

        {/* Solde à verser */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <span className="text-xs font-semibold text-purple-600">À verser</span>
          </div>
          <div className="text-2xl font-bold text-purple-900">
            {fmtAmt(
              searchResults !== null
                ? filteredStats.soldeAVerser
                : (driverFilter === 'all' ? soldeCaisseGlobal : soldeLivreur)
            )} DH
          </div>
          <div className="text-sm text-purple-700 font-medium mt-1">
            Solde disponible
          </div>
        </div>
      </div>

      {/* 📊 Bandeau "Collecté par jour" (14 derniers jours) */}
      {collectesParJour.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">Collectes par jour (14 derniers jours)</h3>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {collectesParJour.map(([dateStr, data]) => {
              const d = new Date(dateStr)
              const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
              return (
                <button type="button" key={dateStr} onClick={() => setCollecteDay({ dateStr, dayLabel, ...data })}
                  title="Voir le détail et imprimer"
                  className="bg-white border border-green-200 rounded-lg p-3 text-center hover:border-green-400 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{dayLabel}</div>
                  <div className="text-lg font-bold text-green-700">{data.count}</div>
                  <div className="text-xs text-gray-500 mt-1">{data.montant.toFixed(0)} DH</div>
                  <div className="text-[10px] text-green-600 mt-1 font-semibold">👁 Détail</div>
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-xs text-gray-600 text-center">
            Total 14 jours: <strong>{collectesParJour.reduce((s, [, d]) => s + d.count, 0)} colis</strong> pour{' '}
            <strong>{collectesParJour.reduce((s, [, d]) => s + d.montant, 0).toFixed(2)} DH</strong>
          </div>
        </div>
      )}

      {/* 📅 Détail d'une journée de collecte (clic sur une carte) */}
      {collecteDay && (() => {
        const list = [...(collecteDay.parcels || [])].sort((a: any, b: any) => String(a.deliveryDriverName || '').localeCompare(String(b.deliveryDriverName || '')))
        const byDriver = new Map<string, { n: number; m: number }>()
        list.forEach((p: any) => { const k = p.deliveryDriverName || p.portCollectedBy || '—'; const c = byDriver.get(k) || { n: 0, m: 0 }; c.n++; c.m += Number(p.price) || 0; byDriver.set(k, c) })
        const fullDay = new Date(collecteDay.dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={() => setCollecteDay(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">Ports collectés — journée du {fullDay}</h3>
                  <p className="text-xs text-gray-600">{collecteDay.count} colis · <b className="text-green-700">{collecteDay.montant.toFixed(2)} DH</b> · {byDriver.size} livreur(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => printPortsCollectes(list, profile, `Journée d'opération du ${fullDay}`)}
                    className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-2 rounded-lg">
                    <Printer className="w-4 h-4" /> Imprimer
                  </button>
                  <button onClick={() => setCollecteDay(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Fermer">✕</button>
                </div>
              </div>
              <div className="px-5 py-3 flex flex-wrap gap-2 border-b">
                {[...byDriver.entries()].map(([name, v]) => (
                  <span key={name} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1">
                    {name} : <b>{v.n}</b> · {v.m.toFixed(0)} DH
                  </span>
                ))}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">N° EXP</th>
                      <th className="px-3 py-2 text-left">Expéditeur</th>
                      <th className="px-3 py-2 text-left">Destinataire</th>
                      <th className="px-3 py-2 text-left">Livreur</th>
                      <th className="px-3 py-2 text-left">Collecté par</th>
                      <th className="px-3 py-2 text-left">Heure</th>
                      <th className="px-3 py-2 text-right">Port dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p: any, i: number) => {
                      const at = p.portCollectedAt?.toDate ? p.portCollectedAt.toDate() : p.portCollectedAt ? new Date(p.portCollectedAt) : null
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{p.sender?.nic || p.senderNic || p.trackingId}</td>
                          <td className="px-3 py-1.5">{p.sender?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.receiver?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.deliveryDriverName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{p.portCollectedBy || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{at && !isNaN(at.getTime()) ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-green-700">{(Number(p.price) || 0).toFixed(2)} DH</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-green-50 font-bold">
                    <tr><td colSpan={7} className="px-3 py-2">TOTAL — {collecteDay.count} colis</td><td className="px-3 py-2 text-right text-green-800">{collecteDay.montant.toFixed(2)} DH</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Bouton d'impression des ports collectés */}
      {portsCollectesForPrint.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => printPortsCollectes(portsCollectesForPrint, profile)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold text-sm shadow-md"
          >
            <Printer className="w-4 h-4" />
            Imprimer Ports Collectés{' '}
            {datePreset === 'today' && 'Aujourd\'hui '}
            {datePreset === 'week' && '(7 jours) '}
            {datePreset === 'month' && 'Ce Mois '}
            {datePreset === 'day' && dateFrom && `(${dateFrom}) `}
            {datePreset === 'custom' && dateFrom && dateTo && `(${dateFrom} → ${dateTo}) `}
            ({portsCollectesForPrint.length})
          </button>
        </div>
      )}

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
        <button
          onClick={() => setActiveTab('historique')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'historique'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Clock className="w-4 h-4 inline-block mr-2" />
          Historique
        </button>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'livreurs' && (
        <div className="space-y-4">
          {/* Filtre date */}
          <DateFilter
            value={datePresetUi}
            onChange={handleDatePresetChange}
            from={dateFromUi}
            onFromChange={setDateFrom}
            to={dateToUi}
            onToChange={setDateTo}
            tone="blue"
            operationalMode
            operationalDay={operationalDayUi}
            onOperationalDayChange={setOperationalDay}
          />

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

              {/* 🗄️ Checkbox Archives (visible seulement si recherche active) */}
              {searchQuery.trim() && (
                <label className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={e => setIncludeArchived(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-amber-900">
                    🗄️ Inclure archives (+30j)
                  </span>
                </label>
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
                          <th className="text-right py-2 px-3 font-semibold text-gray-700">Montant</th>
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
                            (parcel.pickupDriverId || parcel.status === 'En cours de ramassage')  // Nouveau OU ancien système
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
                                  {parcel.isArchived && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded w-fit">
                                      🗄️ Archivé
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
                                    PP Ramassage
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-xs font-medium">
                                    Port payé
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                {fmtAmt(parcel.price)} DH
                              </td>
                              <td className="py-2 px-3 text-center">
                                {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') ? (
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
                                  {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') ? (
                                    <span className="text-xs text-gray-500 italic">-</span>
                                  ) : (
                                    <>
                                      {isPortDu && (
                                        <>
                                          <button
                                            onClick={() => isCollected ? handleUncollectPort(parcel) : handleCollectPort(parcel)}
                                            disabled={collectingPortIds.has(parcel.id)}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                              isCollected
                                                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                                : 'bg-green-600 hover:bg-green-700 text-white'
                                            } disabled:opacity-50`}
                                          >
                                            {collectingPortIds.has(parcel.id) ? (
                                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : isCollected ? (
                                              'Annuler'
                                            ) : (
                                              'Collecter'
                                            )}
                                          </button>

                                          {parcel.status === 'En cours de livraison' && (
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
                                (parcel.pickupDriverId || parcel.status === 'En cours de ramassage')  // Nouveau OU ancien système
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
                                        PP Ramassage
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
                                    {parcel.status === 'Retourné' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                                        <X className="w-3 h-3" />
                                        Retourné
                                      </span>
                                    ) : isPortPayeRecu ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                        <Check className="w-3 h-3" />
                                        Reçu
                                      </span>
                                    ) : isPortPayeRamasse ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                        <Banknote className="w-3 h-3" />
                                        Ramassé
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
                                  )}
                                  {driverTableColumns.cod && (
                                    <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                      {parcel.codAmount ? `${fmtAmt(parcel.codAmount)} DH` : '-'}
                                      {isMixedCod(parcel) && <div className="text-[10px] font-semibold text-gray-500">{codPartsBreakdown(parcel)}</div>}
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
                                      {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') ? (
                                        <span className="text-xs text-gray-500 italic">-</span>
                                      ) : (
                                        <>
                                          {isPortPayeRecu ? (
                                            <button
                                              onClick={() => handleUncollectPortPaye(parcel)}
                                              disabled={collectingPortIds.has(parcel.id)}
                                              className="text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed bg-red-100 text-red-700 hover:bg-red-200"
                                            >
                                              {collectingPortIds.has(parcel.id) ? '...' : 'Annuler'}
                                            </button>
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
                                                onClick={() => isCollected ? handleUncollectPort(parcel) : handleCollectPort(parcel)}
                                                disabled={collectingPortIds.has(parcel.id)}
                                                className={`text-xs px-3 py-1 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                                  isCollected
                                                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                }`}
                                              >
                                                {collectingPortIds.has(parcel.id)
                                                  ? '...'
                                                  : isCollected
                                                    ? 'Annuler'
                                                    : 'Collecter'}
                                              </button>
                                              {!isCollected && (
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
                                          {/* Bouton Livrer pour toutes les expéditions */}
                                          {parcel.status !== 'Livré' && parcel.status !== 'Retourné' && (
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
              <li><strong>🚨 Livrés non encaissés:</strong> Argent dû mais non collecté (ANOMALIE!)</li>
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
                    <th className="px-4 py-3 text-left font-semibold">Âge</th>
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
                            <span className={`px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
                              {ageJours}j
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

      {activeTab === 'versements' && (
        <div className="space-y-4">
          {/* Formulaire de versement */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Nouveau versement à l'admin
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant (DH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={versementForm.amount}
                  onChange={(e) => setVersementForm({ ...versementForm, amount: e.target.value })}
                  placeholder={`Max: ${fmtAmt(stats.soldeAVerser)} DH`}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Solde disponible: <span className="font-semibold text-blue-600">{fmtAmt(stats.soldeAVerser)} DH</span>
                </p>
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
                disabled={sendingVersement || !versementForm.amount}
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

          {/* Liste des versements en attente */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Versements en attente</h3>

            {adminTransfers.filter((t: any) => t.status === 'pending').length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucun versement en attente
              </div>
            ) : (
              <div className="space-y-3">
                {adminTransfers
                  .filter((t: any) => t.status === 'pending')
                  .map((transfer: any) => (
                    <div
                      key={transfer.id}
                      className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">
                          {fmtAmt(transfer.amount)} DH
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{transfer.note}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {transfer.createdAt?.toDate?.()?.toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                        En attente
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'historique' && (
        <div className="space-y-4">
          {/* Filtre date */}
          <DateFilter
            value={datePresetUi}
            onChange={handleDatePresetChange}
            from={dateFromUi}
            onFromChange={setDateFrom}
            to={dateToUi}
            onToChange={setDateTo}
            tone="blue"
            operationalMode
            operationalDay={operationalDayUi}
            onOperationalDayChange={setOperationalDay}
          />

          {/* Historique */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Historique des versements</h3>
            </div>

            {filteredVersements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>Aucun versement trouvé</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Montant</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Note</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Validé par</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVersements.map((transfer: any) => {
                      const statusConfig = {
                        pending: { label: 'En attente', bg: 'bg-amber-100', text: 'text-amber-700' },
                        confirmed: { label: 'Validé', bg: 'bg-green-100', text: 'text-green-700' },
                        rejected: { label: 'Rejeté', bg: 'bg-red-100', text: 'text-red-700' },
                      }[transfer.status] || { label: transfer.status, bg: 'bg-gray-100', text: 'text-gray-700' }

                      return (
                        <tr key={transfer.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-700">
                            {transfer.createdAt?.toDate?.()?.toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-gray-900">
                            {fmtAmt(transfer.amount)} DH
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {transfer.note || '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {transfer.confirmedBy || '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handlePrintVersement(transfer)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs font-semibold"
                              title="Imprimer les expéditions de ce versement"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Imprimer
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
                    onChange={e => setQuickEditModal(m => ({ ...m, codCashAmount: e.target.value, error: '' }))}
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
                      updates.portType = quickEditModal.portType
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
