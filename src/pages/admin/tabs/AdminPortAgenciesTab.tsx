import { useMemo, useState } from 'react'
import { Building2, TrendingUp, Package, Search, Filter, X, Calendar, ChevronDown } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'

interface Props {
  allParcels: any[]
  datePreset: string
  setDatePreset: (preset: string) => void
  dateFrom: string
  setDateFrom: (date: string) => void
  dateTo: string
  setDateTo: (date: string) => void
}

export default function AdminPortAgenciesTab({
  allParcels,
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo
}: Props) {
  // États pour filtres et recherche
  const [searchCity, setSearchCity] = useState('')
  const [portTypeFilter, setPortTypeFilter] = useState('all') // all, port_paye, port_du, port_en_compte
  const [showFilters, setShowFilters] = useState(true)

  // 🔒 Fonction sécurisée pour parser les nombres
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
    if (p.createdAt?.toDate) return p.createdAt.toDate()
    if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
    return new Date(0)
  }

  const filteredByDate = useMemo(() => {
    if (!Array.isArray(allParcels)) return []

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return allParcels.filter((p: any) => {
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
  const portStats = useMemo(() => {
    if (!Array.isArray(filteredByDate)) return []

    const stats: Record<string, {
      city: string
      portPaye: number
      portDu: number
      enCompte: number
      totalPort: number
      nbExpeditions: number
      nbColisEnvoyes: number
      nbColisRecus: number
    }> = {}

    // Initialiser toutes les villes
    CITIES.forEach(city => {
      stats[city] = {
        city,
        portPaye: 0,
        portDu: 0,
        enCompte: 0,
        totalPort: 0,
        nbExpeditions: 0,
        nbColisEnvoyes: 0,
        nbColisRecus: 0,
      }
    })

    // Parcourir tous les colis filtrés par date
    filteredByDate.forEach((p: any) => {
      const originCity = p.originCity || p.sender?.city
      const destCity = p.destinationCity || p.receiver?.city
      const price = safeParseFloat(p.price)
      const nbColis = safeParseInt(p.nbColis, 1)

      // MONTANTS de port : selon où l'argent est collecté
      // Port Payé : collecté à l'ORIGINE
      if (p.portType === 'port_paye' && originCity && stats[originCity]) {
        stats[originCity].portPaye += price
      }

      // Port Dû : collecté à la DESTINATION
      if (p.portType === 'port_du' && destCity && stats[destCity]) {
        stats[destCity].portDu += price
      }

      // En Compte : collecté à l'ORIGINE
      if (p.portType === 'port_en_compte' && originCity && stats[originCity]) {
        stats[originCity].enCompte += price
      }

      // EXPÉDITIONS : comptées à l'agence d'ORIGINE
      if (originCity && stats[originCity]) {
        stats[originCity].nbExpeditions += 1
      }

      // COLIS ENVOYÉS : comptés à l'agence d'ORIGINE
      if (originCity && stats[originCity]) {
        stats[originCity].nbColisEnvoyes += nbColis
      }

      // COLIS REÇUS : comptés à l'agence de DESTINATION
      if (destCity && stats[destCity]) {
        stats[destCity].nbColisRecus += nbColis
      }
    })

    // Calculer les totaux et arrondir - afficher toutes les agences
    return Object.values(stats).map(stat => ({
      ...stat,
      portPaye: Math.round(stat.portPaye * 100) / 100,
      portDu: Math.round(stat.portDu * 100) / 100,
      enCompte: Math.round(stat.enCompte * 100) / 100,
      totalPort: Math.round((stat.portPaye + stat.portDu + stat.enCompte) * 100) / 100,
    }))
  }, [filteredByDate])

  // Appliquer les filtres de recherche et type de port
  const filteredStats = useMemo(() => {
    let filtered = portStats

    // Filtre par recherche ville
    if (searchCity.trim()) {
      const query = searchCity.toLowerCase().trim()
      filtered = filtered.filter(stat => stat.city.toLowerCase().includes(query))
    }

    // Filtre par type de port
    if (portTypeFilter !== 'all') {
      filtered = filtered.filter(stat => {
        if (portTypeFilter === 'port_paye') return stat.portPaye > 0
        if (portTypeFilter === 'port_du') return stat.portDu > 0
        if (portTypeFilter === 'port_en_compte') return stat.enCompte > 0
        return true
      })
    }

    return filtered
  }, [portStats, searchCity, portTypeFilter])

  // Calculer les totaux sur les stats FILTRÉES
  const totauxFiltres = useMemo(() => {
    const totaux = filteredStats.reduce((acc, stat) => ({
      portPaye: acc.portPaye + stat.portPaye,
      portDu: acc.portDu + stat.portDu,
      enCompte: acc.enCompte + stat.enCompte,
      totalPort: acc.totalPort + stat.totalPort,
      nbExpeditions: acc.nbExpeditions + stat.nbExpeditions,
      nbColisEnvoyes: acc.nbColisEnvoyes + stat.nbColisEnvoyes,
      nbColisRecus: acc.nbColisRecus + stat.nbColisRecus,
    }), { portPaye: 0, portDu: 0, enCompte: 0, totalPort: 0, nbExpeditions: 0, nbColisEnvoyes: 0, nbColisRecus: 0 })

    return {
      portPaye: Math.round(totaux.portPaye * 100) / 100,
      portDu: Math.round(totaux.portDu * 100) / 100,
      enCompte: Math.round(totaux.enCompte * 100) / 100,
      totalPort: Math.round(totaux.totalPort * 100) / 100,
      nbExpeditions: totaux.nbExpeditions,
      nbColisEnvoyes: totaux.nbColisEnvoyes,
      nbColisRecus: totaux.nbColisRecus,
    }
  }, [filteredStats])

  const hasActiveFilter = searchCity.trim() !== '' || portTypeFilter !== 'all' || datePreset !== 'all'

  return (
    <div className="mt-4 space-y-4">
      {/* En-tête */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 text-white">
          <Building2 className="w-8 h-8" />
          <div>
            <h2 className="text-2xl font-black">Port par Agence</h2>
            <p className="text-blue-100 text-sm mt-1">Port Payé et En Compte (collecté par expéditeur) · Port Dû (collecté à destination)</p>
          </div>
        </div>
      </div>

      {/* Section Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* En-tête des filtres */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-bold text-gray-800">Filtres et Recherche</span>
            {hasActiveFilter && (
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-bold">
                Actifs
              </span>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Contenu des filtres */}
        {showFilters && (
          <div className="p-4 space-y-4 border-t border-gray-100">
            {/* Ligne 1: Période */}
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

            {/* Ligne 2: Recherche et Type de port */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
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

              {/* Filtre type de port */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                  <Filter className="w-3.5 h-3.5 inline mr-1" />
                  Type de port
                </label>
                <select
                  value={portTypeFilter}
                  onChange={(e) => setPortTypeFilter(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-medium"
                >
                  <option value="all">Tous les types</option>
                  <option value="port_paye">✅ Port Payé uniquement</option>
                  <option value="port_du">📮 Port Dû uniquement</option>
                  <option value="port_en_compte">💼 En Compte uniquement</option>
                </select>
              </div>
            </div>

            {/* Bouton Reset et Tags actifs */}
            {hasActiveFilter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap gap-2 flex-1">
                  {datePreset !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                      <Calendar className="w-3 h-3" />
                      {datePreset === 'today' && "Aujourd'hui"}
                      {datePreset === 'week' && "7 derniers jours"}
                      {datePreset === 'month' && "Ce mois"}
                      {datePreset === 'custom' && `${dateFrom} → ${dateTo}`}
                      <button
                        onClick={() => setDatePreset('all')}
                        className="hover:bg-purple-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {searchCity && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                      <Search className="w-3 h-3" />
                      Ville: "{searchCity}"
                      <button
                        onClick={() => setSearchCity('')}
                        className="hover:bg-blue-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {portTypeFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                      {portTypeFilter === 'port_paye' && '✅ Port Payé'}
                      {portTypeFilter === 'port_du' && '📮 Port Dû'}
                      {portTypeFilter === 'port_en_compte' && '💼 En Compte'}
                      <button
                        onClick={() => setPortTypeFilter('all')}
                        className="hover:bg-green-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSearchCity('')
                    setPortTypeFilter('all')
                    setDatePreset('all')
                  }}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-bold transition-colors flex items-center gap-2 text-xs"
                >
                  <X className="w-4 h-4" />
                  Tout réinitialiser
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carte résumé (filtré) */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            📊 Résumé {hasActiveFilter ? '(Filtré)' : 'Global'}
          </h3>
          <span className="text-sm text-gray-600">
            {filteredStats.length} agence(s) affichée(s)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-indigo-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium">Expéditions</div>
              <div className="text-2xl font-black text-indigo-700">{totauxFiltres.nbExpeditions}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-lg">📤</span>
            </div>
            <div>
              <div className="text-xs text-gray-600 font-medium">Colis Envoyés</div>
              <div className="text-2xl font-black text-green-700">{totauxFiltres.nbColisEnvoyes}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-lg">📥</span>
            </div>
            <div>
              <div className="text-xs text-gray-600 font-medium">Colis Reçus</div>
              <div className="text-2xl font-black text-purple-700">{totauxFiltres.nbColisRecus}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">Port Payé</div>
              <div className="text-2xl font-black text-blue-700">{totauxFiltres.portPaye.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">Port Dû</div>
              <div className="text-2xl font-black text-orange-700">{totauxFiltres.portDu.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">En Compte</div>
              <div className="text-2xl font-black text-purple-700">{totauxFiltres.enCompte.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium">Total Port</div>
              <div className="text-2xl font-black text-green-700">{totauxFiltres.totalPort.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau par agence */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left font-bold whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Agence (Ville)
                  </div>
                </th>
                <th className="px-6 py-4 text-center font-bold whitespace-nowrap">
                  📋 Expéditions
                </th>
                <th className="px-6 py-4 text-center font-bold whitespace-nowrap bg-green-600/20">
                  📤 Colis Envoyés
                </th>
                <th className="px-6 py-4 text-center font-bold whitespace-nowrap bg-purple-600/20">
                  📥 Colis Reçus
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-blue-600/30">
                  ✅ Port Payé
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-orange-600/30">
                  📮 Port Dû
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-purple-600/30">
                  💼 En Compte
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30">
                  💰 Total Port
                </th>
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
                  <td className="px-6 py-4 font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      📍 <span className="text-lg">{stat.city}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold">
                      {stat.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center bg-green-50/50">
                    <span className="inline-flex items-center justify-center px-3 py-1 bg-green-100 text-green-700 rounded-lg font-bold">
                      {stat.nbColisEnvoyes}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center bg-purple-50/50">
                    <span className="inline-flex items-center justify-center px-3 py-1 bg-purple-100 text-purple-700 rounded-lg font-bold">
                      {stat.nbColisRecus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-blue-50/50">
                    <span className="text-blue-700 text-lg">
                      {stat.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-orange-50/50">
                    <span className="text-orange-700 text-lg">
                      {stat.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-purple-50/50">
                    <span className="text-purple-700 text-lg">
                      {stat.enCompte.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-green-50/50">
                    <span className="text-green-700 text-xl">
                      {stat.totalPort.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                </tr>
              ))}
              {/* Ligne totaux */}
              {filteredStats.length > 0 && (
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-black border-t-2 border-gray-300">
                  <td className="px-6 py-5 text-gray-900 text-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      TOTAL {hasActiveFilter ? '(FILTRÉ)' : 'GÉNÉRAL'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-indigo-200 text-indigo-900 rounded-lg font-black text-lg">
                      {totauxFiltres.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center bg-green-100">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-green-200 text-green-900 rounded-lg font-black text-lg">
                      {totauxFiltres.nbColisEnvoyes}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center bg-purple-100">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-purple-200 text-purple-900 rounded-lg font-black text-lg">
                      {totauxFiltres.nbColisRecus}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-blue-100">
                    <span className="text-blue-900 text-xl">
                      {totauxFiltres.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-orange-100">
                    <span className="text-orange-900 text-xl">
                      {totauxFiltres.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-purple-100">
                    <span className="text-purple-900 text-xl">
                      {totauxFiltres.enCompte.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-green-100">
                    <span className="text-green-900 text-2xl">
                      {totauxFiltres.totalPort.toLocaleString('fr-MA')} DH
                    </span>
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
              : 'Aucune donnée de port disponible'
            }
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {hasActiveFilter
              ? 'Essayez de modifier vos critères de recherche'
              : 'Les statistiques apparaîtront ici une fois que des colis seront créés'
            }
          </p>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearchCity('')
                setPortTypeFilter('all')
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
