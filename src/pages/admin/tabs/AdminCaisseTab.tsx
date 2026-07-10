import { auth } from '../../../firebase/config'
import { createCaisseCloture, REMARK_TYPES, resolveRemark, deleteRemark } from '../../../firebase/firestore'
import { deleteCaisseEntries } from '../../../firebase/caisse'
import { CAISSE_CATEGORIES } from '../../../firebase/constants'
import { MapPin, Wallet, Lock, Users, AlertTriangle, CheckCircle2, Trash2, X, Settings } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'
import { useState } from 'react'

const filterByDate = (list: any, preset: any, from: any, to: any, getDate: any) => {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  return list.filter((item: any) => {
    const d = getDate(item)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}

export default function AdminCaisseTab({
  caisseEntries, caisseClotures, agencyCashes, updateAgencyCash, users, allRemarks,
  adminDatePreset, adminDateFrom, adminDateTo,
  caisseCityFilter, setCaisseCityFilter, caisseTypeFilter, setCaisseTypeFilter,
  clotureModal, setClotureModal, clotureLoading, setClotureLoading, clotureError, setClotureError,
  remarkCityFilter, setRemarkCityFilter, remarkFilter, setRemarkFilter,
}: any) {
  // 🔧 Modal Admin pour modifier solde caisse agence
  const [editCashModal, setEditCashModal] = useState<any>(null)
  const [editCashLoading, setEditCashLoading] = useState(false)
  const [editCashError, setEditCashError] = useState('')

  // 🔧 Modal pour réinitialiser toutes les caisses à 0
  const [resetAllModal, setResetAllModal] = useState(false)
  const [resetAllLoading, setResetAllLoading] = useState(false)

  // Debug: vérifier si agencyCashes est chargé
  console.log('🔍 AdminCaisseTab - agencyCashes:', agencyCashes)
  console.log('🔍 AdminCaisseTab - updateAgencyCash:', typeof updateAgencyCash)
          const caisseDateFiltered = filterByDate(caisseEntries, adminDatePreset, adminDateFrom, adminDateTo,
            (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0))
          const caisseFull = caisseDateFiltered
            .filter((e: any) => caisseCityFilter === 'Toutes' || e.city === caisseCityFilter)
            .filter((e: any) => caisseTypeFilter === 'all' || e.type === caisseTypeFilter)
          const totalEntrees = caisseFull.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0)
          const totalSorties = caisseFull.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0)
          const solde = totalEntrees - totalSorties

          const cities = [...new Set(caisseEntries.map((e: any) => e.city).filter(Boolean))].sort()

          const catBreakdown = CAISSE_CATEGORIES.map(cat => ({
            ...cat,
            total: caisseFull.filter((e: any) => e.category === cat.key).reduce((s: any, e: any) => s + (e.amount || 0), 0),
            count: caisseFull.filter((e: any) => e.category === cat.key).length,
          })).filter(c => c.total > 0)

          // Dernière clôture par ville
          const lastClotureForCity = (city: any) => caisseClotures
            .filter((c: any) => c.city === city)
            .sort((a: any, b: any) => {
              const da = a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt || 0)
              const db2 = b.closedAt?.toDate ? b.closedAt.toDate() : new Date(b.closedAt || 0)
              return db2.getTime() - da.getTime()
            })[0] || null

          const allEntrees    = caisseDateFiltered.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0)
          const allSorties    = caisseDateFiltered.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0)
          const allSolde      = allEntrees - allSorties
          const citySummaries = cities.map(agCity => {
            const cityEs = caisseDateFiltered.filter((e: any) => e.city === agCity)
            const ent    = cityEs.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0)
            const sor    = cityEs.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0)
            return { city: agCity, entrees: ent, sorties: sor, solde: ent - sor, count: cityEs.length, lastCloture: lastClotureForCity(agCity) }
          })
          const agentUsers = users.filter((u: any) => u.role === 'agent')
          const agentNameMap = new Map(agentUsers
            .filter((u: any) => u.name)
            .map((u: any) => [u.name.trim().toLowerCase(), u]))
          const agentEntriesBase = caisseDateFiltered
            .filter((e: any) => caisseCityFilter === 'Toutes' || e.city === caisseCityFilter)
            .filter((e: any) => caisseTypeFilter === 'all' || e.type === caisseTypeFilter)
          const agentBuckets = new Map()
          const resolveEntryAgent = (e: any) => {
            const linkedId = e.agentId || e.cashierId || null
            const byId = linkedId ? agentUsers.find((u: any) => u.id === linkedId) : null
            if (byId) return { key: byId.id, id: byId.id, name: byId.name || e.agentName || 'Agent', city: byId.city || e.city || '' }
            const normalizedName = e.agentName?.trim().toLowerCase()
            const byName = normalizedName ? agentNameMap.get(normalizedName) : null
            if (byName) return { key: (byName as any).id, id: (byName as any).id, name: (byName as any).name || e.agentName, city: (byName as any).city || e.city || '' }
            if (e.agentName) return { key: `name:${normalizedName}`, id: null, name: e.agentName, city: e.city || '' }
            return null
          }
          agentEntriesBase.forEach((e: any) => {
            const agent = resolveEntryAgent(e)
            if (!agent) return
            const current = agentBuckets.get(agent.key) || { ...agent, entries: [], entrees: 0, sorties: 0, solde: 0 }
            current.entries.push(e)
            if (e.type === 'entree') current.entrees += e.amount || 0
            if (e.type === 'sortie') current.sorties += e.amount || 0
            current.solde = current.entrees - current.sorties
            agentBuckets.set(agent.key, current)
          })
          const agentSummaries = [...agentBuckets.values()]
            .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde))

          const openClotureModal = () => {
            const city = caisseCityFilter === 'Toutes' ? '' : caisseCityFilter
            setClotureModal({ city, note: '' })
            setClotureError('')
          }

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
              const totalE = toClose.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0)
              const totalS = toClose.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0)
              await createCaisseCloture({
                city:         clotureModal.city,
                closedBy:     auth.currentUser?.displayName || 'Admin',
                closedById:   auth.currentUser?.uid,
                periodFrom,
                totalEntrees: totalE,
                totalSorties: totalS,
                solde:        totalE - totalS,
                entriesCount: toClose.length,
                note:         clotureModal.note,
              })
              setClotureModal(null)
            } catch (err: any) { console.error('Cloture error:', err); setClotureError('Erreur : ' + (err?.message || err)) }
            finally { setClotureLoading(false) }
          }

          // 🧹 Fonction de nettoyage des entrées erronées (recherche dans TOUTES les entrées récentes)
          const [cleanupLoading, setCleanupLoading] = (useState as any)(false)
          const now = new Date()
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          const erroneousEntries = caisseEntries.filter((e: any) => {
            const createdAt = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
            return (
              e.type === 'sortie' &&
              e.category === 'port_du' &&
              createdAt > sevenDaysAgo
            )
          })
          const erroneousAmount = erroneousEntries.reduce((s: any, e: any) => s + (e.amount || 0), 0)

          const handleCleanup = async () => {
            if (erroneousEntries.length === 0) {
              alert('Aucune entrée erronée trouvée.')
              return
            }

            const confirmed = window.confirm(
              `⚠️ NETTOYAGE DES ENTRÉES ERRONÉES\n\n` +
              `${erroneousEntries.length} entrées de type "sortie" avec catégorie "port_du" détectées.\n` +
              `Montant total: ${erroneousAmount.toFixed(2)} DH\n\n` +
              `Ces entrées seront SUPPRIMÉES définitivement.\n` +
              `Le solde de la caisse augmentera de ${erroneousAmount.toFixed(2)} DH.\n\n` +
              `Voulez-vous continuer ?`
            )

            if (!confirmed) return

            setCleanupLoading(true)
            try {
              const idsToDelete = erroneousEntries.map((e: any) => e.id)
              await deleteCaisseEntries(idsToDelete)
              alert(`✅ ${idsToDelete.length} entrées erronées supprimées avec succès!\nSolde corrigé: +${erroneousAmount.toFixed(2)} DH`)
              window.location.reload()
            } catch (err: any) {
              console.error('Cleanup error:', err)
              alert('❌ Erreur lors du nettoyage: ' + (err?.message || err))
            } finally {
              setCleanupLoading(false)
            }
          }

          // 🔧 Handler pour modifier le solde d'une agence
          const handleEditAgencyCash = async () => {
            if (!editCashModal?.city) {
              setEditCashError('Ville requise')
              return
            }

            const solde = parseFloat(editCashModal.solde || 0)
            const soldeEspeces = parseFloat(editCashModal.soldeEspeces || 0)
            const soldeCheques = parseFloat(editCashModal.soldeCheques || 0)
            const soldeVirement = parseFloat(editCashModal.soldeVirement || 0)

            if (solde < 0 || soldeEspeces < 0 || soldeCheques < 0 || soldeVirement < 0) {
              setEditCashError('Les montants ne peuvent pas être négatifs')
              return
            }

            setEditCashLoading(true)
            setEditCashError('')

            try {
              await updateAgencyCash(editCashModal.city, {
                solde,
                soldeEspeces,
                soldeCheques,
                soldeVirement,
                lastUpdatedBy: auth.currentUser?.displayName || 'Admin',
              })
              setEditCashModal(null)
              alert(`✅ Solde de ${editCashModal.city} modifié avec succès!`)
            } catch (err: any) {
              console.error('Edit cash error:', err)
              setEditCashError(err?.message || 'Erreur lors de la modification')
            } finally {
              setEditCashLoading(false)
            }
          }

          // Fonction pour réinitialiser TOUTES les caisses d'agence à 0
          const handleResetAllCashes = async () => {
            setResetAllLoading(true)
            try {
              const citiesToReset = citySummaries.map((s: any) => s.city)
              for (const city of citiesToReset) {
                await updateAgencyCash(city, {
                  solde: 0,
                  soldeEspeces: 0,
                  soldeCheques: 0,
                  soldeVirement: 0,
                  lastUpdatedBy: auth.currentUser?.displayName || 'Admin',
                })
              }
              setResetAllModal(false)
              alert(`✅ Toutes les caisses (${citiesToReset.length} agences) ont été réinitialisées à 0!`)
            } catch (err: any) {
              console.error('Reset all error:', err)
              alert(`❌ Erreur: ${err?.message || 'Impossible de réinitialiser'}`)
            } finally {
              setResetAllLoading(false)
            }
          }

          return (
            <div className="mt-4 space-y-5">

              {/* â"€â"€â"€ Caisse Centrale â"€â"€â"€ */}
              <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 rounded-3xl p-5 text-white shadow-xl">
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="text-teal-200 text-xs font-medium uppercase tracking-wider">Vue globale</p>
                      <h2 className="font-black text-xl mt-0.5">🏛️ Caisse Centrale</h2>
                      <p className="text-teal-300 text-xs mt-1">{cities.length} agence(s) · {caisseEntries.length} mouvement(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-teal-200 text-xs">Solde global</p>
                      <p className={`text-2xl font-black ${allSolde >= 0 ? 'text-white' : 'text-orange-300'}`}>
                        {allSolde < 0 ? '−' : ''}{fmt(Math.abs(allSolde))} DH
                      </p>
                      <p className="text-teal-300 text-xs mt-1">{agencyCashes?.length || 0} agence(s) active(s)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3">
                      <p className="text-teal-200 text-xs mb-1">Total Entrées</p>
                      <p className="text-lg font-black text-green-300">{fmt(allEntrees)} DH</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3">
                      <p className="text-teal-200 text-xs mb-1">Total Sorties</p>
                      <p className="text-lg font-black text-red-300">{fmt(allSorties)} DH</p>
                    </div>
                  </div>

                  {/* 🔄 Bouton pour réinitialiser toutes les caisses */}
                  {citySummaries.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => setResetAllModal(true)}
                        className="w-full px-4 py-2.5 bg-red-500/90 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Réinitialiser toutes les caisses à 0
                      </button>
                    </div>
                  )}

                  {/* 🧹 Bouton de nettoyage des entrées erronées */}
                  {erroneousEntries.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <div className="bg-orange-500/20 backdrop-blur-sm rounded-xl p-3 border border-orange-300/30">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-orange-200 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">
                              {erroneousEntries.length} entrée(s) erronée(s) détectée(s)
                            </p>
                            <p className="text-xs text-orange-200 mt-1">
                              Type "sortie" avec catégorie "port_du" • Total: {erroneousAmount.toFixed(2)} DH
                            </p>
                          </div>
                          <button
                            onClick={handleCleanup}
                            disabled={cleanupLoading}
                            className="px-4 py-2 bg-white/90 hover:bg-white disabled:opacity-50 text-orange-700 rounded-lg font-bold text-sm transition flex items-center gap-2 shrink-0"
                          >
                            {cleanupLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
                                Nettoyage...
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4" />
                                Nettoyer
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* â"€â"€â"€ Caisses par agence â"€â"€â"€ */}
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
                    {(citySummaries as any[]).map(({ city: agCity, entrees: agEnt, sorties: agSor, solde: agSolde, count: agCount, lastCloture: agLast }) => {
                      const agencyCash = agencyCashes?.find((c: any) => c.city === agCity) || { solde: agSolde, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 }
                      return (
                      <div key={agCity} className="relative">
                        <div
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
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button
                            onClick={e => { e.stopPropagation(); setClotureModal({ city: agCity, note: '' }); setClotureError('') }}
                            className="text-xs font-bold py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition flex items-center justify-center gap-1">
                            <Lock className="w-3 h-3" /> Clôturer
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              console.log('🔍 Modifier button clicked for:', agCity)
                              console.log('🔍 agencyCash found:', agencyCash)
                              console.log('🔍 agSolde calculated:', agSolde)
                              console.log('🔍 All agencyCashes:', agencyCashes)
                              setEditCashModal({
                                city: agCity,
                                solde: agencyCash.solde !== undefined ? agencyCash.solde : agSolde,
                                soldeEspeces: agencyCash.soldeEspeces || 0,
                                soldeCheques: agencyCash.soldeCheques || 0,
                                soldeVirement: agencyCash.soldeVirement || 0,
                              })
                              setEditCashError('')
                            }}
                            className="text-xs font-bold py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition flex items-center justify-center gap-1">
                            <Settings className="w-3 h-3" /> Modifier
                          </button>
                        </div>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>

              {/* â"€â"€â"€ Caisses par agent â"€â"€â"€ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-400" /> Caisses par agent
                  </h3>
                  <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {agentSummaries.length} agent(s)
                  </span>
                </div>
                {agentSummaries.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucune caisse reliee a un agent pour cette periode</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(agentSummaries as any[]).map(agent => (
                      <div key={agent.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-gray-800 truncate">{agent.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {agent.city || 'Agence non precisee'} · {agent.entries.length} mouvement(s)
                            </p>
                          </div>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            agent.solde >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600'
                          }`}>
                            <Wallet className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                          <div className="bg-green-50 rounded-xl px-2 py-2">
                            <p className="text-[10px] font-bold text-green-600 uppercase">Entrees</p>
                            <p className="text-sm font-black text-green-700 mt-0.5">{fmt(agent.entrees)} DH</p>
                          </div>
                          <div className="bg-red-50 rounded-xl px-2 py-2">
                            <p className="text-[10px] font-bold text-red-500 uppercase">Sorties</p>
                            <p className="text-sm font-black text-red-600 mt-0.5">{fmt(agent.sorties)} DH</p>
                          </div>
                          <div className={`${agent.solde >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-xl px-2 py-2`}>
                            <p className={`text-[10px] font-bold uppercase ${agent.solde >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>Solde</p>
                            <p className={`text-sm font-black mt-0.5 ${agent.solde >= 0 ? 'text-teal-700' : 'text-orange-700'}`}>
                              {agent.solde < 0 ? '−' : ''}{fmt(Math.abs(agent.solde))} DH
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* â"€â"€â"€ Détail agence sélectionnée â"€â"€â"€ */}
              {caisseCityFilter !== 'Toutes' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-8 h-8 bg-teal-100 rounded-xl flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">Détail agence</p>
                        <p className="font-black text-gray-800">{caisseCityFilter}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { key: 'all',    label: 'Tout',    cls: 'bg-teal-600'  },
                          { key: 'entree', label: 'Entrées', cls: 'bg-green-600' },
                          { key: 'sortie', label: 'Sorties', cls: 'bg-red-500'   },
                        ].map(t => (
                          <button key={t.key} onClick={() => setCaisseTypeFilter(t.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                              caisseTypeFilter === t.key ? `${t.cls} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{t.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 rounded-2xl p-4 text-center border border-white shadow-sm">
                      <p className="text-xl font-black text-green-600">{fmt(totalEntrees)}</p>
                      <p className="text-xs text-gray-500 mt-1">Entrées DH</p>
                    </div>
                    <div className="bg-red-50 rounded-2xl p-4 text-center border border-white shadow-sm">
                      <p className="text-xl font-black text-red-600">{fmt(totalSorties)}</p>
                      <p className="text-xs text-gray-500 mt-1">Sorties DH</p>
                    </div>
                    <div className={`${solde >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-2xl p-4 text-center border border-white shadow-sm`}>
                      <p className={`text-xl font-black ${solde >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                        {solde < 0 ? '−' : ''}{fmt(Math.abs(solde))}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Solde DH</p>
                    </div>
                  </div>

                  {catBreakdown.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <h3 className="font-bold text-gray-700 text-sm mb-3">Répartition par catégorie</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {catBreakdown.map(cat => (
                          <div key={cat.key} className={`rounded-xl p-3 ${cat.color}`}>
                            <p className="text-lg">{cat.emoji}</p>
                            <p className="text-xs font-semibold mt-1">{cat.label}</p>
                            <p className="text-sm font-black mt-0.5">{fmt(cat.total)} DH</p>
                            <p className="text-xs opacity-70">{cat.count} opér.</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 px-1">{caisseFull.length} mouvement(s)</p>

                  {caisseFull.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                      <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Aucun mouvement pour cette agence</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="divide-y divide-gray-50">
                        {caisseFull.map((e: any) => {
                          const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                          const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                          return (
                            <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                                {cat?.emoji || '💱'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{e.description}</p>
                                <p className="text-xs text-gray-400">
                                  {cat?.label}
                                  {e.agentName && ` · 🧑‍💼 ${e.agentName}`}
                                  {e.staffName && ` · 👤 ${e.staffName}`}
                                  {e.reference && ` · Réf: ${e.reference}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-black ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                                  {e.type === 'entree' ? '+' : '−'}{fmt(e.amount)} DH
                                </p>
                                <p className="text-xs text-gray-400">{d.toLocaleDateString('fr-MA')}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {caisseClotures.filter((c: any) => c.city === caisseCityFilter).length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-teal-600" />
                        <h3 className="font-bold text-gray-700 text-sm">Historique des clôtures</h3>
                        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {caisseClotures.filter((c: any) => c.city === caisseCityFilter).length}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {caisseClotures
                          .filter((c: any) => c.city === caisseCityFilter)
                          .map((cl: any) => {
                            const dClosed = cl.closedAt?.toDate ? cl.closedAt.toDate() : new Date(cl.closedAt || 0)
                            const dFrom   = cl.periodFrom ? new Date(cl.periodFrom) : null
                            const fmtD = (d: any) => d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            return (
                              <div key={cl.id} className="px-4 py-3 hover:bg-gray-50 transition">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-700">
                                      {dFrom ? `${fmtD(dFrom)} → ${fmtD(dClosed)}` : `Début → ${fmtD(dClosed)}`}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">Par {cl.closedBy} · {cl.entriesCount} opér.</p>
                                    {cl.note && <p className="text-xs text-gray-500 italic mt-0.5">📝 {cl.note}</p>}
                                  </div>
                                  <div className="text-right shrink-0 space-y-0.5">
                                    <p className="text-xs text-green-600 font-semibold">+{fmt(cl.totalEntrees)} DH</p>
                                    <p className="text-xs text-red-500 font-semibold">−{fmt(cl.totalSorties)} DH</p>
                                    <p className={`text-sm font-black ${cl.solde >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                                      {cl.solde < 0 ? '−' : ''}{fmt(Math.abs(cl.solde))} DH
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* â"€â"€â"€ Remarques agents â"€â"€â"€ */}
              {(() => {
                const openCount = allRemarks.filter((r: any) => !r.resolved).length
                const filteredR = allRemarks
                  .filter((r: any) => remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)
                  .filter((r: any) =>
                    remarkFilter === 'all'      ? true :
                    remarkFilter === 'open'     ? !r.resolved :
                    r.resolved
                  )
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${openCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                        <AlertTriangle className={`w-5 h-5 ${openCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 text-sm">Remarques agents</h3>
                        <p className="text-xs text-gray-400">
                          {openCount > 0
                            ? <span className="text-red-500 font-semibold">{openCount} ouverte(s)</span>
                            : <span className="text-green-600 font-semibold">Aucune ouverte ✓</span>
                          }
                          {allRemarks.length > 0 && ` · ${allRemarks.length} au total`}
                        </p>
                      </div>
                    </div>

                    {/* City + status filters */}
                    <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-2 shadow-sm">
                      <div className="flex flex-wrap gap-1.5">
                        {(['Toutes', ...(cities as any[])]).map(c => (
                          <button key={c} onClick={() => setRemarkCityFilter(c)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                              remarkCityFilter === c ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >{c}</button>
                        ))}
                      </div>
                      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                        {[
                          { key: 'open',     label: 'Ouvertes', count: allRemarks.filter((r: any) => !r.resolved && (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                          { key: 'resolved', label: 'Résolues', count: allRemarks.filter((r: any) => r.resolved  && (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                          { key: 'all',      label: 'Toutes',   count: allRemarks.filter((r: any) =>               (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                        ].map(f => (
                          <button key={f.key} onClick={() => setRemarkFilter(f.key)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 ${
                              remarkFilter === f.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {f.label}
                            {f.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${remarkFilter === f.key ? 'bg-white/30' : 'bg-gray-200'}`}>{f.count}</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredR.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-gray-100">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">{remarkFilter === 'open' ? 'Aucune remarque ouverte ✓' : 'Aucune remarque'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredR.map((r: any) => {
                          const rt = REMARK_TYPES.find(t => t.key === r.type) || (REMARK_TYPES as any).at(-1)
                          const d  = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt || 0)
                          return (
                            <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.resolved ? 'border-green-100 opacity-75' : 'border-red-100'}`}>
                              <div className={`px-4 py-3 flex items-center gap-3 ${r.resolved ? 'bg-green-50' : 'bg-red-50'}`}>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border ${rt.color}`}>{rt.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rt.color}`}>{rt.label}</span>
                                    {r.city && <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">📍 {r.city}</span>}
                                    {r.resolved
                                      ? <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Résolue</span>
                                      : <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">Ouverte</span>
                                    }
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {d.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                    {r.caissierName && ` · ${r.caissierName}`}
                                  </p>
                                </div>
                                {r.amount > 0 && (
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-black text-red-600">−{fmt(r.amount)} DH</p>
                                    <p className="text-xs text-gray-400">manquant</p>
                                  </div>
                                )}
                              </div>
                              <div className="px-4 py-3 space-y-1">
                                {r.agentName && (
                                  <p className="text-sm font-semibold text-gray-700">🧑‍💼 <span className="text-blue-700">{r.agentName}</span></p>
                                )}
                                <p className="text-sm text-gray-700">{r.description}</p>
                                <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                                  {!r.resolved && (
                                    <button onClick={() => resolveRemark(r.id)}
                                      className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Résoudre
                                    </button>
                                  )}
                                  <button onClick={() => deleteRemark(r.id)}
                                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition ml-auto">
                                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* â"€â"€â"€ Modal Clôture â"€â"€â"€ */}
              {clotureModal && (() => {
                const last = clotureModal.city ? lastClotureForCity(clotureModal.city) : null
                const periodFrom = last?.periodTo || null
                const toClose = clotureModal.city
                  ? caisseEntries
                      .filter((e: any) => e.city === clotureModal.city)
                      .filter((e: any) => {
                        if (!periodFrom) return true
                        const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                        return d > new Date(periodFrom)
                      })
                  : []
                const totalE = toClose.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0)
                const totalS = toClose.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0)
                const soldeM  = totalE - totalS
                const fmtD = (d: any) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                return (
                  <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
                      <div className="flex items-center justify-between p-5 border-b">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
                            <Lock className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800">Clôturer la caisse</h3>
                            <p className="text-xs text-gray-400">{clotureModal.city || 'Sélectionnez une agence'}</p>
                          </div>
                        </div>
                        <button onClick={() => setClotureModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                          <X className="w-5 h-5 text-gray-500" />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        {clotureError && (
                          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {clotureError}</div>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Agence *</label>
                          <select
                            value={clotureModal.city}
                            onChange={e => setClotureModal((m: any) => ({ ...m, city: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-gray-50"
                          >
                            <option value="">— Sélectionner une agence —</option>
                            {(cities as any[]).map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        {clotureModal.city && (
                          <>
                            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                              <p>📅 Période : <strong className="text-gray-700">{periodFrom ? fmtD(periodFrom) : 'Depuis le début'}</strong> → <strong className="text-gray-700">Aujourd'hui</strong></p>
                              <p>📊 Opérations non clôturées : <strong className="text-gray-700">{toClose.length}</strong></p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-green-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Entrées</p>
                                <p className="font-black text-green-600 text-sm">{fmt(totalE)} DH</p>
                              </div>
                              <div className="bg-red-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Sorties</p>
                                <p className="font-black text-red-600 text-sm">{fmt(totalS)} DH</p>
                              </div>
                              <div className={`${soldeM >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-xl p-3 text-center`}>
                                <p className="text-xs text-gray-500">Solde</p>
                                <p className={`font-black text-sm ${soldeM >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>{soldeM < 0 ? '−' : ''}{fmt(Math.abs(soldeM))} DH</p>
                              </div>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note (optionnel)</label>
                          <input
                            placeholder="Remarque, observations..."
                            value={clotureModal.note}
                            onChange={e => setClotureModal((m: any) => ({ ...m, note: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-gray-50 focus:bg-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <button onClick={() => setClotureModal(null)}
                            className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                            Annuler
                          </button>
                          <button onClick={handleCloture} disabled={clotureLoading || !clotureModal.city}
                            className="py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                            {clotureLoading
                              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Clôture...</>
                              : <><Lock className="w-4 h-4" /> Clôturer</>
                            }
                          </button>
                        </div>
                        {clotureModal.city && toClose.length === 0 && (
                          <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-xl p-2">
                            ⚠️ Aucune opération ouverte — la clôture sera enregistrée avec solde zéro.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* 🔧 MODAL: Modifier solde caisse agence (Admin uniquement) */}
              {editCashModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <Settings className="w-5 h-5 text-orange-600" />
                          Modifier solde caisse
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">Agence: {editCashModal.city}</p>
                      </div>
                      <button onClick={() => setEditCashModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                        <X className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Solde total (DH)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editCashModal.solde}
                          onChange={e => setEditCashModal((m: any) => ({ ...m, solde: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Solde espèces (DH)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editCashModal.soldeEspeces}
                          onChange={e => setEditCashModal((m: any) => ({ ...m, soldeEspeces: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Solde chèques (DH)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editCashModal.soldeCheques}
                          onChange={e => setEditCashModal((m: any) => ({ ...m, soldeCheques: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Solde virement (DH)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editCashModal.soldeVirement}
                          onChange={e => setEditCashModal((m: any) => ({ ...m, soldeVirement: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-orange-700">
                            <strong>Attention:</strong> Vous pouvez modifier directement les soldes sans justification.
                            Vous pouvez même mettre à 0 pour réinitialiser une caisse.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditCashModal((m: any) => ({
                            ...m,
                            solde: '0',
                            soldeEspeces: '0',
                            soldeCheques: '0',
                            soldeVirement: '0'
                          }))
                        }}
                        className="w-full text-xs font-semibold text-red-600 hover:text-red-700 py-2 bg-red-50 hover:bg-red-100 rounded-xl transition"
                      >
                        ⚠️ Réinitialiser à 0
                      </button>
                    </div>

                    {editCashError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                        {editCashError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setEditCashModal(null)}
                        className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleEditAgencyCash}
                        disabled={editCashLoading}
                        className="py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
                      >
                        {editCashLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sauvegarde...
                          </>
                        ) : (
                          <>
                            <Settings className="w-4 h-4" />
                            Modifier
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 🔄 MODAL: Réinitialiser toutes les caisses à 0 */}
              {resetAllModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800">Réinitialiser toutes les caisses</h3>
                        <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible</p>
                      </div>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-red-700 font-semibold mb-2">
                        ⚠️ Attention : Vous êtes sur le point de réinitialiser TOUTES les caisses d'agence à 0
                      </p>
                      <p className="text-xs text-red-600">
                        <strong>{citySummaries.length} agence(s)</strong> seront affectées. Tous les soldes (total, espèces, chèques, virements) seront mis à 0.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setResetAllModal(false)}
                        disabled={resetAllLoading}
                        className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleResetAllCashes}
                        disabled={resetAllLoading}
                        className="py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
                      >
                        {resetAllLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Réinitialisation...
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4" />
                            Confirmer
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