import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase/config'
import {
  subscribeReturnFundsCheques,
  getMoreReturnFundsCheques,
  createReturnFundCheque,
  updateReturnFundCheque,
  deliverReturnFundCheque,
  deleteReturnFundCheque,
  checkExpiringCheques,
  ReturnFundCheque,
  ReturnFundStatus,
} from '../firebase/returnFunds'
import {
  Package, LogOut, Plus, Search, Filter, X, Check, User, Phone,
  Calendar, MapPin, CreditCard, AlertTriangle, CheckCircle2, Clock,
  FileText, TrendingUp, Users, Eye, Trash2, Edit2, Building2,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'

export default function DRFCPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [returnFunds, setReturnFunds] = useState<ReturnFundCheque[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<any>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnFundStatus>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'cheque' | 'traite'>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Modals
  const [createModal, setCreateModal] = useState(false)
  const [deliverModal, setDeliverModal] = useState<ReturnFundCheque | null>(null)
  const [viewModal, setViewModal] = useState<ReturnFundCheque | null>(null)

  // Form states
  const [form, setForm] = useState({
    type: 'cheque' as 'cheque' | 'traite',
    encaisseurName: '',
    encaisseurCity: '',
    clientName: '',
    clientPhone: '',
    clientCin: '',
    trackingId: '',
    amount: '',
    checkNumber: '',
    bankName: '',
    expiryDate: '',
    notes: '',
  })

  const [deliverForm, setDeliverForm] = useState({
    cinPhotoUrl: '',
    signaturePhotoUrl: '',
    notes: '',
  })

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
        role: 'distributeur_cheques',
      })
      setLoading(false)
    })

    return () => unsubAuth()
  }, [navigate])

  // Subscribe to return funds
  useEffect(() => {
    if (!profile) return

    const unsub = subscribeReturnFundsCheques(
      (data, doc) => {
        setReturnFunds(data)
        setLastDoc(doc)
        if (data.length < 9000) {
          setHasMore(false)
        }
      },
      (err) => {
        console.error('Error loading return funds:', err)
      },
      undefined,
      9000
    )

    return () => unsub()
  }, [profile])

  // Filtered data
  const filteredData = useMemo(() => {
    return returnFunds.filter((rf) => {
      if (statusFilter !== 'all' && rf.status !== statusFilter) return false
      if (typeFilter !== 'all' && rf.type !== typeFilter) return false

      if (search) {
        const q = search.toLowerCase()
        const matches = [
          rf.clientName,
          rf.clientPhone,
          rf.clientCin,
          rf.trackingId,
          rf.checkNumber,
          rf.bankName,
          rf.encaisseurName,
          rf.encaisseurCity,
          rf.amount.toString(),
        ].some((v) => v?.toLowerCase().includes(q))
        if (!matches) return false
      }

      return true
    })
  }, [returnFunds, statusFilter, typeFilter, search])

  // Statistics
  const stats = useMemo(() => {
    const pending = returnFunds.filter((rf) => rf.status === 'pending' || rf.status === 'verified' || rf.status === 'ready')
    const delivered = returnFunds.filter((rf) => rf.status === 'delivered')
    const totalPending = pending.reduce((sum, rf) => sum + rf.amount, 0)
    const totalDelivered = delivered.reduce((sum, rf) => sum + rf.amount, 0)

    const expiry = checkExpiringCheques(returnFunds)

    return {
      totalPending: pending.length,
      totalDelivered: delivered.length,
      amountPending: totalPending,
      amountDelivered: totalDelivered,
      expiring: expiry.expiringSoon.length + expiry.expiringUrgent.length,
      expired: expiry.expired.length,
    }
  }, [returnFunds])

  // Create new return fund
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createReturnFundCheque({
        type: form.type,
        encaisseurId: '',
        encaisseurName: form.encaisseurName,
        encaisseurCity: form.encaisseurCity,
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        clientCin: form.clientCin,
        trackingId: form.trackingId,
        amount: parseFloat(form.amount),
        checkNumber: form.checkNumber,
        bankName: form.bankName,
        expiryDate: Timestamp.fromDate(new Date(form.expiryDate)),
        notes: form.notes,
      } as any)
      setCreateModal(false)
      setForm({
        type: 'cheque',
        encaisseurName: '',
        encaisseurCity: '',
        clientName: '',
        clientPhone: '',
        clientCin: '',
        trackingId: '',
        amount: '',
        checkNumber: '',
        bankName: '',
        expiryDate: '',
        notes: '',
      })
      alert('✅ Chèque/Traite enregistré!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur lors de la création')
    }
  }

  // Mark as ready
  const handleMarkReady = async (id: string) => {
    if (!confirm('Marquer comme prêt pour retrait?')) return
    try {
      await updateReturnFundCheque(id, { status: 'ready' })
      alert('✅ Marqué comme prêt!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
    }
  }

  // Deliver
  const handleDeliver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deliverModal) return
    if (!confirm(`Confirmer la remise du ${deliverModal.type} n°${deliverModal.checkNumber} à ${deliverModal.clientName}?`)) return

    try {
      await deliverReturnFundCheque(
        deliverModal.id,
        profile.id,
        profile.name,
        deliverForm.cinPhotoUrl,
        deliverForm.signaturePhotoUrl,
        deliverForm.notes
      )
      setDeliverModal(null)
      setDeliverForm({ cinPhotoUrl: '', signaturePhotoUrl: '', notes: '' })
      alert('✅ Chèque/Traite remis au client!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur lors de la remise')
    }
  }

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce retour de fond?')) return
    try {
      await deleteReturnFundCheque(id)
      alert('✅ Supprimé!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
    }
  }

  // Load more
  const handleLoadMore = async () => {
    if (!lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const result = await getMoreReturnFundsCheques(lastDoc, undefined, 9000)
      setReturnFunds(prev => [...prev, ...result.data])
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Error loading more:', err)
      alert('❌ Erreur lors du chargement')
    } finally {
      setLoadingMore(false)
    }
  }

  const getStatusBadge = (status: ReturnFundStatus) => {
    const map: Record<ReturnFundStatus, { label: string; bg: string; text: string }> = {
      pending: { label: 'En attente', bg: 'bg-yellow-100', text: 'text-yellow-700' },
      verified: { label: 'Vérifié', bg: 'bg-blue-100', text: 'text-blue-700' },
      ready: { label: 'Prêt', bg: 'bg-green-100', text: 'text-green-700' },
      delivered: { label: 'Remis', bg: 'bg-gray-100', text: 'text-gray-700' },
      dispute: { label: 'Litige', bg: 'bg-red-100', text: 'text-red-700' },
      problem: { label: 'Problème', bg: 'bg-red-100', text: 'text-red-700' },
      expired: { label: 'Expiré', bg: 'bg-red-100', text: 'text-red-700' },
    }
    const s = map[status] || map.pending
    return <span className={`px-2 py-1 rounded-lg text-xs font-bold ${s.bg} ${s.text}`}>{s.label}</span>
  }

  const getDaysUntilExpiry = (expiryDate: Timestamp) => {
    const days = Math.ceil((expiryDate.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (days < 0) return <span className="text-red-600 font-bold">Expiré ({Math.abs(days)}j)</span>
    if (days === 0) return <span className="text-red-600 font-bold">Expire aujourd'hui</span>
    if (days <= 1) return <span className="text-red-600 font-bold">{days}j</span>
    if (days <= 3) return <span className="text-orange-600 font-bold">{days}j</span>
    return <span className="text-gray-600">{days}j</span>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">DRFC - Distribution Retour de Fond Chèques/Traites</h1>
                <p className="text-sm text-gray-600">{profile?.name} • {returnFunds.length} chèques/traites</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Chargement...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5" />
                      Charger plus
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => auth.signOut()}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl p-4 border-2 border-yellow-200">
            <div className="flex items-center gap-3">
              <Clock className="w-10 h-10 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalPending}</p>
                <p className="text-xs text-gray-600">En attente</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalDelivered}</p>
                <p className="text-xs text-gray-600">Remis</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-blue-200">
            <div className="flex items-center gap-3">
              <CreditCard className="w-10 h-10 text-blue-600" />
              <div>
                <p className="text-lg font-bold text-gray-900">{stats.amountPending.toLocaleString()} DH</p>
                <p className="text-xs text-gray-600">En stock</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-10 h-10 text-gray-600" />
              <div>
                <p className="text-lg font-bold text-gray-900">{stats.amountDelivered.toLocaleString()} DH</p>
                <p className="text-xs text-gray-600">Remis total</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-orange-200">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.expiring}</p>
                <p className="text-xs text-gray-600">Expiration proche</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-red-200">
            <div className="flex items-center gap-3">
              <X className="w-10 h-10 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.expired}</p>
                <p className="text-xs text-gray-600">Expirés</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions and Filters */}
      <div className="max-w-7xl mx-auto px-4 pb-4">
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <button
              onClick={() => setCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              <Plus className="w-5 h-5" />
              Nouvelle réception
            </button>

            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher client, n° chèque, banque..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
            >
              <Filter className="w-5 h-5" />
              Filtres
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-700">Statut:</span>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Tous
                </button>
                <button
                  onClick={() => setStatusFilter('ready')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    statusFilter === 'ready' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Prêt
                </button>
                <button
                  onClick={() => setStatusFilter('delivered')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    statusFilter === 'delivered' ? 'bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Remis
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-700">Type:</span>
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    typeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Tous
                </button>
                <button
                  onClick={() => setTypeFilter('cheque')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    typeFilter === 'cheque' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  📋 Chèques
                </button>
                <button
                  onClick={() => setTypeFilter('traite')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    typeFilter === 'traite' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  📝 Traites
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">N° Chèque</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Banque</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Échéance</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Jours restants</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Aucun chèque/traite trouvé
                    </td>
                  </tr>
                ) : (
                  filteredData.map((rf) => (
                    <tr key={rf.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-xl">{rf.type === 'cheque' ? '📋' : '📝'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{rf.clientName}</div>
                        <div className="text-xs text-gray-500">{rf.clientPhone}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">{rf.checkNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rf.bankName}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-blue-700">{rf.amount.toLocaleString()} DH</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {rf.expiryDate.toDate().toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3">{getDaysUntilExpiry(rf.expiryDate)}</td>
                      <td className="px-4 py-3">{getStatusBadge(rf.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setViewModal(rf)}
                            className="p-1.5 hover:bg-gray-100 rounded transition"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                          </button>
                          {rf.status === 'pending' && (
                            <button
                              onClick={() => handleMarkReady(rf.id)}
                              className="p-1.5 hover:bg-green-100 rounded transition"
                              title="Marquer comme prêt"
                            >
                              <Check className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                          {rf.status === 'ready' && (
                            <button
                              onClick={() => setDeliverModal(rf)}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition font-semibold"
                            >
                              🤝 Remettre
                            </button>
                          )}
                          {rf.status !== 'delivered' && (
                            <button
                              onClick={() => handleDelete(rf.id)}
                              className="p-1.5 hover:bg-red-100 rounded transition"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-800">Nouvelle réception chèque/traite</h3>
              <button onClick={() => setCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Type *</label>
                <select
                  required
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'cheque' | 'traite' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cheque">📋 Chèque</option>
                  <option value="traite">📝 Traite</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Encaisseur *</label>
                <input
                  type="text"
                  required
                  value={form.encaisseurName}
                  onChange={(e) => setForm({ ...form, encaisseurName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom de l'encaisseur"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ville d'origine *</label>
                <input
                  type="text"
                  required
                  value={form.encaisseurCity}
                  onChange={(e) => setForm({ ...form, encaisseurCity: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ville"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Client bénéficiaire *</label>
                <input
                  type="text"
                  required
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom complet"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="06xxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Numéro {form.type} *</label>
                <input
                  type="text"
                  required
                  value={form.checkNumber}
                  onChange={(e) => setForm({ ...form, checkNumber: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: 1234567"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Banque *</label>
                <input
                  type="text"
                  required
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom de la banque"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Montant (DH) *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Date d'échéance *</label>
                <input
                  type="date"
                  required
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">N° Expédition</label>
                <input
                  type="text"
                  value={form.trackingId}
                  onChange={(e) => setForm({ ...form, trackingId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="N° EXP"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Remarques..."
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
              >
                Enregistrer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deliver Modal */}
      {deliverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-800">Remettre {deliverModal.type} au client</h3>
              <button onClick={() => setDeliverModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-blue-700" />
                  <span className="font-bold text-blue-900">{deliverModal.clientName}</span>
                </div>
                <div className="text-sm text-blue-700 space-y-1">
                  <div>📞 {deliverModal.clientPhone}</div>
                  <div>N° {deliverModal.checkNumber} - {deliverModal.bankName}</div>
                  <div className="font-bold text-2xl mt-2">{deliverModal.amount.toLocaleString()} DH</div>
                </div>
              </div>
              <form onSubmit={handleDeliver} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Photo CIN</label>
                  <input
                    type="text"
                    value={deliverForm.cinPhotoUrl}
                    onChange={(e) => setDeliverForm({ ...deliverForm, cinPhotoUrl: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="URL de la photo CIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Photo signature + décharge</label>
                  <input
                    type="text"
                    value={deliverForm.signaturePhotoUrl}
                    onChange={(e) => setDeliverForm({ ...deliverForm, signaturePhotoUrl: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="URL de la photo signature"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={deliverForm.notes}
                    onChange={(e) => setDeliverForm({ ...deliverForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
                >
                  ✅ Confirmer la remise
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-800">Détails du {viewModal.type}</h3>
              <button onClick={() => setViewModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <p className="font-semibold text-gray-900">{viewModal.type === 'cheque' ? '📋 Chèque' : '📝 Traite'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Numéro</p>
                  <p className="font-mono font-semibold text-gray-900">{viewModal.checkNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Banque</p>
                  <p className="font-semibold text-gray-900">{viewModal.bankName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Montant</p>
                  <p className="font-bold text-2xl text-blue-700">{viewModal.amount.toLocaleString()} DH</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client</p>
                  <p className="font-semibold text-gray-900">{viewModal.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Téléphone</p>
                  <p className="font-semibold text-gray-900">{viewModal.clientPhone}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date d'échéance</p>
                  <p className="font-semibold text-gray-900">{viewModal.expiryDate.toDate().toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Jours restants</p>
                  {getDaysUntilExpiry(viewModal.expiryDate)}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Encaisseur</p>
                  <p className="font-semibold text-gray-900">{viewModal.encaisseurName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Ville</p>
                  <p className="font-semibold text-gray-900">{viewModal.encaisseurCity}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date de réception</p>
                  <p className="font-semibold text-gray-900">{viewModal.receivedAt.toDate().toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Statut</p>
                  {getStatusBadge(viewModal.status)}
                </div>
                {viewModal.deliveredAt && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Date de remise</p>
                      <p className="font-semibold text-gray-900">{viewModal.deliveredAt.toDate().toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Remis par</p>
                      <p className="font-semibold text-gray-900">{viewModal.deliveredByName || 'N/A'}</p>
                    </div>
                  </>
                )}
              </div>
              {viewModal.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{viewModal.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
