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
  tone?: 'blue' | 'green' | 'amber'
  /** Remplace "Jour précis" par "Journée d'opération" (8h → 6h lendemain). */
  operationalMode?: boolean
  operationalDay?: Date | null
  onOperationalDayChange?: (d: Date | null) => void
}

export default function DateFilter({
  value, onChange, from, onFromChange, to, onToChange, tone = 'blue',
  operationalMode = false, operationalDay, onOperationalDayChange,
}: DateFilterProps) {
  const activeCls = tone === 'green' ? 'bg-green-600 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
  const focusCls  = tone === 'green' ? 'focus:border-green-500' : tone === 'amber' ? 'focus:border-amber-500' : 'focus:border-blue-500'
  const presets = operationalMode ? OPERATIONAL_FILTER_PRESETS : FILTER_PRESETS
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        {presets.map(({ key, label }) => (
          <button key={key}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              value === key ? activeCls : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {operationalMode && value === 'operational' && (
        <div className="flex items-center gap-2 pl-6">
          <span className="text-xs text-gray-400 shrink-0">Jour d'opération (8h → 6h lendemain)</span>
          <input type="date" value={toLocalDateInput(operationalDay)}
            onChange={e => onOperationalDayChange?.(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
      {!operationalMode && value === 'day' && (
        <div className="flex items-center gap-2 pl-6">
          <input type="date" value={from} onChange={e => onFromChange?.(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
      {value === 'custom' && (
        <div className="flex items-center gap-2 pl-6">
          <input type="date" value={from} onChange={e => onFromChange?.(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
          <span className="text-gray-400 text-xs shrink-0">→</span>
          <input type="date" value={to} onChange={e => onToChange?.(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
    </div>
  )
}
