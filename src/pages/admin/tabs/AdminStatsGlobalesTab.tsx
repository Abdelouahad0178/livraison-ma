import { useMemo, useState, useEffect } from 'react'
import { Building2, TrendingUp, Package, Search, Filter, X, Calendar, ChevronDown, Truck, CheckCircle, Clock, XCircle, DollarSign } from 'lucide-react'
import { collection, query, getDocs } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { CITIES, STATUSES, STATUS_COLORS } from '../../../firebase/constants'

interface Props {
  allParcels: any[]
  datePreset: string
  setDatePreset: (preset: string) => void
  dateFrom: string
  setDateFrom: (date: string) => void
  dateTo: string
  setDateTo: (date: string) => void
}

export default function AdminStatsGlobalesTab({
  allParcels,
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo
}: Props) {
  const [searchCity, setSearchCity] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [loading, setLoading] = useState(true)
  const [fullParcels, setFullParcels] = useState<any[]>([])

  // 🚀 Charger TOUS les colis au montage du composant
  useEffect(() => {
    const loadAllParcels = async () => {
      setLoading(true)
      try {
        console.log('📊 Chargement de TOUS les colis pour les statistiques...')
        const q = query(collection(db, 'parcels'))
        const snapshot = await getDocs(q)
        const parcels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        console.log(`✅ ${parcels.length} colis chargés pour les statistiques`)
        setFullParcels(parcels)
      } catch (error) {
        console.error('❌ Erreur chargement colis:', error)
        // En cas d'erreur, utiliser allParcels comme fallback
        setFullParcels(allParcels)
      } finally {
        setLoading(false)
      }
    }

    loadAllParcels()
  }, []) // Charger une seule fois au montage

  // 🔒 Fonctions sécurisées pour parser les nombres
  const safeParseFloat = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  const safeParseInt = (value: any, defaultValue: number = 1): number => {
    if (value === null || value === undefined || value === '') return defaultValue
    const num = parseInt(String(value), 10)
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : defaultValue
  }

  // Filtrer les colis par période
  const parcelDate = (p: any) => {
    if (p.workDate) return new Date(p.workDate + 'T12:00:00')
    if (p.createdAt?.toDate) return p.createdAt.toDate()
    if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
    return new Date(0)
  }

  const filteredByDate = useMemo(() => {
    if (!Array.isArray(fullParcels)) return []

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return fullParcels.filter((p: any) => {
      const pDate = parcelDate(p)

      if (datePreset === 'today') return pDate >= today
      if (datePreset === 'week') return pDate >= weekAgo
      if (datePreset === 'month') return pDate >= monthStart
      if (datePreset === 'custom' && dateFrom && dateTo) {
        const from = new Date(dateFrom)
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        return pDate >= from && pDate <= to
      }
      return true // 'all'
    })
  }, [allParcels, datePreset, dateFrom, dateTo])

  // Calculer les statistiques par agence
  const cityStats = useMemo(() => {
    if (!Array.isArray(filteredByDate)) return []

    const stats: Record<string, {
      city: string
      // Expéditions
      nbExpeditions: number
      nbColisEnvoyes: number
      nbColisRecus: number
      // Par statut
      initialise: number
      enTransit: number
      arrive: number
      enLivraison: number
      livre: number
      retourne: number
      annule: number
      // Montants
      portPaye: number
      portDu: number
      enCompteExpediteur: number
      enCompteDestinataire: number
      totalPort: number
      codTotal: number
      codCollecte: number
      codReglee: number
    }> = {}

    // Initialiser toutes les villes
    CITIES.forEach(city => {
      stats[city] = {
        city,
        nbExpeditions: 0,
        nbColisEnvoyes: 0,
        nbColisRecus: 0,
        initialise: 0,
        enTransit: 0,
        arrive: 0,
        enLivraison: 0,
        livre: 0,
        retourne: 0,
        annule: 0,
        portPaye: 0,
        portDu: 0,
        enCompteExpediteur: 0,
        enCompteDestinataire: 0,
        totalPort: 0,
        codTotal: 0,
        codCollecte: 0,
        codReglee: 0,
      }
    })

    // Parcourir tous les colis filtrés par date
    filteredByDate.forEach((p: any) => {
      const originCity = p.originCity || p.sender?.city
      const destCity = p.destinationCity || p.receiver?.city
      const price = safeParseFloat(p.price)
      const nbColis = safeParseInt(p.nbColis, 1)
      const codAmount = safeParseFloat(p.codAmount)

      // EXPÉDITIONS : comptées à l'agence d'ORIGINE
      if (originCity && stats[originCity]) {
        stats[originCity].nbExpeditions += 1
        stats[originCity].nbColisEnvoyes += nbColis

        // Montants de port : selon où l'argent est collecté
        if (p.portType === 'port_paye') {
          stats[originCity].portPaye += price
        }
        if (p.portType === 'port_en_compte_expediteur') {
          stats[originCity].enCompteExpediteur += price
        }

        // COD à l'origine
        if (codAmount > 0) {
          stats[originCity].codTotal += codAmount
          if (p.codStatus === 'collected') stats[originCity].codCollecte += codAmount
          if (p.codSenderPaid) stats[originCity].codReglee += codAmount
        }

        // Statuts à l'origine
        if (p.status === 'Initialisé') stats[originCity].initialise += 1
        if (p.status === 'En transit') stats[originCity].enTransit += 1
        if (p.status === 'Arrivé en agence') stats[originCity].arrive += 1
        if (p.status === 'En cours de livraison') stats[originCity].enLivraison += 1
        if (p.status === 'Livré') stats[originCity].livre += 1
        if (p.status.includes('Retour')) stats[originCity].retourne += 1
        if (p.status === 'Annulé') stats[originCity].annule += 1
      }

      // COLIS REÇUS : comptés à l'agence de DESTINATION
      if (destCity && stats[destCity]) {
        stats[destCity].nbColisRecus += nbColis

        // Port Dû : collecté à la DESTINATION
        if (p.portType === 'port_du') {
          stats[destCity].portDu += price
        }
        // Port en compte destinataire : géré à la DESTINATION
        if (p.portType === 'port_en_compte_destinataire') {
          stats[destCity].enCompteDestinataire += price
        }
      }
    })

    // Calculer les totaux et arrondir
    return Object.values(stats).map(stat => ({
      ...stat,
      portPaye: Math.round(stat.portPaye * 100) / 100,
      portDu: Math.round(stat.portDu * 100) / 100,
      enCompteExpediteur: Math.round(stat.enCompteExpediteur * 100) / 100,
      enCompteDestinataire: Math.round(stat.enCompteDestinataire * 100) / 100,
      totalPort: Math.round((stat.portPaye + stat.portDu + stat.enCompteExpediteur + stat.enCompteDestinataire) * 100) / 100,
      codTotal: Math.round(stat.codTotal * 100) / 100,
      codCollecte: Math.round(stat.codCollecte * 100) / 100,
      codReglee: Math.round(stat.codReglee * 100) / 100,
    }))
  }, [filteredByDate])

  // Appliquer le filtre de recherche ville
  const filteredStats = useMemo(() => {
    let filtered = cityStats

    if (searchCity.trim()) {
      const query = searchCity.toLowerCase().trim()
      filtered = filtered.filter(stat => stat.city.toLowerCase().includes(query))
    }

    return filtered
  }, [cityStats, searchCity])

  // Calculer les totaux globaux
  const totaux = useMemo(() => {
    return filteredStats.reduce((acc, stat) => ({
      nbExpeditions: acc.nbExpeditions + stat.nbExpeditions,
      nbColisEnvoyes: acc.nbColisEnvoyes + stat.nbColisEnvoyes,
      nbColisRecus: acc.nbColisRecus + stat.nbColisRecus,
      initialise: acc.initialise + stat.initialise,
      enTransit: acc.enTransit + stat.enTransit,
      arrive: acc.arrive + stat.arrive,
      enLivraison: acc.enLivraison + stat.enLivraison,
      livre: acc.livre + stat.livre,
      retourne: acc.retourne + stat.retourne,
      annule: acc.annule + stat.annule,
      portPaye: acc.portPaye + stat.portPaye,
      portDu: acc.portDu + stat.portDu,
      enCompteExpediteur: acc.enCompteExpediteur + stat.enCompteExpediteur,
      enCompteDestinataire: acc.enCompteDestinataire + stat.enCompteDestinataire,
      totalPort: acc.totalPort + stat.totalPort,
      codTotal: acc.codTotal + stat.codTotal,
      codCollecte: acc.codCollecte + stat.codCollecte,
      codReglee: acc.codReglee + stat.codReglee,
    }), {
      nbExpeditions: 0,
      nbColisEnvoyes: 0,
      nbColisRecus: 0,
      initialise: 0,
      enTransit: 0,
      arrive: 0,
      enLivraison: 0,
      livre: 0,
      retourne: 0,
      annule: 0,
      portPaye: 0,
      portDu: 0,
      enCompteExpediteur: 0,
      enCompteDestinataire: 0,
      totalPort: 0,
      codTotal: 0,
      codCollecte: 0,
      codReglee: 0,
    })
  }, [filteredStats])

  const hasActiveFilter = searchCity.trim() !== '' || datePreset !== 'all'

  return (
    <div className="mt-4 space-y-4">
      {/* Indicateur de chargement */}
      {loading && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 flex items-center justify-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-blue-900 font-bold text-lg">Chargement de toutes les données...</p>
            <p className="text-blue-700 text-sm">Récupération de tous les colis de la base de données</p>
          </div>
        </div>
      )}

      {/* En-tête */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-black">📊 Statistiques Globales par Agence</h2>
              <p className="text-blue-100 text-sm mt-1">Vue d'ensemble complète de toutes les activités par ville</p>
            </div>
          </div>
          {!loading && (
            <div className="text-right">
              <div className="text-3xl font-black">{fullParcels.length.toLocaleString()}</div>
              <div className="text-xs text-blue-100 uppercase tracking-wide">Colis Total</div>
            </div>
          )}
        </div>
      </div>

      {/* Section Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-bold text-gray-800">Filtres</span>
            {hasActiveFilter && (
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-bold">
                Actifs
              </span>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="p-4 space-y-4 border-t border-gray-100">
            {/* Période */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Période
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { key: 'all', label: 'Toutes les dates' },
                  { key: 'today', label: "Aujourd'hui" },
                  { key: 'week', label: '7 derniers jours' },
                  { key: 'month', label: 'Ce mois' },
                  { key: 'custom', label: 'Personnalisé' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDatePreset(key)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                      datePreset === key
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {datePreset === 'custom' && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-gray-400 text-xs font-bold">→</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Recherche ville */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                <Search className="w-3.5 h-3.5 inline mr-1" />
                Rechercher une ville
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  placeholder="Ex: Casablanca, Rabat..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                {searchCity && (
                  <button
                    onClick={() => setSearchCity('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Bouton Reset */}
            {hasActiveFilter && (
              <button
                onClick={() => {
                  setSearchCity('')
                  setDatePreset('all')
                }}
                className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <X className="w-4 h-4" />
                Tout réinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      {/* Carte résumé global */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-purple-200 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            📊 Résumé {hasActiveFilter ? '(Filtré)' : 'Global'}
          </h3>
          <span className="text-sm text-gray-600">
            {filteredStats.length} agence(s)
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {/* Expéditions */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">Expéditions</div>
            <div className="text-2xl font-black text-indigo-700">{totaux.nbExpeditions}</div>
          </div>
          {/* Colis Envoyés */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">📤 Envoyés</div>
            <div className="text-2xl font-black text-green-700">{totaux.nbColisEnvoyes}</div>
          </div>
          {/* Colis Reçus */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">📥 Reçus</div>
            <div className="text-2xl font-black text-purple-700">{totaux.nbColisRecus}</div>
          </div>
          {/* Livrés */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">✅ Livrés</div>
            <div className="text-2xl font-black text-green-600">{totaux.livre}</div>
          </div>
          {/* Port Payé */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">Port Payé</div>
            <div className="text-xl font-black text-blue-700">{totaux.portPaye.toLocaleString('fr-MA')} DH</div>
          </div>
          {/* Port Dû */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">Port Dû</div>
            <div className="text-xl font-black text-orange-700">{totaux.portDu.toLocaleString('fr-MA')} DH</div>
          </div>
          {/* En Compte */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">En Compte</div>
            <div className="text-xl font-black text-purple-700">{totaux.enCompte.toLocaleString('fr-MA')} DH</div>
          </div>
          {/* Total Port */}
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-600 font-medium mb-1">💰 Total Port</div>
            <div className="text-xl font-black text-green-700">{totaux.totalPort.toLocaleString('fr-MA')} DH</div>
          </div>
        </div>
      </div>

      {/* Tableau détaillé par agence */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold whitespace-nowrap sticky left-0 bg-gradient-to-r from-blue-600 to-purple-600">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Agence
                </th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">📋 Exp</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap bg-green-600/20">📤 Envoyés</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap bg-purple-600/20">📥 Reçus</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">⏳ Init</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">🚚 Transit</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">📦 Arrivé</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">🚛 Livraison</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">✅ Livré</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap">↩️ Retour</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap bg-blue-600/30">💵 Payé</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap bg-orange-600/30">📮 Dû</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap bg-blue-500/30">📤 Cpte Exp</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap bg-purple-600/30">📥 Cpte Dest</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap bg-green-600/30">💰 Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((stat, idx) => (
                <tr
                  key={stat.city}
                  className={`border-b border-gray-100 transition-all hover:bg-purple-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30'
                  }`}
                >
                  <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-white">
                    📍 {stat.city}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs">
                      {stat.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center bg-green-50/50">
                    <span className="inline-flex items-center justify-center px-2 py-1 bg-green-100 text-green-700 rounded-lg font-bold text-xs">
                      {stat.nbColisEnvoyes}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center bg-purple-50/50">
                    <span className="inline-flex items-center justify-center px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-bold text-xs">
                      {stat.nbColisRecus}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-600 font-semibold">{stat.initialise}</td>
                  <td className="px-3 py-3 text-center text-blue-600 font-semibold">{stat.enTransit}</td>
                  <td className="px-3 py-3 text-center text-orange-600 font-semibold">{stat.arrive}</td>
                  <td className="px-3 py-3 text-center text-amber-600 font-semibold">{stat.enLivraison}</td>
                  <td className="px-3 py-3 text-center text-green-600 font-semibold">{stat.livre}</td>
                  <td className="px-3 py-3 text-center text-red-600 font-semibold">{stat.retourne}</td>
                  <td className="px-3 py-3 text-right font-bold bg-blue-50/50 text-blue-700">
                    {stat.portPaye.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-3 text-right font-bold bg-orange-50/50 text-orange-700">
                    {stat.portDu.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-3 text-right font-bold bg-blue-50/50 text-blue-600">
                    {stat.enCompteExpediteur.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-3 text-right font-bold bg-purple-50/50 text-purple-700">
                    {stat.enCompteDestinataire.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-3 text-right font-bold bg-green-50/50 text-green-700 text-base">
                    {stat.totalPort.toLocaleString('fr-MA')} DH
                  </td>
                </tr>
              ))}
              {/* Ligne totaux */}
              {filteredStats.length > 0 && (
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-black border-t-2 border-gray-300">
                  <td className="px-4 py-4 text-gray-900 sticky left-0 bg-gray-100">
                    <TrendingUp className="w-5 h-5 inline mr-1 text-green-600" />
                    TOTAL
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-200 text-indigo-900 rounded-lg font-black">
                      {totaux.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center bg-green-100">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 bg-green-200 text-green-900 rounded-lg font-black">
                      {totaux.nbColisEnvoyes}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center bg-purple-100">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 bg-purple-200 text-purple-900 rounded-lg font-black">
                      {totaux.nbColisRecus}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center text-gray-800">{totaux.initialise}</td>
                  <td className="px-3 py-4 text-center text-blue-800">{totaux.enTransit}</td>
                  <td className="px-3 py-4 text-center text-orange-800">{totaux.arrive}</td>
                  <td className="px-3 py-4 text-center text-amber-800">{totaux.enLivraison}</td>
                  <td className="px-3 py-4 text-center text-green-800">{totaux.livre}</td>
                  <td className="px-3 py-4 text-center text-red-800">{totaux.retourne}</td>
                  <td className="px-3 py-4 text-right bg-blue-100 text-blue-900">
                    {totaux.portPaye.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-4 text-right bg-orange-100 text-orange-900">
                    {totaux.portDu.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-4 text-right bg-purple-100 text-purple-900">
                    {totaux.enCompte.toLocaleString('fr-MA')} DH
                  </td>
                  <td className="px-3 py-4 text-right bg-green-100 text-green-900 text-lg">
                    {totaux.totalPort.toLocaleString('fr-MA')} DH
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message si aucun résultat */}
      {filteredStats.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilter
              ? 'Aucune agence ne correspond aux filtres sélectionnés'
              : 'Aucune donnée disponible'
            }
          </p>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearchCity('')
                setDatePreset('all')
              }}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
    </div>
  )
}
