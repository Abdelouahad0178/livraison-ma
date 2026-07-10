import { useState } from 'react'
import { Wallet, MapPin, Lock, TrendingUp, TrendingDown, Banknote, Users, Package } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'
import { CAISSE_CATEGORIES } from '../../../firebase/constants'
import { createCaisseCloture } from '../../../firebase/firestore'
import DirectorVersementsTab from './DirectorVersementsTab'
import VersementAdminModal from '../components/VersementAdminModal'

const TABS = [
  { key: 'overview', label: '📊 Vue Globale', icon: TrendingUp },
  { key: 'vers_livreurs', label: '🚚 Versements Livreurs', icon: Package },
  { key: 'vers_admin', label: '🏛️ Versements Admin', icon: Banknote },
  { key: 'mouvements', label: '📋 Mouvements', icon: Wallet },
]

export default function DirectorCaisseTab({
  user,
  auth,
  profile,
  caisseEntries,
  caisseClotures,
  agencyCash,
  driverVersements,
  adminTransfers,
  confirmDriverVersementChef,
  rejectDriverVersementChef,
  datePreset,
  dateFrom,
  dateTo,
  parcels,
  drivers,
}: any) {
  const [activeTab, setActiveTab] = useState('overview')
  const [caisseCityFilter, setCaisseCityFilter] = useState('Toutes')
  const [caisseTypeFilter, setCaisseTypeFilter] = useState('all')
  const [clotureModal, setClotureModal] = useState<any>(null)
  const [clotureLoading, setClotureLoading] = useState(false)
  const [clotureError, setClotureError] = useState('')
  const [versementAdminModal, setVersementAdminModal] = useState(false)

  // Filtres pour versements livreurs
  const [versLivDriverFilter, setVersLivDriverFilter] = useState('all')
  const [versLivTypeFilter, setVersLivTypeFilter] = useState('all')
  const [versLivPaymentFilter, setVersLivPaymentFilter] = useState('all')
  const [versLivSearch, setVersLivSearch] = useState('')

  // Helper functions
  const caisseDateFn = (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)

  const caisseDateFiltered = caisseEntries.filter((e: any) => {
    if (datePreset === 'all') return true
    const now = new Date()
    let start: any = null, end: any = now
    if (datePreset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
    else if (datePreset === 'week')  { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    else if (datePreset === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
    else if (datePreset === 'custom') { start = dateFrom ? new Date(dateFrom) : null; end = dateTo ? new Date(dateTo+'T23:59:59') : now }
    const d = caisseDateFn(e)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })

  const caisseFull = caisseDateFiltered
    .filter((e: any) => caisseCityFilter === 'Toutes' || e.city === caisseCityFilter)
    .filter((e: any) => caisseTypeFilter === 'all' || e.type === caisseTypeFilter)

  const totalEntrees = caisseFull.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (e.amount || 0), 0)
  const totalSorties = caisseFull.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (e.amount || 0), 0)
  const solde = totalEntrees - totalSorties

  const cities = [...new Set(caisseEntries.map((e: any) => e.city).filter(Boolean))].sort()

  const lastClotureForCity = (city: any) => caisseClotures
    .filter((c: any) => c.city === city)
    .sort((a: any, b: any) => {
      const da  = a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt || 0)
      const db2 = b.closedAt?.toDate ? b.closedAt.toDate() : new Date(b.closedAt || 0)
      return db2.getTime() - da.getTime()
    })[0] || null

  const allEntrees = caisseDateFiltered.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (e.amount || 0), 0)
  const allSorties = caisseDateFiltered.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (e.amount || 0), 0)
  const allSolde = allEntrees - allSorties

  const citySummaries = cities.map(agCity => {
    const cityEs = caisseDateFiltered.filter((e: any) => e.city === agCity)
    const ent = cityEs.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (e.amount || 0), 0)
    const sor = cityEs.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (e.amount || 0), 0)
    return { city: agCity, entrees: ent, sorties: sor, solde: ent - sor, count: cityEs.length, lastCloture: lastClotureForCity(agCity) }
  })

  // Stats pour les versements livreurs
  const versLivPending = driverVersements.filter((v: any) => v.status === 'pending')
  const versLivPendingAmount = versLivPending.reduce((s: number, v: any) => s + (v.amount || 0), 0)
  const versLivConfirmed = driverVersements.filter((v: any) => v.status === 'confirmed').length
  const versLivRejected = driverVersements.filter((v: any) => v.status === 'rejected').length

  // Stats pour les versements admin
  const versAdminPending = adminTransfers.filter((v: any) => v.status === 'pending')
  const versAdminPendingAmount = versAdminPending.reduce((s: number, v: any) => s + (v.amount || 0), 0)
  const versAdminConfirmed = adminTransfers.filter((v: any) => v.status === 'confirmed')
  const versAdminConfirmedAmount = versAdminConfirmed.reduce((s: number, v: any) => s + (v.amount || 0), 0)
  const versAdminRejected = adminTransfers.filter((v: any) => v.status === 'rejected')
  const versAdminRejectedAmount = versAdminRejected.reduce((s: number, v: any) => s + (v.amount || 0), 0)

  // Calcul des soldes par livreur
  const driverBalances = drivers?.map((driver: any) => {
    // COD et Port Dû collectés
    const driverParcels = parcels?.filter((p: any) => p.driverId === driver.id) || []

    const codCollected = driverParcels
      .filter((p: any) => p.codStatus === 'collected_by_driver' || p.codStatus === 'collected_at_destination')
      .reduce((s: number, p: any) => s + (parseFloat(p.codAmount) || 0), 0)

    const portDuCollected = driverParcels
      .filter((p: any) => p.portType === 'port_du' && p.portStatus === 'collected')
      .reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)

    const totalCollected = codCollected + portDuCollected

    // Versements effectués (pending + confirmed)
    const driverVers = driverVersements.filter((v: any) => v.driverId === driver.id && v.status !== 'rejected')
    const totalVersements = driverVers.reduce((s: number, v: any) => s + (v.amount || 0), 0)

    // Solde restant
    const soldeRestant = totalCollected - totalVersements

    return {
      driver,
      codCollected,
      portDuCollected,
      totalCollected,
      totalVersements,
      soldeRestant,
      versements: driverVers,
    }
  }).filter((d: any) => d.totalCollected > 0 || d.versements.length > 0) || []

  // Filtres appliqués sur les versements livreurs
  const versLivFiltered = driverVersements.filter((v: any) => {
    if (versLivDriverFilter !== 'all' && v.driverId !== versLivDriverFilter) return false
    if (versLivTypeFilter !== 'all' && v.type !== versLivTypeFilter) return false
    if (versLivPaymentFilter !== 'all' && v.paymentType !== versLivPaymentFilter) return false
    if (versLivSearch && !v.driverName?.toLowerCase().includes(versLivSearch.toLowerCase())) return false
    return true
  })

  // Liste unique des livreurs qui ont fait des versements
  const driversWithVersements = [...new Set(driverVersements.map((v: any) => ({ id: v.driverId, name: v.driverName })))]
    .filter((d: any) => d.id)

  const handleCloture = async () => {
    if (!clotureModal.city) { setClotureError('Sélectionnez une ville.'); return }
    setClotureLoading(true); setClotureError('')
    try {
      const last = lastClotureForCity(clotureModal.city)
      const periodFrom = last?.periodTo || null
      const toClose = caisseEntries
        .filter((e: any) => e.city === clotureModal.city)
        .filter((e: any) => {
          if (!periodFrom) return true
          const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
          return d > new Date(periodFrom)
        })
      const totalE = toClose.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (e.amount || 0), 0)
      const totalS = toClose.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (e.amount || 0), 0)
      await createCaisseCloture({
        city: clotureModal.city,
        closedBy: profile?.name || 'Directeur',
        closedById: auth.currentUser?.uid,
        periodFrom,
        totalEntrees: totalE,
        totalSorties: totalS,
        solde: totalE - totalS,
        entriesCount: toClose.length,
        note: clotureModal.note,
      })
      setClotureModal(null)
    } catch (err: any) {
      console.error('Cloture error:', err)
      setClotureError('Erreur : ' + (err?.message || err))
    } finally {
      setClotureLoading(false)
    }
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Navigation tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats cards - toujours visibles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Solde Total */}
        <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 rounded-2xl p-4 text-white shadow-lg">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
          <div className="relative">
            <p className="text-teal-200 text-xs mb-1">💰 Solde Total</p>
            <p className={`text-3xl font-black ${allSolde >= 0 ? 'text-white' : 'text-orange-300'}`}>
              {allSolde < 0 ? '−' : ''}{fmt(Math.abs(allSolde))} DH
            </p>
            <div className="mt-3 flex gap-2 text-xs">
              <span className="text-green-300">↑ {fmt(allEntrees)} DH</span>
              <span className="text-red-300">↓ {fmt(allSorties)} DH</span>
            </div>
          </div>
        </div>

        {/* Versements Livreurs */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <p className="text-xs font-semibold text-blue-600">Versements Livreurs</p>
          </div>
          <p className="text-2xl font-black text-blue-700">{versLivPending.length}</p>
          <p className="text-xs text-blue-500 mt-1">{fmt(versLivPendingAmount)} DH en attente</p>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="text-green-600">✓ {versLivConfirmed}</span>
            <span className="text-red-500">✗ {versLivRejected}</span>
          </div>
        </div>

        {/* Versements Admin */}
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-purple-600" />
            <p className="text-xs font-semibold text-purple-600">Versements Admin</p>
          </div>
          <p className="text-2xl font-black text-purple-700">{versAdminPending.length}</p>
          <p className="text-xs text-purple-500 mt-1">{fmt(versAdminPendingAmount)} DH en attente</p>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="text-green-600">✓ {fmt(versAdminConfirmedAmount)} DH</span>
            <span className="text-red-500">✗ {fmt(versAdminRejectedAmount)} DH</span>
          </div>
          <button
            onClick={() => setVersementAdminModal(true)}
            className="mt-3 w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition"
          >
            + Nouveau versement
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Caisses par agence */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" /> Caisses par agence
              </h3>
              {caisseCityFilter !== 'Toutes' && (
                <button onClick={() => { setCaisseCityFilter('Toutes'); setCaisseTypeFilter('all') }}
                  className="ml-auto text-xs text-teal-600 font-semibold hover:underline">
                  ← Toutes les agences
                </button>
              )}
            </div>
            {citySummaries.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucune agence avec des mouvements</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {citySummaries.map(({ city: agCity, entrees: agEnt, sorties: agSor, solde: agSolde, count: agCount, lastCloture: agLast }) => (
                  <div key={agCity}
                    onClick={() => { setCaisseCityFilter(caisseCityFilter === agCity ? 'Toutes' : agCity); setCaisseTypeFilter('all') }}
                    className={`cursor-pointer rounded-2xl p-4 transition border-2 ${
                      caisseCityFilter === agCity
                        ? 'border-teal-500 bg-teal-50 shadow-md'
                        : 'border-transparent bg-white shadow-sm hover:shadow-md hover:border-gray-100'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-gray-800 text-sm truncate">{agCity}</p>
                      {caisseCityFilter === agCity && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{agCount} mouv.</p>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-green-600">↑ {fmt(agEnt)} DH</p>
                      <p className="text-xs font-semibold text-red-500">↓ {fmt(agSor)} DH</p>
                    </div>
                    <p className={`text-base font-black mt-2 ${agSolde >= 0 ? 'text-teal-700' : 'text-orange-600'}`}>
                      {agSolde < 0 ? '−' : ''}{fmt(Math.abs(agSolde))} DH
                    </p>
                    {agLast && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 shrink-0" />
                        {(() => { const d = agLast.closedAt?.toDate?.() || new Date(agLast.closedAt || 0); return d.toLocaleDateString('fr-MA') })()}
                      </p>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setClotureModal({ city: agCity, note: '' }); setClotureError('') }}
                      className="mt-3 w-full text-xs font-bold py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" /> Clôturer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'vers_livreurs' && (
        <div className="space-y-4">
          {/* Soldes par livreur */}
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Soldes restants par livreur
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {driverBalances.map(({ driver, codCollected, portDuCollected, totalCollected, totalVersements, soldeRestant }: any) => (
                <div key={driver.id} className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-md transition">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-gray-800 text-sm truncate">{driver.name}</p>
                    <button
                      onClick={() => setVersLivDriverFilter(versLivDriverFilter === driver.id ? 'all' : driver.id)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                        versLivDriverFilter === driver.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {versLivDriverFilter === driver.id ? 'Voir tous' : 'Filtrer'}
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">💰 COD collecté:</span>
                      <span className="font-semibold text-orange-600">{fmt(codCollected)} DH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">📦 Port Dû collecté:</span>
                      <span className="font-semibold text-blue-600">{fmt(portDuCollected)} DH</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-1.5">
                      <span className="text-gray-600 font-semibold">Total collecté:</span>
                      <span className="font-bold text-gray-800">{fmt(totalCollected)} DH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">✓ Versements:</span>
                      <span className="font-semibold text-green-600">−{fmt(totalVersements)} DH</span>
                    </div>
                    <div className={`flex justify-between border-t border-gray-200 pt-1.5 ${
                      soldeRestant > 0 ? 'bg-red-50' : 'bg-green-50'
                    } -mx-4 px-4 py-2 rounded-b-xl`}>
                      <span className="font-bold text-gray-700">Reste à payer:</span>
                      <span className={`font-black text-base ${
                        soldeRestant > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {fmt(soldeRestant)} DH
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {driverBalances.length === 0 && (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun livreur avec collecte ou versement</p>
                </div>
              )}
            </div>
          </div>

          {/* Filtres */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={versLivSearch}
                  onChange={(e) => setVersLivSearch(e.target.value)}
                  placeholder="Rechercher un livreur..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={versLivDriverFilter}
                onChange={(e) => setVersLivDriverFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Tous les livreurs</option>
                {driversWithVersements.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={versLivTypeFilter}
                onChange={(e) => setVersLivTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Tous types</option>
                <option value="port_du">📦 Port Dû</option>
                <option value="cod">💰 COD</option>
              </select>
              <select
                value={versLivPaymentFilter}
                onChange={(e) => setVersLivPaymentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Tous modes</option>
                <option value="especes">💵 Espèces</option>
                <option value="cheque">📝 Chèque</option>
                <option value="virement">🏦 Virement</option>
              </select>
              {(versLivDriverFilter !== 'all' || versLivTypeFilter !== 'all' || versLivPaymentFilter !== 'all' || versLivSearch) && (
                <button
                  onClick={() => {
                    setVersLivDriverFilter('all')
                    setVersLivTypeFilter('all')
                    setVersLivPaymentFilter('all')
                    setVersLivSearch('')
                  }}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-semibold transition"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Utiliser le composant DirectorVersementsTab avec les versements filtrés */}
          <DirectorVersementsTab
            driverVersements={versLivFiltered}
            confirmDriverVersementChef={confirmDriverVersementChef}
            rejectDriverVersementChef={rejectDriverVersementChef}
            auth={auth}
          />
        </div>
      )}

      {activeTab === 'vers_admin' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Historique des versements vers l'Admin</h3>
              <p className="text-xs text-gray-500 mt-1">Tous vos versements envoyés à l'administration centrale</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Montant</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                        Aucun versement pour le moment
                      </td>
                    </tr>
                  ) : (
                    adminTransfers.map((transfer: any) => {
                      const date = transfer.createdAt?.toDate?.() || new Date(transfer.createdAt || 0)
                      return (
                        <tr key={transfer.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                              {transfer.paymentType === 'especes' && '💵 Espèces'}
                              {transfer.paymentType === 'cheque' && '📝 Chèque'}
                              {transfer.paymentType === 'virement' && '🏦 Virement'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-base font-black text-gray-800">{fmt(transfer.amount)} DH</span>
                          </td>
                          <td className="px-4 py-3">
                            {transfer.status === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold">
                                ⏳ En attente
                              </span>
                            )}
                            {transfer.status === 'confirmed' && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                                  ✅ Validé
                                </span>
                                <p className="text-xs text-gray-400 mt-1">par {transfer.confirmedBy}</p>
                              </div>
                            )}
                            {transfer.status === 'rejected' && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">
                                  ❌ Rejeté
                                </span>
                                <p className="text-xs text-gray-400 mt-1">par {transfer.rejectedBy}</p>
                                {transfer.rejectionReason && (
                                  <p className="text-xs text-red-600 mt-1">Motif: {transfer.rejectionReason}</p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mouvements' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-bold text-gray-800 mb-4">Tous les mouvements de caisse</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Ville</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Catégorie</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {caisseFull.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      Aucun mouvement trouvé
                    </td>
                  </tr>
                ) : (
                  caisseFull.map((e: any) => {
                    const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                    const date = caisseDateFn(e)
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                          {date.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">{e.city || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: cat?.color + '20', color: cat?.color }}>
                            {cat?.label || e.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold ${e.type === 'entree' ? 'text-green-600' : 'text-red-500'}`}>
                            {e.type === 'entree' ? '↑ Entrée' : '↓ Sortie'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-base font-black ${e.type === 'entree' ? 'text-green-600' : 'text-red-500'}`}>
                            {e.type === 'entree' ? '+' : '−'}{fmt(e.amount)} DH
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{e.description || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Clôture */}
      {clotureModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-800 mb-4">Clôturer la caisse - {clotureModal.city}</h3>
            <textarea
              value={clotureModal.note}
              onChange={e => setClotureModal({ ...clotureModal, note: e.target.value })}
              placeholder="Note (optionnel)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4"
              rows={3}
            />
            {clotureError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {clotureError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setClotureModal(null)}
                disabled={clotureLoading}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleCloture}
                disabled={clotureLoading}
                className="py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold transition disabled:opacity-50"
              >
                {clotureLoading ? 'Clôture...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Versement Admin */}
      {versementAdminModal && (
        <VersementAdminModal
          isOpen={versementAdminModal}
          onClose={() => setVersementAdminModal(false)}
          user={user}
          agencyCash={agencyCash}
        />
      )}
    </div>
  )
}
