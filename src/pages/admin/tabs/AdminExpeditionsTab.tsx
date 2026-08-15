import {
  Archive,
  Banknote,
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  ExternalLink,
  Filter,
  Package,
  Plus,
  Printer,
  RotateCcw,
  X,
  Search,
  Zap,
} from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import {
  CITIES,
  COD_PAYMENT_TYPES,
  COD_STATUS,
  STATUSES,
  STATUS_COLORS,
  codCollectedLabel,
} from '../../../firebase/constants'
import { fmt } from '../../../utils/formatNumber'
import { printAdminExpeditions } from '../../../utils/agentPrintUtils'
import VirtualizedTable from '../../../components/VirtualizedTable'

const RETURN_REASONS = [
  'Refus du client',
  'Client injoignable',
  'Adresse incorrecte',
  'Colis endommage',
  'Hors zone',
  'Autre',
]

export default function AdminExpeditionsTab({
  kpis,
  search,
  setSearch,
  cityFilter,
  setCityFilter,
  driverFilter,
  setDriverFilter,
  statusFilter,
  setStatusFilter,
  serviceTypeFilter,
  setServiceTypeFilter,
  portTypeFilter,
  setPortTypeFilter,
  users,
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  filtered,
  totalFiltered,
  displayLimit,
  loadMoreDisplayed,
  showAllDisplayed,
  loading,
  setCodEditModal,
  setNicEditModal,
  setNewParcelModal,
  setStatusModal,
  openAdminEdit,
  allParcels,
  hasMore,
  loadMoreParcels,
  loadingMore,
  openArchiveModal,
  selectCls,
  handleDeleteParcel,
  deleteConfirm,
  deleting,
}: any) {
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printGroupBy, setPrintGroupBy] = useState<'agency' | 'status' | 'none'>('none')
  const [restoringParcel, setRestoringParcel] = useState<string | null>(null)

  // ⚡ Accélérateur de recherche
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [advancedSearchActive, setAdvancedSearchActive] = useState(false)

  // ⚡ Raccourci clavier: Ctrl/Cmd + K pour focus recherche
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
      // Échap pour clear recherche
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearch('')
        searchInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSearch])

  // Rafraîchissement automatique en arrière-plan quand des données sont modifiées
  useEffect(() => {
    const handleDataUpdate = () => {
      // Rafraîchir la page en silence
      window.location.reload()
    }

    // Écouter les modifications de données
    window.addEventListener('parcelDataUpdated', handleDataUpdate)

    // Nettoyer l'écouteur
    return () => {
      window.removeEventListener('parcelDataUpdated', handleDataUpdate)
    }
  }, [])

  const handlePrint = () => {
    if (filtered.length === 0) {
      alert('Aucune expédition à imprimer')
      return
    }
    printAdminExpeditions(filtered, printGroupBy, 'Liste des Expéditions')
    setShowPrintModal(false)
  }

  const handleRestoreParcel = async (parcel: any) => {
    if (!confirm(`Restaurer le colis ${parcel.trackingId} depuis les archives?`)) return

    setRestoringParcel(parcel.id)
    try {
      const { archivedAt, archivedReason, archivedBy, archivedByName, isArchived, _archivedAt, _archivedFrom, ...parcelData } = parcel
      await setDoc(doc(db, 'parcels', parcel.id), parcelData)
      await deleteDoc(doc(db, 'parcels_archive', parcel.id))

      alert('✅ Colis restauré! Rechargez la page pour voir les changements.')
      window.location.reload()
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message)
    } finally {
      setRestoringParcel(null)
    }
  }

  // Fonction pour réparer les dates cassées
  const [repairingDates, setRepairingDates] = useState(false)
  const handleRepairDates = async () => {
    if (!confirm(
      '⚠️ Cette fonction va réparer les expéditions dont createdAt a été modifié par erreur.\n\n' +
      'Elle va:\n' +
      '1. Restaurer createdAt depuis l\'historique (history[0].timestamp)\n' +
      '2. Définir expeditionDate à la date voulue\n\n' +
      'Continuer?'
    )) return

    setRepairingDates(true)
    let repaired = 0
    let errors = 0

    try {
      const { updateDoc, Timestamp } = await import('firebase/firestore')

      for (const parcel of allParcels) {
        try {
          // Vérifier si l'historique existe
          if (!parcel.history || parcel.history.length === 0) continue

          // Récupérer la date originale depuis le premier événement
          const originalTimestamp = parcel.history[0].timestamp
          if (!originalTimestamp) continue

          const originalDate = new Date(originalTimestamp)
          const currentDate = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : null

          if (!currentDate) continue

          // Si les dates sont différentes de plus d'un jour, c'est probablement une erreur
          const diffDays = Math.abs(originalDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)

          if (diffDays > 0.1 && diffDays < 365) { // Plus d'un jour de différence mais moins d'un an
            console.log(`🔧 Réparation ${parcel.trackingId}: ${currentDate.toLocaleDateString()} → ${originalDate.toLocaleDateString()}`)

            // Restaurer createdAt
            const restoredCreatedAt = Timestamp.fromDate(originalDate)

            // Définir expeditionDate à la date que l'utilisateur voulait
            const yyyy = currentDate.getFullYear()
            const mm = String(currentDate.getMonth() + 1).padStart(2, '0')
            const dd = String(currentDate.getDate()).padStart(2, '0')
            const expeditionDate = `${yyyy}-${mm}-${dd}`

            await updateDoc(doc(db, 'parcels', parcel.id), {
              createdAt: restoredCreatedAt,
              expeditionDate: expeditionDate
            })

            repaired++
          }
        } catch (err) {
          console.error(`Erreur sur ${parcel.trackingId}:`, err)
          errors++
        }
      }

      alert(
        `✅ Réparation terminée!\n\n` +
        `📊 Résultats:\n` +
        `- ${repaired} expédition(s) réparée(s)\n` +
        `- ${errors} erreur(s)\n\n` +
        `🔄 Rechargez la page pour voir les changements.`
      )

      if (repaired > 0) {
        setTimeout(() => window.location.reload(), 2000)
      }

    } catch (error: any) {
      alert('❌ Erreur: ' + error.message)
    } finally {
      setRepairingDates(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-2">
        {[
          { label: 'Total colis', value: kpis.total, icon: Package, light: 'bg-blue-50 text-blue-600' },
          { label: 'En cours', value: kpis.enCours, icon: Clock, light: 'bg-orange-50 text-orange-600' },
          { label: 'Livres', value: kpis.livres, icon: CheckCircle, light: 'bg-green-50 text-green-600' },
          { label: 'RETOUR FOND en attente', value: `${fmt(kpis.cod)} DH`, icon: Banknote, light: 'bg-purple-50 text-purple-600' },
        ].map(({ label, value, icon: Icon, light }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${light} flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className="text-xl font-bold text-gray-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bouton Charger plus en HAUT - charge par tranches de 500 ⚡ OPTIMISÉ */}
      {hasMore && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Archive className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-800">Historique complet disponible</h3>
              </div>
              <p className="text-xs text-gray-600">
                {allParcels.length} colis chargés · Charger 500 expéditions supplémentaires pour accéder à plus d'historique
              </p>
            </div>
            <button
              onClick={loadMoreParcels}
              disabled={loadingMore}
              className="ml-4 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg flex items-center gap-2"
            >
              {loadingMore ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Chargement...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Charger 500 de plus
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => setNewParcelModal({
              form: {
                senderNic: '', senderName: '', senderTel: '', senderAddress: '', senderCity: '',
                receiverName: '', receiverTel: '', receiverAddress: '', receiverCity: '',
                weight: '', nbColis: '1', serviceType: 'simple',
                portType: 'port_paye', portPrice: '',
                codAmount: '0',
              },
              loading: false,
              error: ''
            })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition shadow-sm"
            title="Créer une nouvelle expédition"
          >
            <Plus className="w-4 h-4" /> Nouvelle expédition
          </button>
          {/* ⚡ Champ de recherche accéléré avec raccourci clavier */}
          <div className="relative flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (ID, N° EXP, nom, tel...)"
                className={`w-full border-2 rounded-xl pl-10 pr-24 py-2 text-sm bg-white focus:outline-none transition ${
                  search
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 focus:border-blue-400'
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {search && (
                  <button
                    onClick={() => {
                      setSearch('')
                      searchInputRef.current?.focus()
                    }}
                    className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 transition"
                    title="Effacer (Échap)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-300 rounded">
                  <span className="text-[9px]">⌘</span>K
                </kbd>
              </div>
            </div>
            {search && (
              <div className="absolute -bottom-5 left-0 text-[10px] text-blue-600 font-semibold">
                ⚡ {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className={selectCls}>
            <option value="Toutes">Toutes les villes</option>
            {CITIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)} className={selectCls}>
            <option value="Tous">Tous les livreurs</option>
            {users?.filter((u: any) => u.role === 'livreur' || u.role === 'chauffeur').map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.role === 'livreur' ? '🚚' : '🚗'} {u.name} - {u.city}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Statut (multi-select) :</span>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter([])}
                className="text-[10px] text-gray-500 hover:text-gray-700 underline"
              >
                Tout désélectionner
              </button>
              <button
                onClick={() => setStatusFilter([...STATUSES])}
                className="text-[10px] text-blue-600 hover:text-blue-700 underline"
              >
                Tout sélectionner
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => {
              const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
              const active = statusFilter.includes(s)
              return (
                <label
                  key={s}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition whitespace-nowrap border cursor-pointer ${active ? `${sc.bg} ${sc.text} border-current` : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setStatusFilter([...statusFilter, s])
                      } else {
                        setStatusFilter(statusFilter.filter((f: string) => f !== s))
                      }
                    }}
                    className="w-3 h-3 rounded"
                  />
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {s}
                </label>
              )
            })}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Type de service (multi-select) :</span>
            <div className="flex gap-2">
              <button
                onClick={() => setServiceTypeFilter([])}
                className="text-[10px] text-gray-500 hover:text-gray-700 underline"
              >
                Tout désélectionner
              </button>
              <button
                onClick={() => setServiceTypeFilter(['simple', 'especes', 'cheque', 'traite', 'retour_bl'])}
                className="text-[10px] text-blue-600 hover:text-blue-700 underline"
              >
                Tout sélectionner
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'simple', label: 'Simple', emoji: '📦', bg: 'bg-gray-100', text: 'text-gray-700' },
              { key: 'especes', label: 'C/Espèces', emoji: '💵', bg: 'bg-green-100', text: 'text-green-700' },
              { key: 'cheque', label: 'C/Chèque', emoji: '📋', bg: 'bg-blue-100', text: 'text-blue-700' },
              { key: 'traite', label: 'C/Traite', emoji: '📝', bg: 'bg-purple-100', text: 'text-purple-700' },
              { key: 'retour_bl', label: 'Retour BL', emoji: '🧾', bg: 'bg-orange-100', text: 'text-orange-700' },
            ].map(st => {
              const active = serviceTypeFilter.includes(st.key)
              return (
                <label
                  key={st.key}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition whitespace-nowrap border cursor-pointer ${active ? `${st.bg} ${st.text} border-current` : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setServiceTypeFilter([...serviceTypeFilter, st.key])
                      } else {
                        setServiceTypeFilter(serviceTypeFilter.filter((f: string) => f !== st.key))
                      }
                    }}
                    className="w-3 h-3 rounded"
                  />
                  <span>{st.emoji}</span>
                  {st.label}
                </label>
              )
            })}
          </div>
        </div>

        {/* Type de port */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-600">Type de port</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPortTypeFilter([])}
                className="text-[10px] text-gray-500 hover:text-gray-700 underline"
              >
                Effacer
              </button>
              <button
                onClick={() => setPortTypeFilter(['port_paye', 'port_du', 'port_en_compte', 'port_en_compte_expediteur', 'port_en_compte_destinataire'])}
                className="text-[10px] text-blue-600 hover:text-blue-700 underline"
              >
                Tout sélectionner
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'port_paye', label: 'Port payé', emoji: '✅', bg: 'bg-blue-100', text: 'text-blue-700' },
              { key: 'port_du', label: 'Port dû', emoji: '📮', bg: 'bg-orange-100', text: 'text-orange-700' },
              { key: 'port_en_compte', label: 'En compte', emoji: '💼', bg: 'bg-purple-100', text: 'text-purple-700' },
              { key: 'port_en_compte_expediteur', label: 'En compte Exp.', emoji: '📤', bg: 'bg-purple-100', text: 'text-purple-700' },
              { key: 'port_en_compte_destinataire', label: 'En compte Dest.', emoji: '📥', bg: 'bg-purple-100', text: 'text-purple-700' },
            ].map(pt => {
              const active = portTypeFilter.includes(pt.key)
              return (
                <label
                  key={pt.key}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition whitespace-nowrap border cursor-pointer ${active ? `${pt.bg} ${pt.text} border-current` : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPortTypeFilter([...portTypeFilter, pt.key])
                      } else {
                        setPortTypeFilter(portTypeFilter.filter((f: string) => f !== pt.key))
                      }
                    }}
                    className="w-3 h-3 rounded"
                  />
                  <span>{pt.emoji}</span>
                  {pt.label}
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center border-t border-gray-100 pt-3">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {[
            { key: 'all', label: 'Tout' },
            { key: 'today', label: "Aujourd'hui" },
            { key: 'week', label: '7 derniers jours' },
            { key: 'month', label: 'Ce mois' },
            { key: 'custom', label: 'Personnalise' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDatePreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                datePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
              />
              <span className="text-gray-400 text-xs">-</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1 font-semibold">
              {totalFiltered} resultat(s)
              {filtered.length < totalFiltered && (
                <span className="text-blue-600"> · {filtered.length} affichée(s)</span>
              )}
            </span>
            {filtered.length < totalFiltered && (
              <>
                <button
                  onClick={loadMoreDisplayed}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                >
                  <Plus className="w-3.5 h-3.5" /> 150 de plus
                </button>
                <button
                  onClick={showAllDisplayed}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition border border-purple-200"
                >
                  Tout afficher ({totalFiltered})
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <button
            onClick={openArchiveModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
          >
            <Archive className="w-4 h-4" /> Archiver
          </button>
          <button
            onClick={handleRepairDates}
            disabled={repairingDates}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Réparer les expéditions dont createdAt a été modifié par erreur"
          >
            <RotateCcw className={`w-4 h-4 ${repairingDates ? 'animate-spin' : ''}`} />
            {repairingDates ? 'Réparation...' : 'Réparer dates'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <VirtualizedTable
            data={filtered}
            rowHeight={120}
            maxHeight={700}
            className=""
            headerComponent={
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['N EXP', 'Date', 'Expediteur', 'Destinataire', 'Ville', 'Poids', 'Port Payé', 'Port Dû', 'En Compte', 'RETOUR FOND', 'Statut RETOUR FOND', 'Statut', 'Modifier', 'Suivi'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            }
            emptyComponent={
              <div className="px-4 py-12 text-center">
                {!search && cityFilter === 'Toutes' && driverFilter === 'Tous' && statusFilter.length === 0 ? (
                  <div className="text-gray-500">
                    <div className="text-2xl mb-2">🔍</div>
                    <div className="font-semibold">Utilisez la recherche ou les filtres ci-dessus</div>
                    <div className="text-sm text-gray-400 mt-1">Tous les colis filtrés s'affichent automatiquement</div>
                  </div>
                ) : (
                  <div className="text-gray-400">Aucun colis trouvé</div>
                )}
              </div>
            }
            renderRow={(p: any) => {
              const c = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
              const cs = p.codAmount > 0
                ? p.codSenderPaid
                  ? { label: 'Regle', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' }
                  : p.codReceivedBySource && !p.codSenderPaid
                    ? { label: 'Recu - a regler', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' }
                    : p.codSentToSource && !p.codReceivedBySource
                      ? { label: 'En transit source', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' }
                      : COD_STATUS[p.codStatus || 'pending']
                : null
              const paymentTypeKey = (p.serviceType?.split(',')[0]?.trim()) || p.codPaymentType
              const cpt = paymentTypeKey ? COD_PAYMENT_TYPES.find(t => t.key === paymentTypeKey) : null
              const date = p.expeditionDate
                ? new Date(p.expeditionDate).toLocaleDateString('fr-MA')
                : p.createdAt?.toDate?.()
                  ? p.createdAt.toDate().toLocaleDateString('fr-MA')
                  : p.history?.[0]?.timestamp
                    ? new Date(p.history[0].timestamp).toLocaleDateString('fr-MA')
                    : '-'
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{p.senderNic || p.nic || p.sender?.nic || '-'}</span>
                          <button
                            onClick={() => setNicEditModal({ parcel: p, value: p.senderNic || p.nic || p.sender?.nic || '', loading: false, error: '' })}
                            className="p-0.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition"
                            title="Modifier le N° EXP (Admin)"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {p.lastAdminEditAt && (
                            <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-semibold" title={`Modifie admin le ${new Date(p.lastAdminEditAt).toLocaleDateString('fr-MA')}`}>Admin</span>
                          )}
                          {p.isArchived && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold border border-red-200" title="Cette expédition est archivée">
                                <Archive className="w-3 h-3 inline-block mr-0.5" />
                                ARCHIVÉ
                              </span>
                              <button
                                onClick={() => handleRestoreParcel(p)}
                                disabled={restoringParcel === p.id}
                                className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-semibold border border-green-200 hover:bg-green-100 disabled:opacity-50 flex items-center gap-0.5"
                                title="Restaurer depuis les archives"
                              >
                                <RotateCcw className="w-3 h-3" />
                                {restoringParcel === p.id ? 'En cours...' : 'Restaurer'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">ID: {p.trackingId}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{date}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.sender?.name}</p>
                        <p className="text-xs text-gray-400">{p.sender?.tel}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.receiver?.name}</p>
                        <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">{p.receiver?.city}</td>
                      <td className="px-4 py-3 text-gray-600">{p.weight} kg</td>
                      <td className="px-4 py-3">
                        {p.portType === 'port_paye'
                          ? <span className="text-blue-600 font-bold">{p.price || 0} DH</span>
                          : <span className="text-gray-300">-</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {p.portType === 'port_du'
                          ? <span className="text-orange-600 font-bold">{p.price || 0} DH</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(p.portType === 'port_en_compte' || p.portType === 'port_en_compte_expediteur' || p.portType === 'port_en_compte_destinataire')
                          ? <span className="text-purple-600 font-bold">💼 {p.price || 0} DH</span>
                          : <span className="text-gray-300">-</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {p.codAmount > 0
                              ? <span className="text-orange-600 font-bold">{p.codAmount} DH</span>
                              : <span className="text-gray-300">-</span>
                            }
                            <button
                              onClick={() => setCodEditModal({ parcel: p, value: p.codAmount || 0, loading: false, error: '' })}
                              className="p-0.5 rounded hover:bg-orange-50 text-gray-400 hover:text-orange-500 transition"
                              title="Modifier le RETOUR FOND (Admin)"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          {/* 🔄 HISTORIQUE MONTANT COD */}
                          {p.codAmountHistory && p.codAmountHistory.length > 0 && (
                            <div className="text-[10px] text-gray-500 space-y-0.5 border-t border-gray-100 pt-1">
                              {p.codAmountHistory.slice(-3).map((h: any, i: number) => {
                                const date = new Date(h.changedAt)
                                const dateStr = date.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                const timeStr = date.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
                                const userName = h.changedBy?.split('@')[0] || 'Admin'
                                return (
                                  <div key={i} className="flex items-center gap-1">
                                    <span className="text-gray-400">{dateStr} {timeStr}</span>
                                    <span className="text-gray-600 font-medium">{userName}:</span>
                                    <span className="text-red-500">{h.oldAmount} DH</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-green-600">{h.newAmount} DH</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {cs ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${p.codStatus === 'collected' && cpt ? `${cpt.bg} ${cpt.text}` : `${cs.bg} ${cs.text}`}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                              {p.codStatus === 'collected'
                                ? <>{cpt?.emoji} {codCollectedLabel(paymentTypeKey)}</>
                                : cs.label
                              }
                            </span>
                            {p.codStatus !== 'collected' && cpt && <p className="text-[10px] text-gray-400 mt-0.5">{cpt.emoji} {cpt.label}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setStatusModal({ parcel: p, status: p.status, note: '', returnReason: p.returnReason || RETURN_REASONS[0], loading: false, error: '' })}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} hover:opacity-80 transition cursor-pointer`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                          {p.status}
                          <Edit2 className="w-3 h-3 ml-0.5 opacity-60" />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openAdminEdit(p)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition border border-purple-200"
                            title="Modifier tous les champs (Admin)"
                          >
                            <Edit2 className="w-3 h-3" /> Admin
                          </button>
                          <button
                            onClick={() => handleDeleteParcel(p.id)}
                            disabled={deleting === p.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition border ${
                              deleteConfirm === p.id
                                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            } ${deleting === p.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={deleteConfirm === p.id ? 'Cliquer à nouveau pour confirmer' : 'Supprimer l\'expédition'}
                          >
                            {deleting === p.id ? '...' : deleteConfirm === p.id ? '⚠️ Confirmer ?' : '🗑️'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/track?id=${p.trackingId}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 transition">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
              )
            }}
          />
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {allParcels.length} colis chargés · <b className="text-blue-600">{totalFiltered} filtrée(s)</b> · {filtered.length} affichée(s)
              </span>
              <span>RETOUR FOND (affiché) : <b className="text-orange-600">{fmt(filtered.reduce((s: any, p: any) => s + (p.codAmount || 0), 0))} DH</b></span>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'impression */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <Printer className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white">Imprimer les expéditions</h3>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Choisissez comment organiser les expéditions dans le document :
                </p>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                    printGroupBy === 'none' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}>
                    <input
                      type="radio"
                      name="printGroupBy"
                      value="none"
                      checked={printGroupBy === 'none'}
                      onChange={(e) => setPrintGroupBy(e.target.value as any)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-semibold text-gray-800">Sans tri</div>
                      <div className="text-xs text-gray-500">Toutes les expéditions dans l'ordre actuel</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                    printGroupBy === 'agency' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}>
                    <input
                      type="radio"
                      name="printGroupBy"
                      value="agency"
                      checked={printGroupBy === 'agency'}
                      onChange={(e) => setPrintGroupBy(e.target.value as any)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-semibold text-gray-800">Par agence (ville de destination)</div>
                      <div className="text-xs text-gray-500">Grouper par ville de destination</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                    printGroupBy === 'status' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}>
                    <input
                      type="radio"
                      name="printGroupBy"
                      value="status"
                      checked={printGroupBy === 'status'}
                      onChange={(e) => setPrintGroupBy(e.target.value as any)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-semibold text-gray-800">Par statut</div>
                      <div className="text-xs text-gray-500">Grouper par statut de livraison</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>{filtered.length}</strong> expédition(s) sera(ont) imprimée(s)
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
