import { useState, useMemo, useEffect } from 'react'
import {
  Wallet, TrendingUp, AlertCircle, User, Package, Clock, Check, X,
  Send, Eye, ChevronDown, ChevronUp, Search, Calendar, Filter
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
    agentEntries,
  } = useAgentCtx()

  // État des onglets
  const [activeTab, setActiveTab] = useState<'livreurs' | 'versements' | 'historique'>('livreurs')

  // Filtres date
  const [datePreset, setDatePreset] = useState<any>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Filtres
  const [driverFilter, setDriverFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

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

  // 🔒 Fonction sécurisée pour parser les montants
  const safeParseAmount = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  // Calcul des statistiques
  const stats = useMemo(() => {
    // Ports à collecter (port_du non encaissés, livrés ou en cours de livraison)
    const portsACollecter = parcels.filter((p: any) =>
      p.portType === 'port_du' &&
      !p.portStatus &&
      (p.status === 'En cours de livraison' || p.status === 'Livré') &&
      p.destinationCity === profile?.city
    )

    // Ports collectés (entrées caisse type 'recette' catégorie 'port_du')
    const portsCollectesEntries = agentEntries.filter((e: any) =>
      e.type === 'entree' &&
      e.category === 'port_du' &&
      e.city === profile?.city
    )

    // Expéditions en retard (en cours de livraison depuis >24h)
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const enRetard = parcels.filter((p: any) => {
      if (p.status !== 'En cours de livraison') return false
      if (!p.deliveryAssignedAt) return false
      const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
      return assignedDate < oneDayAgo && p.destinationCity === profile?.city
    })

    // Solde à verser (total collecté - total versé)
    const totalCollecte = portsCollectesEntries.reduce((sum: number, e: any) =>
      sum + safeParseAmount(e.amount), 0
    )

    const totalVerse = adminTransfers
      .filter((t: any) => t.status === 'confirmed')
      .reduce((sum: number, t: any) => sum + safeParseAmount(t.amount), 0)

    const soldeAVerser = Math.max(0, totalCollecte - totalVerse)

    return {
      portsACollecterCount: portsACollecter.length,
      portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
        sum + safeParseAmount(p.price), 0
      ),
      portsCollectes: portsCollectesEntries.length,
      portsCollectesMontant: totalCollecte,
      enRetardCount: enRetard.length,
      soldeAVerser,
    }
  }, [parcels, agentEntries, adminTransfers, profile?.city])

  // Liste des livreurs actifs
  const drivers = useMemo(() => {
    const driversMap = new Map()

    parcels.forEach((p: any) => {
      if (p.deliveryDriverId && p.destinationCity === profile?.city) {
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

    return Array.from(driversMap.values()).map(driver => {
      // Séparer les ports dû pour les calculs de collecte
      // IMPORTANT: Le livreur livre TOUTES les expéditions (port payé + port dû)
      // mais ne collecte de l'argent QUE pour les ports dû
      const portDuParcels = driver.parcels.filter((p: any) => p.portType === 'port_du')

      // Calculs par livreur - basés uniquement sur les ports dû
      const assignedToday = driver.parcels.filter((p: any) => {
        // Colis sans date d'assignation = considérés comme assignés aujourd'hui
        if (!p.deliveryAssignedAt) return true

        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return assignedDate >= today
      })

      const portsACollecter = portDuParcels.filter((p: any) =>
        !p.portStatus &&
        (p.status === 'En cours de livraison' || p.status === 'Livré')
      )

      const portsCollectes = agentEntries.filter((e: any) =>
        e.type === 'entree' &&
        e.category === 'port_du' &&
        portDuParcels.some((p: any) => p.senderNic === e.reference)
      )

      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const enRetard = portDuParcels.filter((p: any) => {
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
        portDuParcels: portDuParcels
        assignedTodayCount: assignedToday.length,
        portsACollecterCount: portsACollecter.length,
        portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsCollectesCount: portsCollectes.length,
        portsCollectesMontant: portsCollectes.reduce((sum: number, e: any) =>
          sum + safeParseAmount(e.amount), 0
        ),
        enRetardCount: enRetard.length,
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [parcels, agentEntries, profile?.city])

  // Filtrer les livreurs
  const filteredDrivers = useMemo(() => {
    let result = drivers

    // Filtrer les colis de chaque livreur par date d'assignation
    result = result.map(driver => {
      const filteredParcels = driver.parcels.filter((p: any) => {
        // Si le filtre est 'all', montrer TOUS les colis
        if (datePreset === 'all') return true

        // Si pas de date d'assignation, inclure quand même (colis récemment assignés)
        if (!p.deliveryAssignedAt) return true

        // Sinon, filtrer par date d'assignation
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        return filterByDate([p], datePreset, dateFrom, dateTo, () => assignedDate).length > 0
      })

      // Recalculer les statistiques pour les colis filtrés
      const assignedToday = filteredParcels.filter((p: any) => {
        // Colis sans date d'assignation = considérés comme assignés aujourd'hui
        if (!p.deliveryAssignedAt) return true

        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return assignedDate >= today
      })

      const portsACollecter = filteredParcels.filter((p: any) =>
        !p.portStatus &&
        (p.status === 'En cours de livraison' || p.status === 'Livré')
      )

      const portsCollectes = agentEntries.filter((e: any) =>
        e.type === 'entree' &&
        e.category === 'port_du' &&
        filteredParcels.some((p: any) => p.senderNic === e.reference)
      )

      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const enRetard = filteredParcels.filter((p: any) => {
        if (p.status !== 'En cours de livraison') return false
        if (!p.deliveryAssignedAt) return false
        const assignedDate = p.deliveryAssignedAt?.toDate ? p.deliveryAssignedAt.toDate() : new Date(p.deliveryAssignedAt)
        return assignedDate < oneDayAgo
      })

      return {
        ...driver,
        parcels: filteredParcels,
        assignedTodayCount: assignedToday.length,
        portsACollecterCount: portsACollecter.length,
        portsACollecterMontant: portsACollecter.reduce((sum: number, p: any) =>
          sum + safeParseAmount(p.price), 0
        ),
        portsCollectesCount: portsCollectes.length,
        portsCollectesMontant: portsCollectes.reduce((sum: number, e: any) =>
          sum + safeParseAmount(e.amount), 0
        ),
        enRetardCount: enRetard.length,
      }
    }).filter(d => d.parcels.length > 0) // Ne garder que les livreurs avec des colis dans la période

    if (driverFilter !== 'all') {
      result = result.filter(d => d.id === driverFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.parcels.some((p: any) => p.senderNic?.toLowerCase().includes(q))
      )
    }

    return result
  }, [drivers, driverFilter, searchQuery, datePreset, dateFrom, dateTo, agentEntries])

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
          nic: delayModal.parcel.senderNic || delayModal.parcel.sender?.nic || delayModal.parcel.trackingId,
          driverId: delayModal.driver.id,
          driverName: delayModal.driver.name,
          city: profile?.city,
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ports à collecter */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-600">À collecter</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {stats.portsACollecterCount}
          </div>
          <div className="text-sm text-blue-700 font-medium mt-1">
            {fmtAmt(stats.portsACollecterMontant)} DH
          </div>
        </div>

        {/* Ports collectés */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Wallet className="w-5 h-5 text-green-600" />
            <span className="text-xs font-semibold text-green-600">Collectés</span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {stats.portsCollectes}
          </div>
          <div className="text-sm text-green-700 font-medium mt-1">
            {fmtAmt(stats.portsCollectesMontant)} DH
          </div>
        </div>

        {/* En retard */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-600">En retard</span>
          </div>
          <div className="text-2xl font-bold text-amber-900">
            {stats.enRetardCount}
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
            {fmtAmt(stats.soldeAVerser)} DH
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

              {/* Recherche */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher livreur ou n° colis..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Liste des livreurs */}
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
                        {driver.parcels.length} expéditions
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
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">Client</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-700">Type</th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-700">Montant</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-700">Status</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {driver.parcels.map((parcel: any) => {
                              const isPortDu = parcel.portType === 'port_du'
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
                                  <td className="py-2 px-3">
                                    <div className="text-gray-900">{parcel.receiver?.name || '-'}</div>
                                    <div className="text-xs text-gray-500">{parcel.receiver?.tel || '-'}</div>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {isPortDu ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium">
                                        Port dû
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
                                    {!isPortDu ? (
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
                                    {isPortDu && !isCollected && (
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
