import { Banknote, Trash2, CheckSquare, Square, X, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useAgentCtx } from '../AgentCtx'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import { updateParcel, collectPortDuCheque, createCaisseEntry } from '../../../firebase/firestore'

export default function DriversTab() {
  const {
    uid,
    profile,
    parcels,
    setTab,
    portDuReceiving,
    portDuReceiveError, setPortDuReceiveError,
    codFromDriverReceiving,
    handleReceivePortDuEspeces,
    handleReceiveCodFromDriver,
    isRetourFondValue,
  } = useAgentCtx()

  // 🔧 États pour la sélection multiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteLoading, setDeleteLoading] = useState(false)

  // 💳 États pour la modal de paiement du port dû
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedParcel, setSelectedParcel] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'cheque' | null>(null)
  const [chequeForm, setChequeForm] = useState({
    banque: '',
    numero: '',
    dateEncaissement: new Date().toISOString().split('T')[0]
  })
  const [collectingCheque, setCollectingCheque] = useState(false)

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === portDuPending.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(portDuPending.map((p: any) => p.id)))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      alert('⚠️ Veuillez sélectionner au moins un versement à supprimer')
      return
    }

    const count = selectedIds.size
    const total = Array.from(selectedIds).reduce((sum, id) => {
      const p = portDuPending.find((parcel: any) => parcel.id === id)
      return sum + (parseFloat(p?.price || 0))
    }, 0)

    if (!confirm(`🗑️ Confirmer la suppression de ${count} versement(s) ?\n\nMontant total: ${fmtAmt(total)} DH\n\n⚠️ Cette action annulera la collecte du port dû pour ces colis.`)) {
      return
    }

    setDeleteLoading(true)
    try {
      // Annuler la collecte de port dû pour chaque parcel sélectionné
      const promises = Array.from(selectedIds).map(id =>
        updateParcel(id, {
          portStatus: null,
          portCollectedAt: null,
          portCollectedBy: null,
          portCollectedById: null,
        })
      )
      await Promise.all(promises)

      setSelectedIds(new Set())
      alert(`✅ ${count} versement(s) supprimé(s) avec succès!`)
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setDeleteLoading(false)
    }
  }

  // 💳 Ouvrir la modal de choix du mode de paiement
  const handleOpenPaymentModal = (parcel: any) => {
    // 🔒 Vérification: seuls Chef d'agence et Agent pro peuvent collecter
    if (profile?.role !== 'chef_agence' && profile?.role !== 'agentpro') {
      alert('⚠️ Seuls le Chef d\'agence et l\'Agent pro peuvent réceptionner les ports dus.')
      return
    }

    setSelectedParcel(parcel)
    setPaymentMethod(null)
    setChequeForm({
      banque: '',
      numero: '',
      dateEncaissement: new Date().toISOString().split('T')[0]
    })
    setShowPaymentModal(true)
  }

  // 💳 Collecter le port dû par chèque
  const handleCollectPortDuCheque = async () => {
    if (!selectedParcel) return

    // 🔒 Vérification de rôle
    if (profile?.role !== 'chef_agence' && profile?.role !== 'agentpro') {
      alert('⚠️ Seuls le Chef d\'agence et l\'Agent pro peuvent collecter les ports dus.')
      return
    }

    // Validation
    if (!chequeForm.banque.trim()) {
      alert('⚠️ Veuillez saisir le nom de la banque')
      return
    }
    if (!chequeForm.numero.trim()) {
      alert('⚠️ Veuillez saisir le numéro du chèque')
      return
    }
    if (!chequeForm.dateEncaissement) {
      alert('⚠️ Veuillez saisir la date d\'encaissement')
      return
    }

    setCollectingCheque(true)
    try {
      const name = profile?.name || 'Chef'
      const agentId = uid || ''

      // Collecter le port dû par chèque avec les détails
      await collectPortDuCheque(
        selectedParcel.id,
        {
          banque: chequeForm.banque.trim(),
          numero: chequeForm.numero.trim(),
          dateEncaissement: chequeForm.dateEncaissement
        },
        name,
        agentId
      )

      // Créer l'entrée de caisse
      await createCaisseEntry({
        type: 'entree',
        category: 'port_du',
        amount: selectedParcel.price || 0,
        description: `Port dû CHÈQUE — ${selectedParcel.trackingId} (${selectedParcel.receiver?.name || 'Destinataire'})`,
        reference: selectedParcel.trackingId,
        agentId,
        agentName: name,
        city: profile?.city || selectedParcel.receiver?.city || '',
        cashierId: agentId,
        cashierName: name,
      })

      // Fermer la modal
      setShowPaymentModal(false)
      setSelectedParcel(null)
      setPaymentMethod(null)

      alert(`✅ Port dû collecté par chèque!\n\n💳 Banque: ${chequeForm.banque}\n📋 Chèque N°: ${chequeForm.numero}`)
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message}`)
    } finally {
      setCollectingCheque(false)
    }
  }

  // 💵 Collecter le port dû en espèces
  const handleCollectPortDuEspeces = () => {
    if (selectedParcel) {
      setShowPaymentModal(false)
      handleReceivePortDuEspeces(selectedParcel)
      setSelectedParcel(null)
      setPaymentMethod(null)
    }
  }


  const fmtD = (iso: any) => {
    try {
      return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return iso
    }
  }

  const portDuAll = parcels.filter((p: any) => p.portType === 'port_du')
  const portDuPending = portDuAll.filter((p: any) =>
    p.portStatus === 'collected' &&
    p.portCollectedById &&
    !p.portChefReceivedAt &&
    !p.portPointeurAt
  )
  const portDuHistory = portDuAll.filter((p: any) => p.portChefReceivedAt).slice(0, 20)
  const totalPending = portDuPending.reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-base">Port dû — Versements livreurs</h2>
          <p className="text-xs text-gray-400 mt-0.5">Réceptionnez les frais de port dû apportés par les livreurs</p>
        </div>
        <button onClick={() => setTab('home')} className="text-xs text-indigo-600 hover:underline">← Retour</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-orange-600 font-semibold">En attente de réception</p>
          <p className="text-2xl font-black text-orange-700 mt-1">{portDuPending.length}</p>
          <p className="text-xs text-orange-500 mt-0.5">{fmtAmt(totalPending)} DH</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-green-600 font-semibold">Réceptionnés (total)</p>
          <p className="text-2xl font-black text-green-700 mt-1">{portDuHistory.length}</p>
          <p className="text-xs text-green-500 mt-0.5">{fmtAmt(portDuHistory.reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0))} DH</p>
        </div>
      </div>

      {/* Error */}
      {portDuReceiveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
          <span>⚠️</span><span>{portDuReceiveError}</span>
          <button onClick={() => setPortDuReceiveError('')} className="ml-auto font-bold text-red-400 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Pending list */}
      {portDuPending.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <span className="text-3xl">📮</span>
          <p className="text-sm font-semibold mt-2">Aucun port dû en attente de réception</p>
          <p className="text-xs mt-1 text-gray-300">Les versements de livreurs apparaîtront ici</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
          {/* Header avec actions de sélection */}
          <div className="px-4 py-3 border-b border-orange-100 bg-orange-50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-base">📮</span>
              <h3 className="font-bold text-orange-700 text-sm flex-1">Port dû à réceptionner</h3>
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{portDuPending.length}</span>
            </div>

            {/* Barre d'actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-orange-200 rounded-lg text-xs font-semibold text-orange-700 transition"
              >
                {selectedIds.size === portDuPending.length ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    Tout désélectionner
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Tout sélectionner
                  </>
                )}
              </button>

              {selectedIds.size > 0 && (
                <>
                  <div className="text-xs font-semibold text-orange-600 px-2">
                    {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    <span className="ml-1 text-orange-500">
                      ({fmtAmt(Array.from(selectedIds).reduce((sum, id) => {
                        const p = portDuPending.find((parcel: any) => parcel.id === id)
                        return sum + (parseFloat(p?.price || 0))
                      }, 0))} DH)
                    </span>
                  </div>

                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleteLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition ml-auto"
                  >
                    {deleteLoading ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Supprimer la sélection
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {portDuPending.map((p: any) => (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${selectedIds.has(p.id) ? 'bg-orange-50' : 'hover:bg-gray-50'} transition`}>
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelection(p.id)}
                  className="shrink-0"
                >
                  {selectedIds.has(p.id) ? (
                    <CheckSquare className="w-5 h-5 text-orange-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-300 hover:text-orange-400" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-800 font-mono">{p.trackingId}</p>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Port dû</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.sender?.name} → {p.receiver?.name}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">🚴 {p.portCollectedBy || '—'} · {fmtD(p.portCollectedAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-orange-700">{fmtAmt(p.price || 0)} DH</p>
                  {profile?.role === 'chef_agence' || profile?.role === 'agentpro' ? (
                    <button
                      onClick={() => handleOpenPaymentModal(p)}
                      disabled={portDuReceiving[p.id]}
                      className="mt-1 flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                    >
                      {portDuReceiving[p.id]
                        ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        : <Banknote className="w-3 h-3" />}
                      Réceptionner
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-gray-400 italic">Chef/Agent pro seulement</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History port dû */}
      {portDuHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-base">✅</span>
            <h3 className="font-bold text-gray-700 text-sm">Historique port dû reçus</h3>
            <span className="ml-auto text-xs text-gray-400">{portDuHistory.length} enregistrement(s)</span>
          </div>
          <div className="divide-y divide-gray-50">
            {portDuHistory.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-700 font-mono">{p.trackingId}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.sender?.name} → {p.receiver?.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Réceptionné le {fmtD(p.portChefReceivedAt)} · par {p.portChefReceivedBy}</p>
                </div>
                <p className="text-sm font-black text-green-700 shrink-0">{fmtAmt(p.price || 0)} DH</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RETOUR FOND collecté par livreurs (reçu direct chef) ── */}
      {(() => {
        const codFromDrivers = parcels.filter((p: any) =>
          isRetourFondValue(p) &&
          p.codStatus === 'collected' &&
          p.deliveryDriverId &&
          !p.codChefReceivedAt
        )
        if (codFromDrivers.length === 0) return null
        return (
          <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
              <span className="text-base">💰</span>
              <h3 className="font-bold text-blue-700 text-sm">RETOUR FOND livreurs — à réceptionner</h3>
              <span className="ml-auto text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full font-bold">{codFromDrivers.length}</span>
            </div>
            <p className="text-xs text-gray-400 px-4 py-2 bg-blue-50 border-b border-blue-100">Chèques, traites, bons de livraison, espèces et ports dus se valident directement par le chef, client par client.</p>
            <div className="divide-y divide-gray-100">
              {codFromDrivers.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 font-mono">{p.trackingId}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.sender?.name} → {p.receiver?.name}</p>
                    <p className="text-xs text-indigo-500 mt-0.5">🚴 {p.deliveryDriverName || p.portCollectedBy || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-blue-700">{fmtAmt(p.codAmount)} DH</p>
                    <button
                      onClick={() => handleReceiveCodFromDriver(p)}
                      disabled={codFromDriverReceiving[p.id]}
                      className="mt-1 flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                    >
                      {codFromDriverReceiving[p.id]
                        ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        : <Banknote className="w-3 h-3" />}
                      Réceptionner
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Ancien versement groupé masqué : le port dû est reçu colis par colis pour éviter les doublons caisse. */}

      {/* ── MODAL CHOIX MODE DE PAIEMENT PORT DÛ ── */}
      {showPaymentModal && selectedParcel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Réceptionner Port Dû</h2>
                <p className="text-orange-100 text-sm mt-1">
                  {selectedParcel.trackingId} • {fmtAmt(selectedParcel.price || 0)} DH
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedParcel(null)
                  setPaymentMethod(null)
                }}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Choix du mode de paiement */}
              {!paymentMethod && (
                <>
                  <p className="text-sm text-gray-600 font-medium">
                    Comment le port dû a-t-il été payé ?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPaymentMethod('especes')}
                      className="flex flex-col items-center justify-center p-4 border-2 border-gray-300 rounded-xl hover:border-green-500 hover:bg-green-50 transition"
                    >
                      <span className="text-3xl mb-2">💵</span>
                      <span className="font-bold text-gray-700">Espèce</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('cheque')}
                      className="flex flex-col items-center justify-center p-4 border-2 border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition"
                    >
                      <span className="text-3xl mb-2">📋</span>
                      <span className="font-bold text-gray-700">Chèque</span>
                    </button>
                  </div>
                </>
              )}

              {/* Formulaire chèque */}
              {paymentMethod === 'cheque' && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800 font-medium">
                      📋 Veuillez saisir les détails du chèque
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Banque <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={chequeForm.banque}
                      onChange={(e) => setChequeForm({ ...chequeForm, banque: e.target.value })}
                      placeholder="Ex: Attijariwafa Bank"
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Numéro du chèque <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={chequeForm.numero}
                      onChange={(e) => setChequeForm({ ...chequeForm, numero: e.target.value })}
                      placeholder="Ex: 12345678"
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Date d'encaissement <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={chequeForm.dateEncaissement}
                      onChange={(e) => setChequeForm({ ...chequeForm, dateEncaissement: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Confirmation espèces */}
              {paymentMethod === 'especes' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">💵</span>
                    <div>
                      <p className="font-bold text-green-900">Paiement en espèces</p>
                      <p className="text-sm text-green-700 mt-1">
                        Le port dû sera enregistré comme payé en espèces
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3">
              <button
                onClick={() => {
                  if (paymentMethod) {
                    setPaymentMethod(null)
                  } else {
                    setShowPaymentModal(false)
                    setSelectedParcel(null)
                  }
                }}
                disabled={collectingCheque}
                className="flex-1 py-2 px-4 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-100 transition disabled:opacity-50"
              >
                {paymentMethod ? '← Retour' : 'Annuler'}
              </button>
              {paymentMethod && (
                <button
                  onClick={paymentMethod === 'cheque' ? handleCollectPortDuCheque : handleCollectPortDuEspeces}
                  disabled={collectingCheque}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-semibold hover:shadow-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {collectingCheque ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Collecte...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Valider
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
