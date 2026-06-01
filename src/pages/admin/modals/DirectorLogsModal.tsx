import { X, ArrowRight } from 'lucide-react'
import { DIRECTOR_PERMISSIONS } from '../../../firebase/constants'
import { DIRECTOR_ACTION_ICONS } from '../../../firebase/directorLogs'
import { fmt } from '../../../utils/formatNumber'

interface DirectorLogsModalProps {
  directorLogsModal: any
  setDirectorLogsModal: (v: any) => void
  periodDirectorLogs: any[]
}

export default function DirectorLogsModal({
  directorLogsModal,
  setDirectorLogsModal,
  periodDirectorLogs,
}: DirectorLogsModalProps) {
  if (!directorLogsModal) return null

  const logs = periodDirectorLogs.filter((l: any) => l.uid === directorLogsModal.id)
  const fmtDate = (ts: any) => ts?.toDate
    ? ts.toDate().toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }) + ' à ' +
      ts.toDate().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const LogDetail = ({ log }: any) => {
    const m = log.meta || {}
    if (log.actionKey === 'status_update') return (
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Numéro colis</p>
            <p className="font-mono font-bold text-blue-600">{m.trackingId || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Changement de statut</p>
            <p className="font-semibold text-gray-700">
              <span className="text-red-500">{m.oldStatus || '—'}</span>
              {' → '}
              <span className="text-green-600">{m.newStatus || '—'}</span>
            </p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Expéditeur</p>
            <p className="font-semibold text-gray-700">{m.senderName || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Destinataire</p>
            <p className="font-semibold text-gray-700">{m.receiverName || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Ville destination</p>
            <p className="font-semibold text-gray-700">📍 {m.receiverCity || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Téléphone</p>
            <p className="font-semibold text-gray-700">{m.receiverTel || '—'}</p>
          </div>
          {(m.price > 0 || m.codAmount > 0) && (
            <>
              {m.price > 0 && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  <p className="text-blue-400 mb-0.5">Frais</p>
                  <p className="font-bold text-blue-700">{fmt(m.price)} DH</p>
                </div>
              )}
              {m.codAmount > 0 && (
                <div className="bg-yellow-50 rounded-lg px-3 py-2 border border-yellow-100">
                  <p className="text-yellow-600 mb-0.5">RETOUR FOND</p>
                  <p className="font-bold text-yellow-700">{fmt(m.codAmount)} DH</p>
                </div>
              )}
            </>
          )}
        </div>
        {m.note && (
          <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 text-xs">
            <p className="text-gray-400 mb-0.5">Note</p>
            <p className="text-gray-700 italic">"{m.note}"</p>
          </div>
        )}
      </div>
    )
    if (log.actionKey === 'cod_remit') return (
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Numéro colis</p>
          <p className="font-mono font-bold text-blue-600">{m.trackingId || '—'}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg px-3 py-2 border border-yellow-100">
          <p className="text-yellow-600 mb-0.5">Montant remis</p>
          <p className="font-bold text-yellow-700">{fmt(m.codAmount || 0)} DH</p>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Destinataire</p>
          <p className="font-semibold text-gray-700">{m.receiverName || '—'}</p>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Ville</p>
          <p className="font-semibold text-gray-700">📍 {m.receiverCity || '—'}</p>
        </div>
        {m.codPaymentType && (
          <div className="col-span-2 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
            <p className="text-green-600 mb-0.5">Mode de paiement</p>
            <p className="font-semibold text-green-700">{m.codPaymentType}</p>
          </div>
        )}
      </div>
    )
    if (log.actionKey === 'user_edit') return (
      <div className="mt-2 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Utilisateur</p>
            <p className="font-semibold text-gray-700">{m.name || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Rôle attribué</p>
            <p className="font-semibold text-gray-700">{m.role || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Ville</p>
            <p className="font-semibold text-gray-700">{m.city || '—'}</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-gray-400 mb-0.5">Téléphone</p>
            <p className="font-semibold text-gray-700">{m.tel || '—'}</p>
          </div>
        </div>
        {(m.changes || []).length > 0 && (
          <div className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
            <p className="text-orange-600 font-semibold mb-1.5">Modifications effectuées :</p>
            <div className="space-y-1">
              {m.changes.map((c: any, i: any) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium w-12 shrink-0">{c.field}</span>
                  <span className="text-red-500 line-through truncate max-w-[80px]">{c.before}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="text-green-600 font-semibold truncate">{c.after}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
    if (log.actionKey === 'page_clients' || log.actionKey === 'page_fleet') return (
      <div className="mt-2">
        <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100 text-xs">
          <p className="text-blue-600 font-semibold">Page consultée : {m.page || log.details}</p>
        </div>
      </div>
    )
    if (log.actionKey === 'client_create') return (
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Client créé</p>
          <p className="font-bold text-gray-800">{m.clientName || '—'}</p>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Ville</p>
          <p className="font-semibold text-gray-700">📍 {m.city || '—'}</p>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Téléphone</p>
          <p className="font-semibold text-gray-700">{m.tel || '—'}</p>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Type de compte</p>
          <p className="font-semibold text-gray-700">{m.accountType === 'compte' ? 'En compte' : 'Comptant'}</p>
        </div>
      </div>
    )
    if (log.actionKey === 'client_update') return (
      <div className="mt-2 space-y-2 text-xs">
        <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-gray-400 mb-0.5">Client modifié</p>
          <p className="font-bold text-gray-800">{m.clientName || '—'} — {m.city || '—'}</p>
        </div>
        {(m.changes || []).length > 0 && (
          <div className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
            <p className="text-orange-600 font-semibold mb-1.5">Modifications :</p>
            <div className="space-y-1">
              {m.changes.map((c: any, i: any) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium w-12 shrink-0">{c.field}</span>
                  <span className="text-red-500 line-through truncate max-w-[80px]">{c.before}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="text-green-600 font-semibold truncate">{c.after}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
    if (log.actionKey === 'client_delete') return (
      <div className="mt-2">
        <div className="bg-red-50 rounded-lg px-3 py-2 border border-red-100 text-xs">
          <p className="text-red-500 font-semibold mb-0.5">Client supprimé</p>
          <p className="text-gray-700 font-medium">{m.clientName || '—'} — {m.city || '—'}</p>
        </div>
      </div>
    )
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-purple-50 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">👔</div>
            <div>
              <h3 className="font-bold text-gray-800">{directorLogsModal.name}</h3>
              <p className="text-xs text-purple-600 font-medium">{logs.length} action(s) enregistrée(s)</p>
            </div>
          </div>
          <button onClick={() => setDirectorLogsModal(null)} className="p-2 hover:bg-white/60 rounded-xl transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {/* Permissions */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0 bg-gray-50">
          <p className="text-xs text-gray-400 font-medium mb-2">Modules accordés</p>
          <div className="flex flex-wrap gap-1.5">
            {(directorLogsModal.directorPermissions || []).length === 0
              ? <span className="text-xs text-gray-400 italic">Aucune permission</span>
              : DIRECTOR_PERMISSIONS.filter(p => (directorLogsModal.directorPermissions || []).includes(p.key)).map(p => (
                  <span key={p.key} className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium">
                    {p.emoji} {p.label}
                  </span>
                ))
            }
          </div>
        </div>
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {logs.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-medium">Aucune action enregistrée</p>
              <p className="text-xs mt-1 text-gray-300">Les actions du directeur apparaîtront ici en temps réel</p>
            </div>
          ) : logs.map((log: any, i: any) => (
            <div key={log.id} className={`rounded-2xl border overflow-hidden ${i === 0 ? 'border-purple-200' : 'border-gray-100'}`}>
              {/* Log header */}
              <div className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? 'bg-purple-50' : 'bg-gray-50'}`}>
                <span className="text-xl shrink-0">{(DIRECTOR_ACTION_ICONS as any)[log.actionKey] || '🔹'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800">{log.details}</p>
                  <p className="text-xs text-gray-400 mt-0.5">🕐 {fmtDate(log.timestamp)}</p>
                </div>
              </div>
              {/* Log detail */}
              {log.meta && Object.keys(log.meta).length > 0 && (
                <div className="px-4 pb-4 pt-2 bg-white">
                  <LogDetail log={log} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
