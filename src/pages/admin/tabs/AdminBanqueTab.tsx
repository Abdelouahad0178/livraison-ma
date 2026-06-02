import { auth } from '../../../firebase/config'
import { confirmBankDeposit } from '../../../firebase/bankDeposits'
import { Search, Trash2, ChevronDown, ChevronRight, Building2, Edit2 } from 'lucide-react'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
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

export default function AdminBanqueTab({
  allBankDeposits, centralCodDeposits = [], centralSupplierPayments = [], bankCityFilter, setBankCityFilter,
  bankDatePreset, setBankDatePreset, bankDateFrom, setBankDateFrom, bankDateTo, setBankDateTo,
  bankSearch, setBankSearch, bankConfirmBusy, setBankConfirmBusy, setBankDeleteConfirm,
  centralCash, onOpenCentralCashModal,
}: any) {

          const [expandedDeposits, setExpandedDeposits] = useState<Set<string>>(new Set())

          const toggleExpand = (id: string) => {
            setExpandedDeposits(prev => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }

          const fmtD = (iso: any) => {
            try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
            catch { return iso || '—' }
          }
          const fmtDT = (iso: any) => {
            try {
              const d = new Date(iso)
              return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
            }
            catch { return iso || '—' }
          }
          const depDate = (dep: any) => {
            if (dep.createdAt?.toDate) return dep.createdAt.toDate()
            if (dep.createdAt) return new Date(dep.createdAt)
            return new Date(0)
          }

          // Filtres pour versements centraux
          const cityFilteredCentral = bankCityFilter === 'Toutes'
            ? centralCodDeposits
            : centralCodDeposits.filter((d: any) => d.city === bankCityFilter)
          const dateFilteredCentral = filterByDate(cityFilteredCentral, bankDatePreset, bankDateFrom, bankDateTo, depDate)
          const q = bankSearch.toLowerCase().trim()
          const displayedCentral = q
            ? dateFilteredCentral.filter((d: any) =>
                [d.city, d.agentName, d.amount, d.note, ...(d.parcels || []).flatMap((p: any) => [
                  p.trackingId, p.senderNic, p.senderName, p.senderTel, p.receiverName, p.receiverTel
                ])].some(v => String(v||'').toLowerCase().includes(q))
              )
            : dateFilteredCentral

          const totalCentral = displayedCentral.reduce((s: any, d: any) => s + Number(d.amount||0), 0)
          const totalParcels = displayedCentral.reduce((s: any, d: any) => s + Number(d.parcelCount||0), 0)

          // Calcul des paiements aux fournisseurs (sorties)
          const cityFilteredPayments = bankCityFilter === 'Toutes'
            ? centralSupplierPayments
            : centralSupplierPayments.filter((p: any) =>
                (p.parcels || []).some((pc: any) => pc.originCity === bankCityFilter || pc.destinationCity === bankCityFilter)
              )
          const dateFilteredPayments = filterByDate(cityFilteredPayments, bankDatePreset, bankDateFrom, bankDateTo, depDate)
          const displayedPayments = q
            ? dateFilteredPayments.filter((p: any) =>
                [p.senderName, p.senderTel, p.senderNic, p.chequeNum, p.bankName, p.amount, p.note, ...(p.parcels || []).flatMap((pc: any) => [
                  pc.trackingId, pc.senderNic, pc.receiverName, pc.receiverTel
                ])].some(v => String(v||'').toLowerCase().includes(q))
              )
            : dateFilteredPayments
          const totalPayments = displayedPayments.reduce((s: any, p: any) => s + Number(p.amount||0), 0)
          const totalPaymentsParcels = displayedPayments.reduce((s: any, p: any) => s + Number(p.parcelCount||0), 0)

          // Calcul du solde : Entrées - Sorties
          const totalEntrees = totalCentral
          const totalSorties = totalPayments
          const solde = totalEntrees - totalSorties

          // Filtres pour versements bancaires (ancien système)
          const cityFiltered = bankCityFilter === 'Toutes'
            ? allBankDeposits
            : allBankDeposits.filter((d: any) => d.city === bankCityFilter)
          const dateFiltered = filterByDate(cityFiltered, bankDatePreset, bankDateFrom, bankDateTo, depDate)
          const displayed = q
            ? dateFiltered.filter((d: any) =>
                [d.trackingId, d.senderName, d.receiverName, d.bankName, d.refNum, d.city, d.agentName, d.note]
                  .some(v => String(v||'').toLowerCase().includes(q))
              )
            : dateFiltered

          const pending   = displayed.filter((d: any) => !d.adminConfirmed)
          const confirmed = displayed.filter((d: any) =>  d.adminConfirmed)
          const totalAll  = displayed.reduce((s: any,d: any) => s + Number(d.amount||0), 0)
          const totalPend = pending.reduce((s: any,d: any) => s + Number(d.amount||0), 0)
          const totalConf = confirmed.reduce((s: any,d: any) => s + Number(d.amount||0), 0)

          const allCities = [...new Set([
            ...allBankDeposits.map((d: any) => d.city),
            ...centralCodDeposits.map((d: any) => d.city)
          ].filter(Boolean))].sort()

          const handleConfirm = async (dep: any) => {
            setBankConfirmBusy(dep.id)
            try { await confirmBankDeposit(dep.id, auth.currentUser?.email || 'Admin') }
            catch (e: any) { alert('Erreur: ' + e.message) }
            finally { setBankConfirmBusy('') }
          }

          const handlePrint = () => {
            const rows = displayedCentral.map((dep: any) => `
              <tr>
                <td>${dep.city||'—'}</td>
                <td>${dep.agentName||'—'}</td>
                <td>${dep.parcelCount||0}</td>
                <td style="text-align:right;font-weight:bold">${Number(dep.amount||0).toLocaleString('fr-MA')} DH</td>
                <td>${fmtD(dep.createdAt?.toDate?.()?.toISOString?.() || dep.createdAt)}</td>
                <td>${dep.note||'—'}</td>
              </tr>`).join('')
            const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Banque RETOUR FOND — Versements espèces</title>
<style>
  body{font-family:Arial,sans-serif;margin:20px;font-size:11px}
  h1{font-size:15px;margin-bottom:4px}
  p.sub{color:#666;margin-bottom:14px;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th{background:#1e40af;color:white;padding:5px 6px;text-align:left;font-size:10px}
  td{padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:10px}
  tr:nth-child(even) td{background:#f9fafb}
  .total{margin-top:10px;font-size:13px;font-weight:bold;text-align:right}
  @media print{@page{margin:12mm}}
</style></head><body>
<h1>🏦 Banque RETOUR FOND — Versements espèces des chefs d'agence</h1>
<p class="sub">Imprimé le ${new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})} · ${displayedCentral.length} versement(s)</p>
<table>
  <thead><tr>
    <th>Agence</th><th>Chef d'agence</th><th>Nb colis</th><th>Montant</th><th>Date versement</th><th>Note</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total : ${totalCentral.toLocaleString('fr-MA')} DH · ${totalParcels} colis</p>
</body></html>`
            const w = window.open('','_blank') as any
            w.document.write(html)
            w.document.close()
            w.focus()
            setTimeout(() => w.print(), 400)
          }

          return (
            <div className="mt-4 space-y-4">

              {/* En-tête */}
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{backgroundImage:'radial-gradient(circle at 80% 20%,white 0%,transparent 50%)'}} />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Administration — Encaisseur Central</p>
                    <h2 className="font-black text-2xl mt-0.5">🏦 Banque RETOUR FOND</h2>
                    <p className="text-blue-300 text-xs mt-1">État de la caisse</p>
                  </div>
                  <button onClick={handlePrint}
                    className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
                    🖨️ Imprimer
                  </button>
                </div>

                {/* SOLDE EN GROS */}
                <div className="relative mt-5 bg-white/15 backdrop-blur-sm rounded-2xl p-5 border-2 border-white/30">
                  <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2">💰 Solde Banque RETOUR FOND</p>
                  <p className="font-black text-5xl text-white leading-none">
                    {fmtAmt(solde)} <span className="text-2xl font-bold text-white/90">DH</span>
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-green-400/30 rounded-xl p-3 border border-green-300/40">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">📥</span>
                        <p className="text-green-100 text-[10px] font-bold uppercase">Entrées</p>
                      </div>
                      <p className="font-black text-2xl text-green-100">{fmtAmt(totalEntrees)}</p>
                      <p className="text-green-200 text-[10px] mt-1">{displayedCentral.length} versement(s) · {totalParcels} colis</p>
                    </div>
                    <div className="bg-red-400/30 rounded-xl p-3 border border-red-300/40">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">📤</span>
                        <p className="text-red-100 text-[10px] font-bold uppercase">Sorties</p>
                      </div>
                      <p className="font-black text-2xl text-red-100">{fmtAmt(totalSorties)}</p>
                      <p className="text-red-200 text-[10px] mt-1">{displayedPayments.length} paiement(s) · {totalPaymentsParcels} colis</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CAISSE CENTRALE - Encaisseur */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-100 p-4 rounded-2xl shadow-sm">
                      <Building2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-emerald-900 text-xl flex items-center gap-2">
                        🏦 Caisse Centrale
                      </h3>
                      <p className="text-sm text-emerald-600 mt-0.5">Solde de l'encaisseur central</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-emerald-600 font-semibold uppercase mb-1">Solde Total</div>
                      <div className="text-3xl font-black text-emerald-900">
                        {centralCash ? (parseFloat(centralCash.solde || 0) || 0).toLocaleString('fr-MA') : '—'}{' '}
                        <span className="text-xl text-emerald-700">DH</span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-600">💵</span>
                          <span className="font-semibold text-emerald-800">
                            {centralCash ? (parseFloat(centralCash.soldeEspeces || 0) || 0).toLocaleString('fr-MA') : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-600">📋</span>
                          <span className="font-semibold text-emerald-800">
                            {centralCash ? (parseFloat(centralCash.soldeCheques || 0) || 0).toLocaleString('fr-MA') : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-600">🏦</span>
                          <span className="font-semibold text-emerald-800">
                            {centralCash ? (parseFloat(centralCash.soldeVirement || 0) || 0).toLocaleString('fr-MA') : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={onOpenCentralCashModal}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition font-semibold text-sm shadow-lg hover:shadow-xl"
                    >
                      <Edit2 className="w-5 h-5" />
                      Ajuster Solde
                    </button>
                  </div>
                </div>
              </div>

              {/* Filtres */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                    placeholder="Rechercher (tracking, expéditeur, agence, agent…)"
                    className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  <select value={bankCityFilter} onChange={e => setBankCityFilter(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                    <option value="Toutes">Toutes les agences</option>
                    {(allCities as any[]).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([{k:'all',l:'Tout'},{k:'today',l:"Aujourd'hui"},{k:'week',l:'7 jours'},{k:'month',l:'Ce mois'},{k:'custom',l:'Personnalisé'}] as any[]).map(({k,l}) => (
                    <button key={k} onClick={() => setBankDatePreset(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${bankDatePreset===k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {l}
                    </button>
                  ))}
                  {bankDatePreset === 'custom' && (
                    <div className="flex gap-2">
                      <input type="date" value={bankDateFrom} onChange={e => setBankDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
                      <input type="date" value={bankDateTo} onChange={e => setBankDateTo(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
                    </div>
                  )}
                </div>
              </div>

              {/* Versements centraux */}
              {displayedCentral.length > 0 && (
                <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 flex items-center gap-2">
                    <span className="text-base">💰</span>
                    <h3 className="font-bold text-emerald-800 text-sm">Versements au compte société</h3>
                    <span className="ml-auto text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">{displayedCentral.length}</span>
                    <span className="text-xs font-black text-emerald-700">{fmtAmt(totalCentral)} DH</span>
                  </div>
                  <div className="divide-y divide-emerald-50">
                    {displayedCentral.map((dep: any) => {
                      const isExpanded = expandedDeposits.has(dep.id)
                      const parcels = dep.parcels || []
                      return (
                        <div key={dep.id} className="px-4 py-3">
                          <div className="flex items-start gap-3 cursor-pointer hover:bg-emerald-50/40 rounded-lg px-2 py-1 -mx-2 transition" onClick={() => toggleExpand(dep.id)}>
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-base shrink-0 mt-0.5">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600" /> : <ChevronRight className="w-4 h-4 text-emerald-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">{dep.city}</span>
                                <span className="text-xs font-semibold text-gray-700">{dep.agentName || 'Chef agence'}</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                {dep.parcelCount || 0} colis · Versé le {fmtDT(dep.createdAt?.toDate?.()?.toISOString?.() || dep.createdAt)}
                              </p>
                              {dep.note && <p className="text-xs text-gray-400 italic mt-0.5">{dep.note}</p>}
                              {dep.cashShortage > 0 && (
                                <p className="text-xs text-red-600 font-semibold mt-1">
                                  ⚠️ Manque en caisse : {fmtAmt(dep.cashShortage)} DH
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <p className="font-black text-emerald-700 text-base">{fmtAmt(dep.amount)} DH</p>
                              <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">✓ Versé</span>
                            </div>
                          </div>

                          {/* Détail des colis */}
                          {isExpanded && parcels.length > 0 && (
                            <div className="mt-3 ml-11 mr-2 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                              <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
                                <p className="text-xs font-bold text-gray-700">📦 Détail des colis ({parcels.length})</p>
                              </div>
                              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                                {parcels.map((p: any, idx: number) => (
                                  <div key={idx} className="px-3 py-2 flex items-center gap-2 text-xs hover:bg-white transition">
                                    <span className="font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">{p.trackingId || '—'}</span>
                                    <span className="flex-1 min-w-0 truncate text-gray-700">
                                      {p.senderName || '—'} → {p.receiverName || '—'}
                                    </span>
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.originCity || '—'} → {p.destinationCity || '—'}</span>
                                    <span className="font-bold text-gray-700 shrink-0">{fmtAmt(p.amount)} DH</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Paiements aux expéditeurs (sorties) */}
              {displayedPayments.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
                    <span className="text-base">📤</span>
                    <h3 className="font-bold text-red-800 text-sm">Paiements aux expéditeurs (Sorties)</h3>
                    <span className="ml-auto text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-semibold">{displayedPayments.length}</span>
                    <span className="text-xs font-black text-red-700">{fmtAmt(totalPayments)} DH</span>
                  </div>
                  <div className="divide-y divide-red-50">
                    {displayedPayments.map((pay: any) => {
                      const isExpanded = expandedDeposits.has(pay.id)
                      const parcels = pay.parcels || []
                      return (
                        <div key={pay.id} className="px-4 py-3">
                          <div className="flex items-start gap-3 cursor-pointer hover:bg-red-50/40 rounded-lg px-2 py-1 -mx-2 transition" onClick={() => toggleExpand(pay.id)}>
                            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-base shrink-0 mt-0.5">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-red-600" /> : <ChevronRight className="w-4 h-4 text-red-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-semibold text-gray-700">{pay.senderName || 'Expéditeur'}</span>
                                {pay.senderTel && <span className="text-[10px] text-gray-500">· {pay.senderTel}</span>}
                              </div>
                              <p className="text-xs text-gray-500">
                                {pay.parcelCount || 0} colis · Chèque N° {pay.chequeNum || '—'} · {pay.bankName || '—'}
                              </p>
                              <p className="text-xs text-gray-400">
                                Préparé par {pay.preparedBy || 'Encaisseur'} · {fmtDT(pay.createdAt?.toDate?.()?.toISOString?.() || pay.createdAt)}
                              </p>
                              {pay.note && <p className="text-xs text-gray-400 italic mt-0.5">{pay.note}</p>}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <p className="font-black text-red-700 text-base">{fmtAmt(pay.amount)} DH</p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                pay.status === 'paid'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {pay.status === 'paid' ? '✓ Payé' : '⏳ Préparé'}
                              </span>
                            </div>
                          </div>

                          {/* Détail des colis */}
                          {isExpanded && parcels.length > 0 && (
                            <div className="mt-3 ml-11 mr-2 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                              <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
                                <p className="text-xs font-bold text-gray-700">📦 Détail des colis ({parcels.length})</p>
                              </div>
                              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                                {parcels.map((p: any, idx: number) => (
                                  <div key={idx} className="px-3 py-2 flex items-center gap-2 text-xs hover:bg-white transition">
                                    <span className="font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">{p.trackingId || '—'}</span>
                                    <span className="flex-1 min-w-0 truncate text-gray-700">
                                      {p.receiverName || '—'} · {p.receiverTel || '—'}
                                    </span>
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.originCity || '—'} → {p.destinationCity || '—'}</span>
                                    <span className="font-bold text-gray-700 shrink-0">{fmtAmt(p.amount)} DH</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Versements bancaires anciens (si existants) */}
              {(pending.length > 0 || confirmed.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm font-bold text-amber-800 mb-2">⚠️ Ancien système de versement bancaire</p>
                  <p className="text-xs text-amber-600">Ces versements utilisent l'ancien système. Préférez utiliser le système de versement au compte société.</p>
                </div>
              )}

              {/* Versements en attente de confirmation */}
              {pending.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                    <span className="text-base">⏳</span>
                    <h3 className="font-bold text-amber-800 text-sm">En attente de confirmation admin (ancien système)</h3>
                    <span className="ml-auto text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">{pending.length}</span>
                    <span className="text-xs font-black text-amber-700">{fmtAmt(totalPend)} DH</span>
                  </div>
                  <div className="divide-y divide-amber-50">
                    {pending.map((dep: any) => {
                      const isBusy = bankConfirmBusy === dep.id
                      return (
                        <div key={dep.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-base shrink-0">🏦</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-mono font-bold text-blue-600">{dep.trackingId}</p>
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{dep.city}</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-800">{dep.senderName} → {dep.receiverName}</p>
                            <p className="text-xs text-gray-500">{dep.bankName}{dep.refNum ? ` · N° ${dep.refNum}` : ''} · {dep.depositDate||'—'}</p>
                            <p className="text-xs text-gray-400">Versé par {dep.agentName} · {fmtD(dep.createdAt?.toDate?.()?.toISOString?.() || dep.createdAt)}</p>
                            {dep.note && <p className="text-xs text-gray-400 italic">{dep.note}</p>}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <p className="font-black text-blue-700">{fmtAmt(dep.amount)} DH</p>
                            <div className="flex gap-1">
                              <button onClick={() => handleConfirm(dep)} disabled={isBusy}
                                className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg font-bold transition">
                                {isBusy ? '…' : '✓ Confirmer'}
                              </button>
                              <button onClick={() => setBankDeleteConfirm(dep.id)}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-300 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Versements confirmés */}
              {confirmed.length > 0 && (
                <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-green-100 bg-green-50 flex items-center gap-2">
                    <span className="text-base">✅</span>
                    <h3 className="font-bold text-green-800 text-sm">Versements confirmés (ancien système)</h3>
                    <span className="ml-auto text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-semibold">{confirmed.length}</span>
                    <span className="text-xs font-black text-green-700">{fmtAmt(totalConf)} DH</span>
                  </div>
                  <div className="divide-y divide-green-50">
                    {confirmed.map((dep: any) => (
                      <div key={dep.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-base shrink-0">✅</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-mono font-bold text-blue-600">{dep.trackingId}</p>
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{dep.city}</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-800">{dep.senderName} → {dep.receiverName}</p>
                          <p className="text-xs text-gray-500">{dep.bankName}{dep.refNum ? ` · N° ${dep.refNum}` : ''} · {dep.depositDate||'—'}</p>
                          <p className="text-xs text-gray-400">Versé par {dep.agentName} · Confirmé par {dep.adminConfirmedBy} · {fmtD(dep.adminConfirmedAt)}</p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          <p className="font-black text-green-700">{fmtAmt(dep.amount)} DH</p>
                          <span className="text-[10px] text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded-full">✓ Confirmé</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {displayedCentral.length === 0 && displayed.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <span className="text-5xl">🏦</span>
                  <p className="text-sm mt-3 font-medium">Aucun versement</p>
                  <p className="text-xs mt-1">Les chefs d'agence versent depuis l'onglet RETOUR FOND.</p>
                </div>
              )}

            </div>
          )
}
