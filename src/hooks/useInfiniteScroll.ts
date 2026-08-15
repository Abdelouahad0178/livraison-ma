import { useEffect, useRef } from 'react'

/**
 * ⚡ Hook pour lazy loading automatique au scroll
 *
 * Détecte quand l'utilisateur arrive près du bas de la page
 * et déclenche automatiquement le chargement de plus de données
 */
export function useInfiniteScroll(
  callback: () => void,
  options: {
    /** Activer/désactiver le hook */
    enabled?: boolean
    /** Distance du bas en pixels pour déclencher le chargement (défaut: 500px) */
    threshold?: number
    /** Cooldown entre deux déclenchements en ms (défaut: 1000ms) */
    cooldown?: number
  } = {}
) {
  const {
    enabled = true,
    threshold = 500,
    cooldown = 1000,
  } = options

  const lastTriggeredRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleScroll = () => {
      // Calculer distance du bas
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = document.documentElement.clientHeight
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)

      // Vérifier cooldown
      const now = Date.now()
      const timeSinceLastTrigger = now - lastTriggeredRef.current

      // Si proche du bas ET cooldown passé → charger plus
      if (distanceFromBottom < threshold && timeSinceLastTrigger > cooldown) {
        console.log(`⚡ Auto-loading: ${Math.round(distanceFromBottom)}px du bas`)
        lastTriggeredRef.current = now
        callback()
      }
    }

    // Écouter le scroll
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Nettoyage
    return () => window.removeEventListener('scroll', handleScroll)
  }, [enabled, threshold, cooldown, callback])
}
