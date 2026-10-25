/**
 * ↔️ Empêche le balayage horizontal (pavé tactile / souris) et les boutons de navigation de la souris de faire
 * « page précédente / suivante » du navigateur (sortie du site).
 * Complète le CSS `overscroll-behavior-x` (ignoré par certains navigateurs, ex. Safari sur Mac) :
 * un geste horizontal est BLOQUÉ seulement quand aucune zone sous le curseur ne peut encore défiler dans ce sens —
 * le défilement normal des tableaux n'est jamais gêné.
 */
function canScrollX(start: EventTarget | null, dx: number): boolean {
  for (let n = start instanceof Element ? start : null; n && n !== document.documentElement; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue
    const ox = getComputedStyle(n).overflowX
    if (ox !== 'auto' && ox !== 'scroll') continue
    if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true
  }
  return false
}

let installed = false
export function blockSwipeNavigation() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('wheel', (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || e.deltaX === 0) return // geste vertical : rien à faire
    if (!canScrollX(e.target, e.deltaX)) e.preventDefault()               // plus rien à défiler : pas de navigation
  }, { passive: false })

  // 🖱️ Boutons « précédent / suivant » de la souris (boutons latéraux, molette inclinée réglée ainsi par le
  // pilote) : ignorés dans le site — le navigateur ne quitte plus la page.
  const blockMouseNav = (e: MouseEvent) => { if (e.button === 3 || e.button === 4) { e.preventDefault(); e.stopPropagation() } }
  for (const t of ['mousedown', 'mouseup', 'auxclick'] as const) window.addEventListener(t, blockMouseNav, true)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'BrowserBack' || e.key === 'BrowserForward') e.preventDefault()
  }, true)

  installHistoryGuard()
}

/**
 * 🛡️ Garde-fou de l'historique : si un geste (souris, pavé tactile, touche) fait quand même « page précédente »
 * jusqu'AVANT la première page du site, la page revient aussitôt en avant — on ne sort plus du site.
 * Au 1er clic / 1re touche (activation requise : sinon le navigateur ignore l'entrée ajoutée), l'entrée actuelle
 * est marquée « base » et une entrée « garde » identique (même adresse, même état du routeur) est ajoutée par-dessus.
 * Le retour arrière dans le site (entre pages) fonctionne comme avant.
 */
function installHistoryGuard() {
  const arm = () => {
    window.removeEventListener('pointerdown', arm, true)
    window.removeEventListener('keydown', arm, true)
    const st = history.state || {}
    if (st.bgGuard || st.bgBase) return // déjà en place (page rechargée)
    try {
      history.replaceState({ ...st, bgBase: true }, '', location.href)
      history.pushState({ ...st, bgGuard: true }, '', location.href)
    } catch { /* historique indisponible : rien */ }
  }
  window.addEventListener('pointerdown', arm, true)
  window.addEventListener('keydown', arm, true)
  window.addEventListener('popstate', () => {
    if (!history.state?.bgBase) return
    history.go(1) // revenir sur l'entrée « garde » : on reste dans le site
    import('./toast').then(({ showToast }) => showToast('Retour arrière bloqué : vous restez sur BG Express.', 'success', 3000)).catch(() => {})
  })
}
