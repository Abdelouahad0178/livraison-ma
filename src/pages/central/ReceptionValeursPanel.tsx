// 📥 Onglet « Réception des valeurs » : lots de valeurs envoyés VERS ma ville (onglet « Envoi des valeurs » de l'autre
// ville) → je coche ce qui est réellement dans le colis et je confirme la réception. L'arrivée des valeurs reçues est
// confirmée sur chaque expédition (deliveryControlled, comme « Confirmer arrivée »).
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Inbox, Printer, CheckCircle2, FileSignature } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { subscribeValeursLots, receiveValeursLot, lotRowsMatching, LOT_STATUS_LABEL, type ValeursLot } from '../../firebase/valeursLots'
import { LotFilterBar, applyLotFilters, lotFilterSince, EMPTY_LOT_FILTERS, type LotFilterState } from './LotFilters'
import { LotDetails, LotToggle } from './LotDetails'
import { markParcelsDeliveryControlled } from '../../firebase/central'
import { openPrint } from './ControlReports'
import { bordereauHtml, clientReceiptHtml, groupBySender, sumRows, fmtD, fmtDT, VALUE_TYPES, type ValueRow } from './valeursEnvoi'

const money = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ReceptionValeursPanel({ myCity, myUid, myName }: { myCity: string; myUid: string; myName: string }) {
  const [days, setDays] = useState(30)
  const [lots, setLots] = useState<ValeursLot[]>([])
  const [loading, setLoading] = useState(true)
  const [cityFilter, setCityFilter] = useState<string>(myCity || 'all')
  useEffect(() => { if (myCity) setCityFilter(myCity) }, [myCity])
  const [f, setF] = useState<LotFilterState>(EMPTY_LOT_FILTERS)
  // Lots dépliés (lots reçus : détail des expéditions ; lots à recevoir : repliés sur demande)
  const [openLots, setOpenLots] = useState<Set<string>>(new Set())
  const [closedWaiting, setClosedWaiting] = useState<Set<string>>(new Set())
  const toggle = (set: (fn: (p: Set<string>) => Set<string>) => void, id: string) => set(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Chargement : la période choisie, et au moins depuis la date « du » du filtre
  const since = Math.min(Date.now() - days * 864e5, lotFilterSince(f)?.getTime() ?? Infinity)
  useEffect(() => {
    setLoading(true)
    return subscribeValeursLots(new Date(since), l => { setLots(l); setLoading(false) }, err => { console.error('Réception des valeurs :', err); setLoading(false) })
  }, [Math.floor(since / 864e5)])

  // Lots destinés à la ville choisie (compte avec ville : la sienne)
  const forCity = useMemo(() => lots.filter(l => l.status !== 'annule' && (cityFilter === 'all' || l.toCity === cityFilter)), [lots, cityFilter])
  const mine = useMemo(() => applyLotFilters(forCity, f, l => l.fromCity), [forCity, f])
  const waiting = mine.filter(l => l.status === 'cree')
  const done = mine.filter(l => l.status !== 'cree')
  const hitIds = (l: ValeursLot) => new Set(f.q ? lotRowsMatching(l, f.q).map(r => r.id) : [])
  const toCities = useMemo(() => [...new Set(lots.map(l => l.toCity))].sort(), [lots])
  const canReceive = (l: ValeursLot) => !myCity || l.toCity === myCity

  const [receiptLot, setReceiptLot] = useState<ValeursLot | null>(null)
  const printLot = (l: ValeursLot) => openPrint(bordereauHtml({ rows: l.rows as any, fromCity: l.fromCity, toCity: l.toCity, periodText: l.periodText, preparedBy: l.createdBy, number: l.number }))

  return (
    <div className="space-y-4">
      <section className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white"><Inbox className="w-4 h-4" /></div>
          <div>
            <h2 className="text-base font-black text-emerald-800">Réception des valeurs</h2>
            <p className="text-xs text-slate-500">
              <b>Circuit :</b> la ville de destination pointe les valeurs encaissées → crée un lot et l'envoie (onglet « Envoi des valeurs ») →
              la ville de l'expéditeur reçoit le colis ici, coche les valeurs présentes et confirme la réception.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="px-3 py-2 rounded-2xl border-2 border-pink-100 bg-white/70 text-sm font-semibold text-purple-700">
            <option value="all">📦 Envoyés vers : toutes les villes</option>
            {[...new Set([myCity, ...toCities].filter(Boolean))].map(c => <option key={c} value={c}>📦 Envoyés vers {c}{c === myCity ? ' (mon agence)' : ''}</option>)}
          </select>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 rounded-2xl border-2 border-pink-100 bg-white/70 text-sm font-semibold text-purple-700">
            <option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={90}>90 derniers jours</option>
          </select>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">{waiting.length} lot(s) à recevoir</span>
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">{done.length} reçu(s)</span>
          {loading && <span className="text-xs text-amber-700">Chargement…</span>}
        </div>
        <LotFilterBar value={f} onChange={setF} cities={[...new Set(forCity.map(l => l.fromCity))].sort()} cityLabel="📌 De"
          statuses={['cree', 'recu', 'recu_partiel']} count={mine.length} total={forCity.length} />
      </section>

      {!loading && waiting.length === 0 && (
        <div className="bg-white/60 rounded-3xl border border-pink-100/50 p-8 text-center text-slate-400 text-sm">Aucun lot en attente de réception{f.q || f.status !== 'all' || f.city !== 'all' || f.type !== 'all' ? ' pour ces filtres' : ''}.</div>
      )}
      {waiting.length > 1 && (
        <div className="flex gap-3 text-xs font-bold text-amber-700 px-1">
          <button onClick={() => setClosedWaiting(new Set())} className="hover:underline">▼ Déplier tous les lots à recevoir</button>
          <button onClick={() => setClosedWaiting(new Set(waiting.map(l => l.id)))} className="hover:underline">▶ Tout replier</button>
        </div>
      )}
      {waiting.map(l => <LotToReceive key={l.id} lot={l} canReceive={canReceive(l)} myUid={myUid} myName={myName} onPrint={() => printLot(l)} highlight={hitIds(l)}
        open={!closedWaiting.has(l.id)} onToggle={() => toggle(setClosedWaiting, l.id)} />)}

      {done.length > 0 && (
        <section className="bg-white/70 rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-slate-800">📚 Lots déjà réceptionnés ({done.length})</h3>
            <div className="flex gap-3 text-xs font-bold text-purple-600">
              <button onClick={() => setOpenLots(new Set(done.map(l => l.id)))} className="hover:underline">▼ Tout déplier</button>
              <button onClick={() => setOpenLots(new Set())} className="hover:underline">▶ Tout replier</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Lot</th><th className="px-3 py-2">Trajet</th><th className="px-3 py-2">Contenu</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Réception</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {done.map(l => {
                  const missing = (l.missingIds || []).map(id => l.nics[l.parcelIds.indexOf(id)] || id)
                  const hits = f.q ? lotRowsMatching(l, f.q) : []
                  const open = openLots.has(l.id)
                  return (
                    <Fragment key={l.id}>
                    <tr className={open ? 'bg-purple-50/50' : ''}>
                      <td className="px-3 py-2"><div className="flex items-center gap-1"><LotToggle open={open} onClick={() => toggle(setOpenLots, l.id)} />
                        <span className="font-mono text-xs font-black text-purple-800 cursor-pointer" onClick={() => toggle(setOpenLots, l.id)}>{l.number}</span></div>
                        <p className="text-[10px] text-slate-400 ml-7">envoyé {fmtDT(l.createdAt)}</p></td>
                      <td className="px-3 py-2 text-xs font-bold whitespace-nowrap">📌 {l.fromCity} → 📦 {l.toCity}</td>
                      <td className="px-3 py-2 text-xs">{l.parcelIds.length} exp.{l.cheques > 0 && <> · 📋 {l.cheques}</>}{l.traites > 0 && <> · 📝 {l.traites}</>}{l.totals.especes > 0 && <> · 💵 {money(l.totals.especes)}</>}
                        {hits.length > 0 && <p className="text-[10px] font-black text-amber-700">🔎 {hits.map(r => `${r.nic} (${r.p?.sender?.name || '—'})${(l.missingIds || []).includes(r.id) ? ' — MANQUANT' : ''}`).join(', ')}</p>}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(l.totals.total)} DH</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`font-black ${l.status === 'recu' ? 'text-emerald-700' : 'text-amber-700'}`}>{LOT_STATUS_LABEL[l.status]}</span>
                        <p className="text-[10px] text-slate-500">{l.receivedBy} · {fmtDT(l.receivedAt)}</p>
                        {missing.length > 0 && <p className="text-[10px] text-red-600 font-bold">Manquant : {missing.join(', ')}</p>}
                        {l.receiveNote && <p className="text-[10px] text-slate-500 italic">« {l.receiveNote} »</p>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setReceiptLot(l)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black" title="Accusé de réception à faire signer par le client à la remise de ses valeurs">
                          <FileSignature className="w-3.5 h-3.5" /> Accusés clients
                        </button>
                        <button onClick={() => printLot(l)} className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-black"><Printer className="w-3.5 h-3.5" /> Bordereau</button>
                      </td>
                    </tr>
                    {open && <tr><td colSpan={6} className="p-0"><LotDetails lot={l} highlight={new Set(hits.map(r => r.id))} /></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {receiptLot && <ClientReceiptsModal lot={receiptLot} myName={myName} onClose={() => setReceiptLot(null)} />}
    </div>
  )
}

/** 🧾 Accusés de réception des clients d'un lot reçu : une feuille par client expéditeur (valeurs reçues seulement). */
function ClientReceiptsModal({ lot, myName, onClose }: { lot: ValeursLot; myName: string; onClose: () => void }) {
  const received = (lot.rows || []).filter(r => !(lot.missingIds || []).includes(r.id))
  const clients = groupBySender(received as any[]) as [string, ValueRow[]][]
  const print = (list: [string, ValueRow[]][]) => openPrint(clientReceiptHtml({ clients: list, city: lot.toCity, by: myName || 'Encaisseur central', lotNumber: lot.number }))
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-emerald-50 rounded-t-2xl">
          <div>
            <h3 className="font-black text-emerald-900">🧾 Accusés de réception — clients</h3>
            <p className="text-xs text-slate-600">Lot {lot.number} · {clients.length} client(s) · à faire signer à la remise des valeurs (2 exemplaires par page)</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => print(clients)} disabled={!clients.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-black"><Printer className="w-4 h-4" /> Tout imprimer</button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          </div>
        </div>
        <div className="overflow-auto divide-y divide-slate-100">
          {clients.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Aucune valeur reçue dans ce lot.</p>}
          {clients.map(([name, rows]) => {
            const t = sumRows(rows)
            return (
              <div key={name} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{name}</p>
                  <p className="text-xs text-slate-500">{rows.length} exp. ({rows.map(r => r.nic).join(', ')}) · <b className="text-emerald-700">{money(t.total)} DH</b>
                    {t.especes > 0 && <> · 💵 {money(t.especes)}</>}{t.cheque > 0 && <> · 📋 {money(t.cheque)}</>}{t.traite > 0 && <> · 📝 {money(t.traite)}</>}</p>
                </div>
                <button onClick={() => print([[name, rows]])} className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-xs font-black hover:bg-emerald-50"><Printer className="w-3.5 h-3.5" /> Imprimer</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LotToReceive({ lot, canReceive, myUid, myName, onPrint, highlight, open, onToggle }: { lot: ValeursLot; canReceive: boolean; myUid: string; myName: string; onPrint: () => void; highlight: Set<string>; open: boolean; onToggle: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(lot.parcelIds))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = lot.rows || []
  const recTotal = rows.filter(r => checked.has(r.id)).reduce((s, r) => s + (r.total || 0), 0)
  const toggle = (id: string) => setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const confirm = async () => {
    const missing = lot.parcelIds.length - checked.size
    if (!window.confirm(`Confirmer la réception du lot ${lot.number} ?\n\n${checked.size} valeur(s) reçue(s) — ${money(recTotal)} DH${missing ? `\n⚠️ ${missing} valeur(s) MANQUANTE(S) : le lot sera marqué « reçu partiellement ».` : ''}`)) return
    setBusy(true)
    try {
      const res = await receiveValeursLot(lot, [...checked], note.trim(), myName || 'Encaisseur central', myUid)
      // Arrivée confirmée sur chaque expédition reçue (sauf celles déjà confirmées par quelqu'un)
      const states = await Promise.all(res.received.map(id => getDoc(doc(db, 'parcels', id)).then(s => ({ id, done: !!(s.data() as any)?.deliveryControlled })).catch(() => ({ id, done: false }))))
      const toMark = states.filter(s => !s.done).map(s => s.id)
      try { await markParcelsDeliveryControlled(toMark, myName || 'Agence destinataire', myUid) } catch (e: any) {
        alert(`Lot réceptionné, mais la confirmation d'arrivée de certaines expéditions a échoué (${e?.message || e}). Confirmez-les depuis « Contrôle & Pointage ».`)
      }
    } catch (e: any) {
      alert(`❌ ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white/70 rounded-3xl border-2 border-amber-200 shadow-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
        <div className="flex items-start gap-1">
          <LotToggle open={open} onClick={onToggle} />
          <div>
          <h3 className="font-black text-amber-900 cursor-pointer" onClick={onToggle}>📤 Lot <span className="font-mono">{lot.number}</span> — de {lot.fromCity} vers {lot.toCity}</h3>
          <p className="text-xs text-slate-600">Envoyé par {lot.createdBy} le {fmtDT(lot.createdAt)} · {lot.parcelIds.length} expédition(s) · <b>{money(lot.totals.total)} DH</b>
            {lot.totals.especes > 0 && <> · 💵 {money(lot.totals.especes)} DH</>}{lot.cheques > 0 && <> · 📋 {lot.cheques} chèque(s)</>}{lot.traites > 0 && <> · 📝 {lot.traites} traite(s)</>}</p>
          </div>
        </div>
        <button onClick={onPrint} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-purple-200 text-purple-700 text-xs font-black hover:bg-purple-50"><Printer className="w-3.5 h-3.5" /> Bordereau</button>
      </div>
      {open && <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 w-16">Reçu</th><th className="px-3 py-2">N° EXP</th><th className="px-3 py-2">Expéditeur → Destinataire</th><th className="px-3 py-2">Valeur</th><th className="px-3 py-2 text-right">Montant</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => {
              const on = checked.has(r.id)
              return (
                <tr key={r.id} className={!on ? 'bg-red-50' : highlight.has(r.id) ? 'bg-amber-100' : ''}>
                  <td className="px-3 py-2"><input type="checkbox" disabled={!canReceive} checked={on} onChange={() => toggle(r.id)} className="w-4 h-4 accent-emerald-600 cursor-pointer" /></td>
                  <td className="px-3 py-2"><p className="font-mono text-xs font-bold text-blue-700">{r.nic}</p><p className="text-[11px] text-slate-500">{fmtD(r.p?.createdAt)}</p></td>
                  <td className="px-3 py-2"><p className="font-semibold text-slate-800 truncate max-w-48">{r.p?.sender?.name || '—'}</p><p className="text-[11px] text-slate-500 truncate max-w-48">→ {r.p?.receiver?.name || '—'}</p></td>
                  <td className="px-3 py-2 text-xs">
                    {VALUE_TYPES.filter(v => (r.amounts as any)[v.key] > 0).map(v => <div key={v.key}>{v.emoji} {v.label}</div>)}
                    {(r.docs || []).map((d, i) => <div key={i} className="text-[10px] text-slate-500">{d}</div>)}
                  </td>
                  <td className="px-3 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(r.total)} DH{!on && <div className="text-[10px] text-red-600 font-black">MANQUANT</div>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {canReceive ? (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-amber-100 bg-amber-50/40">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Remarque (facultatif)" className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-amber-200 text-sm" />
          <span className="text-xs text-slate-600">{checked.size}/{lot.parcelIds.length} reçue(s) · <b>{money(recTotal)} DH</b></span>
          <button onClick={confirm} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-black shadow">
            <CheckCircle2 className="w-4 h-4" /> Confirmer la réception
          </button>
        </div>
      ) : (
        <p className="px-5 py-2 text-xs text-slate-500 border-t border-slate-100">Réception à confirmer par l'agence de {lot.toCity}.</p>
      )}
      </>}
    </section>
  )
}
