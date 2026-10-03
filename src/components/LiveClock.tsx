import { useEffect, useRef } from 'react'

interface LiveClockProps { className?: string }

const p = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`

// ⚡ L'horloge s'écrit DIRECTEMENT dans le DOM (pas de useState). Avant, un setState chaque
// seconde déclenchait un rendu React prioritaire qui INTERROMPAIT et faisait recommencer à zéro
// les recalculs en arrière-plan (useDeferredValue/startTransition) des grandes listes : sur une
// période chargée (ex. « Mois » + Encaiss. espèces, ≈15 000 expéditions), le recalcul ne
// finissait jamais avant le tic suivant → « Mise à jour… » restait affiché, puis React le
// forçait en bloquant la page (au bout de 5 s).
export default function LiveClock({ className = '' }: Readonly<LiveClockProps>) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const tick = () => { if (ref.current) ref.current.textContent = fmt(new Date()) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span ref={ref} className={`font-mono tabular-nums text-xs select-none ${className}`}>
      {fmt(new Date())}
    </span>
  )
}
