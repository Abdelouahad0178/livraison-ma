import { Edit2, LayoutGrid, Plus, Printer, Trash2, X, Save } from 'lucide-react'
import { deleteBonRamasageBatch, deleteSector, createSector, updateSector, createBonRamasageBatch } from '../../../firebase/delivery'
import { deleteUserDoc } from '../../../firebase/users'
import { useAgentCtx } from '../AgentCtx'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, authSecondary, db } from '../../../firebase/config'
import { doc, setDoc, updateDoc } from 'firebase/firestore'

export default function SectorsTab() {
  const {
    profile,
    uid,
    sectors = [],
    drivers = [],
    bonBatches = [],
    sectorModal,
    setSectorModal,
    driverModal,
    setDriverModal,
    bonPrintModal,
    setBonPrintModal,
    confirmDeleteDriverId, setConfirmDeleteDriverId,
    handlePrintBonRamassage,
  } = useAgentCtx()

  return (
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Secteurs & equipes</h2>
            <p className="text-xs text-gray-400 mt-0.5">Organisez les zones et livreurs de votre agence</p>
          </div>
          <button onClick={() => setSectorModal?.({ mode: 'new', code: '', name: '', loading: false, error: '' })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Nouveau secteur
          </button>
        </div>

      {sectors.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun secteur cree pour cette agence</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sectors.map((sector: any) => {
            const sectorDrivers = (drivers || []).filter((d: any) =>
              d.sectorId === sector.id &&
              (!profile?.city || d.city === profile.city) &&
              (d.role === 'livreur' || (d.role === 'chauffeur' && d.chauffeurType !== 'transport'))
            )
            return (
              <div key={sector.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {sector.code?.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-indigo-800 text-sm">{sector.code}</p>
                    {sector.name !== sector.code && <p className="text-xs text-indigo-600">{sector.name}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setDriverModal({ mode: 'new', sectorId: sector.id, sectorCode: sector.code, name: '', email: '', password: '', tel: '', matricule: '', existingDriverId: '', loading: false, error: '' })} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition">
                      <Plus className="w-3 h-3" /> Livreur
                    </button>
                    <button onClick={() => setSectorModal({ mode: 'edit', id: sector.id, code: sector.code, name: sector.name, loading: false, error: '' })} className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-600 transition">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteSector(sector.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Livreurs ({sectorDrivers.length})</p>
                  {sectorDrivers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Aucun livreur assigne a ce secteur</p>
                  ) : (
                    <div className="space-y-2">
                      {sectorDrivers.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
                          <div className="w-7 h-7 bg-indigo-200 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                            {d.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                            {d.tel && <p className="text-[10px] text-gray-400">{d.tel}</p>}
                            {d.matricule && <p className="text-[10px] text-gray-400">{d.matricule}</p>}
                          </div>
                          <button onClick={() => setDriverModal({ mode: 'edit', sectorId: sector.id, sectorCode: sector.code, id: d.id, name: d.name, tel: d.tel || '', matricule: d.matricule || '', email: d.email || '', password: '', loading: false, error: '' })} className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-500 transition shrink-0">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteDriverId === d.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={async () => {
                                  if (!['chauffeur', 'livreur'].includes(d.role)) return
                                  await deleteUserDoc(d.id)
                                  setConfirmDeleteDriverId?.(null)
                                }}
                                className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 transition"
                              >
                                Supprimer
                              </button>
                              <button onClick={() => setConfirmDeleteDriverId?.(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteDriverId?.(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setBonPrintModal({ sectorId: sector.id, sectorCode: sector.code, chauffeurId: d.id, chauffeurName: d.name, count: 10, loading: false, error: '' })} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-600 text-white text-[10px] font-bold hover:bg-orange-700 transition shrink-0">
                            <Printer className="w-3 h-3" /> Bons
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {bonBatches && bonBatches.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-orange-50">
            <p className="font-bold text-orange-800 text-sm">Lots de bons imprimes</p>
            <p className="text-xs text-orange-600">{bonBatches.length} lot(s) generes</p>
          </div>
          <div className="divide-y divide-gray-100">
            {bonBatches.slice(0, 10).map((batch: any) => {
              const d = batch.createdAt?.toDate ? batch.createdAt.toDate() : new Date(batch.createdAt || 0)
              return (
                <div key={batch.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 font-mono">{batch.batchRef}</p>
                    <p className="text-xs text-gray-400">{batch.count} bons - Secteur {batch.sectorCode} - {batch.chauffeurName} - {d.toLocaleDateString('fr-MA')}</p>
                  </div>
                  <button onClick={() => handlePrintBonRamassage?.(batch.nexpCodes, batch.batchRef, batch.sectorCode, batch.chauffeurName)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-xs font-semibold hover:bg-orange-200 transition shrink-0">
                    <Printer className="w-3 h-3" /> Reimprimer
                  </button>
                  <button onClick={() => deleteBonRamasageBatch(batch.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Secteur */}
      {sectorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {sectorModal.mode === 'new' ? 'Nouveau secteur' : 'Modifier secteur'}
              </h3>
              <button
                onClick={() => setSectorModal?.(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Code secteur *</label>
                <input
                  type="text"
                  value={sectorModal.code}
                  onChange={e => setSectorModal?.({ ...sectorModal, code: e.target.value })}
                  placeholder="Ex: SEC-01"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  disabled={sectorModal.loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom secteur</label>
                <input
                  type="text"
                  value={sectorModal.name}
                  onChange={e => setSectorModal?.({ ...sectorModal, name: e.target.value })}
                  placeholder="Ex: Centre ville"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  disabled={sectorModal.loading}
                />
              </div>

              {sectorModal.error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{sectorModal.error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    if (!sectorModal.code.trim()) {
                      setSectorModal?.({ ...sectorModal, error: 'Code secteur requis' })
                      return
                    }

                    if (!auth.currentUser?.uid || !profile?.city) {
                      setSectorModal?.({ ...sectorModal, error: 'Session invalide. Reconnectez-vous.' })
                      return
                    }

                    setSectorModal?.({ ...sectorModal, loading: true, error: '' })
                    try {
                      if (sectorModal.mode === 'new') {
                        await createSector({
                          code: sectorModal.code.trim(),
                          name: sectorModal.name.trim() || sectorModal.code.trim(),
                          city: profile.city,
                          createdBy: auth.currentUser?.uid || ''
                        })
                      } else {
                        await updateSector(sectorModal.id, {
                          code: sectorModal.code.trim(),
                          name: sectorModal.name.trim() || sectorModal.code.trim()
                        })
                      }
                      setSectorModal?.(null)
                    } catch (err: any) {
                      setSectorModal?.({ ...sectorModal, loading: false, error: err.message || 'Erreur' })
                    }
                  }}
                  disabled={sectorModal.loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {sectorModal.loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  onClick={() => setSectorModal?.(null)}
                  disabled={sectorModal.loading}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Livreur */}
      {driverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {driverModal.mode === 'new' ? 'Nouveau livreur' : 'Modifier livreur'}
              </h3>
              <button
                onClick={() => setDriverModal?.(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {driverModal.mode === 'new' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">🔍 Assigner un livreur existant (optionnel)</label>
                  <select
                    value={driverModal.existingDriverId || ''}
                    onChange={e => {
                      const selectedId = e.target.value
                      if (selectedId) {
                        const driver = drivers.find((d: any) => d.id === selectedId)
                        if (driver) {
                          setDriverModal?.({
                            ...driverModal,
                            existingDriverId: selectedId,
                            name: driver.name,
                            tel: driver.tel || '',
                            matricule: driver.matricule || '',
                            email: driver.email || '',
                            password: ''
                          })
                        }
                      } else {
                        setDriverModal?.({
                          ...driverModal,
                          existingDriverId: '',
                          name: '',
                          tel: '',
                          matricule: '',
                          email: '',
                          password: ''
                        })
                      }
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    disabled={driverModal.loading}
                  >
                    <option value="">➕ Créer un nouveau livreur</option>
                    {drivers.filter((d: any) =>
                      (d.role === 'livreur' || d.role === 'chauffeur') &&
                      (!d.sectorId || d.sectorId === '') &&
                      d.city === profile?.city
                    ).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        🚚 {d.name} {d.tel ? `(${d.tel})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Livreurs sans secteur assigné</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom complet *</label>
                <input
                  type="text"
                  value={driverModal.name}
                  onChange={e => setDriverModal?.({ ...driverModal, name: e.target.value })}
                  placeholder="Ex: Mohamed Ali"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  disabled={driverModal.loading || driverModal.existingDriverId}
                />
              </div>

              {driverModal.mode === 'new' && !driverModal.existingDriverId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={driverModal.email}
                      onChange={e => setDriverModal?.({ ...driverModal, email: e.target.value })}
                      placeholder="Ex: mohamed@example.com"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      disabled={driverModal.loading}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Mot de passe * (min 6 caractères)</label>
                    <input
                      type="password"
                      value={driverModal.password}
                      onChange={e => setDriverModal?.({ ...driverModal, password: e.target.value })}
                      placeholder="******"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      disabled={driverModal.loading}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={driverModal.tel}
                  onChange={e => setDriverModal?.({ ...driverModal, tel: e.target.value })}
                  placeholder="Ex: 0612345678"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  disabled={driverModal.loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Matricule</label>
                <input
                  type="text"
                  value={driverModal.matricule}
                  onChange={e => setDriverModal?.({ ...driverModal, matricule: e.target.value })}
                  placeholder="Ex: MAT-123"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  disabled={driverModal.loading}
                />
              </div>

              {driverModal.error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{driverModal.error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    if (!driverModal.name.trim()) {
                      setDriverModal?.({ ...driverModal, error: 'Nom complet requis' })
                      return
                    }

                    if (driverModal.mode === 'new' && !driverModal.existingDriverId) {
                      if (!driverModal.email.trim()) {
                        setDriverModal?.({ ...driverModal, error: 'Email requis' })
                        return
                      }
                      if (driverModal.password.length < 6) {
                        setDriverModal?.({ ...driverModal, error: 'Mot de passe: 6 caractères minimum' })
                        return
                      }
                    }

                    if (!profile?.city) {
                      setDriverModal?.({ ...driverModal, error: 'Session invalide. Reconnectez-vous.' })
                      return
                    }

                    setDriverModal?.({ ...driverModal, loading: true, error: '' })
                    try {
                      if (driverModal.mode === 'new') {
                        // Si on assigne un livreur existant
                        if (driverModal.existingDriverId) {
                          await updateDoc(doc(db, 'users', driverModal.existingDriverId), {
                            sectorId: driverModal.sectorId || '',
                            city: profile.city, // Assigner la ville du chef
                          })
                        } else {
                          // Créer un nouveau livreur
                          const cred = await createUserWithEmailAndPassword(
                            authSecondary,
                            driverModal.email.trim(),
                            driverModal.password
                          )
                          await setDoc(doc(db, 'users', cred.user.uid), {
                            name: driverModal.name.trim(),
                            email: driverModal.email.trim().toLowerCase(),
                            role: 'livreur',
                            city: profile.city,
                            code: '',
                            tel: driverModal.tel || '',
                            matricule: driverModal.matricule || '',
                            sectorId: driverModal.sectorId || '',
                            chauffeurType: 'livreur',
                            directorPermissions: [],
                            blockedByChef: false,
                            createdAt: new Date().toISOString()
                          })
                          await authSecondary.signOut()
                        }
                      } else {
                        await updateDoc(doc(db, 'users', driverModal.id), {
                          name: driverModal.name.trim(),
                          tel: driverModal.tel || '',
                          matricule: driverModal.matricule || ''
                        })
                      }
                      setDriverModal?.(null)
                    } catch (err: any) {
                      setDriverModal?.({ ...driverModal, loading: false, error: err.message || 'Erreur' })
                    }
                  }}
                  disabled={driverModal.loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {driverModal.loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  onClick={() => setDriverModal?.(null)}
                  disabled={driverModal.loading}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bons de ramassage */}
      {bonPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Imprimer bons de ramassage</h3>
              <button
                onClick={() => setBonPrintModal?.(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-indigo-50 rounded-xl p-3">
                <p className="text-xs text-indigo-600 font-semibold">Secteur: {bonPrintModal.sectorCode}</p>
                <p className="text-xs text-indigo-600">Livreur: {bonPrintModal.chauffeurName}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre de bons *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={bonPrintModal.count}
                  onChange={e => setBonPrintModal?.({ ...bonPrintModal, count: parseInt(e.target.value) || 1 })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  disabled={bonPrintModal.loading}
                />
              </div>

              {bonPrintModal.error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{bonPrintModal.error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    if (bonPrintModal.count < 1 || bonPrintModal.count > 100) {
                      setBonPrintModal?.({ ...bonPrintModal, error: 'Nombre entre 1 et 100' })
                      return
                    }

                    if (!auth.currentUser?.uid || !profile?.city) {
                      setBonPrintModal?.({ ...bonPrintModal, error: 'Session invalide. Reconnectez-vous.' })
                      return
                    }

                    setBonPrintModal?.({ ...bonPrintModal, loading: true, error: '' })
                    try {
                      const batch = await createBonRamasageBatch({
                        sectorId: bonPrintModal.sectorId,
                        sectorCode: bonPrintModal.sectorCode,
                        chauffeurId: bonPrintModal.chauffeurId,
                        chauffeurName: bonPrintModal.chauffeurName,
                        count: bonPrintModal.count,
                        city: profile.city,
                        createdBy: auth.currentUser?.uid || ''
                      })

                      // Appeler handlePrintBonRamassage si disponible
                      if (handlePrintBonRamassage && batch?.nexpCodes) {
                        handlePrintBonRamassage(
                          batch.nexpCodes,
                          batch.batchRef,
                          bonPrintModal.sectorCode,
                          bonPrintModal.chauffeurName
                        )
                      }

                      setBonPrintModal?.(null)
                    } catch (err: any) {
                      setBonPrintModal?.({ ...bonPrintModal, loading: false, error: err.message || 'Erreur' })
                    }
                  }}
                  disabled={bonPrintModal.loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  {bonPrintModal.loading ? 'Génération...' : 'Générer et imprimer'}
                </button>
                <button
                  onClick={() => setBonPrintModal?.(null)}
                  disabled={bonPrintModal.loading}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
