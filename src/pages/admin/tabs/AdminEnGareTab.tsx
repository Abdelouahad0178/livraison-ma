// 🏬 Admin › En gare : ce qui RESTE en gare dans chaque ville.
// 30/10/2026 : MÊME CALCUL que la carte « En gare - <ville> » de Caisse Agence (chef d'agence) et du chef d'exploitation —
// mêmes chargements (useAgencyCaisseData), même groupe (computeCaisseView → GARE_GROUP_ID), mêmes périodes (date de
// CRÉATION, journée d'opération ; défaut : veille travaillée). Avant : date d'ARRIVÉE et « Arrivé en agence » d'un vrai
// livreur compté en gare → chiffres différents de ceux du chef (Agadir : 226 au lieu de 254).
// Port dû à collecter = règle de la carte (isPortACollecterInGroup) ; COD à collecter = valeur non encaissée, par type.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, RefreshCw, Search } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import { caisseCodAmountOfType, caisseDefaultOperationalDay, computeCaisseView, GARE_GROUP_ID, isPortACollecterInGroup } from '../../../utils/agencyCaisseRules'
import { isBilledByAgency } from '../../../utils/billingAgency'
import { useAgencyCaisseData } from '../../exploitation/useAgencyCaisseData'
import { useDepotIds } from '../../exploitation/useDepotIds'

const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const num = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const toDate = (v: any): Date | null => { if (!v) return null; const d = v?.toDate ? v.toDate() : new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const fmtD = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR') : '—')
const fmtDT = (d: Date | null) => (d ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—')
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const nicOf = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || ''
// — Mêmes règles que Caisse Agence (utils/agencyCaisseRules) —
const portToCollect = (p: any) => (isPortACollecterInGroup(p, GARE_GROUP_ID) ? num(p.price) : 0)
const codPending = (p: any) => !p.codStatus || p.codStatus === 'pending'
const COD_TYPES = ['especes', 'cheque', 'traite'] as const
type CodType = typeof COD_TYPES[number]
const codToCollectOf = (p: any, t: CodType) => (codPending(p) ? caisseCodAmountOfType(p, t) : 0)
const codToCollect = (p: any) => COD_TYPES.reduce((s, t) => s + codToCollectOf(p, t), 0)
const isEnCompte = (p: any) => String(p.portType || '').startsWith('port_en_compte')
const isPortPaye = (p: any) => p.portType === 'port_paye' || !!p.portPayeMethod
/** Date d'arrivée en gare (pointage), sinon date de création. */
const arrivalOf = (p: any): Date | null => toDate(p.destinationArrivedAt) || toDate(p.chefPointedAt) || toDate(p.deliveryControlledAt) || toDate(p.createdAt)
const PORT_LABEL: Record<string, string> = { port_du: 'Port dû', port_paye: 'Port payé', port_en_compte_destinataire: 'En compte (dest.)', port_en_compte_expediteur: 'En compte (exp.)', port_en_compte: 'En compte' }
const COD_LABEL: Record<CodType, string> = { especes: '💵 Espèces', cheque: '📋 Chèque', traite: '📝 Traite' }

declare const __BUILD_TIME__: string
const BUILD_LABEL = (() => { try { const d = new Date(__BUILD_TIME__); return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` } catch { return '—' } })()

/** Périodes de Caisse Agence (date de création, journée d'opération 08 h → 06 h ; le samedi couvre le dimanche). */
type Preset = 'veille' | 'today' | 'day' | 'all'
/** pp : carte « Ramassés (En gare) » de Caisse Agence (ports payés ramassés au guichet de la ville) */
interface CityResult { parcels: any[]; loading: boolean; sig: string; pp: { n: number; m: number; recevoirN: number } }

/** Une ville : chargement ET calcul de Caisse Agence ; renvoie les expéditions de la carte « En gare ».
 *  `sig` (période + actualisation) accompagne chaque résultat : le parent n'affiche que ceux de la période en cours. */
function GareCity({ city, preset, opDay, sig, onResult }: { city: string; preset: Preset; opDay: Date | null; sig: string; onResult: (c: string, r: CityResult) => void }) {
  const caissePreset = preset === 'today' ? 'today' : preset === 'all' ? 'all' : 'operational'
  const day = caissePreset === 'operational' ? opDay : null
  const data = useAgencyCaisseData(city, caissePreset, '', '', day, false)
  const depotIds = useDepotIds(city)
  const { parcels, pp } = useMemo(() => {
    const v: any = computeCaisseView({ city, allDisplayParcels: data.allDisplayParcels, garePending: data.garePending, datePreset: caissePreset, operationalDay: day, depotIds })
    const g = v.filteredDrivers.find((d: any) => d.id === GARE_GROUP_ID)
    return {
      parcels: (g?.parcels || []).map((p: any) => ({ ...p, __city: city })),
      // Même chiffre que la carte « Ramassés (En gare) » de Caisse Agence : ports payés ramassés au guichet de la ville,
      // « En gare » ET détenteurs du guichet (ENGAREAGA6017, rachida…) ; recevoirN = pas encore remis au chef d'exploitation
      pp: { n: v.filteredStats.ramassesGareCount || 0, m: v.filteredStats.ramassesGareMontant || 0, recevoirN: (v.filteredStats.ramassesGareCount || 0) - (v.filteredStats.ramassesRemisCount || 0) },
    }
  }, [city, data.allDisplayParcels, data.garePending, caissePreset, day, depotIds])
  const loading = data.loading || data.loadingMore
  useEffect(() => { onResult(city, { parcels, loading, sig, pp }) }, [city, parcels, pp, loading, sig, onResult])
  return null
}
interface Tot { n: number; portN: number; port: number; payeN: number; paye: number; compteN: number; compte: number; compteAilleursN: number; compteAilleurs: number; cod: Record<CodType, number>; codN: Record<CodType, number>; old: number; oldest: number }
const zero = (): Tot => ({ n: 0, portN: 0, port: 0, payeN: 0, paye: 0, compteN: 0, compte: 0, compteAilleursN: 0, compteAilleurs: 0, cod: { especes: 0, cheque: 0, traite: 0 }, codN: { especes: 0, cheque: 0, traite: 0 }, old: 0, oldest: 0 })

export default function AdminEnGareTab() {
  const [city, setCity] = useState('all')
  const [preset, setPreset] = useState<Preset>('veille') // défaut de Caisse Agence : veille travaillée
  const [dayInput, setDayInput] = useState('')
  const [q, setQ] = useState('')
  const [port, setPort] = useState<'all' | 'port_du' | 'cod' | 'argent'>('all')
  const [reloadKey, setReloadKey] = useState(0)
  const [results, setResults] = useState<Record<string, CityResult>>({})
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const onResult = useCallback((c: string, r: CityResult) => { setResults(prev => ({ ...prev, [c]: r })); if (!r.loading) setLoadedAt(new Date()) }, [])
  const veilleDay = useMemo(() => caisseDefaultOperationalDay(), [reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⚠️ Objet Date STABLE (useMemo) : un nouvel objet à chaque rendu relancerait le calcul des villes en boucle
  const opDay = useMemo(() => (preset === 'veille' ? veilleDay : preset === 'day' && dayInput ? new Date(`${dayInput}T12:00:00`) : null), [preset, veilleDay, dayInput])
  const opDayKey = opDay ? ymd(opDay) : ''
  const cityList = city === 'all' ? (CITIES as string[]) : [city]
  const load = () => setReloadKey(k => k + 1)
  // Résultats de la période EN COURS seulement (jamais de mélange avec une période précédente)
  const sig = `${preset}|${opDayKey}|${reloadKey}`
  const ready = (c: string) => results[c]?.sig === sig
  const rows = cityList.every(ready) ? cityList.flatMap(c => results[c].parcels) : null
  const loading = cityList.some(c => !ready(c) || results[c].loading)
  const ppCaisse = cityList.reduce((s, c) => (ready(c) ? { n: s.n + results[c].pp.n, m: s.m + results[c].pp.m, recevoirN: s.recevoirN + results[c].pp.recevoirN } : s), { n: 0, m: 0, recevoirN: 0 })
  // 📱 Téléphone : l'écoute en direct peut être coupée pendant la mise en veille / l'arrière-plan sans relance visible →
  // au retour au premier plan (après plus de 30 s cachée), l'écoute est relancée : chiffres toujours à jour.
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > 30000) { hiddenAt = 0; setReloadKey(k => k + 1) }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ⏱️ Recalcul chaque minute (ancienneté) même sans changement dans la base
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t) }, [])
  const now = new Date()
  // « À vider » : encore en gare (pas livrée) et arrivée avant minuit (les camions arrivent la nuit, ≈ 00 h 30)
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0)

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (rows || []).filter(p => {
      if (port === 'port_du' && !portToCollect(p)) return false
      if (port === 'cod' && !codToCollect(p)) return false
      if (port === 'argent' && !portToCollect(p) && !codToCollect(p)) return false
      if (n && ![nicOf(p), p.trackingId, p.sender?.name, p.receiver?.name, p.receiver?.tel, p.sender?.tel, p.originCity].some(v => String(v || '').toLowerCase().includes(n))) return false
      return true
    }).sort((a, b) => (arrivalOf(a)?.getTime() || 0) - (arrivalOf(b)?.getTime() || 0))
  }, [rows, port, q, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const ageDays = (p: any) => { const d = arrivalOf(p); return d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : 0 }
  const addTo = (t: Tot, p: any) => {
    t.n++
    // Compté comme la carte de Caisse Agence (même un port dû à 0 DH compte dans le nombre)
    if (isPortACollecterInGroup(p, GARE_GROUP_ID)) { t.portN++; t.port += num(p.price) }
    // Port payé ARRIVÉ d'une autre ville : déjà payé au départ, rien à encaisser ici (information seulement)
    if (isPortPaye(p) && p.originCity !== p.__city) { t.payeN++; t.paye += num(p.price) }
    // En compte FACTURÉ par l'agence (règle de Ports en compte / Facturier : compte expéditeur → ville de départ,
    // compte destinataire → ville d'arrivée) ; les autres sont facturés ailleurs (information seulement)
    if (isEnCompte(p)) {
      if (isBilledByAgency(p, p.__city)) { t.compteN++; t.compte += num(p.price) } else { t.compteAilleursN++; t.compteAilleurs += num(p.price) }
    }
    COD_TYPES.forEach(k => { const a = codToCollectOf(p, k); if (a) { t.codN[k]++; t.cod[k] += a } })
    const a = arrivalOf(p); if (p.status !== 'Livré' && a && a < today0) t.old++
    t.oldest = Math.max(t.oldest, p.status === 'Livré' ? 0 : ageDays(p))
  }
  const { byCity, tot } = useMemo(() => {
    const m = new Map<string, Tot>(), all = zero()
    // Ville de la CARTE (agence) : un port payé ramassé au guichet compte dans la ville de départ, comme Caisse Agence
    shown.forEach(p => { const c = m.get(p.__city) || zero(); addTo(c, p); m.set(p.__city, c); addTo(all, p) })
    return { byCity: [...m.entries()].sort((a, b) => b[1].n - a[1].n), tot: all }
  }, [shown, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const codTotal = (t: Tot) => COD_TYPES.reduce((s, k) => s + t.cod[k], 0)
  const cities = CITIES as string[]
  const whereLabel = (p: any) => (p.destinationCity !== p.__city && p.originCity === p.__city ? 'Ramassé au guichet (port payé)'
    : p.destinationCity !== p.__city ? `En gare - ${p.destinationCity || '?'}`
    : p.status === 'Livré' ? 'Livrée au guichet'
    : p.status === 'En cours de livraison' ? `En gare (${p.deliveryDriverName || 'compte en gare'})`
    : p.status === 'Arrivé en agence' ? 'En gare' : p.status || 'En gare')
  const periodTxt = preset === 'all' ? 'tout (45 jours)' : preset === 'today' ? "aujourd'hui" : `journée du ${opDay ? fmtD(opDay) : '…'}${preset === 'veille' ? ' (veille travaillée)' : ''}`

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return }
    const det = (t: Tot) => `Port dû à collecter : <b>${t.portN} · ${dh(t.port)}</b> · Port payé ramassé au guichet (comme « Ramassés (En gare) ») : ${ppCaisse.n} · ${dh(ppCaisse.m)} (${ppCaisse.recevoirN} pas encore remis) · arrivées déjà payées au départ : ${t.payeN} · ${dh(t.paye)} · En compte facturé par la ville : ${t.compteN} · ${dh(t.compte)} (+ ${t.compteAilleursN} · ${dh(t.compteAilleurs)} facturés par la ville de départ)<br>
      COD à collecter : ${COD_TYPES.map(k => `${COD_LABEL[k].replace(/^\S+ /, '')} <b>${t.codN[k]} · ${dh(t.cod[k])}</b>`).join(' · ')} · <b>total ${dh(codTotal(t))}</b>`
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>En gare — ${esc(city === 'all' ? 'toutes villes' : city)}</title><style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4 landscape;margin:8mm}
      body{font-family:Arial,sans-serif;font-size:10px;margin:0;color:#111}h1{font-size:15px;margin:0 0 4px}.m{color:#475569;margin-bottom:4px}
      .det{border:1px solid #0f766e;border-radius:5px;padding:4px 6px;margin-bottom:6px;line-height:1.5}
      table{width:100%;border-collapse:collapse}th{background:#0f766e;color:#fff;text-align:left;padding:3px 4px;font-size:9px}
      td{border-bottom:1px solid #e2e8f0;padding:3px 4px;vertical-align:top}.r{text-align:right}.b{font-weight:bold}.old{background:#fef2f2}
      tfoot td{font-weight:bold;background:#f0fdfa;border-top:2px solid #0f766e}</style></head><body>
      <h1>🏬 En gare — ${esc(city === 'all' ? 'toutes les villes' : city)}</h1>
      <div class="m">Imprimé le ${esc(fmtDT(new Date()))} · ${esc(periodTxt)} (date de création, comme Caisse Agence) · ${shown.length} expédition(s) · ${tot.old} arrivée(s) avant aujourd'hui</div>
      <div class="det">${det(tot)}</div>
      <table><thead><tr><th>#</th><th>N° EXP</th><th>Destination</th><th>Arrivée</th><th>Jours</th><th>Expéditeur</th><th>Destinataire</th><th>Port</th><th class="r">Port dû</th><th class="r">COD esp.</th><th class="r">COD chq</th><th class="r">COD traite</th><th>Où</th></tr></thead><tbody>
      ${shown.map((p, i) => `<tr class="${p.status !== 'Livré' && (arrivalOf(p) || now) < today0 ? 'old' : ''}"><td>${i + 1}</td><td class="b">${esc(nicOf(p))}</td><td>${esc(p.destinationCity)}</td><td>${esc(fmtDT(arrivalOf(p)))}</td><td class="r">${ageDays(p)}</td>
        <td>${esc(p.sender?.name || '')}<br><small>${esc(p.originCity || '')}</small></td><td>${esc(p.receiver?.name || '')}<br><small>${esc(p.receiver?.tel || '')}</small></td>
        <td>${esc(PORT_LABEL[p.portType] || p.portType || '')}</td><td class="r">${portToCollect(p) ? esc(dh(portToCollect(p))) : '—'}</td>
        ${COD_TYPES.map(k => `<td class="r">${codToCollectOf(p, k) ? esc(dh(codToCollectOf(p, k))) : '—'}</td>`).join('')}
        <td>${esc(whereLabel(p))}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="8">TOTAL — ${shown.length} expédition(s)</td><td class="r">${esc(dh(tot.port))}</td>${COD_TYPES.map(k => `<td class="r">${esc(dh(tot.cod[k]))}</td>`).join('')}<td></td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}<\/script></body></html>`)
    w.document.close()
  }

  const sel = 'px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700'
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-teal-50'}`
  const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-4'
  return (
    <div className="mt-4 space-y-4">
      {/* 🧪 Page en essai (30/10/2026) */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-center gap-2">
        <span className="text-lg">🧪</span>
        <p><b>Page en essai</b> — les chiffres et les fonctions de cette page sont en cours de vérification.</p>
      </div>
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-60">
            <h2 className="text-lg font-black text-slate-800">🏬 En gare — ce qui reste dans chaque ville</h2>
            <p className="text-xs text-slate-500">Même calcul et mêmes périodes que la carte « En gare » de Caisse Agence et du chef d'exploitation (date de création, journée d'opération 08 h → 06 h) : mêmes chiffres pour une même période. La gare doit être vidée chaque matin.
              {loading && <> · <span className="font-semibold text-amber-700">⏳ chargement…</span></>}
              {!loading && loadedAt && <> · <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> à jour</span> · {loadedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
              <span className="ml-1 text-slate-400">· version du site {BUILD_LABEL}</span></p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
          <button onClick={print} disabled={!shown.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold">
            <Printer className="w-4 h-4" /> Imprimer ({shown.length})
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={city} onChange={e => setCity(e.target.value)} className={sel}>
            <option value="all">Toutes les villes</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {([['veille', `Veille travaillée (${fmtD(veilleDay).slice(0, 5)})`], ['today', "Aujourd'hui"], ['day', 'Journée…'], ['all', 'Tout (45 j)']] as [Preset, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={chip(preset === k)}>{l}</button>
          ))}
          {preset === 'day' && <input type="date" value={dayInput} onChange={e => setDayInput(e.target.value)} max={ymd(now)} className={sel} />}
          {preset === 'all' && city === 'all' && <span className="text-[11px] text-amber-700">⏳ « Tout » sur toutes les villes est long à charger : choisissez une ville si possible.</span>}
        </div>
        {cityList.map(c => <GareCity key={`${c}|${reloadKey}`} city={c} preset={preset} opDay={opDay} sig={sig} onResult={onResult} />)}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="N° EXP, expéditeur, destinataire, téléphone, ville d'origine…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm" />
          </div>
          <select value={port} onChange={e => setPort(e.target.value as any)} className={sel}>
            <option value="all">Tous les ports / COD</option>
            <option value="argent">Avec argent à collecter</option>
            <option value="port_du">Port dû à collecter</option>
            <option value="cod">COD à collecter</option>
          </select>
        </div>
      </div>

      {/* Totaux + détail des ports et des COD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 📦 Expéditions en gare */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 to-cyan-700 text-white shadow-lg p-5">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
          <p className="text-sm font-semibold text-white/80">🏬 Expéditions en gare</p>
          <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">{tot.n}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${tot.old ? 'bg-red-500 text-white ring-2 ring-white/60' : 'bg-white/20 text-white'}`}>
              {tot.old ? `⚠️ ${tot.old} à vider (arrivées avant aujourd'hui)` : '✓ Rien d\'ancien à vider'}
            </span>
            {tot.oldest > 0 && <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-bold">⏳ plus ancienne : {tot.oldest} j</span>}
          </div>
        </div>

        {/* 📮 Ports */}
        <div className="rounded-3xl bg-white border border-orange-100 shadow-lg p-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center text-lg">📮</span>
            <p className="text-sm font-bold text-slate-600">Port dû à collecter</p>
          </div>
          <p className="mt-2 text-3xl font-black text-orange-600 tabular-nums">{dh(tot.port)}</p>
          <p className="text-xs font-semibold text-slate-500">{tot.portN} expédition(s)</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-emerald-50 px-3 py-2" title="Même chiffre que la carte « Ramassés (En gare) » de Caisse Agence : ports payés ramassés au guichet de la ville (En gare et détenteurs du guichet)">
              <p className="text-[11px] font-bold text-emerald-700">📬 Port payé (guichet)</p>
              <p className="text-sm font-black text-emerald-800 tabular-nums">{dh(ppCaisse.m)}</p>
              <p className="text-[10px] text-emerald-700/80">{ppCaisse.n} ramassé(s) · {ppCaisse.recevoirN} pas encore remis</p>
              {tot.payeN > 0 && <p className="text-[10px] text-slate-500">+ {tot.payeN} arrivée(s) déjà payée(s) au départ ({dh(tot.paye)}) — rien à encaisser</p>}
            </div>
            <div className="rounded-2xl bg-indigo-50 px-3 py-2">
              <p className="text-[11px] font-bold text-indigo-700">🏦 En compte</p>
              <p className="text-sm font-black text-indigo-800 tabular-nums">{dh(tot.compte)}</p>
              <p className="text-[10px] text-indigo-700/80">{tot.compteN} · facturé(s) par la ville (comme Ports en compte)</p>
              {tot.compteAilleursN > 0 && <p className="text-[10px] text-slate-500">+ {tot.compteAilleursN} facturée(s) par la ville de départ ({dh(tot.compteAilleurs)})</p>}
            </div>
          </div>
        </div>

        {/* 💰 COD */}
        <div className="rounded-3xl bg-white border border-violet-100 shadow-lg p-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center text-lg">💰</span>
            <p className="text-sm font-bold text-slate-600">COD à collecter</p>
          </div>
          <p className="mt-2 text-3xl font-black text-violet-700 tabular-nums">{dh(codTotal(tot))}</p>
          <p className="text-xs font-semibold text-slate-500">{COD_TYPES.reduce((s, k) => s + tot.codN[k], 0)} valeur(s)</p>
          {/* Barre de répartition par type */}
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {codTotal(tot) > 0 && COD_TYPES.map(k => (
              <div key={k} style={{ width: `${(tot.cod[k] / codTotal(tot)) * 100}%` }}
                className={k === 'especes' ? 'bg-emerald-500' : k === 'cheque' ? 'bg-blue-500' : 'bg-amber-500'} />
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {COD_TYPES.map(k => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${k === 'especes' ? 'bg-emerald-500' : k === 'cheque' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                <span className="flex-1 text-slate-600">{COD_LABEL[k].replace(/^\S+ /, '')} <span className="text-xs text-slate-400">· {tot.codN[k]}</span></span>
                <b className="tabular-nums text-slate-800">{dh(tot.cod[k])}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Par ville */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>
            <th className="px-3 py-2 text-left">Ville</th><th className="px-3 py-2 text-right">Expéditions</th><th className="px-3 py-2 text-right">Avant aujourd'hui</th>
            <th className="px-3 py-2 text-right">Plus ancienne (j)</th><th className="px-3 py-2 text-right">Port dû à collecter</th>
            <th className="px-3 py-2 text-right">COD espèces</th><th className="px-3 py-2 text-right">COD chèque</th><th className="px-3 py-2 text-right">COD traite</th><th className="px-3 py-2 text-right">COD total</th>
          </tr></thead>
          <tbody>
            {loading && !rows && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Chargement…</td></tr>}
            {byCity.map(([c, v]) => (
              <tr key={c} onClick={() => setCity(city === c ? 'all' : c)} className={`border-t border-slate-100 cursor-pointer hover:bg-teal-50 ${city === c ? 'bg-teal-50' : ''}`}>
                <td className="px-3 py-2 font-bold">{c}</td><td className="px-3 py-2 text-right tabular-nums">{v.n}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${v.old ? 'text-red-700' : 'text-emerald-700'}`}>{v.old}</td>
                <td className="px-3 py-2 text-right tabular-nums">{v.oldest}</td>
                <td className="px-3 py-2 text-right tabular-nums text-orange-600">{v.portN} · {dh(v.port)}</td>
                {COD_TYPES.map(k => <td key={k} className="px-3 py-2 text-right tabular-nums text-violet-700">{v.codN[k] ? `${v.codN[k]} · ${dh(v.cod[k])}` : '—'}</td>)}
                <td className="px-3 py-2 text-right tabular-nums font-bold text-violet-800">{dh(codTotal(v))}</td>
              </tr>
            ))}
            {rows && !byCity.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-emerald-700 font-semibold">✓ Rien en gare pour ces filtres</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Détail */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0"><tr>
            <th className="px-3 py-2 text-left">N° EXP</th><th className="px-3 py-2 text-left">Destination</th><th className="px-3 py-2 text-left">Créée</th><th className="px-3 py-2 text-left">Arrivée</th>
            <th className="px-3 py-2 text-right">Jours</th><th className="px-3 py-2 text-left">Expéditeur</th><th className="px-3 py-2 text-left">Destinataire</th>
            <th className="px-3 py-2 text-left">Port</th><th className="px-3 py-2 text-right">Port dû</th><th className="px-3 py-2 text-right">COD</th><th className="px-3 py-2 text-left">Où</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, 1000).map(p => {
              const a = arrivalOf(p), old = p.status !== 'Livré' && !!a && a < today0
              const parts = COD_TYPES.filter(k => codToCollectOf(p, k) > 0)
              return (
                <tr key={p.id} className={`border-t border-slate-100 ${old ? 'bg-red-50/60' : ''}`}>
                  <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{nicOf(p)}</td>
                  <td className="px-3 py-1.5">{p.destinationCity}</td>
                  <td className="px-3 py-1.5 text-xs">{fmtD(toDate(p.createdAt))}</td>
                  <td className="px-3 py-1.5 text-xs">{fmtDT(a)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${old ? 'text-red-700' : 'text-slate-500'}`}>{ageDays(p)}</td>
                  <td className="px-3 py-1.5">{p.sender?.name || '—'}<div className="text-[11px] text-slate-500">{p.originCity}</div></td>
                  <td className="px-3 py-1.5">{p.receiver?.name || '—'}<div className="text-[11px] text-slate-500">{p.receiver?.tel || ''}</div></td>
                  <td className="px-3 py-1.5 text-xs">{PORT_LABEL[p.portType] || p.portType || '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-orange-600">{portToCollect(p) ? dh(portToCollect(p)) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-violet-700">{parts.length ? parts.map(k => <div key={k}>{dh(codToCollectOf(p, k))} <span className="text-[10px] text-slate-500">{COD_LABEL[k].replace(/^\S+ /, '').toLowerCase()}</span></div>) : '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{p.status === 'Livré' || p.destinationCity !== p.__city
                    ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{whereLabel(p)}</span>
                    : <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold">{whereLabel(p)}</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length > 1000 && <p className="px-3 py-2 text-xs text-slate-500 border-t">1 000 premières lignes affichées sur {shown.length} — affinez les filtres (ville, date, N° EXP) ou imprimez la liste complète.</p>}
      </div>
    </div>
  )
}
