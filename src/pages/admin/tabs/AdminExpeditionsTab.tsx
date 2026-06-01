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
} from 'lucide-react'
import {
  CITIES,
  COD_PAYMENT_TYPES,
  COD_STATUS,
  STATUSES,
  STATUS_COLORS,
  codCollectedLabel,
} from '../../../firebase/constants'
import { fmt } from '../../../utils/formatNumber'

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
  statusFilter,
  setStatusFilter,
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  filtered,
  loading,
  setCodEditModal,
  setStatusModal,
  openAdminEdit,
  allParcels,
  hasMore,
  loadMoreParcels,
  loadingMore,
  openArchiveModal,
  selectCls,
}: any) {
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (ID, N EXP, nom, tel...)"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none flex-1 min-w-36"
          />
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className={selectCls}>
            <option value="Toutes">Toutes les villes</option>
            {CITIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center border-t border-gray-100 pt-3">
          <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0 mr-1">Statut :</span>
          <button
            onClick={() => setStatusFilter('Tous')}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition border ${statusFilter === 'Tous' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'}`}
          >
            Tous
          </button>
          {STATUSES.map(s => {
            const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
            const active = statusFilter === s
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap border ${active ? `${sc.bg} ${sc.text} border-current` : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                {s}
              </button>
            )
          })}
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
          <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1">
            {filtered.length} resultat(s)
          </span>
          <button
            onClick={openArchiveModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
          >
            <Archive className="w-4 h-4" /> Archiver
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-215">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Tracking ID', 'Date', 'Expediteur', 'Destinataire', 'Ville', 'Poids', 'RETOUR FOND', 'Statut RETOUR FOND', 'Statut', 'Modifier', 'Suivi'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">Aucun colis trouve</td></tr>
                ) : filtered.map((p: any) => {
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
                  const cpt = p.codPaymentType ? COD_PAYMENT_TYPES.find(t => t.key === p.codPaymentType) : null
                  const date = p.createdAt?.toDate?.()
                    ? p.createdAt.toDate().toLocaleDateString('fr-MA')
                    : p.history?.[0]?.timestamp
                      ? new Date(p.history[0].timestamp).toLocaleDateString('fr-MA')
                      : '-'
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span>
                        {p.lastAdminEditAt && (
                          <span className="ml-1 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-semibold" title={`Modifie admin le ${new Date(p.lastAdminEditAt).toLocaleDateString('fr-MA')}`}>Admin</span>
                        )}
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
                      </td>
                      <td className="px-4 py-3">
                        {cs ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${p.codStatus === 'collected' && cpt ? `${cpt.bg} ${cpt.text}` : `${cs.bg} ${cs.text}`}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                              {p.codStatus === 'collected'
                                ? <>{cpt?.emoji} {codCollectedLabel(p.codPaymentType)}</>
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
                        <button
                          onClick={() => openAdminEdit(p)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition border border-purple-200"
                          title="Modifier tous les champs (Admin)"
                        >
                          <Edit2 className="w-3 h-3" /> Admin
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/track?id=${p.trackingId}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 transition">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>{allParcels.length} colis charges · {filtered.length} affiche(s)</span>
              <span>RETOUR FOND filtre : <b className="text-orange-600">{fmt(filtered.reduce((s: any, p: any) => s + (p.codAmount || 0), 0))} DH</b></span>
            </div>
            {hasMore && (
              <button
                onClick={loadMoreParcels}
                disabled={loadingMore}
                className="w-full py-2 rounded-xl text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loadingMore
                  ? <><span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Chargement...</>
                  : 'Charger plus de colis'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
