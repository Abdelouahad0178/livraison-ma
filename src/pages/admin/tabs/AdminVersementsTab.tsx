import { CheckCircle, XCircle, Clock, Banknote, AlertTriangle, Eye } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'
import { useState } from 'react'

const PAYMENT_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  especes: { label: 'Espèces', emoji: '💵', color: 'green' },
  cheque: { label: 'Chèque', emoji: '📝', color: 'blue' },
  virement: { label: 'Virement', emoji: '🏦', color: 'purple' },
}

export default function AdminVersementsTab({
  adminTransfers,
  confirmAdminTransfer,
  rejectAdminTransfer,
  auth,
}: any) {
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [rejectModal, setRejectModal] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all, pending, confirmed, rejected

  const filtered = adminTransfers.filter((t: any) => {
    if (statusFilter === 'pending') return t.status === 'pending'
    if (statusFilter === 'confirmed') return t.status === 'confirmed'
    if (statusFilter === 'rejected') return t.status === 'rejected'
    return true
  })

  const pendingCount = adminTransfers.filter((t: any) => t.status === 'pending').length
  const pendingAmount = adminTransfers
    .filter((t: any) => t.status === 'pending')
    .reduce((sum: number, t: any) => sum + (t.amount || 0), 0)

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

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-orange-600">En attente</p>
              <p className="text-2xl font-black text-orange-700">{pendingCount}</p>
              <p className="text-xs text-orange-500">{fmt(pendingAmount)} DH</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600">Validés</p>
              <p className="text-2xl font-black text-green-700">
                {adminTransfers.filter((t: any) => t.status === 'confirmed').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600">Rejetés</p>
              <p className="text-2xl font-black text-red-700">
                {adminTransfers.filter((t: any) => t.status === 'rejected').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">De</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Agence</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Statut</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Aucun versement trouvé
                  </td>
                </tr>
              ) : (
                filtered.map((transfer: any) => {
                  const paymentType = PAYMENT_TYPES[transfer.paymentType || 'especes']
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
                        <div className="flex items-center justify-center gap-2">
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
                          {transfer.note && (
                            <button
                              onClick={() => alert(transfer.note)}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold transition"
                              title="Voir note"
                            >
                              <Eye className="w-3 h-3" />
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
    </div>
  )
}
