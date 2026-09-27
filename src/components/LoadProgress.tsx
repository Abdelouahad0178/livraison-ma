/**
 * ⏳ Indicateur de chargement progressif « jusqu'à épuisement ».
 *
 * À utiliser partout où une page charge une plage de dates (ou une recherche) par tranches
 * successives : tant que `loading` est vrai, l'utilisateur voit un anneau de progression + le
 * nombre d'expéditions déjà reçues, pour qu'une liste encore incomplète ne soit jamais prise pour
 * le résultat final. Une fois terminé, un court « ✓ N expéditions chargées » confirme le total.
 *
 * Le texte `detail` est découpé automatiquement :
 *   « jour par jour : 14/09 (13/27 jours) — Mois de septembre 2026 (du … au …) »
 *   → jour en cours « 14/09 », progression 13/27 (anneau), période « Mois de septembre 2026 … ».
 */
import { memo, useEffect, useState } from 'react'

// 🎈 Petites phrases qui défilent pendant le chargement, pour faire patienter avec le sourire
const FUN_MESSAGES = [
  '🚚 Le camion roule à pleine vitesse…',
  '⚡ Chargement express en cours…',
  '📦 Les colis arrivent en rafale !',
  "☕ Pas le temps de finir son thé…",
  '🧮 On compte les ports à la vitesse de l’éclair…',
  '🗺️ Agadir, Casablanca, Marrakech… on y est presque !',
  '🐪 Même les chameaux sont jaloux 😉',
  '🏁 Dernière ligne droite !',
]

function useFunMessage(active: boolean) {
  const [i, setI] = useState(() => Math.floor(Math.random() * FUN_MESSAGES.length))
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setI(x => (x + 1) % FUN_MESSAGES.length), 2200)
    return () => clearInterval(t)
  }, [active])
  return FUN_MESSAGES[i]
}

/** ⚡ Compteur qui « défile » vers la vraie valeur (impression de rapidité). */
function useRollingNumber(target: number | null) {
  const [shown, setShown] = useState<number>(target ?? 0)
  useEffect(() => {
    if (target === null) return
    let raf = 0
    const start = performance.now(), from = shown, delta = target - from
    if (delta === 0) return
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450)
      setShown(Math.round(from + delta * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return shown
}

/** ⚡ Vitesse de chargement (expéditions / seconde) depuis le début du chargement. */
function useRate(active: boolean, count: number | null) {
  const [t0, setT0] = useState<number | null>(null)
  const [c0, setC0] = useState<number>(0)
  useEffect(() => {
    if (active && t0 === null) { setT0(Date.now()); setC0(count ?? 0) }
    if (!active && t0 !== null) setT0(null)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!active || t0 === null || count === null) return null
  const secs = (Date.now() - t0) / 1000
  if (secs < 0.8) return null
  const rate = Math.round((count - c0) / secs)
  return rate > 0 ? rate : null
}

interface LoadProgressProps {
  /** Chargement encore en cours (d'autres tranches vont arriver). */
  loading: boolean
  /** Nombre d'éléments déjà reçus (optionnel : sans compteur, seul le spinner est affiché). */
  count?: number
  /** Nom des éléments comptés (défaut : « expéditions »). */
  noun?: string
  /** Accord du participe (défaut : « chargées », ex. « chargés » pour « ports en compte »). */
  loadedWord?: string
  /** Afficher aussi le message « ✓ N … chargées » une fois le chargement terminé (défaut : true). */
  showDone?: boolean
  /** Texte additionnel (ex. la période concernée). */
  detail?: string
  className?: string
}

/** Extrait « jour courant », « x/y » et le reste (période) du texte détail. */
function parseDetail(detail?: string) {
  if (!detail) return { day: null as string | null, done: null as number | null, total: null as number | null, rest: [] as string[] }
  const parts = detail.split(' — ').map(s => s.trim()).filter(Boolean)
  let day: string | null = null, done: number | null = null, total: number | null = null
  const rest: string[] = []
  for (const part of parts) {
    const m = part.match(/(\d{1,2}\/\d{1,2})?\s*\((?:jour\s*)?(\d+)\s*\/\s*(\d+)(?:\s*jours?)?\)/i)
    if (m && done === null) {
      day = m[1] || null
      done = parseInt(m[2], 10)
      total = parseInt(m[3], 10)
    } else {
      rest.push(part)
    }
  }
  return { day, done, total, rest }
}

function Ring({ pct }: { pct: number | null }) {
  const r = 16, c = 2 * Math.PI * r
  if (pct === null) {
    return (
      <span className="relative inline-flex w-10 h-10 shrink-0">
        <span className="absolute inset-0 rounded-full border-[3px] border-indigo-100" />
        <span className="absolute inset-0 rounded-full border-[3px] border-indigo-500 border-t-transparent animate-spin" />
      </span>
    )
  }
  return (
    <span className="relative inline-flex items-center justify-center w-10 h-10 shrink-0">
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-indigo-100" />
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className="stroke-indigo-500 transition-[stroke-dashoffset] duration-500 ease-out"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute text-[10px] font-extrabold text-indigo-700">{Math.round(pct)}%</span>
    </span>
  )
}

// ⚡ memo : l'animation (compteur défilant, messages) ne vit que dans ce composant ; il ne se
// re-rend avec la page que si ses props changent.
export default memo(LoadProgress)

function LoadProgress({
  loading,
  count,
  noun = 'expéditions',
  loadedWord = 'chargées',
  showDone = true,
  detail,
  className = '',
}: LoadProgressProps) {
  const n = typeof count === 'number' ? count.toLocaleString('fr-MA') : null
  const fun = useFunMessage(loading)
  const rolled = useRollingNumber(typeof count === 'number' ? count : null)
  const rate = useRate(loading, typeof count === 'number' ? count : null)

  if (loading) {
    const { day, done, total, rest } = parseDetail(detail)
    const pct = done !== null && total ? Math.min(100, (done / total) * 100) : null
    return (
      <div
        role="status"
        aria-live="polite"
        className={`inline-flex max-w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-indigo-50 via-white to-sky-50 border border-indigo-100 shadow-sm pl-2 pr-4 py-2 ${className}`}
      >
        <Ring pct={pct} />
        <div className="min-w-0 flex flex-col leading-tight">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">Chargement</span>
            {n !== null && (
              <span className="text-sm font-extrabold text-indigo-800 tabular-nums">
                {rolled.toLocaleString('fr-MA')} <span className="font-semibold text-indigo-600">{noun} {loadedWord}</span>
              </span>
            )}
            {rate !== null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400 text-white text-[11px] font-extrabold px-2 py-0.5 shadow-sm lp-pulse tabular-nums">
                ⚡ {rate.toLocaleString('fr-MA')}/s
              </span>
            )}
            {day && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5">
                📅 {day}
              </span>
            )}
            {done !== null && total !== null && (
              <span className="inline-flex items-center rounded-full bg-white border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2 py-0.5 tabular-nums">
                {done}/{total} jours
              </span>
            )}
          </div>
          {rest.length > 0 && (
            <span className="text-[11px] text-slate-500 truncate">{rest.join(' — ')}</span>
          )}
          {/* 🚚 Route : le camion avance avec la progression (ou fait des allers-retours sans %) */}
          <div className="relative mt-1 h-3.5 w-full min-w-[160px] max-w-[320px] rounded-full bg-indigo-50 border border-indigo-100 overflow-hidden">
            {pct !== null && (
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-300 via-sky-300 to-indigo-300 lp-shimmer transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
            )}
            <span
              className={`absolute top-1/2 -translate-y-1/2 text-[11px] leading-none ${pct === null ? 'lp-truck-roam' : 'transition-[left] duration-300 ease-out'}`}
              style={pct === null ? undefined : { left: `calc(${pct}% - 12px)` }}
            ><span className="lp-speed">💨</span><span className="inline-block lp-bounce">🚚</span></span>
          </div>
          <span key={fun} className="lp-fade text-[11px] italic text-indigo-500 mt-0.5 truncate">{fun}</span>
        </div>
        <style>{`
          @keyframes lpRoam { 0% { left: -14px } 100% { left: calc(100% + 4px) } }
          .lp-truck-roam { animation: lpRoam 1.3s linear infinite; }
          @keyframes lpShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
          .lp-shimmer { background-size: 200% 100%; animation: lpShimmer 0.9s linear infinite; }
          @keyframes lpBounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
          .lp-bounce { animation: lpBounce .25s ease-in-out infinite; }
          @keyframes lpSpeed { 0% { opacity: .9; margin-right: 0 } 100% { opacity: 0; margin-right: 6px } }
          .lp-speed { display: inline-block; font-size: 9px; animation: lpSpeed .4s ease-out infinite; }
          @keyframes lpPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }
          .lp-pulse { animation: lpPulse .8s ease-in-out infinite; }
          @keyframes lpFade { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: none } }
          .lp-fade { animation: lpFade .4s ease-out; }
        `}</style>
      </div>
    )
  }

  if (!showDone || n === null) return null
  const { rest } = parseDetail(detail)
  return (
    <div className={`inline-flex max-w-full items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 shadow-sm pl-1.5 pr-4 py-1.5 ${className}`}>
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-bold shrink-0">✓</span>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-sm font-extrabold text-emerald-800 tabular-nums">
          {n} <span className="font-semibold text-emerald-700">{noun} {loadedWord}</span>
        </span>
        {rest.length > 0 && <span className="text-[11px] text-slate-500 truncate">{rest.join(' — ')}</span>}
      </div>
    </div>
  )
}
