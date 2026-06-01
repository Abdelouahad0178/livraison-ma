import { useMemo } from 'react'

interface ParcelFilters {
  search?: string
  status?: string
  city?: string
  dateFrom?: string
  dateTo?: string
}

/**
 * Hook optimisé pour filtrer et rechercher des colis
 * Utilise useMemo pour éviter les recalculs inutiles
 */
export function useOptimizedParcels(parcels: any[], filters: ParcelFilters = {}) {
  const { search, status, city, dateFrom, dateTo } = filters

  // Filtre optimisé avec useMemo
  const filteredParcels = useMemo(() => {
    let result = parcels

    // Filtre par recherche (tracking ID, nom, téléphone)
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim()
      result = result.filter(p =>
        p.trackingId?.toLowerCase().includes(searchLower) ||
        p.receiverName?.toLowerCase().includes(searchLower) ||
        p.receiver?.name?.toLowerCase().includes(searchLower) ||
        p.receiverPhone?.includes(searchLower) ||
        p.receiver?.phone?.includes(searchLower) ||
        p.senderName?.toLowerCase().includes(searchLower) ||
        p.sender?.name?.toLowerCase().includes(searchLower)
      )
    }

    // Filtre par statut
    if (status && status !== 'all') {
      result = result.filter(p => p.status === status)
    }

    // Filtre par ville
    if (city && city !== 'all') {
      result = result.filter(p =>
        p.originCity === city ||
        p.destinationCity === city ||
        p.sender?.city === city ||
        p.receiver?.city === city
      )
    }

    // Filtre par date
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      fromDate.setHours(0, 0, 0, 0)
      result = result.filter(p => {
        const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
        return pDate >= fromDate
      })
    }

    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      result = result.filter(p => {
        const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
        return pDate <= toDate
      })
    }

    return result
  }, [parcels, search, status, city, dateFrom, dateTo])

  // Statistiques optimisées
  const stats = useMemo(() => {
    const total = filteredParcels.length
    const delivered = filteredParcels.filter(p => p.status === 'Livré').length
    const pending = filteredParcels.filter(p => p.status === 'En attente').length
    const inTransit = filteredParcels.filter(p => p.status === 'En transit').length
    const totalCOD = filteredParcels.reduce((sum, p) => sum + (p.codAmount || 0), 0)

    return {
      total,
      delivered,
      pending,
      inTransit,
      totalCOD,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0
    }
  }, [filteredParcels])

  return {
    filteredParcels,
    stats,
    count: filteredParcels.length
  }
}

/**
 * Hook pour debounce de recherche
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

import { useState, useEffect } from 'react'
