import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase/config'
import {
  subscribeReturnFundsEspeces,
  createReturnFundEspeces,
  updateReturnFundEspeces,
  deliverReturnFundEspeces,
  deleteReturnFundEspeces,
  ReturnFundEspeces,
  ReturnFundStatus,
} from '../firebase/returnFunds'
import {
  Package, LogOut, Plus, Search, Filter, X, Check, User, Phone,
  Calendar, MapPin, Banknote, AlertTriangle, CheckCircle2, Clock,
  Wallet, TrendingUp, Users, Eye, Trash2, Edit2,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'

export default function DRFEPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [returnFunds, setReturnFunds] = useState<ReturnFundEspeces[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnFundStatus>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Modals
  const [createModal, setCreateModal] = useState(false)
  const [deliverModal, setDeliverModal] = useState<ReturnFundEspeces | null>(null)
  const [viewModal, setViewModal] = useState<ReturnFundEspeces | null>(null)

  // Form states
  const [form, setForm] = useState({
    encaisseurName: '',
    encaisseurCity: '',
    clientName: '',
    clientPhone: '',
    clientCin: '',
    trackingId: '',
    amount: '',
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

      // TODO: Load user profile from Firestore
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

  // Subscribe to return funds
  useEffect(() => {
    if (!profile) return

    const unsub = subscribeReturnFundsEspeces(
      (data) => {
        setReturnFunds(data)
      },
      (err) => {
        console.error('Error loading return funds:', err)
      }
    )

    return () => unsub()
  }, [profile])

  // Filtered data
  const filteredData = useMemo(() => {
    return returnFunds.filter((rf) => {
      // Status filter
      if (statusFilter !== 'all' && rf.status !== statusFilter) return false

      // Search filter
      if (search) {
        const q = search.toLowerCase()
        const matches = [
          rf.clientName,
          rf.clientPhone,
          rf.clientCin,
          rf.trackingId,
          rf.encaisseurName,
          rf.encaisseurCity,
          rf.amount.toString(),
        ].some((v) => v?.toLowerCase().includes(q))
        if (!matches) return false
      }

      return true
    })
  }, [returnFunds, statusFilter, search])

  // Statistics
  const stats = useMemo(() => {
    const pending = returnFunds.filter((rf) => rf.status === 'pending' || rf.status === 'verified' || rf.status === 'ready')
    const delivered = returnFunds.filter((rf) => rf.status === 'delivered')
    const totalPending = pending.reduce((sum, rf) => sum + rf.amount, 0)
    const totalDelivered = delivered.reduce((sum, rf) => sum + rf.amount, 0)
    const old = pending.filter((rf) => {
      const days = Math.floor((Date.now() - rf.receivedAt.toDate().getTime()) / (1000 * 60 * 60 * 24))
      return days > 7
    })

    return {
      totalPending: pending.length,
      totalDelivered: delivered.length,
      amountPending: totalPending,
      amountDelivered: totalDelivered,
      oldCount: old.length,
    }
  }, [returnFunds])

  // Create new return fund
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createReturnFundEspeces({
        encaisseurId: '', // TODO: Link to actual encaisseur
        encaisseurName: form.encaisseurName,
        encaisseurCity: form.encaisseurCity,
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        clientCin: form.clientCin,
        trackingId: form.trackingId,
        amount: parseFloat(form.amount),
        notes: form.notes,
      } as any)
      setCreateModal(false)
      setForm({
        encaisseurName: '',
        encaisseurCity: '',
        clientName: '',
        clientPhone: '',
        clientCin: '',
        trackingId: '',
        amount: '',
        notes: '',
      })
      alert('✅ Retour de fond enregistré!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur lors de la création')
    }
  }

  // Mark as ready for delivery
  const handleMarkReady = async (id: string) => {
    if (!confirm('Marquer comme prêt pour retrait?')) return
    try {
      await updateReturnFundEspeces(id, { status: 'ready' })
      alert('✅ Marqué comme prêt!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
    }
  }

  // Deliver to client
  const handleDeliver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deliverModal) return
    if (!confirm(`Confirmer la remise de ${deliverModal.amount} DH à ${deliverModal.clientName}?`)) return

    try {
      await deliverReturnFundEspeces(
        deliverModal.id,
        profile.id,
        profile.name,
        deliverForm.cinPhotoUrl,
        deliverForm.signaturePhotoUrl,
        deliverForm.notes
      )
      setDeliverModal(null)
      setDeliverForm({ cinPhotoUrl: '', signaturePhotoUrl: '', notes: '' })
      alert('✅ Espèces remises au client!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur lors de la remise')
    }
  }

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce retour de fond?')) return
    try {
      await deleteReturnFundEspeces(id)
      alert('✅ Supprimé!')
    } catch (err) {
      console.error(err)
      alert('❌ Erreur')
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
              <Wallet className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">DRFE - Distribution Retour de Fond Espèces</h1>
                <p className="text-sm text-gray-600">{profile?.name}</p>
              </div>
            </div>
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

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <Banknote className="w-10 h-10 text-blue-600" />
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.amountPending.toLocaleString()} DH</p>
                <p className="text-xs text-gray-600">En caisse</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-gray-200">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-10 h-10 text-gray-600" />
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.amountDelivered.toLocaleString()} DH</p>
                <p className="text-xs text-gray-600">Remis total</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border-2 border-red-200">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.oldCount}</p>
                <p className="text-xs text-gray-600">Anciens (&gt;7j)</p>
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
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
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
                  placeholder="Rechercher client, téléphone, N° EXP..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
            <div className="mt-4 pt-4 border-t flex gap-2 flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  statusFilter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  statusFilter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En attente
              </button>
              <button
                onClick={() => setStatusFilter('ready')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  statusFilter === 'ready' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Prêt
              </button>
              <button
                onClick={() => setStatusFilter('delivered')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  statusFilter === 'delivered' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Remis
              </button>
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
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Téléphone</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">N° EXP</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Encaisseur</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Ville</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Date réception</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Aucun retour de fond trouvé
                    </td>
                  </tr>
                ) : (
                  filteredData.map((rf) => (
                    <tr key={rf.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{rf.clientName}</div>
                        {rf.clientCin && <div className="text-xs text-gray-500">CIN: {rf.clientCin}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rf.clientPhone}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-green-700">{rf.amount.toLocaleString()} DH</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rf.trackingId || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rf.encaisseurName}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rf.encaisseurCity}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {rf.receivedAt.toDate().toLocaleDateString('fr-FR')}
                      </td>
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
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition font-semibold"
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
              <h3 className="font-bold text-gray-800">Nouvelle réception espèces</h3>
              <button onClick={() => setCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Encaisseur *</label>
                <input
                  type="text"
                  required
                  value={form.encaisseurName}
                  onChange={(e) => setForm({ ...form, encaisseurName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="06xxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">CIN</label>
                <input
                  type="text"
                  value={form.clientCin}
                  onChange={(e) => setForm({ ...form, clientCin: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="CIN"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">N° Expédition</label>
                <input
                  type="text"
                  value={form.trackingId}
                  onChange={(e) => setForm({ ...form, trackingId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="N° EXP"
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={2}
                  placeholder="Remarques..."
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition"
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
              <h3 className="font-bold text-gray-800">Remettre espèces au client</h3>
              <button onClick={() => setDeliverModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-green-700" />
                  <span className="font-bold text-green-900">{deliverModal.clientName}</span>
                </div>
                <div className="text-sm text-green-700">
                  <div>📞 {deliverModal.clientPhone}</div>
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
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="URL de la photo CIN"
                  />
                  <p className="text-xs text-gray-500 mt-1">Prendre une photo de la CIN du client</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Photo signature</label>
                  <input
                    type="text"
                    value={deliverForm.signaturePhotoUrl}
                    onChange={(e) => setDeliverForm({ ...deliverForm, signaturePhotoUrl: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="URL de la photo signature"
                  />
                  <p className="text-xs text-gray-500 mt-1">Faire signer le reçu et prendre une photo</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={deliverForm.notes}
                    onChange={(e) => setDeliverForm({ ...deliverForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    rows={2}
                    placeholder="Remarques lors de la remise..."
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition"
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
              <h3 className="font-bold text-gray-800">Détails du retour de fond</h3>
              <button onClick={() => setViewModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client</p>
                  <p className="font-semibold text-gray-900">{viewModal.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Téléphone</p>
                  <p className="font-semibold text-gray-900">{viewModal.clientPhone}</p>
                </div>
                {viewModal.clientCin && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">CIN</p>
                    <p className="font-semibold text-gray-900">{viewModal.clientCin}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Montant</p>
                  <p className="font-bold text-2xl text-green-700">{viewModal.amount.toLocaleString()} DH</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Encaisseur</p>
                  <p className="font-semibold text-gray-900">{viewModal.encaisseurName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Ville d'origine</p>
                  <p className="font-semibold text-gray-900">{viewModal.encaisseurCity}</p>
                </div>
                {viewModal.trackingId && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">N° Expédition</p>
                    <p className="font-semibold text-gray-900">{viewModal.trackingId}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date de réception</p>
                  <p className="font-semibold text-gray-900">
                    {viewModal.receivedAt.toDate().toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Statut</p>
                  {getStatusBadge(viewModal.status)}
                </div>
                {viewModal.deliveredAt && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Date de remise</p>
                      <p className="font-semibold text-gray-900">
                        {viewModal.deliveredAt.toDate().toLocaleDateString('fr-FR')}
                      </p>
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
