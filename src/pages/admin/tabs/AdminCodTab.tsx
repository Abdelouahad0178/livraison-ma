import { Calendar, Search, MessageCircle, CheckCircle, Banknote } from 'lucide-react'
import { COD_STATUS, COD_PAYMENT_TYPES } from '../../../firebase/constants'
import { fmt } from '../../../utils/formatNumber'

// Banknote is available for use in extended payment type display
void Banknote

interface AdminCodTabProps {
  codDatePreset: string
  codDateFrom: string
  codDateTo: string
  setCodDatePreset: (v: string) => void
  setCodDateFrom: (v: string) => void
  setCodDateTo: (v: string) => void
  codDateFiltered: any[]
  codStatsFiltered: any
  codFilter: string
  setCodFilter: (v: string) => void
  codSearch: string
  setCodSearch: (v: string) => void
  codRequestMsg: any
  codRequestDrafts: any
  setCodRequestDrafts: (fn: (d: any) => any) => void
  codRequestBusy: any
  agentCodRequests: any[]
  filteredCod: any[]
  adminEmail: string
  handleBatchSettleAdmin: (parcels: any[]) => void
  handleRemitCod: (p: any) => void
  handleSettleCodAdmin: (p: any) => void
  handleSendCodRequest: (p: any) => void
  handleReplyAgentCodRequest: (req: any) => void
  resolveAgentCodRequest: (id: string, email: string) => void
}

export default function AdminCodTab({
  codDatePreset,
  codDateFrom,
  codDateTo,
  setCodDatePreset,
  setCodDateFrom,
  setCodDateTo,
  codDateFiltered,
  codStatsFiltered,
  codFilter,
  setCodFilter,
  codSearch,
  setCodSearch,
  codRequestMsg,
  codRequestDrafts,
  setCodRequestDrafts,
  codRequestBusy,
  agentCodRequests,
  filteredCod,
  adminEmail,
  handleBatchSettleAdmin,
  handleRemitCod,
  handleSettleCodAdmin,
  handleSendCodRequest,
  handleReplyAgentCodRequest,
  resolveAgentCodRequest,
}: AdminCodTabProps) {
  return (
    <div className="mt-4 space-y-6">

      {/* Filtre date RETOUR FOND */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {[
            { key: 'all',    label: 'Tout' },
            { key: 'today',  label: "Aujourd'hui" },
            { key: 'week',   label: '7 derniers jours' },
            { key: 'month',  label: 'Ce mois' },
            { key: 'custom', label: 'Personnalisé' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setCodDatePreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                codDatePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >{label}</button>
          ))}
          {codDatePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={codDateFrom} onChange={e => setCodDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="date" value={codDateTo} onChange={e => setCodDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1">
            {codDateFiltered.length} colis RETOUR FOND
          </span>
        </div>
      </div>

      {/* KPIs RETOUR FOND */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'En attente',   value: fmt(codStatsFiltered.pendingDH),   sub: `${codDateFiltered.filter((p: any) => !p.codStatus || p.codStatus === 'pending').length} colis`,          bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200',  emoji: '⏳' },
          { label: 'Collecté',     value: fmt(codStatsFiltered.collectedDH), sub: `${codDateFiltered.filter((p: any) => p.codStatus === 'collected').length} colis`,                       bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    emoji: '💰' },
          { label: 'Remis agence', value: fmt(codStatsFiltered.remisDH),     sub: `${codDateFiltered.filter((p: any) => p.codStatus === 'remis' && !p.codSenderPaid).length} colis`,         bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  emoji: '🔄' },
          { label: 'Réglé',        value: fmt(codStatsFiltered.regleDH),     sub: `${codDateFiltered.filter((p: any) => p.codSenderPaid).length} colis`,                                bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   emoji: '✅' },
        ].map(({ label, value, sub, bg, text, border, emoji }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-semibold ${text} mb-1`}>{emoji} {label}</p>
                <p className={`text-3xl font-black ${text}`}>{value} <span className="text-lg">DH</span></p>
                <p className={`text-xs ${text} opacity-70 mt-1`}>{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* By payment type */}
      {codStatsFiltered.byType.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wider">Répartition par mode de paiement</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {codStatsFiltered.byType.map((pt: any) => (
              <div key={pt.key} className={`${pt.bg} border border-current/20 rounded-xl p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{pt.emoji}</span>
                  <span className={`text-sm font-semibold ${pt.text}`}>{pt.label}</span>
                </div>
                <p className={`text-2xl font-black ${pt.text}`}>{fmt(pt.total)} DH</p>
                <p className={`text-xs ${pt.text} opacity-70 mt-0.5`}>{pt.count} colis</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch settle banner */}
      {(() => {
        const unresolved = codDateFiltered.filter((p: any) => (p.codStatus === 'remis' || p.codReceivedBySource) && !p.codSenderPaid)
        if (unresolved.length === 0) return null
        return (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-800">
                {unresolved.length} RETOUR FOND remis — à marquer réglé
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {fmt(unresolved.reduce((s: any, p: any) => s + (p.codAmount || 0), 0))} DH à confirmer
              </p>
            </div>
            <button onClick={() => handleBatchSettleAdmin(unresolved)}
              className="shrink-0 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
              <CheckCircle className="w-4 h-4" /> Tout marquer réglé
            </button>
          </div>
        )
      })()}

      {/* Demandes Admin -> Agents pour RETOUR FOND */}
      {(() => {
        const openCodRequests = agentCodRequests.filter((r: any) => r.status !== 'resolved')
        if (openCodRequests.length === 0 && !codRequestMsg) return null
        return (
          <div className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-amber-700" />
              <h3 className="font-bold text-amber-900 text-sm">Communication RETOUR FOND avec agents</h3>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                {openCodRequests.length} ouverte(s)
              </span>
            </div>
            {codRequestMsg && (
              <div className={`m-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                codRequestMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
              }`}>
                {codRequestMsg.text}
              </div>
            )}
            {openCodRequests.length > 0 && (
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {openCodRequests.slice(0, 8).map((req: any) => (
                  <div key={req.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{req.trackingId} · {req.agentName || 'Agent'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{req.message}</p>
                        {(req.replies || []).slice(-2).map((rep: any, idx: any) => (
                          <p key={idx} className="text-xs mt-1 bg-gray-50 rounded-lg px-2 py-1">
                            <b>{rep.authorRole === 'admin' ? 'Admin' : 'Agent'}:</b> {rep.message}
                          </p>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-amber-600">{fmt(req.codAmount)} DH</p>
                        <button onClick={() => resolveAgentCodRequest(req.id, adminEmail)}
                          className="text-xs text-green-600 font-bold hover:underline mt-1">
                          Clôturer
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input
                        value={codRequestDrafts[`reply_${req.id}`] || ''}
                        onChange={e => setCodRequestDrafts((d: any) => ({ ...d, [`reply_${req.id}`]: e.target.value }))}
                        placeholder="Répondre à l'agent..."
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                      />
                      <button onClick={() => handleReplyAgentCodRequest(req)} disabled={codRequestBusy === req.id}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl">
                        Envoyer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* RETOUR FOND Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={codSearch} onChange={e => setCodSearch(e.target.value)}
              placeholder="Rechercher tracking, N EXP, client, ville..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all',       label: 'Tous' },
              { key: 'pending',   label: '⏳ En attente' },
              { key: 'collected', label: '💰 Collecté' },
              { key: 'remis',     label: '🔄 Remis agence' },
              { key: 'transit',   label: '🚚 En transit source' },
              { key: 'recu',      label: '📥 Reçu — à régler' },
              { key: 'regle',     label: '✅ Réglé' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setCodFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  codFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-205">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Tracking ID','Destinataire','Ville','Montant RETOUR FOND','Mode paiement','Statut RETOUR FOND','Collecté par','Date collecte','Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCod.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">💳 Aucun remboursement trouvé</td></tr>
              ) : filteredCod.map((p: any) => {
                const cs  = p.codSenderPaid
                  ? { label: 'Réglé ✓',          bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  }
                  : p.codReceivedBySource && !p.codSenderPaid
                  ? { label: 'Reçu — à régler',  bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' }
                  : p.codSentToSource && !p.codReceivedBySource
                  ? { label: 'En transit source', bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   }
                  : COD_STATUS[p.codStatus || 'pending']
                const cpt = COD_PAYMENT_TYPES.find((t: any) => t.key === p.codPaymentType)
                const openReq = agentCodRequests.find((r: any) => r.parcelId === p.id && r.status !== 'resolved')
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.receiver?.name}</p>
                      <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-700">{p.receiver?.city}</td>
                    <td className="px-4 py-3">
                      <span className="text-orange-600 font-bold text-base">{p.codAmount} DH</span>
                    </td>
                    <td className="px-4 py-3">
                      {cpt
                        ? <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${(cpt as any).bg} ${(cpt as any).text}`}>{(cpt as any).emoji} {(cpt as any).label}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cs.bg} ${cs.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.codCollectedBy || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {p.codCollectedAt ? new Date(p.codCollectedAt).toLocaleDateString('fr-MA') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2 min-w-44">
                      {p.codStatus === 'collected' && !p.codSenderPaid && (
                        <button onClick={() => handleRemitCod(p)}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Marquer remis
                        </button>
                      )}
                      {p.codStatus === 'remis' && !p.codSenderPaid && (
                        <button onClick={() => handleSettleCodAdmin(p)}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Marquer réglé
                        </button>
                      )}
                      {!p.codSenderPaid && (
                        <div className="space-y-1">
                          <input
                            value={codRequestDrafts[p.id] || ''}
                            onChange={e => setCodRequestDrafts((d: any) => ({ ...d, [p.id]: e.target.value }))}
                            placeholder="Message à l'agent..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
                          />
                          <button onClick={() => handleSendCodRequest(p)} disabled={codRequestBusy === p.id || !!openReq}
                            className={`w-full text-xs px-3 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                              openReq
                                ? 'bg-amber-100 text-amber-700 cursor-not-allowed'
                                : 'bg-amber-500 hover:bg-amber-600 text-white'
                            }`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {openReq ? 'Demande envoyée' : codRequestBusy === p.id ? 'Envoi...' : 'Demander réglage'}
                          </button>
                        </div>
                      )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredCod.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 text-xs text-gray-500 flex justify-between">
            <span>{filteredCod.length} remboursement(s)</span>
            <span>Total affiché : <b className="text-orange-600">{fmt(filteredCod.reduce((s: any, p: any) => s + (p.codAmount || 0), 0))} DH</b></span>
          </div>
        )}
      </div>
    </div>
  )
}
