// 🧾 Admin › Port par agence › Suivi de l'agence › « Reste à encaisser » : les expéditions qui composent ce montant,
// filtrables par livreur et par type de port, cochables, imprimables.
import { useMemo, useState } from 'react'
import { Printer, Search, X } from 'lucide-react'
import type { ResteLine } from '../../../utils/agencyFollowUp'
import { printResteAEncaisser } from '../../../utils/printAgencyFollowUp'

const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
const fmtD = (v: any) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '' }
const KIND: Record<string, string> = { port_du: '💰 Port dû', port_du_cheque: '📋 Port dû chèque', port_paye: '📬 Port payé', autre: 'Autre' }
const FOCUS_TITLE = { reste: 'Reste à encaisser', attendu: 'Attendu (vue théorique)', encaisse: 'Encaissé (situation caisse)' }
const nicOf = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || ''
/** Livreur concerné : livreur de livraison (port dû), sinon celui qui a ramassé (port payé). */
/** Livreur = UNIQUEMENT le livreur assigné à l'expédition (jamais la personne qui a encaissé). */
const driverOf = (l: ResteLine) => l.p.deliveryDriverName || 'Sans livreur (retrait agence)'
/** Qui a encaissé (port ou valeur), affiché à part. */
const collectorOf = (l: ResteLine) => l.p.portCollectedBy || l.p.codCollectedBy || ''

export default function ResteAEncaisserModal({ city, periodText, lines, total, onClose, kindLabels = KIND, subject = 'Ports', focus = 'reste' }: {
  city: string; periodText: string; lines: ResteLine[]; total: number; onClose: () => void
  /** Libellés des types (ports par défaut ; COD : espèces / chèque / traite / mixte) */
  kindLabels?: Record<string, string>
  /** « Ports » ou « COD » (titres) */
  subject?: string
  /** Montant mis en avant et totalisé : reste à encaisser (défaut), attendu (vue théorique) ou encaissé (caisse) */
  focus?: 'reste' | 'attendu' | 'encaisse'
}) {
  const [driver, setDriver] = useState('all')
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const drivers = useMemo(() => {
    const m = new Map<string, { n: number; m: number }>()
    lines.forEach(l => { const k = driverOf(l); const c = m.get(k) || { n: 0, m: 0 }; c.n++; c.m += l[focus]; m.set(k, c) })
    return [...m.entries()].sort((a, b) => b[1].m - a[1].m)
  }, [lines])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return lines.filter(l => (driver === 'all' || driverOf(l) === driver) && (kind === 'all' || l.kind === kind)
      && (!n || [nicOf(l.p), l.p.sender?.name, l.p.receiver?.name].some(v => String(v || '').toLowerCase().includes(n))))
  }, [lines, driver, kind, q])
  const chosen = shown.filter(l => !excluded.has(l.p.id))
  const chosenTotal = chosen.reduce((s, l) => s + l[focus], 0)
  const allOn = shown.length > 0 && chosen.length === shown.length
  const toggle = (id: string) => setExcluded(prev => { const x = new Set(prev); x.has(id) ? x.delete(id) : x.add(id); return x })
  const setAll = (on: boolean) => setExcluded(prev => { const x = new Set(prev); shown.forEach(l => on ? x.delete(l.p.id) : x.add(l.p.id)); return x })

  const print = () => {
    if (!chosen.length) { alert('Cochez au moins une expédition.'); return }
    const what = [driver !== 'all' ? `livreur : ${driver}` : '', kind !== 'all' ? (kindLabels[kind] || kind).replace(/^\S+ /, '') : ''].filter(Boolean).join(' · ')
    printResteAEncaisser({ city, periodText: `${periodText}${what ? ` — ${what}` : ''}`, lines: chosen, kindLabels, subject, focus })
  }

  const sel = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b bg-amber-50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-900">{FOCUS_TITLE[focus]} ({subject}) — {city}</h3>
            <p className="text-xs text-slate-600">{periodText} · {lines.length} expédition(s) · <b className="text-amber-700">{dh(total)}</b></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={print} disabled={!chosen.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold">
              <Printer className="w-4 h-4" /> Imprimer ({chosen.length})
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* 🚚 Par livreur */}
        <div className="px-5 py-3 border-b flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">🚚 Livreur :</span>
          <button onClick={() => setDriver('all')} className={`text-xs rounded-full px-2.5 py-1 border ${driver === 'all' ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50'}`}>
            Tous : <b>{lines.length}</b> · {dh(total)}
          </button>
          {drivers.map(([name, v]) => (
            <button key={name} onClick={() => setDriver(driver === name ? 'all' : name)}
              className={`text-xs rounded-full px-2.5 py-1 border ${driver === name ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50'}`}>
              {name} : <b>{v.n}</b> · {dh(v.m)}
            </button>
          ))}
        </div>
        <div className="px-5 py-2 border-b flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="N° EXP, expéditeur, destinataire…" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <select value={kind} onChange={e => setKind(e.target.value)} className={sel}>
            <option value="all">Tous les ports</option>
            {Object.keys(kindLabels).filter(k => lines.some(l => l.kind === k)).map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}
          </select>
          <span className="text-xs text-slate-600">{chosen.length}/{shown.length} cochée(s) · <b className="text-amber-700">{dh(chosenTotal)}</b></span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={allOn} onChange={() => setAll(!allOn)} className="w-4 h-4 accent-amber-600" /></th>
                <th className="px-3 py-2 text-left">N° EXP</th><th className="px-3 py-2 text-left">Expéditeur</th><th className="px-3 py-2 text-left">Destinataire</th>
                <th className="px-3 py-2 text-left">{subject === "Ports" ? "Port" : "Valeur"}</th><th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2 text-left">Livreur</th>
                <th className="px-3 py-2 text-right">Attendu</th><th className="px-3 py-2 text-right">Encaissé</th><th className="px-3 py-2 text-right">Reste</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Aucune expédition</td></tr>}
              {shown.map((l, i) => {
                const on = !excluded.has(l.p.id)
                return (
                  <tr key={l.p.id} className={`border-t border-slate-100 ${!on ? 'opacity-40' : i % 2 ? 'bg-slate-50/60' : ''} ${l.reste < 0 ? 'italic text-slate-500' : ''}`}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={() => toggle(l.p.id)} className="w-4 h-4 accent-amber-600" /></td>
                    <td className="px-3 py-1.5"><span className="font-mono font-semibold text-blue-700">{nicOf(l.p)}</span><div className="text-[11px] text-slate-500">{fmtD(l.p.createdAt)}</div></td>
                    <td className="px-3 py-1.5">{l.p.sender?.name || '—'}<div className="text-[11px] text-slate-500">{l.p.originCity}</div></td>
                    <td className="px-3 py-1.5">{l.p.receiver?.name || '—'}<div className="text-[11px] text-slate-500">{l.p.destinationCity}</div></td>
                    <td className="px-3 py-1.5 text-xs">{kindLabels[l.kind] || l.kind}</td>
                    <td className="px-3 py-1.5 text-xs">{l.p.status || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{driverOf(l)}{collectorOf(l) && <div className="text-[10px] text-slate-500">encaissé par {collectorOf(l)}</div>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dh(l.attendu)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dh(l.encaisse)}</td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-amber-700">{dh(l.reste)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {lines.some(l => l.reste < 0) && <p className="px-5 py-2 text-[11px] text-slate-500 border-t">Lignes en italique : port encaissé par l'agence sans être attendu dans la période (ex. expédition d'une autre période) — elles diminuent le reste.</p>}
      </div>
    </div>
  )
}
