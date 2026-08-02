import { useState } from 'react'
import { Wallet, Plus, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react'
import { createAdminTransferFromChefAgence, subscribeMyAdminTransfers } from '../../../firebase/caisse'
import { useEffect } from 'react'

const TYPE_LABELS: Record<string, string> = {
  ports_payes: '💵 Ports Payés (gare)',
  port_du: '📮 Ports Dûs (livreur)',
  compte_expediteur: '💼 Compte Expéditeur',
  compte_destinataire: '🖐️ Compte Destinataire',
  cod: '💰 COD',
}

const PAYMENT_LABELS: Record<string, string> = {
  especes: '💵 Espèces',
  cheque: '📝 Chèque',
  virement: '🏦 Virement',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ En attente',
  confirmed: '✅ Validé',
  rejected: '❌ Rejeté',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  confirmed: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
}

export default function AgentVersementsTab({ profile }: any) {
  const [versements, setVersements] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Formulaire
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('ports_payes')
  const [paymentType, setPaymentType] = useState('especes')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all')

  // Charger les versements
  useEffect(() => {
    if (!profile?.id) return
    const unsubscribe = subscribeMyAdminTransfers(profile.id, setVersements)
    return () => unsubscribe()
  }, [profile?.id])

  // Filtrer les versements
  const filteredVersements = versements.filter(v => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false
    return true
  })

  // Calculer les totaux
  const totalPending = versements
    .filter(v => v.status === 'pending')
    .reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0)
  const totalConfirmed = versements
    .filter(v => v.status === 'confirmed')
    .reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Montant invalide')
      }

      await createAdminTransferFromChefAgence({
        fromId: profile.id,
        fromName: profile.name,
        city: profile.city,
        amount: amountNum,
        type,
        paymentType,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      })

      // Réinitialiser le formulaire
      setAmount('')
      setType('ports_payes')
      setPaymentType('especes')
      setReference('')
      setNote('')
      setShowModal(false)
      alert('✅ Versement déclaré avec succès ! En attente de validation par l\'administration.')
    } catch (err: any) {
      console.error('Erreur déclaration versement:', err)
      setError(err.message || 'Erreur lors de la déclaration')
    } finally {
      setLoading(false)
    }
  }

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
            <p className="text-xs text-purple-200 mt-1">
              {versements.filter(v => v.status === 'pending').length} versement(s)
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-purple-200">Total validé</p>
            <p className="text-2xl font-black mt-1 text-green-300">{totalConfirmed.toLocaleString('fr-MA')} DH</p>
            <p className="text-xs text-purple-200 mt-1">
              {versements.filter(v => v.status === 'confirmed').length} versement(s)
            </p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Statut:</span>
            {(['all', 'pending', 'confirmed', 'rejected'] as const).map(s => (
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
                      {parseFloat(v.amount || 0).toLocaleString('fr-MA')} DH
                    </span>
                    <span className="text-sm font-semibold text-gray-700">
                      {TYPE_LABELS[v.type] || v.type}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[v.status]}`}>
                      {STATUS_LABELS[v.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {v.createdAt?.toDate?.().toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{PAYMENT_LABELS[v.paymentType || 'especes']}</span>
                    {v.reference && <span className="font-mono">Réf: {v.reference}</span>}
                  </div>

                  {v.note && (
                    <p className="text-sm text-gray-600 mt-2 italic">💬 {v.note}</p>
                  )}

                  {v.confirmedAt && (
                    <p className="text-xs text-gray-500 mt-2">
                      ✅ Validé le{' '}
                      {v.confirmedAt?.toDate?.().toLocaleDateString('fr-FR')}
                      {v.confirmedBy && ` par ${v.confirmedBy}`}
                    </p>
                  )}

                  {v.rejectedAt && (
                    <div className="mt-2">
                      <p className="text-xs text-red-600">
                        ❌ Rejeté le {v.rejectedAt?.toDate?.().toLocaleDateString('fr-FR')}
                        {v.rejectedBy && ` par ${v.rejectedBy}`}
                      </p>
                      {v.rejectionReason && (
                        <p className="text-xs text-red-500 mt-1 italic">Motif : {v.rejectionReason}</p>
                      )}
                    </div>
                  )}
                </div>
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
              Déclarer un versement à l'Administration
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Type de versement
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="ports_payes">💵 Ports Payés (gare)</option>
                  <option value="port_du">📮 Ports Dûs (livreur)</option>
                  <option value="compte_expediteur">💼 Compte Expéditeur</option>
                  <option value="compte_destinataire">🖐️ Compte Destinataire</option>
                  <option value="cod">💰 COD</option>
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
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="especes">💵 Espèces</option>
                  <option value="cheque">📝 Chèque</option>
                  <option value="virement">🏦 Virement</option>
                </select>
              </div>

              {paymentType !== 'especes' && (
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
                  value={note}
                  onChange={e => setNote(e.target.value)}
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
