import { MessageCircle, Check, X, ArrowRight } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { MOD_TYPES } from '../../../firebase/constants'
import { approveModificationRequest, rejectModificationRequest } from '../../../firebase/applyModification'

const MOD_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: 'En attente', bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { label: 'Approuvee',  bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Refusee',    bg: 'bg-red-100',   text: 'text-red-700'   },
}

const fmtModDate = (ts: any): string => {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ModificationsTab() {
  const {
    profile, modRequests, agentNotes, setAgentNotes,
    handleResolveModification, handleDeleteMod,
  } = useAgentCtx()

  // Séparer les demandes selon leur type
  const workflowRequests = modRequests.filter((r: any) => r.type === 'expediteur_to_transporteur')
  const legacyRequests = modRequests.filter((r: any) => !r.type || r.type !== 'expediteur_to_transporteur')

  // Handler pour les demandes du nouveau workflow
  const handleApproveWorkflow = async (req: Record<string, any>) => {
    const note = (agentNotes[req.id] || '').trim()
    try {
      await approveModificationRequest(req.id, {
        role: 'transporteur',
        name: profile?.name || profile?.email || 'Chef agence',
        note: note || undefined
      })
      setAgentNotes((prev: any) => { const n = { ...prev }; delete n[req.id]; return n })
      alert('✅ Demande acceptée et appliquée automatiquement !')
    } catch (e: any) {
      alert(`❌ Erreur : ${e?.message || e}`)
    }
  }

  const handleRejectWorkflow = async (req: Record<string, any>) => {
    const reason = (agentNotes[req.id] || '').trim()
    if (!reason) {
      alert('⚠️ Vous devez indiquer une raison pour refuser')
      return
    }
    try {
      await rejectModificationRequest(req.id, {
        role: 'transporteur',
        name: profile?.name || profile?.email || 'Chef agence',
        reason
      })
      setAgentNotes((prev: any) => { const n = { ...prev }; delete n[req.id]; return n })
      alert('✅ Demande refusée')
    } catch (e: any) {
      alert(`❌ Erreur : ${e?.message || e}`)
    }
  }

  const renderRequest = (req: Record<string, any>, isWorkflow: boolean) => {
    const st = MOD_STATUS[req.status] || MOD_STATUS.pending
    const modType = MOD_TYPES.find(t => t.key === req.modificationType)
    const isPending = req.status === 'pending'

    return (
      <div key={req.id} className={`px-4 py-4 ${isPending ? 'bg-amber-50/40' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-bold text-gray-900">{req.clientName || req.requestedByName || 'Client'}</span>
              <span className="font-mono text-xs text-blue-600 font-bold">{req.trackingId || '—'}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
              {isWorkflow && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  📤 Expéditeur
                </span>
              )}
              {req.autoApplied && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
                  🔄 Appliquée
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-700">{modType?.icon} {req.typeLabel || req.modificationType}</p>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-gray-400 line-through text-xs">{req.currentValue || '—'}</span>
              <ArrowRight className="w-4 h-4 text-purple-500" />
              <span className="font-bold text-gray-900">{req.newValue}</span>
            </div>
            {req.note && <p className="text-xs text-gray-500 mt-1 italic">"{req.note}"</p>}
            {req.agentNote && !isPending && (
              <div className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${st.bg} ${st.text}`}>
                Réponse: {req.agentNote}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {fmtModDate(req.createdAt)}
              {req.reviewedByAgentAt && ` • Traité le ${fmtModDate(req.reviewedByAgentAt)}`}
            </p>
          </div>
          <button onClick={() => handleDeleteMod(req.id)} className="text-red-300 hover:text-red-500 p-1 shrink-0" title="Supprimer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>

        {isPending && (
          <div className="space-y-2">
            <input
              value={agentNotes[req.id] || ''}
              onChange={e => setAgentNotes((prev: any) => ({ ...prev, [req.id]: e.target.value }))}
              placeholder={isWorkflow && !agentNotes[req.id] ? "Note optionnelle" : "Note de réponse (obligatoire pour refus)"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => isWorkflow ? handleApproveWorkflow(req) : handleResolveModification(req.id, 'approved')}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" /> Approuver et appliquer
              </button>
              <button
                onClick={() => isWorkflow ? handleRejectWorkflow(req) : handleResolveModification(req.id, 'rejected')}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1"
              >
                <X className="w-4 h-4" /> Refuser
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const allRequests = [...workflowRequests, ...legacyRequests]
  const pendingCount = allRequests.filter((r: any) => r.status === 'pending').length

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-black text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-amber-600" /> Demandes de modification — {profile?.city || ''}
        </h2>
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-3 py-1 font-bold">
          {pendingCount} en attente
        </span>
      </div>

      {allRequests.length === 0 ? (
        <div className="p-10 text-center text-gray-400">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-sm">Aucune demande de modification.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {workflowRequests.map((req: Record<string, any>) => renderRequest(req, true))}
          {legacyRequests.map((req: Record<string, any>) => renderRequest(req, false))}
        </div>
      )}
    </div>
  )
}
