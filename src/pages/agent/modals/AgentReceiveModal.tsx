import { Inbox, X, Check } from 'lucide-react'
import { COD_PAYMENT_TYPES } from '../../../firebase/constants'

interface AgentReceiveModalProps {
  receiveModal: any
  setReceiveModal: (v: any) => void
  handleConfirmReceived: (parcel: any, paymentType?: string, chequeDetails?: any) => void
}

export default function AgentReceiveModal({ receiveModal, setReceiveModal, handleConfirmReceived }: AgentReceiveModalProps) {
  if (!receiveModal) return null
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={() => !receiveModal.loading && setReceiveModal(null)}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100vh-2rem)] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-gray-900 text-lg">Confirmer la reception</h3>
            <p className="text-xs text-gray-500 font-mono truncate">{receiveModal.parcel?.trackingId}</p>
          </div>
          <button
            type="button"
            onClick={() => !receiveModal.loading && setReceiveModal(null)}
            disabled={receiveModal.loading}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Expediteur</span>
            <span className="font-bold text-gray-800 text-right truncate">{receiveModal.parcel?.sender?.name || receiveModal.parcel?.agentName || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Destinataire</span>
            <span className="font-bold text-gray-800 text-right truncate">{receiveModal.parcel?.receiver?.name || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200">
            <span className="text-gray-500">Montant</span>
            <span className="font-black text-blue-700">{(parseFloat(receiveModal.parcel?.codAmount || 0) || 0).toLocaleString('fr-MA')} DH</span>
          </div>
        </div>

        {receiveModal.reglement ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Donnees pointeur-encaisseur</p>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200">
                {receiveModal.reglement.status === 'valide' ? 'Valide chef' : receiveModal.reglement.status || 'Enregistre'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Mode : </span><span className="font-bold text-gray-800">{COD_PAYMENT_TYPES.find(t => t.key === receiveModal.reglement.modeReglement)?.label || receiveModal.reglement.modeReglement || '-'}</span></div>
              <div><span className="text-gray-500">Montant : </span><span className="font-bold text-gray-800">{(parseFloat(receiveModal.reglement.montant || 0) || 0).toLocaleString('fr-MA')} DH</span></div>
              <div><span className="text-gray-500">Banque : </span><span className="font-bold text-gray-800">{receiveModal.reglement.banque || '-'}</span></div>
              <div><span className="text-gray-500">N piece : </span><span className="font-bold text-gray-800">{receiveModal.reglement.numeroPiece || '-'}</span></div>
              <div><span className="text-gray-500">Emission : </span><span className="font-bold text-gray-800">{receiveModal.reglement.dateEmission || '-'}</span></div>
              <div><span className="text-gray-500">Echeance : </span><span className="font-bold text-gray-800">{receiveModal.reglement.dateEcheance || '-'}</span></div>
              <div><span className="text-gray-500">Pointeur : </span><span className="font-bold text-gray-800">{receiveModal.reglement.pointeurName || '-'}</span></div>
              <div><span className="text-gray-500">Rapport : </span><span className="font-bold text-gray-800">{receiveModal.reglement.rapportId ? 'Oui' : '-'}</span></div>
            </div>
            {receiveModal.reglement.notes && (
              <p className="mt-3 pt-3 border-t border-emerald-200 text-xs text-gray-600">
                <span className="font-bold text-gray-700">Note : </span>{receiveModal.reglement.notes}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs mb-4">
            Aucune donnee pointeur-encaisseur trouvee pour ce colis. Vous pouvez confirmer manuellement si la valeur est bien recue.
          </div>
        )}

        {receiveModal.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm mb-4">
            {receiveModal.error}
          </div>
        )}

        {receiveModal.step === 'choice' ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Type de valeur recue</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {COD_PAYMENT_TYPES.filter(t => ['especes', 'cheque', 'traite'].includes(t.key)).map(t => (
                <button
                  key={t.key}
                  type="button"
                  disabled={receiveModal.loading}
                  onClick={() => {
                    if (t.key === 'especes') {
                      handleConfirmReceived(receiveModal.parcel, 'especes')
                      return
                    }
                    setReceiveModal((m: any) => m ? { ...m, step: 'document', paymentType: t.key, error: '' } : m)
                  }}
                  className="px-3 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 text-left transition"
                >
                  <span className="block font-black text-gray-800">{t.label}</span>
                  <span className="block text-[11px] text-gray-400 mt-0.5">Confirmer</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Mode</label>
              <select
                value={receiveModal.paymentType || 'cheque'}
                onChange={e => setReceiveModal((m: any) => m ? { ...m, paymentType: e.target.value, error: '' } : m)}
                disabled={receiveModal.loading}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                <option value="cheque">Cheque</option>
                <option value="traite">Traite</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Numero</label>
                <input
                  value={receiveModal.chequeNum || ''}
                  onChange={e => setReceiveModal((m: any) => m ? { ...m, chequeNum: e.target.value, error: '' } : m)}
                  disabled={receiveModal.loading}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Banque</label>
                <input
                  value={receiveModal.banque || ''}
                  onChange={e => setReceiveModal((m: any) => m ? { ...m, banque: e.target.value, error: '' } : m)}
                  disabled={receiveModal.loading}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Date echeance</label>
              <input
                type="date"
                value={receiveModal.echeance || ''}
                onChange={e => setReceiveModal((m: any) => m ? { ...m, echeance: e.target.value, error: '' } : m)}
                disabled={receiveModal.loading}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={receiveModal.matchesPointeur !== false}
                onChange={e => setReceiveModal((m: any) => m ? { ...m, matchesPointeur: e.target.checked } : m)}
                disabled={receiveModal.loading}
                className="mt-1 rounded border-gray-300"
              />
              <span>Les informations correspondent au pointage.</span>
            </label>
            <textarea
              value={receiveModal.note || ''}
              onChange={e => setReceiveModal((m: any) => m ? { ...m, note: e.target.value } : m)}
              disabled={receiveModal.loading}
              placeholder="Note optionnelle"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={() => setReceiveModal(null)}
            disabled={receiveModal.loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Annuler
          </button>
          {receiveModal.step !== 'choice' && (
            <button
              type="button"
              onClick={() => handleConfirmReceived(receiveModal.parcel, receiveModal.paymentType || 'cheque', {
                chequeNum: receiveModal.chequeNum || '',
                banque: receiveModal.banque || '',
                echeance: receiveModal.echeance || '',
                matchesPointeur: receiveModal.matchesPointeur !== false,
                note: receiveModal.note || '',
                reglementId: receiveModal.reglement?.id || '',
              })}
              disabled={receiveModal.loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-black transition flex items-center justify-center gap-2"
            >
              {receiveModal.loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  Confirmation...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmer
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
