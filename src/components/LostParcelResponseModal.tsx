import { useState } from 'react'
import { X, AlertTriangle, CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import { respondToLostParcel, LostParcelDeclaration } from '../firebase/lostParcels'

interface LostParcelResponseModalProps {
  lostParcel: LostParcelDeclaration
  agencyCity: string
  onClose: () => void
  onSuccess: () => void
  respondedBy: {
    uid: string
    name: string
  }
}

export default function LostParcelResponseModal({
  lostParcel,
  agencyCity,
  onClose,
  onSuccess,
  respondedBy
}: LostParcelResponseModalProps) {
  const [found, setFound] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!comment.trim() && !found) {
      setError('Veuillez ajouter un commentaire expliquant la situation')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await respondToLostParcel(lostParcel.id, {
        agencyCity,
        found,
        comment: comment.trim(),
        respondedBy
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi de la réponse')
      setSubmitting(false)
    }
  }

  const timeRemaining = () => {
    const declared = lostParcel.declaredAt.toMillis()
    const fortyEightHours = 48 * 60 * 60 * 1000
    const deadline = declared + fortyEightHours
    const now = Date.now()
    const remaining = deadline - now

    if (remaining <= 0) return '⚠️ DÉLAI DÉPASSÉ'

    const hours = Math.floor(remaining / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}j ${hours % 24}h restantes`
    return `${hours}h restantes`
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-bold">Répondre : Colis perdu</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Parcel Info */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-mono font-bold text-red-700 mb-2">
            {lostParcel.trackingId}
          </p>
          <div className="text-xs text-gray-600 space-y-1">
            <p><strong>Déclaré par:</strong> {lostParcel.declaredBy.name} ({lostParcel.declaredBy.city})</p>
            <p><strong>Dernière localisation:</strong> {lostParcel.lastKnownLocation}</p>
            <p><strong>Détails:</strong> {lostParcel.details}</p>
          </div>
        </div>

        {/* Timer */}
        <div className={`p-3 rounded-xl mb-4 ${
          timeRemaining().includes('DÉPASSÉ')
            ? 'bg-red-100 border border-red-300'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <p className="text-sm font-semibold text-center">
            ⏰ {timeRemaining()}
          </p>
        </div>

        {/* Question */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Avez-vous trouvé ce colis dans votre agence ?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setFound(true)}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition ${
                found
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <CheckCircle className={`w-5 h-5 ${found ? 'text-green-600' : 'text-gray-400'}`} />
              <span className={`font-semibold ${found ? 'text-green-700' : 'text-gray-600'}`}>
                Oui, trouvé
              </span>
            </button>
            <button
              onClick={() => setFound(false)}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition ${
                !found
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-red-300'
              }`}
            >
              <XCircle className={`w-5 h-5 ${!found ? 'text-red-600' : 'text-gray-400'}`} />
              <span className={`font-semibold ${!found ? 'text-red-700' : 'text-gray-600'}`}>
                Non, pas trouvé
              </span>
            </button>
          </div>
        </div>

        {/* Comment */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <MessageSquare className="w-4 h-4" />
            Commentaire / Explications
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={found
              ? "Où se trouve le colis maintenant ? Quand peut-il être récupéré ?"
              : "Avez-vous effectué une recherche ? Des détails sur la situation ?"}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
            rows={4}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 px-6 py-3 text-white rounded-xl font-semibold transition disabled:opacity-50 ${
              found
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting ? 'Envoi...' : found ? '✅ Confirmer trouvé' : '📝 Envoyer réponse'}
          </button>
        </div>
      </div>
    </div>
  )
}
