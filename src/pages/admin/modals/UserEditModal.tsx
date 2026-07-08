import { X, ChevronDown, Save, FileText } from 'lucide-react'
import { auth } from '../../../firebase/config'
import { DIRECTOR_PERMISSIONS, CITIES } from '../../../firebase/constants'

interface UserEditModalProps {
  userEdit: any
  setUserEdit: (v: any) => void
  userEditTab: string
  setUserEditTab: (v: string) => void
  pwdForm: any
  setPwdForm: (v: any) => void
  allSectors: any[]
  ROLES: any[]
  DIRECTOR_PERMISSIONS: any[]
  CITIES: string[]
  inputCls: string
  handleSaveUser: () => void
  handleChangePassword: (e: any) => Promise<void>
  openContractModal: (employee: any) => void
}

export default function UserEditModal({
  userEdit,
  setUserEdit,
  userEditTab,
  setUserEditTab,
  pwdForm,
  setPwdForm,
  allSectors,
  ROLES,
  DIRECTOR_PERMISSIONS,
  CITIES,
  inputCls,
  handleSaveUser,
  handleChangePassword,
  openContractModal,
}: UserEditModalProps) {
  if (!userEdit) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">
              {ROLES.find(r => r.key === userEdit.role)?.emoji || '👤'}
            </div>
            <div>
              <h3 className="font-bold text-gray-800">Fiche employé</h3>
              <p className="text-xs text-gray-400">{userEdit.name}</p>
            </div>
          </div>
          <button onClick={() => setUserEdit(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 mx-5 mt-4 rounded-xl p-1 gap-1 shrink-0">
          <button onClick={() => setUserEditTab('access')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userEditTab === 'access' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            🔑 Accès système
          </button>
          <button onClick={() => setUserEditTab('hr')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userEditTab === 'hr' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            📋 Dossier RH
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">

          {/* TAB ACCÈS */}
          {userEditTab === 'access' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Nom complet</label>
                  <input value={userEdit.name} onChange={e => setUserEdit((m: any) => ({ ...m, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Téléphone</label>
                  <input type="tel" value={userEdit.tel || ''} onChange={e => setUserEdit((m: any) => ({ ...m, tel: e.target.value }))} placeholder="06XXXXXXXX" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Code agent</label>
                  <input value={userEdit.code} onChange={e => setUserEdit((m: any) => ({ ...m, code: e.target.value }))} placeholder="Ex: A123" className={inputCls} />
                </div>
                {userEdit.role === 'chauffeur' && (
                  <>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">🚛 Matricule du camion</label>
                      <input
                        value={userEdit.matricule || ''}
                        onChange={e => setUserEdit((m: any) => ({ ...m, matricule: e.target.value.toUpperCase() }))}
                        placeholder="Ex: 12345 Ø£ 1"
                        className={inputCls}
                      />
                    </div>
                  </>
                )}
                {userEdit.role === 'livreur' && (
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">📍 Secteur assigné</label>
                      <div className="relative">
                        <select
                          value={userEdit.sectorId || ''}
                          onChange={e => setUserEdit((m: any) => ({ ...m, sectorId: e.target.value }))}
                          className={`${inputCls} appearance-none`}>
                          <option value="">— Aucun secteur —</option>
                          {allSectors.filter(s => !userEdit.city || s.city === userEdit.city).map(s => (
                            <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` – ${s.name}` : ''} ({s.city})</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Rôle</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {ROLES.filter(r => r.key !== 'admin').map(r => (
                    <button type="button" key={r.key} onClick={() => setUserEdit((m: any) => ({ ...m, role: r.key }))}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 text-xs font-semibold transition ${userEdit.role === r.key ? `${r.badge} border-current shadow-sm` : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                      <span className="text-lg">{r.emoji}</span>{r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Ville / Agence</label>
                <div className="relative">
                  <select value={userEdit.city} onChange={e => setUserEdit((m: any) => ({ ...m, city: e.target.value }))} className={inputCls + ' appearance-none'}>
                    <option value="">— Sélectionner —</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              {userEdit.role === 'directeur' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">🔑 Permissions accordées</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIRECTOR_PERMISSIONS.map(p => {
                      const active = (userEdit.directorPermissions || []).includes(p.key)
                      return (
                        <button type="button" key={p.key}
                          onClick={() => setUserEdit((m: any) => ({ ...m, directorPermissions: active ? (m.directorPermissions || []).filter((k: any) => k !== p.key) : [...(m.directorPermissions || []), p.key] }))}
                          className={`flex items-start gap-2 p-3 rounded-xl border-2 text-left transition ${active ? 'bg-purple-50 border-purple-400 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          <span className="text-lg shrink-0">{p.emoji}</span>
                          <div><p className="text-xs font-bold leading-tight">{p.label}</p><p className="text-xs opacity-70 leading-tight mt-0.5">{p.desc}</p></div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Section */}
              {userEdit.id === auth.currentUser?.uid && (
                <div className="border-t border-gray-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🔒 Changer le mot de passe</p>
                  <form onSubmit={handleChangePassword} autoComplete="off" className="space-y-2">
                    {pwdForm.error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {pwdForm.error}</p>
                    )}
                    {pwdForm.success && (
                      <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">✅ {pwdForm.success}</p>
                    )}
                    <input
                      type="password"
                      placeholder="Mot de passe actuel"
                      value={pwdForm.current}
                      onChange={e => setPwdForm((f: any) => ({ ...f, current: e.target.value, error: '', success: '' }))}
                      required
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="Nouveau mot de passe (min. 6 caractères)"
                      value={pwdForm.next}
                      onChange={e => setPwdForm((f: any) => ({ ...f, next: e.target.value, error: '', success: '' }))}
                      required
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="Confirmer le nouveau mot de passe"
                      value={pwdForm.confirm}
                      onChange={e => setPwdForm((f: any) => ({ ...f, confirm: e.target.value, error: '', success: '' }))}
                      required
                      className={inputCls}
                    />
                    <button
                      type="submit"
                      disabled={pwdForm.loading}
                      className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                    >
                      {pwdForm.loading
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mise à jour…</>
                        : '🔒 Mettre à jour le mot de passe'
                      }
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* Section */}
          {userEditTab === 'hr' && (
            <>
              <p className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                Informations confidentielles — accès admin uniquement.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">CIN</label>
                  <input value={userEdit.cin||''} onChange={e => setUserEdit((m: any) => ({ ...m, cin: e.target.value }))} placeholder="AB123456" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">N° CNSS</label>
                  <input value={userEdit.cnss||''} onChange={e => setUserEdit((m: any) => ({ ...m, cnss: e.target.value }))} placeholder="Numéro CNSS" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Assurance / Mutuelle</label>
                  <input value={userEdit.assurance||''} onChange={e => setUserEdit((m: any) => ({ ...m, assurance: e.target.value }))} placeholder="Nom / N° police" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de naissance</label>
                  <input type="date" value={userEdit.dateNaissance||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateNaissance: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date d'embauche</label>
                  <input type="date" value={userEdit.dateEmbauche||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateEmbauche: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de sortie</label>
                  <input type="date" value={userEdit.dateSortie||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateSortie: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Salaire (DH/mois)</label>
                  <input type="number" min="0" value={userEdit.salaire||''} onChange={e => setUserEdit((m: any) => ({ ...m, salaire: e.target.value }))} placeholder="0.00" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Situation familiale</label>
                  <div className="relative">
                    <select value={userEdit.situationFamiliale||''} onChange={e => setUserEdit((m: any) => ({ ...m, situationFamiliale: e.target.value }))} className={inputCls + ' appearance-none'}>
                      <option value="">— Sélectionner —</option>
                      {['Célibataire','Marié(e)','Divorcé(e)','Veuf/Veuve'].map(s => <option key={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Adresse</label>
                  <input value={userEdit.adresse||''} onChange={e => setUserEdit((m: any) => ({ ...m, adresse: e.target.value }))} placeholder="Adresse complète" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Contact d'urgence</label>
                  <input value={userEdit.contactUrgence||''} onChange={e => setUserEdit((m: any) => ({ ...m, contactUrgence: e.target.value }))} placeholder="Nom — 06XXXXXXXX" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note RH</label>
                  <textarea rows={3} value={userEdit.noteRH||''} onChange={e => setUserEdit((m: any) => ({ ...m, noteRH: e.target.value }))} placeholder="Observations, historique disciplinaire…" className={inputCls + ' resize-none'} />
                </div>
              </div>

              {/* Bouton contrat */}
              <button
                type="button"
                onClick={() => openContractModal(userEdit)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold transition border border-indigo-200 mt-1"
              >
                <FileText className="w-4 h-4" /> Générer un contrat de travail
              </button>
            </>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={() => setUserEdit(null)} className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">Annuler</button>
            <button onClick={handleSaveUser} className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> Sauvegarder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
