interface AgentReturnModalProps {
  returnParcelModal: any
  setReturnParcelModal: (v: any) => void
  handleCreateReturnParcel: () => void
}

export default function AgentReturnModal({ returnParcelModal, setReturnParcelModal, handleCreateReturnParcel }: AgentReturnModalProps) {
  if (!returnParcelModal) return null
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => !returnParcelModal.loading && setReturnParcelModal(null)}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        {returnParcelModal.result ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">↩️</div>
            <h3 className="font-bold text-gray-900 text-lg">Colis retour créé !</h3>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
              <p className="text-xs text-gray-500">Nouveau tracking ID</p>
              <p className="font-mono font-bold text-green-700 text-base">{returnParcelModal.result.trackingId}</p>
              <p className="text-xs text-gray-500 mt-2">
                {returnParcelModal.parcel.receiver?.city} → {returnParcelModal.parcel.sender?.city}
              </p>
            </div>
            <button onClick={() => setReturnParcelModal(null)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-sm">
              Fermer
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">↩️</div>
              <div>
                <h3 className="font-bold text-gray-800">Créer un colis retour ?</h3>
                <p className="text-xs text-gray-500">Expédition inversée automatiquement</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
              <div className="flex gap-2"><span className="text-gray-400 text-xs w-20">Expéditeur</span><span className="font-semibold text-gray-800">{returnParcelModal.parcel.receiver?.name}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 text-xs w-20">Destinataire</span><span className="font-semibold text-gray-800">{returnParcelModal.parcel.sender?.name}</span></div>
              <div className="flex gap-2 pt-1 border-t border-gray-200">
                <span className="text-gray-400 text-xs w-20">Trajet</span>
                <span className="font-semibold text-blue-700 text-xs">{returnParcelModal.parcel.destinationCity} → {returnParcelModal.parcel.originCity}</span>
              </div>
            </div>
            {returnParcelModal.error && <p className="text-xs text-red-600">{returnParcelModal.error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setReturnParcelModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Non, ignorer
              </button>
              <button onClick={handleCreateReturnParcel} disabled={returnParcelModal.loading} className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold transition">
                {returnParcelModal.loading ? 'Création...' : 'Oui, créer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
