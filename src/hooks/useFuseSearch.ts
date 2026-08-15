import { useMemo, useState, useEffect, useRef } from 'react'
import Fuse, { type FuseResult } from 'fuse.js'

// ⚡ Cache de recherche (30 secondes)
interface SearchCache<T> {
  query: string
  timestamp: number
  results: FuseResult<T>[]
}

const CACHE_TTL = 30000 // 30 secondes en millisecondes

/**
 * 🔍 Hook de recherche professionnel avec Fuse.js
 *
 * Optimisé pour la recherche de colis avec:
 * - Scoring intelligent (numérique vs textuel)
 * - Debounce automatique (300ms)
 * - Highlighting des résultats
 * - Performance optimale
 *
 * @example
 * const { search, setSearch, results, isSearching } = useFuseSearch({
 *   items: parcels,
 *   keys: ['trackingId', 'sender.name', 'receiver.name'],
 *   threshold: 0.3
 * })
 */

export interface FuseSearchConfig<T> {
  /** Items à rechercher */
  items: T[]

  /** Champs à rechercher avec poids optionnels */
  keys: Array<string | { name: string; weight: number }>

  /** Seuil de correspondance (0=exact, 1=tout) - défaut: 0.3 */
  threshold?: number

  /** Délai de debounce en ms - défaut: 300 */
  debounceMs?: number

  /** Activer la recherche étendue (opérateurs AND, OR) - défaut: true */
  useExtendedSearch?: boolean

  /** Limite de résultats - défaut: illimité */
  limit?: number

  /** Recherche initiale */
  initialSearch?: string
}

export interface FuseSearchResult<T> {
  /** Valeur de recherche actuelle */
  search: string

  /** Setter pour la recherche */
  setSearch: (value: string) => void

  /** Recherche après debounce */
  debouncedSearch: string

  /** Résultats filtrés et scorés */
  results: T[]

  /** Résultats avec metadata Fuse (score, indices, etc.) */
  detailedResults: FuseResult<T>[]

  /** Indique si une recherche est en cours (pendant debounce) */
  isSearching: boolean

  /** Nombre total de résultats */
  totalResults: number

  /** Réinitialiser la recherche */
  reset: () => void
}

export function useFuseSearch<T>({
  items,
  keys,
  threshold = 0.3,
  debounceMs = 300,
  useExtendedSearch = true,
  limit,
  initialSearch = '',
}: FuseSearchConfig<T>): FuseSearchResult<T> {
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [isSearching, setIsSearching] = useState(false)

  // ⚡ Cache de recherche pour éviter recalculs inutiles
  const searchCacheRef = useRef<SearchCache<T> | null>(null)

  // 🔄 Debounce automatique
  useEffect(() => {
    setIsSearching(true)
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setIsSearching(false)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [search, debounceMs])

  // 📊 Index Fuse.js optimisé
  const fuseIndex = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return null

    // Configuration optimale pour recherche de colis
    return new Fuse(items, {
      keys: keys.map(key =>
        typeof key === 'string'
          ? { name: key, weight: 1.0 }
          : key
      ),
      threshold,
      isCaseSensitive: false, // ⚡ INSENSIBLE À LA CASSE (majuscules/minuscules acceptées)
      ignoreLocation: true, // Cherche partout dans le champ
      useExtendedSearch,
      includeScore: true,
      includeMatches: true, // Pour highlighting
      minMatchCharLength: 2, // Au moins 2 caractères pour match
      distance: 100, // Distance max pour fuzzy match
      shouldSort: true, // Tri par pertinence automatique
    })
  }, [items, keys, threshold, useExtendedSearch])

  // 🎯 Recherche intelligente avec scoring + cache
  const { detailedResults, results } = useMemo(() => {
    // Pas de recherche = tous les résultats
    if (!debouncedSearch.trim()) {
      searchCacheRef.current = null // Reset cache
      return {
        detailedResults: [],
        results: items,
      }
    }

    // Pas d'index = retour direct
    if (!fuseIndex) {
      return {
        detailedResults: [],
        results: [],
      }
    }

    const query = debouncedSearch.trim()
    const now = Date.now()

    // ⚡ VÉRIFIER CACHE: si même query et < 30s → retourner cache
    if (
      searchCacheRef.current &&
      searchCacheRef.current.query === query &&
      now - searchCacheRef.current.timestamp < CACHE_TTL
    ) {
      console.log(`⚡ Cache hit pour "${query}" (${Math.round((now - searchCacheRef.current.timestamp) / 1000)}s)`)
      const cachedResults = searchCacheRef.current.results
      const limitedCached = limit ? cachedResults.slice(0, limit) : cachedResults
      return {
        detailedResults: limitedCached,
        results: limitedCached.map(r => r.item),
      }
    }

    // 🔍 RECHERCHE NORMALE (cache expiré ou nouvelle query)
    const isNumeric = /^\d+$/.test(query)
    let searchResults: FuseResult<T>[]

    if (isNumeric) {
      // 🔢 Recherche numérique: préfixe exact d'abord
      searchResults = fuseIndex.search(`^${query}`)
      if (searchResults.length === 0) {
        searchResults = fuseIndex.search(query)
      }
    } else {
      // 📝 Recherche textuelle standard
      searchResults = fuseIndex.search(query)
    }

    // 💾 SAUVEGARDER DANS CACHE
    searchCacheRef.current = {
      query,
      timestamp: now,
      results: searchResults,
    }

    console.log(`🔍 Nouvelle recherche "${query}": ${searchResults.length} résultats (cached pour 30s)`)

    // 📏 Limite optionnelle
    const limitedResults = limit
      ? searchResults.slice(0, limit)
      : searchResults

    return {
      detailedResults: limitedResults,
      results: limitedResults.map(r => r.item),
    }
  }, [debouncedSearch, fuseIndex, items, limit])

  // 🔄 Reset function
  const reset = () => {
    setSearch('')
    setDebouncedSearch('')
  }

  return {
    search,
    setSearch,
    debouncedSearch,
    results,
    detailedResults,
    isSearching,
    totalResults: results.length,
    reset,
  }
}

/**
 * 🎨 Helper pour extraire et formatter les matches Fuse
 * Utile pour highlighting dans l'UI
 */
export function getFuseMatches<T>(result: FuseResult<T>): Map<string, number[][]> {
  const matches = new Map<string, number[][]>()

  if (!result.matches) return matches

  result.matches.forEach((match: any) => {
    if (!match.indices || match.indices.length === 0) return
    matches.set(match.key || '', match.indices)
  })

  return matches
}

/**
 * 🎯 Helper pour highlight du texte basé sur les indices Fuse
 */
export function highlightText(text: string, indices: number[][]): string {
  if (!indices || indices.length === 0) return text

  let result = ''
  let lastIndex = 0

  indices.forEach(([start, end]) => {
    // Texte avant le match
    result += text.substring(lastIndex, start)
    // Texte matché (en gras)
    result += `<mark class="bg-yellow-200 font-bold">${text.substring(start, end + 1)}</mark>`
    lastIndex = end + 1
  })

  // Reste du texte
  result += text.substring(lastIndex)

  return result
}
