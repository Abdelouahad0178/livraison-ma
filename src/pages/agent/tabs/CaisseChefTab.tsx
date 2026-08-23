import { useState, useMemo, useEffect } from 'react'
import {
  Wallet, TrendingUp, AlertCircle, User, Package, Clock, Check, X,
  Send, Eye, ChevronDown, ChevronUp, Search, Calendar, Filter, Banknote
} from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import DateFilter from '../DateFilter'
import { filterByDate, entryDate } from '../../../utils/dateFilter'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import {
  createAdminTransferFromAgent,
  subscribeMyAdminTransfers
} from '../../../firebase/caisse'
import {
  createDeliveryDelay,
  updateDeliveryDelay,
  subscribeDeliveryDelays
} from '../../../firebase/delivery'
import { collectPortDu, uncollectPortDu } from '../../../firebase/cod'
import { updateParcel, searchParcels } from '../../../firebase/parcels'
import { collection, query, where, onSnapshot, documentId } from 'firebase/firestore'
import { db } from '../../../firebase/db'
import { shouldTriggerSearch } from '../../../utils/searchUtils'

// Types
interface DelayReason {
  key: string
  label: string
}

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
    parcels,
    allDisplayParcels,
    agentEntries,
    updateParcelOptimistic,
  } = useAgentCtx()

  // DEBUG: Log au chargement du composant
  console.error('🔍 [CaisseChefTab] DONNÉES AU CHARGEMENT:', {
    'Nombre parcels': parcels?.length || 0,
    'Ville': profile?.city,
    'Rôle': profile?.role
  })

  // État des onglets
  const [activeTab, setActiveTab] = useState<'livreurs' | 'versements' | 'historique'>('livreurs')

  // Filtres date
  const [datePreset, setDatePreset] = useState<any>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Filtres
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)

  // Cache local des modifications faites dans searchResults
  const [modifiedParcels, setModifiedParcels] = useState<Record<string, any>>({})

  // État livreurs
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set())
  const [delayModal, setDelayModal] = useState<any>(null)
  const [delayForm, setDelayForm] = useState({ reason: '', reasonDetail: '' })
  const [savingDelay, setSavingDelay] = useState(false)

  // État versements
  const [versementForm, setVersementForm] = useState({ amount: '', note: '' })
  const [sendingVersement, setSendingVersement] = useState(false)
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])
  const [deliveryDelays, setDeliveryDelays] = useState<any[]>([])

  // État collecte ports
  const [collectingPortIds, setCollectingPortIds] = useState<Set<string>>(new Set())

  // État livraison
  const [deliveringParcelIds, setDeliveringParcelIds] = useState<Set<string>>(new Set())

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
    if (!searchResults || statusFilter === 'all') return searchResults

    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    return searchResults.filter((p: any) => {
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
          return isPortDu && isCollected
        case 'en_retard':
          return isPortDu && isLate && p.status?.toLowerCase().trim() !== 'retourné'
        default:
          return true
      }
    })
  }, [searchResults, statusFilter])

  // 🔒 Fonction sécurisée pour parser les montants
  const safeParseAmount = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  // 🔄 Source de données fusionnée (allDisplayParcels + searchResults + cache modifications)
  const dataSource = useMemo(() => {
    console.log('📊 [dataSource] RECALCUL:', {
      'allDisplayParcels.length': allDisplayParcels?.length || 0,
      'searchResults': searchResults?.length || 0,
      'modifiedParcels': Object.keys(modifiedParcels).length
    })

    // Commencer avec allDisplayParcels pour avoir TOUTES les expéditions (sans filtre de date)
    let source = [...(allDisplayParcels || [])]

    // Si en mode recherche, merger searchResults dans allDisplayParcels
    if (searchResults && searchResults.length > 0) {
      const parcelIds = new Set(source.map((p: any) => p.id))
      const searchIds = new Set(searchResults.map((p: any) => p.id))

      // Merger les expéditions existantes avec searchResults
      source = source.map((p: any) => {
        if (searchIds.has(p.id)) {
          const srParcel = searchResults.find((sr: any) => sr.id === p.id)
          return srParcel ? { ...srParcel, ...p } : p
        }
        return p
      })

      // Ajouter les expéditions de searchResults qui ne sont pas dans source
      const additionalParcels = searchResults.filter((sr: any) => !parcelIds.has(sr.id))
      source = [...source, ...additionalParcels]
    }

    // Appliquer le cache des modifications locales EN DERNIER (priorité absolue)
    // Cela garantit que les modifications utilisateur sont toujours visibles
    source = source.map((p: any) => {
      const modified = modifiedParcels[p.id]
      return modified ? { ...p, ...modified } : p
    })

    console.log('✅ [dataSource] RÉSULTAT:', {
      'source.length': source.length,
      'parcels avec portStatus collected': source.filter((p: any) => p.portStatus === 'collected').length
    })

    return source
  }, [allDisplayParcels, searchResults, modifiedParcels])

  // Calcul des statistiques
  const stats = useMemo(() => {
    console.log('📈 [stats] RECALCUL:', {
      'dataSource.length': dataSource.length,
      'adminTransfers.length': adminTransfers.length,
      'profile.city': profile?.city
    })

    // Ports à collecter (port_du non encaissés, livrés ou en cours de livraison, SAUF retournés)
    const portsACollecter = dataSource.filter((p: any) =>
      p.portType === 'port_du' &&
      !p.portStatus &&
      (p.status === 'En cours de livraison' || p.status === 'Livré') &&
      p.status?.toLowerCase().trim() !== 'retourné' &&
      p.destinationCity === profile?.city
    )

    // Ports collectés (ceux avec portStatus 'collected' ou 'received')
    const portsCollectes = dataSource.filter((p: any) =>
      p.portType === 'port_du' &&
      !p.portPayeMethod &&
      (p.portStatus === 'collected' || p.portStatus === 'received') &&
      p.destinationCity === profile?.city
    )

    // 🆕 Ports payés ramassés localement (à recevoir du livreur)
    // UNIQUEMENT les expéditions en "En cours de ramassage" = ramassage local
    const portsPayesARecevoir = dataSource.filter((p: any) =>
      p.portType === 'port_paye' &&
      !p.portPayeMethod &&  // Exclure les ports en compte
      (p.portStatus === 'collected' || !p.portStatus) &&  // Collecté OU anciennes données sans portStatus
      p.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local
      (p.createdByCity === profile?.city || p.originCity === profile?.city)  // Créé dans cette agence
    )

    // 🆕 Ports payés reçus par le chef (ramassage local uniquement)
    const portsPayesRecus = dataSource.filter((p: any) =>
      p.portType === 'port_paye' &&
      !p.portPayeMethod &&
      p.portStatus === 'received' &&  // Déjà reçu par le chef
      p.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local
      (p.createdByCity === profile?.city || p.originCity === profile?.city)
    )

    // Expéditions en retard (en cours de livraison depuis >24h)
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const enRetard = dataSource.filter((p: any) => {
      if (p.status !== 'En cours de livraison') return false
      if (!p.deliveryAssignedAt) return false
      const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
      return assignedDate < oneDayAgo && p.destinationCity === profile?.city
    })

    // Solde à verser (total collecté - total versé)
    const totalCollecte = portsCollectes.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )

    const totalVerse = adminTransfers
      .filter((t: any) => t.status === 'confirmed')
      .reduce((sum: number, t: any) => sum + safeParseAmount(t.amount), 0)

    // 🆕 Solde disponible = Ports dus collectés + Ports payés reçus (argent physiquement chez le chef)
    const montantPortsPayesARecevoir = portsPayesARecevoir.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )
    const montantPortsPayesRecus = portsPayesRecus.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )
    const soldeAVerser = Math.max(0, totalCollecte + montantPortsPayesRecus - totalVerse)

    console.log('✅ [stats] RÉSULTAT:', {
      'portsACollecter': portsACollecter.length,
      'portsCollectes': portsCollectes.length,
      'portsPayesARecevoir': portsPayesARecevoir.length,
      'portsPayesRecus': portsPayesRecus.length,
      'totalCollecte': totalCollecte,
      'montantPortsPayesARecevoir': montantPortsPayesARecevoir,
      'montantPortsPayesRecus': montantPortsPayesRecus,
      'totalVerse': totalVerse,
      'soldeAVerser (Collectés + Reçus - Versé)': soldeAVerser
    })

    return {
      portsACollecterCount: portsACollecter.length,
      portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
        sum + safeParseAmount(p.price), 0
      ),
      portsCollectes: portsCollectes.length,
      portsCollectesMontant: totalCollecte,
      portsPayesARecevoirCount: portsPayesARecevoir.length,
      portsPayesARecevoirMontant: montantPortsPayesARecevoir,
      portsPayesRecusCount: portsPayesRecus.length,
      portsPayesRecusMontant: montantPortsPayesRecus,
      enRetardCount: enRetard.length,
      soldeAVerser,
    }
  }, [dataSource, adminTransfers, profile?.city])

  // 💰 Solde de caisse global (sans filtre de date)
  const soldeCaisseGlobal = useMemo(() => {
    // Utiliser allDisplayParcels (toutes les données) au lieu de dataSource (filtré)
    const allParcels = allDisplayParcels || []

    // Ports dus collectés (TOUS, sans filtre date)
    const portsCollectes = allParcels.filter((p: any) =>
      p.portType === 'port_du' &&
      !p.portPayeMethod &&
      (p.portStatus === 'collected' || p.portStatus === 'received') &&
      p.destinationCity === profile?.city
    )

    // Ports payés reçus (TOUS, sans filtre date)
    const portsPayesRecus = allParcels.filter((p: any) =>
      p.portType === 'port_paye' &&
      !p.portPayeMethod &&
      p.portStatus === 'received' &&
      (p.createdByCity === profile?.city || p.originCity === profile?.city)
    )

    const totalCollecte = portsCollectes.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )

    const montantRecus = portsPayesRecus.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )

    // 🔄 IGNORE les versements pour repartir sur une base saine
    // (anciens versements faussaient le calcul)
    return totalCollecte + montantRecus
  }, [allDisplayParcels, profile?.city])

  // 💰 Solde d'un livreur spécifique (sans filtre de date)
  const soldeLivreur = useMemo(() => {
    if (driverFilter === 'all') return 0

    const allParcels = allDisplayParcels || []

    // Ports dus collectés par CE livreur (TOUS, sans filtre date)
    const portsCollectes = allParcels.filter((p: any) =>
      p.portType === 'port_du' &&
      !p.portPayeMethod &&
      (p.portStatus === 'collected' || p.portStatus === 'received') &&
      p.destinationCity === profile?.city &&
      p.deliveryDriverId === driverFilter
    )

    // Ports payés REÇUS ramassés par CE livreur (TOUS, sans filtre date)
    const portsPayesRecus = allParcels.filter((p: any) =>
      p.portType === 'port_paye' &&
      !p.portPayeMethod &&
      p.portStatus === 'received' &&
      (p.createdByCity === profile?.city || p.originCity === profile?.city) &&
      p.deliveryDriverId === driverFilter
    )

    const totalCollecte = portsCollectes.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )

    const totalPortsPayesRecus = portsPayesRecus.reduce((sum: number, p: any) =>
      sum + safeParseAmount(p.price), 0
    )

    // Solde = ce que le livreur a DONNÉ au chef (collectés + reçus)
    return totalCollecte + totalPortsPayesRecus
  }, [allDisplayParcels, driverFilter, profile?.city])

  // Liste des livreurs actifs
  const drivers = useMemo(() => {
    // DEBUG: Vérifier les données au chargement
    const withDriver = dataSource.filter((p: any) => p.deliveryDriverId).length
    const inCity = dataSource.filter((p: any) => p.destinationCity === profile?.city).length
    const both = dataSource.filter((p: any) =>
      p.deliveryDriverId && p.destinationCity === profile?.city
    ).length

    console.error('📊 [CaisseChefTab] CALCUL LIVREURS:', {
      '1️⃣ Total parcels': dataSource.length,
      '2️⃣ Ville profil': profile?.city,
      '3️⃣ Avec deliveryDriverId': withDriver,
      '4️⃣ Dans cette ville': inCity,
      '5️⃣ Avec driver ET dans ville': both
    })

    const driversMap = new Map()

    dataSource.forEach((p: any) => {
      // Exclure les expéditions retournées
      const isReturned = p.returnedAt || p.wasReturned || p.status === 'Retourné'

      if (p.deliveryDriverId && p.destinationCity === profile?.city && !isReturned) {
        if (!driversMap.has(p.deliveryDriverId)) {
          driversMap.set(p.deliveryDriverId, {
            id: p.deliveryDriverId,
            name: p.deliveryDriverName,
            parcels: [],
          })
        }
        driversMap.get(p.deliveryDriverId).parcels.push(p)
      }
    })

    // Ajouter les expéditions sans livreur (reçues OU locales, non assignées)
    // TOUTES les expéditions non retournées dans la ville, même celles livrées ou en cours
    const unknownParcels = dataSource.filter((p: any) => {
      return (
        !p.deliveryDriverId &&
        p.destinationCity === profile?.city &&  // Destination = ma ville (inclut locales + reçues)
        !(p.returnedAt || p.wasReturned || p.status === 'Retourné')  // Exclure seulement les retournées
      )
    })

    if (unknownParcels.length > 0) {
      driversMap.set('unknown', {
        id: 'unknown',
        name: '📦 Non assigné',
        parcels: unknownParcels,
      })
    }

    return Array.from(driversMap.values()).map(driver => {
      // Séparer les ports dû pour les calculs de collecte
      // IMPORTANT: Le livreur livre TOUTES les expéditions (port payé + port dû)
      // mais ne collecte de l'argent QUE pour les ports dû

      // LOGIQUE ROBUSTE : Une expédition est PORT DÛ si :
      // 1. portType === 'port_du' (exclu automatiquement port_en_compte_destinataire) ET
      // 2. portPayeMethod n'est PAS défini (sinon c'est un port payé)
      // Note: Les clients en compte (port_en_compte_*) sont traités comme port payé
      const portDuParcels = driver.parcels.filter((p: any) =>
        p.portType === 'port_du' && !p.portPayeMethod
      )

      // DEBUG: Vérifier les types de port
      if (driver.parcels.length !== portDuParcels.length) {
        console.log(`[DEBUG] Livreur ${driver.name}:`, {
          total: driver.parcels.length,
          portDu: portDuParcels.length,
          details: driver.parcels.map((p: any) => ({
            nic: p.senderNic || p.trackingId,
            portType: p.portType,
            portPayeMethod: p.portPayeMethod,
            isPortDu: p.portType === 'port_du' && !p.portPayeMethod
          }))
        })
      }

      // Calculs par livreur - basés uniquement sur les ports dû
      const assignedToday = driver.parcels.filter((p: any) => {
        // Colis sans date d'assignation = considérés comme assignés aujourd'hui
        if (!p.deliveryAssignedAt) return true

        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return assignedDate >= today
      })

      // CORRECTION: Double-vérification explicite pour exclure les ports payés ET retournés
      // Pour "Non assigné", tous les ports dus non collectés sont "À collecter"
      // Pour les assignés, seulement ceux "En cours de livraison" ou "Livré"
      const portsACollecter = portDuParcels.filter((p: any) => {
        const isReturned = p.returnedAt || p.wasReturned || p.status === 'Retourné'
        const isCollected = p.portStatus === 'collected' || p.portStatus === 'received'

        if (isReturned || isCollected) return false

        // Si "Non assigné", tous les ports dus non collectés/retournés sont à collecter
        if (driver.id === 'unknown') return true

        // Si assigné, seulement les "En cours de livraison" ou "Livré"
        return p.status === 'En cours de livraison' || p.status === 'Livré'
      })

      // Ports collectés = ceux avec portStatus 'collected' ou 'received'
      const portsCollectes = portDuParcels.filter((p: any) =>
        p.portStatus === 'collected' || p.portStatus === 'received'
      )

      // 🆕 Ports payés par ce livreur (afficher TOUS, compter uniquement ramassage local)
      const portsPayesParcels = driver.parcels.filter((p: any) =>
        p.portType === 'port_paye' &&
        !p.portPayeMethod
      )
      // Compter uniquement les ramassages locaux pour les statistiques
      const portsPayesARecevoir = portsPayesParcels.filter((p: any) =>
        (p.portStatus === 'collected' || !p.portStatus) &&  // Pas encore versé au chef
        p.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local pour stats
        (p.createdByCity === profile?.city || p.originCity === profile?.city)
      )
      const portsPayesRecus = portsPayesParcels.filter((p: any) =>
        p.portStatus === 'received' &&  // Déjà reçu par le chef
        p.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local pour stats
        (p.createdByCity === profile?.city || p.originCity === profile?.city)
      )

      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const enRetard = portDuParcels.filter((p: any) => {
        if (p.portType !== 'port_du') return false  // Vérification explicite
        if (p.status !== 'En cours de livraison') return false
        if (!p.deliveryAssignedAt) return false
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        return assignedDate < oneDayAgo
      })

      return {
        ...driver,
        // Garder TOUTES les expéditions (port payé + port dû)
        parcels: driver.parcels,
        // Ajouter les ports dû séparément pour référence
        portDuParcels: portDuParcels,
        // Ajouter les ports payés séparément
        portsPayesParcels: portsPayesParcels,
        assignedTodayCount: assignedToday.length,
        portsACollecterCount: portsACollecter.length,
        portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsCollectesCount: portsCollectes.length,
        portsCollectesMontant: portsCollectes.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsPayesARecevoirCount: portsPayesARecevoir.length,
        portsPayesARecevoirMontant: portsPayesARecevoir.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsPayesRecusCount: portsPayesRecus.length,
        portsPayesRecusMontant: portsPayesRecus.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        enRetardCount: enRetard.length,
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [dataSource, agentEntries, profile?.city])

  // Filtrer les livreurs
  const filteredDrivers = useMemo(() => {
    console.error('🔍 [filteredDrivers] DÉBUT:', {
      'Drivers total': drivers.length,
      'datePreset': datePreset,
      'Total parcels dans drivers': drivers.reduce((sum, d) => sum + d.parcels.length, 0)
    })

    let result = drivers

    // Filtrer les colis de chaque livreur par date d'assignation
    result = result.map(driver => {
      const filteredParcels = driver.parcels.filter((p: any) => {
        // Si le filtre est 'all', montrer TOUS les colis
        if (datePreset === 'all') return true

        // Pour "Non assigné", utiliser la date de création au lieu de la date d'assignation
        if (driver.id === 'unknown') {
          // Si le filtre est 'all', inclure TOUS les parcels de "Non assigné"
          if (datePreset === 'all') return true

          if (!p.createdAt) return false
          const createdDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)

          const now = new Date()
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

          if (datePreset === 'today') {
            const tomorrow = new Date(today)
            tomorrow.setDate(tomorrow.getDate() + 1)
            return createdDate >= today && createdDate < tomorrow
          }

          if (datePreset === '7days') {
            const sevenDaysAgo = new Date(today)
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
            return createdDate >= sevenDaysAgo && createdDate < new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }

          if (datePreset === 'thisMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
            return createdDate >= firstDay && createdDate <= lastDay
          }

          if (datePreset === 'custom' && dateFrom && dateTo) {
            const from = new Date(dateFrom)
            const to = new Date(dateTo)
            to.setHours(23, 59, 59, 999)
            return createdDate >= from && createdDate <= to
          }

          return true
        }

        // Si pas de date d'assignation, EXCLURE du filtre (ne pas inclure par défaut)
        if (!p.deliveryAssignedAt) return false

        // Convertir la date Firestore en Date JS
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)

        // Logique de filtrage directe selon le preset
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        if (datePreset === 'today') {
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)
          return assignedDate >= today && assignedDate < tomorrow
        }

        if (datePreset === '7days') {
          const sevenDaysAgo = new Date(today)
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
          return assignedDate >= sevenDaysAgo && assignedDate < new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }

        if (datePreset === 'thisMonth') {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
          return assignedDate >= firstDay && assignedDate <= lastDay
        }

        if (datePreset === 'custom' && dateFrom && dateTo) {
          const from = new Date(dateFrom)
          const to = new Date(dateTo)
          to.setHours(23, 59, 59, 999)
          return assignedDate >= from && assignedDate <= to
        }

        // Par défaut, inclure si aucun filtre spécifique
        return true
      })

      // Appliquer le filtre de statut de collecte UNIQUEMENT si on n'est PAS en mode recherche
      // (en mode recherche, le filtre s'applique aux résultats de recherche)
      let statusFilteredParcels = filteredParcels
      if (statusFilter !== 'all' && !searchQuery.trim()) {
        const now = new Date()
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        statusFilteredParcels = filteredParcels.filter((p: any) => {
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
              return isPortDu && isCollected
            case 'en_retard':
              return isPortDu && isLate && p.status?.toLowerCase().trim() !== 'retourné'
            default:
              return true
          }
        })
      }

      // Recalculer les statistiques pour les colis filtrés
      // IMPORTANT: Filtrer uniquement les ports dus (même logique que drivers)
      const filteredPortDuParcels = statusFilteredParcels.filter((p: any) =>
        p.portType === 'port_du' && !p.portPayeMethod
      )

      const assignedToday = statusFilteredParcels.filter((p: any) => {
        // Colis sans date d'assignation = considérés comme assignés aujourd'hui
        if (!p.deliveryAssignedAt) return true

        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return assignedDate >= today
      })

      const portsACollecter = filteredPortDuParcels.filter((p: any) => {
        const isReturned = p.returnedAt || p.wasReturned || p.status === 'Retourné'
        const isCollected = p.portStatus === 'collected' || p.portStatus === 'received'

        if (isReturned || isCollected) return false

        // Si "Non assigné", tous les ports dus non collectés/retournés sont à collecter
        if (driver.id === 'unknown') return true

        // Si assigné, seulement les "En cours de livraison" ou "Livré"
        return p.status === 'En cours de livraison' || p.status === 'Livré'
      })

      // Ports collectés = ceux avec portStatus 'collected' ou 'received'
      const portsCollectes = filteredPortDuParcels.filter((p: any) =>
        p.portStatus === 'collected' || p.portStatus === 'received'
      )

      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const enRetard = filteredPortDuParcels.filter((p: any) => {
        if (p.portType !== 'port_du') return false  // Vérification explicite
        if (p.portPayeMethod) return false          // Exclure ports payés
        if (p.status !== 'En cours de livraison') return false
        if (!p.deliveryAssignedAt) return false
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        return assignedDate < oneDayAgo
      })

      return {
        ...driver,
        parcels: statusFilteredParcels,
        assignedTodayCount: assignedToday.length,
        portsACollecterCount: portsACollecter.length,
        portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsCollectesCount: portsCollectes.length,
        portsCollectesMontant: portsCollectes.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        enRetardCount: enRetard.length,
      }
    }).filter(d => d.parcels.length > 0) // Ne garder que les livreurs avec des colis dans la période

    if (driverFilter !== 'all') {
      result = result.filter(d => d.id === driverFilter)
    }

    // Note: searchQuery est utilisé pour la recherche serveur, pas pour filtrer
    // la liste normale des livreurs. Donc on ne filtre PAS par searchQuery ici.

    console.error('🔍 [filteredDrivers] FIN:', {
      'Drivers après filtrage': result.length,
      'Total parcels après': result.reduce((sum, d) => sum + d.parcels.length, 0),
      'Détail': result.map(d => ({ nom: d.name, parcels: d.parcels.length }))
    })

    return result
  }, [drivers, driverFilter, statusFilter, searchQuery, datePreset, dateFrom, dateTo, agentEntries])

  // Stats filtrées (selon filtres actifs)
  const filteredStats = useMemo(() => {
    // Agréger toutes les stats des drivers filtrés
    const totalACollecter = filteredDrivers.reduce((sum, d) => sum + d.portsACollecterCount, 0)
    const montantACollecter = filteredDrivers.reduce((sum, d) => sum + d.portsACollecterMontant, 0)
    const totalCollectes = filteredDrivers.reduce((sum, d) => sum + d.portsCollectesCount, 0)
    const montantCollectes = filteredDrivers.reduce((sum, d) => sum + d.portsCollectesMontant, 0)
    const totalPortsPayesARecevoir = filteredDrivers.reduce((sum, d) => sum + (d.portsPayesARecevoirCount || 0), 0)
    const montantPortsPayesARecevoir = filteredDrivers.reduce((sum, d) => sum + (d.portsPayesARecevoirMontant || 0), 0)
    const totalPortsPayesRecus = filteredDrivers.reduce((sum, d) => sum + (d.portsPayesRecusCount || 0), 0)
    const montantPortsPayesRecus = filteredDrivers.reduce((sum, d) => sum + (d.portsPayesRecusMontant || 0), 0)
    const totalEnRetard = filteredDrivers.reduce((sum, d) => sum + d.enRetardCount, 0)

    // 🆕 Calcul du solde disponible (argent physiquement chez le chef) :
    // - Si TOUS les livreurs : (Collectés + Reçus) - Versements admin
    // - Si UN livreur : SEULEMENT ses collectés (les reçus sont globaux, pas par livreur)
    let soldeAVerser

    if (driverFilter === 'all') {
      // Tous les livreurs : collectés + reçus - versements
      soldeAVerser = montantCollectes + montantPortsPayesRecus
      const totalVerse = adminTransfers
        .filter((t: any) => t.status === 'confirmed')
        .reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0)
      soldeAVerser = Math.max(0, soldeAVerser - totalVerse)
    } else {
      // Un livreur spécifique : SEULEMENT ses collectés (pas les reçus)
      soldeAVerser = montantCollectes
    }

    return {
      portsACollecterCount: totalACollecter,
      portsACollecterMontant: montantACollecter,
      portsCollectes: totalCollectes,
      portsCollectesMontant: montantCollectes,
      portsPayesARecevoirCount: totalPortsPayesARecevoir,
      portsPayesARecevoirMontant: montantPortsPayesARecevoir,
      portsPayesRecusCount: totalPortsPayesRecus,
      portsPayesRecusMontant: montantPortsPayesRecus,
      enRetardCount: totalEnRetard,
      soldeAVerser,
    }
  }, [filteredDrivers, driverFilter, adminTransfers])

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
          driverId: delayModal.driver.id,
          driverName: delayModal.driver.name,
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

    console.log('🔵 [handleCollectPort] DÉBUT:', {
      parcelId: parcel.id,
      nic: parcel.senderNic || parcel.trackingId,
      price: parcel.price,
      currentPortStatus: parcel.portStatus
    })

    setCollectingPortIds(prev => new Set(prev).add(parcel.id))
    try {
      const updatedData = {
        portStatus: 'collected',
        portCollectedBy: profile?.name || '',
        portCollectedById: uid || '',
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

      console.log('🟢 [handleCollectPort] Appel Firebase collectPortDu...')
      await collectPortDu(
        parcel.id,
        profile?.name || '',
        uid || ''
      )
      console.log('✅ [handleCollectPort] Firebase OK')
    } catch (err: any) {
      console.error('❌ [handleCollectPort] ERREUR:', err)
      alert(`❌ Erreur: ${err.message}`)

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
      await uncollectPortDu(parcel.id)
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
      const now = new Date()
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

    if (!confirm(`Créer un versement de ${fmtAmt(amount)} DH vers l'admin ?`)) {
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
        codParcelIds: [], // Pas de COD pour les versements de port dû
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

  // Versements filtrés par date
  const filteredVersements = useMemo(() => {
    const versementDate = (v: any) => {
      if (v.createdAt?.toDate) return v.createdAt.toDate()
      if (v.createdAt) return new Date(v.createdAt)
      return new Date(0)
    }
    return filterByDate(adminTransfers, datePreset, dateFrom, dateTo, versementDate)
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
            {fmtAmt(driverFilter === 'all' ? soldeCaisseGlobal : soldeLivreur)} DH
          </div>
          <div className="text-sm text-purple-700 font-medium mt-1">
            Solde disponible
          </div>
        </div>
      </div>

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
            value={datePreset}
            onChange={setDatePreset}
            from={dateFrom}
            onFromChange={setDateFrom}
            to={dateTo}
            onToChange={setDateTo}
            tone="blue"
          />

          {/* Filtres */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />

              {/* Filtre par livreur */}
              <select
                value={driverFilter}
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les statuts</option>
                <option value="a_collecter">📦 À collecter</option>
                <option value="collecte">✅ Collecté</option>
                <option value="en_retard">⏰ En retard</option>
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
                      {statusFilter === 'a_collecter' ? 'À collecter' :
                       statusFilter === 'collecte' ? 'Collecté' :
                       'En retard'}
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
                                  ) : isPortDu && (
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
              {filteredDrivers.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                  <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Aucun livreur trouvé</p>
                </div>
              )}

            {filteredDrivers.map(driver => (
              <div key={driver.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* En-tête livreur */}
                <div
                  onClick={() => toggleDriver(driver.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{driver.name}</h3>
                      <p className="text-xs text-gray-500">
                        {driver.portDuParcels.length} ports dus · {driver.portsPayesParcels.length} ramassés
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Statistiques */}
                    <div className="hidden md:flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-blue-600 font-bold">{driver.portsACollecterCount}</div>
                        <div className="text-xs text-gray-500">À collecter</div>
                      </div>
                      <div className="text-center">
                        <div className="text-green-600 font-bold">{driver.portsCollectesCount}</div>
                        <div className="text-xs text-gray-500">Collectés</div>
                      </div>
                      {driver.portsPayesARecevoirCount > 0 && (
                        <div className="text-center">
                          <div className="text-indigo-600 font-bold">{driver.portsPayesARecevoirCount}</div>
                          <div className="text-xs text-gray-500">Ramassés</div>
                        </div>
                      )}
                      {driver.enRetardCount > 0 && (
                        <div className="text-center">
                          <div className="text-amber-600 font-bold">{driver.enRetardCount}</div>
                          <div className="text-xs text-gray-500">En retard</div>
                        </div>
                      )}
                    </div>

                    {/* Montants */}
                    <div className="text-right">
                      <div className="font-bold text-gray-900">
                        {fmtAmt(driver.portsACollecterMontant)} DH
                      </div>
                      <div className="text-xs text-green-600">
                        +{fmtAmt(driver.portsCollectesMontant)} DH
                      </div>
                      {driver.portsPayesARecevoirMontant > 0 && (
                        <div className="text-xs text-indigo-600">
                          +{fmtAmt(driver.portsPayesARecevoirMontant)} DH
                        </div>
                      )}
                    </div>

                    {/* Icône expansion */}
                    {expandedDrivers.has(driver.id) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Détails des expéditions */}
                {expandedDrivers.has(driver.id) && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
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
                          {driver.parcels.map((parcel: any) => {
                              // LOGIQUE COHÉRENTE : Port dû seulement si portType='port_du' ET pas de portPayeMethod
                              const isPortDu = parcel.portType === 'port_du' && !parcel.portPayeMethod
                              // 🆕 Port payé ramassé localement : UNIQUEMENT statut "En cours de ramassage"
                              const isPortPayeRamasse = parcel.portType === 'port_paye' &&
                                !parcel.portPayeMethod &&
                                (parcel.portStatus === 'collected' || !parcel.portStatus) &&
                                parcel.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local
                                (parcel.createdByCity === profile?.city || parcel.originCity === profile?.city)
                              // 🆕 Port payé reçu (ramassage local uniquement)
                              const isPortPayeRecu = parcel.portType === 'port_paye' &&
                                !parcel.portPayeMethod &&
                                parcel.portStatus === 'received' &&
                                parcel.status === 'En cours de ramassage' &&  // UNIQUEMENT ramassage local
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
                                  <td className="py-2 px-3">
                                    <span className="font-mono text-xs font-semibold text-blue-600">
                                      {parcel.senderNic || parcel.sender?.nic || parcel.trackingId}
                                    </span>
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
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {(parcel.returnedAt || parcel.wasReturned || parcel.status === 'Retourné') ? (
                                        <span className="text-xs text-gray-500 italic">-</span>
                                      ) : isPortPayeRecu ? (
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
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>

                    {driver.parcels.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        Aucune expédition
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
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
            value={datePreset}
            onChange={setDatePreset}
            from={dateFrom}
            onFromChange={setDateFrom}
            to={dateTo}
            onToChange={setDateTo}
            tone="blue"
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
                    {delayModal.driver.name}
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
    </div>
  )
}
