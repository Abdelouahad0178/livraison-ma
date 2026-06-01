import { Banknote } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'

export default function DriversTab() {
  const {
    uid,
    parcels,
    setTab,
    portDuReceiving,
    portDuReceiveError, setPortDuReceiveError,
    codFromDriverReceiving,
    handleReceivePortDuEspeces,
    handleReceiveCodFromDriver,
    isRetourFondValue,
  } = useAgentCtx()

  
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
          <div className="px-4 py-3 border-b border-orange-100 bg-orange-50 flex items-center gap-2">
            <span className="text-base">📮</span>
            <h3 className="font-bold text-orange-700 text-sm">Port dû à réceptionner</h3>
            <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{portDuPending.length}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {portDuPending.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
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
                  <button
                    onClick={() => handleReceivePortDuEspeces(p)}
                    disabled={portDuReceiving[p.id]}
                    className="mt-1 flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                  >
                    {portDuReceiving[p.id]
                      ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      : <Banknote className="w-3 h-3" />}
                    Réceptionner
                  </button>
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
    </div>
  )
}
