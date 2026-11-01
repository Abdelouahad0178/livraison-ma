import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { auth } from '../../../firebase/config'
import { fmtFixed as fmtAmt } from '../../../utils/formatNumber'
import { ENVOI_GROUP_LABEL, rejectEnvoi, subscribeEnvois, validateEnvoi, VALEUR_KIND_LABEL, type Envoi, type ValeurKind, type ValeurType } from '../../../firebase/valeursEnvois'
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
const LABEL: Record<string, string> = { envoye: 'À confirmer', valide: 'Reçu', rejete: 'Refusé', annule: 'Annulé' }
const KINDS: ValeurKind[] = ['port_du', 'port_paye', 'cod']
const fmtDT = (v: any) => (v?.toDate ? v.toDate().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

/**
 * ✅ Valeurs à valider : envois de valeurs / espèces transmis par le chef d'exploitation.
 * Le chef d'agence contrôle les montants puis VALIDE (écriture en caisse agence) ou REJETTE (motif).
 * C'est le SEUL chemin par lequel l'argent des livreurs entre chez le chef d'agence
 * (livreur → chef d'exploitation → chef d'agence).
 * 30/10/2026 : validation rapide (par lots) avec progression, avertissement si on quitte la page, et « Reprendre » pour
 * terminer une validation interrompue (rien n'est compté deux fois) ; détail par nature et recherche par N° EXP.
 */
export default function ValeursAValiderTab() {
  const { profile } = useAgentCtx()
  const city = profile?.city
  const [envois, setEnvois] = useState<Envoi[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState<'envoye' | 'all'>('envoye')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!city) return
    return subscribeEnvois(city, setEnvois, e => console.error('ValeursAValider', e))
  }, [city])

  // ⚠️ Validation en cours : avertir avant de fermer / recharger la page
  useEffect(() => {
    if (!busyId) return
    const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busyId])

  const list = envois.filter(e => (filter === 'all' ? e.status !== 'annule' : e.status === 'envoye'))
  const by = { id: auth.currentUser?.uid || '', name: profile?.name || auth.currentUser?.email || '', city: city || '' }

  const toggle = (id: string) => setOpen(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const handleValidate = async (e: Envoi) => {
    const resume = !!e.validationStartedAt
    const detail = TYPES.map(t => `  ${t.emoji} ${t.label} : ${e.totals?.[t.key]?.n || 0} · ${fmtAmt(e.totals?.[t.key]?.amount || 0)} DH`).join('\n')
    if (!window.confirm(`${resume ? 'REPRENDRE et terminer' : 'Confirmer'} la réception du versement ${e.group ? ENVOI_GROUP_LABEL[e.group] : ''} de ${e.createdByName} ?${e.periodLabel ? `\n${e.periodLabel}` : ''}\n\n${detail}\n\nTOTAL : ${fmtAmt(e.totals?.total?.amount || 0)} DH\n\nLes espèces seront enregistrées en caisse agence.${resume ? '\nLes valeurs déjà reçues ne sont pas comptées une deuxième fois.' : ''}\n\n⚠️ Ne fermez pas la page pendant la validation.`)) return
    setMsg(null)
    setBusyId(e.id)
    setProgress({ done: 0, total: e.items.length })
    try {
      await validateEnvoi(e, by, (done, total) => setProgress({ done, total }))
      setMsg({ ok: true, text: `Envoi validé : ${fmtAmt(e.totals?.total?.amount || 0)} DH enregistrés.` })
    } catch (err: any) {
      setMsg({ ok: false, text: `${err?.message || 'Échec de la validation.'} — vous pouvez cliquer « Reprendre la validation » : rien ne sera compté deux fois.` })
    } finally {
      setBusyId(null)
      setProgress(null)
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

  const pendingTotal = envois.filter(e => e.status === 'envoye').reduce((s, e) => s + (e.totals?.total?.amount || 0), 0)
  const pendingN = envois.filter(e => e.status === 'envoye').length

  return (
    <div className="mt-6 space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-800">✅ Versements du chef d'exploitation — {city}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Trois versements séparés (💵 Ports · 💵 COD espèces · 📋 COD chèques / traites), par jour, semaine ou période. Confirmez la réception : l'argent entre alors dans votre caisse.</p>
          {pendingN > 0 && <p className="mt-1 text-sm font-bold text-amber-700">⏳ {pendingN} envoi(s) à confirmer · {fmtAmt(pendingTotal)} DH</p>}
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
        const started = e.status === 'envoye' && !!e.validationStartedAt
        const busy = busyId === e.id
        // Détail par nature (port dû / port payé ramassé / COD) et par type de paiement
        const byKind = KINDS.map(k => {
          const its = e.items.filter(i => i.kind === k)
          return { k, n: its.length, amount: its.reduce((s, i) => s + i.amount, 0) }
        }).filter(x => x.n > 0)
        const needle = q.trim().toLowerCase()
        const items = needle ? e.items.filter(i => String(i.nic).toLowerCase().includes(needle)) : e.items
        return (
          <div key={e.id} className={`bg-white border rounded-xl overflow-hidden ${started ? 'border-orange-300' : 'border-gray-200'}`}>
            <div className="p-3 flex flex-wrap items-center gap-3">
              <button onClick={() => toggle(e.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {e.group ? ENVOI_GROUP_LABEL[e.group] : '📤 Envoi'} — {e.createdByName}
                    <span className="text-xs font-normal text-gray-500"> · envoyé le {fmtDT(e.createdAt)}</span>
                  </p>
                  {e.periodLabel && <p className="text-xs font-semibold text-violet-700">{e.periodLabel} · {new Set(e.items.map(i => i.parcelId)).size} expédition(s)</p>}
                  <p className="text-xs text-gray-600">
                    {byKind.map(x => `${VALEUR_KIND_LABEL[x.k]} : ${x.n} · ${fmtAmt(x.amount)} DH`).join(' · ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {TYPES.map(t => `${t.emoji} ${fmtAmt(e.totals?.[t.key]?.amount || 0)} DH (${e.totals?.[t.key]?.n || 0})`).join(' · ')}
                  </p>
                  {e.note && <p className="text-xs text-gray-600 italic mt-0.5">« {e.note} »</p>}
                  {e.status === 'valide' && <p className="text-xs text-green-700 mt-0.5">✅ Reçu le {fmtDT(e.validatedAt)} par {e.validatedByName || '—'}</p>}
                  {e.status === 'rejete' && <p className="text-xs text-red-700 mt-0.5">❌ Refusé le {fmtDT(e.validatedAt)} par {e.validatedByName || '—'}</p>}
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              <div className="text-right shrink-0">
                <div className="font-bold text-gray-900">{fmtAmt(e.totals?.total?.amount || 0)} DH</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${started ? 'bg-orange-100 text-orange-700' : BADGE[e.status] || ''}`}>{started ? 'Validation interrompue' : LABEL[e.status] || e.status}</span>
              </div>
              {e.status === 'envoye' && (
                <div className="flex gap-2 shrink-0">
                  <button disabled={!!busyId} onClick={() => handleValidate(e)}
                    className={`inline-flex items-center gap-1 ${started ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg`}>
                    <Check className="w-3.5 h-3.5" /> {busy ? 'Validation…' : started ? 'Reprendre la validation' : 'Confirmer la réception'}
                  </button>
                  {!started && (
                    <button disabled={!!busyId} onClick={() => handleReject(e)}
                      className="inline-flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> Refuser
                    </button>
                  )}
                </div>
              )}
            </div>
            {busy && progress && (
              <div className="px-3 pb-3">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                <p className="mt-1 text-xs font-semibold text-green-700">Validation en cours : {progress.done} / {progress.total} valeur(s) — ne fermez pas la page.</p>
              </div>
            )}
            {started && !busy && (
              <p className="px-3 pb-2 text-xs font-semibold text-orange-700">
                ⏳ Validation commencée le {fmtDT(e.validationStartedAt)}{e.validationStartedBy ? ` par ${e.validationStartedBy}` : ''} mais pas terminée : une partie des valeurs est déjà dans votre caisse.
                Cliquez « Reprendre la validation » pour terminer (les valeurs déjà reçues ne sont pas comptées deux fois).
              </p>
            )}
            {e.status === 'rejete' && e.rejectReason && <p className="px-3 pb-2 text-xs text-red-600">Motif du rejet : {e.rejectReason}</p>}
            {e.validationErrors && e.validationErrors.length > 0 && e.status === 'envoye' && (
              <p className="px-3 pb-2 text-xs text-red-600">Dernière validation en erreur : {e.validationErrors.slice(0, 3).join(' | ')}</p>
            )}
            {isOpen && (
              <div className="border-t border-gray-100">
                <div className="px-3 py-2 flex items-center gap-2">
                  <input value={q} onChange={ev => setQ(ev.target.value)} placeholder="Rechercher un N° EXP…" className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                  <span className="text-xs text-gray-500">{items.length} / {e.items.length} valeur(s)</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-gray-600"><th className="px-3 py-1.5">#</th><th className="px-3 py-1.5">N° EXP</th><th className="px-3 py-1.5">Nature</th><th className="px-3 py-1.5">Type</th><th className="px-3 py-1.5 text-right">Montant</th></tr></thead>
                    <tbody>
                      {items.map((i, k) => (
                        <tr key={i.parcelId + i.kind + k} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 text-gray-400">{k + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-blue-600">{i.nic}</td>
                          <td className="px-3 py-1.5">{VALEUR_KIND_LABEL[i.kind] || i.kind}</td>
                          <td className="px-3 py-1.5">{TYPES.find(t => t.key === i.type)?.emoji} {TYPES.find(t => t.key === i.type)?.label}</td>
                          <td className="px-3 py-1.5 text-right">{fmtAmt(i.amount)} DH</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-gray-200 font-bold"><td colSpan={4} className="px-3 py-1.5">Total {needle ? '(recherche)' : ''}</td><td className="px-3 py-1.5 text-right">{fmtAmt(items.reduce((s, i) => s + i.amount, 0))} DH</td></tr></tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
