import { Plus, User, Trash2, Clock, Banknote, Check, X } from 'lucide-react'
import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAgentCtx } from '../AgentCtx'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'

export default function AideAgentsTab() {
  const {
    profile,
    aideAgents,
    aideForm, setAideForm,
    aideLoading,
    aideError,
    aideParcelsFor,
    handleCreateAideAgent,
    handleDeleteAideAgent,
    handleToggleBlockAide,
    createAideModal, setCreateAideModal,
    pointeurUsers,
    pointeurForm, setPointeurForm,
    pointeurLoading,
    pointeurError, setPointeurError,
    createPointeurModal, setCreatePointeurModal,
    handleCreatePointeur,
    pointeurRapports, setPointeurRapports,
    pointeurReglements, setPointeurReglements,
    sourcePointeurReglements,
    rapportError, setRapportError,
    rapportNotesMap, setRapportNotesMap,
    rapportValidating, setRapportValidating,
    rapportChefNotes, setRapportChefNotes,
    handleValiderRapport,
    handleRejeterRapport,
    RETURN_REASONS,
    returnReasonModal, setReturnReasonModal,
    returnParcelModal, setReturnParcelModal,
    submitReturnWithReason,
  } = useAgentCtx()

  // NOUVELLE POLITIQUE : Plus de validation nécessaire
  // Les colis sont directement visibles dans l'onglet Expéditions

  return (
    <>
      {/* ── AIDE AGENTS TAB ── */}
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">👤 Aide Agents</h2>
            <p className="text-xs text-gray-400 mt-0.5">Gérez les aides agents de votre agence</p>
          </div>
          <button
            onClick={() => { setCreateAideModal(true); setAideForm({ name: '', email: '', password: '', tel: '' }); }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
          >
            <Plus className="w-4 h-4" /> Créer aide agent
          </button>
        </div>

        {aideAgents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Aucun aide agent</p>
            <p className="text-xs mt-1">Créez un aide agent pour commencer</p>
          </div>
        ) : (
          <div className="space-y-3">
            {aideAgents.map((aide: any) => (
              <div key={aide.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm shrink-0">
                    {aide.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{aide.name}</p>
                      {aide.blocked ? (
                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Bloqué</span>
                      ) : (
                        <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">Actif</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{aide.email}</p>
                    {aide.tel && <p className="text-xs text-gray-400">{aide.tel}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleBlockAide(aide)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        aide.blocked
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      {aide.blocked ? 'Débloquer' : 'Bloquer'}
                    </button>
                    <button
                      onClick={() => handleDeleteAideAgent(aide)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                  <span>📦 {aideParcelsFor(aide.id).length} colis saisis</span>
                  <span className="text-green-600">✅ Enregistrement direct (pas de validation)</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* NOUVELLE POLITIQUE : Info enregistrement direct */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <Check className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-blue-900 text-sm">✨ Enregistrement direct activé</p>
              <p className="text-xs text-blue-700 mt-1">
                Les colis saisis par les aides-agents sont <strong>enregistrés directement</strong> et visibles dans l'onglet <strong>Expéditions</strong>.
              </p>
              <p className="text-xs text-blue-600 mt-2">
                🔒 <strong>Note :</strong> Une fois qu'un colis est chargé sur un camion, seul le chef peut le modifier.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION POINTEURS-ENCAISSEURS (chef_agence only) ── */}
      {profile?.role === 'chef_agence' && (
        <div className="mt-6 space-y-4">
          {/* Header Pointeurs */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">💼 Pointeurs-Encaisseurs</h2>
              <p className="text-xs text-gray-400 mt-0.5">Gérez les pointeurs et consultez leurs rapports</p>
            </div>
            <button
              onClick={() => { setCreatePointeurModal(true); setPointeurForm({ name: '', email: '', password: '', tel: '' }); setPointeurError('') }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Créer pointeur
            </button>
          </div>

          {/* Liste des pointeurs */}
          {pointeurUsers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Aucun pointeur-encaisseur</p>
              <p className="text-xs mt-1">Créez un compte pour votre pointeur</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pointeurUsers.map((p: any) => {
                const pRapports = pointeurRapports.filter((r: any) => r.pointeurId === p.id)
                const pReglements = pointeurReglements.filter((r: any) => r.pointeurId === p.id)
                const totalMontant = pReglements.reduce((s: number, r: any) => s + (r.montant || 0), 0)
                const pending = pRapports.filter((r: any) => r.status === 'soumis').length
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-indigo-100 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                        {p.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                          {p.blocked
                            ? <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Bloqué</span>
                            : <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">Actif</span>
                          }
                          {pending > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{pending} rapport(s) à valider</span>}
                        </div>
                        <p className="text-xs text-gray-400">{p.email}</p>
                        {p.tel && <p className="text-xs text-gray-400">{p.tel}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-indigo-700">{Number(totalMontant).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</p>
                        <p className="text-xs text-gray-400">{pReglements.length} règlement(s)</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                      <button
                        onClick={() => updateDoc(doc(db, 'users', p.id), { blocked: !p.blocked })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          p.blocked ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}>
                        {p.blocked ? 'Débloquer' : 'Bloquer'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Supprimer définitivement ${p.name} ?`)) return
                          await deleteDoc(doc(db, 'users', p.id))
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Rapports à valider */}
          {(() => {
            const pendingRapports = pointeurRapports.filter((r: any) => r.status === 'soumis')
            if (!pendingRapports.length) return null
            
            const fmtD = (iso: any) => { try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso } }
            return (
              <div className="space-y-3">
                <h3 className="font-bold text-amber-700 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" /> {pendingRapports.length} rapport(s) en attente de validation
                </h3>
                {rapportError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                    <span className="text-base leading-none">⚠️</span>
                    <span>{rapportError}</span>
                    <button onClick={() => setRapportError('')} className="ml-auto text-red-400 hover:text-red-700 font-bold">✕</button>
                  </div>
                )}
                {pendingRapports.map((rapport: any) => {
                  const isBusy = rapportValidating?.startsWith(rapport.id)
                  const rapportEntries = pointeurReglements.filter((r: any) => rapport.entryIds?.includes(r.id))
                  return (
                    <div key={rapport.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-800 text-sm">Rapport du {fmtD(rapport.date)}</p>
                          <p className="text-xs text-gray-500">
                            Par {rapport.pointeurName} · {rapport.nbEntries} règlement(s) · Soumis {fmtD(rapport.submittedAt)}
                          </p>
                        </div>
                        <span className="text-base font-black text-amber-700">{fmtAmt(rapport.totalMontant)} DH</span>
                      </div>

                      {/* Répartition */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {rapport.totalEspeces > 0 && <div className="bg-white rounded-xl p-2 border border-green-100"><p className="text-[10px] text-green-600">💵 Espèces</p><p className="text-sm font-bold text-green-700">{fmtAmt(rapport.totalEspeces)} DH</p></div>}
                        {rapport.totalCheques > 0 && <div className="bg-white rounded-xl p-2 border border-blue-100"><p className="text-[10px] text-blue-600">📋 Chèques</p><p className="text-sm font-bold text-blue-700">{fmtAmt(rapport.totalCheques)} DH</p></div>}
                        {rapport.totalTraites > 0 && <div className="bg-white rounded-xl p-2 border border-purple-100"><p className="text-[10px] text-purple-600">📝 Traites</p><p className="text-sm font-bold text-purple-700">{fmtAmt(rapport.totalTraites)} DH</p></div>}
                      </div>

                      {/* Détails */}
                      {rapportEntries.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {rapportEntries.map((r: any) => {
                            const mi = ({ especes: { emoji: '💵', text: 'text-green-700' }, cheque: { emoji: '📋', text: 'text-blue-700' }, traite: { emoji: '📝', text: 'text-purple-700' } } as Record<string, { emoji: string; text: string }>)[r.modeReglement] || {}
                            return (
                              <div key={r.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 text-xs">
                                <span>{mi.emoji}</span>
                                <span className="flex-1 truncate text-gray-700">{r.expediteur || '—'}</span>
                                {r.trackingNumber && <span className="text-gray-400 font-mono">{r.trackingNumber}</span>}
                                {r.banque && <span className="text-gray-400">{r.banque}</span>}
                                <span className={`font-bold ${mi.text}`}>{fmtAmt(r.montant)} DH</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {rapport.notes && (
                        <p className="text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-100">
                          <span className="font-semibold">Note pointeur : </span>{rapport.notes}
                        </p>
                      )}

                      {/* Note chef + actions */}
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
                          className="py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm hover:bg-red-200 disabled:opacity-50 transition flex items-center justify-center gap-1.5">
                          {rapportValidating === rapport.id + '_rejeter' ? '...' : <><X className="w-4 h-4" /> Rejeter</>}
                        </button>
                        <button
                          onClick={() => handleValiderRapport(rapport)}
                          disabled={!!isBusy}
                          className="py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 transition flex items-center justify-center gap-1.5">
                          {rapportValidating === rapport.id + '_valider' ? '...' : <><Check className="w-4 h-4" /> Valider</>}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Historique rapports */}
          {pointeurRapports.filter((r: any) => r.status !== 'soumis').length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-gray-700 text-sm">Historique rapports</h3>
              {pointeurRapports.filter((r: any) => r.status !== 'soumis').slice(0, 10).map((rapport: any) => {
                
                const fmtD = (iso: any) => { try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso } }
                const statusBadge: Record<string, string> = { brouillon: 'bg-gray-100 text-gray-600', soumis: 'bg-amber-100 text-amber-700', valide: 'bg-green-100 text-green-700', rejete: 'bg-red-100 text-red-700' }
                return (
                  <div key={rapport.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-700">{rapport.pointeurName} · {fmtD(rapport.date)}</p>
                      <p className="text-xs text-gray-400">{rapport.nbEntries} règlement(s)</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[rapport.status] || 'bg-gray-100 text-gray-600'}`}>
                      {rapport.status === 'valide' ? 'Validé' : rapport.status === 'rejete' ? 'Rejeté' : rapport.status}
                    </span>
                    <span className="text-sm font-black text-gray-800">{fmtAmt(rapport.totalMontant)} DH</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal créer aide agent */}
      {createAideModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !aideLoading && setCreateAideModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <User className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Créer un aide agent</h3>
                <p className="text-xs text-gray-400">Agence : {profile?.city}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nom complet *</label>
                <input
                  type="text"
                  value={aideForm.name}
                  onChange={e => setAideForm((p: any) => ({ ...p, name: e.target.value }))}
                  placeholder="Nom de l'aide agent"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email *</label>
                <input
                  type="email"
                  value={aideForm.email}
                  onChange={e => setAideForm((p: any) => ({ ...p, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Mot de passe *</label>
                <input
                  type="password"
                  value={aideForm.password}
                  onChange={e => setAideForm((p: any) => ({ ...p, password: e.target.value }))}
                  placeholder="Minimum 6 caractères"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Téléphone (optionnel)</label>
                <input
                  type="tel"
                  value={aideForm.tel}
                  onChange={e => setAideForm((p: any) => ({ ...p, tel: e.target.value }))}
                  placeholder="0600000000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                />
              </div>
            </div>
            {aideError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-2">{aideError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCreateAideModal(false)}
                disabled={aideLoading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateAideAgent}
                disabled={aideLoading}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold transition"
              >
                {aideLoading ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal créer pointeur-encaisseur */}
      {createPointeurModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !pointeurLoading && setCreatePointeurModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Créer un pointeur-encaisseur</h3>
                <p className="text-xs text-gray-400">Agence : {profile?.city}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nom complet *</label>
                <input type="text" value={pointeurForm.name}
                  onChange={e => setPointeurForm((p: any) => ({ ...p, name: e.target.value }))}
                  placeholder="Nom du pointeur"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email *</label>
                <input type="email" value={pointeurForm.email}
                  onChange={e => setPointeurForm((p: any) => ({ ...p, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Mot de passe *</label>
                <input type="password" value={pointeurForm.password}
                  onChange={e => setPointeurForm((p: any) => ({ ...p, password: e.target.value }))}
                  placeholder="Minimum 6 caractères"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Téléphone (optionnel)</label>
                <input type="tel" value={pointeurForm.tel}
                  onChange={e => setPointeurForm((p: any) => ({ ...p, tel: e.target.value }))}
                  placeholder="0600000000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            {pointeurError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-2">{pointeurError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCreatePointeurModal(false)} disabled={pointeurLoading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleCreatePointeur} disabled={pointeurLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold transition">
                {pointeurLoading ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal raison du retour */}
      {returnReasonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !returnReasonModal.loading && setReturnReasonModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">↩️</div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Retourner ce colis</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{returnReasonModal.parcel.trackingId}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raison du retour</p>
              {RETURN_REASONS.map((r: any) => (
                <button key={r} type="button"
                  onClick={() => setReturnReasonModal((m: any) => ({ ...m, reason: r }))}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                    returnReasonModal.reason === r
                      ? 'bg-red-50 border-red-400 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {returnReasonModal.reason === r ? '● ' : '○ '}{r}
                </button>
              ))}
              {returnReasonModal.reason === 'Autre raison' && (
                <input
                  autoFocus
                  type="text"
                  placeholder="Précisez la raison…"
                  value={returnReasonModal.customReason}
                  onChange={e => setReturnReasonModal((m: any) => ({ ...m, customReason: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-400"
                />
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setReturnReasonModal(null)}
                disabled={returnReasonModal.loading}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button type="button" onClick={submitReturnWithReason}
                disabled={returnReasonModal.loading || !returnReasonModal.reason}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition">
                {returnReasonModal.loading ? 'En cours…' : 'Confirmer retour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
