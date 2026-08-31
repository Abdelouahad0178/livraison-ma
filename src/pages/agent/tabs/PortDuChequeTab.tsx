import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { CheckCircle, X, AlertCircle, Package, Search, Calendar, Filter, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

interface PortDuChequeParcel {
  id: string
  trackingId: string
  portType: string
  sender: {
    name: string
    nic?: string
    tel?: string
    city?: string
  }
  receiver: {
    name: string
    city?: string
  }
  price: number
  status: string
  createdAt: any
  destinationCity?: string
  originCity?: string
}

interface Props {
  agencyCity: string
  profile: any
}

export default function PortDuChequeTab({ agencyCity, profile }: Props) {
  const [parcels, setParcels] = useState<PortDuChequeParcel[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'pending'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!agencyCity) {
      console.warn('⚠️ Pas de ville d\'agence')
      return
    }

    console.log('📡 Souscription aux ports dû chèque pour:', agencyCity)

    // Deux requêtes : destination ET origine
    const qDest = query(
      collection(db, 'parcels'),
      where('portType', '==', 'port_du_cheque'),
      where('destinationCity', '==', agencyCity)
    )

    const qOrig = query(
      collection(db, 'parcels'),
      where('portType', '==', 'port_du_cheque'),
      where('originCity', '==', agencyCity)
    )

    const allParcels = new Map<string, PortDuChequeParcel>()

    const unsubDest = onSnapshot(
      qDest,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          allParcels.set(doc.id, { id: doc.id, ...doc.data() } as PortDuChequeParcel)
        })
        setParcels(Array.from(allParcels.values()))
        setLoading(false)
        console.log('✅ Ports dû chèque (destination):', snapshot.docs.length)
      },
      (err) => {
        console.error('❌ Erreur chargement ports dû chèque (dest):', err)
        setMsg({ type: 'error', text: `Erreur: ${err.message}` })
        setLoading(false)
      }
    )

    const unsubOrig = onSnapshot(
      qOrig,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          allParcels.set(doc.id, { id: doc.id, ...doc.data() } as PortDuChequeParcel)
        })
        setParcels(Array.from(allParcels.values()))
        console.log('✅ Ports dû chèque (origine):', snapshot.docs.length)
        console.log('✅ Total ports dû chèque:', allParcels.size, Array.from(allParcels.values()))
      },
      (err) => {
        console.error('❌ Erreur chargement ports dû chèque (orig):', err)
      }
    )

    return () => {
      console.log('🔌 Désinscription des ports dû chèque')
      unsubDest()
      unsubOrig()
    }
  }, [agencyCity])

  // Filtrage avancé
  const filteredParcels = useMemo(() => {
    let filtered = parcels

    // Filtre par statut
    if (statusFilter === 'delivered') {
      filtered = filtered.filter(p => p.status === 'Livré')
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(p => p.status !== 'Livré')
    }

    // Filtre par recherche (tracking, N° EXP, nom expéditeur/destinataire)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(p =>
        p.trackingId?.toLowerCase().includes(query) ||
        p.sender?.nic?.toLowerCase().includes(query) ||
        p.sender?.name?.toLowerCase().includes(query) ||
        p.receiver?.name?.toLowerCase().includes(query)
      )
    }

    // Filtre par date
    if (dateFrom) {
      const fromDate = new Date(dateFrom + 'T00:00:00')
      filtered = filtered.filter(p => {
        const parcelDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        return parcelDate >= fromDate
      })
    }

    if (dateTo) {
      const toDate = new Date(dateTo + 'T23:59:59')
      filtered = filtered.filter(p => {
        const parcelDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        return parcelDate <= toDate
      })
    }

    return filtered
  }, [parcels, statusFilter, searchQuery, dateFrom, dateTo])

  // Statistiques
  const stats = useMemo(() => {
    const delivered = filteredParcels.filter(p => p.status === 'Livré')
    const pending = filteredParcels.filter(p => p.status !== 'Livré')

    return {
      totalDelivered: delivered.reduce((sum, p) => sum + (p.price || 0), 0),
      countDelivered: delivered.length,
      totalPending: pending.reduce((sum, p) => sum + (p.price || 0), 0),
      countPending: pending.length,
      total: filteredParcels.reduce((sum, p) => sum + (p.price || 0), 0),
      count: filteredParcels.length,
    }
  }, [filteredParcels])

  // Export Excel
  const handleExportExcel = () => {
    const data = filteredParcels.map(p => ({
      'Date': p.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || '',
      'Tracking': p.trackingId,
      'N° EXP': p.sender?.nic || '',
      'Expéditeur': p.sender?.name || '',
      'Ville Exp': p.originCity || p.sender?.city || '',
      'Destinataire': p.receiver?.name || '',
      'Ville Dest': p.receiver?.city || p.destinationCity || '',
      'Montant (DH)': p.price || 0,
      'Statut': p.status || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ports Dû Chèque')

    // Largeur des colonnes
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 15 }, // Tracking
      { wch: 12 }, // N° EXP
      { wch: 25 }, // Expéditeur
      { wch: 15 }, // Ville Exp
      { wch: 25 }, // Destinataire
      { wch: 15 }, // Ville Dest
      { wch: 12 }, // Montant
      { wch: 20 }, // Statut
    ]

    XLSX.writeFile(wb, `ports_du_cheque_${agencyCity}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setStatusFilter('all')
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = statusFilter !== 'all' || searchQuery || dateFrom || dateTo

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">📋 Ports payés chèque (Port Dû)</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.count} colis • {stats.total.toFixed(2)} DH total
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={filteredParcels.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Exporter Excel
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-700 font-medium">Livrés</p>
              <p className="text-2xl font-black text-green-900">{stats.totalDelivered.toFixed(2)} DH</p>
              <p className="text-xs text-green-600 mt-1">{stats.countDelivered} colis</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-700" />
            </div>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-700 font-medium">En cours</p>
              <p className="text-2xl font-black text-orange-900">{stats.totalPending.toFixed(2)} DH</p>
              <p className="text-xs text-orange-600 mt-1">{stats.countPending} colis</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-200 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`p-4 rounded-xl border ${
          msg.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Filtres</h3>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                Actifs
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
            >
              Réinitialiser
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Recherche */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Recherche
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tracking, N° EXP, nom..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Date début */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date début
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Date fin */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date fin
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Filtres de statut */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tous ({parcels.length})
          </button>
          <button
            onClick={() => setStatusFilter('delivered')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'delivered'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Livrés ({parcels.filter(p => p.status === 'Livré').length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            En cours ({parcels.filter(p => p.status !== 'Livré').length})
          </button>
        </div>
      </div>

      {/* Liste des ports dû chèque */}
      <div className="space-y-3">
        {filteredParcels.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucun port dû chèque trouvé</p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          filteredParcels.map((parcel) => {
            const isDelivered = parcel.status === 'Livré'

            return (
              <div
                key={parcel.id}
                className={`border rounded-xl p-4 ${
                  isDelivered
                    ? 'bg-green-50 border-green-200'
                    : 'bg-orange-50 border-orange-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-600" />
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold text-blue-600">
                            {parcel.trackingId}
                          </span>
                          {parcel.sender?.nic && (
                            <span className="text-xs text-gray-500">
                              N° EXP: {parcel.sender.nic}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Badge type de port */}
                      <div className="px-2 py-1 rounded-full text-xs font-bold bg-purple-200 text-purple-900">
                        📋 Port Dû Chèque
                      </div>
                      {/* Badge statut */}
                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                        isDelivered
                          ? 'bg-green-200 text-green-900'
                          : 'bg-orange-200 text-orange-900'
                      }`}>
                        {isDelivered ? '✅ Livré' : '⏳ ' + (parcel.status || 'En cours')}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Expéditeur</p>
                        <p className="font-semibold text-gray-900">{parcel.sender?.name || '—'}</p>
                        {parcel.sender?.tel && (
                          <p className="text-xs text-gray-500">{parcel.sender.tel}</p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">Destinataire</p>
                        <p className="font-semibold text-gray-900">{parcel.receiver?.name || '—'}</p>
                        <p className="text-xs text-gray-500">{parcel.receiver?.city || parcel.destinationCity || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">Montant</p>
                        <p className="font-bold text-lg text-gray-900">{parcel.price} DH</p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">Créé le</p>
                        <p className="font-medium text-gray-900">
                          {parcel.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
