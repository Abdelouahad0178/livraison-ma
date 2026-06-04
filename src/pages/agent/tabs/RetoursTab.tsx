import { useState, useMemo } from 'react'
import { Package, Truck, User, MapPin, Calendar, RotateCcw, Send, Check, X, Search, Filter, Eye, Trash2, Edit2, BarChart3, Printer } from 'lucide-react'
import { STATUS_COLORS } from '../../../firebase/constants'
import { printRetoursToLoad, printRetoursReceived, printRetoursHistory } from '../../../utils/printRetours'
import { isInReturnCircuit } from '../../../firebase/parcels'

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

    // À charger (agence destination - où le colis est physiquement)
    // Après markParcelAsReturned, originCity = agence physique (destination d'origine)
    const toLoad = allParcels.filter((p: any) =>
      p.status === 'Retourné' &&
      p.originCity === profile?.city
    )

    // Reçus (agence source - où le colis doit revenir)
    const received = allParcels.filter((p: any) => {
      // Colis dans le circuit retour, en transit ou arrivé
      const isReturnInProgress = p.status === 'Retour en transit' || p.status === 'Retour arrivé'
      if (!isReturnInProgress) return false

      // Le colis doit revenir vers cette agence (agence source)
      // Après swap : destinationCity = agence source, returnToCity = agence source
      const isForThisAgency = p.returnToCity === profile?.city ||
                             p.destinationCity === profile?.city

      return isForThisAgency
    })

    // Historique complet (tous les retours finalisés)
    const history = allParcels.filter((p: any) =>
      p.status === 'Retour finalisé' &&
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

  const ParcelCard = ({ p, showActions = true }: any) => {
    // Déterminer l'agence d'origine (avant swap) et l'agence de destination finale
    const agenceSource = p.createdByCity || p.returnToCity || p.destinationCity
    const agenceDestination = p.originCity

    // Timeline des étapes
    const timeline = [
      {
        label: `${agenceDestination}`,
        status: 'Retourné',
        icon: '📦',
        completed: true,
        date: p.returnedAt
      },
      {
        label: 'En transit',
        status: 'Retour en transit',
        icon: '🚛',
        completed: p.status === 'Retour en transit' || p.status === 'Retour arrivé' || p.status === 'Retour finalisé',
        current: p.status === 'Retour en transit',
        date: p.returnShippedAt
      },
      {
        label: `${agenceSource}`,
        status: 'Retour arrivé',
        icon: '📥',
        completed: p.status === 'Retour arrivé' || p.status === 'Retour finalisé',
        current: p.status === 'Retour arrivé',
        date: p.returnArrivedAt
      },
      {
        label: 'Livré expéditeur',
        status: 'Retour finalisé',
        icon: '✅',
        completed: p.status === 'Retour finalisé',
        current: p.status === 'Retour finalisé',
        date: p.returnFinalizedAt || p.deliveredAt
      }
    ]

    return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold text-blue-600 text-lg">{p.trackingId}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status]?.bg || 'bg-gray-100'} ${STATUS_COLORS[p.status]?.text || 'text-gray-700'}`}>
              {p.status}
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-300">
              🔄 RETOURNÉ
            </span>
          </div>

          {/* Timeline visuelle */}
          <div className="bg-gradient-to-r from-orange-50 to-blue-50 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between relative">
              {timeline.map((step, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center relative">
                  {/* Ligne de connexion */}
                  {idx < timeline.length - 1 && (
                    <div className={`absolute top-5 left-1/2 w-full h-0.5 ${step.completed ? 'bg-orange-400' : 'bg-gray-300'}`} />
                  )}

                  {/* Icône */}
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                    step.current ? 'bg-orange-500 text-white ring-4 ring-orange-200 animate-pulse' :
                    step.completed ? 'bg-orange-400 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {step.icon}
                  </div>

                  {/* Label */}
                  <div className={`mt-2 text-xs font-medium text-center ${
                    step.current ? 'text-orange-700' :
                    step.completed ? 'text-orange-600' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </div>

                  {/* Date */}
                  {step.date && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {formatDate(step.date)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Informations détaillées */}
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Expéditeur original</div>
              <div className="font-medium">{p.sender?.name}</div>
              <div className="text-xs text-gray-400">{agenceSource}</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Destinataire original</div>
              <div className="font-medium">{p.receiver?.name}</div>
              <div className="text-xs text-gray-400">{agenceDestination}</div>
            </div>
          </div>

          {/* Raison du retour */}
          {p.returnReason && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-3">
              <div className="text-xs font-semibold text-orange-700 mb-1">📋 Raison du retour</div>
              <div className="text-sm text-orange-600">{p.returnReason}</div>
            </div>
          )}

          {/* Historique des opérations */}
          {p.history && p.history.length > 0 && (
            <details className="bg-gray-50 rounded-lg p-2 mt-2">
              <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
                📜 Historique complet ({p.history.length} opérations)
              </summary>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {[...p.history].reverse().map((h: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 text-xs p-1.5 bg-white rounded border border-gray-200">
                    <div className="flex-shrink-0 w-16 text-gray-400">
                      {new Date(h.timestamp).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex-1">
                      <span className={`font-medium ${STATUS_COLORS[h.status]?.text || 'text-gray-700'}`}>
                        {h.status}
                      </span>
                      {h.note && <div className="text-gray-500 text-[11px] mt-0.5">{h.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
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
  )}

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
            <option value="Retourné">Retourné (initié)</option>
            <option value="Retour en transit">Retour en transit</option>
            <option value="Retour arrivé">Retour arrivé</option>
            <option value="Retour finalisé">Retour finalisé</option>
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
