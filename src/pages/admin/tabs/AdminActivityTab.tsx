import {
  ArrowRight, Banknote, BarChart2, Calendar, CheckCircle, MapPin, Package, Truck, Users, Wallet,
} from 'lucide-react'
import { DIRECTOR_ACTION_ICONS } from '../../../firebase/directorLogs'
import { DIRECTOR_PERMISSIONS } from '../../../firebase/constants'
import { fmt } from '../../../utils/formatNumber'

export default function AdminActivityTab({
  activityRoleFilter, setActivityRoleFilter, activityDatePreset, setActivityDatePreset,
  activityDateFrom, setActivityDateFrom, activityDateTo, setActivityDateTo,
  activityStats = [], activityFeed = [], users = [], periodDirectorLogs = [], setDirectorLogsModal,
  setDriverPortDuModal, setPortDuForm, setPortDuError, setUserActivityModal, setUserDetailTab,
}: any) {
  const detailedActivity = (Array.isArray(activityFeed) ? activityFeed : []) as any[]
  const safeActivityStats = Array.isArray(activityStats) ? activityStats : []
  const safeUsers = Array.isArray(users) ? users : []
  const safePeriodDirectorLogs = Array.isArray(periodDirectorLogs) ? periodDirectorLogs : []
  const activeUsersCount = new Set(detailedActivity.map(e => e.userId || e.userName).filter(Boolean)).size
  return (
          <div className="mt-4 space-y-4">

            {/* Filtres */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
              {/* Rôle */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { key: 'all',       label: 'Tous',        emoji: '👥' },
                  { key: 'agent',     label: 'Agents',      emoji: '🧑‍💼' },
                  { key: 'chauffeur', label: 'Chauffeurs',  emoji: '🚚' },
                  { key: 'livreur',   label: 'Livreurs',    emoji: '🛵' },
                  { key: 'caissier',  label: 'Caissiers',   emoji: '🏦' },
                  { key: 'directeur', label: 'Directeurs',  emoji: '👔' },
                ].map(({ key, label, emoji }) => (
                  <button key={key} onClick={() => setActivityRoleFilter(key)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      activityRoleFilter === key
                        ? key === 'directeur' ? 'bg-purple-600 text-white border-purple-600' : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >{emoji} {label}</button>
                ))}
                {[
                  { key: 'chef_agence', label: "Chefs d'agence" },
                  { key: 'pointeur', label: 'Pointeurs' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setActivityRoleFilter(key)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      activityRoleFilter === key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >{label}</button>
                ))}
              </div>
              {/* Date */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {[
                  { key: 'all',    label: 'Tout' },
                  { key: 'today',  label: "Auj." },
                  { key: 'week',   label: '7 jours' },
                  { key: 'month',  label: 'Ce mois' },
                  { key: 'custom', label: 'Perso' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setActivityDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      activityDatePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >{label}</button>
                ))}
                {activityDatePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={activityDateFrom} onChange={e => setActivityDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={activityDateTo} onChange={e => setActivityDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* KPIs résumé */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Activites detaillees',
                  value: detailedActivity.length,
                  total: activeUsersCount,
                  icon: BarChart2, color: 'bg-indigo-50 text-indigo-600'
                },
                {
                  label: 'Agents actifs',
                  value: safeActivityStats.filter((s: any) => s.user.role === 'agent' && s.created?.length > 0).length,
                  total: safeUsers.filter((u: any) => u.role === 'agent').length,
                  icon: Users, color: 'bg-blue-50 text-blue-600'
                },
                {
                  label: 'Chauffeurs actifs',
                  value: safeActivityStats.filter((s: any) => ['chauffeur', 'livreur'].includes(s.user.role) && ((s.transports?.length || 0) + (s.deliveries?.length || 0)) > 0).length,
                  total: safeUsers.filter((u: any) => ['chauffeur', 'livreur'].includes(u.role)).length,
                  icon: Truck, color: 'bg-orange-50 text-orange-600'
                },
                {
                  label: 'Caissiers actifs',
                  value: safeActivityStats.filter((s: any) => s.user.role === 'caissier' && (s.entries?.length || 0) > 0).length,
                  total: safeUsers.filter((u: any) => u.role === 'caissier').length,
                  icon: Wallet, color: 'bg-teal-50 text-teal-600'
                },
                {
                  label: 'Colis créés',
                  value: safeActivityStats.filter((s: any) => s.user.role === 'agent').reduce((sum: any, s: any) => sum + (s.created?.length || 0), 0),
                  icon: Package, color: 'bg-green-50 text-green-600'
                },
                {
                  label: 'Livraisons effectuées',
                  value: safeActivityStats.filter((s: any) => ['chauffeur', 'livreur'].includes(s.user.role)).reduce((sum: any, s: any) => sum + (s.deliveries?.filter((p: any) => p.status === 'Livré').length || 0), 0),
                  icon: CheckCircle, color: 'bg-purple-50 text-purple-600'
                },
              ].map(({ label, value, total, icon: Icon, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${color.split(' ')[0]} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <p className="text-xl font-bold text-gray-800">
                      {value}
                      {total !== undefined && <span className="text-sm text-gray-400 font-normal"> / {total}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* â"€â"€ Cartes Directeurs â"€â"€ */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-800">Journal detaille des activites</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Toutes les actions visibles des utilisateurs: colis, caisse, port du, RETOUR FOND, rapports et direction.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-indigo-600">{detailedActivity.length}</p>
                  <p className="text-xs text-gray-400">evenements</p>
                </div>
              </div>
              {detailedActivity.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">
                  Aucune activite detaillee trouvee pour cette periode.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Date</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Utilisateur</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Module</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Action detaillee</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-wide">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailedActivity.map((event, idx) => (
                        <tr key={`${event.ts}-${event.reference || event.title}-${idx}`} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {event.date?.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                            <span className="block text-[11px] text-gray-300">
                              {event.date?.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[170px]">
                            <p className="text-sm font-semibold text-gray-800 truncate">{event.userName || 'Systeme'}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {event.role && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">
                                  {event.role}
                                </span>
                              )}
                              {event.city && <span className="text-[10px] text-gray-400">{event.city}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-indigo-600 whitespace-nowrap">
                            {event.module || '-'}
                          </td>
                          <td className="px-4 py-3 min-w-[280px]">
                            <p className="text-sm font-semibold text-gray-700">{event.title || '-'}</p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{event.detail || '-'}</p>
                            {event.reference && (
                              <p className="text-[11px] text-gray-300 font-mono mt-1">{event.reference}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-700 whitespace-nowrap">
                            {Number(event.amount || 0) > 0 ? `${fmt(event.amount)} DH` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(activityRoleFilter === 'all' || activityRoleFilter === 'directeur') && (() => {
              const directors = safeUsers.filter((u: any) => u.role === 'directeur')
              if (directors.length === 0 && activityRoleFilter === 'directeur') return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
                  👔 Aucun directeur trouvé
                </div>
              )
              if (directors.length === 0) return null
              return (
                <div className="space-y-3">
                  {activityRoleFilter === 'all' && (
                    <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-500 rounded-full" /> Directeurs
                    </h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {directors.map((dir: any) => {
                      const logs = safePeriodDirectorLogs.filter((l: any) => l.uid === dir.id)
                      const lastLog = logs[0]
                      const lastDate = lastLog?.timestamp?.toDate
                        ? lastLog.timestamp.toDate().toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      const perms = dir.directorPermissions || []
                      return (
                        <div key={dir.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
                          {/* En-tête */}
                          <div className="px-5 py-4 flex items-center gap-3 bg-purple-50 border-b border-purple-100">
                            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center text-xl shrink-0">👔</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-gray-800 truncate">{dir.name || '—'}</p>
                                {dir.blocked && (
                                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Bloqué</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{dir.city || '—'} · {dir.email || '—'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-2xl font-black text-purple-600">{logs.length}</p>
                              <p className="text-xs text-gray-400">actions</p>
                            </div>
                          </div>
                          {/* Permissions */}
                          <div className="px-5 py-3 border-b border-gray-50">
                            <p className="text-xs text-gray-400 font-medium mb-2">Modules accordés</p>
                            <div className="flex flex-wrap gap-1.5">
                              {perms.length === 0
                                ? <span className="text-xs text-gray-400 italic">Aucune permission</span>
                                : DIRECTOR_PERMISSIONS.filter(p => perms.includes(p.key)).map(p => (
                                    <span key={p.key} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                      {p.emoji} {p.label}
                                    </span>
                                  ))
                              }
                            </div>
                          </div>
                          {/* Dernières actions */}
                          <div className="px-5 py-3 space-y-1.5">
                            <p className="text-xs text-gray-400 font-medium">Dernières actions</p>
                            {logs.length === 0 ? (
                              <p className="text-xs text-gray-300 italic">Aucune action enregistrée</p>
                            ) : logs.slice(0, 3).map((log: any) => (
                              <div key={log.id} className="flex items-start gap-2 text-xs">
                                <span className="shrink-0 mt-0.5">{(DIRECTOR_ACTION_ICONS as any)[log.actionKey] || '🔹'}</span>
                                <span className="text-gray-600 flex-1 truncate">{log.details}</span>
                                <span className="text-gray-300 shrink-0">
                                  {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="px-5 pb-4 pt-1 flex items-center justify-between">
                            <span className="text-xs text-gray-400">Dernière activité : {lastDate}</span>
                            <button
                              onClick={() => setDirectorLogsModal(dir)}
                              className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition font-semibold"
                            >
                              <BarChart2 className="w-3.5 h-3.5" /> Tout voir
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Cartes agents / chauffeurs */}
            {activityRoleFilter !== 'directeur' && (
            <>
            {activityRoleFilter === 'all' && safeActivityStats.length > 0 && (
              <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full" /> Agents &amp; Chauffeurs
              </h3>
            )}
            {safeActivityStats.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
                👥 Aucune activité trouvée pour cette période
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {safeActivityStats.map((stat: any) => {
                  const isAgent   = stat.user.role === 'agent'
                  const isCashier = stat.user.role === 'caissier'
                  const totalCount = isAgent
                    ? stat.created.length
                    : isCashier
                      ? stat.entries.length
                    : (stat.transports.length + stat.deliveries.length)
                  const lastDate = stat.lastActivity
                    ? new Date(stat.lastActivity).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })
                    : '—'

                  return (
                    <div key={stat.user.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">

                      {/* En-tête carte */}
                      <div className={`px-5 py-4 flex items-center gap-3 ${isAgent ? 'bg-blue-50 border-b border-blue-100' : isCashier ? 'bg-teal-50 border-b border-teal-100' : 'bg-orange-50 border-b border-orange-100'}`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${isAgent ? 'bg-blue-100' : isCashier ? 'bg-teal-100' : 'bg-orange-100'}`}>
                          {isAgent ? '🧑‍💼' : isCashier ? '🏦' : '🚚'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{stat.user.name || '—'}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAgent ? 'bg-blue-100 text-blue-700' : isCashier ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
                              {isAgent ? 'Agent' : isCashier ? 'Caissier' : 'Chauffeur'}
                            </span>
                            {stat.user.city && (
                              <span className="text-xs text-gray-500 flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />{stat.user.city}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-2xl font-black ${isAgent ? 'text-blue-600' : isCashier ? 'text-teal-600' : 'text-orange-600'}`}>{totalCount}</p>
                          <p className="text-xs text-gray-400">{isAgent ? 'créés' : isCashier ? 'mouvements' : 'total'}</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="px-5 py-4 space-y-3">
                        {isAgent ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-green-600">{stat.livres}</p>
                                <p className="text-xs text-green-700">Livrés</p>
                              </div>
                              <div className="bg-orange-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-orange-500">{stat.enCours}</p>
                                <p className="text-xs text-orange-600">En cours</p>
                              </div>
                              <div className="bg-gray-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-gray-500">{stat.retournes}</p>
                                <p className="text-xs text-gray-500">Retournés</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-400">Récupérés à dest.</p>
                                <p className="text-sm font-bold text-gray-700">{stat.claimed.length} colis</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">Frais totaux</p>
                                <p className="text-sm font-bold text-blue-600">{fmt(stat.totalRevenue)} DH</p>
                              </div>
                            </div>
                            {stat.codTotal > 0 && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 flex items-center justify-between">
                                <span className="text-xs text-yellow-700">💰 RETOUR FOND total</span>
                                <span className="text-sm font-bold text-yellow-700">{fmt(stat.codTotal)} DH</span>
                              </div>
                            )}
                          </>
                        ) : isCashier ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-green-600">{fmt(stat.totalEntrees)}</p>
                                <p className="text-xs text-green-700">Entrées</p>
                              </div>
                              <div className="bg-red-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-red-600">{fmt(stat.totalSorties)}</p>
                                <p className="text-xs text-red-700">Sorties</p>
                              </div>
                              <div className="bg-teal-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-teal-600">{fmt(stat.totalEntrees - stat.totalSorties)}</p>
                                <p className="text-xs text-teal-700">Solde</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-400">Dépôts agents</p>
                                <p className="text-sm font-bold text-gray-700">{stat.depotsAgents.length} mouvement(s)</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">Charges</p>
                                <p className="text-sm font-bold text-red-600">{stat.charges.length}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Ligne 1 : Livrés + Transports + En cours */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-green-600">{stat.colisLivres}</p>
                                <p className="text-xs text-green-700">Livrés ✓</p>
                              </div>
                              <div className="bg-blue-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-blue-600">{stat.transports.length}</p>
                                <p className="text-xs text-blue-700">Transports</p>
                              </div>
                              <div className="bg-orange-50 rounded-xl py-2">
                                <p className="text-lg font-bold text-orange-500">{stat.activeTransports + stat.activeDeliveries}</p>
                                <p className="text-xs text-orange-600">En cours</p>
                              </div>
                            </div>

                            {/* RETOUR FOND collecté */}
                            {stat.codCollected > 0 && (
                              <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                                <span className="text-xs text-yellow-700">💰 RETOUR FOND collecté</span>
                                <span className="text-sm font-bold text-yellow-700">{fmt(stat.codCollected)} DH</span>
                              </div>
                            )}

                            {/* Port dû — section complète */}
                            <div className="border border-orange-200 rounded-xl overflow-hidden">
                              <div className="bg-orange-50 px-3 py-1.5 flex items-center justify-between">
                                <span className="text-xs font-bold text-orange-700">📮 Port dû</span>
                                {stat.portDuCollecte > 0 && (
                                  <span className="text-xs text-orange-600 font-medium">collecté sur {stat.deliveries.filter((p: any) => p.portType === 'port_du').length} colis</span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 divide-x divide-orange-100">
                                <div className="px-2 py-2 text-center">
                                  <p className="text-xs text-gray-400 mb-0.5">Collecté</p>
                                  <p className="text-sm font-bold text-orange-600">{fmt(stat.portDuCollecte)} DH</p>
                                </div>
                                <div className="px-2 py-2 text-center">
                                  <p className="text-xs text-gray-400 mb-0.5">Versé</p>
                                  <p className="text-sm font-bold text-green-600">{fmt(stat.versements)} DH</p>
                                </div>
                                <div className="px-2 py-2 text-center">
                                  <p className="text-xs text-gray-400 mb-0.5">Solde dû</p>
                                  <p className={`text-sm font-bold ${stat.solde > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {fmt(stat.solde)} DH
                                  </p>
                                </div>
                              </div>
                              {stat.avances > 0 && (
                                <div className="border-t border-orange-100 px-3 py-1.5 flex items-center justify-between bg-purple-50">
                                  <span className="text-xs text-purple-700">💳 Avances données</span>
                                  <span className="text-xs font-bold text-purple-700">{fmt(stat.avances)} DH</span>
                                </div>
                              )}
                            </div>

                            {/* Bouton gérer port dû */}
                            <button
                              onClick={() => { setDriverPortDuModal({ driver: stat.user, stat }); setPortDuForm({ type: 'versement', amount: '', note: '' }); setPortDuError('') }}
                              className="w-full py-2 rounded-xl text-xs font-semibold bg-orange-100 hover:bg-orange-200 text-orange-700 transition flex items-center justify-center gap-1.5"
                            >
                              <Banknote className="w-3.5 h-3.5" /> Gérer port dû &amp; avances
                            </button>
                          </>
                        )}
                        <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                          <span>Dernière activité : {lastDate}</span>
                          {stat.user.code && (
                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{stat.user.code}</span>
                          )}
                        </div>
                      </div>

                      {/* Bouton détail */}
                      <div className="px-5 pb-4">
                        <button
                          onClick={() => {
                            setUserActivityModal(stat)
                            setUserDetailTab(isAgent ? 'created' : isCashier ? 'entries' : 'transport')
                          }}
                          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 ${
                            isAgent
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : isCashier
                                ? 'bg-teal-600 hover:bg-teal-700 text-white'
                              : 'bg-orange-500 hover:bg-orange-600 text-white'
                          }`}
                        >
                          Voir l'activité <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            </>
            )}
          </div>
  )
}
