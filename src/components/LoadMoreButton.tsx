import { ChevronDown, Loader2 } from 'lucide-react'

interface LoadMoreButtonProps {
  onLoadMore: () => void
  loading?: boolean
  hasMore?: boolean
  loadedCount?: number
  totalCount?: number
  className?: string
}

/**
 * Bouton "Charger plus" optimisé avec indicateurs de progression
 */
export function LoadMoreButton({
  onLoadMore,
  loading = false,
  hasMore = true,
  loadedCount,
  totalCount,
  className = ''
}: LoadMoreButtonProps) {

  if (!hasMore) {
    return (
      <div className={`text-center py-4 ${className}`}>
        <p className="text-sm text-gray-400">
          ✓ Tous les éléments chargés
          {loadedCount !== undefined && ` (${loadedCount})`}
        </p>
      </div>
    )
  }

  return (
    <div className={`text-center py-4 ${className}`}>
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement...
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Charger plus
          </>
        )}
      </button>

      {/* Progression */}
      {loadedCount !== undefined && totalCount !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <span>{loadedCount} / {totalCount}</span>
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (loadedCount / totalCount) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Hook pour gérer la pagination avec Load More
 */
import { useState, useCallback } from 'react'

export function useLoadMore<T>(
  items: T[],
  initialPageSize: number = 50,
  incrementSize: number = 50
) {
  const [displayCount, setDisplayCount] = useState(initialPageSize)

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + incrementSize)
  }, [incrementSize])

  const reset = useCallback(() => {
    setDisplayCount(initialPageSize)
  }, [initialPageSize])

  const visibleItems = items.slice(0, displayCount)
  const hasMore = displayCount < items.length

  return {
    visibleItems,
    loadMore,
    reset,
    hasMore,
    loadedCount: visibleItems.length,
    totalCount: items.length
  }
}
