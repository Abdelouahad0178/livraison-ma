import { useEffect, useState } from 'react'
import DateInput from '../../components/DateInput'
import { Calendar } from 'lucide-react'
import type { DateFilterPreset } from '../../types'

const FILTER_PRESETS: { key: DateFilterPreset; label: string }[] = [
  { key: 'all',    label: 'Tout' },
  { key: 'today',  label: "Aujourd'hui" },
  { key: 'week',   label: '7 jours' },
  { key: 'month',  label: 'Ce mois' },
  { key: 'day',    label: 'Jour précis' },
  { key: 'custom', label: 'Période' },
]

// ⚠️ Variante avec la journée opérationnelle (8h → 6h lendemain) à la place du "Jour précis".
// Opt-in via la prop `operationalMode` : ne change rien pour les autres pages qui utilisent
// ce composant partagé sans cette prop.
const OPERATIONAL_FILTER_PRESETS: { key: DateFilterPreset; label: string }[] = [
  { key: 'all',    label: 'Tout' },
  { key: 'today',  label: "Aujourd'hui" },
  { key: 'week',   label: '7 jours' },
  { key: 'month',  label: 'Ce mois' },
  { key: 'operational', label: "🗓️ Journée d'opération" },
  { key: 'custom', label: 'Période' },
]

const toLocalDateInput = (d?: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''

interface DateFilterProps {
  value: DateFilterPreset
  onChange: (v: DateFilterPreset) => void
  from?: string
  onFromChange?: (v: string) => void
  to?: string
  onToChange?: (v: string) => void
  tone?: 'blue' | 'green' | 'amber' | 'violet'
  /** Sans cadre (carte) : à intégrer dans un panneau existant. Par défaut : cadre blanc habituel. */
  bare?: boolean
  /** Remplace "Jour précis" par "Journée d'opération" (8h → 6h lendemain). */
  operationalMode?: boolean
  operationalDay?: Date | null
  onOperationalDayChange?: (d: Date | null) => void
}

export default function DateFilter({
  value, onChange, from, onFromChange, to, onToChange, tone = 'blue',
  operationalMode = false, operationalDay, onOperationalDayChange, bare = false,
}: DateFilterProps) {
  const activeCls = tone === 'green' ? 'bg-green-600 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : tone === 'violet' ? 'bg-violet-600 text-white shadow-sm' : 'bg-blue-600 text-white'
  const focusCls  = tone === 'green' ? 'focus:border-green-500' : tone === 'amber' ? 'focus:border-amber-500' : tone === 'violet' ? 'focus:border-violet-500' : 'focus:border-blue-500'
  const presets = operationalMode ? OPERATIONAL_FILTER_PRESETS : FILTER_PRESETS
  // 📅 « Période » : la recherche ne part qu'une fois les DEUX dates choisies (et dans l'ordre). D'ici là,
  // les dates restent en brouillon ici et la période précédente reste appliquée sur la page.
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null)
  // Période changée ailleurs (réinitialisation, raccourci…) : brouillon abandonné
  useEffect(() => { setDraft(null) }, [value, from, to])
  const showCustom = value === 'custom' || draft !== null
  const pickPreset = (key: DateFilterPreset) => {
    if (key === 'custom') { if (value !== 'custom') setDraft({ from: from || '', to: to || '' }); return }
    setDraft(null)
    onChange(key)
  }
  const editPeriod = (part: 'from' | 'to', v: string) => {
    const next = { from: draft ? draft.from : (from || ''), to: draft ? draft.to : (to || ''), [part]: v }
    if (next.from && next.to && next.from <= next.to) {
      onFromChange?.(next.from)
      onToChange?.(next.to)
      if (value !== 'custom') onChange('custom')
      setDraft(null)
    } else setDraft(next)
  }
  return (
    <div className={bare ? 'space-y-2' : 'bg-white border border-gray-200 rounded-xl p-3 space-y-2'}>
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        {presets.map(({ key, label }) => (
          <button key={key}
            onClick={() => pickPreset(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              (draft ? key === 'custom' : value === key) ? activeCls : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {operationalMode && value === 'operational' && !draft && (
        <div className="flex items-center gap-2 pl-6">
          <span className="text-xs text-gray-400 shrink-0">Jour d'opération (8h → 6h lendemain)</span>
          <DateInput value={toLocalDateInput(operationalDay)}
            onChange={e => onOperationalDayChange?.(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
      {!operationalMode && value === 'day' && !draft && (
        <div className="flex items-center gap-2 pl-6">
          <DateInput value={from} onChange={e => onFromChange?.(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
      {showCustom && (
        <div className="flex items-center gap-2 pl-6">
          <DateInput value={draft ? draft.from : from} onChange={e => editPeriod('from', e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
          <span className="text-gray-400 text-xs shrink-0">→</span>
          <DateInput value={draft ? draft.to : to} onChange={e => editPeriod('to', e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
      {draft && (
        <p className="pl-6 text-[11px] text-amber-700">
          {draft.from && draft.to && draft.from > draft.to
            ? '⚠️ La date de début doit précéder la date de fin.'
            : 'Choisissez les deux dates : la recherche se lance ensuite.'}
        </p>
      )}
    </div>
  )
}
