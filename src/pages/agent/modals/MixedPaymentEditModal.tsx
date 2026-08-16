import { X, Save } from 'lucide-react'
import { useState } from 'react'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../../firebase/config'

interface MixedPaymentEditModalProps {
  parcel: any
  onClose: () => void
  onSave: () => void
}

export default function MixedPaymentEditModal({
  parcel,
  onClose,
  onSave,
}: MixedPaymentEditModalProps) {
  const [form, setForm] = useState({
    codEspecesAmount: parcel.codEspecesAmount || 0,
    codChequeAmount: parcel.codChequeAmount || 0,
    codBankName: parcel.codBankName || '',
    codCheckNumber: parcel.codCheckNumber || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      await updateDoc(doc(db, 'parcels', parcel.id), {
        codEspecesAmount: parseFloat(form.codEspecesAmount as any) || 0,
        codChequeAmount: parseFloat(form.codChequeAmount as any) || 0,
        codBankName: form.codBankName,
        codCheckNumber: form.codCheckNumber,
        codAmount: (parseFloat(form.codEspecesAmount as any) || 0) + (parseFloat(form.codChequeAmount as any) || 0),
      })
      onSave()
      onClose()
    } catch (err: any) {
      console.error('Erreur sauvegarde paiement mixte:', err)
      setError(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const total = (parseFloat(form.codEspecesAmount as any) || 0) + (parseFloat(form.codChequeAmount as any) || 0)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <span className="text-lg">💵+📋</span>
              Paiement Mixte
            </h3>
            <p className="text-xs font-mono text-blue-600 mt-0.5">{parcel.trackingId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              ⚠️ {error}
            </div>
          )}

          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                💵 Montant espèces (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.codEspecesAmount}
                onChange={(e) => setForm({ ...form, codEspecesAmount: e.target.value as any })}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                📋 Montant chèque (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.codChequeAmount}
                onChange={(e) => setForm({ ...form, codChequeAmount: e.target.value as any })}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                🏦 Nom de la banque
              </label>
              <input
                type="text"
                value={form.codBankName}
                onChange={(e) => setForm({ ...form, codBankName: e.target.value })}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="Ex: Attijariwafa Bank"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                🔢 Numéro du chèque
              </label>
              <input
                type="text"
                value={form.codCheckNumber}
                onChange={(e) => setForm({ ...form, codCheckNumber: e.target.value })}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="Ex: 123456"
              />
            </div>

            <div className="pt-2 border-t border-blue-300">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total :</span>
                <span className="text-lg font-bold text-blue-600">{total.toFixed(2)} DH</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {form.codEspecesAmount || 0} DH espèces + {form.codChequeAmount || 0} DH chèque
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Sauvegarder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
