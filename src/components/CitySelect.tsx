import { ChevronDown } from 'lucide-react'
import { CITIES } from '../firebase/constants'

/**
 * 🏙️ Choix d'une ville parmi les villes du site (jamais de texte libre : une ville tapée à la main, ex. « taroudante »,
 * n'existe dans aucune agence). Une ancienne valeur hors liste reste affichée (« hors liste ») tant qu'on ne la change pas.
 */
export function CitySelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const v = value || ''
  const outside = !!v && !(CITIES as readonly string[]).includes(v)
  return (
    <div className="relative">
      <select value={v} onChange={e => onChange(e.target.value)}
        className={className || 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400'}>
        {!v && <option value="">— Choisir —</option>}
        {outside && <option value={v}>{v} (hors liste)</option>}
        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  )
}
