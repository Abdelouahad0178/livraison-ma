import { AlertTriangle, Banknote, Wallet, MessageCircle, Download, Trash2 } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'

interface AdminAlertsTabProps {
  delayedAlerts: any[]
  codAlerts: any[]
  visibleAlerts: any[]
  alertFilter: string
  setAlertFilter: (v: string) => void
  clientMessages: any[]
  clientReplyDrafts: any
  setClientReplyDrafts: (fn: (d: any) => any) => void
  exportRows: any
  adminEmail: string
  downloadCsv: (name: string, rows: any[]) => void
  handleRemitCod: (p: any) => void
  handleDeleteClientMessage: (id: string) => void
  handleReplyClientMessage: (id: string) => void
  resolveClientMessage: (id: string, email: string) => void
}

export default function AdminAlertsTab({
  delayedAlerts,
  codAlerts,
  visibleAlerts,
  alertFilter,
  setAlertFilter,
  clientMessages,
  clientReplyDrafts,
  setClientReplyDrafts,
  exportRows,
  adminEmail,
  downloadCsv,
  handleRemitCod,
  handleDeleteClientMessage,
  handleReplyClientMessage,
  resolveClientMessage,
}: AdminAlertsTabProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Retards colis', value: delayedAlerts.length, box: 'bg-red-50 border-red-100', text: 'text-red-700', iconText: 'text-red-600', icon: AlertTriangle },
          { label: 'RETOUR FOND non remis', value: codAlerts.length, box: 'bg-orange-50 border-orange-100', text: 'text-orange-700', iconText: 'text-orange-600', icon: Banknote },
          { label: 'Montant RETOUR FOND à remettre', value: `${fmt(codAlerts.reduce((s: any, a: any) => s + (a.parcel.codAmount || 0), 0))} DH`, box: 'bg-yellow-50 border-yellow-100', text: 'text-yellow-700', iconText: 'text-yellow-600', icon: Wallet },
        ].map(({ label, value, box, text, iconText, icon: Icon }) => (
          <div key={label} className={`${box} border rounded-2xl p-5 flex items-center gap-3`}>
            <div className={`w-11 h-11 rounded-xl bg-white ${iconText} flex items-center justify-center`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-xs ${text} font-semibold`}>{label}</p>
              <p className={`text-2xl font-black ${text}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2 items-center">
        {[
          { key: 'all', label: 'Toutes les alertes' },
          { key: 'delay', label: 'Retards' },
          { key: 'cod', label: 'RETOUR FOND non remis' },
        ].map(f => (
          <button key={f.key} onClick={() => setAlertFilter(f.key)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${alertFilter === f.key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
        <button onClick={() => downloadCsv('alertes', exportRows.alertes)}
          className="ml-auto inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-800 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-600" /> Messages clients
            </h3>
            <p className="text-xs text-gray-400">Reactions envoyees depuis le portail client</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-1 font-bold">
            {clientMessages.filter(m => m.status !== 'resolved').length} ouvert(s)
          </span>
        </div>
        {clientMessages.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun message client.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {clientMessages.slice(0, 8).map(m => (
              <div key={m.id} className="p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.status === 'resolved' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">
                    {m.clientName || 'Client'}
                    {m.trackingId && <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg ml-2">{m.trackingId}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{m.type || 'message'} · {m.clientEmail || '—'}</p>
                  <p className="text-sm text-gray-600 mt-2">{m.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{m.deliveredToStaffAt ? 'Recu instantanement' : 'En attente reception'}</span>
                    {m.readByStaffAt && <span className="text-blue-600 font-semibold">Lu par {m.readByStaffBy || 'Admin'}</span>}
                    {m.lastReplyAt && (
                      <span className={m.readByClientAt ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>
                        {m.readByClientAt ? 'Lu par client' : 'Envoye au client'}
                      </span>
                    )}
                  </div>
                  {Array.isArray(m.replies) && m.replies.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {m.replies.map((r: any, idx: any) => (
                        <div key={idx} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                          <p className="text-xs font-bold text-blue-700">{r.authorName || r.authorRole || 'Equipe'}</p>
                          <p className="text-sm text-gray-700 mt-1">{r.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status !== 'resolved' && (
                    <button onClick={() => resolveClientMessage(m.id, adminEmail)}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl font-semibold transition">
                      Marquer traite
                    </button>
                  )}
                  <button onClick={() => handleDeleteClientMessage(m.id)}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl font-semibold transition inline-flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </button>
                </div>
                </div>
                <div className="md:ml-13 flex flex-col sm:flex-row gap-2">
                  <input
                    value={clientReplyDrafts[m.id] || ''}
                    onChange={e => setClientReplyDrafts((d: any) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder="Repondre au client..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => handleReplyClientMessage(m.id)}
                    disabled={!clientReplyDrafts[m.id]?.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-bold"
                  >
                    Repondre
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {visibleAlerts.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Aucune alerte pour cette période</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visibleAlerts.map((a: any, i: any) => {
              const isCod = a.type === 'cod' || alertFilter === 'cod'
              const p = a.parcel
              return (
                <div key={`${p.id}-${isCod ? 'cod' : 'delay'}-${i}`} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${isCod ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'} flex items-center justify-center shrink-0`}>
                    {isCod ? <Banknote className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800">
                      {isCod ? 'RETOUR FOND collecté non remis' : `Retard statut "${p.status}"`}
                      <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg ml-2">{p.trackingId}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {p.receiver?.name} · {p.receiver?.city} · {a.ageHours}h écoulées
                      {a.overdue > 0 && <span className="text-red-600 font-semibold"> · +{a.overdue}h de dépassement</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCod && (
                      <button onClick={() => handleRemitCod(p)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl font-semibold transition">
                        Marquer remis
                      </button>
                    )}
                    <a href={`/track?id=${p.trackingId}`} target="_blank" rel="noreferrer"
                      className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-xl font-semibold transition">
                      Suivi
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
