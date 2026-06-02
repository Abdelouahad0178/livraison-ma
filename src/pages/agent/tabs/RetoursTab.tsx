import { useState, useMemo } from 'react'
import { Package, Truck, User, MapPin, Calendar, RotateCcw, Send, Check, X, Search, Filter, Eye, Trash2, Edit2, BarChart3, Printer } from 'lucide-react'
import { STATUS_COLORS } from '../../../firebase/constants'
import { printRetoursToLoad, printRetoursReceived, printRetoursHistory } from '../../../utils/printRetours'

export default function RetoursTab({
  profile,
  allParcels,
  drivers,
  onLoadReturnOnTruck,
  onAssignReturnDriver,
  onMarkReturnedToSender,
}: any) {
  const [selectedParcels, setSelectedParcels] = useState<string[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filtres
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('tous')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeSection, setActiveSection] = useState<'toLoad' | 'received' | 'history'>('toLoad')

  // Stats et données filtrées
  const { returnedParcels, stats } = useMemo(() => {
    if (!Array.isArray(allParcels)) return { returnedParcels: { toLoad: [], received: [], history: [] }, stats: {} }

    // À charger (agence destination)
    const toLoad = allParcels.filter((p: any) =>
      p.status === 'Retourné' &&
      p.destinationCity === profile?.city &&
      !p.returnToCity
    )

    // Reçus (agence source - où le colis doit revenir)
    const received = allParcels.filter((p: any) => {
      const isReturnStatus = p.status === 'En transit retour' ||
                            (p.status === 'Retourné' && p.returnToCity) ||
                            (p.wasReturned && p.status !== 'Retourné à l\'expéditeur')

      // Le colis doit revenir vers cette agence (agence source/origine)
      const isForThisAgency = p.returnToCity === profile?.city ||
                             (p.originCity === profile?.city && p.wasReturned && !p.returnToCity)

      return isReturnStatus && isForThisAgency && p.status !== 'Retourné à l\'expéditeur'
    })

    // Historique complet (tous les retours finalisés)
    const history = allParcels.filter((p: any) =>
      (p.status === 'Retourné à l\'expéditeur' || p.wasReturned) &&
      (p.originCity === profile?.city || p.destinationCity === profile?.city)
    )

    // Appliquer les filtres
    const applyFilters = (list: any[]) => {
      let filtered = [...list]

      // Filtre recherche
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((p: any) =>
          p.trackingId?.toLowerCase().includes(q) ||
          p.sender?.name?.toLowerCase().includes(q) ||
          p.receiver?.name?.toLowerCase().includes(q)
        )
      }

      // Filtre statut
      if (statusFilter !== 'tous') {
        filtered = filtered.filter((p: any) => p.status === statusFilter)
      }

      // Filtre date
      if (dateFrom) {
        filtered = filtered.filter((p: any) => {
          const date = p.returnedAt || p.createdAt
          if (!date) return false
          const ts = typeof date === 'string' ? date : date.toDate?.() || new Date(date.seconds * 1000)
          return new Date(ts) >= new Date(dateFrom)
        })
      }
      if (dateTo) {
        filtered = filtered.filter((p: any) => {
          const date = p.returnedAt || p.createdAt
          if (!date) return false
          const ts = typeof date === 'string' ? date : date.toDate?.() || new Date(date.seconds * 1000)
          return new Date(ts) <= new Date(dateTo + 'T23:59:59')
        })
      }

      return filtered
    }

    return {
      returnedParcels: {
        toLoad: applyFilters(toLoad),
        received: applyFilters(received),
        history: applyFilters(history),
      },
      stats: {
        toLoad: toLoad.length,
        received: received.length,
        history: history.length,
        total: toLoad.length + received.length + history.length,
      }
    }
  }, [allParcels, profile?.city, search, statusFilter, dateFrom, dateTo])

  const toggleSelect = (id: string) => {
    setSelectedParcels(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleLoadOnTruck = async () => {
    if (selectedParcels.length === 0) {
      setError('Sélectionnez au moins un colis')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onLoadReturnOnTruck(selectedParcels)
      setSelectedParcels([])
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignDriver = async (parcelId: string, driverId: string) => {
    if (!driverId) {
      setError('Sélectionnez un livreur')
      return
    }
    setLoading(true)
    setError('')
    try {
      const driver = drivers.find((d: any) => d.id === driverId)
      await onAssignReturnDriver(parcelId, driver)
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkReturned = async (parcelId: string) => {
    if (!confirm('Confirmer que ce colis a été retourné à l\'expéditeur ?')) return
    setLoading(true)
    setError('')
    try {
      await onMarkReturnedToSender(parcelId)
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ts: any) => {
    if (!ts) return '—'
    const d = typeof ts === 'string' ? new Date(ts) : ts.toDate?.() || new Date(ts.seconds * 1000)
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const ParcelCard = ({ p, showActions = true }: any) => (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-blue-600">{p.trackingId}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status]?.bg || 'bg-gray-100'} ${STATUS_COLORS[p.status]?.text || 'text-gray-700'}`}>
              {p.status}
            </span>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">De:</span>
              <span className="font-medium">{p.sender?.name}</span>
              <span className="text-gray-400">({p.originCity})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">À:</span>
              <span className="font-medium">{p.receiver?.name}</span>
              <span className="text-gray-400">({p.destinationCity})</span>
            </div>
            {p.returnReason && (
              <div className="text-xs text-orange-600 mt-1">
                🔄 Raison: {p.returnReason}
              </div>
            )}
            <div className="text-xs text-gray-400">
              {formatDate(p.returnedAt || p.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {showActions && activeSection === 'received' && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Assigner à livreur...</option>
            {drivers
              .filter((d: any) => d.city === profile?.city && d.role === 'livreur')
              .map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => handleAssignDriver(p.id, selectedDriver)}
            disabled={!selectedDriver || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            Assigner
          </button>
          <button
            onClick={() => handleMarkReturned(p.id)}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            ✓ Retourné
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-orange-600 text-sm font-medium">À charger</div>
          <div className="text-3xl font-bold text-orange-900">{stats.toLoad}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-blue-600 text-sm font-medium">Reçus</div>
          <div className="text-3xl font-bold text-blue-900">{stats.received}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-green-600 text-sm font-medium">Historique</div>
          <div className="text-3xl font-bold text-green-900">{stats.history}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-gray-600 text-sm font-medium">Total</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm">Filtres</span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="tous">Tous les statuts</option>
            <option value="Retourné">Retourné</option>
            <option value="En transit retour">En transit retour</option>
            <option value="Retourné à l'expéditeur">Retourné à l'expéditeur</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
            placeholder="Date début"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
            placeholder="Date fin"
          />
        </div>

        {(search || statusFilter !== 'tous' || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch('')
              setStatusFilter('tous')
              setDateFrom('')
              setDateTo('')
            }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Navigation sections */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveSection('toLoad')}
          className={`px-4 py-2 font-medium text-sm transition border-b-2 ${
            activeSection === 'toLoad'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          🚛 À charger ({returnedParcels.toLoad.length})
        </button>
        <button
          onClick={() => setActiveSection('received')}
          className={`px-4 py-2 font-medium text-sm transition border-b-2 ${
            activeSection === 'received'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📦 Reçus ({returnedParcels.received.length})
        </button>
        <button
          onClick={() => setActiveSection('history')}
          className={`px-4 py-2 font-medium text-sm transition border-b-2 ${
            activeSection === 'history'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📊 Historique ({returnedParcels.history.length})
        </button>
      </div>

      {/* Section: À charger */}
      {activeSection === 'toLoad' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-orange-900">
              Retours à charger sur camion
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => printRetoursToLoad(returnedParcels.toLoad, profile?.city || 'Agence')}
                disabled={returnedParcels.toLoad.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </button>
              {selectedParcels.length > 0 && (
                <button
                  onClick={handleLoadOnTruck}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  <Truck className="w-4 h-4" />
                  Charger {selectedParcels.length} colis
                </button>
              )}
            </div>
          </div>
          <div className="p-4">
            {returnedParcels.toLoad.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun colis à charger</p>
            ) : (
              <div className="space-y-2">
                {returnedParcels.toLoad.map((p: any) => (
                  <div key={p.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedParcels.includes(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 mt-1"
                    />
                    <div className="flex-1">
                      <ParcelCard p={p} showActions={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section: Reçus */}
      {activeSection === 'received' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">
                  Retours reçus à l'agence expéditeur
                </h3>
                <p className="text-xs text-blue-600 mt-1">
                  Assignez à un livreur ou marquez comme retourné à l'expéditeur
                </p>
              </div>
              <button
                onClick={() => printRetoursReceived(returnedParcels.received, profile?.city || 'Agence')}
                disabled={returnedParcels.received.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </button>
            </div>
          </div>
          <div className="p-4">
            {returnedParcels.received.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun retour reçu</p>
            ) : (
              <div className="space-y-3">
                {returnedParcels.received.map((p: any) => (
                  <ParcelCard key={p.id} p={p} showActions={true} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section: Historique */}
      {activeSection === 'history' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="bg-green-50 border-b border-green-100 px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-green-900">
                  Historique complet des retours
                </h3>
                <p className="text-xs text-green-600 mt-1">
                  Tous les colis retournés à l'expéditeur
                </p>
              </div>
              <button
                onClick={() => printRetoursHistory(returnedParcels.history, profile?.city || 'Agence', { dateFrom, dateTo })}
                disabled={returnedParcels.history.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </button>
            </div>
          </div>
          <div className="p-4">
            {returnedParcels.history.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun historique</p>
            ) : (
              <div className="space-y-3">
                {returnedParcels.history.map((p: any) => (
                  <ParcelCard key={p.id} p={p} showActions={false} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
