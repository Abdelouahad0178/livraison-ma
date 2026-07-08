import React from 'react'
import { X, Check, Send, Lock, Banknote, Wallet, Search, Trash2, MessageCircle } from 'lucide-react'
import { deleteCaisseEntry, deleteCaisseEntryAtomic, collectPortDu, updateParcelStatus } from '../../../firebase/firestore'
import { createCaisseEntry } from '../../../firebase/caisse'
import { CAISSE_CATEGORIES } from '../../../firebase/constants'
import DateFilter from '../DateFilter'
import { useAgentCtx } from '../AgentCtx'
import { entryDate, filterByDate } from '../../../utils/dateFilter'
import { fmt, fmtFixed as fmtAmt } from '../../../utils/formatNumber'

export default function CaisseTab() {
  const {
    uid,
    profile,
    parcels,
    agentEntries,
    agencyCashiers,
    caisseDatePreset,   setCaisseDatePreset,
    caisseDateFrom,     setCaisseDateFrom,
    caisseDateTo,       setCaisseDateTo,
    caisseSearch,       setCaisseSearch,
    debouncedCaisseSearch,
    directTransfer,     setDirectTransfer,
    adminTransferForm,  setAdminTransferForm,
    recoveryRequest,    setRecoveryRequest,
    myAdminTransfers,
    cashRecoveryRequests,
    agentOpsDelete,
    cashierHistoryDelete,
    pointeurRapports,
    pointeurReglements,
    rapportError,       setRapportError,
    rapportNotesMap,    setRapportNotesMap,
    rapportValidating,
    portCollectModal,   setPortCollectModal,
    handleAgentCollectPort,
    handleDirectCashierTransfer,
    handleAdminTransfer,
    handleRequestCashRecovery,
    handleDeleteAgentOperations,
    handleDeleteCashierHistory,
    handleValiderRapport,
    handleRejeterRapport,
  } = useAgentCtx()

  const isChef = profile?.role === 'chef_agence'

  // État pour la sélection multiple des ports dû
  const [selectedPortDu, setSelectedPortDu] = React.useState<Set<string>>(new Set())
  const [bulkCollecting, setBulkCollecting] = React.useState(false)

  // Tout le monde voit uniquement les entrées où il est directement impliqué (agentId ou cashierId)
  // Pour éviter la double comptabilisation lors des transferts agent→caissier
  const myEntries: any[] = agentEntries.filter((e: any) => e.cashierId === uid || e.agentId === uid)

  const dateFilteredEntries = filterByDate(myEntries, caisseDatePreset, caisseDateFrom, caisseDateTo, entryDate) as any[]
  const caisseQuery = (debouncedCaisseSearch || '').trim().toLowerCase()
  const filteredEntries = !caisseQuery ? dateFilteredEntries : dateFilteredEntries.filter(e => {
    const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
    return [
      e.description,
      e.reference,
      e.staffName,
      e.agentName,
      e.cashierName,
      e.note,
      e.type,
      e.category,
      cat?.label,
      e.amount,
    ].some(v => String(v ?? '').toLowerCase().includes(caisseQuery))
  })

  // 🔒 Fonction sécurisée pour parser les montants avec validation stricte
  const safeParseAmount = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const todayE = myEntries.filter(e => {
    const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
    return d >= today
  })
  const todayEntrees = todayE.filter(e => e.type === 'entree').reduce((s, e) => s + safeParseAmount(e.amount), 0)
  const todaySorties = todayE.filter(e => e.type === 'sortie').reduce((s, e) => s + safeParseAmount(e.amount), 0)
  const totalToday   = Math.round((todayEntrees - todaySorties) * 100) / 100

  // Solde de la periode filtree
  const periodEntrees = filteredEntries.filter(e => e.type === 'entree').reduce((s, e) => s + safeParseAmount(e.amount), 0)
  const periodSorties = filteredEntries.filter(e => e.type === 'sortie').reduce((s, e) => s + safeParseAmount(e.amount), 0)
  const soldeCaisse   = Math.round((periodEntrees - periodSorties) * 100) / 100

  const cashiers: any[] = agencyCashiers
    .filter((c: any) => profile?.city && c.city === profile.city)
    .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))

  const remiseAmount = Math.max(0, soldeCaisse)
  const myRecoveryRequests = cashRecoveryRequests.filter((r: any) => r.agentId === uid)

  const portDuPending = parcels.filter((p: any) =>
    p.destinationAgentId === uid &&
    p.portType === 'port_du' &&
    p.portStatus !== 'collected'
  )

  
  const fmtCat = (key: string) => CAISSE_CATEGORIES.find(c => c.key === key) || { emoji: '💱', label: key }

  return (
    <div className="mt-4 space-y-4">

      {/* Filtre de date global */}
      <DateFilter
        value={caisseDatePreset}
        onChange={setCaisseDatePreset}
        from={caisseDateFrom}
        onFromChange={setCaisseDateFrom}
        to={caisseDateTo}
        onToChange={setCaisseDateTo}
        tone="green"
      />

      {/* ── Rapports Pointeur-Encaisseur ── */}
      {profile?.role === 'chef_agence' && (() => {
        
        const fmtD = (iso: any) => { try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso } }
        const modeIcons: Record<string, string> = { especes: '💵', cheque: '📋', traite: '📝' }
        const pending = pointeurRapports.filter((r: any) => r.status === 'soumis')
        const history = pointeurRapports.filter((r: any) => ['valide', 'rejete'].includes(r.status)).slice(0, 8)
        if (pending.length === 0 && history.length === 0) return (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm px-4 py-6 text-center">
            <span className="text-2xl">📋</span>
            <p className="text-sm text-gray-400 mt-2">Aucun rapport du pointeur pour le moment</p>
          </div>
        )
        return (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-indigo-50 flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="font-bold text-gray-700 text-sm">Rapports Pointeur-Encaisseur</h3>
              {pending.length > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ml-1">{pending.length} en attente</span>
              )}
            </div>
            {rapportError && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>{rapportError}</span>
                <button onClick={() => setRapportError('')} className="ml-auto text-red-400 hover:text-red-700 font-bold">✕</button>
              </div>
            )}

            {/* Rapports en attente de validation */}
            {pending.map((rapport: any) => {
              const isBusy = rapportValidating?.startsWith(rapport.id)
              const entries = pointeurReglements.filter((r: any) => rapport.entryIds?.includes(r.id))
              return (
                <div key={rapport.id} className="p-4 space-y-3 border-b border-amber-100 bg-amber-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⏳ En attente</span>
                        <span className="text-xs text-gray-400">Soumis le {fmtD(rapport.submittedAt || rapport.createdAt)}</span>
                      </div>
                      <p className="font-bold text-gray-800 mt-1">{rapport.pointeurName || 'Pointeur'}</p>
                      <p className="text-xs text-gray-400">{rapport.date} · {rapport.nbEntries || entries.length} règlement(s)</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-indigo-700">{fmtAmt(rapport.totalMontant)} DH</p>
                      <div className="flex gap-2 text-xs justify-end mt-0.5 flex-wrap">
                        {rapport.totalEspeces > 0 && <span className="text-green-600">💵 {fmtAmt(rapport.totalEspeces)}</span>}
                        {rapport.totalCheques > 0 && <span className="text-blue-600">📋 {fmtAmt(rapport.totalCheques)}</span>}
                        {rapport.totalTraites > 0 && <span className="text-purple-600">📝 {fmtAmt(rapport.totalTraites)}</span>}
                      </div>
                    </div>
                  </div>

                  {entries.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                      <div className="divide-y divide-gray-50">
                        {entries.map((e: any) => (
                          <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-sm shrink-0">{modeIcons[e.modeReglement] || '💵'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-700 truncate">{e.expediteur || '—'}</p>
                              <p className="text-[11px] text-gray-400">{e.trackingNumber ? `#${e.trackingNumber}` : ''}{e.notes ? ` · ${e.notes}` : ''}</p>
                            </div>
                            <p className="text-xs font-bold text-gray-700 shrink-0">{fmtAmt(e.montant)} DH</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={rapportNotesMap[rapport.id] || ''}
                    onChange={e => setRapportNotesMap((m: any) => ({ ...m, [rapport.id]: e.target.value }))}
                    rows={2} placeholder="Note du chef d'agence (optionnel)..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-indigo-400 focus:outline-none resize-none bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleRejeterRapport(rapport)}
                      disabled={!!isBusy}
                      className="py-2.5 rounded-xl bg-red-100 text-red-700 font-bold text-sm hover:bg-red-200 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                    >
                      {rapportValidating === rapport.id + '_rejeter'
                        ? <><div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /> ...</>
                        : <><X className="w-4 h-4" /> Rejeter</>}
                    </button>
                    <button
                      onClick={() => handleValiderRapport(rapport)}
                      disabled={!!isBusy}
                      className="py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                    >
                      {rapportValidating === rapport.id + '_valider'
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> ...</>
                        : <><Check className="w-4 h-4" /> Valider</>}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Historique rapports */}
            {history.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Historique récent</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {history.map((rapport: any) => {
                    const sc = rapport.status === 'valide'
                      ? { label: '✓ Validé', cls: 'bg-green-100 text-green-700' }
                      : { label: '✗ Rejeté', cls: 'bg-red-100 text-red-700' }
                    return (
                      <div key={rapport.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-700 truncate">{rapport.pointeurName || 'Pointeur'}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                          </div>
                          <p className="text-xs text-gray-400">{fmtD(rapport.validatedAt || rapport.submittedAt)} · {rapport.nbEntries || 0} règl.</p>
                          {rapport.chefNotes && <p className="text-xs text-gray-400 italic mt-0.5">"{rapport.chefNotes}"</p>}
                        </div>
                        <p className="text-sm font-black text-gray-700 shrink-0">{fmtAmt(rapport.totalMontant)} DH</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Résumé du jour */}
      <div className="relative overflow-hidden bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 rounded-3xl p-5 text-white shadow-xl">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-green-200 text-xs font-medium uppercase tracking-wider">Periode filtree</p>
              <h2 className="font-black text-xl mt-0.5">
                {isChef ? `🏛️ Caisse Agence ${profile?.city || ''}` : '💼 Ma Caisse'}
              </h2>
              <p className="text-green-300 text-xs mt-1">
                {isChef ? `Chef d'agence · ${profile?.name}` : `${profile?.name} · Agence ${profile?.city}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-green-200 text-xs">Solde filtré</p>
              <p className={`text-2xl font-black ${soldeCaisse >= 0 ? 'text-white' : 'text-red-300'}`}>{soldeCaisse >= 0 ? '' : '−'}{fmt(Math.abs(soldeCaisse))} DH</p>
              <p className="text-green-300 text-xs mt-0.5">Aujourd'hui : {totalToday >= 0 ? '+' : '−'}{fmt(Math.abs(totalToday))} DH</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Port payé', val: filteredEntries.filter(e => e.type==='entree' && e.category === 'port_paye').reduce((s,e)=>s+safeParseAmount(e.amount),0) },
              { label: 'Port dû',   val: filteredEntries.filter(e => e.type==='entree' && e.category === 'port_du').reduce((s,e)=>s+safeParseAmount(e.amount),0)   },
              { label: 'RETOUR FOND',       val: filteredEntries.filter(e => e.type==='entree' && ['cod_agence','cod_agent','cod_cheque','cod_traite'].includes(e.category)).reduce((s,e)=>s+safeParseAmount(e.amount),0) },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center">
                <p className="text-green-200 text-xs">{label}</p>
                <p className="font-black text-sm text-white">{fmt(val)} DH</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transfert direct vers le caissier */}
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-50 flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-gray-700 text-sm">Transfert direct au caissier de l'agence</h3>
          <span className="ml-auto text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            Disponible {fmt(remiseAmount)} DH
          </span>
        </div>
        {cashiers.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-400">
            Aucun caissier trouve pour {profile?.city || 'cette agence'}.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(directTransfer.error || directTransfer.success) && (
              <div className={`px-4 py-3 text-xs font-semibold ${directTransfer.error ? 'text-red-600 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>
                {directTransfer.error || directTransfer.success}
              </div>
            )}
            {cashiers.map((cashier: any) => {
              return (
                <div key={cashier.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{cashier.name || 'Caissier'}</p>
                    <p className="text-xs text-gray-400">{cashier.city || profile?.city || 'Agence'}{cashier.tel ? ` · ${cashier.tel}` : ''}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                    <input
                      type="number"
                      min="0"
                      max={remiseAmount}
                      value={directTransfer.cashierId === cashier.id ? directTransfer.amount : ''}
                      onChange={e => setDirectTransfer((m: any) => ({ ...m, cashierId: cashier.id, amount: e.target.value, error: '', success: '' }))}
                      placeholder="Montant"
                      className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleDirectCashierTransfer}
                      disabled={directTransfer.loading || directTransfer.cashierId !== cashier.id || remiseAmount <= 0}
                      className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                    >
                      {directTransfer.loading && directTransfer.cashierId === cashier.id
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transfert...</>
                        : <><Send className="w-3.5 h-3.5" /> Transferer</>
                      }
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Transfert à l'Admin */}
      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-purple-50 flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-600" />
          <h3 className="font-bold text-gray-700 text-sm">Transfert direct a l'Admin</h3>
          <span className="ml-auto text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
            Disponible {fmt(remiseAmount)} DH
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="number" min="0" max={remiseAmount}
              value={adminTransferForm.amount}
              onChange={e => setAdminTransferForm((m: any) => ({ ...m, amount: e.target.value, error: '', success: '' }))}
              placeholder={`Montant (max ${fmt(remiseAmount)} DH)`}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
            <input
              value={adminTransferForm.note}
              onChange={e => setAdminTransferForm((m: any) => ({ ...m, note: e.target.value, error: '', success: '' }))}
              placeholder="Motif (optionnel)"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          {(adminTransferForm.error || adminTransferForm.success) && (
            <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${adminTransferForm.error ? 'text-red-600 bg-red-50 border border-red-100' : 'text-purple-700 bg-purple-50 border border-purple-100'}`}>
              {adminTransferForm.error || adminTransferForm.success}
            </div>
          )}
          <button
            onClick={handleAdminTransfer}
            disabled={adminTransferForm.loading || remiseAmount <= 0}
            className="w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-3 rounded-xl transition"
          >
            {adminTransferForm.loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transfert...</>
              : <><Send className="w-4 h-4" /> Envoyer a l'Admin</>}
          </button>
        </div>

        {/* Historique des transferts avec statuts clairs */}
        {myAdminTransfers.length > 0 && (() => {
          const pending = myAdminTransfers.filter((t: any) => t.status === 'pending')
          const confirmed = myAdminTransfers.filter((t: any) => t.status === 'confirmed')
          const [showAll, setShowAll] = React.useState(false)
          const displayTransfers = showAll ? myAdminTransfers : myAdminTransfers.slice(0, 5)

          return (
            <>
              {/* Résumé visuel */}
              {(pending.length > 0 || confirmed.length > 0) && (
                <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-green-50 border-t border-purple-100 grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-amber-600 font-medium mb-0.5">En attente</p>
                    <p className="text-lg font-black text-amber-700">{pending.length}</p>
                    <p className="text-[10px] text-amber-500">{fmt(pending.reduce((s: number, t: any) => s + (t.amount || 0), 0))} DH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-green-600 font-medium mb-0.5">✓ Confirmés</p>
                    <p className="text-lg font-black text-green-700">{confirmed.length}</p>
                    <p className="text-[10px] text-green-500">{fmt(confirmed.reduce((s: number, t: any) => s + (t.amount || 0), 0))} DH</p>
                  </div>
                </div>
              )}

              {/* Liste des transferts */}
              <div className="border-t border-purple-50 divide-y divide-gray-50">
                {displayTransfers.map((t: any) => {
                  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                  const confirmedDate = t.confirmedAt?.toDate ? t.confirmedAt.toDate() : null
                  return (
                    <div key={t.id} className="px-4 py-3 hover:bg-purple-50/30 transition">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-800">{fmt(t.amount)} DH</p>
                          <p className="text-[11px] text-gray-500">{t.note || 'Sans motif'}</p>
                          <p className="text-[11px] text-gray-400">Envoyé le {d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${t.status === 'confirmed' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                          {t.status === 'confirmed' ? '✓ Confirmé' : '⏳ En attente'}
                        </span>
                      </div>
                      {t.status === 'confirmed' && confirmedDate && (
                        <div className="mt-2 pt-2 border-t border-green-100 bg-green-50/50 -mx-4 px-4 py-2">
                          <p className="text-[11px] text-green-700 font-semibold">
                            ✓ Reçu par {t.confirmedBy || 'Admin'} le {confirmedDate.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bouton Voir plus / Voir moins */}
              {myAdminTransfers.length > 5 && (
                <div className="border-t border-purple-50 px-4 py-2 text-center">
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="text-xs text-purple-600 hover:text-purple-700 font-semibold"
                  >
                    {showAll ? '↑ Voir moins' : `↓ Voir tout (${myAdminTransfers.length} transferts)`}
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Recuperer de l'argent du caissier */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-blue-50 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-gray-700 text-sm">Recuperer de l'argent du caissier</h3>
          <span className="ml-auto text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Accord caissier</span>
        </div>
        {cashiers.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-400">
            Aucun caissier trouve pour {profile?.city || 'cette agence'}.
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={recoveryRequest.cashierId}
                onChange={e => setRecoveryRequest((m: any) => ({ ...m, cashierId: e.target.value, error: '', success: '' }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Selectionner un caissier</option>
                {cashiers.map((cashier: any) => (
                  <option key={cashier.id} value={cashier.id}>{cashier.name || 'Caissier'} - {cashier.city}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={recoveryRequest.amount}
                onChange={e => setRecoveryRequest((m: any) => ({ ...m, amount: e.target.value, error: '', success: '' }))}
                placeholder="Montant"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <input
              value={recoveryRequest.description}
              onChange={e => setRecoveryRequest((m: any) => ({ ...m, description: e.target.value, error: '', success: '' }))}
              placeholder="Motif optionnel"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            {(recoveryRequest.error || recoveryRequest.success) && (
              <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${recoveryRequest.error ? 'text-red-600 bg-red-50 border border-red-100' : 'text-blue-700 bg-blue-50 border border-blue-100'}`}>
                {recoveryRequest.error || recoveryRequest.success}
              </div>
            )}
            <button
              onClick={handleRequestCashRecovery}
              disabled={recoveryRequest.loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-3 rounded-xl transition"
            >
              {recoveryRequest.loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Demande...</>
                : <><Send className="w-4 h-4" /> Demander recuperation</>
              }
            </button>
            {myRecoveryRequests.length > 0 && (
              <div className="pt-2 space-y-2">
                {myRecoveryRequests.slice(0, 3).map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-700 truncate">{req.cashierName || 'Caissier'} - {fmt(req.amount)} DH</p>
                      <p className="text-[11px] text-gray-400">{req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Acceptee' : 'Refusee'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      req.status === 'approved' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>{req.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {portDuPending.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-200 flex items-center gap-2">
            <span className="text-base">📮</span>
            <h3 className="font-bold text-orange-700 text-sm">Port dû à encaisser</h3>
            <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{portDuPending.length}</span>
          </div>

          {/* Boutons de sélection et encaissement multiple */}
          {portDuPending.length > 1 && (
            <div className="px-4 py-2 bg-orange-100 border-b border-orange-200 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (selectedPortDu.size === portDuPending.length) {
                    setSelectedPortDu(new Set())
                  } else {
                    setSelectedPortDu(new Set(portDuPending.map((p: any) => p.id)))
                  }
                }}
                className="text-xs bg-white hover:bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg font-semibold border border-orange-300 transition"
              >
                {selectedPortDu.size === portDuPending.length ? '❌ Tout désélectionner' : '☑️ Tout sélectionner'}
              </button>

              {selectedPortDu.size > 0 && (
                <>
                  <span className="text-xs text-orange-700 font-semibold">
                    {selectedPortDu.size} sélectionné(s) • Total: {portDuPending.filter((p: any) => selectedPortDu.has(p.id)).reduce((sum: number, p: any) => sum + safeParseAmount(p.price), 0).toFixed(2)} DH
                  </span>
                  <button
                    onClick={async () => {
                      if (bulkCollecting) return
                      if (!window.confirm(`Encaisser ${selectedPortDu.size} port(s) dû en espèces ?`)) return

                      setBulkCollecting(true)
                      try {
                        const name = profile?.name || 'Agent'
                        for (const parcelId of selectedPortDu) {
                          const parcel = portDuPending.find((p: any) => p.id === parcelId)
                          if (parcel) {
                            // Encaisser le port dû
                            await collectPortDu(parcel.id, name, uid || '')
                            // Créer l'entrée de caisse
                            await createCaisseEntry({
                              type: 'entree',
                              category: 'port_du',
                              amount: parcel.price || 0,
                              description: `Port dû — ${parcel.trackingId} (${parcel.receiver?.name})`,
                              reference: parcel.trackingId,
                              agentId: uid || '',
                              agentName: name,
                              city: profile?.city || parcel.receiver?.city || '',
                              cashierId: uid || '',
                              cashierName: name,
                            })
                            // Mettre à jour le statut du colis
                            await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence — port dû encaissé' })
                          }
                        }
                        setSelectedPortDu(new Set())
                      } catch (err) {
                        console.error('Erreur encaissement multiple:', err)
                        alert('Erreur lors de l\'encaissement multiple. Veuillez réessayer.')
                      } finally {
                        setBulkCollecting(false)
                      }
                    }}
                    disabled={bulkCollecting}
                    className="flex items-center gap-1 text-xs bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-semibold transition ml-auto"
                  >
                    {bulkCollecting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Encaissement...
                      </>
                    ) : (
                      <>
                        <Banknote className="w-3 h-3" /> Encaisser la sélection
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="divide-y divide-orange-100">
            {portDuPending.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                {portDuPending.length > 1 && (
                  <input
                    type="checkbox"
                    checked={selectedPortDu.has(p.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedPortDu)
                      if (e.target.checked) {
                        newSet.add(p.id)
                      } else {
                        newSet.delete(p.id)
                      }
                      setSelectedPortDu(newSet)
                    }}
                    className="w-4 h-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                  />
                )}
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{p.receiver?.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.trackingId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-orange-600">{p.price || 0} DH</span>
                  <button
                    onClick={() => setPortCollectModal({ open: true, parcel: p, paymentType: 'especes', loading: false })}
                    className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                  >
                    <Banknote className="w-3 h-3" /> Encaisser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entrées récentes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center gap-3">
          <Wallet className="w-4 h-4 text-green-500" />
          <h3 className="font-bold text-gray-700 text-sm">Mouvements de caisse</h3>
          <div className="sm:ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filteredEntries.length}</span>
            <button
              onClick={handleDeleteCashierHistory}
              disabled={cashierHistoryDelete.loading}
              className="inline-flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-xl transition"
            >
              {cashierHistoryDelete.loading
                ? <><div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> Suppression...</>
                : <><MessageCircle className="w-3.5 h-3.5" /> Supprimer historique caissier</>
              }
            </button>
            <button
              onClick={() => handleDeleteAgentOperations(agentEntries)}
              disabled={agentOpsDelete.loading || myEntries.length === 0}
              className="inline-flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold px-3 py-1.5 rounded-xl transition"
            >
              {agentOpsDelete.loading
                ? <><div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> Suppression...</>
                : <><Trash2 className="w-3.5 h-3.5" /> Supprimer operations agent</>
              }
            </button>
          </div>
        </div>
        {(agentOpsDelete.error || agentOpsDelete.message) && (
          <div className={`px-4 py-2 text-xs font-semibold border-b ${
            agentOpsDelete.error
              ? 'bg-red-50 text-red-600 border-red-100'
              : 'bg-green-50 text-green-700 border-green-100'
          }`}>
            {agentOpsDelete.error || agentOpsDelete.message}
          </div>
        )}
        {(cashierHistoryDelete.error || cashierHistoryDelete.message) && (
          <div className={`px-4 py-2 text-xs font-semibold border-b ${
            cashierHistoryDelete.error
              ? 'bg-red-50 text-red-600 border-red-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}>
            {cashierHistoryDelete.error || cashierHistoryDelete.message}
          </div>
        )}
        <div className="p-3 border-b border-gray-50">
          <div className="relative mt-0">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              value={caisseSearch}
              onChange={e => setCaisseSearch(e.target.value)}
              placeholder="Rechercher mouvement, catégorie, référence, agent, montant..."
              className="w-full bg-white border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-sm focus:border-green-500 focus:outline-none"
            />
            {caisseSearch && (
              <button
                onClick={() => setCaisseSearch('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
                aria-label="Effacer la recherche caisse"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 px-1 mt-2">
            {filteredEntries.length} mouvement(s)
            {caisseSearch && ` trouvé(s) sur ${dateFilteredEntries.length}`}
          </p>
        </div>
        {filteredEntries.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune entrée enregistrée</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredEntries.slice(0, 20).map(e => {
              const cat = fmtCat(e.category)
              const d   = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 group">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {cat.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{e.description}</p>
                    <p className="text-xs text-gray-400">{cat.label} · {d.toLocaleDateString('fr-MA')}</p>
                  </div>
                  <p className={`text-sm font-black shrink-0 ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                    {e.type === 'entree' ? '+' : '−'}{fmt(e.amount || 0)} DH
                  </p>
                  {/* Protection : seul le créateur ou l'admin peut supprimer les versements livreurs */}
                  {(() => {
                    const isLivreurEntry = ['port_du', 'cod_agence', 'cod_agent', 'cod_cheque', 'cod_traite'].includes(e.category)
                    const isCreator = e.createdById ? (e.createdById === uid) : (e.cashierId === uid || e.agentId === uid)
                    const isAdmin = profile?.role === 'admin'
                    const canDelete = !isLivreurEntry || isCreator || isAdmin

                    if (!canDelete) return null

                    return (
                      <button
                        onClick={async () => {
                          if (!window.confirm('Supprimer ce mouvement ?')) return
                          const amount = safeParseAmount(e.amount)
                          const sign = e.type === 'entree' ? -1 : 1  // Annuler l'opération
                          try {
                            if (e.codParcelId) {
                              // Pour les COD, suppression simple sans ajuster agencyCashes
                              await deleteCaisseEntry(e.id)
                            } else {
                              // Pour les autres entrées, ajuster le solde atomiquement
                              await deleteCaisseEntryAtomic(e.id, profile.city, {
                                soldeDelta:    sign * amount,
                                especesDelta:  sign * amount,
                                lastUpdatedBy: profile?.name || 'Agent',
                              })
                            }
                          } catch (err) {
                            console.error('Erreur suppression:', err)
                            alert('Erreur lors de la suppression.')
                          }
                        }}
                        className="shrink-0 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition text-gray-300 hover:text-red-500"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL PORT DÛ ── */}
      {portCollectModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Encaisser port dû</h3>
                <p className="text-xs font-mono text-orange-600 mt-0.5">{portCollectModal.parcel?.trackingId}</p>
              </div>
              <button
                onClick={() => setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Montant</span>
                <span className="text-xl font-black text-orange-600">{portCollectModal.parcel?.price || 0} DH</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleAgentCollectPort}
                disabled={portCollectModal.loading}
                className="py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {portCollectModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Encaissement...</>
                  : <><Banknote className="w-4 h-4" /> Confirmer</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
