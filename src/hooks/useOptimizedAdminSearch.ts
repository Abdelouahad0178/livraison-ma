import { useState, useEffect, useCallback, useRef } from 'react'
import { searchParcels } from '../firebase/parcels'

interface SearchOptions {
  dateFrom?: Date
  dateTo?: Date
  agencyCity?: string
  includeArchived?: boolean
}

export function useOptimizedAdminSearch(
  searchTerm: string,
  options: SearchOptions = {},
  debounceMs = 300
) {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  // Cache pour éviter les recherches répétées
  const cacheRef = useRef<Map<string, any[]>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const search = useCallback(async (term: string) => {
    // Vide = reset
    if (!term || term.trim().length === 0) {
      setResults([])
      setLoading(false)
      setError('')
      return
    }

    const trimmedTerm = term.trim()

    // Vérifier le cache
    const cacheKey = `${trimmedTerm}-${JSON.stringify(options)}`
    if (cacheRef.current.has(cacheKey)) {
      console.log('✅ Résultat depuis cache:', trimmedTerm)
      setResults(cacheRef.current.get(cacheKey)!)
      setLoading(false)
      return
    }

    // Annuler la recherche précédente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setLoading(true)
    setError('')

    try {
      const startTime = performance.now()
      const searchResults = await searchParcels(trimmedTerm, {
        ...options,
        limit: 500, // Limiter pour performance
      })

      const duration = performance.now() - startTime
      console.log(`🔍 Recherche "${trimmedTerm}": ${searchResults.length} résultats en ${duration.toFixed(0)}ms`)

      // Mettre en cache
      cacheRef.current.set(cacheKey, searchResults)

      // Limiter la taille du cache à 50 entrées
      if (cacheRef.current.size > 50) {
        const firstKey = cacheRef.current.keys().next().value
        cacheRef.current.delete(firstKey)
      }

      setResults(searchResults)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Erreur recherche:', err)
        setError(err.message || 'Erreur de recherche')
      }
    } finally {
      setLoading(false)
    }
  }, [options])

  // Debouncing
  useEffect(() => {
    // Clear timeout précédent
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Si vide, effacer immédiatement
    if (!searchTerm || searchTerm.trim().length === 0) {
      setResults([])
      setLoading(false)
      return
    }

    // Montrer l'indicateur de chargement immédiatement
    setLoading(true)

    // Attendre le debounce avant de chercher
    timeoutRef.current = setTimeout(() => {
      search(searchTerm)
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [searchTerm, search, debounceMs])

  const clearCache = useCallback(() => {
    cacheRef.current.clear()
    console.log('🗑️ Cache de recherche vidé')
  }, [])

  return {
    results,
    loading,
    error,
    clearCache,
    cacheSize: cacheRef.current.size,
  }
}
