import * as React from 'react'
import { Calendar, Search, MessageCircle, CheckCircle, Banknote, Filter } from 'lucide-react'
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
  // Calculer les villes avec COD
  const citiesWithCod = Array.from(new Set(
    codDateFiltered.map((p: any) => p.destinationCity || p.receiver?.city).filter(Boolean)
  )).sort()

  const [selectedCity, setSelectedCity] = React.useState<string>('all')
  const [selectedPaymentType, setSelectedPaymentType] = React.useState<string>('all')

  // Filtrer par ville et type de paiement
  const cityAndPaymentFiltered = React.useMemo(() => {
    let filtered = codDateFiltered

    if (selectedCity !== 'all') {
      filtered = filtered.filter((p: any) =>
        (p.destinationCity === selectedCity || p.receiver?.city === selectedCity)
      )
    }

    if (selectedPaymentType !== 'all') {
      filtered = filtered.filter((p: any) => p.codPaymentType === selectedPaymentType)
    }

    return filtered
  }, [codDateFiltered, selectedCity, selectedPaymentType])

  return (
    <div className="mt-4 space-y-6">

      {/* FILTRES : Date + Ville + Mode de paiement */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200 shadow-lg p-6">
        <h3 className="font-black text-green-800 mb-4 flex items-center gap-2 text-lg">
          <Filter className="w-5 h-5" />
          Filtres RETOUR FOND
        </h3>

        <div className="space-y-4">
          {/* Filtre date */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">📅 Période</label>
            <div className="flex flex-wrap gap-2 items-center">
              {[
                { key: 'all',    label: 'Tout' },
                { key: 'today',  label: "Aujourd'hui" },
                { key: 'week',   label: '7 derniers jours' },
                { key: 'month',  label: 'Ce mois' },
                { key: 'custom', label: 'Personnalisé' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setCodDatePreset(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    codDatePreset === key ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-green-100 border border-gray-200'
                  }`}
                >{label}</button>
              ))}
              {codDatePreset === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input type="date" value={codDateFrom} onChange={e => setCodDateFrom(e.target.value)}
                    className="border-2 border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  <span className="text-gray-400 text-sm font-bold">→</span>
                  <input type="date" value={codDateTo} onChange={e => setCodDateTo(e.target.value)}
                    className="border-2 border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                </div>
              )}
            </div>
          </div>

          {/* Filtre par ville */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">🏙️ Ville de destination</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCity('all')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedCity === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-blue-100 border border-gray-200'
                }`}
              >
                Toutes les villes
              </button>
              {citiesWithCod.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    selectedCity === city ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-blue-100 border border-gray-200'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          {/* Filtre par mode de paiement */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">💳 Mode de paiement</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'Tous', emoji: '📋' },
                ...COD_PAYMENT_TYPES
              ].map(pt => (
                <button
                  key={pt.key}
                  onClick={() => setSelectedPaymentType(pt.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                    selectedPaymentType === pt.key ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-purple-100 border border-gray-200'
                  }`}
                >
                  <span>{pt.emoji}</span>
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compteur de résultats */}
          <div className="flex items-center justify-between pt-3 border-t border-green-200">
            <span className="text-sm font-bold text-green-800">
              📦 {cityAndPaymentFiltered.length} colis RETOUR FOND
            </span>
            <span className="text-lg font-black text-green-700">
              {fmt(cityAndPaymentFiltered.reduce((s: any, p: any) => s + (parseFloat(p.codAmount) || 0), 0))} DH
            </span>
          </div>
        </div>
      </div>

      {/* RÉPARTITION PAR MODE DE PAIEMENT - Section principale */}
      <div className="bg-white border-2 border-purple-200 rounded-2xl p-6 shadow-lg">
        <h3 className="font-black text-purple-800 mb-5 flex items-center gap-2 text-lg">
          <Banknote className="w-6 h-6" />
          Répartition par Mode de Paiement
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COD_PAYMENT_TYPES.map(pt => {
            const filtered = cityAndPaymentFiltered.filter((p: any) => p.codPaymentType === pt.key)
            const total = filtered.reduce((s: any, p: any) => s + (parseFloat(p.codAmount) || 0), 0)
            const count = filtered.length

            return (
              <div key={pt.key} className={`${pt.bg} border-2 ${pt.text} border-current/30 rounded-xl p-5 hover:shadow-lg transition`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{pt.emoji}</span>
                  <span className={`text-sm font-bold ${pt.text} uppercase`}>{pt.label}</span>
                </div>
                <p className={`text-4xl font-black ${pt.text} mb-1`}>{fmt(total)}</p>
                <p className="text-sm font-semibold text-gray-500">DH</p>
                <div className="mt-3 pt-3 border-t border-current/20">
                  <p className={`text-xs font-semibold ${pt.text} opacity-80`}>
                    📦 {count} colis
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Totaux généraux */}
        <div className="mt-6 pt-6 border-t-2 border-purple-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(() => {
              const pending = cityAndPaymentFiltered.filter((p: any) => !p.codStatus || p.codStatus === 'pending')
              const collected = cityAndPaymentFiltered.filter((p: any) => p.codStatus === 'collected')
              const remis = cityAndPaymentFiltered.filter((p: any) => p.codStatus === 'remis' && !p.codSenderPaid)
              const settled = cityAndPaymentFiltered.filter((p: any) => p.codSenderPaid)

              return [
                { label: 'En attente', parcels: pending, bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', emoji: '⏳' },
                { label: 'Collecté', parcels: collected, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', emoji: '💰' },
                { label: 'Remis agence', parcels: remis, bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', emoji: '🔄' },
                { label: 'Réglé', parcels: settled, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', emoji: '✅' },
              ].map(({ label, parcels, bg, text, border, emoji }) => (
                <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
                  <p className={`text-xs font-bold ${text} mb-2`}>{emoji} {label}</p>
                  <p className={`text-2xl font-black ${text}`}>{fmt(parcels.reduce((s: any, p: any) => s + (parseFloat(p.codAmount) || 0), 0))} DH</p>
                  <p className={`text-xs ${text} opacity-70 mt-1`}>{parcels.length} colis</p>
                </div>
              ))
            })()}
          </div>
        </div>
      </div>

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
        <div className="p-4 border-b border-gray-100 space-y-3">
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={codSearch} onChange={e => setCodSearch(e.target.value)}
              placeholder="Rechercher tracking, N EXP, client, ville..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Filtres rapides - Date */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-gray-600">📅</span>
            {[
              { key: 'all',    label: 'Tout' },
              { key: 'today',  label: "Aujourd'hui" },
              { key: 'week',   label: '7j' },
              { key: 'month',  label: 'Mois' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setCodDatePreset(key)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  codDatePreset === key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* Filtre personnalisé - Plage de dates */}
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs font-bold text-gray-600">📆 Période personnalisée :</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">De</label>
              <input
                type="date"
                value={codDateFrom}
                onChange={e => {
                  setCodDateFrom(e.target.value)
                  if (e.target.value || codDateTo) setCodDatePreset('custom')
                }}
                className="px-3 py-1 border border-gray-300 rounded-lg text-xs focus:border-green-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">À</label>
              <input
                type="date"
                value={codDateTo}
                onChange={e => {
                  setCodDateTo(e.target.value)
                  if (e.target.value || codDateFrom) setCodDatePreset('custom')
                }}
                className="px-3 py-1 border border-gray-300 rounded-lg text-xs focus:border-green-500 focus:outline-none"
              />
            </div>
            {(codDateFrom || codDateTo) && (
              <button
                onClick={() => {
                  setCodDateFrom('')
                  setCodDateTo('')
                  setCodDatePreset('all')
                }}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg font-semibold transition"
              >
                ✕ Effacer
              </button>
            )}
          </div>

          {/* Filtres rapides - Mode de paiement */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-gray-600">💳</span>
            {[
              { key: 'all',       label: 'Tous' },
              { key: 'especes',   label: '💵 Espèces' },
              { key: 'cheque',    label: '📝 Chèque' },
              { key: 'traite',    label: '📄 Traite' },
              { key: 'autres',    label: '📋 Autres' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setCodFilter(key)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
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
                {['N° EXP','Date expédition','Destinataire','Ville','Montant RETOUR FOND','Mode paiement','Statut RETOUR FOND','Collecté par','Date collecte'].map(h => (
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
                // Normaliser le type de paiement (avec et sans accents, majuscules/minuscules)
                const paymentType = (p.codPaymentType || '').toLowerCase().trim()
                const normalizedType =
                  paymentType === 'chèque' || paymentType === 'cheque' ? 'cheque' :
                  paymentType === 'espèces' || paymentType === 'especes' ? 'especes' :
                  paymentType === 'traite' ? 'traite' :
                  p.codPaymentType
                const cpt = COD_PAYMENT_TYPES.find((t: any) => t.key === normalizedType)
                const openReq = agentCodRequests.find((r: any) => r.parcelId === p.id && r.status !== 'resolved')
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    {/* N° EXP */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg font-semibold">{p.sender?.nic || '—'}</span>
                    </td>
                    {/* Date expédition */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {(() => {
                        if (p.workDate) return new Date(p.workDate).toLocaleDateString('fr-MA')
                        if (p.createdAt?.toDate) return p.createdAt.toDate().toLocaleDateString('fr-MA')
                        if (p.createdAt) return new Date(p.createdAt).toLocaleDateString('fr-MA')
                        return '—'
                      })()}
                    </td>
                    {/* Destinataire */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.receiver?.name}</p>
                      <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                    </td>
                    {/* Ville */}
                    <td className="px-4 py-3 font-semibold text-gray-700">{p.receiver?.city}</td>
                    {/* Montant RETOUR FOND */}
                    <td className="px-4 py-3">
                      <span className="text-orange-600 font-bold text-base">{p.codAmount} DH</span>
                    </td>
                    {/* Mode paiement */}
                    <td className="px-4 py-3">
                      {cpt
                        ? <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${(cpt as any).bg} ${(cpt as any).text}`}>{(cpt as any).emoji} {(cpt as any).label}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    {/* Statut RETOUR FOND */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cs.bg} ${cs.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                        {cs.label}
                      </span>
                    </td>
                    {/* Collecté par */}
                    <td className="px-4 py-3 text-xs text-gray-600">{p.codCollectedBy || '—'}</td>
                    {/* Date collecte */}
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {p.codCollectedAt ? new Date(p.codCollectedAt).toLocaleDateString('fr-MA') : '—'}
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
