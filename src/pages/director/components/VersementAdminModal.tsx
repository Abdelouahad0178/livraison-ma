import { useState } from 'react'
import { Banknote, X, AlertTriangle } from 'lucide-react'
import { createAdminTransferFromChefAgence } from '../../../firebase/firestore'
import { fmt } from '../../../utils/formatNumber'

const VERSEMENT_TYPES = [
  { value: 'port_du', label: 'Port Dû', emoji: '📮' },
  { value: 'cod',     label: 'COD',     emoji: '💰' },
]

const PAYMENT_TYPES = [
  { value: 'especes', label: 'Espèces', emoji: '💵', color: 'green' },
  { value: 'cheque', label: 'Chèque', emoji: '📝', color: 'blue' },
  { value: 'virement', label: 'Virement', emoji: '🏦', color: 'purple' },
]

export default function VersementAdminModal({
  isOpen,
  onClose,
  user,
  agencyCash,
  typeBalances, // optionnel : { port_du: number, cod: number } — soldes disponibles par type
}: any) {
  const [type, setType] = useState('port_du')
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState('especes')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      setError('Montant invalide')
      return
    }

    // Vérifier le solde disponible par type de versement (Port Dû / COD)
    if (typeBalances) {
      const availableForType = parseFloat(typeBalances[type]) || 0
      if (amt > availableForType) {
        const meta = VERSEMENT_TYPES.find(t => t.value === type)
        setError(`Solde ${meta?.label} insuffisant (disponible : ${fmt(availableForType)} DH)`)
        return
      }
    }

    // Vérifier le solde disponible selon le type
    const currentSolde = agencyCash?.[`solde${paymentType === 'especes' ? 'Especes' : paymentType === 'cheque' ? 'Cheques' : 'Virement'}`] || 0
    if (amt > currentSolde) {
      setError(`Solde ${PAYMENT_TYPES.find(p => p.value === paymentType)?.label} insuffisant`)
      return
    }

    setLoading(true)
    setError('')

    try {
      await createAdminTransferFromChefAgence({
        city: user.city,
        amount: amt,
        paymentType,
        type,
        note: note.trim(),
        fromId: user.uid,
        fromName: user.displayName || user.name || 'Chef Agence',
      })

      alert(`✅ Versement de ${fmt(amt)} DH soumis avec succès!\nEn attente de validation par l'Admin.`)
      setAmount('')
      setNote('')
      setPaymentType('especes')
      setType('port_du')
      onClose()
    } catch (err: any) {
      console.error('Versement error:', err)
      setError(err.message || 'Erreur lors du versement')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const selectedType = PAYMENT_TYPES.find(p => p.value === paymentType)
  const availableSolde = agencyCash?.[`solde${paymentType === 'especes' ? 'Especes' : paymentType === 'cheque' ? 'Cheques' : 'Virement'}`] || 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Banknote className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Versement à l'Admin</h3>
                <p className="text-sm text-gray-500">Agence {user.city}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Type de versement (Port Dû / COD) */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
              Type de versement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VERSEMENT_TYPES.map((t) => {
                const available = typeBalances ? (parseFloat(typeBalances[t.value]) || 0) : null
                return (
                  <button
                    key={t.value}
                    onClick={() => { setType(t.value); setError('') }}
                    className={`p-3 rounded-xl border-2 transition text-center ${
                      type === t.value
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">{t.emoji}</div>
                    <div className={`text-xs font-semibold ${
                      type === t.value ? 'text-orange-700' : 'text-gray-600'
                    }`}>
                      {t.label}
                    </div>
                    {available !== null && (
                      <div className={`text-[11px] font-bold mt-1 ${
                        type === t.value ? 'text-orange-600' : 'text-gray-400'
                      }`}>
                        Dispo: {fmt(available)} DH
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type de paiement */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
              Type de paiement
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setPaymentType(type.value)}
                  className={`p-3 rounded-xl border-2 transition ${
                    paymentType === type.value
                      ? `border-${type.color}-500 bg-${type.color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{type.emoji}</div>
                  <div className={`text-xs font-semibold ${
                    paymentType === type.value ? `text-${type.color}-700` : 'text-gray-600'
                  }`}>
                    {type.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Solde disponible */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-blue-600">
                Solde {selectedType?.label} disponible:
              </span>
              <span className="text-lg font-black text-blue-700">
                {fmt(availableSolde)} DH
              </span>
            </div>
          </div>

          {/* Montant */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
              Montant à verser (DH)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Note */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
              Note (optionnel)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajouter une note..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Warning */}
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-700">
                <strong>Important:</strong> Le montant sera déduit de votre caisse immédiatement.
                Le versement sera en attente de validation par l'Admin.
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              ❌ {error}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Banknote className="w-4 h-4" />
                  Verser
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
