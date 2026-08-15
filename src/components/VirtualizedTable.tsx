import { FixedSizeList as List } from 'react-window'
import { useRef, useEffect, useState } from 'react'

interface VirtualizedTableProps {
  data: any[]
  rowHeight: number
  renderRow: (item: any, index: number) => React.ReactNode
  headerComponent: React.ReactNode
  emptyComponent?: React.ReactNode
  className?: string
  maxHeight?: number
}

/**
 * 🚀 Composant de tableau virtualisé pour des performances optimales
 *
 * N'affiche que les lignes visibles à l'écran + quelques-unes au-dessus/dessous
 * pour un scroll fluide. Peut gérer 10 000+ lignes sans ralentissement.
 */
export default function VirtualizedTable({
  data,
  rowHeight,
  renderRow,
  headerComponent,
  emptyComponent,
  className = '',
  maxHeight = 600,
}: VirtualizedTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(maxHeight)

  // Calculer la hauteur optimale du container
  useEffect(() => {
    if (!containerRef.current) return

    const updateHeight = () => {
      const windowHeight = window.innerHeight
      const containerTop = containerRef.current?.getBoundingClientRect().top || 0

      // Hauteur disponible = hauteur fenêtre - position du container - marge de sécurité
      const availableHeight = windowHeight - containerTop - 100

      // Utiliser le minimum entre la hauteur max et la hauteur disponible
      const optimalHeight = Math.min(maxHeight, Math.max(400, availableHeight))

      setContainerHeight(optimalHeight)
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)

    return () => window.removeEventListener('resize', updateHeight)
  }, [maxHeight])

  // Si pas de données, afficher le composant vide
  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-215">
            {headerComponent}
            <tbody>
              <tr>
                <td colSpan={20}>
                  {emptyComponent || (
                    <div className="px-4 py-12 text-center text-gray-400">
                      Aucune donnée
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Row renderer pour react-window
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = data[index]

    return (
      <div style={style}>
        <table className="w-full text-sm min-w-215">
          <tbody className="divide-y divide-gray-50">
            {renderRow(item, index)}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      <div className="overflow-x-auto">
        {/* Header fixe */}
        <div className="sticky top-0 z-10 bg-white">
          <table className="w-full text-sm min-w-215">
            {headerComponent}
          </table>
        </div>

        {/* Lignes virtualisées */}
        <List
          height={containerHeight}
          itemCount={data.length}
          itemSize={rowHeight}
          width="100%"
          overscanCount={5} // Nombre de lignes à pré-rendre au-dessus/dessous
        >
          {Row}
        </List>
      </div>

      {/* Indicateur du nombre total d'éléments */}
      <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <span>
          Affichage de <strong>{data.length}</strong> expédition{data.length > 1 ? 's' : ''}
        </span>
        <span className="text-green-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
          </svg>
          Mode haute performance activé
        </span>
      </div>
    </div>
  )
}
