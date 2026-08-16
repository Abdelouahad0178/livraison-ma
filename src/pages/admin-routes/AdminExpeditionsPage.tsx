import { lazy, Suspense, useEffect, useState, useMemo, useRef } from 'react'
import { useAdminContext } from '../../contexts/AdminContext'
import { subscribeAllParcels, subscribeAllParcelsWithDateFilter, deleteParcel } from '../../firebase/firestore'
import { useOperationalDaySelector } from '../../hooks/useOperationalDay'
import { getOperationalDayRange } from '../../config/operationalDay'
import { Package } from 'lucide-react'

const AdminExpeditionsTab = lazy(() => import('../admin/tabs/AdminExpeditionsTab'))

const AdminExpeditionsPage = () => {
  const { users } = useAdminContext()
  const [allParcels, setParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('Toutes')
  const [driverFilter, setDriverFilter] = useState('Tous')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)

  // 🗓️ Journée opérationnelle
  const {
    selectedDay: operationalDay,
    setSelectedDay: setOperationalDay,
  } = useOperationalDaySelector()

  const lastPageDocRef = useRef<any>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search])

  // Load parcels when search or filters are active
  useEffect(() => {
    const hasSearch = search.trim() !== ''
    const hasDateFilter = datePreset !== 'all'
    const hasFilter = cityFilter !== 'Toutes' || driverFilter !== 'Tous' || statusFilter.length > 0

    if (!hasSearch && !hasFilter && !hasDateFilter) {
      console.log('📭 Aucun filtre/recherche → Liste vide')
      setParcels([])
      setLoading(false)
      return
    }

    setLoading(true)
    const loadLimit = hasSearch ? 5000 : 1000

    console.log(`📦 Chargement ${loadLimit} colis (recherche: ${hasSearch ? 'OUI' : 'NON'}, filtre: ${hasFilter ? 'OUI' : 'NON'}, date: ${hasDateFilter ? 'OUI' : 'NON'})`)

    // 🗓️ SI JOUR D'OPÉRATION ou CUSTOM → charger avec filtre Firestore
    if (datePreset === 'operational' && operationalDay) {
      const range = getOperationalDayRange(operationalDay)
      console.log(`🗓️ Jour d'opération:`, { from: range.start, to: range.end })

      const unsubParcels = subscribeAllParcelsWithDateFilter(
        (data: any, lastSnap: any) => {
          console.log(`✅ ${data.length} colis chargés (jour d'opération)`)
          setParcels(data)
          setLoading(false)
          if (!lastPageDocRef.current) lastPageDocRef.current = lastSnap
        },
        (err: any) => {
          console.error('❌ Erreur chargement:', err)
          setLoading(false)
        },
        {
          pageSize: loadLimit,
          dateFrom: range.start,
          dateTo: range.end
        }
      )
      return () => unsubParcels()
    } else if (datePreset === 'custom' && (dateFrom || dateTo)) {
      const dateFromObj = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
      const dateToObj = dateTo ? new Date(dateTo + 'T23:59:59') : null
      console.log(`📅 Filtre de date custom:`, { from: dateFromObj, to: dateToObj })

      const unsubParcels = subscribeAllParcelsWithDateFilter(
        (data: any, lastSnap: any) => {
          console.log(`✅ ${data.length} colis chargés (filtre custom)`)
          setParcels(data)
          setLoading(false)
          if (!lastPageDocRef.current) lastPageDocRef.current = lastSnap
        },
        (err: any) => {
          console.error('❌ Erreur chargement:', err)
          setLoading(false)
        },
        {
          pageSize: loadLimit,
          dateFrom: dateFromObj,
          dateTo: dateToObj
        }
      )
      return () => unsubParcels()
    } else {
      // Chargement normal
      const unsubParcels = subscribeAllParcels(
        (data: any, lastSnap: any) => {
          console.log(`✅ ${data.length} colis chargés`)
          setParcels(data)
          setLoading(false)
          if (!lastPageDocRef.current) lastPageDocRef.current = lastSnap
        },
        (err: any) => {
          console.error('❌ Erreur chargement:', err)
          setLoading(false)
        },
        0,
        loadLimit
      )
      return () => unsubParcels()
    }
  }, [search, cityFilter, driverFilter, statusFilter, datePreset, dateFrom, dateTo, operationalDay])

  // Filter parcels
  const filtered = useMemo(() => {
    if (!Array.isArray(allParcels)) return []

    const hasActiveFilter =
      cityFilter !== 'Toutes' ||
      driverFilter !== 'Tous' ||
      statusFilter.length > 0 ||
      (debouncedSearch && debouncedSearch.trim() !== '')

    if (!hasActiveFilter) {
      return []
    }

    let list = allParcels

    // City filter
    if (cityFilter !== 'Toutes') {
      list = list.filter((p: any) => p.destinationCity === cityFilter)
    }

    // Driver filter
    if (driverFilter !== 'Tous') {
      if (driverFilter === 'Non assigné') {
        list = list.filter((p: any) => !p.assignedDriver)
      } else {
        list = list.filter((p: any) => p.assignedDriver === driverFilter)
      }
    }

    // Status filter
    if (statusFilter.length > 0) {
      list = list.filter((p: any) => statusFilter.includes(p.status))
    }

    // Search filter
    if (debouncedSearch && debouncedSearch.trim()) {
      const q = debouncedSearch.trim()
      const qUpper = q.toUpperCase()

      // Si recherche numérique pure (N° EXP) → MATCH EXACT uniquement
      if (/^[0-9]+$/.test(q)) {
        list = list.filter((p: any) =>
          p.senderNic === qUpper ||
          p.sender?.nic === qUpper ||
          p.trackingId === qUpper
        )
      } else {
        // Recherche texte normale
        const qLower = q.toLowerCase()
        list = list.filter((p: any) =>
          (p.trackingId || '').toLowerCase().includes(qLower) ||
          (p.senderNic || '').toLowerCase().includes(qLower) ||
          (p.sender?.nic || '').toLowerCase().includes(qLower) ||
          (p.sender?.name || '').toLowerCase().includes(qLower) ||
          (p.receiver?.name || '').toLowerCase().includes(qLower) ||
          (p.receiver?.phone || '').toLowerCase().includes(qLower) ||
          (p.receiver?.address || '').toLowerCase().includes(qLower) ||
          (p.destinationCity || '').toLowerCase().includes(qLower)
        )
      }
    }

    return list
  }, [allParcels, cityFilter, driverFilter, statusFilter, debouncedSearch])

  // KPIs
  const kpis = {
    total: filtered.length,
    delivered: filtered.filter((p: any) => p.status === 'delivered').length,
    pending: filtered.filter((p: any) => p.status === 'pending').length,
    inTransit: filtered.filter((p: any) => p.status === 'in_transit').length,
  }

  const handleDeleteParcel = async (parcelId: string) => {
    if (!deleteConfirm) {
      setDeleteConfirm(parcelId)
      return
    }

    setDeleting(true)
    try {
      await deleteParcel(parcelId)
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Error deleting parcel:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
          <Package className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📦 Expéditions</h1>
          <p className="text-sm text-gray-500">Recherche et gestion des colis</p>
        </div>
      </div>

      <Suspense fallback={
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 rounded w-full" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        </div>
      }>
        <AdminExpeditionsTab
          kpis={kpis}
          search={search}
          setSearch={setSearch}
          cityFilter={cityFilter}
          setCityFilter={setCityFilter}
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          users={users}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          filtered={filtered}
          loading={loading}
          setCodEditModal={() => {}}
          setNicEditModal={() => {}}
          setNewParcelModal={() => {}}
          setStatusModal={() => {}}
          openAdminEdit={() => {}}
          allParcels={allParcels}
          hasMore={false}
          loadMoreParcels={() => {}}
          loadingMore={false}
          openArchiveModal={() => {}}
          selectCls={''}
          handleDeleteParcel={handleDeleteParcel}
          deleteConfirm={deleteConfirm}
          deleting={deleting}
        />
      </Suspense>
    </div>
  )
}

export default AdminExpeditionsPage
