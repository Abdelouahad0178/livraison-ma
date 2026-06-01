import { X, MapPin } from 'lucide-react'
import { CAISSE_CATEGORIES, STATUS_COLORS } from '../../../firebase/constants'
import { fmt } from '../../../utils/formatNumber'

const parcelDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}

const caisseEntryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}

interface UserActivityModalProps {
  userActivityModal: any
  setUserActivityModal: (v: any) => void
  userDetailTab: string
  setUserDetailTab: (v: string) => void
}

export default function UserActivityModal({
  userActivityModal,
  setUserActivityModal,
  userDetailTab,
  setUserDetailTab,
}: UserActivityModalProps) {
  if (!userActivityModal) return null

  const isAgent = userActivityModal.user.role === 'agent'
  const isCashier = userActivityModal.user.role === 'caissier'
  const list = isAgent
    ? (userDetailTab === 'created' ? userActivityModal.created : userActivityModal.claimed)
    : isCashier
      ? (userDetailTab === 'entrees' ? userActivityModal.entrees : userDetailTab === 'sorties' ? userActivityModal.sorties : userActivityModal.entries)
    : (userDetailTab === 'transport' ? userActivityModal.transports : userActivityModal.deliveries)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl w-full sm:max-w-3xl shadow-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">

        {/* En-tête modale */}
        <div className={`flex items-center gap-4 p-5 border-b shrink-0 ${isAgent ? 'bg-blue-50' : isCashier ? 'bg-teal-50' : 'bg-orange-50'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${isAgent ? 'bg-blue-100' : isCashier ? 'bg-teal-100' : 'bg-orange-100'}`}>
            {isAgent ? '🧑‍💼' : isCashier ? '🏦' : '🚚'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800 text-lg truncate">{userActivityModal.user.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAgent ? 'bg-blue-100 text-blue-700' : isCashier ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
                {isAgent ? 'Agent' : isCashier ? 'Caissier' : 'Chauffeur'}
              </span>
              {userActivityModal.user.city && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{userActivityModal.user.city}
                </span>
              )}
              {userActivityModal.user.tel && (
                <span className="text-xs text-gray-500">{userActivityModal.user.tel}</span>
              )}
              {userActivityModal.user.code && (
                <span className="font-mono text-xs bg-white px-2 py-0.5 rounded-lg border border-gray-200 text-gray-600">{userActivityModal.user.code}</span>
              )}
            </div>
          </div>
          <button onClick={() => setUserActivityModal(null)} className="p-2 hover:bg-white/60 rounded-xl transition shrink-0">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Corps modale */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* KPIs */}
          {isAgent ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Colis créés',    value: userActivityModal.created.length,     bg: 'bg-blue-50',   text: 'text-blue-600'   },
                { label: 'Récupérés',       value: userActivityModal.claimed.length,     bg: 'bg-purple-50', text: 'text-purple-600' },
                { label: 'Livrés',          value: userActivityModal.livres,             bg: 'bg-green-50',  text: 'text-green-600'  },
                { label: 'Frais totaux',    value: `${fmt(userActivityModal.totalRevenue)} DH`, bg: 'bg-orange-50', text: 'text-orange-600' },
              ].map(({ label, value, bg, text }) => (
                <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-black ${text}`}>{value}</p>
                  <p className={`text-xs font-medium ${text} opacity-80 mt-0.5`}>{label}</p>
                </div>
              ))}
            </div>
          ) : isCashier ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Mouvements', value: userActivityModal.entries.length, bg: 'bg-teal-50', text: 'text-teal-600' },
                { label: 'Entrées', value: `${fmt(userActivityModal.totalEntrees)} DH`, bg: 'bg-green-50', text: 'text-green-600' },
                { label: 'Sorties', value: `${fmt(userActivityModal.totalSorties)} DH`, bg: 'bg-red-50', text: 'text-red-600' },
                { label: 'Solde', value: `${fmt(userActivityModal.totalEntrees - userActivityModal.totalSorties)} DH`, bg: 'bg-blue-50', text: 'text-blue-600' },
              ].map(({ label, value, bg, text }) => (
                <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-black ${text}`}>{value}</p>
                  <p className={`text-xs font-medium ${text} opacity-80 mt-0.5`}>{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Transports',     value: userActivityModal.transports.length,  bg: 'bg-blue-50',   text: 'text-blue-600'   },
                { label: 'Livraisons',      value: userActivityModal.deliveries.length,  bg: 'bg-orange-50', text: 'text-orange-600' },
                { label: 'Actifs',          value: userActivityModal.activeTransports + userActivityModal.activeDeliveries, bg: 'bg-yellow-50', text: 'text-yellow-600' },
                { label: 'RETOUR FOND collecté',    value: `${fmt(userActivityModal.codCollected)} DH`, bg: 'bg-green-50',  text: 'text-green-600'  },
              ].map(({ label, value, bg, text }) => (
                <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-black ${text}`}>{value}</p>
                  <p className={`text-xs font-medium ${text} opacity-80 mt-0.5`}>{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Sous-onglets */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {isAgent ? (
              <>
                <button onClick={() => setUserDetailTab('created')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'created' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >📦 Créés ({userActivityModal.created.length})</button>
                <button onClick={() => setUserDetailTab('claimed')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'claimed' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >📬 Récupérés dest. ({userActivityModal.claimed.length})</button>
              </>
            ) : isCashier ? (
              <>
                <button onClick={() => setUserDetailTab('entries')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'entries' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >Mouvements ({userActivityModal.entries.length})</button>
                <button onClick={() => setUserDetailTab('entrees')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'entrees' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >Entrées ({userActivityModal.entrees.length})</button>
                <button onClick={() => setUserDetailTab('sorties')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'sorties' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >Sorties ({userActivityModal.sorties.length})</button>
              </>
            ) : (
              <>
                <button onClick={() => setUserDetailTab('transport')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'transport' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >🚛 Transports ({userActivityModal.transports.length})</button>
                <button onClick={() => setUserDetailTab('delivery')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'delivery' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >🏠 Livraisons ({userActivityModal.deliveries.length})</button>
              </>
            )}
          </div>

          {/* Tableau des colis / mouvements */}
          {list.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Aucune activité dans cette catégorie</div>
          ) : isCashier ? (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Date', 'Type', 'Catégorie', 'Description', 'Montant'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.map((e: any) => {
                      const isEntry = e.type === 'entree'
                      const cat = CAISSE_CATEGORIES.find((c: any) => c.key === e.category)
                      return (
                        <tr key={e.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                            {caisseEntryDate(e).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isEntry ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              {isEntry ? 'Entrée' : 'Sortie'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">{(cat as any)?.label || e.category || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-600">{e.description || e.reference || '—'}</td>
                          <td className={`px-4 py-2.5 font-bold whitespace-nowrap ${isEntry ? 'text-green-600' : 'text-red-600'}`}>
                            {isEntry ? '+' : '-'}{fmt(parseFloat(e.amount || 0) || 0)} DH
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50 text-xs text-gray-500">
                {list.length} mouvement(s) · Entrées <b className="text-green-600">{fmt(list.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (parseFloat(e.amount || 0) || 0), 0))} DH</b> · Sorties <b className="text-red-600">{fmt(list.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (parseFloat(e.amount || 0) || 0), 0))} DH</b>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Tracking', 'Date', 'Expéditeur → Destinataire', 'Ville dest.', 'RETOUR FOND', 'Statut'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.map((p: any) => {
                      const c = (STATUS_COLORS as any)[p.status] || (STATUS_COLORS as any)['Initialisé']
                      const date = parcelDate(p).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{date}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-medium text-gray-800">{p.sender?.name} → {p.receiver?.name}</p>
                            <p className="text-xs text-gray-400">{p.sender?.city} → {p.receiver?.city}</p>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 font-medium whitespace-nowrap">{p.receiver?.city}</td>
                          <td className="px-4 py-2.5">
                            {p.codAmount > 0
                              ? <span className="text-orange-600 font-bold">{p.codAmount} DH</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50 text-xs text-gray-500">
                {list.length} colis · RETOUR FOND total : <b className="text-orange-600">{fmt(list.reduce((s: any, p: any) => s + (p.codAmount || 0), 0))} DH</b>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
