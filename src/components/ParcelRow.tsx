import { memo } from 'react'
import { Package } from 'lucide-react'

interface ParcelRowProps {
  parcel: any
  onClick?: () => void
  className?: string
}

/**
 * Composant optimisé pour afficher une ligne de colis
 * Utilise React.memo pour éviter les re-renders inutiles
 */
export const ParcelRow = memo(({ parcel, onClick, className = '' }: ParcelRowProps) => {
  const statusColors: Record<string, string> = {
    'En attente': 'bg-gray-100 text-gray-700',
    'En transit': 'bg-blue-100 text-blue-700',
    'En cours de livraison': 'bg-orange-100 text-orange-700',
    'Livré': 'bg-green-100 text-green-700',
    'Retour': 'bg-red-100 text-red-700',
    'Arrivé en agence': 'bg-purple-100 text-purple-700',
  }

  const statusColor = statusColors[parcel.status] || 'bg-gray-100 text-gray-700'

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition cursor-pointer ${className}`}
    >
      {/* Icon */}
      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white shrink-0">
        <Package className="w-5 h-5" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-800 text-sm truncate">{parcel.trackingId}</p>
        <p className="text-xs text-gray-500 truncate">
          {parcel.receiverName || parcel.receiver?.name || 'Destinataire'}
        </p>
      </div>

      {/* Status */}
      <div className={`px-2 py-1 rounded-lg text-xs font-semibold ${statusColor} shrink-0`}>
        {parcel.status}
      </div>

      {/* COD */}
      {parcel.codAmount > 0 && (
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-green-600">{parcel.codAmount} DH</p>
          <p className="text-xs text-gray-400">COD</p>
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Ne re-render que si le parcel ou les props changent
  return (
    prevProps.parcel.id === nextProps.parcel.id &&
    prevProps.parcel.status === nextProps.parcel.status &&
    prevProps.parcel.codStatus === nextProps.parcel.codStatus &&
    prevProps.onClick === nextProps.onClick
  )
})

ParcelRow.displayName = 'ParcelRow'
