import { useState } from 'react'
import { Check, Package, Banknote, RotateCcw, Truck, AlertCircle } from 'lucide-react'
import { updateParcelStatus, markParcelAsReturned } from '../firebase/parcels'
import { collectCodAtDestination } from '../firebase/cod'

interface QuickStatusTogglesProps {
  parcel: any
  profile: any
  onSuccess?: (updates: { status?: string; codStatus?: string }) => void
  compact?: boolean
}

export default function QuickStatusToggles({ parcel, profile, onSuccess, compact = false }: QuickStatusTogglesProps) {
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')

  // ⚡ Utiliser directement les valeurs du parcel (qui contient déjà les mises à jour fusionnées)
  const localStatus = parcel.status
  const localCodStatus = parcel.codStatus

  // Vérifier si l'utilisateur peut modifier ce statut
  const canUpdateStatus = () => {
    // Chef d'agence et Agent Pro peuvent tout modifier
    if (profile?.role === 'chef_agence' || profile?.role === 'agentpro') return true
    // Agent de destination peut modifier le statut de livraison
    if (parcel.destinationCity === profile?.city) return true
    return false
  }

  const handleToggleDelivery = async () => {
    if (!canUpdateStatus()) {
      setError('Vous n\'avez pas les permissions pour modifier ce statut')
      return
    }

    const newStatus = localStatus === 'Livré' ? 'En cours de livraison' : 'Livré'
    setUpdating('delivery')
    setError('')

    try {
      // ⚡ Notifier le parent pour mise à jour immédiate
      onSuccess?.({ status: newStatus })

      // Préparer les mises à jour
      const updates: any = {
        updatedBy: profile?.displayName || profile?.email || 'Agent',
        updatedAt: new Date().toISOString()
      }

      // Si on passe à "Livré", ajouter la date de livraison
      if (newStatus === 'Livré') {
        updates.deliveredAt = new Date().toISOString()
      }
      // Si on passe à "En cours de livraison", supprimer la date de livraison
      else if (newStatus === 'En cours de livraison') {
        const { deleteField } = await import('firebase/firestore')
        updates.deliveredAt = deleteField()
      }

      await updateParcelStatus(parcel.id, newStatus, updates)
    } catch (err: any) {
      console.error('Erreur changement statut livraison:', err)
      setError(err.message || 'Erreur lors du changement de statut')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleCodCollection = async () => {
    if (!canUpdateStatus()) {
      setError('Vous n\'avez pas les permissions pour collecter le COD')
      return
    }

    if (!parcel.codAmount || parcel.codAmount <= 0) {
      setError('Ce colis n\'a pas de montant à collecter')
      return
    }

    const isCollected = localCodStatus === 'collected'
    setUpdating('cod')
    setError('')

    try {
      // ⚡ Notifier le parent pour mise à jour immédiate
      const newCodStatus = isCollected ? 'pending' : 'collected'
      onSuccess?.({ codStatus: newCodStatus })

      if (isCollected) {
        // Remettre à "pending"
        await updateParcelStatus(parcel.id, parcel.status, {
          codStatus: 'pending',
          codCollectedAt: null,
          codCollectedBy: null,
          updatedBy: profile?.displayName || profile?.email || 'Agent',
          updatedAt: new Date().toISOString()
        })
      } else {
        // Marquer comme collecté
        await collectCodAtDestination(
          parcel.id,
          parcel.serviceType || 'especes',
          profile?.displayName || profile?.email || 'Agent'
        )
      }
    } catch (err: any) {
      console.error('Erreur toggle COD:', err)
      setError(err.message || 'Erreur lors du changement de statut COD')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleTransit = async () => {
    if (!canUpdateStatus()) {
      setError('Vous n\'avez pas les permissions pour modifier ce statut')
      return
    }

    const newStatus = localStatus === 'Arrivé en agence' ? 'En transit' : 'Arrivé en agence'
    setUpdating('transit')
    setError('')

    try {
      // ⚡ Notifier le parent pour mise à jour immédiate
      onSuccess?.({ status: newStatus })

      await updateParcelStatus(parcel.id, newStatus, {
        updatedBy: profile?.displayName || profile?.email || 'Agent',
        updatedAt: new Date().toISOString()
      })
    } catch (err: any) {
      console.error('Erreur changement statut transit:', err)
      setError(err.message || 'Erreur lors du changement de statut')
    } finally {
      setUpdating(null)
    }
  }

  const handleMarkAsReturn = async () => {
    if (!canUpdateStatus()) {
      setError('Vous n\'avez pas les permissions pour retourner ce colis')
      return
    }

    if (parcel.wasReturned) {
      setError('Ce colis est déjà retourné')
      return
    }

    setUpdating('return')
    setError('')

    try {
      onSuccess?.({ status: 'Retourné' })

      await markParcelAsReturned(parcel, {
        note: 'Retour initié par actions rapides',
        updatedBy: profile?.displayName || profile?.email || 'Agent',
        updatedAt: new Date().toISOString()
      })
    } catch (err: any) {
      console.error('Erreur marquage retour:', err)
      setError(err.message || 'Erreur lors du marquage en retour')
    } finally {
      setUpdating(null)
    }
  }

  // Vérifier si le colis est dans le circuit retour
  const isInReturnCircuit = parcel.wasReturned ||
    ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé'].includes(parcel.status)

  // Ne pas afficher les toggles si l'utilisateur n'a pas les permissions
  if (!canUpdateStatus()) {
    if (compact) return null
    return (
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          Actions rapides disponibles uniquement pour le chef d'agence
        </p>
      </div>
    )
  }

  const containerClass = compact
    ? ''
    : 'mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl'

  const buttonPadding = compact ? 'px-2 py-1' : 'px-3 py-2'
  const buttonText = compact ? 'text-[10px]' : 'text-xs'
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const gapSize = compact ? 'gap-1' : 'gap-2'

  return (
    <div className={containerClass}>
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-blue-900">⚡ Actions rapides</span>
        </div>
      )}

      {error && (
        <div className={`mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 ${compact ? 'text-[10px]' : ''}`}>
          {error}
        </div>
      )}

      <div className={`flex flex-wrap ${gapSize}`}>
        {/* Toggle Livraison */}
        {!isInReturnCircuit && (
          <button
            onClick={handleToggleDelivery}
            disabled={updating !== null}
            className={`
              relative flex items-center gap-1 ${buttonPadding} rounded-lg ${buttonText} font-semibold
              transition-all duration-200 shadow-sm
              ${parcel.status === 'Livré'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }
              ${updating === 'delivery' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {updating === 'delivery' ? (
              <>
                <div className={`${iconSize} border-2 border-current border-t-transparent rounded-full animate-spin`} />
                <span>Mise à jour...</span>
              </>
            ) : localStatus === 'Livré' ? (
              <>
                <Check className={iconSize} />
                <span>Livré ✓</span>
              </>
            ) : (
              <>
                <Package className={iconSize} />
                <span>Marquer livré</span>
              </>
            )}
          </button>
        )}

        {/* Toggle COD */}
        {parcel.codAmount > 0 && !isInReturnCircuit && (
          <button
            onClick={handleToggleCodCollection}
            disabled={updating !== null}
            className={`
              relative flex items-center gap-1 ${buttonPadding} rounded-lg ${buttonText} font-semibold
              transition-all duration-200 shadow-sm
              ${parcel.codStatus === 'collected'
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }
              ${updating === 'cod' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {updating === 'cod' ? (
              <>
                <div className={`${iconSize} border-2 border-current border-t-transparent rounded-full animate-spin`} />
                <span>Mise à jour...</span>
              </>
            ) : localCodStatus === 'collected' ? (
              <>
                <Check className={iconSize} />
                <span>COD collecté ✓</span>
              </>
            ) : (
              <>
                <Banknote className={iconSize} />
                <span>Collecter {parcel.codAmount} DH</span>
              </>
            )}
          </button>
        )}

        {/* Toggle Transit / Arrivé */}
        {!isInReturnCircuit && ['En transit', 'Arrivé en agence'].includes(parcel.status) && (
          <button
            onClick={handleToggleTransit}
            disabled={updating !== null}
            className={`
              relative flex items-center gap-1 ${buttonPadding} rounded-lg ${buttonText} font-semibold
              transition-all duration-200 shadow-sm
              ${parcel.status === 'Arrivé en agence'
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }
              ${updating === 'transit' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {updating === 'transit' ? (
              <>
                <div className={`${iconSize} border-2 border-current border-t-transparent rounded-full animate-spin`} />
                <span>Mise à jour...</span>
              </>
            ) : localStatus === 'Arrivé en agence' ? (
              <>
                <Check className={iconSize} />
                <span>Arrivé ✓</span>
              </>
            ) : (
              <>
                <Truck className={iconSize} />
                <span>Marquer arrivé</span>
              </>
            )}
          </button>
        )}

        {/* Bouton Retour */}
        {!isInReturnCircuit && parcel.status !== 'Livré' && (
          <button
            onClick={handleMarkAsReturn}
            disabled={updating !== null}
            className={`
              relative flex items-center gap-1 ${buttonPadding} rounded-lg ${buttonText} font-semibold
              transition-all duration-200 shadow-sm
              bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-300
              ${updating === 'return' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {updating === 'return' ? (
              <>
                <div className={`${iconSize} border-2 border-current border-t-transparent rounded-full animate-spin`} />
                <span>Retour en cours...</span>
              </>
            ) : (
              <>
                <RotateCcw className={iconSize} />
                <span>Retourner</span>
              </>
            )}
          </button>
        )}

        {/* Indicateur de colis retourné */}
        {isInReturnCircuit && (
          <div className={`flex items-center gap-1 ${buttonPadding} rounded-lg ${buttonText} font-semibold bg-amber-50 text-amber-700 border border-amber-300`}>
            <RotateCcw className={iconSize} />
            <span>Colis dans le circuit retour</span>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 text-xs text-blue-700 opacity-75">
          💡 Changements appliqués en temps réel et synchronisés automatiquement
        </div>
      )}
    </div>
  )
}
