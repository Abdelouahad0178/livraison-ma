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

interface DateFilterProps {
  value: DateFilterPreset
  onChange: (v: DateFilterPreset) => void
  from?: string
  onFromChange?: (v: string) => void
  to?: string
  onToChange?: (v: string) => void
  tone?: 'blue' | 'green' | 'amber'
}

export default function DateFilter({ value, onChange, from, onFromChange, to, onToChange, tone = 'blue' }: DateFilterProps) {
  const activeCls = tone === 'green' ? 'bg-green-600 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
  const focusCls  = tone === 'green' ? 'focus:border-green-500' : tone === 'amber' ? 'focus:border-amber-500' : 'focus:border-blue-500'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        {FILTER_PRESETS.map(({ key, label }) => (
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
      {value === 'day' && (
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
