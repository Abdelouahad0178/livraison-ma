import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Enveloppe un tableau/contenu scrollable horizontalement avec deux flèches flottantes
 * (gauche/droite) qui restent visibles pendant le scroll sans perturber l'affichage des
 * données : les flèches sont en `position: fixed`, alignées en continu sur les bords
 * gauche/droite du tableau et centrées verticalement dans la fenêtre — donc TOUJOURS
 * affichées à l'écran (même en défilant la page), tant qu'une partie du tableau reste
 * visible dans le viewport. Le scroll réel se fait sur le conteneur interne
 * (overflow-x-auto) inchangé.
 *
 * Usage : remplacer `<div className="overflow-x-auto">...table...</div>` par
 * `<HScrollArrows><table>...</table></HScrollArrows>` (le wrapper applique lui-même
 * overflow-x-auto au conteneur interne).
 */
export default function HScrollArrows({ children, className = '' }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [inView, setInView] = useState(false)
  const [rect, setRect] = useState<{ left: number; right: number } | null>(null)

  const updateArrows = () => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  const updateRect = () => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ left: r.left, right: window.innerWidth - r.right })
  }

  useEffect(() => {
    updateArrows()
    updateRect()
    const el = scrollRef.current
    if (!el) return

    // ⚠️ ResizeObserver sur `el` seul ne détecte QUE les changements de largeur du conteneur
    // (fixe, 100% du parent) — jamais ceux de son CONTENU (le tableau qui grandit quand les
    // données arrivent). On observe donc aussi le premier enfant (le tableau) pour détecter
    // les changements de scrollWidth, et un MutationObserver en filet de sécurité pour les cas
    // où seul le nombre de colonnes/texte change sans changer la hauteur/largeur observée.
    const ro = new ResizeObserver(() => { updateArrows(); updateRect() })
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    const mo = new MutationObserver(() => { updateArrows(); updateRect() })
    mo.observe(el, { childList: true, subtree: true, characterData: true })

    // 👀 Les flèches restent affichées tant qu'une partie du tableau est visible à l'écran
    // (même 1px), pas seulement quand il est entièrement dans le viewport.
    const io = new IntersectionObserver(entries => {
      setInView(entries[0]?.isIntersecting ?? false)
    }, { threshold: 0 })
    io.observe(el)

    const onScrollOrResize = () => { updateArrows(); updateRect() }
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
    window.addEventListener('resize', onScrollOrResize)

    const t1 = setTimeout(onScrollOrResize, 150)
    const t2 = setTimeout(onScrollOrResize, 600)

    return () => {
      ro.disconnect()
      mo.disconnect()
      io.disconnect()
      clearTimeout(t1)
      clearTimeout(t2)
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [children])

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const showLeft = canLeft && inView && rect
  const showRight = canRight && inView && rect

  return (
    <div className="relative">
      <div ref={scrollRef} className={`overflow-x-auto ${className}`}>
        {children}
      </div>

      {showLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Défiler à gauche"
          style={{ position: 'fixed', left: rect!.left + 4, top: '50vh' }}
          className="print:hidden -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/95 border border-gray-300 shadow-lg text-gray-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition z-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {showRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Défiler à droite"
          style={{ position: 'fixed', right: rect!.right + 4, top: '50vh' }}
          className="print:hidden -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/95 border border-gray-300 shadow-lg text-gray-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition z-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
