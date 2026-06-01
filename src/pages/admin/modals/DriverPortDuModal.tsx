import { X, CheckCircle } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'

interface DriverPortDuModalProps {
  driverPortDuModal: any
  setDriverPortDuModal: (v: any) => void
  driverPortDuTxs: any[]
  parcels: any[]
  portDuForm: any
  setPortDuForm: (v: any) => void
  portDuLoading: boolean
  portDuError: string
  portDuEditId: string | null
  setPortDuEditId: (v: string | null) => void
  portDuEditForm: any
  setPortDuEditForm: (v: any) => void
  handleAddPortDuTx: () => void
  handleConfirmDriverVersement: (tx: any, driver: any) => void
  handleDeletePortDuTx: (tx: any, driver: any) => void
  handleSavePortDuEdit: (tx: any, driver: any) => void
}

export default function DriverPortDuModal({
  driverPortDuModal,
  setDriverPortDuModal,
  driverPortDuTxs,
  parcels,
  portDuForm,
  setPortDuForm,
  portDuLoading,
  portDuError,
  portDuEditId,
  setPortDuEditId,
  portDuEditForm,
  setPortDuEditForm,
  handleAddPortDuTx,
  handleConfirmDriverVersement,
  handleDeletePortDuTx,
  handleSavePortDuEdit,
}: DriverPortDuModalProps) {
  if (!driverPortDuModal) return null

  const { driver } = driverPortDuModal
  const txs            = driverPortDuTxs.filter(t => t.driverId === driver.id)
  const portDuCollecte = parcels.filter(p => p.deliveryDriverId === driver.id && p.portType === 'port_du' && p.portStatus === 'collected').reduce((s, p) => s + (p.price || 0), 0)
  const pendingTxs     = txs.filter(t => t.type === 'versement' && t.status === 'pending')
  const versements     = txs.filter(t => t.type === 'versement' && (!t.status || t.status === 'confirmed')).reduce((s, t) => s + (t.amount || 0), 0)
  const avances        = txs.filter(t => t.type === 'avance').reduce((s, t) => s + (t.amount || 0), 0)
  const remises        = txs.filter(t => t.type === 'remise').reduce((s, t) => s + (t.amount || 0), 0)
  const solde          = portDuCollecte - versements - remises + avances
  const fmtDate = (ts: any) => {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center text-xl">🚚</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-800">{driver.name}</h3>
            <p className="text-xs text-gray-400">{driver.city} · Port dû &amp; avances</p>
          </div>
          <button onClick={() => setDriverPortDuModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Solde résumé */}
        <div className="grid grid-cols-3 gap-0 border-b border-gray-100 shrink-0">
          <div className="px-3 py-3 text-center border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase mb-1">Collecté</p>
            <p className="text-lg font-black text-orange-600">{fmt(portDuCollecte)}</p>
            <p className="text-[9px] text-gray-400">DH</p>
          </div>
          <div className="px-3 py-3 text-center border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase mb-1">Versé</p>
            <p className="text-lg font-black text-green-600">{fmt(versements)}</p>
            <p className="text-[9px] text-gray-400">DH</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase mb-1">Solde dû</p>
            <p className={`text-lg font-black ${solde > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(solde)}</p>
            <p className="text-[9px] text-gray-400">DH</p>
          </div>
        </div>
        {avances > 0 && (
          <div className="flex items-center justify-between px-5 py-2 bg-purple-50 border-b border-purple-100 shrink-0">
            <span className="text-xs text-purple-700 font-medium">💳 Total avances données</span>
            <span className="text-sm font-bold text-purple-700">{fmt(avances)} DH</span>
          </div>
        )}

        {/* Versements en attente soumis par le chauffeur */}
        {pendingTxs.length > 0 && (
          <div className="bg-orange-50 border-b border-orange-100 shrink-0">
            <div className="px-5 py-2 flex items-center gap-2">
              <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">⏳ Versements à confirmer</span>
              <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingTxs.length}</span>
            </div>
            <div className="divide-y divide-orange-100 pb-1">
              {pendingTxs.map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-orange-800">{(tx.amount || 0).toLocaleString('fr-MA')} DH</p>
                    {tx.note && <p className="text-xs text-orange-600 truncate">{tx.note}</p>}
                    <p className="text-[10px] text-gray-400">{fmtDate(tx.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleConfirmDriverVersement(tx, driver)}
                    className="shrink-0 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Confirmer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulaire ajout */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs font-bold text-gray-600 mb-3">Enregistrer un mouvement</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { key: 'versement', label: '✅ Versement reçu',   desc: 'Le chauffeur verse du port dû' },
              { key: 'avance',    label: '💳 Avance donnée',     desc: 'Avance accordée au chauffeur'  },
              { key: 'remise',    label: '🔖 Remise solde',      desc: 'Effacer un écart sans caisse'  },
            ].map(opt => (
              <button key={opt.key} type="button"
                onClick={() => setPortDuForm((f: any) => ({ ...f, type: opt.key }))}
                className={`text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition ${
                  portDuForm.type === opt.key
                    ? 'bg-orange-600 border-orange-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-orange-400'
                }`}
              >
                <div>{opt.label}</div>
                <div className={`text-[10px] mt-0.5 ${portDuForm.type === opt.key ? 'text-orange-100' : 'text-gray-400'}`}>{opt.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number" min="1" placeholder="Montant (DH)"
              value={portDuForm.amount}
              onChange={e => setPortDuForm((f: any) => ({ ...f, amount: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none bg-white"
            />
            <input
              placeholder="Note (optionnel)"
              value={portDuForm.note}
              onChange={e => setPortDuForm((f: any) => ({ ...f, note: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none bg-white"
            />
            <button
              onClick={handleAddPortDuTx}
              disabled={portDuLoading}
              className="shrink-0 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-4 rounded-xl text-sm font-semibold transition"
            >
              {portDuLoading ? '...' : '+ Ajouter'}
            </button>
          </div>
          {portDuError && <p className="text-xs text-red-500 mt-2">{portDuError}</p>}
          {solde > 0 && (
            <button
              type="button"
              onClick={() => setPortDuForm({ type: 'remise', amount: String(solde), note: 'Remise — solde définitivement réglé' })}
              className="mt-2 w-full py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
            >
              🔖 Solder le compte ({fmt(solde)} DH) sans caisse
            </button>
          )}
        </div>

        {/* Historique des transactions */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Historique</p>
          {txs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Aucune transaction enregistrée</p>
          ) : txs.map((tx: any) => (
            <div key={tx.id} className={`rounded-xl border ${tx.type === 'versement' ? 'bg-green-50 border-green-200' : tx.type === 'remise' ? 'bg-gray-50 border-gray-200' : 'bg-purple-50 border-purple-200'}`}>
              {portDuEditId === tx.id ? (
                /* Section */
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-xs font-bold text-gray-600">Modifier la transaction</p>
                  <input
                    type="number" min="1" placeholder="Nouveau montant (DH)"
                    value={portDuEditForm.amount}
                    onChange={e => setPortDuEditForm((f: any) => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-orange-400 focus:outline-none bg-white"
                  />
                  <input
                    placeholder="Note (optionnel)"
                    value={portDuEditForm.note}
                    onChange={e => setPortDuEditForm((f: any) => ({ ...f, note: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-orange-400 focus:outline-none bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSavePortDuEdit(tx, driver)}
                      className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold transition"
                    >Enregistrer</button>
                    <button
                      onClick={() => setPortDuEditId(null)}
                      className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold transition"
                    >Annuler</button>
                  </div>
                </div>
              ) : (
                /* Section */
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-lg shrink-0">{tx.type === 'versement' ? '✅' : tx.type === 'remise' ? '🔖' : '💳'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${tx.type === 'versement' ? 'text-green-700' : tx.type === 'remise' ? 'text-gray-600' : 'text-purple-700'}`}>
                      {tx.type === 'versement' ? 'Versement' : tx.type === 'remise' ? 'Remise solde' : 'Avance'} — {fmt(tx.amount)} DH
                    </p>
                    {tx.note && <p className="text-xs text-gray-500 truncate">{tx.note}</p>}
                    <p className="text-[10px] text-gray-400">{fmtDate(tx.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => { setPortDuEditId(tx.id); setPortDuEditForm({ amount: String(tx.amount), note: tx.note || '' }) }}
                    className="shrink-0 p-1.5 hover:bg-orange-100 rounded-lg transition text-gray-400 hover:text-orange-500"
                    title="Modifier"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    onClick={() => handleDeletePortDuTx(tx, driver)}
                    className="shrink-0 p-1.5 hover:bg-red-100 rounded-lg transition text-gray-400 hover:text-red-500"
                    title="Annuler"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
