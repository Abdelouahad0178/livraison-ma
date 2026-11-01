// 💬 Admin › Reste à encaisser (Ports / COD par agence) › « WhatsApp par livreur » : un PDF par livreur coché (tous ou
// chacun), déposé en ligne, puis envoyé par WhatsApp — à CHAQUE livreur sur son numéro (un clic « Envoyer » par
// livreur, ou « Envoyer au suivant ») ou TOUT à UN seul numéro (un message avec tous les liens, un seul clic).
// WhatsApp exige d'appuyer sur « Envoyer » dans la discussion : le site prépare tout le reste.
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Loader2, Send, X } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import type { ResteLine } from '../../../utils/agencyFollowUp'
import { prepareResteWhatsApp, waNumber, type ShareResteOpts } from '../../../utils/shareResteWhatsApp'

const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
const NO_DRIVER = 'Sans livreur (retrait agence)'

interface Row { name: string; id: string | null; lines: ResteLine[]; total: number }
type Prepared = { url: string; message: string }

export default function BulkWhatsAppDialog({ base, lines, onClose }: {
  /** Agence, période, libellés, sujet (Ports / COD) et montant mis en avant — sans lignes ni livreur */
  base: Omit<ShareResteOpts, 'lines' | 'driver'>
  /** Expéditions cochées dans « Reste à encaisser » */
  lines: ResteLine[]
  onClose: () => void
}) {
  const rows: Row[] = useMemo(() => {
    const m = new Map<string, Row>()
    lines.forEach(l => {
      const name = l.p.deliveryDriverName || NO_DRIVER
      const r: Row = m.get(name) || { name, id: l.p.deliveryDriverId || null, lines: [], total: 0 }
      r.lines.push(l); r.total += l[base.focus]; if (!r.id && l.p.deliveryDriverId) r.id = l.p.deliveryDriverId
      m.set(name, r)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [lines, base.focus])

  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map(r => r.name)))
  const [mode, setMode] = useState<'chacun' | 'unique'>('chacun')
  const [single, setSingle] = useState('')
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [useWeb, setUseWeb] = useState(false)
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // 📞 Téléphone de chaque livreur (fiche du compte)
  useEffect(() => {
    let alive = true
    Promise.all(rows.filter(r => r.id).map(async r => {
      try { const s = await getDoc(doc(db, 'users', r.id!)); return [r.name, s.exists() ? String(s.data().tel || s.data().phone || '') : ''] as const } catch { return [r.name, ''] as const }
    })).then(list => { if (alive) setPhones(prev => ({ ...Object.fromEntries(list.filter(([, t]) => t)), ...prev })) })
    return () => { alive = false }
  }, [rows.map(r => r.id).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosenRows = rows.filter(r => checked.has(r.name))
  const allOn = chosenRows.length === rows.length && rows.length > 0
  const toggle = (name: string) => setChecked(prev => { const x = new Set(prev); x.has(name) ? x.delete(name) : x.add(name); return x })
  const ready = chosenRows.length > 0 && chosenRows.every(r => prepared[r.name])

  const prepare = async () => {
    setError('')
    const todo = chosenRows.filter(r => !prepared[r.name])
    setBusy({ done: 0, total: todo.length })
    for (const [i, r] of todo.entries()) {
      try {
        const p = await prepareResteWhatsApp({ ...base, lines: r.lines, driver: r.name === NO_DRIVER ? undefined : r.name })
        setPrepared(prev => ({ ...prev, [r.name]: p }))
      } catch (e: any) { setError(`${r.name} : ${e?.message || e}`); break }
      setBusy({ done: i + 1, total: todo.length })
    }
    setBusy(null)
  }

  const link = (num: string, message: string) => {
    const n = waNumber(num), t = encodeURIComponent(message)
    return useWeb ? `https://web.whatsapp.com/send?${n ? `phone=${n}&` : ''}text=${t}` : `whatsapp://send?${n ? `phone=${n}&` : ''}text=${t}`
  }
  const open = (href: string) => { if (useWeb) window.open(href, '_blank', 'noopener'); else window.location.href = href }
  const sendOne = (r: Row) => { const p = prepared[r.name]; if (!p) return; open(link(phones[r.name] || '', p.message)); setSent(prev => new Set(prev).add(r.name)) }
  const next = chosenRows.find(r => prepared[r.name] && !sent.has(r.name))

  // Un seul numéro : UN message avec tous les livreurs et leurs liens
  const combined = useMemo(() => [
    `BG EXPRESS — ${base.focus === 'reste' ? 'Reste à encaisser' : base.focus === 'attendu' ? 'Attendu' : 'Encaissé'} (${base.subject}) — ${base.city}`,
    `Période : ${base.periodText}`, '',
    ...chosenRows.filter(r => prepared[r.name]).map(r => `• ${r.name} — ${r.lines.length} exp. — ${dh(r.total)}\n  ${prepared[r.name].url}`),
    '', `Total : ${chosenRows.reduce((s, r) => s + r.lines.length, 0)} expédition(s) — ${dh(chosenRows.reduce((s, r) => s + r.total, 0))}`,
  ].join('\n'), [chosenRows, prepared, base])

  const inp = 'px-2 py-1.5 rounded-lg border border-slate-300 text-sm tabular-nums'
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b bg-green-50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-green-900">💬 WhatsApp par livreur — {base.subject} — {base.city}</h3>
            <p className="text-xs text-green-800">{base.periodText} · un PDF par livreur coché</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-green-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Destinataire */}
        <div className="px-5 py-3 border-b flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={mode === 'chacun'} onChange={() => setMode('chacun')} className="accent-green-600" /> À chaque livreur (son numéro)</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={mode === 'unique'} onChange={() => setMode('unique')} className="accent-green-600" /> Tout à un seul numéro</label>
          {mode === 'unique' && <input value={single} onChange={e => setSingle(e.target.value)} placeholder="06 XX XX XX XX (vide = choisir le contact)" className={`${inp} w-64`} />}
          <label className="inline-flex items-center gap-1.5 ml-auto text-xs text-slate-600"><input type="checkbox" checked={useWeb} onChange={e => setUseWeb(e.target.checked)} className="accent-green-600" /> Utiliser WhatsApp Web (sinon l'application Windows)</label>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={allOn} onChange={() => setChecked(allOn ? new Set() : new Set(rows.map(r => r.name)))} className="w-4 h-4 accent-green-600" /></th>
                <th className="px-3 py-2 text-left">Livreur</th><th className="px-3 py-2 text-right">Expéditions</th><th className="px-3 py-2 text-right">Montant</th>
                {mode === 'chacun' && <th className="px-3 py-2 text-left">Numéro WhatsApp</th>}
                <th className="px-3 py-2 text-left">PDF</th>{mode === 'chacun' && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const on = checked.has(r.name), p = prepared[r.name], phone = phones[r.name] || ''
                return (
                  <tr key={r.name} className={`border-t border-slate-100 ${on ? '' : 'opacity-40'}`}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={() => toggle(r.name)} className="w-4 h-4 accent-green-600" /></td>
                    <td className="px-3 py-1.5 font-semibold">{r.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.lines.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-amber-700">{dh(r.total)}</td>
                    {mode === 'chacun' && (
                      <td className="px-3 py-1.5">
                        <input value={phone} onChange={e => setPhones(prev => ({ ...prev, [r.name]: e.target.value }))} placeholder="06…" className={`${inp} w-36 ${phone && !waNumber(phone) ? 'border-red-400' : ''}`} />
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-xs">{p ? <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">voir</a> : <span className="text-slate-400">—</span>}</td>
                    {mode === 'chacun' && (
                      <td className="px-3 py-1.5 text-right">
                        {p && on && (sent.has(r.name)
                          ? <button onClick={() => sendOne(r)} className="inline-flex items-center gap-1 text-xs text-green-700 font-semibold"><Check className="w-3.5 h-3.5" /> ouvert · renvoyer</button>
                          : <button onClick={() => sendOne(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"><Send className="w-3.5 h-3.5" /> Envoyer</button>)}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t flex flex-wrap items-center gap-3">
          {error && <span className="text-xs text-red-700 w-full">Erreur : {error}</span>}
          {!ready ? (
            <button onClick={prepare} disabled={!chosenRows.length || !!busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Préparation {busy.done}/{busy.total}…</> : <>📄 Préparer les PDF ({chosenRows.length} livreur{chosenRows.length > 1 ? 's' : ''})</>}
            </button>
          ) : mode === 'chacun' ? (
            next
              ? <button onClick={() => sendOne(next)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"><Send className="w-4 h-4" /> Envoyer au suivant : {next.name}</button>
              : <span className="text-sm font-semibold text-green-700">✓ Tous les messages ont été ouverts dans WhatsApp</span>
          ) : (
            <>
              <button onClick={() => open(link(single, combined))} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"><Send className="w-4 h-4" /> Envoyer tout ({chosenRows.length} PDF) en un message</button>
              <button onClick={async () => { try { await navigator.clipboard.writeText(combined); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* refusé */ } }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"><Copy className="w-3.5 h-3.5" /> {copied ? 'Copié ✓' : 'Copier le message'}</button>
            </>
          )}
          <span className="text-[11px] text-slate-500 ml-auto max-w-sm">WhatsApp s'ouvre avec le message prêt : appuyez sur « Envoyer » dans la discussion, puis revenez ici pour le suivant.</span>
        </div>
      </div>
    </div>
  )
}
