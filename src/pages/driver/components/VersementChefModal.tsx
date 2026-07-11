import { useState } from 'react'
import { Banknote, X, AlertTriangle, Search } from 'lucide-react'
import { createDriverVersement } from '../../../firebase/firestore'
import { fmt } from '../../../utils/formatNumber'

const VERSEMENT_TYPES = [
  { value: 'port_du', label: 'Port Dû', emoji: '📮' },
  { value: 'cod',     label: 'COD',     emoji: '💰' },
]

const PAYMENT_TYPES = [
  { value: 'especes',  label: 'Espèces',  emoji: '💵' },
  { value: 'cheque',   label: 'Chèque',   emoji: '📋' },
  { value: 'virement', label: 'Virement', emoji: '🏦' },
]

const STATUS_BADGES: Record<string, { label: string, cls: string }> = {
  pending:   { label: '⏳ En attente', cls: 'bg-amber-600/20 text-amber-300 border-amber-600/40' },
  confirmed: { label: '✅ Validé',     cls: 'bg-green-600/20 text-green-300 border-green-600/40' },
  rejected:  { label: '✗ Rejeté',      cls: 'bg-red-600/20 text-red-300 border-red-600/40' },
}

const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Modal Livreur : versement au Chef d'agence (Port Dû ou COD).
 * - Sélection du type et du mode de paiement
 * - Affiche le solde disponible (collecté − versements en attente/validés)
 * - Crée un versement 'pending' → déduction immédiate du solde
 */
export default function VersementChefModal({
  isOpen,
  onClose,
  uid,
  profile,
  balances,       // { port_du: number, cod: number }
  myVersements,   // historique des versements du livreur
}: any) {
  const [type, setType] = useState('port_du')
  const [paymentType, setPaymentType] = useState('especes')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // Filtres de l'historique
  const [histStatus, setHistStatus] = useState('all') // all | pending | confirmed | rejected
  const [histType, setHistType] = useState('all')     // all | port_du | cod
  const [histSearch, setHistSearch] = useState('')

  if (!isOpen) return null

  const availableSolde = parseFloat(balances?.[type] || 0) || 0
  const selectedType = VERSEMENT_TYPES.find(t => t.value === type)

  // Totaux de l'historique (count + montant par statut)
  const allVersements = myVersements || []
  const histTotals = (() => {
    const calc = (status: string) => {
      const list = allVersements.filter((v: any) => v.status === status)
      return { count: list.length, amount: list.reduce((s: number, v: any) => s + (parseFloat(v.amount) || 0), 0) }
    }
    return { pending: calc('pending'), confirmed: calc('confirmed'), rejected: calc('rejected') }
  })()

  // Historique filtré
  const filteredHistory = allVersements
    .filter((v: any) => {
      if (histStatus !== 'all' && v.status !== histStatus) return false
      if (histType !== 'all' && v.type !== histType) return false
      if (histSearch.trim() && !(v.note || '').toLowerCase().includes(histSearch.toLowerCase())) return false
      return true
    })
    .slice(0, 20)

  // Vérifier s'il y a des versements en attente qui bloquent le solde
  const pendingVersements = (myVersements || []).filter((v: any) => v.type === type && v.status === 'pending')
  const totalPending = pendingVersements.reduce((s: number, v: any) => s + (parseFloat(v.amount) || 0), 0)
  const hasBlockingPending = availableSolde === 0 && totalPending > 0 && balances?._debug

  // Montants collectés (brut avant déduction des versements)
  const portDuCollected = balances?._debug?.portDuHeld || 0
  const codCollected = balances?._debug?.codHeld || 0

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    setSuccess('')
    if (!amt || amt <= 0) {
      setError('Montant invalide')
      return
    }
    if (amt > availableSolde) {
      setError(`Solde ${selectedType?.label} insuffisant (disponible : ${fmt(availableSolde)} DH)`)
      return
    }

    setLoading(true)
    setError('')
    try {
      await createDriverVersement({
        driverId:    uid,
        driverName:  profile?.name || 'Livreur',
        city:        profile?.city || '',
        type,
        paymentType,
        amount:      amt,
        note:        note.trim(),
      })
      setSuccess(`Versement de ${fmt(amt)} DH soumis. En attente de validation par le chef d'agence.`)
      setAmount('')
      setNote('')
    } catch (err: any) {
      console.error('createDriverVersement error:', err)
      setError(err.message || 'Erreur lors du versement')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-orange-600/20 border border-orange-600/40 rounded-xl flex items-center justify-center">
                <Banknote className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Versement au Chef</h3>
                <p className="text-xs text-gray-400">Agence {profile?.city || '—'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-xl transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Type de versement */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 mb-2 uppercase tracking-wider">
              Type de versement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VERSEMENT_TYPES.map(t => {
                const collected = t.value === 'port_du' ? portDuCollected : codCollected
                const available = parseFloat(balances?.[t.value] || 0) || 0
                return (
                  <button
                    key={t.value}
                    onClick={() => { setType(t.value); setError(''); setSuccess('') }}
                    className={`p-3 rounded-xl border-2 transition text-center ${
                      type === t.value
                        ? 'border-orange-500 bg-orange-600/15'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-1">{t.emoji}</div>
                    <div className={`text-xs font-semibold ${type === t.value ? 'text-orange-300' : 'text-gray-300'}`}>
                      {t.label}
                    </div>
                    <div className={`text-[11px] font-bold mt-1 ${type === t.value ? 'text-orange-400' : 'text-gray-500'}`}>
                      {fmt(collected)} DH
                    </div>
                    {collected !== available && (
                      <div className={`text-[9px] mt-0.5 ${type === t.value ? 'text-orange-500' : 'text-gray-600'}`}>
                        Dispo: {fmt(available)} DH
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mode de paiement */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 mb-2 uppercase tracking-wider">
              Mode de paiement
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setPaymentType(t.value)}
                  className={`p-2.5 rounded-xl border-2 transition text-center ${
                    paymentType === t.value
                      ? 'border-blue-500 bg-blue-600/15'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-xl mb-0.5">{t.emoji}</div>
                  <div className={`text-[11px] font-semibold ${paymentType === t.value ? 'text-blue-300' : 'text-gray-300'}`}>
                    {t.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Solde disponible */}
          <div className="mb-4 p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-blue-300">
                Solde {selectedType?.label} disponible :
              </span>
              <span className="text-lg font-black text-blue-200">{fmt(availableSolde)} DH</span>
            </div>

            {/* Message explicatif si bloqué par versements en attente */}
            {hasBlockingPending && (
              <div className="mt-2 text-[11px] text-orange-300 bg-orange-900/20 p-2 rounded border border-orange-800/40">
                <strong>ℹ️ Solde bloqué :</strong> Vous avez {fmt(totalPending)} DH en attente de validation.
                <br />
                Collecté : {fmt(balances._debug.portDuHeld)} DH - Versé en attente : {fmt(totalPending)} DH = 0 DH disponible.
                <br />
                <span className="text-orange-400">Le chef d'agence doit valider ou rejeter vos versements en attente.</span>
              </div>
            )}
          </div>

          {/* Montant */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Montant à verser (DH)
              </label>
              {availableSolde > 0 && (
                <button
                  onClick={() => setAmount(String(availableSolde))}
                  className="text-[11px] font-bold text-orange-400 hover:text-orange-300 transition"
                >
                  Tout verser ({fmt(availableSolde)} DH)
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); setSuccess('') }}
              placeholder="0.00"
              className="w-full bg-gray-800 border-2 border-gray-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:border-orange-500 focus:outline-none placeholder-gray-600"
            />
          </div>

          {/* Note */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 mb-1 uppercase tracking-wider">
              Note (optionnel)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ajouter une note..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none placeholder-gray-600"
            />
          </div>

          {/* Warning */}
          <div className="mb-4 p-3 bg-orange-950/40 border border-orange-800/60 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-200">
                <strong>Important :</strong> le montant sera déduit immédiatement de votre solde.
                Le versement restera <strong>en attente</strong> jusqu'à validation par le chef d'agence.
                En cas de rejet, le montant vous sera recrédité.
              </div>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-sm text-red-300">
              ❌ {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-950/50 border border-green-800/60 rounded-xl text-sm text-green-300">
              ✅ {success}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="py-3 rounded-xl border border-gray-700 text-gray-300 font-semibold hover:bg-gray-800 transition disabled:opacity-50"
            >
              Fermer
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

          {/* Historique */}
          {allVersements.length > 0 && (
            <div className="mt-5 border-t border-gray-800 pt-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Mes versements
              </p>

              {/* Totaux */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gradient-to-br from-amber-600/25 to-amber-900/25 border border-amber-600/40 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-semibold text-amber-300 uppercase">⏳ Attente</p>
                  <p className="text-sm font-black text-amber-200">{fmt(histTotals.pending.amount)} DH</p>
                  <p className="text-[9px] text-amber-400">{histTotals.pending.count} vers.</p>
                </div>
                <div className="bg-gradient-to-br from-green-600/25 to-green-900/25 border border-green-600/40 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-semibold text-green-300 uppercase">✅ Validés</p>
                  <p className="text-sm font-black text-green-200">{fmt(histTotals.confirmed.amount)} DH</p>
                  <p className="text-[9px] text-green-400">{histTotals.confirmed.count} vers.</p>
                </div>
                <div className="bg-gradient-to-br from-red-600/25 to-red-900/25 border border-red-600/40 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-semibold text-red-300 uppercase">✗ Rejetés</p>
                  <p className="text-sm font-black text-red-200">{fmt(histTotals.rejected.amount)} DH</p>
                  <p className="text-[9px] text-red-400">{histTotals.rejected.count} vers.</p>
                </div>
              </div>

              {/* Filtres statut */}
              <div className="flex gap-1.5 flex-wrap mb-2">
                {[
                  { key: 'all',       label: 'Tous' },
                  { key: 'pending',   label: '⏳ Attente' },
                  { key: 'confirmed', label: '✅ Validés' },
                  { key: 'rejected',  label: '✗ Rejetés' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setHistStatus(key)}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border transition ${
                      histStatus === key
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtres type */}
              <div className="flex gap-1.5 flex-wrap mb-2">
                {[
                  { key: 'all',     label: '📦 Tous types' },
                  { key: 'port_du', label: '📮 Port Dû' },
                  { key: 'cod',     label: '💰 COD' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setHistType(key)}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border transition ${
                      histType === key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Recherche par note */}
              <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 mb-3">
                <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <input
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                  placeholder="Rechercher par note..."
                  className="flex-1 outline-none text-xs text-white placeholder-gray-500 bg-transparent"
                />
                {histSearch && (
                  <button onClick={() => setHistSearch('')}>
                    <X className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                )}
              </div>

              {filteredHistory.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Aucun versement trouvé</p>
              ) : (
              <div className="space-y-2">
                {filteredHistory.map((v: any) => {
                  const badge = STATUS_BADGES[v.status] || STATUS_BADGES.pending
                  const vType = VERSEMENT_TYPES.find(t => t.value === v.type)
                  const vPay  = PAYMENT_TYPES.find(t => t.value === v.paymentType)
                  return (
                    <div key={v.id} className="bg-gray-800/70 border border-gray-700/70 rounded-xl px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">
                            {vType?.emoji} {fmt(v.amount)} DH
                            <span className="text-[10px] text-gray-400 font-medium ml-1.5">
                              {vType?.label} · {vPay?.label}
                            </span>
                          </p>
                          <p className="text-[10px] text-gray-500">{fmtDate(v.createdAt)}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      {v.status === 'rejected' && v.rejectionReason && (
                        <p className="text-[11px] text-red-300 mt-1">Motif : {v.rejectionReason}</p>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
