import {
  AlertTriangle, Banknote, Calendar, Car, Check, CheckSquare,
  ChevronDown, ChevronLeft, ChevronRight, Edit2, Filter,
  LayoutGrid, Lock, Package, Printer, Search, Table2, Trash2, Truck,
  Unlock, User, X,
} from 'lucide-react'
import { useState } from 'react'
import { deleteField } from 'firebase/firestore'
import {
  loadReturnedParcelOnTruck, validateReturnArrival, getMoreAgentParcels,
} from '../../../firebase/firestore'
import { isInReturnCircuit, updateParcel } from '../../../firebase/parcels'
import {
  STATUSES, STATUS_COLORS, COD_PAYMENT_TYPES, COD_STATUS, codCollectedLabel,
  CITIES,
} from '../../../firebase/constants'
import { useAgentCtx } from '../AgentCtx'

import { parcelDate, filterByDate } from '../../../utils/dateFilter'

const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const matchesSearch = (values: any, query: any) => {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = String(v ?? '').toLowerCase()
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function ParcelsTab() {
  const {
    // Identity
    uid, profile,

    // Style helpers
    inputCls, selectCls,

    // Parcel data
    allDisplayParcels,
    filteredParcels,
    loadingParcels,
    hasMoreParcels, setHasMoreParcels,
    loadingMore, setLoadingMore,
    setExtraParcels,

    // Search / filters
    search, setSearch,
    datePreset, setDatePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    parcelDirection, setParcelDirection,
    serviceFilter, setServiceFilter,
    parcelStatusFilter, setParcelStatusFilter,
    parcelEditorFilter, setParcelEditorFilter,
    destinationCityFilter, setDestinationCityFilter,  // ⭐ Filtre ville de destination
    driverFilter, setDriverFilter,  // ⭐ Filtre par livreur
    showFilters, setShowFilters,
    subTab, setSubTab,
    parcelPage, setParcelPage,

    // Azerty fix (component-level, in context)
    needsAzertyFix, azertyFix,

    // Parcel logic helpers
    canActAsParcelOwner,
    canEditParcelDetails,
    canManageStatus,
    canManageReturnDelivery,
    isReturnOriginCity,
    canManageDeliveryAssignment,
    isPointedForDelivery,
    canLoadTransportParcel,
    isPendingAideParcelForAgency,
    isParcelCreator,
    isChefAgencyAideParcel,
    isAideParcelLockedForEdit,

    // Aide agents
    aideAgents,

    // Action handlers
    handlePrintTicket,
    handlePrintTable,
    handleEditClick,
    handleDeleteClick,
    handleReturnDirect,
    handleValidateParcelEntry,
    handleBulkValidateAideEntries,
    handleToggleAideParcelAccess,
    handleCodeVerify,
    handleEditSave,
    handleAssignTransport,
    handleAssignDelivery,
    handleBulkLoadTransport,

    // State: bulk transport load
    bulkLoadSelectedIds, setBulkLoadSelectedIds,
    bulkLoadName, setBulkLoadName,
    bulkLoadPhone, setBulkLoadPhone,
    bulkLoadBusy,
    bulkLoadError, setBulkLoadError,

    // State: aide bulk validation
    selectedAideEntryIds, setSelectedAideEntryIds,
    bulkAideValidating,
    bulkAideValidationError, setBulkAideValidationError,

    // State: transport modal
    transportModal, setTransportModal,

    // State: delivery modal
    deliveryModal, setDeliveryModal,

    // State: edit modal
    editingParcel, setEditingParcel,
    editForm, setEditForm,
    editLoading,
    editError,
    ef,

    // State: code modal
    codeModal, setCodeModal,

    // State: truck / return loading
    loadingTruckId, setLoadingTruckId,
    validatingReturnId, setValidatingReturnId,

    // State: signature
    setViewSignature,

    // State: validation
    validatingEntryId,
    togglingAideAccessId,

    // State: price helper
    price,

    // Drivers / sectors / vehicles
    drivers,
    allSectors,
    vehicles,

    // Returner
    returningParcelId,
    RETURN_REASONS,
    returnReasonModal, setReturnReasonModal,
    submitReturnWithReason,
  } = useAgentCtx()

  const PAGE_SIZE = 25

  // Sécurité : s'assurer que les tableaux ne sont jamais undefined
  const safeParcels = filteredParcels || []

  // ⭐ Calculer les villes de destination disponibles
  const availableDestCities = (() => {
    const cities = new Set<string>()
    const parcels = allDisplayParcels || []
    parcels.forEach((p: any) => {
      const destCity = p.destinationCity || p.receiver?.city
      if (destCity) cities.add(destCity)
    })
    return Array.from(cities).sort()
  })()

  // ⭐ Calculer les livreurs/chauffeurs disponibles (ceux qui ont des colis assignés dans la ville de l'agent)
  const availableDrivers = (() => {
    const driverIds = new Set<string>()
    const parcels = allDisplayParcels || []
    const agentCity = profile?.city

    parcels.forEach((p: any) => {
      if (p.deliveryDriverId) driverIds.add(p.deliveryDriverId)
      if (p.chauffeurId) driverIds.add(p.chauffeurId)
    })

    return (drivers || [])
      .filter((d: any) =>
        driverIds.has(d.id) &&
        (!agentCity || d.city === agentCity)  // Filtrer par ville de l'agent
      )
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  })()

  // État pour basculer entre vue cartes et vue tableau
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  return (
    <>
      <div className="mt-4 space-y-3">
        {/* Sub-tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 flex-1">
            <button onClick={() => setSubTab('mine')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {profile?.role === 'chef_agence' ? 'Mes créations' : 'Mes colis'}
            </button>
            <button onClick={() => setSubTab('all')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {profile?.role === 'chef_agence' ? "Toute l'agence" : 'Tous les colis'}
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-2.5 py-2 bg-white border border-gray-200 rounded-xl">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
          </span>
        </div>

        {/* Search */}
        {<div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            placeholder="Rechercher (ID, nom, ville, N EXP…)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // La douchette finit toujours par Entrée → corriger AZERTY→QWERTY ici
                const fixed = needsAzertyFix(search) ? azertyFix(search) : search
                if (fixed !== search) setSearch(fixed)
              }
            }}
            className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>}

        {/* ── TOGGLE FILTRES ── */}
        {(() => {
          const activeCount = [
            parcelDirection !== 'all',
            serviceFilter !== 'all',
            parcelStatusFilter !== 'all',
            destinationCityFilter !== 'all',
            driverFilter !== 'all',
            datePreset !== 'all',
          ].filter(Boolean).length
          return (
            <div className="space-y-2">
              <button
                onClick={() => setShowFilters((v: any) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-400 hover:bg-blue-50 transition group"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition" />
                  <span className="text-xs font-semibold text-gray-600 group-hover:text-blue-600 transition">Filtres</span>
                  {activeCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold">
                      {activeCount}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                  {/* Direction */}
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Direction</span>
                    {[
                      { key: 'all', label: 'Tous' },
                      { key: 'sent', label: 'Envoyés' },
                      { key: 'received', label: 'Reçus' },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => setParcelDirection(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          parcelDirection === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{label}</button>
                    ))}
                  </div>

                  {/* ⭐ Agence de destination */}
                  {availableDestCities.length > 0 && (
                    <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Dest.</span>
                      <button onClick={() => setDestinationCityFilter('all')}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          destinationCityFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >Toutes</button>
                      {availableDestCities.map(city => (
                        <button key={city} onClick={() => setDestinationCityFilter(city)}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                            destinationCityFilter === city ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{city}</button>
                      ))}
                    </div>
                  )}

                  {/* ⭐ Filtre par livreur/chauffeur */}
                  {availableDrivers.length > 0 && (
                    <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Livreur</span>
                      <button onClick={() => setDriverFilter('all')}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          driverFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >Tous</button>
                      {availableDrivers.map((driver: any) => (
                        <button key={driver.id} onClick={() => setDriverFilter(driver.id)}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                            driverFilter === driver.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{driver.name}</button>
                      ))}
                    </div>
                  )}

                  {/* Encaissement */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Encaiss.</span>
                    {[{ key: 'all', label: 'Tous', emoji: '' }, ...SERVICE_TYPES].map(({ key, label, emoji }) => (
                      <button key={key} onClick={() => setServiceFilter(key)}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${
                          serviceFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >{emoji ? `${emoji} ${label}` : label}</button>
                    ))}
                  </div>

                  {/* Statut */}
                  <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Statut</span>
                    <button onClick={() => setParcelStatusFilter('all')}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap ${parcelStatusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >Tous</button>
                    {STATUSES.map(s => {
                      const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                      const active = parcelStatusFilter === s
                      return (
                        <button key={s} onClick={() => setParcelStatusFilter(s)}
                          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap border ${
                            active ? `${sc.bg} ${sc.text} border-current` : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {s}
                        </button>
                      )
                    })}
                  </div>

                  {/* Date */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Date</span>
                      {[
                        { key: 'all',    label: 'Tout' },
                        { key: 'today',  label: "Auj." },
                        { key: 'week',   label: '7 j' },
                        { key: 'month',  label: 'Mois' },
                        { key: 'day',    label: 'Jour' },
                        { key: 'custom', label: 'Période' },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => setDatePreset(key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            datePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    {datePreset === 'day' && (
                      <div className="flex items-center gap-2 pl-20">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                      </div>
                    )}
                    {datePreset === 'custom' && (
                      <div className="flex items-center gap-2 pl-20">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                        <span className="text-gray-400 text-xs shrink-0">→</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                        />
                      </div>
                    )}
                  </div>

                  {/* Reset si filtres actifs */}
                  {activeCount > 0 && (
                    <div className="px-4 py-2.5 bg-gray-50 flex justify-end">
                      <button
                        onClick={() => { setParcelDirection('all'); setServiceFilter('all'); setParcelStatusFilter('all'); setParcelEditorFilter('all'); setDatePreset('all') }}
                        className="text-[10px] text-red-500 hover:text-red-700 font-semibold transition"
                      >
                        ✕ Réinitialiser les filtres
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          const loadableParcels = filteredParcels.filter(canLoadTransportParcel)
          const selectedCount = bulkLoadSelectedIds.filter((id: any) => loadableParcels.some((p: any) => p.id === id)).length
          const allSelected = loadableParcels.length > 0 && selectedCount === loadableParcels.length
          const aideValidationParcels = profile?.role === 'chef_agence'
            ? filteredParcels.filter(isPendingAideParcelForAgency)
            : []

          const selectedAideCount = selectedAideEntryIds.filter((id: any) => aideValidationParcels.some((p: any) => p.id === id)).length
          const allAideSelected = aideValidationParcels.length > 0 && selectedAideCount === aideValidationParcels.length
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-gray-400">{filteredParcels.length} expédition(s)</p>
                <div className="flex items-center gap-2">
                  {/* Toggle vue cartes / tableau */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        viewMode === 'cards'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Cartes
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        viewMode === 'table'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      Tableau
                    </button>
                  </div>

                  {/* Bouton imprimer */}
                  <button
                    onClick={() => {
                      const selectedDriver = driverFilter !== 'all'
                        ? availableDrivers.find((d: any) => d.id === driverFilter)
                        : null
                      handlePrintTable(filteredParcels, selectedDriver?.name)
                    }}
                    disabled={filteredParcels.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimer
                  </button>
                </div>
              </div>

              {/* NOUVELLE POLITIQUE : Plus de validation nécessaire - section retirée */}

              {loadableParcels.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                        <Truck className="w-4 h-4" /> Chargement camion groupé
                      </h3>
                      <p className="text-xs text-blue-500 mt-0.5">
                        {selectedCount} sélectionné(s) sur {loadableParcels.length} colis au dépôt source
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkLoadError('')
                          setBulkLoadSelectedIds(allSelected ? [] : loadableParcels.map((p: any) => p.id))
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          allSelected
                            ? 'bg-white text-blue-700 border-blue-300'
                            : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {allSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                      </button>
                      {/* ⭐ Bouton pour sélectionner uniquement les colis de la ville filtrée */}
                      {destinationCityFilter !== 'all' && (() => {
                        const cityLoadables = loadableParcels.filter((p: any) => {
                          const destCity = p.destinationCity || p.receiver?.city
                          return destCity === destinationCityFilter
                        })
                        const citySelectedCount = bulkLoadSelectedIds.filter((id: any) =>
                          cityLoadables.some((p: any) => p.id === id)
                        ).length
                        const allCitySelected = cityLoadables.length > 0 && citySelectedCount === cityLoadables.length
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setBulkLoadError('')
                              setBulkLoadSelectedIds(allCitySelected ? [] : cityLoadables.map((p: any) => p.id))
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                              allCitySelected
                                ? 'bg-white text-orange-700 border-orange-300'
                                : 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700'
                            }`}
                          >
                            {allCitySelected ? `Désélect. ${destinationCityFilter}` : `Sélect. ${destinationCityFilter} (${cityLoadables.length})`}
                          </button>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-white border border-blue-100 rounded-xl px-3 py-2">
                      <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">Nom du chauffeur *</label>
                      <input
                        type="text"
                        value={bulkLoadName}
                        onChange={e => { setBulkLoadError(''); setBulkLoadName(e.target.value) }}
                        placeholder="Ex: Mohammed Alami"
                        className="w-full text-sm font-semibold text-gray-800 focus:outline-none bg-transparent"
                      />
                    </div>
                    <div className="bg-white border border-blue-100 rounded-xl px-3 py-2">
                      <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">Téléphone</label>
                      <input
                        type="tel"
                        value={bulkLoadPhone}
                        onChange={e => setBulkLoadPhone(e.target.value)}
                        placeholder="Ex: 0661 23 45 67"
                        className="w-full text-sm text-gray-700 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs font-semibold text-blue-600">
                      {selectedCount} colis sélectionné(s)
                    </p>
                    {bulkLoadError && <p className="text-xs font-semibold text-red-600">{bulkLoadError}</p>}
                    <button
                      type="button"
                      onClick={() => handleBulkLoadTransport(loadableParcels)}
                      disabled={bulkLoadBusy || selectedCount === 0}
                      className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold transition"
                    >
                      {bulkLoadBusy
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                        : <><Truck className="w-4 h-4" /> Charger les colis</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {(loadingParcels ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune expédition trouvée</p>
          </div>
        ) : (() => {
          const totalPages = Math.max(1, Math.ceil(filteredParcels.length / PAGE_SIZE))
          const safePage = Math.min(parcelPage, totalPages - 1)
          const pagedParcels = filteredParcels.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
          const isLastPage = safePage >= totalPages - 1
          return viewMode === 'table' ? (
            // ═══════════════════════════════════════════════════════════════════
            // VUE TABLEAU (Excel-like avec scroll horizontal)
            // ═══════════════════════════════════════════════════════════════════
            <div className="space-y-4">
              <div className="overflow-x-auto bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 rounded-2xl shadow-xl border-2 border-purple-200">
                <table className="w-full text-xs">
                  <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white sticky top-0 shadow-lg">
                    <tr>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          N° EXP
                        </div>
                      </th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Date
                        </div>
                      </th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-blue-400/30">Statut</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">
                        <div className="flex items-center gap-1">
                          📤 Expéditeur
                        </div>
                      </th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">Tél Exp.</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30 bg-blue-600/30">Ville Exp.</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">
                        <div className="flex items-center gap-1">
                          📥 Destinataire
                        </div>
                      </th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">Tél Dest.</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">Ville Dest.</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-pink-400/30 bg-pink-600/30">Adresse</th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30">Service</th>
                      <th className="px-4 py-4 text-center font-bold whitespace-nowrap border-r border-purple-400/30">Nb Colis</th>
                      <th className="px-4 py-4 text-center font-bold whitespace-nowrap border-r border-purple-400/30">Poids</th>
                      <th className="px-4 py-4 text-right font-bold whitespace-nowrap border-r border-purple-400/30 bg-green-600/30">
                        <div className="flex items-center justify-end gap-1">
                          💰 Port
                        </div>
                      </th>
                      <th className="px-4 py-4 text-right font-bold whitespace-nowrap border-r border-purple-400/30 bg-green-600/30">
                        <div className="flex items-center justify-end gap-1">
                          💵 COD
                        </div>
                      </th>
                      <th className="px-4 py-4 text-left font-bold whitespace-nowrap border-r border-purple-400/30">
                        <div className="flex items-center gap-1">
                          🚚 Livreur
                        </div>
                      </th>
                      <th className="px-4 py-4 text-center font-bold whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {pagedParcels.map((parcel: any, idx: number) => {
                      const isOwn = canActAsParcelOwner(parcel)
                      const sc = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                      const serviceType = SERVICE_TYPES.find(st => st.key === parcel.serviceType)
                      const driver = drivers?.find((d: any) => d.id === parcel.deliveryDriverId || d.id === parcel.chauffeurId)

                      return (
                        <tr
                          key={parcel.id}
                          className={`border-b border-gray-100 transition-all hover:shadow-lg hover:scale-[1.01] hover:z-10 relative ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30'
                          } ${isOwn ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-orange-400'}`}
                        >
                          <td className="px-4 py-3 font-mono font-black text-blue-600 whitespace-nowrap text-sm border-r border-gray-100">
                            {parcel.sender?.nic || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                            <span className="text-gray-600 font-medium">
                              {parcel.createdAt ? new Date(parcel.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                            <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm ${sc}`}>
                              {parcel.status || 'Initialisé'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[200px] truncate border-r border-gray-100 bg-blue-50/30">
                            {parcel.sender?.name || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap border-r border-gray-100 bg-blue-50/30">
                            {parcel.sender?.tel || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100 bg-blue-50/30">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                              📍 {parcel.sender?.city || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[200px] truncate border-r border-gray-100 bg-pink-50/30">
                            {parcel.receiver?.name || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap border-r border-gray-100 bg-pink-50/30">
                            {parcel.receiver?.tel || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100 bg-pink-50/30">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 text-pink-700 rounded-lg text-xs font-semibold">
                              📍 {parcel.receiver?.city || parcel.destinationCity || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap max-w-[250px] truncate border-r border-gray-100 bg-pink-50/30">
                            {parcel.enGare ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 text-orange-700 rounded-lg font-bold">
                                🚉 En gare
                              </span>
                            ) : (
                              <span className="text-gray-600">{parcel.receiver?.address || '—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg font-semibold">
                              {serviceType?.emoji} {serviceType?.label || 'Simple'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center border-r border-gray-100">
                            <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg font-bold">
                              {parcel.nbColis || 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center border-r border-gray-100">
                            <span className="text-gray-700 font-semibold">
                              {parcel.weight ? `${parcel.weight} kg` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold whitespace-nowrap border-r border-gray-100 bg-green-50/30">
                            <span className="text-green-700 text-sm">
                              {parcel.price ? `${parcel.price} DH` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold whitespace-nowrap border-r border-gray-100 bg-green-50/30">
                            {parcel.codAmount && parcel.codAmount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-lg text-sm font-black">
                                💰 {parcel.codAmount} DH
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap max-w-[150px] truncate border-r border-gray-100">
                            {driver?.name ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-lg font-semibold">
                                🚚 {driver.name}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">Non assigné</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handlePrintTicket(parcel)}
                                className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all transform hover:scale-110"
                                title="Imprimer"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {canEditParcelDetails(parcel) && (
                                <button
                                  onClick={() => handleEditClick(parcel)}
                                  className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all transform hover:scale-110"
                                  title="Modifier"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {isOwn && (
                                <button
                                  onClick={() => handleDeleteClick(parcel)}
                                  className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md hover:shadow-lg transition-all transform hover:scale-110"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination pour vue tableau */}
              {filteredParcels.length > PAGE_SIZE && (() => {
                const goTo = (p: number) => { setParcelPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
                const pages: number[] = []
                for (let i = 0; i < totalPages; i++) {
                  if (i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1) pages.push(i)
                }
                const items: (number | string)[] = []
                pages.forEach((p, idx) => {
                  if (idx > 0 && p - pages[idx - 1] > 1) items.push('…')
                  items.push(p)
                })
                return (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400">
                      {filteredParcels.length}{hasMoreParcels ? '+' : ''} expédition{filteredParcels.length > 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => goTo(Math.max(0, safePage - 1))} disabled={safePage === 0}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>

                      {items.map((item, idx) =>
                        item === '…'
                          ? <span key={`dots-${idx}`} className="px-1 text-gray-400 text-sm select-none">…</span>
                          : <button key={item} onClick={() => goTo(Number(item))}
                              className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition border ${
                                item === safePage
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                              }`}
                            >{Number(item) + 1}</button>
                      )}

                      <button onClick={() => goTo(Math.min(totalPages - 1, safePage + 1))} disabled={isLastPage}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                    </div>
                    <span className="text-xs text-gray-400">Page {safePage + 1} / {totalPages}</span>
                  </div>
                )
              })()}
            </div>
          ) : (
            // ═══════════════════════════════════════════════════════════════════
            // VUE CARTES (existante)
            // ═══════════════════════════════════════════════════════════════════
          <div className="space-y-2">
            {pagedParcels.map((parcel: any) => {
              const isOwn = canActAsParcelOwner(parcel)
              const isAideManagedByChef = !isParcelCreator(parcel) && isChefAgencyAideParcel(parcel)
              const sc    = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
              const canLoadTransport = canLoadTransportParcel(parcel)
              const bulkSelected = bulkLoadSelectedIds.includes(parcel.id)
              const canSelectAideValidation = profile?.role === 'chef_agence' && isPendingAideParcelForAgency(parcel)
              const aideValidationSelected = selectedAideEntryIds.includes(parcel.id)


              return (
                <div key={parcel.id}
                  className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${isOwn ? 'border-l-blue-500 border border-blue-100' : 'border-l-orange-400 border border-orange-100'}`}
                >
                  {/* NOUVELLE POLITIQUE : Plus de sélection validation nécessaire */}
                  {canLoadTransport && (
                    <label className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                      bulkSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={bulkSelected}
                        onChange={e => {
                          setBulkLoadError('')
                          setBulkLoadSelectedIds((prev: any) => e.target.checked
                            ? [...new Set([...prev, parcel.id])]
                            : prev.filter((id: any) => id !== parcel.id)
                          )
                        }}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-xs font-bold">Sélection chargement camion</span>
                    </label>
                  )}
                  {/* Agent badge */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${isOwn ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                      <User className="w-3 h-3" />
                      {isAideManagedByChef
                        ? `${parcel.agentRole === 'client_portal' ? 'Portail client' : 'Aide agent'} (${parcel.agentName || 'saisie agence'})`
                        : isOwn ? `Moi (${profile?.name || 'vous'})` : (parcel.agentName || 'Autre agent')}
                      {!isOwn && <Lock className="w-3 h-3 ml-0.5 opacity-60" />}
                    </div>
                    {/* NOUVEAU : Indicateur verrouillage pour aide-agent */}
                    {profile?.role === 'aide_agent' && isAideParcelLockedForEdit(parcel) && (
                      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold bg-red-100 text-red-700 border border-red-200">
                        <Lock className="w-3 h-3" />
                        Verrouillé (chargé)
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {parcel.sender?.nic && (
                          <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            N EXP {parcel.sender.nic}
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold text-gray-700">{parcel.trackingId}</span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {parcel.status}
                        </span>
                        {isInReturnCircuit(parcel) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-300">
                            🔄 RETOURNÉ
                          </span>
                        )}
                        {parcel.hasRetourBL && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 border border-blue-300">
                            🧾 Retour BL
                          </span>
                        )}
                        {(() => {
                          const stDef = SERVICE_TYPES.find(t => t.key === parcel.serviceType)
                          if (!stDef) return null
                          const colors: Record<string, string> = {
                            simple:    'bg-gray-100 text-gray-600',
                            especes:   'bg-green-100 text-green-700',
                            cheque:    'bg-blue-100 text-blue-700',
                            traite:    'bg-indigo-100 text-indigo-700',
                            retour_bl: 'bg-amber-100 text-amber-700',
                          }
                          return (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${colors[parcel.serviceType] || 'bg-gray-100 text-gray-600'}`}>
                              {stDef.emoji} {stDef.label}
                            </span>
                          )
                        })()}
                        {parcel.returnedAt && parcel.status === 'Livré' && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                            ↩️ Retourné à l'expéditeur
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                        <span className="truncate">{parcel.sender?.city}</span>
                        <span className="text-gray-400 shrink-0">→</span>
                        <span className="truncate">{parcel.receiver?.city}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {parcel.receiver?.name} · {parcel.weight} kg · <span className="font-semibold text-gray-500">{parcel.price} DH</span>
                        {parcel.codAmount > 0 && <span className="text-orange-500 font-medium"> · RETOUR FOND {parcel.codAmount} DH</span>}
                      </div>
                      {(parcel.natureOfGoods || (parcel.arrivedNbColis ?? parcel.nbColis) > 1 || parcel.hasRetourBL) && (
                        <div className="mt-1 flex items-center gap-2">
                          {parcel.natureOfGoods && (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                              📦 {parcel.natureOfGoods}
                            </span>
                          )}
                          {(parcel.arrivedNbColis ?? parcel.nbColis) > 1 && (
                            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-medium">
                              × {parcel.arrivedNbColis ?? parcel.nbColis} colis
                              {parcel.arrivedNbColis != null && parcel.arrivedNbColis < parcel.nbColis && (
                                <span className="text-orange-500 font-bold">/{parcel.nbColis}</span>
                              )}
                            </span>
                          )}
                          {parcel.hasRetourBL && (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                              🧾 Retour BL
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                        {parcel.sender?.tel && <span>📤 {parcel.sender.tel}</span>}
                        {parcel.receiver?.tel && <span>📥 {parcel.receiver.tel}</span>}
                      </div>
                      {(parcel.sender?.address || parcel.receiver?.address) && (
                        <div className="mt-1.5 space-y-0.5">
                          {parcel.sender?.address && (
                            <div className="text-xs text-gray-500 flex items-start gap-1">
                              <span className="shrink-0 text-blue-400">📤</span>
                              <span>{parcel.sender.address}{parcel.sender.city ? `, ${parcel.sender.city}` : ''}</span>
                            </div>
                          )}
                          {parcel.enGare ? (
                            <div className="text-xs flex items-center gap-1.5 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 rounded-lg px-2 py-1.5">
                              <span className="text-lg">🚉</span>
                              <span className="font-bold text-orange-700">Livraison en gare</span>
                            </div>
                          ) : parcel.receiver?.address && (
                            <div className="text-xs text-gray-500 flex items-start gap-1">
                              <span className="shrink-0 text-orange-400">📥</span>
                              <span>{parcel.receiver.address}{parcel.receiver.city ? `, ${parcel.receiver.city}` : ''}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {parcel.returnedAt && (
                        <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-orange-700">↩️ Historique retour</span>
                            <span className="text-[10px] text-orange-500">{new Date(parcel.returnedAt).toLocaleDateString('fr-MA')}</span>
                          </div>
                          {parcel.returnReason && (
                            <p className="text-[11px] text-orange-600 leading-snug">Raison : {parcel.returnReason}</p>
                          )}
                        </div>
                      )}
                      {parcel.chauffeurName && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200">
                          <Truck className="w-3 h-3" /> {parcel.chauffeurName}{parcel.chauffeurPhone ? ` · ${parcel.chauffeurPhone}` : ''}
                        </div>
                      )}
                      {parcel.deliveryDriverName && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">
                          <User className="w-3 h-3" /> Livraison : {parcel.deliveryDriverName}
                        </div>
                      )}
                      {(parcel.deliverySectorCode || parcel.deliveryVehicleLabel) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {parcel.deliverySectorCode && (
                            <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                              <LayoutGrid className="w-3 h-3" /> Secteur {parcel.deliverySectorCode}
                            </span>
                          )}
                          {parcel.deliveryVehicleLabel && (
                            <span className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                              <Car className="w-3 h-3" /> {parcel.deliveryVehicleLabel}
                            </span>
                          )}
                        </div>
                      )}
                      {parcel.codAmount > 0 && (() => {
                        const cs  = parcel.codSenderPaid
                          ? { label: 'Réglé ✓', bg: 'bg-green-100', text: 'text-green-700' }
                          : parcel.codReceivedBySource && !parcel.codSenderPaid
                          ? { label: 'Reçu — à régler', bg: 'bg-purple-100', text: 'text-purple-700' }
                          : parcel.codSentToSource && !parcel.codReceivedBySource
                          ? { label: 'En transit source', bg: 'bg-blue-100', text: 'text-blue-700' }
                          : COD_STATUS[parcel.codStatus || 'pending']
                        const cpt = COD_PAYMENT_TYPES.find(t => t.key === (parcel.codPaymentType || parcel.serviceType))
                        const st  = SERVICE_TYPES.find(t => t.key === parcel.serviceType)
                        const emoji = cpt?.emoji || st?.emoji || '💵'
                        // Ne pas afficher "Livré" si c'est un retour
                        const isReturn = parcel.wasReturned || parcel.status?.includes('Retourné')
                        const isCollected = parcel.codStatus === 'collected' && !isReturn
                        const dispBg  = isCollected && cpt ? cpt.bg   : cs.bg
                        const dispTxt = isCollected && cpt ? cpt.text : cs.text
                        const lbl = isCollected
                          ? codCollectedLabel(parcel.codPaymentType || parcel.serviceType)
                          : cs.label
                        return (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${dispBg} ${dispTxt} border border-current/20`}>
                            {emoji} RETOUR FOND {parcel.codAmount} DH — {lbl}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handlePrintTicket(parcel)}
                        className="flex items-center gap-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-500 px-2.5 py-2 rounded-lg transition"
                        title="Imprimer le bon de ramassage"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {parcel.signatureConfirmedAt && (
                        <button
                          onClick={() => setViewSignature(parcel)}
                          className="flex items-center gap-1 text-xs bg-violet-50 hover:bg-violet-100 text-violet-600 px-2.5 py-2 rounded-lg transition"
                          title="Voir la signature électronique"
                        >
                          ✍️
                        </button>
                      )}
                      {canEditParcelDetails(parcel) ? (
                        <>
                          <button
                            onClick={() => handleEditClick(parcel)}
                            className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg transition bg-blue-50 hover:bg-blue-100 text-blue-600"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteClick(parcel)}
                            className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-2.5 py-2 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-500 px-2.5 py-2 rounded-lg border border-gray-100">
                          <Lock className="w-3.5 h-3.5" />
                          Lecture seule
                        </span>
                      )}
                    </div>
                  </div>

                  {!isOwn && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Bon consultable uniquement : modification reservee au createur.
                    </div>
                  )}

                  {/* Lock indicator — origin agent can't manage status */}
                  {!canManageStatus(parcel) && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Statut géré par <span className="font-semibold ml-0.5">l'Agence de {parcel.destinationCity}</span>
                    </div>
                  )}

                  {/* Port dû — badge */}
                  {parcel.portType === 'port_du' && (
                    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                      parcel.portStatus === 'collected'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}>
                      📮 Port dû {parcel.price > 0 ? `${parcel.price} DH` : ''}
                      {parcel.portStatus === 'collected'
                        ? ' — Encaissé ✓'
                        : ' — À encaisser'}
                    </div>
                  )}

                  {/* En compte — badge */}
                  {parcel.portType === 'port_en_compte' && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border bg-purple-50 text-purple-700 border-purple-200">
                      🗂️ En compte {parcel.price > 0 ? `${parcel.price} DH` : ''}
                    </div>
                  )}

                  {/* RETOUR FOND collect — destination agent collects RETOUR FOND when client picks up at agency */}
                  {canLoadTransport && (
                    <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-blue-700">Colis au depot source</p>
                        <p className="text-xs text-blue-500 mt-0.5">Choisir un chauffeur pour charger vers {parcel.destinationCity || parcel.receiver?.city}</p>
                      </div>
                      {/* ⭐ Bouton change selon si un chauffeur est déjà assigné */}
                      {(() => {
                        const hasDriver = !!(parcel.chauffeurName || parcel.driverAssigned)
                        return (
                          <button
                            onClick={() => setTransportModal({ open: true, parcel, driverId: '', loading: false, error: '' })}
                            className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold transition ${
                              hasDriver
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            <Truck className="w-3.5 h-3.5" /> {hasDriver ? 'Changer camion' : 'Charger camion'}
                          </button>
                        )
                      })()}
                    </div>
                  )}

                  {/* RETOUR FOND collecté par le livreur — validation directe par le chef */}
                  {parcel.codAmount > 0 && parcel.codStatus === 'collected' && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Banknote className="w-3 h-3 shrink-0" />
                      💰 RETOUR FOND collecté par {parcel.codCollectedBy || 'le livreur'} — en attente du chef d'agence
                    </div>
                  )}

                  {/* Validation saisie aide_agent / portail client — pour le chef */}
                  {profile?.role === 'chef_agence' && ['aide_agent', 'client_portal'].includes(parcel.agentRole) && parcel.validatedByChef === false && ((parcel.originCity || parcel.sender?.city || '') === profile?.city || aideAgents.some((a: any) => a.id === (parcel.aideAgentId || parcel.agentId) && a.city === profile?.city)) && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{parcel.agentRole === 'client_portal' ? '👤' : '✏️'}</span>
                          <div>
                            <p className="text-xs font-bold text-amber-800">{parcel.agentRole === 'client_portal' ? 'Demande portail client' : 'Saisie aide agent'} — à valider</p>
                            <p className="text-[11px] text-amber-600">Saisi par : {parcel.agentName}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleValidateParcelEntry(parcel)}
                          disabled={validatingEntryId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg transition"
                        >
                          {validatingEntryId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Validation...</>
                            : <>✅ Valider la saisie</>
                          }
                        </button>
                      </div>
                    </div>
                  )}
                  {parcel.validatedByChef === true && ['aide_agent', 'client_portal'].includes(parcel.agentRole) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                        ✅ Validé par {parcel.validatedByName}
                      </span>
                      {isChefAgencyAideParcel(parcel) && (
                        <button
                          onClick={() => handleToggleAideParcelAccess(parcel)}
                          disabled={togglingAideAccessId === parcel.id}
                          className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold border transition disabled:opacity-60 ${
                            parcel.aideEditUnlocked === true
                              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {togglingAideAccessId === parcel.id ? (
                            <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          ) : parcel.aideEditUnlocked === true ? (
                            <Unlock className="w-3 h-3" />
                          ) : (
                            <Lock className="w-3 h-3" />
                          )}
                          {parcel.aideEditUnlocked === true ? 'Accès aide ouvert' : 'Accès aide verrouillé'}
                        </button>
                      )}
                    </div>
                  )}
                  {profile?.role === 'aide_agent' && parcel.agentRole === 'aide_agent' && parcel.validatedByChef === false && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                        ⏳ En attente de validation
                      </span>
                    </div>
                  )}
                  {profile?.role === 'aide_agent' && parcel.agentRole === 'aide_agent' && parcel.validatedByChef === true && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        parcel.aideEditUnlocked === true
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {parcel.aideEditUnlocked === true ? 'Accès réouvert par le chef' : 'Verrouillé après validation'}
                      </span>
                    </div>
                  )}

                  {/* Retour direct — UNIQUEMENT pour l'agence de DESTINATION sur colis Livré */}
                  {(() => {
                    const isInDestinationAgency = profile?.city && (
                      profile.city === parcel.destinationCity ||
                      profile.city === parcel.receiver?.city
                    )
                    const canReturn = isInDestinationAgency && parcel.status === 'Livré'

                    return canReturn ? (
                      <div className="mt-3 pt-3 border-t border-red-100">
                        <button
                          onClick={() => handleReturnDirect(parcel)}
                          disabled={returningParcelId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-semibold py-2.5 rounded-xl border border-red-200 transition"
                        >
                          {returningParcelId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> Retour en cours...</>
                            : <>↩️ Retourner ce colis</>
                          }
                        </button>
                      </div>
                    ) : null
                  })()}

                  {/* Bandeau retour en transit — agence physique du colis (doit l'expédier vers l'expéditeur) */}
                  {parcel.status === 'Retourné' && isReturnOriginCity(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">🚚</span>
                          <div>
                            <p className="text-xs font-bold text-orange-800">Colis retourné — à expédier</p>
                            <p className="text-[11px] text-orange-700 mt-0.5 leading-snug">
                              Charger ce colis sur le camion inter-villes vers <span className="font-bold">{parcel.returnToCity || parcel.originCity}</span> puis confirmer ci-dessous.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Réessayer la livraison de ce colis ?\n${parcel.trackingId}\n\nLe colis sera remis en circulation pour une nouvelle tentative de livraison.`)) return
                              setLoadingTruckId(parcel.id)
                              try {
                                console.log('🔄 Réessai livraison - AVANT:', {
                                  status: parcel.status,
                                  wasReturned: parcel.wasReturned,
                                  returnToCity: parcel.returnToCity
                                })
                                await updateParcel(parcel.id, {
                                  status: 'En livraison',
                                  wasReturned: deleteField(),
                                  returnedAt: deleteField(),
                                  returnReason: deleteField(),
                                  returnToCity: deleteField(),
                                  loadedOnTruckAt: deleteField(),
                                  loadedOnTruckBy: deleteField(),
                                  returnLoadedAt: deleteField(),
                                  returnLoadedBy: deleteField(),
                                  retryDeliveryAt: new Date(),
                                  retryDeliveryBy: profile?.name || profile?.email || 'Inconnu'
                                })
                                console.log('✅ Réessai livraison - Mise à jour réussie')
                                alert('✅ Colis remis en livraison !\n\nRafraîchissez la page pour voir les changements.')
                              }
                              catch (e: any) {
                                console.error('❌ Erreur réessai:', e)
                                alert('Erreur : ' + (e?.message || e))
                              }
                              finally { setLoadingTruckId(null) }
                            }}
                            disabled={loadingTruckId === parcel.id}
                            className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                          >
                            {loadingTruckId === parcel.id
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                              : <>🔄 Réessayer</>
                            }
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Confirmer le chargement de ce colis sur le camion vers ${parcel.returnToCity || parcel.originCity} ?\n${parcel.trackingId}`)) return
                              setLoadingTruckId(parcel.id)
                              try { await loadReturnedParcelOnTruck(parcel) }
                              catch (e: any) { alert('Erreur : ' + (e?.message || e)) }
                              finally { setLoadingTruckId(null) }
                            }}
                            disabled={loadingTruckId === parcel.id}
                            className="flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                          >
                            {loadingTruckId === parcel.id
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                              : <>🚚 Retour agence</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Colis déjà en transit retour — info pour la ville physique (expéditeur) */}
                  {parcel.status === 'Retour en transit' && isReturnOriginCity(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <span className="text-base shrink-0">🚛</span>
                        <div>
                          <p className="text-xs font-bold text-orange-800">Expédié vers l'agence d'origine</p>
                          <p className="text-[11px] text-orange-700 mt-0.5">En route vers <span className="font-bold">{parcel.returnToCity || parcel.destinationCity}</span> — en attente de l'arrivage.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Retour en attente de chargement — agence physique (destinataire original) */}
                  {parcel.status === 'Retourné' && canManageReturnDelivery(parcel) && (
                    <div className="mt-3 pt-3 border-t border-orange-100">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <span className="text-base shrink-0">⏳</span>
                        <div>
                          <p className="text-xs font-bold text-orange-800">En attente du chargement retour</p>
                          <p className="text-[11px] text-orange-700 mt-0.5 leading-snug">Ce colis doit être chargé sur un camion inter-villes par l'agence de destination.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Retour en transit — bouton de validation à l'agence d'origine */}
                  {parcel.status === 'Retour en transit' && canManageReturnDelivery(parcel) && (
                    <div className="mt-3 pt-3 border-t border-green-100">
                      <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">🚚</span>
                          <div>
                            <p className="text-xs font-bold text-green-800">Colis en route vers vous</p>
                            <p className="text-[11px] text-green-700 mt-0.5 leading-snug">
                              Le colis est sur le camion. Validez son arrivée pour déclencher la livraison à l'expéditeur.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Confirmer l'arrivée du colis retourné ?\n${parcel.trackingId}\nIl passera en "Arrivé en agence" et sera prêt pour livraison à l'expéditeur.`)) return
                            setValidatingReturnId(parcel.id)
                            try { await validateReturnArrival(parcel) }
                            catch (e: any) { alert('Erreur : ' + (e?.message || e)) }
                            finally { setValidatingReturnId(null) }
                          }}
                          disabled={validatingReturnId === parcel.id}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition"
                        >
                          {validatingReturnId === parcel.id
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Validation...</>
                            : <>✅ Valider l'arrivée du retour</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delivery assignment — for claimed parcels awaiting dispatch */}
                  {(() => {
                    const canManage = parcel.destinationAgentId === uid || canManageDeliveryAssignment(parcel)
                    const notDelivered = parcel.status !== 'Livré'
                    const notReturnAtOrigin = !(parcel.status === 'Retourné' && isReturnOriginCity(parcel))
                    const isPointed = isPointedForDelivery(parcel)

                    return canManage && notDelivered && notReturnAtOrigin ? (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      {!isPointed ? (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <p className="text-xs text-amber-700 font-medium">Validez d'abord ce colis dans Arrivages.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" /> {parcel.deliveryDriverId ? 'Modifier la livraison :' : 'Choisir le mode de livraison :'}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setDeliveryModal({
                                open: true,
                                parcel,
                                sectorId: parcel.deliverySectorId || '',
                                driverId: parcel.deliveryDriverId || '',
                                vehicleId: parcel.deliveryVehicleId || '',
                                loading: false,
                                error: '',
                              })}
                              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                            >
                              <Truck className="w-3.5 h-3.5" /> {parcel.deliveryDriverId ? 'Changer livreur' : 'Livreur local'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null
                  })()}
                </div>
              )
            })}

            {/* Barre de pagination */}
            {filteredParcels.length > PAGE_SIZE && (() => {
              const goTo = (p: number) => { setParcelPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
              // Calcule les numéros à afficher : toujours 1, last, et les 2 autour de safePage
              const pages: number[] = []
              for (let i = 0; i < totalPages; i++) {
                if (i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1) pages.push(i)
              }
              // Insère '…' entre numéros non-consécutifs
              const items: (number | string)[] = []
              pages.forEach((p, idx) => {
                if (idx > 0 && p - pages[idx - 1] > 1) items.push('…')
                items.push(p)
              })
              return (
                <div className="pt-4 mt-2 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {filteredParcels.length}{hasMoreParcels ? '+' : ''} expédition{filteredParcels.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">Page {safePage + 1} / {totalPages}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <button onClick={() => goTo(Math.max(0, safePage - 1))} disabled={safePage === 0}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                    ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>

                    {items.map((item, idx) =>
                      item === '…'
                        ? <span key={`dots-${idx}`} className="px-1 text-gray-400 text-sm select-none">…</span>
                        : <button key={item} onClick={() => goTo(Number(item))}
                            className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition border ${
                              item === safePage
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                            }`}
                          >{Number(item) + 1}</button>
                    )}

                    <button onClick={() => goTo(Math.min(totalPages - 1, safePage + 1))} disabled={isLastPage}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                    ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
              )
            })()}

            {/* Sélecteur de période rapide — chips cliquables */}
            {(() => {
              const now = new Date()
              const toISO = (d: Date) => d.toISOString().slice(0, 10)
              const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0,0,0,0)
              const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
              const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
              const months = Array.from({ length: 6 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
                const y = d.getFullYear(), m = d.getMonth()
                const lastDay = new Date(y, m + 1, 0).getDate()
                return {
                  label: `${MONTH_NAMES[m]} ${y}`,
                  from: `${y}-${String(m+1).padStart(2,'0')}-01`,
                  to:   `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
                  current: i === 5,
                }
              })
              const isActive = (f: any, t: any) => {
                const todayISO = toISO(now)
                if (f === todayISO && t === todayISO) return datePreset === 'today'
                return datePreset === 'custom' && dateFrom === f && dateTo === t
              }
              const apply    = (f: any, t: any) => {
                const todayISO = toISO(now)
                // Si c'est aujourd'hui, utiliser le preset 'today'
                if (f === todayISO && t === todayISO) {
                  setDatePreset('today')
                  setDateFrom('')
                  setDateTo('')
                } else {
                  setDatePreset('custom')
                  setDateFrom(f)
                  setDateTo(t)
                }
              }
              const clear    = ()     => { setDatePreset('all'); setDateFrom(''); setDateTo('') }
              const anyActive = datePreset === 'custom' && (dateFrom || dateTo)
              const chipCls = (active: boolean) => active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              return (
                <div className="mt-4 border border-gray-100 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Période
                    </span>
                    {anyActive && (
                      <button onClick={clear} className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition">
                        ✕ Tout afficher
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-2 bg-white">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: "Aujourd'hui", from: toISO(now),       to: toISO(now) },
                        { label: 'Cette semaine', from: toISO(weekStart), to: toISO(weekEnd) },
                      ].map(({ label, from, to }) => (
                        <button key={label} onClick={() => isActive(from, to) ? clear() : apply(from, to)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${chipCls(isActive(from, to))}`}
                        >{label}</button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {months.map(({ label, from, to, current }) => (
                        <button key={from} onClick={() => isActive(from, to) ? clear() : apply(from, to)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                            isActive(from, to)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : current
                              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-500'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    {anyActive && (
                      <p className="text-[10px] text-blue-500 font-medium pt-0.5">
                        {filteredParcels.length} expédition{filteredParcels.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Charger depuis l'historique Firestore (au-delà des 60 jours / 200 docs) */}
            {isLastPage && hasMoreParcels && (
              <button
                onClick={async () => {
                  if (loadingMore) return
                  setLoadingMore(true)
                  try {
                    const oldest = [...allDisplayParcels].sort((a, b) => {
                      const ta = a.createdAt?.toDate?.() || new Date(0)
                      const tb = b.createdAt?.toDate?.() || new Date(0)
                      return ta - tb
                    })[0]?.createdAt
                    if (!oldest || !uid) return
                    const { parcels: more, hasMore } = await getMoreAgentParcels(uid, oldest)
                    setExtraParcels((prev: any) => {
                      const map = new Map()
                      prev.forEach((p: any) => map.set(p.id, p))
                      more.forEach(p => map.set(p.id, p))
                      return [...map.values()]
                    })
                    setHasMoreParcels(hasMore)
                    setParcelPage(totalPages)
                  } catch (e: any) {
                    console.error('loadMore:', e)
                  } finally {
                    setLoadingMore(false)
                  }
                }}
                disabled={loadingMore}
                className="w-full mt-2 py-3 rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loadingMore
                  ? <><span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  : "↓ Charger l'historique plus ancien"}
              </button>
            )}
          </div>
          )
        })()
        )}
      </div>

      {/* ── MODAL MODIFICATION ── */}
      {editingParcel && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-800">Modifier l'expédition</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{editingParcel.trackingId}</p>
              </div>
              <button onClick={() => setEditingParcel(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {editError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {editError}</div>}

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Expéditeur</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nom" value={editForm.senderName} onChange={ef('senderName')} className={inputCls} />
                  <input placeholder="N EXP" value={editForm.senderNic || ''} onChange={ef('senderNic')} className={inputCls} />
                  <input placeholder="Téléphone" value={editForm.senderTel} onChange={ef('senderTel')} className={inputCls} />
                  <div className="relative">
                    <select value={editForm.senderCity} onChange={ef('senderCity')} className={selectCls}>
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input placeholder="Adresse" value={editForm.senderAddress || ''} onChange={ef('senderAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Destinataire</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nom" value={editForm.receiverName} onChange={ef('receiverName')} className={inputCls} />
                  <input placeholder="Téléphone" value={editForm.receiverTel} onChange={ef('receiverTel')} className={inputCls} />
                  <div className="col-span-2 relative">
                    <select value={editForm.receiverCity} onChange={ef('receiverCity')} className={selectCls}>
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input placeholder="Adresse" value={editForm.receiverAddress || ''} onChange={ef('receiverAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Détails</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input inputMode="decimal" placeholder="Poids (kg)" value={editForm.weight} onChange={ef('weight')} className={inputCls} />
                  <input type="number" min="1" step="1" placeholder="Nb de colis" value={editForm.nbColis || 1} onChange={ef('nbColis')} className={inputCls} />
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 mb-1.5">Nature de marchandise</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: 'Palette', label: 'Palette', emoji: '📦' },
                        { key: 'Colis',   label: 'Colis',   emoji: '📮' },
                        { key: 'Bagages', label: 'Bagages', emoji: '🧳' },
                        { key: 'Autres',  label: 'Autres',  emoji: '✏️' },
                      ].map(({ key, label, emoji }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEditForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all
                            ${editForm.natureOfGoods === key
                              ? 'bg-blue-600 border-blue-600 text-white shadow'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'}`}
                        >
                          <span className="text-lg">{emoji}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                    {editForm.natureOfGoods === 'Autres' && (
                      <input
                        placeholder="Précisez la nature…"
                        value={editForm.natureOfGoodsCustom || ''}
                        onChange={e => setEditForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
                        className={`${inputCls} mt-2`}
                      />
                    )}
                  </div>
                  <div className={`${inputCls} col-span-2 flex items-center justify-between bg-gray-50 cursor-not-allowed`}>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> RETOUR FOND — modification Admin uniquement</span>
                    <span className={`font-bold text-sm ${editForm.codAmount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{editForm.codAmount > 0 ? `${editForm.codAmount} DH` : '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                      Montant du port manuel
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Prix du port (DH)"
                      value={editForm.price}
                      onChange={ef('price')}
                      className={inputCls}
                    />
                  </div>
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Type de service</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {SERVICE_TYPES.map(st => (
                    <button
                      type="button"
                      key={st.key}
                      onClick={() => setEditForm((p: any) => ({ ...p, serviceType: st.key, codAmount: st.key === 'simple' || st.key === 'retour_bl' ? 0 : p.codAmount }))}
                      className={`py-2 rounded-xl border-2 text-xs font-bold transition ${
                        (editForm?.serviceType || 'oc') === st.key
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Statut</h4>
                {canManageStatus(editingParcel) ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUSES.map(s => {
                        const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                        const selected = editForm?.status === s
                        return (
                          <button key={s}
                            onClick={() => setEditForm((p: any) => ({ ...p, status: s }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition border ${
                              selected
                                ? `${sc.bg} ${sc.text} border-current ring-2 ring-offset-1 ring-current`
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                            {s}
                          </button>
                        )
                      })}
                    </div>
                    {editForm?.status !== editingParcel?.status && (
                      <input
                        placeholder="Note sur le changement de statut (optionnel)"
                        value={editForm?.note || ''}
                        onChange={ef('note')}
                        className={`${inputCls} mt-2 text-xs`}
                      />
                    )}
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{editForm?.status}</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Modification réservée à <span className="font-semibold">l'Agence de {editingParcel?.destinationCity}</span>
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <button onClick={handleEditSave} disabled={editLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {editLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
                  : <><Check className="w-4 h-4" /> Sauvegarder</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RETOUR FONDE ── */}
      {codeModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-bold text-gray-800">Code requis</h3>
              <p className="text-sm text-gray-500 mt-1">
                Entrez le code de <span className="font-semibold text-gray-700">{codeModal.parcel?.agentName || "l'agent"}</span> pour {codeModal.action === 'delete' ? 'supprimer' : 'modifier'} cette expédition
              </p>
            </div>
            {codeModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {codeModal.error}</div>
            )}
            <input
              type="text"
              placeholder="Code de l'agent"
              value={codeModal.code}
              onChange={e => setCodeModal((m: any) => ({ ...m, code: e.target.value, error: '' }))}
              onKeyDown={e => e.key === 'Enter' && handleCodeVerify()}
              className="w-full border border-gray-200 rounded-xl p-3 text-center text-lg font-mono tracking-widest focus:border-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setCodeModal({ open: false, parcel: null, action: 'edit', code: '', error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleCodeVerify}
                className="py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHARGEMENT TRANSPORT ── */}
      {transportModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Charger dans un camion</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{transportModal.parcel?.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {transportModal.parcel?.sender?.city} vers {transportModal.parcel?.destinationCity || transportModal.parcel?.receiver?.city}
                </p>
              </div>
              <button onClick={() => setTransportModal({ open: false, parcel: null, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {transportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">Attention : {transportModal.error}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nom du chauffeur *</label>
                <input
                  type="text"
                  value={transportModal.chauffeurName}
                  onChange={e => setTransportModal((m: any) => ({ ...m, chauffeurName: e.target.value, error: '' }))}
                  placeholder="Ex: Mohammed Alami"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Téléphone du chauffeur</label>
                <input
                  type="tel"
                  value={transportModal.chauffeurPhone}
                  onChange={e => setTransportModal((m: any) => ({ ...m, chauffeurPhone: e.target.value }))}
                  placeholder="Ex: 0661 23 45 67"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTransportModal({ open: false, parcel: null, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignTransport} disabled={transportModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {transportModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  : <><Truck className="w-4 h-4" /> Charger</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LIVRAISON ── */}
      {deliveryModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Assigner un livreur local</h3>
                <p className="text-xs font-mono text-purple-600 mt-0.5">{deliveryModal.parcel?.trackingId}</p>
              </div>
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {deliveryModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {deliveryModal.error}</div>
            )}
            {(() => {
              const parcel = deliveryModal.parcel

              // Détection robuste des retours (y compris anciens colis)
              const isReturn = parcel?.status?.includes('Retour')
                || parcel?.wasReturned
                || !!parcel?.returnedAt
                || !!parcel?.returnReason
                || !!parcel?.returnToCity
                || parcel?.history?.some((h: any) => h.status?.includes('Retour'))

              // Vérifier si le retour est arrivé à l'agence source
              const isReturnArrived = parcel?.status === 'Retour arrivé' || parcel?.status === 'Retour finalisé'

              // APRÈS swap des villes lors du retour:
              // - receiver = expéditeur original (où le colis doit retourner)
              // - destinationCity = ville de l'expéditeur original
              // Donc pour RETOUR et LIVRAISON normale: utiliser receiver.city ou destinationCity

              const finalDestinationCity = parcel?.receiver?.city || parcel?.destinationCity

              const destCity = finalDestinationCity || profile?.city
              const citySectors = allSectors.filter((s: any) => s.city === destCity)
              const selectedSectorId = deliveryModal.sectorId
              const cityDrivers = drivers.filter((d: any) =>
                (!destCity || d.city === destCity) &&
                (d.role === 'livreur' || (d.role === 'chauffeur' && d.chauffeurType !== 'transport')) &&
                (!selectedSectorId || d.sectorId === selectedSectorId)
              )
              const cityVehicles = vehicles.filter((v: any) =>
                !destCity ||
                v.city === destCity ||
                cityDrivers.some((d: any) => d.id === v.chauffeurId)
              )

              return cityDrivers.length === 0 ? (
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <select
                    value={deliveryModal.sectorId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, sectorId: e.target.value, driverId: '' }))}
                    className={selectCls}
                  >
                    <option value="">Tous les secteurs de {destCity || 'destination'}</option>
                    {citySectors.map((s: any) => <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {deliveryModal.sectorId && (() => {
                  const selectedSector = citySectors.find((s: any) => s.id === deliveryModal.sectorId)
                  if (selectedSector) {
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-blue-900">📍 Secteur: {selectedSector.code}</p>
                        {selectedSector.name && selectedSector.name !== selectedSector.code && (
                          <p className="text-xs text-blue-700 mt-0.5">{selectedSector.name}</p>
                        )}
                      </div>
                    )
                  }
                  return null
                })()}

                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">Aucun livreur disponible pour ce secteur.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <select
                    value={deliveryModal.sectorId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, sectorId: e.target.value, driverId: '' }))}
                    className={selectCls}
                  >
                    <option value="">Tous les secteurs de {destCity || 'destination'}</option>
                    {citySectors.map((s: any) => <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {deliveryModal.sectorId && (() => {
                  const selectedSector = citySectors.find((s: any) => s.id === deliveryModal.sectorId)
                  if (selectedSector) {
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-blue-900">📍 Secteur: {selectedSector.code}</p>
                        {selectedSector.name && selectedSector.name !== selectedSector.code && (
                          <p className="text-xs text-blue-700 mt-0.5">{selectedSector.name}</p>
                        )}
                      </div>
                    )
                  }
                  return null
                })()}

                <div className="grid grid-cols-1 gap-2">
                  {cityDrivers.map((d: any) => {
                    const sector = allSectors.find((s: any) => s.id === d.sectorId)
                    return (
                      <button key={d.id}
                        onClick={() => setDeliveryModal((m: any) => ({ ...m, driverId: d.id, sectorId: d.sectorId || m.sectorId || '' }))}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition ${
                          deliveryModal.driverId === d.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span className="flex-1">{d.name}</span>
                        {sector?.code && <span className="text-xs opacity-70">Secteur {sector.code}</span>}
                        {d.tel && <span className="text-xs opacity-70">{d.tel}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="relative">
                  <select
                    value={deliveryModal.vehicleId}
                    onChange={e => setDeliveryModal((m: any) => ({ ...m, vehicleId: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="">Véhicule optionnel</option>
                    {cityVehicles.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {[v.matricule, v.marque, v.modele].filter(Boolean).join(' - ')}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )})()}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignDelivery} disabled={deliveryModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {deliveryModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Assignation...</>
                  : <><Truck className="w-4 h-4" /> Assigner</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal raison du retour */}
      {returnReasonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !returnReasonModal.loading && setReturnReasonModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">↩️</div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Retourner ce colis</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{returnReasonModal.parcel.trackingId}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raison du retour</p>
              {RETURN_REASONS.map((r: any) => (
                <button key={r} type="button"
                  onClick={() => setReturnReasonModal((m: any) => ({ ...m, reason: r }))}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                    returnReasonModal.reason === r
                      ? 'bg-red-50 border-red-400 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {returnReasonModal.reason === r ? '● ' : '○ '}{r}
                </button>
              ))}
              {returnReasonModal.reason === 'Autre raison' && (
                <input
                  autoFocus
                  type="text"
                  placeholder="Précisez la raison…"
                  value={returnReasonModal.customReason}
                  onChange={e => setReturnReasonModal((m: any) => ({ ...m, customReason: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-400"
                />
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setReturnReasonModal(null)}
                disabled={returnReasonModal.loading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button type="button" onClick={submitReturnWithReason}
                disabled={returnReasonModal.loading || !returnReasonModal.reason}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition">
                {returnReasonModal.loading ? 'En cours…' : 'Confirmer retour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
