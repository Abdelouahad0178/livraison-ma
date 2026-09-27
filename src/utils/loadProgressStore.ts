import { useSyncExternalStore } from 'react'

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

export function useLoadProgress(store: LoadProgressStore | null | undefined): LoadProgressState {
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : getInitial,
  )
}
const noopSubscribe = () => () => {}
const getInitial = () => INITIAL
