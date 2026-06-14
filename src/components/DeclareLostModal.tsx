import { useState } from 'react'
import { X, AlertTriangle, MapPin, MessageSquare } from 'lucide-react'
import { declareLostParcel } from '../firebase/lostParcels'
import { CITIES } from '../firebase/constants'

interface DeclareLostModalProps {
  parcel: any
  onClose: () => void
  onSuccess: () => void
  declaredBy: {
    uid: string
    name: string
    role: string
    city: string
  }
}

export default function DeclareLostModal({
  parcel,
  onClose,
  onSuccess,
  declaredBy
}: DeclareLostModalProps) {
  const [lastKnownLocation, setLastKnownLocation] = useState(declaredBy.city)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!lastKnownLocation.trim()) {
      setError('Veuillez indiquer la dernière localisation connue')
      return
    }

    if (!details.trim()) {
      setError('Veuillez ajouter des détails sur la perte')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await declareLostParcel(
        parcel.id,
        parcel.trackingId,
        declaredBy,
        lastKnownLocation,
        details,
        CITIES // Toutes les agences
      )

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la déclaration')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-bold">Déclarer un colis perdu</h3>
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
          <p className="text-sm font-mono font-bold text-red-700">
            {parcel.trackingId}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            {parcel.receiver?.name}
          </p>
          <p className="text-xs text-gray-500">
            {parcel.originCity} → {parcel.destinationCity}
          </p>
        </div>

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-amber-800">
            ⚠️ Cette action va alerter <strong>toutes les agences</strong> qui devront répondre sous <strong>48h</strong>.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Last Known Location */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <MapPin className="w-4 h-4" />
              Dernière localisation connue
            </label>
            <select
              value={lastKnownLocation}
              onChange={(e) => setLastKnownLocation(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none bg-white text-gray-900 font-medium"
            >
              <option value="" className="text-gray-500">Sélectionner...</option>
              {CITIES.map(city => (
                <option key={city} value={city} className="text-gray-900">{city}</option>
              ))}
            </select>
          </div>

          {/* Details */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <MessageSquare className="w-4 h-4" />
              Détails / Commentaires
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Expliquez les circonstances de la perte, dernière position connue, tentatives de recherche déjà effectuées..."
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none resize-none bg-white text-gray-900 placeholder:text-gray-500"
              rows={4}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
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
            className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition disabled:opacity-50"
          >
            {submitting ? 'Déclaration...' : '🚨 Déclarer perdu'}
          </button>
        </div>
      </div>
    </div>
  )
}
