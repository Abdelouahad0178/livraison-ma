// 📂 Détail déplié d'un lot de valeurs : ses expéditions (copie figée à la création du lot).
import { ChevronRight } from 'lucide-react'
import type { LotRow, ValeursLot } from '../../firebase/valeursLots'
import { VALUE_TYPES, fmtD, fmtDT } from './valeursEnvoi'

const money = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Bouton ▶ / ▼ pour déplier un lot. */
export function LotToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={open ? 'Replier le lot' : 'Déplier le lot (voir ses expéditions)'}
      className="p-1 rounded-lg hover:bg-purple-100 text-purple-700">
      <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}

/** ➕ / ➖ Expéditions ajoutées ou retirées après la création du lot (visible par la ville qui envoie ET celle qui reçoit). */
export function LotChangesNote({ lot }: { lot: ValeursLot }) {
  const added = lot.added || []
  const removed = lot.removed || []
  if (!added.length && !removed.length) return null
  return (
    <div className="mt-1 space-y-1">
      {added.length > 0 && (
        <div className="px-2 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-[10px] text-sky-900">
          <b>➕ Ajoutée(s) après la création du lot :</b>
          {added.map((a, i) => (
            <div key={`a-${i}`}><span className="font-mono font-bold">{a.nics.join(', ')}</span> · {money(a.total)} DH · par {a.by} le {fmtDT(a.at)}</div>
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="px-2 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-[10px] text-orange-900">
          <b>➖ Retirée(s) du lot ({removed.length}) :</b>
          {removed.map((r, i) => (
            <div key={`${r.id}-${i}`}>
              <span className="font-mono font-bold">{r.nic}</span> · {money(r.total)} DH · par {r.by} le {fmtDT(r.at)}
              {r.lotStatus !== 'cree' && <span className="font-bold"> (après réception)</span>}
              {r.reason && <span className="italic"> — « {r.reason} »</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Date d'ajout d'une expédition ajoutée après la création du lot (sinon null). */
const addedAtOf = (lot: ValeursLot, id: string) => (lot.added || []).find(a => a.ids.includes(id))?.at || null

export function LotDetails({ lot, highlight, onRemove, busy }: {
  lot: ValeursLot; highlight?: Set<string>
  /** Bouton « Retirer » sur chaque ligne (auteur du lot, onglet « Envoi des valeurs ») */
  onRemove?: (row: LotRow) => void; busy?: boolean
}) {
  const missing = new Set(lot.missingIds || [])
  return (
    <div className="bg-slate-50/80 border-t border-purple-100 px-3 py-2">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-2 py-1">#</th><th className="px-2 py-1">N° EXP</th><th className="px-2 py-1">Expéditeur → Destinataire</th>
          <th className="px-2 py-1">Pointée</th><th className="px-2 py-1">Valeur</th><th className="px-2 py-1 text-right">Montant</th>
          {onRemove && <th className="px-2 py-1"></th>}
        </tr></thead>
        <tbody className="divide-y divide-slate-200/70">
          {(lot.rows || []).map((r, i) => (
            <tr key={r.id} className={missing.has(r.id) ? 'bg-red-50' : highlight?.has(r.id) ? 'bg-amber-100' : ''}>
              <td className="px-2 py-1 text-slate-400">{i + 1}</td>
              <td className="px-2 py-1"><span className="font-mono font-bold text-blue-700">{r.nic}</span><div className="text-[10px] text-slate-500">{fmtD(r.p?.createdAt)}</div>
                {addedAtOf(lot, r.id) && <div className="text-[10px] font-bold text-sky-700">➕ ajoutée le {fmtDT(addedAtOf(lot, r.id))}</div>}</td>
              <td className="px-2 py-1"><div className="font-semibold text-slate-800 truncate max-w-56">{r.p?.sender?.name || '—'}</div><div className="text-[10px] text-slate-500 truncate max-w-56">→ {r.p?.receiver?.name || '—'}</div></td>
              <td className="px-2 py-1 text-[10px] text-slate-500">📌 {r.pointCity}<div>{r.p?.controlledBy || ''} {fmtDT(r.p?.controlledAt)}</div></td>
              <td className="px-2 py-1">
                {VALUE_TYPES.filter(v => (r.amounts as any)[v.key] > 0).map(v => <div key={v.key}>{v.emoji} {v.label}{(r.amounts as any)[v.key] !== r.total ? ` ${money((r.amounts as any)[v.key])}` : ''}</div>)}
                {(r.docs || []).map((d, k) => <div key={k} className="text-[10px] text-slate-500">{d}</div>)}
              </td>
              <td className="px-2 py-1 text-right font-black text-emerald-700 whitespace-nowrap">{money(r.total)} DH{missing.has(r.id) && <div className="text-[10px] text-red-600">MANQUANT</div>}</td>
              {onRemove && (
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => onRemove(r)} disabled={busy} title="Retirer cette expédition du lot (elle redevient disponible pour un autre lot)"
                    className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-[10px] font-black disabled:opacity-50 whitespace-nowrap">
                    ➖ Retirer
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <LotChangesNote lot={lot} />
    </div>
  )
}
