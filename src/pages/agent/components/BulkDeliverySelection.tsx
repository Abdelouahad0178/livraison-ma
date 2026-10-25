import { useMemo } from 'react'
import { deliverySelectionGroups } from '../../../utils/parcelBulkSelection'

/** Chaque bouton remplace la sélection : les nouvelles saisies ne cochent jamais les colis reçus. */
export default function BulkDeliverySelection({ parcels, selectedIds, onChange, disabled = false }: {
  parcels: Record<string, any>[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const groups = useMemo(() => deliverySelectionGroups(parcels), [parcels])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  return <>{groups.filter(group => group.parcels.length > 0).map(group => {
    const allSelected = group.parcels.every(p => selected.has(p.id))
    return (
      <button key={group.key} type="button" disabled={disabled}
        onClick={() => onChange(allSelected ? [] : group.parcels.map(p => p.id))}
        className={`px-3 py-2 rounded-xl text-xs font-bold border transition disabled:opacity-40 ${allSelected
          ? 'bg-white text-green-700 border-green-300'
          : 'bg-green-600 text-white border-green-600 hover:bg-green-700'}`}
      >
        {allSelected ? 'Désélectionner' : 'Sélectionner'} {group.label} ({group.parcels.length})
      </button>
    )
  })}</>
}
