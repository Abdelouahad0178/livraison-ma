import { Ban, Calendar, Copy, Edit2, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react'

export default function AdminUsersTab({
  filteredUsers, periodUsers, loadingUsers, userSearch, setUserSearch,
  roleFilter, setRoleFilter, ROLES, EMPTY_CREATE, setCreateModal, setCreateError,
  usersDatePreset, setUsersDatePreset, usersDateFrom, setUsersDateFrom, usersDateTo, setUsersDateTo,
  copyMessage, makeClientPortalLink, handleCopyClientPortalLink, setUserEditTab, setPwdForm, setUserEdit,
  handleToggleBlock, setDeleteConfirmUser,
}: any) {
  return (
          <div className="mt-4 space-y-4">

            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    placeholder="Rechercher un utilisateur..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none bg-white"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setRoleFilter('Tous')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === 'Tous' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  >Tous</button>
                  {ROLES.map((r: any) => (
                    <button key={r.key} onClick={() => setRoleFilter(r.key)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === r.key ? `${r.badge} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                    >{r.emoji} {r.label}</button>
                  ))}
                </div>
                <button
                  onClick={() => { setCreateModal({ ...EMPTY_CREATE }); setCreateError('') }}
                  className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition shadow-sm"
                >
                  <UserPlus className="w-4 h-4" /> Créer un compte
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center border-t border-gray-100 pt-3">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-400 font-medium mr-1">Créé :</span>
                {[
                  { key: 'all',    label: 'Tout' },
                  { key: 'today',  label: "Aujourd'hui" },
                  { key: 'week',   label: '7 derniers jours' },
                  { key: 'month',  label: 'Ce mois' },
                  { key: 'custom', label: 'Personnalisé' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setUsersDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      usersDatePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >{label}</button>
                ))}
                {usersDatePreset === 'custom' && (
                  <div className="flex items-center gap-2 ml-1">
                    <input type="date" value={usersDateFrom} onChange={e => setUsersDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={usersDateTo} onChange={e => setUsersDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
                  </div>
                )}
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1">
                  {filteredUsers.length} utilisateur(s)
                </span>
              </div>
              {copyMessage && (
                <div className={`flex flex-col sm:flex-row sm:items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl ${
                  copyMessage.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-amber-50 text-amber-800 border border-amber-100'
                }`}>
                  <span className="flex-1">{copyMessage.text}</span>
                  {copyMessage.link && (
                    <input readOnly value={copyMessage.link}
                      onFocus={e => e.target.select()}
                      className="min-w-0 sm:w-96 bg-white/80 border border-current/10 rounded-lg px-3 py-2 font-mono text-xs"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Users table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingUsers ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-150">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Nom','Téléphone','Email','Rôle','Ville','Code agent','Créé le','Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredUsers.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">👤 Aucun utilisateur trouvé</td></tr>
                      ) : filteredUsers.map((u: any) => {
                        const rMeta = ROLES.find((r: any) => r.key === u.role)
                        const clientPortalLink = u.role === 'client' && u.clientId
                          ? (u.portalToken ? makeClientPortalLink(u.clientId, u.portalToken) : (u.portalLink || makeClientPortalLink(u.clientId)))
                          : ''
                        return (
                          <tr key={u.id} className={`hover:bg-gray-50 transition ${u.blocked ? 'opacity-60 bg-red-50/40' : ''}`}>
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              <div className="flex items-center gap-2">
                                {u.name || '—'}
                                {u.blocked && (
                                  <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Ban className="w-3 h-3" /> Bloqué
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{u.tel || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${rMeta?.badge || 'bg-gray-100 text-gray-600'}`}>
                                {rMeta ? `${rMeta.emoji} ${rMeta.label}` : (u.role || '—')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{u.city || '—'}</td>
                            <td className="px-4 py-3">
                              {u.code
                                ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">{u.code}</span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-MA') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => { setUserEditTab('access'); setPwdForm({ current: '', next: '', confirm: '', loading: false, error: '', success: '' }); setUserEdit({ id: u.id, name: u.name||'', role: u.role||'agent', city: u.city||'', code: u.code||'', tel: u.tel||'', directorPermissions: u.directorPermissions||[], cin: u.cin||'', cnss: u.cnss||'', assurance: u.assurance||'', dateEmbauche: u.dateEmbauche||'', dateSortie: u.dateSortie||'', dateNaissance: u.dateNaissance||'', salaire: u.salaire||'', adresse: u.adresse||'', situationFamiliale: u.situationFamiliale||'', contactUrgence: u.contactUrgence||'', noteRH: u.noteRH||'' }) }}
                                  className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition font-medium"
                                >
                                  <Edit2 className="w-3 h-3" /> Modifier
                                </button>
                                {clientPortalLink && (
                                  <button
                                    onClick={() => handleCopyClientPortalLink(clientPortalLink, {
                                      userId: u.id,
                                      id: u.clientId,
                                      name: u.name || '',
                                      email: u.email || '',
                                      tel: u.tel || '',
                                      city: u.city || '',
                                      address: u.adresse || '',
                                      portalToken: u.portalToken || '',
                                    })}
                                    className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg transition font-medium"
                                  >
                                    <Copy className="w-3 h-3" /> Lien client
                                  </button>
                                )}
                                {u.role !== 'admin' && (
                                  <>
                                    <button
                                      onClick={() => handleToggleBlock(u)}
                                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition font-medium ${
                                        u.blocked
                                          ? 'text-green-600 bg-green-50 hover:bg-green-100'
                                          : 'text-orange-600 bg-orange-50 hover:bg-orange-100'
                                      }`}
                                    >
                                      {u.blocked ? <><ShieldCheck className="w-3 h-3" /> Débloquer</> : <><Ban className="w-3 h-3" /> Bloquer</>}
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmUser(u)}
                                      className="flex items-center gap-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition font-medium"
                                    >
                                      <Trash2 className="w-3 h-3" /> Supprimer
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!loadingUsers && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 text-xs text-gray-500">
                  {filteredUsers.length} personne(s) · {periodUsers.filter((u: any) =>u.role==='agent').length} agents · {periodUsers.filter((u: any) =>u.role==='chauffeur').length} chauffeurs · {periodUsers.filter((u: any) =>u.role==='livreur').length} livreurs · {periodUsers.filter((u: any) =>u.role==='caissier').length} caissiers · {periodUsers.filter((u: any) =>u.role==='salarie').length} salariés · {periodUsers.filter((u: any) =>u.role==='admin').length} admins
                </div>
              )}
            </div>
          </div>
  )
}
