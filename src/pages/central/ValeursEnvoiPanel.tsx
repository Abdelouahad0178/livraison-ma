// 📦 Onglet « Envoi des valeurs » : valeurs POINTÉES (espèces, chèques, traites), par agence qui a pointé et par
// agence qui doit les recevoir, avec bordereau imprimable à joindre au colis d'envoi. Lecture seule.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Printer, Package, MapPin } from 'lucide-react'
import { db } from '../../firebase/config'
import { codMoneyOnly } from '../../utils/moneyFlow'
import DateInput from '../../components/DateInput'
import { openPrint } from './ControlReports'
import { subscribeValeursLots, createValeursLot, cancelValeursLot, freezeRow, lotRowsMatching, LOT_STATUS_LABEL, type ValeursLot } from '../../firebase/valeursLots'
import { LotFilterBar, applyLotFilters, lotFilterSince, EMPTY_LOT_FILTERS, type LotFilterState } from './LotFilters'
import { LotDetails, LotToggle } from './LotDetails'
import { VALUE_TYPES, bordereauHtml, fmtD, fmtDT, physicalDocs, sumRows, toValueRow, type ValueRow, type ValueType } from './valeursEnvoi'

const money = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
function rangeOf(preset: Preset, from: string, to: string): { start: Date | null; end: Date | null; text: string } {
  const now = new Date()
  const day0 = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const day1 = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
  if (preset === 'today') return { start: day0(now), end: null, text: `pointées le ${now.toLocaleDateString('fr-FR')}` }
  if (preset === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: day0(y), end: day1(y), text: `pointées le ${y.toLocaleDateString('fr-FR')}` } }
  if (preset === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: day0(s), end: null, text: `pointées du ${s.toLocaleDateString('fr-FR')} au ${now.toLocaleDateString('fr-FR')}` } }
  if (preset === 'month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { start: s, end: null, text: `pointées depuis le ${s.toLocaleDateString('fr-FR')}` } }
  const s = from ? new Date(from + 'T00:00:00') : null
  const e = to ? new Date(to + 'T23:59:59') : null
  return { start: s, end: e, text: `pointées${s ? ` du ${s.toLocaleDateString('fr-FR')}` : ''}${e ? ` au ${e.toLocaleDateString('fr-FR')}` : ''}` }
}

export function ValeursEnvoiPanel({ myCity, myUid, myName, staffCities, docOnly, ownOnly = false }: {
  myCity: string
  myUid: string
  myName: string
  staffCities: Map<string, string>
  /** Analyseur chèques : chèques et traites seulement */
  docOnly: boolean
  /** 👤 (24/10/2026) Chaque encaisseur gère SES envois : seulement les valeurs qu'il a pointées et SES lots
   *  (plusieurs encaisseurs dans la même ville, ex. Agadir). false = vue complète (admin). */
  ownOnly?: boolean
}) {
  const [preset, setPreset] = useState<Preset>('today')
  const [from, setFrom] = useState(ymd(new Date()))
  const [to, setTo] = useState(ymd(new Date()))
  const [pointCity, setPointCity] = useState<string>(myCity || 'all')
  const [mineOnly, setMineOnly] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | ValueType>('all')
  const [raw, setRaw] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Expéditions décochées (exclues du bordereau)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  useEffect(() => { if (myCity) setPointCity(myCity) }, [myCity])

  const range = useMemo(() => rangeOf(preset, from, to), [preset, from, to])
  useEffect(() => {
    if (!range.start && !range.end) { setRaw([]); setLoading(false); return }
    setLoading(true)
    const cons: any[] = [where('controlled', '==', true)]
    if (range.start) cons.push(where('controlledAt', '>=', range.start.toISOString()))
    if (range.end) cons.push(where('controlledAt', '<=', range.end.toISOString()))
    return onSnapshot(query(collection(db, 'parcels'), ...cons, orderBy('controlledAt', 'desc')),
      snap => { setRaw(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      err => { console.error('Envoi des valeurs :', err); setLoading(false) })
  }, [range.start?.getTime(), range.end?.getTime()])

  // 📦 Lots déjà créés (7 jours avant la période : un lot est toujours créé APRÈS le pointage)
  const [lots, setLots] = useState<ValeursLot[]>([])
  const [busy, setBusy] = useState(false)
  const [lotFilters, setLotFilters] = useState<LotFilterState>(EMPTY_LOT_FILTERS)
  // Lots dépliés (détail des expéditions)
  const [openLots, setOpenLots] = useState<Set<string>>(new Set())
  const toggleLot = (id: string) => setOpenLots(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Chargement : 7 j avant la période de pointage, et au moins depuis la date « du » du filtre des lots
  const lotsSince = Math.min(
    (range.start || new Date(Date.now() - 60 * 864e5)).getTime() - 7 * 864e5,
    lotFilterSince(lotFilters)?.getTime() ?? Infinity)
  useEffect(() => subscribeValeursLots(new Date(lotsSince), setLots, err => console.error('Lots de valeurs :', err)), [lotsSince])
  const lotOf = useMemo(() => {
    const m = new Map<string, ValeursLot>()
    lots.forEach(l => { if (l.status !== 'annule') l.parcelIds.forEach(id => m.set(id, l)) })
    return m
  }, [lots])

  // Expéditions déjà dans un lot : jamais proposées à nouveau
  // (valeurs non encaissées — expédition pas encore livrée — jamais proposées : rien à envoyer)
  const allRows = useMemo(() => codMoneyOnly(raw).filter(p => p.status === 'Livré' || (p.codStatus && p.codStatus !== 'pending')).map(p => toValueRow(p, staffCities, docOnly)).filter(Boolean).filter(r => !lotOf.has(r!.id)) as ValueRow[], [raw, staffCities, docOnly, lotOf])
  const pointCities = useMemo(() => [...new Set(allRows.map(r => r.pointCity))].sort(), [allRows])
  const rows = useMemo(() => allRows.filter(r =>
    (pointCity === 'all' || r.pointCity === pointCity)
    && (!(mineOnly || ownOnly) || r.p.controlledById === myUid)
    && (typeFilter === 'all' || r.amounts[typeFilter] > 0)), [allRows, pointCity, mineOnly, ownOnly, myUid, typeFilter])

  // Regroupement par agence qui doit RECEVOIR la valeur
  const groups = useMemo(() => {
    const m = new Map<string, ValueRow[]>()
    rows.forEach(r => { const l = m.get(r.toCity) || []; l.push(r); m.set(r.toCity, l) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])
  const totalAll = sumRows(rows)

  const toggle = (id: string) => setExcluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setGroup = (list: ValueRow[], include: boolean) => setExcluded(prev => { const n = new Set(prev); list.forEach(r => include ? n.delete(r.id) : n.add(r.id)); return n })

  const fromCityOf = () => (pointCity === 'all' ? (myCity || 'Toutes les agences') : pointCity)
  const visibleLots = useMemo(() => lots.filter(l => (pointCity === 'all' || l.fromCity === pointCity) && (!ownOnly || l.createdById === myUid)), [lots, pointCity, ownOnly, myUid])
  const shownLots = useMemo(() => applyLotFilters(visibleLots, lotFilters, l => l.toCity), [visibleLots, lotFilters])

  // ✅ Crée le lot (enregistré : ces expéditions ne seront plus jamais proposées) puis imprime son bordereau
  const createLot = async (toCity: string, list: ValueRow[]) => {
    const chosen = list.filter(r => !excluded.has(r.id))
    if (!chosen.length) { alert('Cochez au moins une expédition.'); return }
    const fromCity = fromCityOf()
    const today = ymd(new Date())
    // N° de lot avec les INITIALES de l'encaisseur : deux encaisseurs de la même ville ne peuvent pas créer le même numéro
    const initials = (myName || 'EC').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || 'EC'
    const nDay = lots.filter(l => l.fromCity === fromCity && l.toCity === toCity && l.createdById === myUid && ymd(new Date(l.createdAt)) === today).length + 1
    const number = `BV-${today.replace(/-/g, '')}-${fromCity.slice(0, 3).toUpperCase()}${toCity.slice(0, 3).toUpperCase()}-${initials}${nDay}`
    const t = sumRows(chosen)
    const d = physicalDocs(chosen)
    if (!window.confirm(`Créer le lot ${number} : ${chosen.length} expédition(s), ${money(t.total)} DH, vers ${toCity} ?\n\nCes valeurs ne seront plus proposées dans un autre lot.`)) return
    setBusy(true)
    try {
      const lot = await createValeursLot({
        number, fromCity, toCity, periodText: range.text,
        parcelIds: chosen.map(r => r.id), nics: chosen.map(r => r.nic), rows: chosen.map(freezeRow),
        totals: t, cheques: d.cheques, traites: d.traites,
        createdBy: myName || 'Encaisseur central', createdById: myUid,
      })
      setExcluded(prev => { const n = new Set(prev); chosen.forEach(r => n.delete(r.id)); return n })
      printLot(lot)
    } catch (e: any) {
      alert(`❌ ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }
  const printLot = (lot: ValeursLot) => openPrint(bordereauHtml({
    rows: lot.rows as any, fromCity: lot.fromCity, toCity: lot.toCity, periodText: lot.periodText, preparedBy: lot.createdBy, number: lot.number,
  }))
  const cancelLot = async (lot: ValeursLot) => {
    if (!window.confirm(`Annuler le lot ${lot.number} ?\n\nSes ${lot.parcelIds.length} expédition(s) redeviendront disponibles pour un autre lot. À faire seulement si le colis n'est PAS parti.`)) return
    setBusy(true)
    try { await cancelValeursLot(lot, myName, myUid) } catch (e: any) { alert(`❌ ${e?.message || e}`) } finally { setBusy(false) }
  }

  const sel = 'px-3 py-2.5 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/70 text-sm font-semibold text-purple-700 cursor-pointer'
  return (
    <div className="space-y-4">
      <section className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white"><Package className="w-4 h-4" /></div>
          <div>
            <h2 className="text-base font-black text-purple-800">Envoi des valeurs pointées</h2>
            <p className="text-xs text-slate-500">Choisissez l'agence qui a pointé (votre agence par défaut) et la date de pointage : les valeurs sont regroupées par agence qui doit les recevoir. Imprimez le bordereau, mettez-y les chèques / traites / espèces et envoyez le colis.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <select value={pointCity} onChange={e => setPointCity(e.target.value)} className={sel} title="Ville qui a pointé les valeurs">
            <option value="all">📌 Pointées par : toutes les agences</option>
            {[...new Set([myCity, ...pointCities].filter(Boolean))].map(c => <option key={c} value={c}>📌 Pointées à {c}{c === myCity ? ' (mon agence)' : ''}</option>)}
          </select>
          <select value={preset} onChange={e => setPreset(e.target.value as Preset)} className={sel}>
            <option value="today">📅 Pointées aujourd'hui</option>
            <option value="yesterday">📅 Pointées hier</option>
            <option value="week">📆 7 derniers jours</option>
            <option value="month">🌙 Ce mois</option>
            <option value="custom">🎯 Du … au …</option>
          </select>
          {preset === 'custom' ? (<>
            <DateInput value={from} onChange={e => setFrom(e.target.value)} className={sel} />
            <DateInput value={to} onChange={e => setTo(e.target.value)} className={sel} />
          </>) : <div className="hidden md:block md:col-span-2" />}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className={sel}>
            <option value="all">💳 Toutes les valeurs</option>
            {VALUE_TYPES.filter(t => !docOnly || t.key !== 'especes').map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
          </select>
          {ownOnly ? (
            <span className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border-2 border-purple-200 bg-purple-50 text-sm font-bold text-purple-800" title="Chaque encaisseur envoie seulement ce qu'il a pointé, et ne voit que ses lots">
              👤 Mes pointages · mes lots
            </span>
          ) : (
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border-2 border-pink-100 bg-white/70 text-sm font-semibold text-purple-700 cursor-pointer">
              <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="w-4 h-4 accent-purple-600" /> Pointées par moi
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-bold">{rows.length} expédition(s) · {money(totalAll.total)} DH</span>
          {VALUE_TYPES.filter(t => totalAll[t.key] > 0).map(t => <span key={t.key} className="px-3 py-1 rounded-full bg-white border border-purple-100 text-slate-700 font-semibold">{t.emoji} {t.label} {money(totalAll[t.key])} DH</span>)}
          {loading && <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">Chargement…</span>}
        </div>
      </section>

      {!loading && groups.length === 0 && (
        <div className="bg-white/60 rounded-3xl border border-pink-100/50 p-10 text-center text-slate-400 text-sm">Aucune valeur restant à envoyer pour ces filtres{visibleLots.some(l => l.status !== 'annule') ? ' (les autres sont déjà dans un lot, voir plus bas)' : ''}.</div>
      )}

      {groups.map(([toCity, list]) => {
        const chosen = list.filter(r => !excluded.has(r.id))
        const t = sumRows(chosen)
        const docs = physicalDocs(chosen)
        const allOn = chosen.length === list.length
        return (
          <section key={toCity} className="bg-white/70 rounded-3xl border border-purple-100 shadow-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 border-b border-purple-100">
              <div>
                <h3 className="font-black text-purple-900 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> À envoyer à l'agence de {toCity}</h3>
                <p className="text-xs text-slate-600">{chosen.length}/{list.length} expédition(s) cochée(s) · <b className="text-purple-800">{money(t.total)} DH</b>
                  {t.especes > 0 && <> · 💵 {money(t.especes)} DH</>}{t.cheque > 0 && <> · 📋 {docs.cheques} chèque(s) {money(t.cheque)} DH</>}{t.traite > 0 && <> · 📝 {docs.traites} traite(s) {money(t.traite)} DH</>}</p>
              </div>
              <button onClick={() => createLot(toCity, list)} disabled={busy || chosen.length === 0}
                title="Enregistre les expéditions cochées dans un nouveau lot (elles ne seront plus proposées) et imprime son bordereau"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-black shadow">
                <Printer className="w-4 h-4" /> Créer le lot ({chosen.length}) et imprimer
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 w-10"><input type="checkbox" checked={allOn} onChange={() => setGroup(list, !allOn)} className="w-4 h-4 accent-purple-600 cursor-pointer" title="Tout cocher / décocher" /></th>
                    <th className="px-3 py-2">N° EXP</th>
                    <th className="px-3 py-2">Expéditeur → Destinataire</th>
                    <th className="px-3 py-2">Pointée à / par</th>
                    <th className="px-3 py-2">Va à</th>
                    <th className="px-3 py-2">Valeur</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map(r => {
                    const on = !excluded.has(r.id)
                    return (
                      <tr key={r.id} className={on ? '' : 'opacity-50'}>
                        <td className="px-3 py-2"><input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="w-4 h-4 accent-purple-600 cursor-pointer" /></td>
                        <td className="px-3 py-2"><p className="font-mono text-xs font-bold text-blue-700">{r.nic}</p><p className="text-[11px] text-slate-500">{fmtD(r.p.createdAt)}</p></td>
                        <td className="px-3 py-2"><p className="font-semibold text-slate-800 truncate max-w-48">{r.p.sender?.name || r.p.senderName || '—'}</p><p className="text-[11px] text-slate-500 truncate max-w-48">→ {r.p.receiver?.name || r.p.receiverName || '—'}</p></td>
                        <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">📌 {r.pointCity}</span><p className="text-[10px] text-slate-500 mt-0.5">{r.p.controlledBy || '—'} · {fmtDT(r.p.controlledAt)}</p></td>
                        <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[11px] font-black">📦 {r.toCity}</span></td>
                        <td className="px-3 py-2 text-xs">
                          {VALUE_TYPES.filter(v => r.amounts[v.key] > 0).map(v => <div key={v.key}>{v.emoji} {v.label}{r.amounts[v.key] !== r.total ? ` ${money(r.amounts[v.key])}` : ''}</div>)}
                          {r.docs.map((d, i) => <div key={i} className="text-[10px] text-slate-500">{d}</div>)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(r.total)} DH</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {/* 📚 Lots déjà créés : chaque expédition n'appartient qu'à UN lot */}
      {visibleLots.length > 0 && (
        <section className="bg-white/70 rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-black text-slate-800">📚 Lots déjà créés ({visibleLots.filter(l => l.status !== 'annule').length})</h3>
            <p className="text-xs text-slate-500">Leurs expéditions ne sont plus proposées ci-dessus. Réimprimez un bordereau à tout moment ; annulez un lot seulement si son colis n'est pas parti.</p>
            <div className="mt-2">
              <LotFilterBar value={lotFilters} onChange={setLotFilters} cities={[...new Set(visibleLots.map(l => l.toCity))].sort()} cityLabel="📦 Vers"
                statuses={['cree', 'recu', 'recu_partiel', 'annule']} count={shownLots.length} total={visibleLots.length} />
              <div className="mt-1 flex gap-3 text-xs font-bold text-purple-600">
                <button onClick={() => setOpenLots(new Set(shownLots.map(l => l.id)))} className="hover:underline">▼ Tout déplier</button>
                <button onClick={() => setOpenLots(new Set())} className="hover:underline">▶ Tout replier</button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Lot</th><th className="px-3 py-2">Trajet</th><th className="px-3 py-2">Contenu</th>
                  <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Créé par</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownLots.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">Aucun lot ne correspond à la recherche.</td></tr>}
                {shownLots.map(l => {
                  const cancelled = l.status === 'annule'
                  const hits = lotFilters.q ? lotRowsMatching(l, lotFilters.q) : []
                  const open = openLots.has(l.id)
                  return (
                    <Fragment key={l.id}>
                    <tr className={`${cancelled ? 'opacity-50' : ''} ${open ? 'bg-purple-50/50' : ''}`}>
                      <td className="px-3 py-2"><div className="flex items-start gap-1"><LotToggle open={open} onClick={() => toggleLot(l.id)} /><div>
                      <p className="font-mono text-xs font-black text-purple-800 cursor-pointer" onClick={() => toggleLot(l.id)}>{l.number}</p>
                        {cancelled ? <span className="text-[10px] font-black text-red-600">ANNULÉ{l.cancelledBy ? ` par ${l.cancelledBy}` : ''}</span>
                          : <span className={`text-[10px] font-black ${l.status === 'recu' ? 'text-emerald-700' : l.status === 'recu_partiel' ? 'text-red-600' : 'text-amber-700'}`}>{LOT_STATUS_LABEL[l.status]}{l.receivedBy ? ` · ${l.receivedBy} ${fmtDT(l.receivedAt)}` : ''}</span>}
                        {(l.missingIds || []).length > 0 && <p className="text-[10px] text-red-600 font-bold">Manquant : {(l.missingIds || []).map(id => l.nics[l.parcelIds.indexOf(id)] || id).join(', ')}</p>}
                      </div></div></td>
                      <td className="px-3 py-2 text-xs font-bold whitespace-nowrap">📌 {l.fromCity} → 📦 {l.toCity}</td>
                      <td className="px-3 py-2 text-xs" title={l.nics.join(', ')}>
                        {l.parcelIds.length} exp.{l.totals.especes > 0 && <> · 💵 {money(l.totals.especes)}</>}{l.cheques > 0 && <> · 📋 {l.cheques} chèque(s)</>}{l.traites > 0 && <> · 📝 {l.traites} traite(s)</>}
                        <p className="text-[10px] text-slate-400 truncate max-w-72">{l.nics.join(', ')}</p>
                        {hits.length > 0 && <p className="text-[10px] font-black text-amber-700">🔎 {hits.map(r => `${r.nic} (${r.p?.sender?.name || '—'})`).join(', ')}</p>}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(l.totals.total)} DH</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{l.createdBy}<p className="text-[10px] text-slate-400">{fmtDT(l.createdAt)}</p></td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button onClick={() => printLot(l)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-black" title="Réimprimer le bordereau">
                          <Printer className="w-3.5 h-3.5" /> Réimprimer
                        </button>
                        {l.status === 'cree' && l.createdById === myUid && (
                          <button onClick={() => cancelLot(l)} disabled={busy} className="ml-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-black disabled:opacity-50" title="Annuler ce lot (colis non parti)">
                            Annuler
                          </button>
                        )}
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
    </div>
  )
}
