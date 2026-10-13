// 💰 Admin › Contre Remboursement — CONTRÔLE du COD (retour de fonds) de toutes les agences, en LECTURE SEULE.
// Aucune action qui déplace de l'argent : les actions restent sur les pages des agences, du chef d'exploitation
// et de l'encaisseur central. Règles de calcul : ../codControl.ts (mêmes fonctions que Caisse Agence,
// la Collecte du soir et l'encaisseur central).
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Banknote, Building2, Calendar, FileSpreadsheet, Filter, Loader2, Printer, RefreshCw, Search, X } from 'lucide-react'
import DateInput from '../../../components/DateInput'
import LoadProgress from '../../../components/LoadProgress'
import { CodCollectesParJour } from '../../../components/caisse/CollectesParJour'
import { CITIES } from '../../../firebase/constants'
import { loadCodControlParcels } from '../../../firebase/codControl'
import { getOperationalDayRange, getOperationalDayString } from '../../../config/operationalDay'
import { codPartsBreakdown, codPartsLabel, codTotalOf, isMixedCod } from '../../../utils/codParts'
import { fmt } from '../../../utils/formatNumber'
import { normIncludes } from '../../../utils/normText'
import { escapeHtml } from '../../../utils/htmlEscape'
import { openPrintWindow } from '../../../utils/printWindow'
import { loadExcel } from '../../../utils/loadExcel'
import { toDateSafe } from '../../../utils/agencyCaisseRules'
import {
  CIRCUIT_STEPS, COD_ANOMALIES, COD_STEP_META, COD_TYPE_FILTERS, HORS_STEPS,
  circuitByAgency, codAnomaliesOf, codCollectesOfAgency, codPeriodOf, codStepActor, codStepOf, codStepSince, codTypeMatches,
  codValueOf, createdDayKey, destCityOf, fmtKey, inAgency, keyInPeriod, originCityOf, stepCityOf,
  type CodAnomaly, type CodPreset, type CodStep, type CodTypeFilter, type StepTotals,
} from '../codControl'

type ListView =
  | { kind: 'all' }
  | { kind: 'step'; step: CodStep; city: string | null }
  | { kind: 'anomaly'; key: CodAnomaly }
  | { kind: 'collectes'; city: string | null }

const PAGE = 100
const HOUR = 3600 * 1000
const nicOf = (p: any) => p?.senderNic || p?.sender?.nic || p?.trackingId || '—'
const fmtDate = (v: any) => { const d = toDateSafe(v); return d ? d.toLocaleDateString('fr-MA') : '—' }
const fmtDateTime = (v: any) => {
  const d = toDateSafe(v)
  return d ? `${d.toLocaleDateString('fr-MA')} ${d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}` : ''
}
const cityOrder = (c: string) => { const i = CITIES.indexOf(c); return i < 0 ? 99 : i }

export default function AdminCodControlTab() {
  // ── Filtres ────────────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<CodPreset>('week') // 7 jours par défaut : « Ce mois » charge plusieurs milliers d'expéditions COD
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [city, setCity] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<CodTypeFilter>('all')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [days, setDays] = useState(3)
  const [view, setView] = useState<ListView>({ kind: 'all' })
  const [shown, setShown] = useState(PAGE)
  const listRef = useRef<HTMLDivElement>(null)

  // ── Période (journées d'opération) ────────────────────────────────────────
  const [tick, setTick] = useState(0)
  const todayKey = useMemo(() => getOperationalDayString(new Date()), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const period = useMemo(() => codPeriodOf(preset, dateFrom, dateTo, todayKey), [preset, dateFrom, dateTo, todayKey])
  const customPending = preset === 'custom' && !(dateFrom && dateTo)

  // ── Chargement (lecture seule, bornée par la période) ─────────────────────
  const [parcels, setParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const genRef = useRef(0)
  useEffect(() => {
    const gen = ++genRef.current
    // Bornes larges (± 6 h) : le filtrage exact par journée d'opération est fait ensuite
    const from = new Date(getOperationalDayRange(new Date(period.fromKey + 'T12:00:00')).start.getTime() - 6 * HOUR)
    const to = new Date(getOperationalDayRange(new Date(period.toKey + 'T12:00:00')).end.getTime() + 6 * HOUR)
    setLoading(true); setError(null); setLoadedCount(0); setParcels([])
    loadCodControlParcels(from, to, n => { if (gen === genRef.current) setLoadedCount(n) })
      .then(list => { if (gen === genRef.current) setParcels(list) })
      .catch(e => { if (gen === genRef.current) setError(e?.message || String(e)) })
      .finally(() => { if (gen === genRef.current) setLoading(false) })
  }, [period.fromKey, period.toKey, tick])

  // Nouvelle sélection → retour au début de la liste
  useEffect(() => { setShown(PAGE) }, [view, city, typeFilter, deferredSearch, period.fromKey, period.toKey])

  // ── Données filtrées ──────────────────────────────────────────────────────
  const baseFilter = useMemo(() => {
    const q = deferredSearch.trim()
    return (p: any) => codTypeMatches(p, typeFilter) && (!q || [
      nicOf(p), p.trackingId, p.sender?.name, p.sender?.tel, p.receiver?.name, p.receiver?.tel,
    ].some(v => v && normIncludes(v, q)))
  }, [typeFilter, deferredSearch])

  const codParcels = useMemo(() => parcels.filter(p => codTotalOf(p) > 0), [parcels])
  // Suivi du circuit : expéditions CRÉÉES sur la période (journée d'opération de création)
  const created = useMemo(() => codParcels.filter(p =>
    keyInPeriod(createdDayKey(p), period) && inAgency(p, city) && baseFilter(p)), [codParcels, period, city, baseFilter])
  const circuit = useMemo(() => circuitByAgency(created), [created])
  // Agence choisie : seulement les étapes dont elle est responsable (destination 1 → 5, origine 6 → 8)
  const circuitTotal: StepTotals | null = city === 'all' ? circuit.total : (circuit.byCity.get(city) || null)
  const circuitSum = useMemo(() => Object.values(circuitTotal || {}).reduce((s, v) => ({ n: s.n + v.n, m: s.m + v.m }), { n: 0, m: 0 }), [circuitTotal])

  const cities = useMemo(() => {
    const s = new Set<string>(CITIES)
    codParcels.forEach(p => { s.add(destCityOf(p)); s.add(originCityOf(p)) })
    s.delete('Agence non définie')
    return [...s].sort((a, b) => cityOrder(a) - cityOrder(b) || a.localeCompare(b))
  }, [codParcels])
  const shownCities = city === 'all' ? cities : [city]

  // 💰 COD collectés (jour de COLLECTE dans la période) — règle de Caisse Agence / Collecte du soir
  const collectes = useMemo(() => shownCities.map(c => codCollectesOfAgency(codParcels, c, period, baseFilter)),
    [codParcels, shownCities.join('|'), period, baseFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  const collectesTotal = useMemo(() => collectes.reduce((s, c) => ({
    count: s.count + c.count, montant: s.montant + c.montant, especes: s.especes + c.especes, cheque: s.cheque + c.cheque, traite: s.traite + c.traite,
  }), { count: 0, montant: 0, especes: 0, cheque: 0, traite: 0 }), [collectes])

  // 🚨 À surveiller : expéditions chargées (créées OU collectées sur la période)
  const anomalies = useMemo(() => {
    const now = Date.now()
    const map = new Map<CodAnomaly, any[]>(COD_ANOMALIES.map(a => [a.key, []]))
    for (const p of codParcels) {
      if (!inAgency(p, city) || !baseFilter(p)) continue
      for (const k of codAnomaliesOf(p, days, now)) map.get(k)!.push(p)
    }
    return map
  }, [codParcels, city, baseFilter, days])

  // ── Liste détaillée ────────────────────────────────────────────────────────
  const list = useMemo(() => {
    let rows: any[]
    if (view.kind === 'step') rows = created.filter(p => { const s = codStepOf(p); return s === view.step && (!view.city || stepCityOf(p, s) === view.city) })
    else if (view.kind === 'anomaly') rows = anomalies.get(view.key) || []
    else if (view.kind === 'collectes') rows = collectes.filter(c => !view.city || c.city === view.city).flatMap(c => c.parcels)
    else rows = created
    return [...rows].sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0))
  }, [view, created, anomalies, collectes])
  const listTotal = useMemo(() => list.reduce((s, p) => s + codValueOf(p), 0), [list])

  const listTitle = view.kind === 'step' ? `${COD_STEP_META[view.step].label}${view.city ? ` — ${view.city}` : ''}`
    : view.kind === 'anomaly' ? `À surveiller : ${COD_ANOMALIES.find(a => a.key === view.key)!.label(days)}`
    : view.kind === 'collectes' ? `COD collectés${view.city ? ` — ${view.city}` : ''} (jour de collecte dans la période)`
    : 'Toutes les expéditions à COD créées sur la période'

  const go = (v: ListView) => {
    setView(v)
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // ── Export / impression de la liste affichée ──────────────────────────────
  const rowOf = (p: any) => {
    const step = codStepOf(p)
    return {
      'N° EXP': nicOf(p),
      'Créée le': fmtDate(p.createdAt),
      'Origine': originCityOf(p),
      'Destination': destCityOf(p),
      'Expéditeur': p.sender?.name || '',
      'Destinataire': p.receiver?.name || '',
      'Type': codPartsLabel(p, { emoji: false, amounts: true }),
      'Montant COD (DH)': codTotalOf(p),
      'Valeurs comptées (DH)': codValueOf(p),
      'Étape': COD_STEP_META[step].label,
      'Par': codStepActor(p, step),
      'Le': fmtDateTime(codStepSince(p, step)),
      'Collecté le': fmtDateTime(p.codCollectedAt),
    }
  }
  const exportExcel = async () => {
    if (!list.length) { alert('Aucune expédition à exporter'); return }
    const XLSX = await loadExcel()
    if (!XLSX) return
    const ws = XLSX.utils.json_to_sheet(list.map(rowOf))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'COD')
    XLSX.writeFile(wb, `contre-remboursement-${period.fromKey}_${period.toKey}.xlsx`)
  }
  const printList = () => {
    if (!list.length) { alert('Aucune expédition à imprimer'); return }
    const w = openPrintWindow('width=1200,height=800')
    if (!w) return
    const rows = list.map(rowOf)
    const cols = Object.keys(rows[0]).filter(k => k !== 'Valeurs comptées (DH)')
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contre Remboursement</title>
<style>body{font-family:Arial,sans-serif;padding:16px;color:#111}h1{font-size:16px;margin:0 0 4px}p{font-size:11px;margin:0 0 10px;color:#444}
table{width:100%;border-collapse:collapse;font-size:9px}th{background:#065f46;color:#fff;text-align:left;padding:4px}td{border-bottom:1px solid #ddd;padding:3px 4px}
tr:nth-child(even) td{background:#f0fdf4}.r{text-align:right}tfoot td{font-weight:bold;background:#ecfdf5}@media print{thead{display:table-header-group}tr{page-break-inside:avoid}}</style></head><body>
<h1>💰 Contre Remboursement — ${escapeHtml(listTitle)}</h1>
<p>Période : ${escapeHtml(period.label)} (${fmtKey(period.fromKey)} → ${fmtKey(period.toKey)}) · Agence : ${escapeHtml(city === 'all' ? 'Toutes' : city)} · Type : ${escapeHtml(COD_TYPE_FILTERS.find(t => t.key === typeFilter)?.label || '')} · Imprimé le ${new Date().toLocaleString('fr-MA')}</p>
<table><thead><tr>${cols.map(c => `<th${c.includes('DH') ? ' class="r"' : ''}>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>
${rows.map(r => `<tr>${cols.map(c => `<td${c.includes('DH') ? ' class="r"' : ''}>${escapeHtml(c.includes('DH') ? fmt((r as any)[c]) : (r as any)[c])}</td>`).join('')}</tr>`).join('')}
</tbody><tfoot><tr><td colspan="${cols.length}">${list.length} expédition(s) · Valeurs : ${fmt(listTotal)} DH</td></tr></tfoot></table></body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const btn = (active: boolean, color = 'bg-green-600') =>
    `px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap ${active ? `${color} text-white shadow` : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`

  const StepRow = ({ step, t, c }: { step: CodStep; t: StepTotals; c: string | null }) => {
    const meta = COD_STEP_META[step]
    const v = t[step]
    return (
      <button type="button" onClick={() => go({ kind: 'step', step, city: c })} title={meta.help}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left hover:shadow-sm transition ${v.n ? meta.badge : 'bg-white border-gray-100 text-gray-400'}`}>
        <span className="text-xs font-semibold truncate">{meta.n}. {meta.label}</span>
        <span className="text-xs tabular-nums whitespace-nowrap"><b>{v.n}</b> · {fmt(v.m)} DH</span>
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Filtres ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800"><Filter className="w-4 h-4 text-green-600" /> Filtres</div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          {([['today', "Aujourd'hui"], ['week', '7 jours'], ['month', 'Ce mois'], ['custom', 'Période du … au …']] as [CodPreset, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={btn(preset === k)}>{l}</button>
          ))}
          {preset === 'custom' && (
            <span className="flex items-center gap-2">
              <DateInput value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">au</span>
              <DateInput value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </span>
          )}
          <button onClick={() => setTick(t => t + 1)} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <button onClick={() => setCity('all')} className={btn(city === 'all', 'bg-blue-600')}>Toutes les agences</button>
          {cities.map(c => <button key={c} onClick={() => setCity(c)} className={btn(city === c, 'bg-blue-600')}>{c}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Banknote className="w-4 h-4 text-gray-400" />
          {COD_TYPE_FILTERS.map(t => <button key={t.key} onClick={() => setTypeFilter(t.key)} className={btn(typeFilter === t.key, 'bg-purple-600')}>{t.label}</button>)}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher N° EXP, expéditeur, destinataire, téléphone…"
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:border-green-500 focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-0.5 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {/* ── Période appliquée et bases de date ── */}
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-900 space-y-1">
        <p className="text-sm font-bold">📅 {period.label} : du {fmtKey(period.fromKey)} au {fmtKey(period.toKey)} ({period.days} journée{period.days > 1 ? 's' : ''} d'opération, 08h00 → 06h00)</p>
        {customPending && <p className="text-amber-700 font-semibold">Saisissez les deux dates : la période « du … au … » s'applique quand les deux sont remplies (en attendant : 7 derniers jours).</p>}
        {period.cappedFrom && <p className="text-amber-700 font-semibold">Période limitée à {period.days} jours ({period.cappedFrom} demandés).</p>}
        <p>💰 <b>COD collectés</b> : rangés au <b>jour de la collecte</b> (codCollectedAt), exactement comme le bloc « Valeurs (COD) collectées par jour » de Caisse Agence et de la Collecte du soir (agence de destination).</p>
        <p>🔁 <b>Suivi du circuit</b> et liste : expéditions à COD <b>créées</b> sur la période (journée d'opération de création, comme Caisse Agence).</p>
        <p className="text-green-700">Argent encaissé avant le 05/10/2026 08:00 (essais) : hors des montants, comme sur toutes les pages. Les montants « valeurs » = espèces + chèque + traite (Retour BL : 0 DH).</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-semibold text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Erreur de chargement : {error} — les chiffres peuvent être incomplets.
        </div>
      )}
      {loading && (
        <div className="bg-white rounded-2xl border border-green-200 p-5">
          <div className="flex items-center gap-3"><Loader2 className="w-5 h-5 text-green-600 animate-spin" /><p className="text-sm font-bold text-green-900">Chargement des expéditions à COD de la période…</p></div>
          <LoadProgress loading count={loadedCount} detail={`${period.label} (du ${fmtKey(period.fromKey)} au ${fmtKey(period.toKey)})`} className="mt-3" />
        </div>
      )}

      {!loading && (<>
        {/* ── 💰 COD collectés (même règle que Caisse Agence / Collecte du soir) ── */}
        <section className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-lg font-black text-gray-900">💰 COD collectés</h2>
            <button onClick={() => go({ kind: 'collectes', city: null })} className="text-sm text-indigo-700 hover:underline">
              Total : <b>{collectesTotal.count}</b> expédition(s) · <b>{fmt(collectesTotal.montant)} DH</b>
              <span className="text-xs text-gray-500"> (💵 {fmt(collectesTotal.especes)} · 📋 {fmt(collectesTotal.cheque)} · 📝 {fmt(collectesTotal.traite)})</span>
            </button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
            {collectes.map(c => (
              <button key={c.city} type="button" onClick={() => go({ kind: 'collectes', city: c.city })}
                className="text-left border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 hover:border-indigo-400 hover:shadow-md transition">
                <div className="text-xs font-bold text-gray-700">{c.city}</div>
                <div className="text-xl font-black text-indigo-700">{fmt(c.montant)} DH</div>
                <div className="text-xs text-gray-500">{c.count} expédition(s)</div>
                <div className="mt-1 text-[10px] text-gray-600 space-y-0.5">
                  {c.especes > 0 && <div>💵 Espèces {fmt(c.especes)} DH</div>}
                  {c.cheque > 0 && <div>📋 Chèque {fmt(c.cheque)} DH</div>}
                  {c.traite > 0 && <div>📝 Traite {fmt(c.traite)} DH</div>}
                </div>
              </button>
            ))}
          </div>
          {city !== 'all' && collectes[0] && collectes[0].parJour.length > 0 && (
            <div className="mt-3">
              <CodCollectesParJour codCollectesParJour={collectes[0].parJour} profile={{ city, name: 'Admin' }}
                periodLabel={`${city} — ${period.label}`} periodShort={period.label} />
            </div>
          )}
        </section>

        {/* ── 🔁 Suivi du circuit par agence ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div>
            <h2 className="text-lg font-black text-gray-900">🔁 Suivi du circuit du COD</h2>
            <p className="text-xs text-gray-500">Chaque expédition est comptée UNE fois, à son étape actuelle. Étapes 1 → 5 : agence de destination (encaissement) · 6 → 8 : agence d'origine (retour à l'expéditeur). Cliquez une étape pour la liste.</p>
          </div>
          {/* Total général */}
          <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-3">
            <div className="text-sm font-black text-green-900 mb-2">Total {city === 'all' ? 'toutes agences' : city} — {circuitSum.n} expédition(s) · {fmt(circuitSum.m)} DH</div>
            {circuitTotal ? (<>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
                {CIRCUIT_STEPS.map(s => <StepRow key={s.key} step={s.key} t={circuitTotal} c={city === 'all' ? null : city} />)}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                {HORS_STEPS.map(s => (
                  <button key={s.key} onClick={() => go({ kind: 'step', step: s.key, city: city === 'all' ? null : city })} title={s.help} className="hover:underline">
                    {s.label} : <b>{circuitTotal[s.key].n}</b>
                  </button>
                ))}
              </div>
            </>) : <p className="text-sm text-gray-400">Aucune expédition à COD sur la période.</p>}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shownCities.filter(c => circuit.byCity.has(c)).map(c => {
              const t = circuit.byCity.get(c)!
              return (
                <div key={c} className="rounded-xl border border-gray-200 p-3">
                  <div className="font-bold text-gray-900 mb-2 flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-600" /> {c}</div>
                  <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Encaissement (agence de destination)</div>
                  <div className="space-y-1">{CIRCUIT_STEPS.filter(s => s.side === 'destination').map(s => <StepRow key={s.key} step={s.key} t={t} c={c} />)}</div>
                  <div className="text-[11px] font-semibold text-gray-500 uppercase mt-2 mb-1">Retour à l'expéditeur (agence d'origine)</div>
                  <div className="space-y-1">{CIRCUIT_STEPS.filter(s => s.side === 'origine').map(s => <StepRow key={s.key} step={s.key} t={t} c={c} />)}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 🚨 À surveiller ── */}
        <section className="bg-white rounded-2xl border border-red-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600" /> À surveiller</h2>
            <label className="text-xs text-gray-600 flex items-center gap-1.5">Seuil après l'envoi :
              <select value={days} onChange={e => setDays(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1 text-xs">
                {[1, 2, 3, 5, 7, 15].map(d => <option key={d} value={d}>{d} jour{d > 1 ? 's' : ''}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500 mb-2">Parmi les expéditions chargées (créées ou collectées sur la période).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {COD_ANOMALIES.map(a => {
              const rows = anomalies.get(a.key) || []
              const m = rows.reduce((s, p) => s + codValueOf(p), 0)
              return (
                <button key={a.key} type="button" onClick={() => go({ kind: 'anomaly', key: a.key })} title={a.help}
                  className={`text-left rounded-xl border px-3 py-2 transition hover:shadow-sm ${rows.length ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                  <div className="text-sm font-semibold">{a.label(days)}</div>
                  <div className="text-xs"><b>{rows.length}</b> expédition(s) · {fmt(m)} DH</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── 📋 Liste détaillée ── */}
        <section ref={listRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-gray-900 truncate">{listTitle}</h2>
              <p className="text-xs text-gray-500">{list.length} expédition(s) · valeurs {fmt(listTotal)} DH</p>
            </div>
            {view.kind !== 'all' && (
              <button onClick={() => setView({ kind: 'all' })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">
                <X className="w-3.5 h-3.5" /> Toute la liste
              </button>
            )}
            <button onClick={printList} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"><Printer className="w-4 h-4" /> Imprimer</button>
            <button onClick={exportExcel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['N° EXP', 'Créée le', 'Agences', 'Expéditeur', 'Destinataire', 'Type', 'Montant', 'Étape actuelle', 'Dernière étape'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Aucune expédition</td></tr>
                ) : list.slice(0, shown).map(p => {
                  const step = codStepOf(p)
                  const meta = COD_STEP_META[step]
                  const since = codStepSince(p, step)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg font-semibold">{nicOf(p)}</span>
                        {Number(p.nbColis) > 1 && <span className="block text-[10px] text-gray-400 mt-0.5">{p.nbColis} colis</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{originCityOf(p)} → <b>{destCityOf(p)}</b></td>
                      <td className="px-3 py-2 text-xs"><p className="font-medium text-gray-800">{p.sender?.name || '—'}</p><p className="text-gray-400">{p.sender?.tel}</p></td>
                      <td className="px-3 py-2 text-xs"><p className="font-medium text-gray-800">{p.receiver?.name || '—'}</p><p className="text-gray-400">{p.receiver?.tel}</p></td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{codPartsLabel(p)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-bold text-orange-600">{fmt(codTotalOf(p))} DH</span>
                        {isMixedCod(p) && <span className="block text-[11px] font-semibold text-orange-500">{codPartsBreakdown(p)}</span>}
                      </td>
                      <td className="px-3 py-2"><span title={meta.help} className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.badge}`}>{meta.n ? `${meta.n}. ` : ''}{meta.label}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <p>{codStepActor(p, step) || '—'}</p>
                        <p className="text-gray-400">{fmtDateTime(since)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {list.length > shown && (
            <div className="p-3 border-t border-gray-100 text-center">
              <button onClick={() => setShown(n => n + PAGE * 2)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">
                Afficher plus ({list.length - shown} restante{list.length - shown > 1 ? 's' : ''})
              </button>
            </div>
          )}
        </section>
      </>)}
    </div>
  )
}
