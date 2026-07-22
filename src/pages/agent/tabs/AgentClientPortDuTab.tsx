import { useState, useEffect, useMemo } from 'react'
import { subscribeClientPortDuTransactions, collectClientPortDu, cancelClientPortDu } from '../../../firebase/firestore'
import { Banknote, CheckCircle, X, AlertCircle, User, Package, Search, Calendar, Filter, Download, Trash2, Edit } from 'lucide-react'

interface ClientPortDuTransaction {
  id: string
  parcelId: string
  trackingId: string
  nic?: string
  clientId: string
  clientName: string
  clientTel?: string
  clientCity?: string
  amount: number
  driverName: string
  driverId: string
  agencyCity: string
  createdAt: any
  status: 'pending' | 'collected' | 'cancelled'
  collectedBy?: string
  collectedAt?: any
  cancelledBy?: string
  cancelledAt?: any
  cancellationReason?: string
  createdBy: string
}

interface Props {
  agencyCity: string
  profile: any
}

export default function AgentClientPortDuTab({ agencyCity, profile }: Props) {
  const [transactions, setTransactions] = useState<ClientPortDuTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'collected' | 'cancelled'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Actions
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!agencyCity) {
      console.warn('⚠️ Pas de ville d\'agence')
      return
    }
    console.log('📡 Souscription aux ports en compte pour:', agencyCity)
    const unsub = subscribeClientPortDuTransactions(
      agencyCity,
      (data) => {
        console.log('✅ Transactions reçues:', data.length, data)
        setTransactions(data)
        setLoading(false)
      },
      (err) => {
        console.error('❌ Erreur chargement ports en compte:', err)
        setMsg({ type: 'error', text: `Erreur de chargement: ${err.message || 'Erreur inconnue'}` })
        setLoading(false)
      }
    )
    return () => {
      console.log('🔌 Désinscription des ports en compte')
      unsub?.()
    }
  }, [agencyCity])

  // Liste des livreurs uniques
  const drivers = useMemo(() => {
    const driverSet = new Set(transactions.map(t => t.driverName))
    return Array.from(driverSet).sort()
  }, [transactions])

  // Filtrage avancé
  const filteredTransactions = useMemo(() => {
    let filtered = transactions

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter)
    }

    // Filtre par recherche (nom client, tracking, NIC, téléphone)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(t =>
        t.clientName?.toLowerCase().includes(query) ||
        t.trackingId?.toLowerCase().includes(query) ||
        t.nic?.toLowerCase().includes(query) ||
        t.clientTel?.toLowerCase().includes(query)
      )
    }

    // Filtre par livreur
    if (driverFilter !== 'all') {
      filtered = filtered.filter(t => t.driverName === driverFilter)
    }

    // Filtre par date
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      fromDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(t => {
        const transDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt)
        return transDate >= fromDate
      })
    }

    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(t => {
        const transDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt)
        return transDate <= toDate
      })
    }

    return filtered
  }, [transactions, statusFilter, searchQuery, driverFilter, dateFrom, dateTo])

  // Statistiques sur les transactions filtrées
  const stats = useMemo(() => {
    const pending = filteredTransactions.filter(t => t.status === 'pending')
    const collected = filteredTransactions.filter(t => t.status === 'collected')
    const cancelled = filteredTransactions.filter(t => t.status === 'cancelled')

    return {
      totalPending: pending.reduce((sum, t) => sum + t.amount, 0),
      countPending: pending.length,
      totalCollected: collected.reduce((sum, t) => sum + t.amount, 0),
      countCollected: collected.length,
      totalCancelled: cancelled.reduce((sum, t) => sum + t.amount, 0),
      countCancelled: cancelled.length,
      total: filteredTransactions.reduce((sum, t) => sum + t.amount, 0),
      count: filteredTransactions.length,
    }
  }, [filteredTransactions])

  const handleCollect = async (transactionId: string) => {
    if (!window.confirm('Confirmer la collecte de ce port en compte ?')) return
    setCollectingId(transactionId)
    try {
      await collectClientPortDu(transactionId, profile?.name || 'Chef d\'agence')
      setMsg({ type: 'success', text: '✅ Port collecté avec succès' })
      setTimeout(() => setMsg(null), 3000)
    } catch (err: any) {
      setMsg({ type: 'error', text: `❌ Erreur: ${err.message}` })
      setTimeout(() => setMsg(null), 5000)
    } finally {
      setCollectingId(null)
    }
  }

  const handleCancel = async (transactionId: string) => {
    const reason = prompt('Raison de l\'annulation:')
    if (!reason?.trim()) return

    setCancellingId(transactionId)
    try {
      await cancelClientPortDu(transactionId, profile?.name || 'Chef d\'agence', reason)
      setMsg({ type: 'success', text: '✅ Port annulé avec succès' })
      setTimeout(() => setMsg(null), 3000)
    } catch (err: any) {
      setMsg({ type: 'error', text: `❌ Erreur: ${err.message}` })
      setTimeout(() => setMsg(null), 5000)
    } finally {
      setCancellingId(null)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Tracking', 'N° EXP', 'Client', 'Téléphone', 'Montant', 'Livreur', 'Statut', 'Collecté par', 'Date collecte']
    const rows = filteredTransactions.map(t => [
      t.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || '',
      t.trackingId,
      t.nic || '',
      t.clientName,
      t.clientTel || '',
      `${t.amount} DH`,
      t.driverName,
      t.status === 'pending' ? 'En attente' : t.status === 'collected' ? 'Collecté' : 'Annulé',
      t.collectedBy || '',
      t.collectedAt?.toDate?.()?.toLocaleDateString('fr-FR') || ''
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ports_en_compte_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setStatusFilter('all')
    setSearchQuery('')
    setDriverFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = statusFilter !== 'all' || searchQuery || driverFilter !== 'all' || dateFrom || dateTo

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
          <h1 className="text-2xl font-black text-gray-900">🏦 Ports dûs en compte clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.count} transaction(s) • {stats.total.toFixed(2)} DH total
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredTransactions.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-700 font-medium">En attente</p>
              <p className="text-2xl font-black text-orange-900">{stats.totalPending.toFixed(2)} DH</p>
              <p className="text-xs text-orange-600 mt-1">{stats.countPending} transaction(s)</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-200 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-700" />
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-700 font-medium">Collectés</p>
              <p className="text-2xl font-black text-green-900">{stats.totalCollected.toFixed(2)} DH</p>
              <p className="text-xs text-green-600 mt-1">{stats.countCollected} transaction(s)</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-700" />
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-700 font-medium">Annulés</p>
              <p className="text-2xl font-black text-gray-900">{stats.totalCancelled.toFixed(2)} DH</p>
              <p className="text-xs text-gray-600 mt-1">{stats.countCancelled} transaction(s)</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <X className="w-6 h-6 text-gray-700" />
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                placeholder="Client, N° EXP, tracking, tél..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Livreur */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Livreur
            </label>
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous les livreurs</option>
              {drivers.map(driver => (
                <option key={driver} value={driver}>{driver}</option>
              ))}
            </select>
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
            Tous ({transactions.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            En attente ({transactions.filter(t => t.status === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('collected')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'collected'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Collectés ({transactions.filter(t => t.status === 'collected').length})
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'cancelled'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Annulés ({transactions.filter(t => t.status === 'cancelled').length})
          </button>
        </div>
      </div>

      {/* Liste des transactions */}
      <div className="space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucune transaction trouvée</p>
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
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className={`border rounded-xl p-4 ${
                transaction.status === 'pending'
                  ? 'bg-orange-50 border-orange-200'
                  : transaction.status === 'collected'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-600" />
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-bold text-blue-600">
                          {transaction.trackingId}
                        </span>
                        {transaction.nic && (
                          <span className="text-xs text-gray-500">
                            N° EXP: {transaction.nic}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                      transaction.status === 'pending'
                        ? 'bg-orange-200 text-orange-900'
                        : transaction.status === 'collected'
                        ? 'bg-green-200 text-green-900'
                        : 'bg-gray-300 text-gray-900'
                    }`}>
                      {transaction.status === 'pending' && '⏳ En attente'}
                      {transaction.status === 'collected' && '✅ Collecté'}
                      {transaction.status === 'cancelled' && '❌ Annulé'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Client</p>
                      <p className="font-semibold text-gray-900">{transaction.clientName}</p>
                      {transaction.clientTel && (
                        <p className="text-xs text-gray-500">{transaction.clientTel}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Montant</p>
                      <p className="font-bold text-lg text-gray-900">{transaction.amount} DH</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Livreur</p>
                      <p className="font-medium text-gray-900">{transaction.driverName}</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Créé le</p>
                      <p className="font-medium text-gray-900">
                        {transaction.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A'}
                      </p>
                    </div>

                    {transaction.status === 'collected' && (
                      <>
                        <div>
                          <p className="text-xs text-gray-500">Collecté par</p>
                          <p className="font-medium text-green-900">{transaction.collectedBy}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Collecté le</p>
                          <p className="font-medium text-green-900">
                            {transaction.collectedAt?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A'}
                          </p>
                        </div>
                      </>
                    )}

                    {transaction.status === 'cancelled' && transaction.cancellationReason && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Raison d'annulation</p>
                        <p className="font-medium text-gray-900">{transaction.cancellationReason}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {transaction.status === 'pending' && (
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => handleCollect(transaction.id)}
                      disabled={collectingId === transaction.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      {collectingId === transaction.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Collecte...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Collecter
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleCancel(transaction.id)}
                      disabled={cancellingId === transaction.id}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      {cancellingId === transaction.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Annulation...
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4" />
                          Annuler
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
