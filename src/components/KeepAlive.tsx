import { Suspense, type ReactNode } from 'react'

/**
 * 🧊 Onglet GARDÉ en mémoire (23/10/2026) : une fois ouvert, l'onglet n'est plus démonté quand on passe à un autre —
 * ses écoutes de données, ses filtres (période, recherche, livreur…) et son défilement sont conservés : revenir sur
 * l'onglet ne relance AUCUN chargement.
 * Caché, il est « gelé » (même principe que react-freeze) : React suspend ce sous-arbre — il est masqué, ne se
 * redessine plus (aucun calcul inutile), mais son état et ses useEffect (écoutes temps réel) restent actifs ;
 * à son retour, il se redessine une fois avec les données à jour.
 */
const NEVER = new Promise<never>(() => {})
function Suspender({ frozen, children }: Readonly<{ frozen: boolean; children: ReactNode }>) {
  if (frozen) throw NEVER
  return <>{children}</>
}

export default function KeepAlive({ active, visited, children }: Readonly<{ active: boolean; visited: boolean; children: ReactNode }>) {
  if (!active && !visited) return null // jamais ouvert : rien de monté (aucun chargement au démarrage)
  return (
    <Suspense fallback={null}>
      <Suspender frozen={!active}>{children}</Suspender>
    </Suspense>
  )
}
