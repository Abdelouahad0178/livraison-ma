import { useState, useEffect, useMemo } from 'react'
import { FileText, Printer, Eye, X, Calendar, User, Package, CheckCircle2, Truck, XCircle, Plus, Trash2, Search } from 'lucide-react'
import { subscribeDeliverySheets, markDeliverySheetReprinted, completeDeliverySheet, cancelDeliverySheet, addParcelsToDeliverySheet, removeParcelsFromDeliverySheet } from '../../../firebase/delivery'
import { useAgentCtx } from '../AgentCtx'
import DateFilter from '../DateFilter'
import { filterByDate } from '../../../utils/dateFilter'
import { searchParcelByTrackingId } from '../../../firebase/parcels'

export default function DeliverySheetsTab() {
  const { profile, handlePrintTable, parcels } = useAgentCtx()
  const [sheets, setSheets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSheet, setSelectedSheet] = useState<any>(null)
  const [driverFilter, setDriverFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<string>('week')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [addParcelModal, setAddParcelModal] = useState<{ open: boolean; sheetId: string; search: string; selectedIds: string[] }>({ open: false, sheetId: '', search: '', selectedIds: [] })

  // Charger les bons de livraison
  useEffect(() => {
    if (!profile?.city) return

    const unsubscribe = subscribeDeliverySheets(
      profile.city,
      (data) => {
        setSheets(data)
        setLoading(false)
      },
      (err) => {
        console.error('Erreur chargement bons:', err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [profile?.city])

  // Filtrer les bons
  const filteredSheets = useMemo(() => {
    let result = sheets

    // Filtre par date
    const sheetDate = (s: any) => {
      if (s.createdAt?.toDate) return s.createdAt.toDate()
      if (s.createdAtString) return new Date(s.createdAtString)
      return new Date(0)
    }
    result = filterByDate(result, datePreset, dateFrom, dateTo, sheetDate)

    // Filtre par livreur
    if (driverFilter !== 'all') {
      result = result.filter(s => s.driverId === driverFilter)
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter)
    }

    return result
  }, [sheets, driverFilter, statusFilter, datePreset, dateFrom, dateTo])

  // Liste des livreurs uniques
  const uniqueDrivers = useMemo(() => {
    const driversMap = new Map()
    sheets.forEach(s => {
      if (!driversMap.has(s.driverId)) {
        driversMap.set(s.driverId, { id: s.driverId, name: s.driverName })
      }
    })
    return Array.from(driversMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [sheets])

  const handleReprint = async (sheet: any) => {
    try {
      // Marquer comme réimprimé
      await markDeliverySheetReprinted(sheet.id)

      // Préparer les infos du livreur
      const driverInfo = {
        id: sheet.driverId,
        name: sheet.driverName,
        phone: sheet.driverPhone,
        sectorId: sheet.sectorId,
        sectorName: sheet.sectorName,
        sectorCode: sheet.sectorCode,
      }

      // Imprimer (sans créer un nouveau bon)
      await handlePrintTable(sheet.parcelsSnapshot, sheet.driverName, null, 'portrait', driverInfo)
    } catch (err) {
      console.error('Erreur réimpression:', err)
      alert('Erreur lors de la réimpression')
    }
  }

  const handleComplete = async (sheetId: string) => {
    if (!confirm('Marquer ce bon comme terminé ?')) return
    try {
      await completeDeliverySheet(sheetId)
    } catch (err) {
      console.error('Erreur:', err)
      alert('Erreur lors de la mise à jour')
    }
  }

  const handleCancel = async (sheetId: string) => {
    const reason = prompt('Raison de l\'annulation (optionnel):')
    if (reason === null) return // User cancelled
    try {
      await cancelDeliverySheet(sheetId, reason)
    } catch (err) {
      console.error('Erreur:', err)
      alert('Erreur lors de l\'annulation')
    }
  }

  const handleAddParcels = async () => {
    const { selectedIds, sheetId } = addParcelModal
    if (selectedIds.length === 0) {
      alert('⚠️ Sélectionnez au moins un colis')
      return
    }

    try {
      // Récupérer les colis sélectionnés depuis parcels
      const selectedParcels = parcels.filter(p => selectedIds.includes(p.id))

      // Ajouter les colis au bon
      await addParcelsToDeliverySheet(sheetId, selectedParcels)

      // Fermer le modal et réinitialiser
      setAddParcelModal({ open: false, sheetId: '', search: '', selectedIds: [] })
      alert(`✅ ${selectedIds.length} colis ajouté(s) au bon!`)
    } catch (err: any) {
      console.error('Erreur ajout colis:', err)
      alert(`❌ Erreur: ${err.message}`)
    }
  }

  const handleRemoveParcel = async (sheetId: string, parcelId: string, trackingId: string) => {
    if (!confirm(`Retirer le colis ${trackingId} de ce bon ?`)) return
    try {
      await removeParcelsFromDeliverySheet(sheetId, [parcelId])
      alert(`✅ Colis ${trackingId} retiré du bon!`)
    } catch (err) {
      console.error('Erreur suppression colis:', err)
      alert('Erreur lors de la suppression')
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('fr-MA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Actif'
      case 'completed': return 'Terminé'
      case 'cancelled': return 'Annulé'
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Bons de livraison
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Historique des tableaux de livreur imprimés
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-bold text-gray-500">Livreur:</span>
          <button
            onClick={() => setDriverFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
              driverFilter === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
            }`}
          >
            Tous
          </button>
          {uniqueDrivers.map(driver => (
            <button
              key={driver.id}
              onClick={() => setDriverFilter(driver.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                driverFilter === driver.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
              }`}
            >
              {driver.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-bold text-gray-500">Statut:</span>
          {[
            { value: 'all', label: 'Tous' },
            { value: 'active', label: 'Actif' },
            { value: 'completed', label: 'Terminé' },
            { value: 'cancelled', label: 'Annulé' },
          ].map(status => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                statusFilter === status.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>

        {/* Filtre de date */}
        <DateFilter
          value={datePreset}
          onChange={setDatePreset}
          from={dateFrom}
          onFromChange={setDateFrom}
          to={dateTo}
          onToChange={setDateTo}
        />

        <div className="flex gap-4 flex-wrap text-sm">
          <span className="text-gray-500">{filteredSheets.length} bon(s)</span>
          <span className="font-semibold text-gray-700">
            {filteredSheets.reduce((sum, s) => sum + (s.stats?.total || 0), 0)} colis total
          </span>
        </div>
      </div>

      {/* Liste des bons */}
      {filteredSheets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Aucun bon de livraison pour cette sélection</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSheets.map(sheet => (
            <div
              key={sheet.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <User className="w-4 h-4 text-blue-600" />
                    <p className="font-bold text-blue-800">{sheet.driverName}</p>
                    {sheet.driverPhone && (
                      <span className="text-xs text-blue-500">{sheet.driverPhone}</span>
                    )}
                    {sheet.sectorName && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                        {sheet.sectorName}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusColor(sheet.status)}`}>
                      {getStatusLabel(sheet.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-blue-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(sheet.createdAt || sheet.createdAtString)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {sheet.stats?.total || sheet.parcelsSnapshot?.length || 0} colis
                    </span>
                    {sheet.printCount > 1 && (
                      <span className="flex items-center gap-1">
                        <Printer className="w-3 h-3" />
                        {sheet.printCount} impressions
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedSheet(selectedSheet?.id === sheet.id ? null : sheet)}
                    className="p-2 hover:bg-blue-100 rounded-lg transition"
                    title="Voir les détails"
                  >
                    <Eye className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => handleReprint(sheet)}
                    className="p-2 hover:bg-blue-100 rounded-lg transition"
                    title="Réimprimer"
                  >
                    <Printer className="w-4 h-4 text-blue-600" />
                  </button>
                  {sheet.status === 'active' && (
                    <>
                      <button
                        onClick={() => handleComplete(sheet.id)}
                        className="p-2 hover:bg-green-100 rounded-lg transition"
                        title="Marquer comme terminé"
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={() => handleCancel(sheet.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition"
                        title="Annuler"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Détails du bon */}
              {selectedSheet?.id === sheet.id && (
                <div className="p-4 border-t border-gray-100">
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-gray-700 mb-2">Statistiques</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="text-lg font-bold text-gray-800">{sheet.stats?.total || 0}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <p className="text-xs text-green-600">Livrés</p>
                        <p className="text-lg font-bold text-green-700">{sheet.stats?.delivered || 0}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-xs text-blue-600">En transit</p>
                        <p className="text-lg font-bold text-blue-700">{sheet.stats?.inTransit || 0}</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <p className="text-xs text-orange-600">Retournés</p>
                        <p className="text-lg font-bold text-orange-700">{sheet.stats?.returned || 0}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-gray-700">
                        Colis ({sheet.parcelsSnapshot?.length || 0})
                      </h4>
                      {sheet.status === 'active' && (
                        <button
                          onClick={() => setAddParcelModal({ open: true, sheetId: sheet.id, search: '', selectedIds: [] })}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition"
                        >
                          <Plus className="w-3 h-3" />
                          Ajouter
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {sheet.parcelsSnapshot?.map((parcel: any) => (
                        <div
                          key={parcel.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs"
                        >
                          <div className="flex-1">
                            <p className="font-mono font-bold text-blue-600">{parcel.sender?.nic || parcel.trackingId}</p>
                            <p className="text-gray-600 text-[10px]">{parcel.receiver?.name || '-'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-semibold text-gray-700">{parcel.status}</p>
                              {parcel.codAmount > 0 && (
                                <p className="text-orange-600 font-bold">{parcel.codAmount} DH</p>
                              )}
                            </div>
                            {sheet.status === 'active' && (
                              <button
                                onClick={() => handleRemoveParcel(sheet.id, parcel.id, parcel.sender?.nic || parcel.trackingId)}
                                className="p-1.5 hover:bg-red-100 rounded-lg transition"
                                title="Retirer ce colis"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Ajouter Colis */}
      {addParcelModal.open && (() => {
        const currentSheet = sheets.find(s => s.id === addParcelModal.sheetId)
        const existingParcelIds = currentSheet?.parcelsSnapshot?.map((p: any) => p.id) || []

        // Filtrer les colis disponibles (pas déjà dans le bon)
        const availableParcels = parcels.filter(p => !existingParcelIds.includes(p.id))

        // Filtrer par recherche
        const searchQuery = addParcelModal.search.toLowerCase()
        const filteredParcels = searchQuery
          ? availableParcels.filter(p =>
              p.sender?.nic?.toLowerCase().includes(searchQuery) ||
              p.trackingId?.toLowerCase().includes(searchQuery) ||
              p.receiver?.name?.toLowerCase().includes(searchQuery) ||
              p.sender?.name?.toLowerCase().includes(searchQuery)
            )
          : availableParcels

        const selectedCount = addParcelModal.selectedIds.length

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Ajouter des colis au bon</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Livreur: {currentSheet?.driverName} • {availableParcels.length} colis disponibles
                  </p>
                </div>
                <button
                  onClick={() => setAddParcelModal({ open: false, sheetId: '', search: '', selectedIds: [] })}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Recherche */}
              <div className="p-4 border-b border-gray-100">
                <div className="relative">
                  <input
                    type="text"
                    value={addParcelModal.search}
                    onChange={e => setAddParcelModal(m => ({ ...m, search: e.target.value }))}
                    placeholder="Rechercher par N° EXP (NIC), expéditeur ou destinataire..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Liste des colis */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredParcels.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Aucun colis disponible</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredParcels.map(parcel => {
                      const isSelected = addParcelModal.selectedIds.includes(parcel.id)
                      return (
                        <label
                          key={parcel.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                            isSelected
                              ? 'bg-green-50 border-green-300'
                              : 'bg-white border-gray-100 hover:border-green-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              setAddParcelModal(m => ({
                                ...m,
                                selectedIds: e.target.checked
                                  ? [...m.selectedIds, parcel.id]
                                  : m.selectedIds.filter(id => id !== parcel.id)
                              }))
                            }}
                            className="w-5 h-5 accent-green-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-mono font-bold text-blue-600 text-sm">{parcel.sender?.nic || 'N/A'}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                              <span className="truncate">{parcel.receiver?.name || '-'}</span>
                              <span>•</span>
                              <span>{parcel.receiver?.city || '-'}</span>
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <p className="font-semibold text-gray-700">{parcel.status}</p>
                            {parcel.codAmount > 0 && (
                              <p className="text-orange-600 font-bold">{parcel.codAmount} DH</p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">
                    {selectedCount > 0 ? (
                      <span className="font-bold text-green-600">{selectedCount} colis sélectionné(s)</span>
                    ) : (
                      <span>Sélectionnez des colis à ajouter</span>
                    )}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAddParcelModal({ open: false, sheetId: '', search: '', selectedIds: [] })}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-100 transition"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleAddParcels}
                      disabled={selectedCount === 0}
                      className="px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter {selectedCount > 0 && `(${selectedCount})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
