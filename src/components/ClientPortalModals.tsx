import { useState } from 'react'
import { X, Save, Trash2, Send, Star, AlertTriangle } from 'lucide-react'
import {
  updatePortalParcel, cancelPortalParcel, updateModificationRequest,
  replyToModificationRequest, confirmDeliveryReceipt, reportDeliveryIssue
} from '../firebase/clientPortalActions'
import { CITIES, MOD_TYPES } from '../firebase/constants'

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-50 bg-white transition"
const selectCls = inputCls

// ────────────────────────────────────────────────────────────────
// Modal: Modifier un colis
// ────────────────────────────────────────────────────────────────

interface EditParcelModalProps {
  parcel: any
  onClose: () => void
  onSuccess: () => void
}

export function EditParcelModal({ parcel, onClose, onSuccess }: EditParcelModalProps) {
  const [form, setForm] = useState({
    receiverName: parcel.receiver?.name || parcel.receiverName || '',
    receiverTel: parcel.receiver?.tel || parcel.receiverTel || '',
    receiverAddress: parcel.receiver?.address || parcel.receiverAddress || '',
    receiverCity: parcel.receiver?.city || parcel.receiverCity || '',
    weight: parcel.weight || '',
    nbColis: parcel.nbColis || '1',
    natureOfGoods: parcel.natureOfGoods || '',
    codAmount: parcel.codAmount || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      await updatePortalParcel(parcel.id, {
        receiverName: form.receiverName,
        receiverTel: form.receiverTel,
        receiverAddress: form.receiverAddress,
        receiverCity: form.receiverCity,
        weight: parseFloat(form.weight) || 0,
        nbColis: parseInt(form.nbColis) || 1,
        natureOfGoods: form.natureOfGoods,
        codAmount: parseFloat(form.codAmount) || 0,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la modification')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Modifier le colis</h3>
            <p className="text-xs text-gray-500 mt-1">Tracking: {parcel.trackingId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Destinataire</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                required
                value={form.receiverName}
                onChange={e => setForm(f => ({ ...f, receiverName: e.target.value }))}
                placeholder="Nom *"
                className={inputCls}
              />
              <input
                required
                value={form.receiverTel}
                onChange={e => setForm(f => ({ ...f, receiverTel: e.target.value }))}
                placeholder="Téléphone *"
                className={inputCls}
              />
            </div>
            <select
              required
              value={form.receiverCity}
              onChange={e => setForm(f => ({ ...f, receiverCity: e.target.value }))}
              className={selectCls + " mt-3"}
            >
              <option value="">Ville destination *</option>
              {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
            <textarea
              required
              value={form.receiverAddress}
              onChange={e => setForm(f => ({ ...f, receiverAddress: e.target.value }))}
              placeholder="Adresse complète *"
              rows={2}
              className={inputCls + " resize-none mt-3"}
            />
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Colis</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                required
                type="number"
                min="0"
                step="0.1"
                value={form.weight}
                onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                placeholder="Poids (kg) *"
                className={inputCls}
              />
              <input
                required
                type="number"
                min="1"
                value={form.nbColis}
                onChange={e => setForm(f => ({ ...f, nbColis: e.target.value }))}
                placeholder="Nb colis *"
                className={inputCls}
              />
              <input
                value={form.natureOfGoods}
                onChange={e => setForm(f => ({ ...f, natureOfGoods: e.target.value }))}
                placeholder="Nature marchandise"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 font-bold hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Modal: Annuler un colis
// ────────────────────────────────────────────────────────────────

interface CancelParcelModalProps {
  parcel: any
  onClose: () => void
  onSuccess: () => void
}

export function CancelParcelModal({ parcel, onClose, onSuccess }: CancelParcelModalProps) {
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleCancel = async () => {
    setError('')
    setDeleting(true)

    try {
      await cancelPortalParcel(parcel.id, reason)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'annulation')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-gray-900">Annuler le colis</h3>
            <p className="text-xs text-gray-600 mt-0.5">Tracking: {parcel.trackingId}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-600">
            Êtes-vous sûr de vouloir annuler ce colis ? Cette action est irréversible.
          </p>

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Raison de l'annulation (optionnel)"
            rows={3}
            className={inputCls + " resize-none"}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 font-bold hover:bg-gray-50 transition"
            >
              Non, garder
            </button>
            <button
              onClick={handleCancel}
              disabled={deleting}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Annulation...' : 'Oui, annuler'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Modal: Modifier une demande
// ────────────────────────────────────────────────────────────────

interface EditModRequestModalProps {
  request: any
  onClose: () => void
  onSuccess: () => void
}

export function EditModRequestModal({ request, onClose, onSuccess }: EditModRequestModalProps) {
  const [form, setForm] = useState({
    modificationType: request.modificationType || '',
    newValue: request.newValue || '',
    note: request.note || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      await updateModificationRequest(request.id, form)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la modification')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Modifier la demande</h3>
            <p className="text-xs text-gray-600 mt-0.5">Tracking: {request.trackingId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <select
            required
            value={form.modificationType}
            onChange={e => setForm(f => ({ ...f, modificationType: e.target.value }))}
            className={selectCls}
          >
            <option value="">Type de modification *</option>
            {MOD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>

          <input
            required
            value={form.newValue}
            onChange={e => setForm(f => ({ ...f, newValue: e.target.value }))}
            placeholder="Nouvelle valeur *"
            className={inputCls}
          />

          <textarea
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Note ou justification (optionnel)"
            rows={2}
            className={inputCls + " resize-none"}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 font-bold hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Modal: Confirmer réception (Destinataire)
// ────────────────────────────────────────────────────────────────

interface ConfirmDeliveryModalProps {
  parcel: any
  onClose: () => void
  onSuccess: () => void
}

export function ConfirmDeliveryModal({ parcel, onClose, onSuccess }: ConfirmDeliveryModalProps) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setError('')
    setConfirming(true)

    try {
      await confirmDeliveryReceipt(parcel.id, {
        rating,
        comment,
        hasIssue: false
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la confirmation')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-green-50 border-b border-green-100 px-6 py-4">
          <h3 className="font-black text-gray-900">Confirmer la réception</h3>
          <p className="text-xs text-gray-600 mt-1">Tracking: {parcel.trackingId}</p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Évaluation</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition"
                >
                  <Star
                    className={`w-8 h-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={3}
            className={inputCls + " resize-none"}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 font-bold hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 transition"
            >
              <Send className="w-4 h-4" />
              {confirming ? 'Confirmation...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Modal: Signaler un problème (Destinataire)
// ────────────────────────────────────────────────────────────────

interface ReportIssueModalProps {
  parcel: any
  onClose: () => void
  onSuccess: () => void
}

export function ReportIssueModal({ parcel, onClose, onSuccess }: ReportIssueModalProps) {
  const [issueType, setIssueType] = useState('not_received')
  const [description, setDescription] = useState('')
  const [reporting, setReporting] = useState(false)
  const [error, setError] = useState('')

  const issueTypes = [
    { key: 'not_received', label: 'Colis non reçu' },
    { key: 'damaged', label: 'Colis endommagé' },
    { key: 'wrong_item', label: 'Mauvais article' },
    { key: 'partial', label: 'Livraison partielle' },
    { key: 'other', label: 'Autre problème' },
  ]

  const handleReport = async () => {
    if (!description.trim()) {
      setError('Veuillez décrire le problème')
      return
    }

    setError('')
    setReporting(true)

    try {
      await reportDeliveryIssue(parcel.id, {
        type: issueType as any,
        description,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors du signalement')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-gray-900">Signaler un problème</h3>
            <p className="text-xs text-gray-600 mt-0.5">Tracking: {parcel.trackingId}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <select
            value={issueType}
            onChange={e => setIssueType(e.target.value)}
            className={selectCls}
          >
            {issueTypes.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Décrivez le problème *"
            rows={4}
            className={inputCls + " resize-none"}
            required
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 font-bold hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleReport}
              disabled={reporting}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2 transition"
            >
              <Send className="w-4 h-4" />
              {reporting ? 'Envoi...' : 'Signaler'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
