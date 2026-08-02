import { useState, useEffect } from 'react'
import { Wallet, Plus, Trash2, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react'
import {
  declareVersement,
  deleteVersement,
  subscribeToMyVersements,
  VERSEMENT_TYPE_LABELS,
  PAYMENT_MODE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  type Versement,
  type VersementType,
  type PaymentMode,
} from '../../../firebase/versements'

export default function VersementsTab({ profile }: any) {
  const [versements, setVersements] = useState<Versement[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Formulaire
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<VersementType>('ports_payes')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('especes')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'validated' | 'rejected'>('all')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'week' | 'month'>('all')

  // Charger les versements
  useEffect(() => {
    if (!profile?.id) return
    const unsubscribe = subscribeToMyVersements(profile.id, setVersements)
    return () => unsubscribe()
  }, [profile?.id])

  // Filtrer les versements
  const filteredVersements = versements.filter(v => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false

    if (datePreset !== 'all') {
      const now = new Date()
      const vDate = v.createdAt.toDate()

      if (datePreset === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (vDate < today) return false
      } else if (datePreset === 'week') {
        const weekAgo = new Date()
        weekAgo.setDate(now.getDate() - 7)
        if (vDate < weekAgo) return false
      } else if (datePreset === 'month') {
        const monthAgo = new Date()
        monthAgo.setMonth(now.getMonth() - 1)
        if (vDate < monthAgo) return false
      }
    }

    return true
  })

  // Calculer les totaux
  const totalPending = versements
    .filter(v => v.status === 'pending')
    .reduce((sum, v) => sum + v.amount, 0)
  const totalValidated = versements
    .filter(v => v.status === 'validated')
    .reduce((sum, v) => sum + v.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Montant invalide')
      }

      await declareVersement({
        amount: amountNum,
        type,
        paymentMode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        city: profile.city,
        agentName: profile.name,
        agentRole: profile.role,
      })

      // Réinitialiser le formulaire
      setAmount('')
      setType('ports_payes')
      setPaymentMode('especes')
      setReference('')
      setNotes('')
      setShowModal(false)
      alert('✅ Versement déclaré avec succès ! En attente de validation par l\'administration.')
    } catch (err: any) {
      console.error('Erreur déclaration versement:', err)
      setError(err.message || 'Erreur lors de la déclaration')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (versementId: string) => {
    if (!confirm('Supprimer cette déclaration de versement ?')) return

    try {
      await deleteVersement(versementId)
      alert('✅ Versement supprimé')
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  // Types disponibles selon le rôle
  const availableTypes: VersementType[] =
    profile?.role === 'agent_comptes'
      ? ['compte_expediteur', 'compte_destinataire']
      : ['ports_payes', 'ports_dus']

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="w-7 h-7" />
              Mes Versements à l'Administration
            </h2>
            <p className="text-sm text-purple-100 mt-1">
              {profile?.city} • Déclarez vos versements et suivez leur validation
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-xl font-bold hover:bg-purple-50 transition shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Déclarer un versement
          </button>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-purple-200">En attente de validation</p>
            <p className="text-2xl font-black mt-1">{totalPending.toLocaleString('fr-MA')} DH</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-purple-200">Total validé</p>
            <p className="text-2xl font-black mt-1 text-green-300">{totalValidated.toLocaleString('fr-MA')} DH</p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Statut:</span>
            {(['all', 'pending', 'validated', 'rejected'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === s
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'Tous' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Période:</span>
            {(['all', 'today', 'week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  datePreset === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === 'all' ? 'Tous' : p === 'today' ? 'Aujourd\'hui' : p === 'week' ? '7 jours' : '30 jours'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des versements */}
      <div className="space-y-3">
        {filteredVersements.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-12 text-center">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Aucun versement déclaré</p>
          </div>
        ) : (
          filteredVersements.map(v => (
            <div
              key={v.id}
              className="bg-white rounded-xl p-4 shadow-md border-l-4 border-purple-500 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-2xl font-black text-purple-600">
                      {v.amount.toLocaleString('fr-MA')} DH
                    </span>
                    <span className="text-sm font-semibold text-gray-700">
                      {VERSEMENT_TYPE_LABELS[v.type]}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[v.status]}`}>
                      {STATUS_LABELS[v.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {v.createdAt.toDate().toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{PAYMENT_MODE_LABELS[v.paymentMode]}</span>
                    {v.reference && <span className="font-mono">Réf: {v.reference}</span>}
                  </div>

                  {v.notes && (
                    <p className="text-sm text-gray-600 mt-2 italic">💬 {v.notes}</p>
                  )}

                  {v.validatedAt && (
                    <p className="text-xs text-gray-500 mt-2">
                      {v.status === 'validated' ? '✅ Validé' : '❌ Rejeté'} le{' '}
                      {v.validatedAt.toDate().toLocaleDateString('fr-FR')}
                      {v.validatedByName && ` par ${v.validatedByName}`}
                    </p>
                  )}
                </div>

                {v.status === 'pending' && (
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal déclaration */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Déclarer un versement
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Type de versement
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as VersementType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  {availableTypes.map(t => (
                    <option key={t} value={t}>
                      {VERSEMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Montant (DH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Mode de paiement
                </label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  {Object.entries(PAYMENT_MODE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMode !== 'especes' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Référence (N° chèque ou virement)
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Optionnel"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Notes (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                  placeholder="Détails supplémentaires..."
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Déclaration...' : 'Déclarer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
