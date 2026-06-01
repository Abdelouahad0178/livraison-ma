import { auth } from '../../../firebase/config'
import { validerRapport, rejeterRapport } from '../../../firebase/firestore'
import { Banknote, FileText, Search } from 'lucide-react'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'

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

export default function AdminReglementsTab({
  adminReglements, adminRapports, parcels,
  rgAgenceFilter, setRgAgenceFilter, rgModeFilter, setRgModeFilter, rgStatusFilter, setRgStatusFilter,
  rgPointeurFilter, setRgPointeurFilter, rgDatePreset, setRgDatePreset, rgDateFrom, setRgDateFrom, rgDateTo, setRgDateTo,
  rgSearch, setRgSearch, rgTab, setRgTab, rapportValidating, setRapportValidating, rapportNoteInput, setRapportNoteInput,
}: any) {
  // Defensive: ensure arrays are always valid
  const safeReglements = Array.isArray(adminReglements) ? adminReglements : []
  const safeRapports   = Array.isArray(adminRapports)   ? adminRapports   : []
  const safeParcels    = Array.isArray(parcels)          ? parcels          : []
  // Reassign for rest of component
  adminReglements = safeReglements
  adminRapports   = safeRapports
  parcels         = safeParcels

          
          const fmtD = (iso: any) => { try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso || '—' } }
          const MODE_INFO = {
            especes: { label: 'Espèces',       emoji: '💵', bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
            cheque:  { label: 'Contre-Chèque', emoji: '📋', bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
            traite:  { label: 'Traite',         emoji: '📝', bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
          }
          const STATUS_BADGE = {
            en_attente:   'bg-amber-100 text-amber-700',
            encaisse:     'bg-blue-100 text-blue-700',
            remis_chef:   'bg-indigo-100 text-indigo-700',
            verse_banque: 'bg-green-100 text-green-700',
            rejete:       'bg-red-100 text-red-700',
          }
          const STATUS_LABEL = { en_attente: 'En attente', encaisse: 'Encaissé', remis_chef: 'Remis chef', verse_banque: 'Versé banque', rejete: 'Rejeté' }
          const RAPPORT_BADGE = { brouillon: 'bg-gray-100 text-gray-600', soumis: 'bg-amber-100 text-amber-700', valide: 'bg-green-100 text-green-700', rejete: 'bg-red-100 text-red-700' }
          const RAPPORT_LABEL = { brouillon: 'Brouillon', soumis: 'Soumis', valide: 'Validé', rejete: 'Rejeté' }

          // Unique agences et pointeurs pour filtres
          const allAgences   = [...new Set(adminReglements.map((r: any) => r.agencyCity).filter(Boolean))].sort()
          const allPointeurs = [...new Set(adminReglements.map((r: any) => r.pointeurId).filter(Boolean))]
            .map(id => adminReglements.find((r: any) => r.pointeurId === id))
            .filter(Boolean)
            .map(r => ({ id: r.pointeurId, name: r.pointeurName }))

          // Filtre règlements
          const rgFiltered = adminReglements.filter((r: any) => {
            if (rgAgenceFilter !== 'all' && r.agencyCity !== rgAgenceFilter) return false
            if (rgModeFilter !== 'all' && r.modeReglement !== rgModeFilter) return false
            if (rgStatusFilter !== 'all' && r.status !== rgStatusFilter) return false
            if (rgPointeurFilter !== 'all' && r.pointeurId !== rgPointeurFilter) return false
            if (rgSearch) {
              const q = rgSearch.toLowerCase()
              const linkedParcel = r.parcelId ? parcels.find((p: any) => p.id === r.parcelId) : null
              if (![r.trackingNumber, r.expediteurNic, r.senderNic, r.nexp, linkedParcel?.sender?.nic, r.expediteur, r.destinataire, r.banque, r.numeroPiece, r.agencyCity, r.pointeurName]
                .some(v => (v || '').toLowerCase().includes(q))) return false
            }
            return true
          })
          const rgFiltered2 = filterByDate(rgFiltered, rgDatePreset, rgDateFrom, rgDateTo, (r: any) => r.createdAt ? new Date(r.createdAt) : new Date(0))

          // Filtre rapports
          const rpFiltered = adminRapports.filter((r: any) => {
            if (rgAgenceFilter !== 'all' && r.agencyCity !== rgAgenceFilter) return false
            if (rgPointeurFilter !== 'all' && r.pointeurId !== rgPointeurFilter) return false
            return true
          })

          // KPIs
          const totalGlobal    = adminReglements.reduce((s: any, r: any) => s + (r.montant || 0), 0)
          const totalEspeces   = adminReglements.filter((r: any) => r.modeReglement === 'especes').reduce((s: any, r: any) => s + (r.montant || 0), 0)
          const totalCheques   = adminReglements.filter((r: any) => r.modeReglement === 'cheque').reduce((s: any, r: any) => s + (r.montant || 0), 0)
          const totalTraites   = adminReglements.filter((r: any) => r.modeReglement === 'traite').reduce((s: any, r: any) => s + (r.montant || 0), 0)
          const pendingRapports = adminRapports.filter((r: any) => r.status === 'soumis').length

          return (
            <div className="mt-4 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="col-span-2 sm:col-span-1 bg-indigo-600 rounded-2xl p-4 text-white text-center">
                  <p className="text-indigo-200 text-xs">Total global</p>
                  <p className="text-xl font-black">{fmtAmt(totalGlobal)}</p>
                  <p className="text-indigo-300 text-xs">DH · {adminReglements.length} entrées</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-green-600">💵 Espèces</p>
                  <p className="text-lg font-black text-green-700">{fmtAmt(totalEspeces)}</p>
                  <p className="text-xs text-green-500">DH</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-blue-600">📋 Chèques</p>
                  <p className="text-lg font-black text-blue-700">{fmtAmt(totalCheques)}</p>
                  <p className="text-xs text-blue-500">DH</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-purple-600">📝 Traites</p>
                  <p className="text-lg font-black text-purple-700">{fmtAmt(totalTraites)}</p>
                  <p className="text-xs text-purple-500">DH</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-amber-600">Rapports en attente</p>
                  <p className="text-2xl font-black text-amber-700">{pendingRapports}</p>
                  <p className="text-xs text-amber-500">à valider</p>
                </div>
              </div>

              {/* Sous-onglets */}
              <div className="flex gap-2 border-b border-gray-200 pb-0">
                {[
                  { key: 'reglements', label: 'Règlements', count: adminReglements.length },
                  { key: 'rapports',   label: 'Rapports',   count: adminRapports.length },
                ].map(t => (
                  <button key={t.key} onClick={() => setRgTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                      rgTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {t.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${rgTab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                  </button>
                ))}
              </div>

              {/* Filtres communs */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Agence */}
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Agence</label>
                    <select value={rgAgenceFilter} onChange={e => setRgAgenceFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Toutes les agences</option>
                      {(allAgences as any[]).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  {/* Pointeur */}
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Pointeur</label>
                    <select value={rgPointeurFilter} onChange={e => setRgPointeurFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Tous les pointeurs</option>
                      {(allPointeurs as any[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {/* Mode (règlements) */}
                  {rgTab === 'reglements' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Mode</label>
                      <select value={rgModeFilter} onChange={e => setRgModeFilter(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                        <option value="all">Tous les modes</option>
                        <option value="especes">💵 Espèces</option>
                        <option value="cheque">📋 Chèque</option>
                        <option value="traite">📝 Traite</option>
                      </select>
                    </div>
                  )}
                  {/* Statut (règlements) */}
                  {rgTab === 'reglements' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Statut</label>
                      <select value={rgStatusFilter} onChange={e => setRgStatusFilter(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                        <option value="all">Tous les statuts</option>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Date */}
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Période</label>
                    <select value={rgDatePreset} onChange={e => setRgDatePreset(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Toutes les dates</option>
                      <option value="today">Aujourd'hui</option>
                      <option value="week">7 derniers jours</option>
                      <option value="month">Ce mois</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                  </div>
                  {/* Recherche */}
                  {rgTab === 'reglements' && (
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Recherche</label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={rgSearch} onChange={e => setRgSearch(e.target.value)}
                          placeholder="N° expéd., expéditeur, banque, pièce..."
                          className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {rgDatePreset === 'custom' && (
                  <div className="flex gap-2 mt-3">
                    <input type="date" value={rgDateFrom} onChange={e => setRgDateFrom(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                    <span className="text-gray-400 text-xs self-center">au</span>
                    <input type="date" value={rgDateTo} onChange={e => setRgDateTo(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                  </div>
                )}
              </div>

              {/* ── LISTE RÈGLEMENTS ── */}
              {rgTab === 'reglements' && (
                <div className="space-y-2">
                  {rgFiltered2.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                      <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Aucun règlement trouvé</p>
                    </div>
                  ) : rgFiltered2.map((r: any) => {
                    const mi = (MODE_INFO as any)[r.modeReglement] || {}
                    return (
                      <div key={r.id} className={`bg-white rounded-2xl border ${mi.border || 'border-gray-200'} p-4`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{mi.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-800 text-sm">{r.expediteur || '—'}</p>
                              {r.trackingNumber && <span className="font-mono text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.trackingNumber}</span>}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(STATUS_BADGE as any)[r.status] || 'bg-gray-100 text-gray-600'}`}>{(STATUS_LABEL as any)[r.status] || r.status}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {r.agencyCity} · {r.pointeurName} · {fmtD(r.createdAt)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">
                              {r.destinataire && <span>Dest : {r.destinataire}</span>}
                              {r.banque && <span>Banque : {r.banque}</span>}
                              {r.numeroPiece && <span>N° : {r.numeroPiece}</span>}
                              {r.villeExpedition && <span>Ville : {r.villeExpedition}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-lg font-black ${mi.text}`}>{fmtAmt(r.montant)} DH</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {rgFiltered2.length > 0 && (
                    <div className="flex items-center justify-between bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-200">
                      <span className="text-sm text-indigo-600 font-semibold">{rgFiltered2.length} règlement(s) affiché(s)</span>
                      <span className="text-sm font-black text-indigo-700">{fmtAmt(rgFiltered2.reduce((s: any, r: any) => s + (r.montant || 0), 0))} DH</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── LISTE RAPPORTS ── */}
              {rgTab === 'rapports' && (
                <div className="space-y-3">
                  {rpFiltered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Aucun rapport trouvé</p>
                    </div>
                  ) : rpFiltered.map((rapport: any) => {
                    const isSoumis = rapport.status === 'soumis'
                    const isBusy   = rapportValidating?.startsWith(rapport.id)
                    const entries  = adminReglements.filter((r: any) => rapport.entryIds?.includes(r.id))
                    return (
                      <div key={rapport.id} className={`bg-white rounded-2xl border overflow-hidden ${isSoumis ? 'border-amber-300' : 'border-gray-200'}`}>
                        <div className={`flex items-center gap-3 px-4 py-3 ${isSoumis ? 'bg-amber-50' : 'bg-gray-50'} border-b border-gray-100`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-800 text-sm">Rapport du {fmtD(rapport.date)}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(RAPPORT_BADGE as any)[rapport.status] || 'bg-gray-100 text-gray-600'}`}>
                                {(RAPPORT_LABEL as any)[rapport.status] || rapport.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {rapport.agencyCity} · {rapport.pointeurName} · {rapport.nbEntries} règlement(s) · soumis {fmtD(rapport.submittedAt)}
                            </p>
                          </div>
                          <span className="text-base font-black text-gray-800">{fmtAmt(rapport.totalMontant)} DH</span>
                        </div>

                        {/* Détail règlements */}
                        {entries.length > 0 && (
                          <div className="px-4 py-2 space-y-1">
                            {entries.slice(0, 5).map((r: any) => {
                              const mi = (MODE_INFO as any)[r.modeReglement] || {}
                              return (
                                <div key={r.id} className="flex items-center gap-2 text-xs">
                                  <span>{mi.emoji}</span>
                                  <span className="flex-1 text-gray-700 truncate">{r.expediteur || '—'}</span>
                                  {r.banque && <span className="text-gray-400">{r.banque}</span>}
                                  <span className={`font-bold ${mi.text}`}>{fmtAmt(r.montant)} DH</span>
                                </div>
                              )
                            })}
                            {entries.length > 5 && <p className="text-xs text-gray-400 italic">+{entries.length - 5} autres...</p>}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 px-4 pb-3 text-center">
                          {rapport.totalEspeces > 0 && <div className="bg-green-50 rounded-xl p-2"><p className="text-[10px] text-green-600">💵 Espèces</p><p className="text-xs font-bold text-green-700">{fmtAmt(rapport.totalEspeces)} DH</p></div>}
                          {rapport.totalCheques > 0 && <div className="bg-blue-50 rounded-xl p-2"><p className="text-[10px] text-blue-600">📋 Chèques</p><p className="text-xs font-bold text-blue-700">{fmtAmt(rapport.totalCheques)} DH</p></div>}
                          {rapport.totalTraites > 0 && <div className="bg-purple-50 rounded-xl p-2"><p className="text-[10px] text-purple-600">📝 Traites</p><p className="text-xs font-bold text-purple-700">{fmtAmt(rapport.totalTraites)} DH</p></div>}
                        </div>

                        {rapport.notes && (
                          <p className="px-4 pb-2 text-xs text-gray-500"><span className="font-semibold">Note : </span>{rapport.notes}</p>
                        )}
                        {rapport.chefNotes && (
                          <p className={`px-4 pb-2 text-xs ${rapport.status === 'rejete' ? 'text-red-600' : 'text-green-700'}`}>
                            <span className="font-semibold">Chef ({rapport.validatedBy}) : </span>{rapport.chefNotes}
                          </p>
                        )}

                        {/* Actions admin sur rapports soumis */}
                        {isSoumis && (
                          <div className="px-4 pb-3 space-y-2 border-t border-amber-100 pt-2">
                            <input type="text"
                              value={rapportNoteInput[rapport.id] || ''}
                              onChange={e => setRapportNoteInput((n: any) => ({ ...n, [rapport.id]: e.target.value }))}
                              placeholder="Note de validation (optionnel)..."
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-indigo-400 focus:outline-none"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                disabled={!!isBusy}
                                onClick={async () => {
                                  setRapportValidating(rapport.id + '_rejeter')
                                  try { await rejeterRapport(rapport.id, auth.currentUser?.uid, auth.currentUser?.email || 'Admin', rapportNoteInput[rapport.id] || '') } catch {}
                                  setRapportValidating(null)
                                  setRapportNoteInput((n: any) => { const x = {...n}; delete x[rapport.id]; return x })
                                }}
                                className="py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm hover:bg-red-200 disabled:opacity-50 transition flex items-center justify-center gap-1.5">
                                {rapportValidating === rapport.id + '_rejeter' ? '...' : '✕ Rejeter'}
                              </button>
                              <button
                                disabled={!!isBusy}
                                onClick={async () => {
                                  setRapportValidating(rapport.id + '_valider')
                                  try { await validerRapport(rapport.id, auth.currentUser?.uid, auth.currentUser?.email || 'Admin', rapportNoteInput[rapport.id] || '') } catch {}
                                  setRapportValidating(null)
                                  setRapportNoteInput((n: any) => { const x = {...n}; delete x[rapport.id]; return x })
                                }}
                                className="py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 transition flex items-center justify-center gap-1.5">
                                {rapportValidating === rapport.id + '_valider' ? '...' : '✓ Valider'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
}
