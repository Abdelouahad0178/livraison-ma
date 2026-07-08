import { useState } from 'react'
import {
  Search, AlertTriangle, Filter, ChevronDown, ChevronRight, X,
  CheckSquare, Square, Truck, Minus, Plus, CheckCircle2, Package,
  Save, RotateCcw, Edit2, Clock, Eye, Printer, Trash2,
} from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import DateFilter from '../DateFilter'
import { useAgentCtx } from '../AgentCtx'
import { db } from '../../../firebase/db'
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore'

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

export default function ArrivageTab() {
  const {
    profile,
    transitParcels,
    arrivages,
    arrivageTab,    setArrivageTab,
    arrivageScan,   setArrivageScan,
    arrivageSearch, setArrivageSearch,
    arrivageDatePreset, setArrivageDatePreset,
    arrivageDateFrom,   setArrivageDateFrom,
    arrivageDateTo,     setArrivageDateTo,
    arrivageTypeFilter,   setArrivageTypeFilter,
    arrivageServiceFilter, setArrivageServiceFilter,
    arrivageDriverFilter,  setArrivageDriverFilter,
    arrivageOriginFilter,  setArrivageOriginFilter,
    arrivageStatusFilter,  setArrivageStatusFilter,
    arrivageAgentFilter,   setArrivageAgentFilter,
    arrivageExpandedIds,   setArrivageExpandedIds,
    arrivageConfirming,
    arrivageError,
    arrivageSuccess,  setArrivageSuccess,
    arrivageShowFilters, setArrivageShowFilters,
    arrivageShowSansBon, setArrivageShowSansBon,
    arrivageShowNotes,   setArrivageShowNotes,
    arrivageNotes, setArrivageNotes,
    arrScanFlash,
    colisWithoutBon, setColisWithoutBon,
    colisWbForm,     setColisWbForm,
    expandedGroups,
    arrivedBoxes,
    histPointEdits,
    histSaving,
    histPointErr,
    histExpandedPt,  setHistExpandedPt,
    histSearchQ,     setHistSearchQ,
    histSearchRes,   setHistSearchRes,
    histSearchErr,   setHistSearchErr,
    histSearching,
    ARR_TYPE_CONFIG,
    arrComputedType,
    arrFilteredTransitParcels,
    arrArrivedParcels,
    arrMissingParcels,
    arrTotalArrived,
    arrTotalExpected,
    arrTotalMissing,
    arrGroups,
    arrIsArrived,
    arrIsPartial,
    arrIsFull,
    arrNbColis,
    arrArrived,
    arrNexp,
    arrToggle,
    arrToggleGroup,
    arrToggleExpand,
    arrToggleAll,
    arrSetBoxes,
    arrPointByCode,
    arrUniqueDrivers,
    arrUniqueOrigins,
    arrHistUniqueAgents,
    filteredArrivages,
    arrHistTotalBons,
    arrHistTotalManquants,
    arrHistTotalSansBon,
    handleConfirmArrivage,
    histGetEdit,
    histInitEdit,
    histTogglePointed,
    histSetBoxes,
    histRemoveFromArrived,
    histRecoverMissing,
    histSearchParcel,
    histAddSearchResult,
    histSavePointage,
  } = useAgentCtx()

  const [showTableView, setShowTableView] = useState(false)
  const [deletingArrivage, setDeletingArrivage] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  const typeConf = ARR_TYPE_CONFIG[arrComputedType]
  const fmtDate = (d: any) => {
    if (!d) return '—'
    const dt = d?.toDate ? d.toDate() : new Date(d)
    return dt.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const hasActiveFilters = arrivageSearch || arrivageDriverFilter !== 'all' || arrivageOriginFilter !== 'all' || arrivageStatusFilter !== 'all' || arrivageServiceFilter !== 'all' || arrivageDatePreset !== 'all'

  const handlePrint = () => {
    // Afficher le tableau avant d'imprimer
    if (!showTableView) {
      setShowTableView(true)
      // Attendre que le DOM se mette à jour avant d'imprimer
      setTimeout(() => window.print(), 100)
    } else {
      window.print()
    }
  }

  const handleDeleteArrivage = async (arrivageId: string) => {
    if (!confirm('Supprimer cet arrivage ?\n\nCette action est irréversible.')) return

    setDeletingArrivage(arrivageId)
    try {
      await deleteDoc(doc(db, 'arrivages', arrivageId))
      alert('✅ Arrivage supprimé')
    } catch (err: any) {
      console.error('Erreur suppression:', err)
      alert('❌ Erreur: ' + (err.message || err))
    } finally {
      setDeletingArrivage(null)
    }
  }

  const handleDeleteAllArrivages = async () => {
    if (!confirm('⚠️ SUPPRIMER TOUS LES ARRIVAGES ?\n\nCette action est IRRÉVERSIBLE et supprimera TOUS les arrivages de la base de données.\n\nÊtes-vous absolument sûr ?')) return
    if (!confirm('DERNIÈRE CONFIRMATION\n\nVous allez supprimer TOUS les arrivages. Continuer ?')) return

    setDeletingAll(true)
    try {
      const snapshot = await getDocs(collection(db, 'arrivages'))
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
      alert(`✅ ${snapshot.size} arrivages supprimés`)
    } catch (err: any) {
      console.error('Erreur suppression:', err)
      alert('❌ Erreur: ' + (err.message || err))
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">

      {/* ── Sous-onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[{ key: 'nouveau', label: '🚛 Nouvel arrivage' }, { key: 'historique', label: '🕐 Historique' }].map(t => (
          <button key={t.key} onClick={() => { setArrivageTab(t.key); setArrivageStatusFilter('all'); setArrivageShowFilters(false) }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${arrivageTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── NOUVEL ARRIVAGE ── */}
      {arrivageTab === 'nouveau' && !arrivageSuccess && (
        <>
          {/* Message d'aide - Instructions claires */}
          {arrFilteredTransitParcels.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                  <CheckSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-blue-900 mb-1">📦 Comment pointer les colis arrivés ?</h3>
                  <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                    <li><strong>Cochez les cases</strong> (☐) des colis physiquement reçus</li>
                    <li>Ou utilisez le bouton <strong className="bg-green-600 text-white px-2 py-0.5 rounded">Tout reçu</strong> si tout est arrivé</li>
                    <li>Les colis non cochés seront marqués comme <strong className="text-red-600">MANQUANTS</strong></li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Scanner principal */}
          <div className={`rounded-2xl border-2 p-4 transition-colors ${
            arrScanFlash === 'ok' ? 'bg-green-50 border-green-400' :
            arrScanFlash === 'error' ? 'bg-red-50 border-red-400' :
            'bg-white border-gray-200'
          }`}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={arrivageScan}
                  onChange={e => setArrivageScan(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); if (arrPointByCode(arrivageScan)) setArrivageScan('') }
                  }}
                  placeholder="Scanner ou saisir le code du bon…"
                  className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none bg-transparent"
                  autoFocus
                />
              </div>
              <button
                onClick={() => { if (arrPointByCode(arrivageScan)) setArrivageScan('') }}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition shrink-0"
              >
                Pointer
              </button>
            </div>
            {arrivageError && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {arrivageError}
              </p>
            )}
          </div>

          {/* Stats + actions rapides - AMÉLIORATION VISUELLE */}
          {arrFilteredTransitParcels.length > 0 && (
            <>
              {/* Badge de progression */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Progression du pointage</span>
                  <span className="text-2xl font-black text-blue-600">
                    {arrArrivedParcels.length}/{arrFilteredTransitParcels.length}
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      arrArrivedParcels.length === arrFilteredTransitParcels.length
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                    }`}
                    style={{ width: `${arrFilteredTransitParcels.length > 0 ? (arrArrivedParcels.length / arrFilteredTransitParcels.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-green-600 font-semibold">✓ {arrArrivedParcels.length} pointés</span>
                  {arrMissingParcels.length > 0 && (
                    <span className="text-red-600 font-semibold animate-pulse">⚠ {arrMissingParcels.length} manquants</span>
                  )}
                </div>
              </div>

              {/* Stats détaillées */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 border-2 border-green-300 rounded-xl px-3 py-3 text-center">
                  <p className="text-2xl font-black text-green-700">{arrArrivedParcels.length}</p>
                  <p className="text-[10px] font-semibold text-green-600 uppercase">Pointés ✓</p>
                </div>
                <div className={`border-2 rounded-xl px-3 py-3 text-center ${arrMissingParcels.length > 0 ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-2xl font-black ${arrMissingParcels.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{arrMissingParcels.length}</p>
                  <p className={`text-[10px] font-semibold uppercase ${arrMissingParcels.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Manquants ✗</p>
                </div>
                <div className="bg-blue-50 border-2 border-blue-300 rounded-xl px-3 py-3 text-center">
                  <p className="text-2xl font-black text-blue-700">{arrFilteredTransitParcels.length}</p>
                  <p className="text-[10px] font-semibold text-blue-600 uppercase">Total</p>
                </div>
              </div>
            </>
          )}

          {/* Barre d'outils - BOUTONS PLUS VISIBLES */}
          <div className="flex items-center gap-2">
            <button onClick={() => arrToggleAll(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-black rounded-xl transition shadow-lg shadow-green-600/30 active:scale-95">
              <CheckSquare className="w-5 h-5" />
              <span>✓ TOUT REÇU</span>
            </button>
            <button onClick={() => arrToggleAll(false)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gray-300 hover:bg-gray-400 text-gray-800 text-sm font-black rounded-xl transition active:scale-95">
              <Square className="w-5 h-5" />
              <span>Effacer</span>
            </button>
            <button onClick={() => setArrivageShowFilters((f: any) => !f)}
              className={`flex items-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-bold border-2 transition ${arrivageShowFilters || hasActiveFilters ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              <Filter className="w-4 h-4" />
              Filtres
              {hasActiveFilters && !arrivageShowFilters && <span className="w-2 h-2 rounded-full bg-orange-400 inline-block animate-pulse" />}
            </button>
          </div>

          {/* Panneau filtres */}
          {arrivageShowFilters && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={arrivageSearch} onChange={e => setArrivageSearch(e.target.value)}
                  placeholder="Rechercher bon, client, chauffeur, N EXP…"
                  className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none" />
                {arrivageSearch && <button onClick={() => setArrivageSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-4 h-4" /></button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={arrivageDriverFilter} onChange={e => setArrivageDriverFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-700 focus:border-blue-400 focus:outline-none">
                  <option value="all">Tous chauffeurs</option>
                  {arrUniqueDrivers.map((n: any) => <option key={n} value={n}>{n === '__none__' ? 'Sans chauffeur' : n}</option>)}
                </select>
                <select value={arrivageOriginFilter} onChange={e => setArrivageOriginFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-700 focus:border-blue-400 focus:outline-none">
                  <option value="all">Toutes origines</option>
                  {arrUniqueOrigins.map((c: any) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ key: 'all', label: 'Tous' }, { key: 'En transit', label: 'Transit' }, { key: 'Retour en transit', label: '↩️ Retours' }].map(f => (
                  <button key={f.key} onClick={() => setArrivageStatusFilter(f.key)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${arrivageStatusFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <DateFilter value={arrivageDatePreset} onChange={setArrivageDatePreset}
                from={arrivageDateFrom} onFromChange={setArrivageDateFrom}
                to={arrivageDateTo} onToChange={setArrivageDateTo} tone="blue" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{arrFilteredTransitParcels.length}/{transitParcels.length} bons</span>
                <button onClick={() => { setArrivageSearch(''); setArrivageDatePreset('all'); setArrivageDateFrom(''); setArrivageDateTo(''); setArrivageDriverFilter('all'); setArrivageOriginFilter('all'); setArrivageStatusFilter('all'); setArrivageServiceFilter('all') }}
                  className="font-semibold text-blue-600 hover:text-blue-700">Réinitialiser</button>
              </div>
            </div>
          )}

          {/* Badge type arrivage */}
          <div className={`flex items-center gap-3 ${typeConf.bg} ${typeConf.border} border rounded-2xl px-4 py-2.5`}>
            <span className="text-xl">{typeConf.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${typeConf.text}`}>{typeConf.label}</p>
              <p className={`text-xs ${typeConf.text} opacity-70 truncate`}>
                {arrComputedType === 'complet' && `${arrArrivedParcels.length} bons — ${arrTotalArrived} colis reçus`}
                {arrComputedType === 'partiel' && `${arrTotalArrived}/${arrTotalExpected} colis — ${arrTotalMissing} manquant(s)`}
                {arrComputedType === 'documents_seulement' && (arrFilteredTransitParcels.length === 0 ? 'Aucun bon en attente' : 'Aucun colis physique coché')}
              </p>
            </div>
          </div>

          {/* Liste bons à pointer */}
          {arrFilteredTransitParcels.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-gray-600 text-sm">
                {transitParcels.length === 0 ? `Tous les bons reçus à ${profile?.city}` : 'Aucun bon ne correspond aux filtres'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {(Object.values(arrGroups) as any[]).map((group: any) => {
                const gArrived  = group.parcels.filter((p: any) => arrIsArrived(p)).length
                const allFull   = group.parcels.every((p: any) => arrIsFull(p))
                const someArrived = gArrived > 0 && !allFull
                const expanded  = expandedGroups[group.key] !== false
                return (
                  <div key={group.key} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 px-3 py-3 bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
                         onClick={() => arrToggleExpand(group.key)}>
                      <button onClick={e => { e.stopPropagation(); arrToggleGroup(group.key) }} className="shrink-0 p-0.5">
                        {allFull ? <CheckSquare className="w-5 h-5 text-green-500" />
                          : someArrived ? <div className="w-5 h-5 border-2 border-orange-400 rounded flex items-center justify-center"><div className="w-2.5 h-2.5 bg-orange-400 rounded-sm" /></div>
                          : <Square className="w-5 h-5 text-gray-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">🚚 {group.chauffeurName}{group.chauffeurPhone ? ` · ${group.chauffeurPhone}` : ''}</p>
                        <p className="text-xs text-gray-500">{group.originCity} → {profile?.city}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${allFull ? 'bg-green-100 text-green-700' : someArrived ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600'}`}>
                        {gArrived}/{group.parcels.length}
                      </span>
                      {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    </div>

                    {expanded && group.parcels.map((parcel: any) => {
                      const total    = arrNbColis(parcel)
                      const rcvd     = arrArrived(parcel)
                      const checked  = rcvd > 0
                      const partial  = arrIsPartial(parcel)
                      const multi    = total > 1
                      const isReturn = !!parcel.returnedAt || parcel.status === 'Retour en transit'
                      const isFull   = rcvd === total && total > 0
                      return (
                        <div key={parcel.id} className={`flex items-center gap-2 px-3 py-2.5 pl-10 border-t border-gray-50 transition group/row hover:bg-blue-50 cursor-pointer ${
                          checked ? (partial ? 'bg-orange-50 hover:bg-orange-100' : 'bg-green-50 hover:bg-green-100') : 'bg-white'
                        }`} onClick={() => arrToggle(parcel.id)}>
                          <div className="relative shrink-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); arrToggle(parcel.id) }}
                              title={checked ? "✓ Reçu - Cliquez pour décocher" : "⚠ Manquant - Cliquez pour pointer comme REÇU"}
                              className={`p-2 -ml-2 rounded-lg transition-all ${
                                checked
                                  ? 'hover:bg-green-200/50'
                                  : 'hover:bg-blue-200 hover:scale-110 group-hover/row:ring-2 group-hover/row:ring-blue-400 group-hover/row:ring-offset-1'
                              }`}>
                              {checked
                                ? <CheckSquare className={`w-5 h-5 ${partial ? 'text-orange-500' : 'text-green-600'}`} />
                                : <Square className="w-5 h-5 text-gray-400 group-hover/row:text-blue-600 group-hover/row:animate-pulse" />}
                            </button>
                            {!checked && (
                              <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-mono font-bold text-blue-600">{parcel.trackingId}</span>
                              {isReturn && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">↩️ Retour</span>}
                            </div>
                            <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{parcel.receiver?.name}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {parcel.sender?.name} · {parcel.weight} kg
                              {arrNexp(parcel) && <span className="font-mono text-blue-600 font-bold"> · {arrNexp(parcel)}</span>}
                            </p>
                          </div>

                          {/* Boutons rapides simplifiés */}
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {multi && rcvd > 0 && !isFull && (
                              <>
                                <button
                                  onClick={() => arrSetBoxes(parcel.id, total, total)}
                                  className="px-2 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold transition flex items-center gap-1"
                                  title="Marquer complet"
                                >
                                  ✅ Complet
                                </button>
                                <button
                                  onClick={() => arrSetBoxes(parcel.id, total - 1, total)}
                                  className="px-2 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold transition flex items-center gap-1"
                                  title="Marquer partiel (manque 1)"
                                >
                                  ⚠️ -1
                                </button>
                              </>
                            )}

                            {/* Compteur détaillé */}
                            {multi && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => arrSetBoxes(parcel.id, Math.max(0, rcvd - 1), total)} disabled={rcvd === 0}
                                  className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-20 flex items-center justify-center transition">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg min-w-[40px] text-center ${
                                  rcvd === 0 ? 'bg-red-100 text-red-700' : rcvd < total ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                                }`}>{rcvd}/{total}</span>
                                <button onClick={() => arrSetBoxes(parcel.id, Math.min(total, rcvd + 1), total)} disabled={rcvd === total}
                                  className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-20 flex items-center justify-center transition">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {!multi && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${checked ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                {checked ? '✓ Reçu' : 'Manquant'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Colis sans bon */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <button onClick={() => setArrivageShowSansBon((v: any) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 hover:bg-amber-100 transition text-left">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-amber-800">Colis reçus sans bon</span>
              {colisWithoutBon.length > 0 && <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{colisWithoutBon.length}</span>}
              {arrivageShowSansBon ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-amber-400" />}
            </button>
            {arrivageShowSansBon && (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input value={colisWbForm.trackingRef} onChange={e => setColisWbForm((f: any) => ({ ...f, trackingRef: e.target.value }))}
                    placeholder="Réf / code (optionnel)"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
                  <select value={colisWbForm.originCity} onChange={e => setColisWbForm((f: any) => ({ ...f, originCity: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-amber-400 focus:outline-none">
                    <option value="">Origine inconnue</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input value={colisWbForm.description} onChange={e => setColisWbForm((f: any) => ({ ...f, description: e.target.value }))}
                    placeholder="Description (ex: carton blanc…)"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
                  <input type="number" min="1" value={colisWbForm.nbColis} onChange={e => setColisWbForm((f: any) => ({ ...f, nbColis: e.target.value }))}
                    className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:border-amber-400 focus:outline-none" />
                  <button onClick={() => {
                    if (!colisWbForm.description.trim() && !colisWbForm.trackingRef.trim()) return
                    setColisWithoutBon((prev: any) => [...prev, { ...colisWbForm, nbColis: parseInt(colisWbForm.nbColis) || 1, id: Date.now() }])
                    setColisWbForm({ trackingRef: '', description: '', originCity: '', nbColis: '1' })
                  }} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition">
                    +
                  </button>
                </div>
                {colisWithoutBon.length > 0 ? (
                  <div className="space-y-2">
                    {(colisWithoutBon as any[]).map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          {c.trackingRef && <p className="text-xs font-mono text-amber-800 font-bold">{c.trackingRef}</p>}
                          <p className="text-sm text-gray-700 truncate">{c.description || 'Sans description'}</p>
                          <p className="text-xs text-gray-400">{c.originCity || 'Origine inconnue'} · {c.nbColis} colis</p>
                        </div>
                        <button onClick={() => setColisWithoutBon((prev: any) => (prev as any[]).filter((x: any) => x.id !== c.id))} className="text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-1">Aucun colis sans bon</p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setArrivageShowNotes((v: any) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition text-left">
              <Edit2 className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-gray-600">Notes de l'arrivage</span>
              {arrivageNotes && <span className="text-[10px] text-blue-500 font-semibold">Rempli</span>}
              {arrivageShowNotes ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
            {arrivageShowNotes && (
              <div className="px-4 pb-4">
                <textarea value={arrivageNotes} onChange={e => setArrivageNotes(e.target.value)}
                  placeholder="Observations, incidents, remarques…" rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none" />
              </div>
            )}
          </div>

          {/* Confirmer */}
          <button onClick={handleConfirmArrivage}
            disabled={arrivageConfirming || (arrFilteredTransitParcels.length === 0 && !arrivageNotes.trim() && colisWithoutBon.length === 0)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-4 rounded-2xl text-base transition">
            {arrivageConfirming
              ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Confirmation…</>
              : <><CheckCircle2 className="w-5 h-5" /> Confirmer l'arrivage</>}
          </button>
        </>
      )}

      {/* ── Succès */}
      {arrivageTab === 'nouveau' && arrivageSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-3">
          <div className="text-4xl">✅</div>
          <p className="font-bold text-green-800 text-lg">Arrivage confirmé !</p>
          <p className="font-mono text-green-600 text-sm">{arrivageSuccess.arrivageRef}</p>
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">{arrivageSuccess.arrivedCount} bon{arrivageSuccess.arrivedCount > 1 ? 's' : ''} reçus</span>
            <span className="bg-green-200 text-green-900 px-3 py-1 rounded-full font-semibold">{arrivageSuccess.totalArrived}/{arrivageSuccess.totalExpected} colis</span>
            {arrivageSuccess.totalMissing > 0 && <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">{arrivageSuccess.totalMissing} manquant{arrivageSuccess.totalMissing > 1 ? 's' : ''}</span>}
            {arrivageSuccess.colisWithoutBonCount > 0 && <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-semibold">{arrivageSuccess.colisWithoutBonCount} sans bon</span>}
          </div>
          <button onClick={() => { setArrivageSuccess(null); setArrivageTab('historique') }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition">
            Voir l'historique
          </button>
        </div>
      )}

      {/* ── HISTORIQUE ── */}
      {arrivageTab === 'historique' && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-2 shadow-sm">
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: 'all',                 label: 'Tous' },
                { key: 'complet',             label: '✅ Complet' },
                { key: 'partiel',             label: '⚠️ Partiel' },
                { key: 'documents_seulement', label: '📄 Docs' },
              ].map(f => (
                <button key={f.key} onClick={() => setArrivageTypeFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${arrivageTypeFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f.label}
                </button>
              ))}

              {/* Boutons Voir tableau, Imprimer et Supprimer */}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setShowTableView(!showTableView)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${showTableView ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  title="Voir le tableau"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showTableView ? 'Masquer' : 'Tableau'}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                  title="Imprimer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer
                </button>
                <button
                  onClick={handleDeleteAllArrivages}
                  disabled={deletingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  title="Supprimer TOUS les arrivages"
                >
                  {deletingAll ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Supprimer tout
                    </>
                  )}
                </button>
              </div>
            </div>
            <button onClick={() => setArrivageShowFilters((v: any) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition ${arrivageShowFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
              <span className="flex items-center gap-1.5"><Filter className="w-3 h-3" /> Filtres avancés (date, agent)</span>
              {arrivageShowFilters ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {arrivageShowFilters && (
              <div className="space-y-2 pt-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={arrivageSearch} onChange={e => setArrivageSearch(e.target.value)}
                    placeholder="Rechercher réf, N EXP, agent, client…"
                    className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none" />
                  {arrivageSearch && <button onClick={() => setArrivageSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-4 h-4" /></button>}
                </div>
                {arrHistUniqueAgents.length > 1 && (
                  <select value={arrivageAgentFilter} onChange={e => setArrivageAgentFilter(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-700 focus:border-blue-400 focus:outline-none">
                    <option value="all">Tous les agents</option>
                    {arrHistUniqueAgents.map((n: any) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                <DateFilter value={arrivageDatePreset} onChange={setArrivageDatePreset}
                  from={arrivageDateFrom} onFromChange={setArrivageDateFrom}
                  to={arrivageDateTo} onToChange={setArrivageDateTo} tone="blue" />
                <button onClick={() => { setArrivageSearch(''); setArrivageDatePreset('all'); setArrivageDateFrom(''); setArrivageDateTo(''); setArrivageTypeFilter('all'); setArrivageStatusFilter('all'); setArrivageAgentFilter('all') }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700">Réinitialiser tous les filtres</button>
              </div>
            )}
          </div>

          {filteredArrivages.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">{arrivages.length === 0 ? 'Aucun arrivage enregistré' : 'Aucun arrivage ne correspond aux filtres'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Arrivages', val: filteredArrivages.length,  bg: 'bg-blue-50',   text: 'text-blue-700',  sub: 'text-blue-400' },
                  { label: 'Bons reçus', val: arrHistTotalBons,         bg: 'bg-green-50',  text: 'text-green-700', sub: 'text-green-400' },
                  { label: 'Manquants',  val: arrHistTotalManquants,    bg: arrHistTotalManquants > 0 ? 'bg-red-50' : 'bg-gray-50', text: arrHistTotalManquants > 0 ? 'text-red-700' : 'text-gray-400', sub: arrHistTotalManquants > 0 ? 'text-red-400' : 'text-gray-300' },
                  { label: 'Sans bon',   val: arrHistTotalSansBon,      bg: 'bg-amber-50',  text: 'text-amber-700', sub: 'text-amber-400' },
                ].map(({ label, val, bg, text, sub }) => (
                  <div key={label} className={`${bg} rounded-xl p-2 text-center`}>
                    <p className={`${text} font-black text-base`}>{val}</p>
                    <p className={`${sub} text-[9px] font-medium leading-tight`}>{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Vue Tableau ── */}
              {showTableView && (
                <div id="arrivages-print-table" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 text-left font-bold text-gray-700">N° Arrivage</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-700">Date</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-700">Agent</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-700">Destinataires</th>
                          <th className="px-3 py-2 text-center font-bold text-gray-700">Type</th>
                          <th className="px-3 py-2 text-center font-bold text-gray-700">Bons</th>
                          <th className="px-3 py-2 text-center font-bold text-gray-700">Colis</th>
                          <th className="px-3 py-2 text-center font-bold text-gray-700">Manquants</th>
                          <th className="px-3 py-2 text-center font-bold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(filteredArrivages as any[]).map((arr: any, idx: number) => {
                          // Calcul du type réel basé sur le pointage
                          let actualType = arr.type
                          if (arr.totalArrivedBoxes !== undefined && arr.totalExpectedBoxes !== undefined) {
                            if (arr.totalArrivedBoxes === 0) {
                              actualType = 'documents_seulement'
                            } else if (arr.totalArrivedBoxes < arr.totalExpectedBoxes) {
                              actualType = 'partiel'
                            } else {
                              actualType = 'complet'
                            }
                          }
                          const tc = ARR_TYPE_CONFIG[actualType] || ARR_TYPE_CONFIG.complet

                          // Extraction des destinataires
                          const receivers = arr.arrivedColisDetail
                            ? [...new Set(arr.arrivedColisDetail.map((c: any) => c.receiverName).filter(Boolean))]
                            : []

                          return (
                            <tr key={arr.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                              <td className="px-3 py-2">
                                <span className="font-mono font-semibold text-blue-600">{arr.arrivageRef}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {fmtDate(arr.confirmedAt)}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {arr.agentName}
                              </td>
                              <td className="px-3 py-2">
                                {receivers.length > 0 ? (
                                  <div className="text-xs text-gray-700">
                                    {receivers.slice(0, 2).join(', ')}
                                    {receivers.length > 2 && <span className="text-gray-500"> +{receivers.length - 2}</span>}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.bg} ${tc.text}`}>
                                  {tc.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-green-700">
                                {arr.arrivedCount || 0}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-blue-700">
                                {arr.totalArrivedBoxes || 0}/{arr.totalExpectedBoxes || 0}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold">
                                <span className={arr.missingCount > 0 ? 'text-red-600' : 'text-gray-400'}>
                                  {arr.missingCount || 0}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => handleDeleteArrivage(arr.id)}
                                  disabled={deletingArrivage === arr.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                  title="Supprimer cet arrivage"
                                >
                                  {deletingArrivage === arr.id ? (
                                    <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Liste simplifiée des arrivages ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
                {(filteredArrivages as any[]).map((arr: any, idx: number) => {
                  // Calcul du type réel basé sur le pointage
                  let actualType = arr.type
                  if (arr.totalArrivedBoxes !== undefined && arr.totalExpectedBoxes !== undefined) {
                    if (arr.totalArrivedBoxes === 0) {
                      actualType = 'documents_seulement'
                    } else if (arr.totalArrivedBoxes < arr.totalExpectedBoxes) {
                      actualType = 'partiel'
                    } else {
                      actualType = 'complet'
                    }
                  }
                  const tc = ARR_TYPE_CONFIG[actualType] || ARR_TYPE_CONFIG.complet
                  const isOpen = arrivageExpandedIds.has(arr.id)
                  const toggleCard = () => {
                    setArrivageExpandedIds((prev: any) => {
                      const next = new Set(prev)
                      if (next.has(arr.id)) {
                        next.delete(arr.id)
                      } else {
                        next.add(arr.id)
                        histInitEdit(arr)
                      }
                      return next
                    })
                  }

                  return (
                    <div key={arr.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      {/* ── En-tête cliquable ── */}
                      <button onClick={toggleCard} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-50/30 transition group">
                        {/* Icône type */}
                        <div className={`w-10 h-10 rounded-lg ${tc.bg} flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition`}>
                          {tc.icon}
                        </div>

                        {/* Info principale */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-600">{arr.arrivageRef}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tc.bg} ${tc.text}`}>{tc.label}</span>
                            {arr.pointageStatus === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            <span>{fmtDate(arr.confirmedAt)}</span>
                            <span>•</span>
                            <span>{arr.agentName}</span>
                          </div>
                          {/* Destinataires */}
                          {arr.arrivedColisDetail && arr.arrivedColisDetail.length > 0 && (() => {
                            const receivers: string[] = [...new Set(arr.arrivedColisDetail.map((c: any) => c.receiverName).filter(Boolean) as string[])]
                            const displayReceivers = receivers.slice(0, 2)
                            const remaining = receivers.length - displayReceivers.length
                            return (
                              <div className="flex items-center gap-1 text-xs mt-1 flex-wrap">
                                <span className="text-gray-400">👤</span>
                                {displayReceivers.map((name: string, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold">
                                    {name}
                                  </span>
                                ))}
                                {remaining > 0 && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-semibold">
                                    +{remaining} autre{remaining > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </div>

                        {/* Stats rapides */}
                        <div className="flex items-center gap-4 shrink-0 text-sm">
                          <div className="text-center">
                            <div className="font-bold text-green-600">{arr.arrivedCount}</div>
                            <div className="text-[9px] text-gray-400">bons</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-blue-600">{arr.totalArrivedBoxes || 0}/{arr.totalExpectedBoxes || 0}</div>
                            <div className="text-[9px] text-gray-400">colis</div>
                          </div>
                          {arr.missingCount > 0 && (
                            <div className="text-center">
                              <div className="font-bold text-red-600">{arr.missingCount}</div>
                              <div className="text-[9px] text-gray-400">manq</div>
                            </div>
                          )}
                        </div>

                        {/* Bouton suppression */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteArrivage(arr.id)
                          }}
                          disabled={deletingArrivage === arr.id}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title="Supprimer cet arrivage"
                        >
                          {deletingArrivage === arr.id ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>

                        {/* Icône dérouler */}
                        <div className={`p-1.5 rounded-lg transition ${isOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-100">
                          <div className="flex flex-wrap gap-2 px-4 py-3 bg-gray-50">
                            {arr.totalArrivedBoxes !== undefined && (
                              <span className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-blue-700 font-semibold">
                                <Package className="w-3 h-3" /> {arr.totalArrivedBoxes}/{arr.totalExpectedBoxes} colis
                              </span>
                            )}
                            {arr.totalMissingBoxes > 0 && (
                              <span className="flex items-center gap-1 text-xs bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5 text-orange-700 font-semibold">
                                <AlertTriangle className="w-3 h-3" /> {arr.totalMissingBoxes} colis manquants
                              </span>
                            )}
                            {(arr.colisWithoutBonCount || (arr.colisWithoutBon || []).length) > 0 && (
                              <span className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-700 font-semibold">
                                {arr.colisWithoutBonCount || arr.colisWithoutBon.length} sans bon
                              </span>
                            )}
                          </div>
                          {arr.notes && <p className="text-xs text-gray-400 italic px-4 pb-2">{arr.notes}</p>}

                          {/* Interface de modification d'arrivage */}
                          {(() => {
                            const edit   = histGetEdit(arr.id)
                            const saving = histSaving[arr.id]
                            const pErr   = histPointErr[arr.id]
                            if (!edit) return null
                            const stMap = Object.fromEntries(SERVICE_TYPES.map(s => [s.key, s]))
                            return (
                              <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white border-t border-gray-100">
                                {/* Actions rapides */}
                                <div className="flex gap-2 pb-3 border-b border-gray-200">
                                  <button
                                    onClick={() => {
                                      edit.arrived.forEach((d: any) => {
                                        if (!d.pointed) histTogglePointed(arr.id, d.parcelId)
                                      })
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/30 transition"
                                  >
                                    <CheckSquare className="w-5 h-5" />
                                    <span>Tout pointer</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      edit.arrived.forEach((d: any) => {
                                        if (d.pointed) histTogglePointed(arr.id, d.parcelId)
                                      })
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-700 hover:to-gray-600 text-white font-bold rounded-xl shadow-lg transition"
                                  >
                                    <Square className="w-5 h-5" />
                                    <span>Tout dépointer</span>
                                  </button>
                                </div>

                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                      </div>
                                      Colis arrivés ({edit.arrived.length})
                                    </p>
                                    <div className="px-3 py-1.5 rounded-full bg-green-100 border-2 border-green-200">
                                      <span className="text-sm font-black text-green-700">{edit.arrived.filter((d: any) => d.pointed).length}/{edit.arrived.length}</span>
                                      <span className="text-xs text-green-600 ml-1">pointés</span>
                                    </div>
                                  </div>
                                  {edit.arrived.length === 0 && <p className="text-sm text-gray-400 italic text-center py-4">Aucun colis arrivé</p>}
                                  <div className="space-y-2">
                                    {(edit.arrived as any[]).map((d: any) => {
                                      const total = d.total || d.nbColis || 1
                                      const st = stMap[d.serviceType]
                                      return (
                                        <div key={d.parcelId} className={`group flex items-center gap-3 rounded-xl px-4 py-3 border-2 transition-all cursor-pointer hover:shadow-md ${
                                          d.pointed
                                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-sm'
                                            : 'bg-white border-gray-200 hover:border-blue-300'
                                        }`}
                                        onClick={() => histTogglePointed(arr.id, d.parcelId)}>
                                          {/* Checkbox géante */}
                                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition ${
                                            d.pointed ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-gray-100 group-hover:bg-blue-100'
                                          }`}>
                                            {d.pointed
                                              ? <CheckSquare className="w-7 h-7 text-white" />
                                              : <Square className="w-7 h-7 text-gray-400 group-hover:text-blue-500" />
                                            }
                                          </div>

                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                              <span className="text-sm font-mono font-black text-blue-600">{d.trackingId}</span>
                                              {st && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{st.emoji}</span>}
                                              {d.addedDuringPointage && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">+Nouveau</span>}
                                            </div>
                                            <p className="text-sm text-gray-800 font-semibold truncate">{d.receiverName || '—'}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                              📍 {d.originCity} • ⚖️ {d.weight} kg
                                              {(d.senderNic || d.nexp || d.nExp) && <span className="font-mono text-blue-600 font-bold"> • N° {d.senderNic || d.nexp || d.nExp}</span>}
                                            </p>
                                          </div>
                                          {/* Compteur de colis si multi-colis */}
                                          {total > 1 && (
                                            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                              <button
                                                onClick={() => histSetBoxes(arr.id, d.parcelId, (d.arrived || 0) - 1)}
                                                disabled={(d.arrived || 0) <= 0}
                                                className="w-9 h-9 rounded-lg bg-red-100 hover:bg-red-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition shadow-sm"
                                              >
                                                <Minus className="w-4 h-4 text-red-700" />
                                              </button>
                                              <div className={`px-3 py-2 rounded-lg font-black text-sm min-w-[60px] text-center ${
                                                (d.arrived || 0) === 0 ? 'bg-red-100 text-red-700'
                                                : (d.arrived || 0) < total ? 'bg-orange-100 text-orange-700'
                                                : 'bg-green-100 text-green-700'
                                              }`}>{d.arrived || 0}/{total}</div>
                                              <button
                                                onClick={() => histSetBoxes(arr.id, d.parcelId, (d.arrived || 0) + 1)}
                                                disabled={(d.arrived || 0) >= total}
                                                className="w-9 h-9 rounded-lg bg-green-100 hover:bg-green-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition shadow-sm"
                                              >
                                                <Plus className="w-4 h-4 text-green-700" />
                                              </button>
                                            </div>
                                          )}

                                          {/* Bouton supprimer */}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); histRemoveFromArrived(arr.id, d.parcelId) }}
                                            className="w-10 h-10 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center shrink-0 transition opacity-0 group-hover:opacity-100"
                                            title="Retirer de la liste"
                                          >
                                            <X className="w-5 h-5 text-red-600" />
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>

                                {edit.missing.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> Manquants ({edit.missing.length})
                                    </p>
                                    <div className="space-y-1.5">
                                      {(edit.missing as any[]).map((d: any) => {
                                        const st = stMap[d.serviceType]
                                        return (
                                          <div key={d.parcelId} className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-red-50 border border-red-200">
                                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs font-mono font-bold text-blue-600">{d.trackingId || d.parcelId}</span>
                                                {st && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{st.emoji} {st.label}</span>}
                                              </div>
                                              <p className="text-xs text-gray-500 truncate">
                                                {d.receiverName || '—'} · {d.originCity || '—'}
                                                {(d.senderNic || d.nexp || d.nExp) && <span className="font-mono text-blue-600 font-bold"> · N EXP {d.senderNic || d.nexp || d.nExp}</span>}
                                              </p>
                                            </div>
                                            <button onClick={() => histRecoverMissing(arr.id, d.parcelId)}
                                              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 shrink-0">
                                              <RotateCcw className="w-2.5 h-2.5" /> Trouvé
                                            </button>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Plus className="w-3 h-3 text-blue-500" /> Ajouter un colis
                                  </p>
                                  <div className="flex gap-2">
                                    <input value={histSearchQ} onChange={e => setHistSearchQ(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && histSearchParcel()}
                                      placeholder="N° de tracking (ex: BG-XXXX)"
                                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                                    <button onClick={histSearchParcel} disabled={histSearching || !histSearchQ.trim()}
                                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1">
                                      {histSearching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                                    </button>
                                  </div>
                                  {histSearchErr && <p className="text-xs text-red-600">{histSearchErr}</p>}
                                  {histSearchRes && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-mono font-bold text-blue-600">{histSearchRes.trackingId}</p>
                                        <p className="text-sm font-semibold text-gray-800 truncate">{histSearchRes.receiver?.name}</p>
                                        <p className="text-xs text-gray-500">{histSearchRes.originCity} → {histSearchRes.destinationCity} · <span className="text-orange-600">{histSearchRes.status}</span></p>
                                      </div>
                                      <button onClick={() => histAddSearchResult(arr.id)}
                                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shrink-0">
                                        Ajouter
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {pErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pErr}</p>}

                                <div className="flex gap-2">
                                  <button onClick={() => histSavePointage(arr.id, arr, false)}
                                    disabled={saving || !edit.dirty}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                                    {saving ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                    Enregistrer
                                  </button>
                                  <button onClick={() => histSavePointage(arr.id, arr, true)}
                                    disabled={saving || arr.pointageStatus === 'done'}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40">
                                    {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Valider pointage
                                  </button>
                                </div>
                                {arr.pointedBy && <p className="text-[10px] text-center text-gray-400">Pointé par {arr.pointedBy} le {fmtDate(arr.pointedAt)}</p>}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
