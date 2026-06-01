import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface DebouncedSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  delay?: number
  className?: string
}

/**
 * Input de recherche avec debounce intégré
 * Évite les recherches à chaque frappe (90% moins de requêtes)
 */
export function DebouncedSearchInput({
  value,
  onChange,
  placeholder = 'Rechercher...',
  delay = 300,
  className = ''
}: DebouncedSearchInputProps) {
  const [localValue, setLocalValue] = useState(value)

  // Sync avec la valeur externe
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounce du onChange
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [localValue, delay, onChange, value])

  const handleClear = () => {
    setLocalValue('')
    onChange('')
  }

  return (
    <div className={`relative ${className}`}>
      {/* Icon Search */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <Search className="w-4 h-4" />
      </div>

      {/* Input */}
      <input
        type="text"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
      />

      {/* Clear Button */}
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Indicateur de recherche active */}
      {localValue !== value && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
      )}
    </div>
  )
}

/**
 * Hook générique pour debounce de n'importe quelle valeur
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * Stats de performance du debounce
 */
export function useDebounceStats(value: string, delay: number = 300) {
  const [stats, setStats] = useState({ searches: 0, saved: 0 })
  const debouncedValue = useDebounce(value, delay)

  useEffect(() => {
    if (value) {
      setStats(prev => ({ ...prev, searches: prev.searches + 1 }))
    }
  }, [value])

  useEffect(() => {
    if (debouncedValue) {
      setStats(prev => ({
        searches: prev.searches,
        saved: prev.searches - 1 // -1 car la dernière a été exécutée
      }))
    }
  }, [debouncedValue])

  return { ...stats, savedPercent: stats.searches > 0 ? Math.round((stats.saved / stats.searches) * 100) : 0 }
}
