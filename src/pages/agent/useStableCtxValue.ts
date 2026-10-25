import { useRef } from 'react'

// ⚡ VALEUR DU CONTEXTE AgentCtx STABILISÉE — avant, l'objet partagé (≈ 400 entrées) était recréé à CHAQUE
// rendu de la page : tout onglet ouvert (ParcelsTab ≈ 6 900 lignes) se redessinait entièrement, même pour un
// changement d'état qu'il n'utilise pas (message, expéditions perdues, jeton d'authentification…).
//
// Règle (aucun changement de comportement) :
// - l'objet est RÉUTILISÉ tant que toutes ses valeurs non-fonctions sont identiques (Object.is) ET que les
//   états cachés (`extraDeps` : états de la page lus par les fonctions du contexte mais absents du contexte,
//   ex. droits de modification) sont identiques ;
// - les fonctions sont remplacées par des relais qui appellent TOUJOURS la version du dernier rendu : même
//   réutilisé, le contexte n'exécute jamais une fonction périmée ;
// - dès qu'une valeur change, un nouvel objet est créé avec de NOUVEAUX relais (identités changées comme
//   avant) : les useMemo / useEffect des onglets qui dépendent d'une fonction se recalculent comme avant.

/**
 * Même valeur pour l'affichage : identique (Object.is), ou TABLEAU recalculé à l'identique (mêmes éléments,
 * même ordre — ex. `allUsers.filter(…)` refait à chaque rendu de la page). Les éléments sont comparés par
 * identité : un élément modifié = nouvel objet = différence détectée. Les objets restent comparés par identité.
 */
export function sameCtxEntry(x: any, y: any): boolean {
  if (Object.is(x, y)) return true
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return false
    return true
  }
  return false
}

/** Mêmes clés et mêmes valeurs non-fonctions (les fonctions sont ignorées : relayées vers la dernière version). */
export function sameNonFunctionValues(a: Record<string, any>, b: Record<string, any>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (!(k in b)) return false
    const x = a[k]
    const y = b[k]
    if (typeof x === 'function' && typeof y === 'function') continue
    if (!sameCtxEntry(x, y)) return false
  }
  return true
}

export function sameDeps(a: readonly any[], b: readonly any[]): boolean {
  return a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
}

/** Construit la valeur exposée : chaque fonction devient un relais vers `latest.current[clé]`. */
export function buildRelayedValue<T extends Record<string, any>>(raw: T, latest: { current: Record<string, any> }): T {
  const out: Record<string, any> = {}
  for (const k of Object.keys(raw)) {
    const v = raw[k]
    out[k] = typeof v === 'function' ? (...args: any[]) => latest.current[k](...args) : v
  }
  return out as T
}

export function useStableCtxValue<T extends Record<string, any>>(raw: T, extraDeps: readonly any[]): T {
  // Écrit pendant le rendu (comme _s.current dans AgentPage) : un onglet qui appelle une fonction du contexte
  // pendant SON rendu (juste après celui de la page) obtient la version de ce rendu.
  const latest = useRef<Record<string, any>>(raw)
  latest.current = raw
  const memo = useRef<{ raw: T; deps: readonly any[]; value: T } | null>(null)
  const m = memo.current
  if (m && sameNonFunctionValues(m.raw, raw) && sameDeps(m.deps, extraDeps)) {
    m.raw = raw
    return m.value
  }
  const value = buildRelayedValue(raw, latest)
  memo.current = { raw, deps: extraDeps, value }
  return value
}
