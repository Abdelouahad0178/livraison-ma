import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { auth } from '../../../firebase/config'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import { rejectEnvoi, subscribeEnvois, validateEnvoi, type Envoi, type ValeurType } from '../../../firebase/valeursEnvois'
import { useAgentCtx } from '../AgentCtx'

const TYPES: { key: ValeurType; label: string; emoji: string }[] = [
  { key: 'especes', label: 'Espèces', emoji: '💵' },
  { key: 'cheque', label: 'Chèques', emoji: '📋' },
  { key: 'traite', label: 'Traites', emoji: '📝' },
]
const BADGE: Record<string, string> = {
  envoye: 'bg-amber-100 text-amber-700', valide: 'bg-green-100 text-green-700',
  rejete: 'bg-red-100 text-red-700', annule: 'bg-gray-100 text-gray-500',
}
const LABEL: Record<string, string> = { envoye: 'À valider', valide: 'Validé', rejete: 'Rejeté', annule: 'Annulé' }

/**
 * ✅ Valeurs à valider : envois de valeurs / espèces transmis par le chef d'exploitation.
 * Le chef d'agence contrôle les montants puis VALIDE (écriture en caisse agence) ou REJETTE (motif).
 */
export default function ValeursAValiderTab() {
  const { profile } = useAgentCtx()
  const city = profile?.city
  const [envois, setEnvois] = useState<Envoi[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState<'envoye' | 'all'>('envoye')

  useEffect(() => {
    if (!city) return
    return subscribeEnvois(city, setEnvois, e => console.error('ValeursAValider', e))
  }, [city])

  const list = envois.filter(e => (filter === 'all' ? e.status !== 'annule' : e.status === 'envoye'))
  const by = { id: auth.currentUser?.uid || '', name: profile?.name || auth.currentUser?.email || '', city: city || '' }

  const toggle = (id: string) => setOpen(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const handleValidate = async (e: Envoi) => {
    const detail = TYPES.map(t => `  ${t.emoji} ${t.label} : ${e.totals?.[t.key]?.n || 0} · ${fmtAmt(e.totals?.[t.key]?.amount || 0)} DH`).join('\n')
    if (!window.confirm(`Valider l'envoi de ${e.createdByName} ?\n\n${detail}\n\nTOTAL : ${fmtAmt(e.totals?.total?.amount || 0)} DH\n\nLes espèces seront enregistrées en caisse agence.`)) return
    setMsg(null)
    setBusyId(e.id)
    try {
      await validateEnvoi(e, by)
      setMsg({ ok: true, text: `Envoi validé : ${fmtAmt(e.totals?.total?.amount || 0)} DH enregistrés.` })
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Échec de la validation.' })
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (e: Envoi) => {
    const reason = window.prompt('Motif du rejet (obligatoire) :')
    if (reason === null) return
    setMsg(null)
    setBusyId(e.id)
    try {
      await rejectEnvoi(e.id, reason, { id: by.id, name: by.name })
      setMsg({ ok: true, text: 'Envoi rejeté.' })
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Échec du rejet.' })
    } finally {
      setBusyId(null)
    }
  }

  if (!city) return <p className="text-sm text-gray-500 mt-6">Aucune ville associée à ce compte.</p>

  return (
    <div className="mt-6 space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-800">✅ Valeurs à valider — {city}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Envois de valeurs et d'espèces transmis par le chef d'exploitation.</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="envoye">À valider</option>
          <option value="all">Tous (validés, rejetés)</option>
        </select>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-xs font-semibold border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>
      )}

      {list.length === 0 && <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">Aucun envoi.</div>}

      {list.map(e => {
        const isOpen = open.has(e.id)
        return (
          <div key={e.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-3 flex flex-wrap items-center gap-3">
              <button onClick={() => toggle(e.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{e.createdByName} <span className="text-xs font-normal text-gray-500">· {e.createdAt?.toDate ? e.createdAt.toDate().toLocaleString('fr-FR') : '—'}</span></p>
                  <p className="text-xs text-gray-500">
                    {TYPES.map(t => `${t.emoji} ${fmtAmt(e.totals?.[t.key]?.amount || 0)} DH (${e.totals?.[t.key]?.n || 0})`).join(' · ')}
                  </p>
                  {e.note && <p className="text-xs text-gray-600 italic mt-0.5">« {e.note} »</p>}
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              <div className="text-right shrink-0">
                <div className="font-bold text-gray-900">{fmtAmt(e.totals?.total?.amount || 0)} DH</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${BADGE[e.status] || ''}`}>{LABEL[e.status] || e.status}</span>
              </div>
              {e.status === 'envoye' && (
                <div className="flex gap-2 shrink-0">
                  <button disabled={busyId === e.id} onClick={() => handleValidate(e)}
                    className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg">
                    <Check className="w-3.5 h-3.5" /> {busyId === e.id ? '…' : 'Valider'}
                  </button>
                  <button disabled={busyId === e.id} onClick={() => handleReject(e)}
                    className="inline-flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Rejeter
                  </button>
                </div>
              )}
            </div>
            {e.status === 'rejete' && e.rejectReason && <p className="px-3 pb-2 text-xs text-red-600">Motif du rejet : {e.rejectReason}</p>}
            {e.validationErrors && e.validationErrors.length > 0 && e.status === 'envoye' && (
              <p className="px-3 pb-2 text-xs text-red-600">Dernière validation en erreur : {e.validationErrors.slice(0, 3).join(' | ')}</p>
            )}
            {isOpen && (
              <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-600"><th className="px-3 py-1.5">N° EXP</th><th className="px-3 py-1.5">Nature</th><th className="px-3 py-1.5">Type</th><th className="px-3 py-1.5 text-right">Montant</th></tr></thead>
                  <tbody>
                    {e.items.map((i, k) => (
                      <tr key={i.parcelId + k} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-mono font-semibold text-blue-600">{i.nic}</td>
                        <td className="px-3 py-1.5">{i.kind === 'port_du' ? 'Port dû' : 'COD'}</td>
                        <td className="px-3 py-1.5">{TYPES.find(t => t.key === i.type)?.emoji} {TYPES.find(t => t.key === i.type)?.label}</td>
                        <td className="px-3 py-1.5 text-right">{fmtAmt(i.amount)} DH</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
