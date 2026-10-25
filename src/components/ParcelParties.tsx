/**
 * Expéditeur + destinataire d'une expédition, affichés de façon explicite
 * dans les cartes (vue « carte », listes mobiles…).
 *   📤 Expéditeur : <b>NOM</b>
 *   👤 Destinataire : <b>NOM</b> 🖐️ (si port en compte destinataire)
 */
interface ParcelPartiesProps {
  parcel: any
  /** Masquer la ligne expéditeur quand la carte l'affiche déjà clairement */
  showSender?: boolean
  /** Cartes sur fond sombre (pages livreur, arrivage…) */
  dark?: boolean
  className?: string
}

export function ParcelParties({ parcel, showSender = true, dark = false, className = '' }: ParcelPartiesProps) {
  const senderName = parcel?.sender?.name || parcel?.senderName || '—'
  const receiverName = parcel?.receiver?.name || parcel?.receiverName || '—'
  const labelCls = dark ? 'text-gray-300' : 'text-gray-600'
  const nameCls = dark ? 'text-white' : 'text-gray-900'
  return (
    <div className={`text-xs space-y-0.5 min-w-0 ${labelCls} ${className}`}>
      {showSender && (
        <div className="flex items-center gap-1 min-w-0">
          <span className="shrink-0">📤 Expéditeur :</span>
          <b className={`truncate ${nameCls}`}>{senderName}</b>
        </div>
      )}
      <div className="flex items-center gap-1 min-w-0">
        <span className="shrink-0">👤 Destinataire :</span>
        <b className={`truncate ${nameCls}`}>{receiverName}</b>
        {parcel?.portType === 'port_en_compte_destinataire' && (
          <span className="text-sm shrink-0" title="Port en compte destinataire">🖐️</span>
        )}
      </div>
    </div>
  )
}
