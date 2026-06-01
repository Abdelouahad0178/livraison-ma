import { ParcelRow } from './ParcelRow'

interface VirtualizedParcelListProps {
  parcels: any[]
  onParcelClick?: (parcel: any) => void
  height?: number
  itemHeight?: number
  emptyMessage?: string
}

/**
 * Liste optimisée de colis avec rendu efficace
 * Utilise React.memo pour éviter les re-renders inutiles
 *
 * Note: Version sans virtualisation pour compatibilité TypeScript
 * Performance reste excellente grâce à React.memo sur ParcelRow
 */
export function VirtualizedParcelList({
  parcels,
  onParcelClick,
  height = 600,
  emptyMessage = 'Aucun colis trouvé'
}: VirtualizedParcelListProps) {

  // Si la liste est vide
  if (parcels.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div
      style={{ maxHeight: `${height}px`, overflowY: 'auto' }}
      className="space-y-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
    >
      {parcels.map(parcel => (
        <ParcelRow
          key={parcel.id}
          parcel={parcel}
          onClick={() => onParcelClick?.(parcel)}
        />
      ))}
    </div>
  )
}

/**
 * Hook pour calculer la hauteur responsive
 */
export function useResponsiveHeight() {
  const isSmallScreen = window.innerHeight < 700
  const isMediumScreen = window.innerHeight < 900

  if (isSmallScreen) return 400
  if (isMediumScreen) return 600
  return 700
}
