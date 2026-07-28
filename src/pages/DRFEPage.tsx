import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase/config'
import {
  subscribeCodParcelsEspeces,
  getMoreCodParcelsEspeces,
  markCodAsCollected,
  markCodAsRemis,
  type Parcel,
} from '../firebase/parcels'
import {
  Package, LogOut, Search, Filter, X, Check, User, Phone,
  Calendar, MapPin, Banknote, AlertTriangle, CheckCircle2, Clock,
  Wallet, TrendingUp, Eye, PackageCheck, HandCoins,
} from 'lucide-react'

type CodStatus = 'pending' | 'collected' | 'remis' | 'all'

export default function DRFEPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<any>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CodStatus>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Modals
  const [viewModal, setViewModal] = useState<Parcel | null>(null)

  // Load user profile
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        navigate('/login')
        return
      }

      setProfile({
        id: user.uid,
        email: user.email,
        name: user.displayName || 'Distributeur',
        role: 'distributeur_especes',
      })
      setLoading(false)
    })

    return () => unsubAuth()
  }, [navigate])

  // Subscribe to COD parcels
  useEffect(() => {
    if (!profile) return

    const filterStatus = statusFilter === 'all' ? undefined : statusFilter

    const unsub = subscribeCodParcelsEspeces(
      (data, doc) => {
        setParcels(data)
        setLastDoc(doc)
        setHasMore(data.length >= 9000)
      },
      (err) => {
        console.error('Error loading COD parcels:', err)
      },
      filterStatus,
      9000
    )

    return () => unsub()
  }, [profile, statusFilter])

  // Load more
  const handleLoadMore = async () => {
    if (!lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const filterStatus = statusFilter === 'all' ? undefined : statusFilter
      const result = await getMoreCodParcelsEspeces(lastDoc, filterStatus, 9000)
      setParcels((prev) => [...prev, ...result.data])
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Error loading more:', err)
      alert('❌ Erreur lors du chargement')
    } finally {
      setLoadingMore(false)
    }
  }

  // Filtered data
  const filtered = useMemo(() => {
    return parcels.filter((p) => {
      if (search) {
        const q = search.toLowerCase()
        const matches = [
          p.sender.nic,
          p.trackingId,
          p.sender.name,
          p.receiver.name,
          p.receiver.tel,
          p.receiver.phone,
          p.codAmount.toString(),
        ].some((v) => v?.toLowerCase().includes(q))
        if (!matches) return false
      }

      return true
    })
  }, [parcels, search])

  // Statistics
  const stats = useMemo(() => {
    const pending = parcels.filter((p) => !p.codStatus || p.codStatus === 'pending')
    const collected = parcels.filter((p) => p.codStatus === 'collected')
    const remis = parcels.filter((p) => p.codStatus === 'remis')

    const totalPending = pending.reduce((sum, p) => sum + p.codAmount, 0)
    const totalCollected = collected.reduce((sum, p) => sum + p.codAmount, 0)
    const totalRemis = remis.reduce((sum, p) => sum + p.codAmount, 0)

    return {
      pending: { count: pending.length, amount: totalPending },
      collected: { count: collected.length, amount: totalCollected },
      remis: { count: remis.length, amount: totalRemis },
    }
  }, [parcels])

  // Mark as collected
  const handleMarkCollected = async (parcel: Parcel) => {
    if (!confirm(`Marquer ${parcel.trackingId} comme reçu du collecteur (${parcel.codAmount} DH)?`)) return
    try {
      await markCodAsCollected(parcel.id, profile.id, profile.name)
      alert('✅ Marqué comme collecté!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
    }
  }

  // Mark as remis
  const handleMarkRemis = async (parcel: Parcel) => {
    if (!confirm(`Confirmer remise de ${parcel.codAmount} DH à ${parcel.sender.name}?`)) return
    try {
      await markCodAsRemis(parcel.id, profile.id, profile.name)
      alert('✅ Espèces remises au client!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
    }
  }

  // Logout
  const handleLogout = async () => {
    await auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-green-600 text-xl font-semibold animate-pulse">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-3 rounded-xl shadow-lg">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">DRFE - Distribution Retour de Fond Espèces</h1>
                <p className="text-sm text-gray-500">Distributeur • {parcels.length} expéditions COD</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      Charger plus
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <div className="text-3xl font-bold text-orange-900">{stats.pending.count}</div>
                <div className="text-sm text-orange-700">En attente</div>
                <div className="text-lg font-semibold text-orange-800 mt-1">{stats.pending.amount.toLocaleString()} DH</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center gap-3">
              <PackageCheck className="w-8 h-8 text-blue-600" />
              <div>
                <div className="text-3xl font-bold text-blue-900">{stats.collected.count}</div>
                <div className="text-sm text-blue-700">En caisse</div>
                <div className="text-lg font-semibold text-blue-800 mt-1">{stats.collected.amount.toLocaleString()} DH</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <div className="text-3xl font-bold text-green-900">{stats.remis.count}</div>
                <div className="text-sm text-green-700">Remis</div>
                <div className="text-lg font-semibold text-green-800 mt-1">{stats.remis.amount.toLocaleString()} DH</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher N° EXP, client, téléphone, montant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" />
              Filtres
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-lg ${
                  statusFilter === 'all'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 rounded-lg ${
                  statusFilter === 'pending'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En attente
              </button>
              <button
                onClick={() => setStatusFilter('collected')}
                className={`px-4 py-2 rounded-lg ${
                  statusFilter === 'collected'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En caisse
              </button>
              <button
                onClick={() => setStatusFilter('remis')}
                className={`px-4 py-2 rounded-lg ${
                  statusFilter === 'remis'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Remis
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° EXP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client expéditeur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date création</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Aucune expédition COD espèces trouvée
                    </td>
                  </tr>
                ) : (
                  filtered.map((parcel) => {
                    const codStatus = parcel.codStatus || 'pending'
                    const statusConfig = {
                      pending: { label: 'En attente', color: 'bg-orange-100 text-orange-700' },
                      collected: { label: 'En caisse', color: 'bg-blue-100 text-blue-700' },
                      remis: { label: 'Remis', color: 'bg-green-100 text-green-700' },
                    }[codStatus]

                    return (
                      <tr key={parcel.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-sm font-semibold text-blue-600">
                          {parcel.sender.nic || parcel.trackingId}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{parcel.sender.name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {parcel.sender.tel}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-green-700">{parcel.codAmount.toLocaleString()} DH</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {typeof parcel.createdAt === 'string'
                            ? new Date(parcel.createdAt).toLocaleDateString('fr-FR')
                            : parcel.createdAt.toDate().toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewModal(parcel)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Voir détails"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {codStatus === 'pending' && (
                              <button
                                onClick={() => handleMarkCollected(parcel)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Marquer comme collecté"
                              >
                                <PackageCheck className="w-4 h-4" />
                              </button>
                            )}

                            {codStatus === 'collected' && (
                              <button
                                onClick={() => handleMarkRemis(parcel)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                title="Remettre au client"
                              >
                                <HandCoins className="w-4 h-4" />
                              </button>
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
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Détails de l'expédition</h2>
              <button
                onClick={() => setViewModal(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 font-medium">N° EXP (NIC)</label>
                  <div className="font-mono font-bold text-blue-600">{viewModal.sender.nic || viewModal.trackingId}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Montant COD</label>
                  <div className="font-bold text-green-700 text-xl">{viewModal.codAmount.toLocaleString()} DH</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">📤 Expéditeur (Client propriétaire)</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-gray-500">Nom</label>
                    <div className="font-medium">{viewModal.sender.name}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Téléphone</label>
                    <div className="font-medium">{viewModal.sender.tel}</div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">📥 Destinataire</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-gray-500">Nom</label>
                    <div className="font-medium">{viewModal.receiver.name}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Téléphone</label>
                    <div className="font-medium">{viewModal.receiver.tel}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Ville</label>
                    <div className="font-medium">{viewModal.receiver.city}</div>
                  </div>
                </div>
              </div>

              {viewModal.codCollectedAt && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">✅ Collecté</h3>
                  <div className="text-sm text-gray-600">
                    Le {new Date(viewModal.codCollectedAt).toLocaleString('fr-FR')}
                  </div>
                </div>
              )}

              {viewModal.codRemisAt && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">🎉 Remis au client</h3>
                  <div className="text-sm text-gray-600">
                    Le {new Date(viewModal.codRemisAt).toLocaleString('fr-FR')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
