import { CheckCircle, XCircle, Clock, Banknote, AlertTriangle, Eye, Search, X, Plus, Edit, Trash2 } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'
import { useState, useMemo } from 'react'
import { filterByDate } from '../../../utils/dateFilter'
import type { DateFilterPreset } from '../../../types'
import { deleteAllDriverVersements } from '../../../firebase/firestore'

const PAYMENT_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  especes: { label: 'Espèces', emoji: '💵', color: 'green' },
  cheque: { label: 'Chèque', emoji: '📝', color: 'blue' },
  virement: { label: 'Virement', emoji: '🏦', color: 'purple' },
}

// Type de versement (Port Dû / COD) — les anciens versements sans champ `type` sont traités comme Port Dû
const TYPE_META: Record<string, { label: string; emoji: string; cls: string }> = {
  port_du: { label: 'Port Dû', emoji: '📮', cls: 'bg-orange-100 text-orange-700' },
  cod: { label: 'COD', emoji: '💰', cls: 'bg-green-100 text-green-700' },
}

const transferType = (t: any): string => (t.type === 'cod' ? 'cod' : 'port_du')

const transferDate = (t: any): Date => t.createdAt?.toDate?.() || new Date(t.createdAt || 0)

export default function AdminVersementsTab({
  adminTransfers,
  confirmAdminTransfer,
  rejectAdminTransfer,
  createAdminTransferDirect,
  updateAdminTransfer,
  deleteAdminTransfer,
  auth,
}: any) {
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [rejectModal, setRejectModal] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all, pending, confirmed, rejected
  const [cityFilter, setCityFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all') // all, especes, cheque, virement
  const [typeFilter, setTypeFilter] = useState('all') // all, port_du, cod
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  // États pour les modaux CRUD
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState<any>(null)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<any>(null)
  const [deleteAllModal, setDeleteAllModal] = useState(false)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [formData, setFormData] = useState({
    city: '',
    fromName: '',
    fromRole: 'agent',
    amount: '',
    paymentType: 'especes',
    type: 'port_du',
    status: 'pending',
    reference: '',
    note: '',
  })

  // Liste des villes présentes dans les versements
  const cities = useMemo(
    () =>
      Array.from(new Set(adminTransfers.map((t: any) => t.city).filter(Boolean))).sort() as string[],
    [adminTransfers]
  )

  // Base filtrée (ville + paiement + période + recherche) — les totaux reflètent ces filtres
  const baseFiltered = useMemo(() => {
    let list = adminTransfers
    if (cityFilter !== 'all') list = list.filter((t: any) => t.city === cityFilter)
    if (paymentFilter !== 'all') list = list.filter((t: any) => (t.paymentType || 'especes') === paymentFilter)
    if (typeFilter !== 'all') list = list.filter((t: any) => transferType(t) === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t: any) => (t.fromName || '').toLowerCase().includes(q))
    }
    list = filterByDate(list, datePreset, dateFrom, dateTo, transferDate)
    return list
  }, [adminTransfers, cityFilter, paymentFilter, typeFilter, search, datePreset, dateFrom, dateTo])

  const filtered = baseFiltered.filter((t: any) => {
    if (statusFilter === 'all') return true
    return t.status === statusFilter
  })

  // Totaux (count + montant) par statut + total général
  const totals = useMemo(() => {
    const calc = (list: any[]) => ({
      count: list.length,
      amount: list.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0),
      portDu: list.reduce((sum: number, t: any) => sum + (transferType(t) === 'port_du' ? parseFloat(t.amount) || 0 : 0), 0),
      cod: list.reduce((sum: number, t: any) => sum + (transferType(t) === 'cod' ? parseFloat(t.amount) || 0 : 0), 0),
    })
    return {
      pending: calc(baseFiltered.filter((t: any) => t.status === 'pending')),
      confirmed: calc(baseFiltered.filter((t: any) => t.status === 'confirmed')),
      rejected: calc(baseFiltered.filter((t: any) => t.status === 'rejected')),
      total: calc(baseFiltered),
    }
  }, [baseFiltered])

  const handleConfirm = async () => {
    if (!confirmModal) return
    try {
      await confirmAdminTransfer(
        confirmModal.id,
        auth.currentUser?.displayName || 'Admin',
        auth.currentUser?.uid
      )
      setConfirmModal(null)
      alert('✅ Versement validé avec succès!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) {
      alert('❌ Veuillez indiquer un motif de rejet')
      return
    }
    try {
      await rejectAdminTransfer(
        rejectModal.id,
        auth.currentUser?.displayName || 'Admin',
        auth.currentUser?.uid,
        rejectReason
      )
      setRejectModal(null)
      setRejectReason('')
      alert('✅ Versement rejeté')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Fonctions CRUD
  // ══════════════════════════════════════════════════════════════════════════

  const openCreateModal = () => {
    setFormData({
      city: '',
      fromName: '',
      fromRole: 'agent',
      amount: '',
      paymentType: 'especes',
      type: 'port_du',
      status: 'pending',
      reference: '',
      note: '',
    })
    setCreateModal(true)
  }

  const openEditModal = (transfer: any) => {
    setFormData({
      city: transfer.city || '',
      fromName: transfer.fromName || '',
      fromRole: transfer.fromRole || 'agent',
      amount: String(transfer.amount || ''),
      paymentType: transfer.paymentType || 'especes',
      type: transferType(transfer),
      status: transfer.status || 'pending',
      reference: transfer.reference || '',
      note: transfer.note || '',
    })
    setEditModal(transfer)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.city || !formData.fromName || !formData.amount) {
      alert('❌ Veuillez remplir tous les champs obligatoires (Ville, De, Montant)')
      return
    }
    try {
      await createAdminTransferDirect(
        formData,
        auth.currentUser?.uid || '',
        auth.currentUser?.displayName || 'Admin'
      )
      setCreateModal(false)
      alert('✅ Versement créé avec succès!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModal || !formData.city || !formData.fromName || !formData.amount) {
      alert('❌ Veuillez remplir tous les champs obligatoires')
      return
    }
    try {
      await updateAdminTransfer(editModal.id, formData)
      setEditModal(null)
      alert('✅ Versement modifié avec succès!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmModal) return
    try {
      await deleteAdminTransfer(deleteConfirmModal.id)
      setDeleteConfirmModal(null)
      alert('✅ Versement supprimé avec succès!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  const handleDeleteAllVersements = async () => {
    setDeleteAllLoading(true)
    try {
      await deleteAllDriverVersements()
      setDeleteAllModal(false)
      alert('✅ Tous les versements ont été supprimés!')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setDeleteAllLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-orange-600">En attente</p>
              <p className="text-2xl font-black text-orange-700">{totals.pending.count}</p>
              <p className="text-xs font-bold text-orange-500">{fmt(totals.pending.amount)} DH</p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-orange-200 flex flex-wrap justify-between gap-1 text-[11px] font-semibold text-orange-600">
            <span>📮 Port Dû: {fmt(totals.pending.portDu)} DH</span>
            <span>💰 COD: {fmt(totals.pending.cod)} DH</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600">Validés</p>
              <p className="text-2xl font-black text-green-700">{totals.confirmed.count}</p>
              <p className="text-xs font-bold text-green-500">{fmt(totals.confirmed.amount)} DH</p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-green-200 flex flex-wrap justify-between gap-1 text-[11px] font-semibold text-green-600">
            <span>📮 Port Dû: {fmt(totals.confirmed.portDu)} DH</span>
            <span>💰 COD: {fmt(totals.confirmed.cod)} DH</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600">Rejetés</p>
              <p className="text-2xl font-black text-red-700">{totals.rejected.count}</p>
              <p className="text-xs font-bold text-red-500">{fmt(totals.rejected.amount)} DH</p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-red-200 flex flex-wrap justify-between gap-1 text-[11px] font-semibold text-red-600">
            <span>📮 Port Dû: {fmt(totals.rejected.portDu)} DH</span>
            <span>💰 COD: {fmt(totals.rejected.cod)} DH</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
              <Banknote className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-600">Total général</p>
              <p className="text-2xl font-black text-blue-700">{totals.total.count}</p>
              <p className="text-xs font-bold text-blue-500">{fmt(totals.total.amount)} DH</p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-blue-200 flex flex-wrap justify-between gap-1 text-[11px] font-semibold text-blue-600">
            <span>📮 Port Dû: {fmt(totals.total.portDu)} DH</span>
            <span>💰 COD: {fmt(totals.total.cod)} DH</span>
          </div>
        </div>
      </div>

      {/* Boutons actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setDeleteAllModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        >
          <Trash2 className="w-5 h-5" />
          Supprimer tous les versements
        </button>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        >
          <Plus className="w-5 h-5" />
          Nouveau versement
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Recherche par nom du chef */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un chef..."
              className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          {/* Ville */}
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-600 bg-white focus:border-blue-500 focus:outline-none"
          >
            <option value="all">📍 Toutes les villes</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Statut */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'confirmed', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {status === 'all' && 'Tous'}
              {status === 'pending' && '⏳ En attente'}
              {status === 'confirmed' && '✅ Validés'}
              {status === 'rejected' && '❌ Rejetés'}
            </button>
          ))}
        </div>

        {/* Type de versement (Port Dû / COD) */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              typeFilter === 'all'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            📦 Tous types
          </button>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                typeFilter === key
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {meta.emoji} {meta.label}
            </button>
          ))}
        </div>

        {/* Type de paiement */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPaymentFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              paymentFilter === 'all'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            💳 Tous paiements
          </button>
          {Object.entries(PAYMENT_TYPES).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setPaymentFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                paymentFilter === key
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {meta.emoji} {meta.label}
            </button>
          ))}
        </div>

        {/* Période - Champs de date uniquement (sans boutons de préréglage) */}
        <div className="flex gap-3 items-center">
          <label className="text-sm font-semibold text-gray-600">Période:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setDatePreset('custom')
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Du"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setDatePreset('custom')
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Au"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom('')
                setDateTo('')
                setDatePreset('all')
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">De</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Agence</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Mode paiement</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Statut</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Aucun versement trouvé
                  </td>
                </tr>
              ) : (
                filtered.map((transfer: any) => {
                  const paymentType = PAYMENT_TYPES[transfer.paymentType || 'especes']
                  const typeMeta = TYPE_META[transferType(transfer)]
                  const date = transfer.createdAt?.toDate?.() || new Date(transfer.createdAt || 0)
                  return (
                    <tr key={transfer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <br />
                        <span className="text-xs text-gray-400">
                          {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${typeMeta.cls}`}>
                          {typeMeta.emoji} {typeMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-800">{transfer.fromName}</p>
                        <p className="text-xs text-gray-400 capitalize">{transfer.fromRole?.replace('_', ' ')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                          📍 {transfer.city}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 bg-${paymentType.color}-50 text-${paymentType.color}-700 rounded-lg text-xs font-semibold`}
                        >
                          {paymentType.emoji} {paymentType.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-base font-black text-gray-800">{fmt(transfer.amount)} DH</span>
                      </td>
                      <td className="px-4 py-3">
                        {transfer.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        )}
                        {transfer.status === 'confirmed' && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                              <CheckCircle className="w-3 h-3" /> Validé
                            </span>
                            <p className="text-xs text-gray-400 mt-1">par {transfer.confirmedBy}</p>
                          </div>
                        )}
                        {transfer.status === 'rejected' && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">
                              <XCircle className="w-3 h-3" /> Rejeté
                            </span>
                            <p className="text-xs text-gray-400 mt-1">par {transfer.rejectedBy}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {transfer.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setConfirmModal(transfer)}
                                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold transition"
                                title="Valider"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setRejectModal(transfer)}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition"
                                title="Rejeter"
                              >
                                ✗
                              </button>
                            </>
                          )}
                          {/* Boutons CRUD - disponibles pour tous les versements */}
                          <button
                            onClick={() => openEditModal(transfer)}
                            className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmModal(transfer)}
                            className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {transfer.note && (
                            <button
                              onClick={() => alert(transfer.note)}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition"
                              title="Voir note"
                            >
                              <Eye className="w-4 h-4" />
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

      {/* Modal Confirmation */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Valider le versement</h3>
                <p className="text-sm text-gray-500">Confirmer cette action</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">De:</span>
                <span className="font-semibold text-gray-800">{confirmModal.fromName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Agence:</span>
                <span className="font-semibold text-gray-800">{confirmModal.city}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600">Type:</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${TYPE_META[transferType(confirmModal)].cls}`}>
                  {TYPE_META[transferType(confirmModal)].emoji} {TYPE_META[transferType(confirmModal)].label}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Montant:</span>
                <span className="font-bold text-lg text-green-600">{fmt(confirmModal.amount)} DH</span>
              </div>
              {confirmModal.note && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500">Note:</p>
                  <p className="text-sm text-gray-700">{confirmModal.note}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold transition"
              >
                ✓ Valider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rejet */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Rejeter le versement</h3>
                <p className="text-sm text-gray-500">Indiquez le motif</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Montant:</span>
                <span className="font-bold text-red-600">{fmt(rejectModal.amount)} DH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">De:</span>
                <span className="font-semibold text-gray-800">{rejectModal.fromName}</span>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motif du rejet..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none mb-4"
              rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason('')
                }}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition"
              >
                ✗ Rejeter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* Modal Création/Modification */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {(createModal || editModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">
                  {createModal ? '➕ Nouveau versement' : '✏️ Modifier le versement'}
                </h3>
                <button
                  onClick={() => {
                    setCreateModal(false)
                    setEditModal(null)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={createModal ? handleCreateSubmit : handleEditSubmit} className="p-4 sm:p-6 space-y-4">
              {/* Ville */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ville <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Sélectionnez une ville --</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* De (Nom) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  De (Nom) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fromName}
                  onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Nom du chef"
                  required
                />
              </div>

              {/* Rôle */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Rôle</label>
                <select
                  value={formData.fromRole}
                  onChange={(e) => setFormData({ ...formData, fromRole: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="agent">Agent</option>
                  <option value="chef_agence">Chef Agence</option>
                  <option value="caissier">Caissier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Ligne: Montant + Type paiement + Type versement */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Montant (DH) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mode paiement</label>
                  <select
                    value={formData.paymentType}
                    onChange={(e) => setFormData({ ...formData, paymentType: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="especes">💵 Espèces</option>
                    <option value="cheque">📝 Chèque</option>
                    <option value="virement">🏦 Virement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="port_du">📮 Port Dû</option>
                    <option value="cod">💰 COD</option>
                  </select>
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="pending">⏳ En attente</option>
                  <option value="confirmed">✅ Validé</option>
                  <option value="rejected">❌ Rejeté</option>
                </select>
              </div>

              {/* Référence */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Référence</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Numéro de référence (optionnel)"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Note</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Note additionnelle (optionnel)"
                  rows={3}
                />
              </div>

              {/* Boutons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModal(false)
                    setEditModal(null)
                  }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition"
                >
                  {createModal ? '➕ Créer' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* Modal Suppression */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Supprimer le versement</h3>
                <p className="text-sm text-gray-500">Cette action est irréversible</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">De:</span>
                <span className="font-semibold text-gray-800">{deleteConfirmModal.fromName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Agence:</span>
                <span className="font-semibold text-gray-800">{deleteConfirmModal.city}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Montant:</span>
                <span className="font-bold text-lg text-red-600">{fmt(deleteConfirmModal.amount)} DH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Statut:</span>
                <span className="font-semibold text-gray-800 capitalize">{deleteConfirmModal.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition"
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* Modal Suppression de tous les versements */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {deleteAllModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Supprimer tous les versements</h3>
                <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-700 font-semibold mb-2">
                ⚠️ Attention : Vous êtes sur le point de supprimer TOUS les versements livreurs
              </p>
              <p className="text-xs text-red-600">
                <strong>{totals.total.count} versement(s)</strong> seront supprimés définitivement.
                <br />
                <strong>Montant total : {fmt(totals.total.amount)} DH</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeleteAllModal(false)}
                disabled={deleteAllLoading}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAllVersements}
                disabled={deleteAllLoading}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {deleteAllLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirmer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
