import { useState, useEffect, useMemo } from 'react'
import { subscribePortPayeCheque, finalizePortPayeCheque } from '../../../firebase/firestore'
import { CheckCircle, X, AlertCircle, Package, Search, Calendar, Filter, Download, Edit2 } from 'lucide-react'

interface PortPayeChequeParcel {
  id: string
  trackingId: string
  portType: string // 'port_paye' ou 'port_du'
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
  // Champs port PAYÉ
  portPayeMethod?: string
  portPayeChequeBanque?: string
  portPayeChequeNumero?: string
  portPayeChequeDateEncaissement?: string
  portPayeChequeFinalizedAt?: string
  portPayeChequeFinalizedBy?: string
  // Champs port DÛ
  portDuReceivedMethod?: string
  portDuChequeBanque?: string
  portDuChequeNumero?: string
  portDuChequeDateEncaissement?: string
  portDuChequeFinalizedAt?: string
  portDuChequeFinalizedBy?: string
  createdAt: any
  createdBy?: string
}

interface Props {
  agencyCity: string
  profile: any
}

export default function PortPayeChequeTab({ agencyCity, profile }: Props) {
  const [parcels, setParcels] = useState<PortPayeChequeParcel[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'finalized'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modal de finalisation
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [selectedParcel, setSelectedParcel] = useState<PortPayeChequeParcel | null>(null)
  const [finalizeForm, setFinalizeForm] = useState({
    banque: '',
    numero: '',
    dateEncaissement: new Date().toISOString().split('T')[0]
  })
  const [finalizing, setFinalizing] = useState(false)

  useEffect(() => {
    if (!agencyCity) {
      console.warn('⚠️ Pas de ville d\'agence')
      return
    }
    console.log('📡 Souscription aux ports payés par chèque pour:', agencyCity)
    const unsub = subscribePortPayeCheque(
      agencyCity,
      (data) => {
        console.log('✅ Ports payés par chèque reçus:', data.length, data)
        setParcels(data)
        setLoading(false)
      },
      (err) => {
        console.error('❌ Erreur chargement ports payés par chèque:', err)
        setMsg({ type: 'error', text: `Erreur de chargement: ${err.message || 'Erreur inconnue'}` })
        setLoading(false)
      }
    )
    return () => {
      console.log('🔌 Désinscription des ports payés par chèque')
      unsub?.()
    }
  }, [agencyCity])

  // Helper pour savoir si un port est finalisé (fonctionne pour port_paye et port_du)
  const isFinalized = (p: PortPayeChequeParcel) => {
    if (p.portType === 'port_paye') {
      return !!p.portPayeChequeFinalizedAt
    } else if (p.portType === 'port_du') {
      return !!p.portDuChequeFinalizedAt
    }
    return false
  }

  // Filtrage avancé
  const filteredParcels = useMemo(() => {
    let filtered = parcels

    // Filtre par statut
    if (statusFilter === 'pending') {
      filtered = filtered.filter(p => !isFinalized(p))
    } else if (statusFilter === 'finalized') {
      filtered = filtered.filter(p => isFinalized(p))
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
    const pending = filteredParcels.filter(p => !isFinalized(p))
    const finalized = filteredParcels.filter(p => isFinalized(p))

    return {
      totalPending: pending.reduce((sum, p) => sum + (p.price || 0), 0),
      countPending: pending.length,
      totalFinalized: finalized.reduce((sum, p) => sum + (p.price || 0), 0),
      countFinalized: finalized.length,
      total: filteredParcels.reduce((sum, p) => sum + (p.price || 0), 0),
      count: filteredParcels.length,
    }
  }, [filteredParcels])

  const handleOpenFinalizeModal = (parcel: PortPayeChequeParcel) => {
    setSelectedParcel(parcel)
    setFinalizeForm({
      banque: '',
      numero: '',
      dateEncaissement: new Date().toISOString().split('T')[0]
    })
    setShowFinalizeModal(true)
  }

  const handleFinalize = async () => {
    if (!selectedParcel) return

    // Validation
    if (!finalizeForm.banque.trim()) {
      setMsg({ type: 'error', text: '⚠️ Veuillez saisir le nom de la banque' })
      return
    }
    if (!finalizeForm.numero.trim()) {
      setMsg({ type: 'error', text: '⚠️ Veuillez saisir le numéro du chèque' })
      return
    }
    if (!finalizeForm.dateEncaissement) {
      setMsg({ type: 'error', text: '⚠️ Veuillez saisir la date d\'encaissement' })
      return
    }

    setFinalizing(true)
    try {
      await finalizePortPayeCheque(
        selectedParcel.id,
        {
          banque: finalizeForm.banque.trim(),
          numero: finalizeForm.numero.trim(),
          dateEncaissement: finalizeForm.dateEncaissement
        },
        profile?.name || 'Chef d\'agence'
      )
      setMsg({ type: 'success', text: '✅ Chèque finalisé avec succès' })
      setShowFinalizeModal(false)
      setSelectedParcel(null)
      setTimeout(() => setMsg(null), 3000)
    } catch (err: any) {
      setMsg({ type: 'error', text: `❌ Erreur: ${err.message}` })
      setTimeout(() => setMsg(null), 5000)
    } finally {
      setFinalizing(false)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Tracking', 'N° EXP', 'Type', 'Expéditeur', 'Destinataire', 'Montant', 'Banque', 'N° Chèque', 'Date encaissement', 'Statut', 'Finalisé par']
    const rows = filteredParcels.map(p => {
      const isPortDu = p.portType === 'port_du'
      const chequeBanque = isPortDu ? p.portDuChequeBanque : p.portPayeChequeBanque
      const chequeNumero = isPortDu ? p.portDuChequeNumero : p.portPayeChequeNumero
      const chequeDateEncaissement = isPortDu ? p.portDuChequeDateEncaissement : p.portPayeChequeDateEncaissement
      const chequeFinalizedBy = isPortDu ? p.portDuChequeFinalizedBy : p.portPayeChequeFinalizedBy
      const finalized = isFinalized(p)

      return [
        p.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || '',
        p.trackingId,
        p.sender?.nic || '',
        isPortDu ? 'Port Dû' : 'Port Payé',
        p.sender?.name || '',
        p.receiver?.name || '',
        `${p.price} DH`,
        chequeBanque || '',
        chequeNumero || '',
        chequeDateEncaissement || '',
        finalized ? 'Finalisé' : 'En attente',
        chequeFinalizedBy || ''
      ]
    })

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ports_payes_cheque_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
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
          <h1 className="text-2xl font-black text-gray-900">📋 Ports payés par chèque</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.count} port(s) • {stats.total.toFixed(2)} DH total
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredParcels.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-700 font-medium">En attente de finalisation</p>
              <p className="text-2xl font-black text-orange-900">{stats.totalPending.toFixed(2)} DH</p>
              <p className="text-xs text-orange-600 mt-1">{stats.countPending} chèque(s)</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-200 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-700" />
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-700 font-medium">Finalisés</p>
              <p className="text-2xl font-black text-green-900">{stats.totalFinalized.toFixed(2)} DH</p>
              <p className="text-xs text-green-600 mt-1">{stats.countFinalized} chèque(s)</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-700" />
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
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            En attente ({parcels.filter(p => !isFinalized(p)).length})
          </button>
          <button
            onClick={() => setStatusFilter('finalized')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === 'finalized'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Finalisés ({parcels.filter(p => isFinalized(p)).length})
          </button>
        </div>
      </div>

      {/* Liste des ports payés par chèque */}
      <div className="space-y-3">
        {filteredParcels.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucun port payé par chèque trouvé</p>
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
            const isPortDu = parcel.portType === 'port_du'
            const finalized = isFinalized(parcel)
            const chequeBanque = isPortDu ? parcel.portDuChequeBanque : parcel.portPayeChequeBanque
            const chequeNumero = isPortDu ? parcel.portDuChequeNumero : parcel.portPayeChequeNumero
            const chequeDateEncaissement = isPortDu ? parcel.portDuChequeDateEncaissement : parcel.portPayeChequeDateEncaissement
            const chequeFinalizedBy = isPortDu ? parcel.portDuChequeFinalizedBy : parcel.portPayeChequeFinalizedBy

            return (
              <div
                key={parcel.id}
                className={`border rounded-xl p-4 ${
                  finalized
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
                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                        isPortDu
                          ? 'bg-purple-200 text-purple-900'
                          : 'bg-blue-200 text-blue-900'
                      }`}>
                        {isPortDu ? '💰 Port Dû' : '💵 Port Payé'}
                      </div>
                      {/* Badge statut */}
                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                        finalized
                          ? 'bg-green-200 text-green-900'
                          : 'bg-orange-200 text-orange-900'
                      }`}>
                        {finalized ? '✅ Finalisé' : '⏳ En attente'}
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
                      <p className="text-xs text-gray-500">{parcel.receiver?.city || '—'}</p>
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

                    {finalized && (
                      <>
                        <div>
                          <p className="text-xs text-gray-500">Banque</p>
                          <p className="font-medium text-green-900">{chequeBanque || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">N° Chèque</p>
                          <p className="font-medium text-green-900">{chequeNumero || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Date encaissement</p>
                          <p className="font-medium text-green-900">
                            {chequeDateEncaissement || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Finalisé par</p>
                          <p className="font-medium text-green-900">{chequeFinalizedBy || '—'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions - Finaliser uniquement pour ports PAYÉS non finalisés */}
                {!finalized && !isPortDu && (
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => handleOpenFinalizeModal(parcel)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 whitespace-nowrap"
                    >
                      <Edit2 className="w-4 h-4" />
                      Finaliser
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })
        )}
      </div>

      {/* Modal de finalisation */}
      {showFinalizeModal && selectedParcel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4">
              <h2 className="text-xl font-bold">Finaliser le chèque</h2>
              <p className="text-blue-100 text-sm mt-1">
                Tracking: {selectedParcel.trackingId}
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Banque <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={finalizeForm.banque}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, banque: e.target.value })}
                  placeholder="Ex: Attijariwafa Bank"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Numéro du chèque <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={finalizeForm.numero}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, numero: e.target.value })}
                  placeholder="Ex: 12345678"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Date d'encaissement <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={finalizeForm.dateEncaissement}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, dateEncaissement: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <span className="font-bold">Montant:</span> {selectedParcel.price} DH
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3">
              <button
                onClick={() => {
                  setShowFinalizeModal(false)
                  setSelectedParcel(null)
                }}
                disabled={finalizing}
                className="flex-1 py-2 px-4 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-100 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {finalizing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Finalisation...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Finaliser
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
