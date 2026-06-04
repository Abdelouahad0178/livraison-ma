import { X, Package, MapPin, User, Phone, Calendar, Truck, Banknote } from 'lucide-react'
import { STATUS_COLORS } from '../firebase/constants'

interface ParcelScanModalProps {
  parcel: any
  onClose: () => void
}

export default function ParcelScanModal({ parcel, onClose }: ParcelScanModalProps) {
  if (!parcel) return null

  const sc = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
  const isReturn = parcel.wasReturned || parcel.status?.includes('Retour')

  const formatDate = (ts: any) => {
    if (!ts) return '—'
    const d = typeof ts === 'string' ? new Date(ts) : ts.toDate?.() || new Date(ts.seconds * 1000)
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`sticky top-0 ${sc.bg} ${sc.text} px-6 py-4 flex items-center justify-between border-b-4 ${sc.dot}`}>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-2">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs opacity-80">Expédition scannée</div>
              <div className="text-2xl font-bold">{parcel.trackingId}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status & Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${sc.bg} ${sc.text} border-2 ${sc.dot}`}>
              <span className={`w-2 h-2 rounded-full ${sc.dot} animate-pulse`} />
              {parcel.status}
            </span>
            {isReturn && (
              <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold bg-orange-100 text-orange-700 border-2 border-orange-300">
                🔄 RETOURNÉ
              </span>
            )}
            {parcel.codAmount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold bg-green-100 text-green-700 border-2 border-green-300">
                💵 RETOUR FOND {parcel.codAmount} DH
              </span>
            )}
          </div>

          {/* Expéditeur & Destinataire */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
              <div className="flex items-center gap-2 text-blue-600 font-semibold mb-2">
                <User className="w-4 h-4" />
                Expéditeur
              </div>
              <div className="space-y-1">
                <div className="font-bold text-gray-900">{parcel.sender?.name || '—'}</div>
                {parcel.sender?.tel && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Phone className="w-3 h-3" />
                    {parcel.sender.tel}
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin className="w-3 h-3" />
                  {parcel.originCity}
                </div>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
              <div className="flex items-center gap-2 text-purple-600 font-semibold mb-2">
                <User className="w-4 h-4" />
                Destinataire
              </div>
              <div className="space-y-1">
                <div className="font-bold text-gray-900">{parcel.receiver?.name || '—'}</div>
                {parcel.receiver?.tel && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Phone className="w-3 h-3" />
                    {parcel.receiver.tel}
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin className="w-3 h-3" />
                  {parcel.destinationCity}
                </div>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-500 text-xs mb-1">Poids</div>
                <div className="font-bold">{parcel.weight} kg</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">Nb. Colis</div>
                <div className="font-bold">{parcel.nbColis || 1}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">Prix</div>
                <div className="font-bold text-blue-600">{parcel.price} DH</div>
              </div>
            </div>
          </div>

          {/* Chauffeur / Livreur */}
          {(parcel.chauffeurName || parcel.deliveryDriverName) && (
            <div className="bg-indigo-50 rounded-xl p-4 border-2 border-indigo-200">
              <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-2">
                <Truck className="w-4 h-4" />
                {parcel.chauffeurName ? 'Chauffeur transport' : 'Livreur'}
              </div>
              <div className="font-bold text-gray-900">
                {parcel.chauffeurName || parcel.deliveryDriverName}
              </div>
            </div>
          )}

          {/* Raison retour */}
          {parcel.returnReason && (
            <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
              <div className="text-orange-700 font-semibold mb-1">📋 Raison du retour</div>
              <div className="text-gray-900">{parcel.returnReason}</div>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            Créé le {formatDate(parcel.createdAt)}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Scannez une autre expédition ou appuyez sur <kbd className="px-2 py-1 bg-white rounded border">ESC</kbd>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
