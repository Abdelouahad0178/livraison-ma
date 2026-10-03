import { startTransition, useEffect, useState } from 'react'

/**
 * ⏳ Petit « store » de progression de chargement, HORS de l'état React de la page.
 *
 * Le chargement jour par jour met à jour sa progression à CHAQUE journée reçue. Si ce compteur
 * vivait dans un useState de la page Chef d'agence (AgentPage), chaque journée re-rendait toute
 * la page + l'onglet Expéditions (≈ 6 000 lignes, filtres/totaux) juste pour avancer une jauge.
 * Ici seul le composant qui affiche la jauge (useLoadProgress) se re-rend.
 */
export interface LoadProgressState {
  /** Expéditions reçues depuis le début du chargement. */
  loaded: number
  /** Journée en cours (null hors chargement jour par jour). */
  day: { done: number; total: number; label: string } | null
}

export interface LoadProgressStore {
  get: () => LoadProgressState
  set: (patch: Partial<LoadProgressState>) => void
  reset: () => void
  subscribe: (fn: () => void) => () => void
}

const INITIAL: LoadProgressState = { loaded: 0, day: null }

export function createLoadProgressStore(): LoadProgressStore {
  let state = INITIAL
  const subs = new Set<() => void>()
  const emit = () => subs.forEach(fn => fn())
  return {
    get: () => state,
    set: patch => { state = { ...state, ...patch }; emit() },
    reset: () => { if (state !== INITIAL) { state = INITIAL; emit() } },
    subscribe: fn => { subs.add(fn); return () => { subs.delete(fn) } },
  }
}

/**
 * ⚠️ Pas de useSyncExternalStore ici : ses mises à jour sont TOUJOURS synchrones (SyncLane) et
 * chaque journée reçue interrompait puis faisait recommencer à zéro le recalcul en arrière-plan
 * (useDeferredValue / startTransition) de la liste et des totaux de l'onglet Expéditions → le
 * badge « Mise à jour… » ne disparaissait pas pendant tout le chargement et React finissait par
 * forcer le calcul en bloquant la page. La jauge est donc mise à jour en priorité de TRANSITION
 * (jamais devant un clic ni devant le recalcul des filtres), au plus toutes les 250 ms.
 */
export function useLoadProgress(store: LoadProgressStore | null | undefined): LoadProgressState {
  const [state, setState] = useState<LoadProgressState>(() => (store ? store.get() : INITIAL))
  useEffect(() => {
    if (!store) { setState(INITIAL); return }
    let timer: ReturnType<typeof setTimeout> | null = null
    let last = 0
    const push = () => {
      timer = null
      last = Date.now()
      const next = store.get()
      startTransition(() => setState(prev => (prev === next ? prev : next)))
    }
    const onChange = () => {
      if (timer) return
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - last))
      timer = setTimeout(push, wait)
    }
    push()
    const unsub = store.subscribe(onChange)
    return () => { unsub(); if (timer) clearTimeout(timer) }
  }, [store])
  return state
}
const THROTTLE_MS = 250
