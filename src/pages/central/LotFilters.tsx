// 🔎 Recherche + filtres des lots de valeurs (onglets « Envoi des valeurs » et « Réception des valeurs »).
import { Search, X } from 'lucide-react'
import { lotMatches, lotHasType, type ValeursLot } from '../../firebase/valeursLots'

export interface LotFilterState {
  q: string
  status: 'all' | 'cree' | 'recu' | 'recu_partiel' | 'annule'
  /** Ville de l'AUTRE bout : destination (envoi) ou ville d'envoi (réception) */
  city: string
  type: 'all' | 'especes' | 'cheque' | 'traite'
  missingOnly: boolean
  /** Date de création du lot : du … au … (AAAA-MM-JJ, vides = sans borne) */
  from: string
  to: string
}
export const EMPTY_LOT_FILTERS: LotFilterState = { q: '', status: 'all', city: 'all', type: 'all', missingOnly: false, from: '', to: '' }

const ymdLocal = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Date de début à charger pour couvrir le filtre « du » (null = pas de filtre). */
export const lotFilterSince = (f: LotFilterState): Date | null => (f.from ? new Date(f.from + 'T00:00:00') : null)

export function applyLotFilters(lots: ValeursLot[], f: LotFilterState, cityOf: (l: ValeursLot) => string): ValeursLot[] {
  return lots.filter(l =>
    (!f.from || ymdLocal(l.createdAt) >= f.from)
    && (!f.to || ymdLocal(l.createdAt) <= f.to)
    && (f.status === 'all' || l.status === f.status)
    && (f.city === 'all' || cityOf(l) === f.city)
    && (f.type === 'all' || lotHasType(l, f.type))
    && (!f.missingOnly || (l.missingIds || []).length > 0)
    && lotMatches(l, f.q))
}

export function LotFilterBar({ value, onChange, cities, cityLabel, statuses, count, total }: {
  value: LotFilterState
  onChange: (v: LotFilterState) => void
  cities: string[]
  /** « Vers » (envoi) ou « De » (réception) */
  cityLabel: string
  statuses: LotFilterState['status'][]
  count: number
  total: number
}) {
  const set = (patch: Partial<LotFilterState>) => onChange({ ...value, ...patch })
  const active = value.q || value.status !== 'all' || value.city !== 'all' || value.type !== 'all' || value.missingOnly || value.from || value.to
  const sel = 'px-3 py-2 rounded-xl border-2 border-pink-100 bg-white/80 text-xs font-semibold text-purple-700 cursor-pointer'
  const STATUS_TXT: Record<string, string> = { all: 'Tous les états', cree: '📤 En attente de réception', recu: '✅ Reçus', recu_partiel: '⚠️ Reçus partiellement', annule: '✖ Annulés' }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-56">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
        <input value={value.q} onChange={e => set({ q: e.target.value })} placeholder="Rechercher : N° EXP, n° de lot, expéditeur, destinataire, N° de chèque…"
          className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-pink-100 focus:border-pink-300 bg-white/80 text-sm" />
        {value.q && <button onClick={() => set({ q: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-purple-700" title="Date de création du lot">
        📅 Du <input type="date" value={value.from} max={value.to || undefined} onChange={e => set({ from: e.target.value })} className="px-2 py-1.5 rounded-xl border-2 border-pink-100 bg-white/80 text-xs" />
        au <input type="date" value={value.to} min={value.from || undefined} onChange={e => set({ to: e.target.value })} className="px-2 py-1.5 rounded-xl border-2 border-pink-100 bg-white/80 text-xs" />
      </span>
      <select value={value.status} onChange={e => set({ status: e.target.value as any })} className={sel}>
        {(['all', ...statuses] as string[]).map(s => <option key={s} value={s}>{STATUS_TXT[s]}</option>)}
      </select>
      <select value={value.city} onChange={e => set({ city: e.target.value })} className={sel}>
        <option value="all">{cityLabel} : toutes les villes</option>
        {cities.map(c => <option key={c} value={c}>{cityLabel} {c}</option>)}
      </select>
      <select value={value.type} onChange={e => set({ type: e.target.value as any })} className={sel}>
        <option value="all">💳 Toutes les valeurs</option>
        <option value="cheque">📋 Avec chèques</option>
        <option value="traite">📝 Avec traites</option>
        <option value="especes">💵 Avec espèces</option>
      </select>
      <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-pink-100 bg-white/80 text-xs font-semibold text-red-600 cursor-pointer">
        <input type="checkbox" checked={value.missingOnly} onChange={e => set({ missingOnly: e.target.checked })} className="w-3.5 h-3.5 accent-red-600" /> Avec manquants
      </label>
      <span className="text-xs text-slate-500">{count}/{total} lot(s)</span>
      {active && <button onClick={() => onChange(EMPTY_LOT_FILTERS)} className="text-xs font-bold text-purple-600 hover:underline">Effacer les filtres</button>}
    </div>
  )
}
