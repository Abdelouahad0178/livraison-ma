// 📋 « Mes saisies » — vue dédiée de l'AIDE AGENT : les expéditions qu'il a lui-même saisies
// (aideAgentId == uid, anciennes saisies validées par le chef comprises), en temps réel.
// Même système que la page Chef d'agence : chargement jour par jour (mois par mois sur une longue
// période) avec le camion qui roule, recherche déclenchée à 7 chiffres / 3 lettres ou par Entrée,
// accents ignorés, C4500 (chèque) / T3000 (traite), portée Tous / Expéditeur / Destinataire.
// Les modales (Modifier, suppression) restent celles de la page agent : ce composant est affiché
// par ParcelsTab à la place de la liste « Expéditions » du chef quand le rôle est aide_agent.
import DateInput from '../../../components/DateInput'
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Edit2, Trash2, Lock, Search, X } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { subscribeMyEntries } from '../../../firebase/parcels'
import { STATUS_COLORS } from '../../../firebase/constants'
import { getOperationalDayRange, getCurrentOperationalDay } from '../../../config/operationalDay'
import { todayStr, parcelDate } from '../../../utils/dateFilter'
import { shouldTriggerSearch } from '../../../utils/searchUtils'
import { makeAgentSearchMatcher } from '../../../utils/parcelSearch'
import { codAmountOfType, codHasType } from '../../../utils/codParts'
import LoadProgress from '../../../components/LoadProgress'
import PendingBadge from '../../../components/PendingBadge'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'
type StateFilter = 'all' | 'editable' | 'loaded' | 'pending' | 'validated'
type Scope = 'all' | 'sender' | 'receiver'
interface Slice { start: Date; end: Date; label: string }

const PORT_LABELS: Record<string, string> = {
  port_paye: 'Payé',
  port_du: 'Dû',
  port_en_compte: 'En compte',
  port_en_compte_expediteur: 'En compte (Exp.)',
}
// « Tout » : depuis le début de l'application (plus ancienne expédition : juillet 2025)
const ALL_FROM = '2025-07-01'
// Au-delà de 45 jours, chargement mois par mois (au lieu de jour par jour)
const DAY_SLICES_MAX = 45

const fmtDH = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-MA')} DH`
const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const noon = (s: string) => new Date(s + 'T12:00:00')
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

/** Première et dernière journée d'opération de la période + borne de fin Firestore. */
function periodFor(preset: Preset, from: string, to: string): { first: Date; last: Date; end: Date } | null {
  const opToday = getCurrentOperationalDay()
  // Fin : journée d'opération du jour CALENDAIRE (une saisie faite après minuit porte la date du
  // jour calendaire, cf. operationDate du formulaire) — englobe donc toujours la journée en cours.
  const endToday = getOperationalDayRange(noon(todayStr())).end
  const opEnd = getOperationalDayRange(opToday).end
  const end = endToday.getTime() > opEnd.getTime() ? endToday : opEnd
  const back = (n: number) => { const d = new Date(opToday); d.setDate(d.getDate() - n); return d }
  if (preset === 'today') return { first: opToday, last: opToday, end }
  if (preset === 'yesterday') { const y = back(1); return { first: y, last: y, end: getOperationalDayRange(y).end } }
  if (preset === 'week') return { first: back(6), last: opToday, end }
  if (preset === 'month') return { first: back(29), last: opToday, end }
  if (preset === 'all') return { first: noon(ALL_FROM), last: opToday, end }
  if (!from && !to) return null
  const f = from || to, t = to || from
  const [a, b] = f <= t ? [f, t] : [t, f]
  const last = noon(b)
  return { first: noon(a), last, end: getOperationalDayRange(last).end }
}

/** Tranches à charger, la plus RÉCENTE d'abord (jours, ou mois sur une longue période). */
function slicesFor(p: { first: Date; last: Date; end: Date }): Slice[] {
  const out: Slice[] = []
  const days = Math.round((p.last.getTime() - p.first.getTime()) / 86400000) + 1
  if (days <= DAY_SLICES_MAX) {
    for (let i = 0; i < days; i++) {
      const d = new Date(p.last); d.setDate(d.getDate() - i)
      const r = getOperationalDayRange(d)
      out.push({ start: r.start, end: r.end, label: ddmm(d) })
    }
  } else {
    let m = new Date(p.last.getFullYear(), p.last.getMonth(), 1, 12)
    while (m.getTime() >= new Date(p.first.getFullYear(), p.first.getMonth(), 1, 12).getTime()) {
      const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12)
      const a = m.getTime() < p.first.getTime() ? p.first : m
      const b = mEnd.getTime() > p.last.getTime() ? p.last : mEnd
      out.push({
        start: getOperationalDayRange(a).start,
        end: getOperationalDayRange(b).end,
        label: m.toLocaleDateString('fr-MA', { month: 'short', year: 'numeric' }),
      })
      m = new Date(m.getFullYear(), m.getMonth() - 1, 1, 12)
    }
  }
  // La tranche la plus récente va jusqu'à la borne de fin (journée calendaire en cours)
  if (out.length && p.end.getTime() > out[0].end.getTime()) out[0] = { ...out[0], end: p.end }
  return out
}

function useDebounce<T>(value: T, delay = 150): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

/** Prédicat de recherche : C4500 / T3000 (montant chèque / traite) ou recherche du chef d'agence. */
function makeMatcher(term: string, scope: Scope): ((p: any) => boolean) | null {
  const t = term.trim()
  if (!t) return null
  const m = t.match(/^([ct])\s*(\d+(?:[.,]\d+)?)$/i)
  if (m) {
    const type = m[1].toLowerCase() === 'c' ? 'cheque' : 'traite'
    const amount = parseFloat(m[2].replace(',', '.'))
    return (p: any) => codHasType(p, type) && Math.abs(codAmountOfType(p, type) - amount) < 0.01
  }
  return makeAgentSearchMatcher(t.toLowerCase(), scope)
}

export default function MesSaisiesView() {
  const {
    uid, profile,
    canEditParcelDetails,
    canDeleteParcel,
    handlePrintTicket, handleEditClick, handleDeleteClick,
    needsAzertyFix, azertyFix,
  } = useAgentCtx() as any

  const [preset, setPreset] = useState<Preset>('today')
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [scope, setScope] = useState<Scope>('all')
  const [error, setError] = useState('')
  const [printingId, setPrintingId] = useState<string | null>(null)

  // ── Chargement par tranches (jour par jour / mois par mois), temps réel ────────────────────
  const period = useMemo(() => periodFor(preset, from, to), [preset, from, to])
  const slices = useMemo(() => (period ? slicesFor(period) : []), [period])
  const slicesKey = slices.map(s => `${s.start.getTime()}-${s.end.getTime()}`).join('|')
  const sliceRows = useRef<Map<number, any[]>>(new Map())
  const [rows, setRows] = useState<any[]>([])
  const [loadedCount, setLoadedCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    sliceRows.current = new Map()
    setRows([]); setLoadedCount(0); setError('')
    if (!uid || !slices.length) return
    let cancelled = false
    const unsubs: (() => void)[] = []
    const fromCache = new Map<number, boolean>()
    let timer: ReturnType<typeof setTimeout> | null = null
    // Fusion des tranches (déjà triées, la plus récente d'abord) : au plus toutes les 200 ms
    const flush = () => {
      timer = null
      if (cancelled) return
      const merged: any[] = []
      for (let i = 0; i < slices.length; i++) { const r = sliceRows.current.get(i); if (r) merged.push(...r) }
      const done = sliceRows.current.size
      const sync = [...fromCache.values()].some(Boolean)
      startTransition(() => { setRows(merged); setLoadedCount(done); setSyncing(sync) })
    }
    const schedule = () => { if (!timer) timer = setTimeout(flush, sliceRows.current.size >= slices.length ? 0 : 200) }
    const listen = (i: number, lite: boolean, field: 'aideAgentId' | 'agentId' = 'aideAgentId') => {
      const s = slices[i]
      const u = subscribeMyEntries(uid, s.start, s.end, (data, meta) => {
        if (cancelled) return
        sliceRows.current.set(i, data)
        fromCache.set(i, meta.fromCache)
        schedule()
      }, (err: any) => {
        if (cancelled) return
        console.error('MesSaisies subscribeMyEntries:', err)
        // parcelsLite indisponible → repli sur parcels ; index aideAgentId en construction → agentId
        if (lite) { listen(i, false, field); return }
        if (field === 'aideAgentId' && err?.code === 'failed-precondition') { listen(i, true, 'agentId'); return }
        sliceRows.current.set(i, [])
        setError(err?.code === 'permission-denied'
          ? 'Accès refusé par Firestore. Rechargez la page puis réessayez.'
          : 'Erreur de chargement d\'une partie de vos saisies. Réessayez.')
        schedule()
      }, lite, field)
      unsubs.push(u)
    }
    slices.forEach((_, i) => listen(i, true))
    return () => { cancelled = true; if (timer) clearTimeout(timer); unsubs.forEach(u => u()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, slicesKey])

  const loading = slices.length > 0 && loadedCount < slices.length
  const currentSlice = loading ? slices[Math.min(loadedCount, slices.length - 1)] : null

  // ── Recherche : même règle que le Chef d'agence ───────────────────────────────────────────
  // Recherche ACTIVE seulement pour un terme « complet » (7 chiffres / 3 lettres / C4500) ou par
  // Entrée ; pendant la saisie d'un numéro incomplet, la liste reste figée (aucun recalcul).
  const [search, setSearch] = useState('')
  const [forced, setForced] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const debounced = useDebounce(search)
  const forcedNow = !!forced && search.trim() === forced
  useEffect(() => {
    if (forcedNow) { setActiveSearch(search); return }
    if (!debounced.trim()) { if (!search.trim()) setActiveSearch(''); return }
    if (shouldTriggerSearch(debounced)) setActiveSearch(debounced)
  }, [debounced, forcedNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // 🚚 Le camion roule à chaque recherche (au moins 0,8 s, le temps de la voir)
  const [searchFlash, setSearchFlash] = useState(false)
  useEffect(() => {
    if (!activeSearch.trim()) { setSearchFlash(false); return }
    setSearchFlash(true)
    const t = setTimeout(() => setSearchFlash(false), 800)
    return () => clearTimeout(t)
  }, [activeSearch, scope])

  // ⚡ Filtrage en arrière-plan (la frappe et les clics restent fluides)
  const dRows = useDeferredValue(rows)
  const dSearch = useDeferredValue(activeSearch)
  const dScope = useDeferredValue(scope)
  const dState = useDeferredValue(stateFilter)
  const pending = dRows !== rows || dSearch !== activeSearch || dScope !== scope || dState !== stateFilter

  const stateOf = (p: any) => {
    if (p.shipmentLoadedAt) return 'loaded'
    if (p.validatedByChef === false) return 'pending'
    if (p.validatedByChef === true) return 'validated'
    return 'saved'
  }
  const canEdit = (p: any) => canEditParcelDetails(p) && (p.validatedByChef !== true || p.aideEditUnlocked === true)
  const canDelete = (p: any) => canDeleteParcel(p) && p.validatedByChef !== true

  const searched = useMemo(() => {
    const match = makeMatcher(dSearch, dScope)
    return match ? dRows.filter(match) : dRows
  }, [dRows, dSearch, dScope])

  const counts = useMemo(() => {
    const c = { all: searched.length, editable: 0, loaded: 0, pending: 0, validated: 0 }
    searched.forEach(p => {
      const st = stateOf(p)
      if (st === 'loaded') c.loaded++
      if (st === 'pending') c.pending++
      if (p.validatedByChef === true) c.validated++
      if (canEdit(p)) c.editable++
    })
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched])

  const visible = useMemo(() => searched.filter(p => {
    if (dState === 'all') return true
    if (dState === 'editable') return canEdit(p)
    if (dState === 'loaded') return !!p.shipmentLoadedAt
    if (dState === 'pending') return p.validatedByChef === false
    if (dState === 'validated') return p.validatedByChef === true
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [searched, dState])

  const totals = useMemo(() => {
    let colis = 0, ports = 0, rf = 0, rfCount = 0
    const byPort: Record<string, number> = {}
    visible.forEach(p => {
      colis += parseInt(p.nbColis) || 1
      const pr = num(p.price)
      ports += pr
      const pt = p.portType || 'port_paye'
      byPort[pt] = (byPort[pt] || 0) + pr
      const cod = num(p.codAmount)
      if (cod > 0) { rf += cod; rfCount++ }
    })
    return { colis, ports, rf, rfCount, byPort }
  }, [visible])

  // Affichage plafonné (rendu fluide) : la recherche permet de retrouver n'importe quel bon
  const [shown, setShown] = useState(200)
  useEffect(() => { setShown(200) }, [slicesKey, activeSearch, stateFilter, scope])

  const searchRunning = !!activeSearch.trim() && (pending || searchFlash)
  const showTruck = loading || searchRunning
  const periodLabel = preset === 'all' ? 'tout l\'historique'
    : period ? (ymd(period.first) === ymd(period.last) ? period.first.toLocaleDateString('fr-MA')
      : `du ${period.first.toLocaleDateString('fr-MA')} au ${period.last.toLocaleDateString('fr-MA')}`) : ''
  const truckDetail = loading && currentSlice
    ? `${slices.length > 1 ? (slices.length <= DAY_SLICES_MAX ? 'jour par jour' : 'mois par mois') : 'chargement'} : ${currentSlice.label} (${loadedCount + 1}/${slices.length}) — ${periodLabel}`
    : `recherche « ${activeSearch.trim()} » — ${periodLabel}`

  const presetBtn = (key: Preset, label: string) => (
    <button key={key} type="button" onClick={() => setPreset(key)}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${preset === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {label}
    </button>
  )
  const stateBtn = (key: StateFilter, label: string, n: number, cls: string) => (
    <button key={key} type="button" onClick={() => setStateFilter(key)}
      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${stateFilter === key ? cls + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
      {label} <span className="opacity-70">({n})</span>
    </button>
  )
  const scopeBtn = (key: Scope, label: string) => (
    <button key={key} type="button" onClick={() => setScope(key)}
      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${scope === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {label}
    </button>
  )

  const stateBadge = (p: any) => {
    const st = stateOf(p)
    if (st === 'loaded') return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold"><Lock className="w-3 h-3" />Chargée</span>
    if (st === 'pending') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">⏳ En attente de validation</span>
    if (st === 'validated') return (
      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${p.aideEditUnlocked ? 'bg-sky-100 text-sky-800' : 'bg-green-100 text-green-800'}`}>
        ✅ Validée{p.aideEditUnlocked ? ' (accès réouvert)' : ''}
      </span>
    )
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">📝 Enregistrée</span>
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800">📋 Mes saisies</h2>
          <span className="text-xs text-gray-500">
            {profile?.name || ''}{profile?.city ? ` — ${profile.city}` : ''}
            {syncing && <span className="ml-2 text-amber-600">● synchronisation…</span>}
            {!syncing && !loading && <span className="ml-2 text-green-600">● temps réel</span>}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {presetBtn('today', "Aujourd'hui")}
          {presetBtn('yesterday', 'Hier')}
          {presetBtn('week', '7 jours')}
          {presetBtn('month', '30 jours')}
          {presetBtn('custom', '📅 Période')}
          {presetBtn('all', '🗂️ Tout')}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              <DateInput value={from} min={ALL_FROM} max={todayStr()} onChange={e => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1" aria-label="Du" />
              <span className="text-gray-400">→</span>
              <DateInput value={to} min={ALL_FROM} max={todayStr()} onChange={e => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1" aria-label="Au" />
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // La douchette finit toujours par Entrée → corriger AZERTY→QWERTY ici
                const fixed = typeof needsAzertyFix === 'function' && needsAzertyFix(search) ? azertyFix(search) : search
                if (fixed !== search) setSearch(fixed)
                // ⏎ Entrée : recherche immédiate, même pour un N° EXP de moins de 7 chiffres
                setForced(String(fixed).trim())
                if (String(fixed).trim()) setActiveSearch(fixed)
              }
            }}
            placeholder="🔍 Rechercher par N° EXP, Nom, Téléphone | C4500 (chèque) | T3000 (traite)"
            className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 pl-12 pr-10 py-3.5 rounded-xl text-sm font-medium text-gray-800 placeholder-gray-500 focus:border-blue-500 focus:bg-white focus:shadow-lg focus:outline-none transition-all"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setActiveSearch(''); setForced('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
        {search && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-gray-500">Chercher le nom dans :</span>
            {scopeBtn('all', 'Tous')}
            {scopeBtn('sender', 'Expéditeur')}
            {scopeBtn('receiver', 'Destinataire')}
            {search.trim() && !activeSearch.trim() && (
              <span className="text-gray-400">— tapez au moins 7 chiffres ou 3 lettres, ou appuyez sur Entrée</span>
            )}
          </div>
        )}

        {showTruck && (
          <LoadProgress loading count={loading ? rows.length : visible.length}
            noun={loading ? 'saisies' : 'résultats'} loadedWord={loading ? 'chargées' : 'trouvés'}
            detail={truckDetail} />
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {stateBtn('all', 'Toutes', counts.all, 'bg-blue-50 text-blue-700 border-blue-200')}
          {stateBtn('editable', '✏️ Modifiables', counts.editable, 'bg-blue-50 text-blue-700 border-blue-200')}
          {stateBtn('loaded', '🚚 Chargées', counts.loaded, 'bg-slate-100 text-slate-700 border-slate-300')}
          {counts.pending > 0 && stateBtn('pending', '⏳ En attente de validation', counts.pending, 'bg-amber-50 text-amber-800 border-amber-200')}
          {counts.validated > 0 && stateBtn('validated', '✅ Validées', counts.validated, 'bg-green-50 text-green-800 border-green-200')}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-2.5">
            <p className="text-[11px] text-blue-700 font-semibold">Expéditions</p>
            <p className="text-lg font-bold text-blue-900">{visible.length.toLocaleString('fr-MA')}</p>
          </div>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2.5">
            <p className="text-[11px] text-indigo-700 font-semibold">Colis</p>
            <p className="text-lg font-bold text-indigo-900">{totals.colis.toLocaleString('fr-MA')}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5">
            <p className="text-[11px] text-emerald-700 font-semibold">Total ports</p>
            <p className="text-lg font-bold text-emerald-900">{fmtDH(totals.ports)}</p>
            <p className="text-[10px] text-emerald-700 leading-tight">
              {Object.entries(totals.byPort).filter(([, v]) => v > 0).map(([k, v]) => `${PORT_LABELS[k] || k} ${fmtDH(v)}`).join(' · ')}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5">
            <p className="text-[11px] text-amber-700 font-semibold">Retour de fonds (RF)</p>
            <p className="text-lg font-bold text-amber-900">{fmtDH(totals.rf)}</p>
            <p className="text-[10px] text-amber-700">{totals.rfCount} expédition(s) avec RF</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <PendingBadge show={pending && !loading} />

      {visible.length === 0 ? (
        <div className="text-center py-10 bg-white border border-gray-200 rounded-2xl text-gray-500 text-sm">
          {loading ? 'Chargement de vos saisies…'
            : rows.length === 0 ? 'Aucune saisie sur cette période.' : 'Aucune saisie ne correspond à ces filtres.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">N° EXP</th>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Expéditeur</th>
                  <th className="text-left px-3 py-2 font-semibold">Destinataire</th>
                  <th className="text-right px-3 py-2 font-semibold">Colis</th>
                  <th className="text-right px-3 py-2 font-semibold">Port</th>
                  <th className="text-right px-3 py-2 font-semibold">RF</th>
                  <th className="text-left px-3 py-2 font-semibold">Statut</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.slice(0, shown).map(p => {
                  const d = parcelDate(p)
                  const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
                  const editable = canEdit(p)
                  const deletable = canDelete(p)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 align-top">
                      <td className="px-3 py-2">
                        <div className="font-bold text-gray-900">{p.senderNic || p.sender?.nic || '—'}</div>
                        <div className="text-[11px] font-mono text-blue-600">{p.trackingId}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                        {d && d.getTime() > 0 ? (ymd(d) === todayStr() ? 'Auj.' : d.toLocaleDateString('fr-MA')) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{p.sender?.name || p.clientName || '—'}</div>
                        <div className="text-[11px] text-gray-500">{p.sender?.tel || p.senderTel || ''}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{p.receiver?.name || '—'}</div>
                        <div className="text-[11px] text-gray-500">
                          {p.receiver?.city || p.destinationCity || ''}{(p.receiver?.tel || p.receiverTel) ? ` · ${p.receiver?.tel || p.receiverTel}` : ''}
                          {p.deliveryMethod === 'gare' ? ' · 🚉 En gare' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{parseInt(p.nbColis) || 1}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="font-semibold">{fmtDH(num(p.price))}</div>
                        <div className="text-[11px] text-gray-500">{PORT_LABELS[p.portType || 'port_paye'] || p.portType}</div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{num(p.codAmount) > 0 ? fmtDH(num(p.codAmount)) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${sc.bg} ${sc.text}`}>{p.status || '—'}</span>
                          {stateBadge(p)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" title="Imprimer le bon"
                            disabled={printingId === p.id}
                            onClick={async () => { setPrintingId(p.id); try { await handlePrintTicket(p) } finally { setPrintingId(null) } }}
                            className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-50">
                            <Printer className="w-4 h-4" />
                          </button>
                          {editable ? (
                            <button type="button" title="Modifier" onClick={() => handleEditClick(p)}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600">
                              <Edit2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span title={p.shipmentLoadedAt ? 'Chargée dans un camion : modification impossible' : 'Validée par le chef : modification verrouillée'}
                              className="p-1.5 rounded-lg bg-gray-50 text-gray-400"><Lock className="w-4 h-4" /></span>
                          )}
                          {deletable && (
                            <button type="button" title="Supprimer" onClick={() => handleDeleteClick(p)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {visible.length > shown && (
            <button type="button" onClick={() => setShown(s => s + 300)}
              className="w-full py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 border-t border-gray-100">
              Afficher plus ({(visible.length - shown).toLocaleString('fr-MA')} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
