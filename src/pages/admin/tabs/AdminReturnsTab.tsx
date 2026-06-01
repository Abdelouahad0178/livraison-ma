import { Download, RotateCcw } from 'lucide-react'

const RETURN_REASONS = [
  'Refus du client',
  'Client injoignable',
  'Adresse incorrecte',
  'Colis endommage',
  'Hors zone',
  'Autre',
]

const getLastHistoryDate = (p: any) => {
  const last = Array.isArray(p.history) ? p.history[p.history.length - 1] : null
  return last?.timestamp ? new Date(last.timestamp) : new Date(0)
}

export default function AdminReturnsTab({
  returnParcels,
  exportRows,
  downloadCsv,
  setReturnModal,
}: any) {
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <RotateCcw className="w-5 h-5 text-rose-600" />
        <div>
          <h2 className="font-black text-gray-800">Suivi des retours</h2>
          <p className="text-xs text-gray-400">{returnParcels.length} retour(s) - motifs et agences concernees</p>
        </div>
        <button
          onClick={() => downloadCsv('retours', exportRows.retours)}
          className="ml-auto inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {returnParcels.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Aucun retour pour cette periode</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-190">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Tracking', 'Date retour', 'Destinataire', 'Ville', 'Motif', 'Note', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {returnParcels.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{getLastHistoryDate(p).toLocaleDateString('fr-MA')}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {p.receiver?.name}
                      <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                    </td>
                    <td className="px-4 py-3">{p.receiver?.city}</td>
                    <td className="px-4 py-3">
                      <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded-lg text-xs font-semibold">{p.returnReason || 'Non renseigne'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-70 truncate">
                      {p.returnNote || p.history?.findLast?.((h: any) => h.status === 'Retourné')?.note || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setReturnModal({ parcel: p, reason: p.returnReason || RETURN_REASONS[0], note: p.returnNote || '', loading: false, error: '' })}
                        className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-2 rounded-xl font-semibold transition"
                      >
                        Motif
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
