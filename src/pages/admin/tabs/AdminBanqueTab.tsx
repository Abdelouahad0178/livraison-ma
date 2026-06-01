import { auth } from '../../../firebase/config'
import { confirmBankDeposit } from '../../../firebase/bankDeposits'
import { Search, Trash2 } from 'lucide-react'
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

export default function AdminBanqueTab({
  allBankDeposits, bankCityFilter, setBankCityFilter,
  bankDatePreset, setBankDatePreset, bankDateFrom, setBankDateFrom, bankDateTo, setBankDateTo,
  bankSearch, setBankSearch, bankConfirmBusy, setBankConfirmBusy, setBankDeleteConfirm,
}: any) {
          
          const fmtD = (iso: any) => {
            try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
            catch { return iso || '—' }
          }
          const depDate = (dep: any) => {
            if (dep.createdAt?.toDate) return dep.createdAt.toDate()
            if (dep.createdAt) return new Date(dep.createdAt)
            return new Date(0)
          }

          // Filtres
          const cityFiltered = bankCityFilter === 'Toutes'
            ? allBankDeposits
            : allBankDeposits.filter((d: any) => d.city === bankCityFilter)
          const dateFiltered = filterByDate(cityFiltered, bankDatePreset, bankDateFrom, bankDateTo, depDate)
          const q = bankSearch.toLowerCase().trim()
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

          const allCities = [...new Set(allBankDeposits.map((d: any) => d.city).filter(Boolean))].sort()

          const handleConfirm = async (dep: any) => {
            setBankConfirmBusy(dep.id)
            try { await confirmBankDeposit(dep.id, auth.currentUser?.email || 'Admin') }
            catch (e: any) { alert('Erreur: ' + e.message) }
            finally { setBankConfirmBusy('') }
          }

          const handlePrint = () => {
            const rows = displayed.map((dep: any) => `
              <tr>
                <td>${dep.trackingId||'—'}</td>
                <td>${dep.city||'—'}</td>
                <td>${dep.senderName||'—'}</td>
                <td>${dep.receiverName||'—'}</td>
                <td>${dep.agentName||'—'}</td>
                <td>${dep.bankName||'—'}</td>
                <td>${dep.refNum||'—'}</td>
                <td>${dep.depositDate||'—'}</td>
                <td style="text-align:right;font-weight:bold">${Number(dep.amount||0).toLocaleString('fr-MA')} DH</td>
                <td style="text-align:center">${dep.adminConfirmed ? '✓ Confirmé' : '⏳ En attente'}</td>
              </tr>`).join('')
            const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Banque RETOUR FOND — BG Express</title>
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
<h1>🏦 Banque RETOUR FOND — BG Express</h1>
<p class="sub">Imprimé le ${new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})} · ${displayed.length} versement(s)</p>
<table>
  <thead><tr>
    <th>N° Tracking</th><th>Agence</th><th>Expéditeur</th><th>Destinataire</th><th>Agent</th><th>Banque</th><th>N° Bordereau</th><th>Date versement</th><th>Montant</th><th>Statut</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total : ${totalAll.toLocaleString('fr-MA')} DH · Confirmé : ${totalConf.toLocaleString('fr-MA')} DH · En attente : ${totalPend.toLocaleString('fr-MA')} DH</p>
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
                    <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Administration</p>
                    <h2 className="font-black text-2xl mt-0.5">🏦 Banque RETOUR FOND</h2>
                    <p className="text-blue-300 text-xs mt-1">Versements espèces des chefs d'agence</p>
                  </div>
                  <button onClick={handlePrint}
                    className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
                    🖨️ Imprimer
                  </button>
                </div>
                <div className="relative mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-white/10 rounded-xl p-3 text-center">
                    <p className="text-blue-200 text-[10px] font-medium">Total versé</p>
                    <p className="font-black text-xl mt-0.5">{fmtAmt(totalAll)}</p>
                    <p className="text-blue-300 text-[10px]">DH</p>
                  </div>
                  <div className="bg-amber-400/20 rounded-xl p-3 text-center border border-amber-300/30">
                    <p className="text-amber-200 text-[10px] font-medium">En attente</p>
                    <p className="font-black text-xl mt-0.5 text-amber-300">{fmtAmt(totalPend)}</p>
                    <p className="text-amber-300 text-[10px]">{pending.length} versement(s)</p>
                  </div>
                  <div className="bg-green-400/20 rounded-xl p-3 text-center border border-green-300/30">
                    <p className="text-green-200 text-[10px] font-medium">Confirmé</p>
                    <p className="font-black text-xl mt-0.5 text-green-300">{fmtAmt(totalConf)}</p>
                    <p className="text-green-300 text-[10px]">{confirmed.length} versement(s)</p>
                  </div>
                </div>
              </div>

              {/* Filtres */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                    placeholder="Rechercher (tracking, expéditeur, banque, agent…)"
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

              {/* Versements en attente de confirmation */}
              {pending.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                    <span className="text-base">⏳</span>
                    <h3 className="font-bold text-amber-800 text-sm">En attente de confirmation admin</h3>
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
                    <h3 className="font-bold text-green-800 text-sm">Versements confirmés</h3>
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

              {displayed.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <span className="text-5xl">🏦</span>
                  <p className="text-sm mt-3 font-medium">Aucun versement bancaire</p>
                  <p className="text-xs mt-1">Les chefs d'agence versent depuis l'onglet RETOUR FOND.</p>
                </div>
              )}

            </div>
          )
}
