import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { opDayOf, opStart } from '../utils/daySlices'
import { MONEY_START } from '../utils/moneyFlow'
import { subscribeRecentCollected, type RecentCollectedState } from '../firebase/recentCollectedStore'
import { createdOutsidePeriod, hasOutsideRanges } from '../utils/recentCollected'
import { recentCollectDays } from '../config/siteDelays'

const EMPTY: RecentCollectedState = { docs: [], ready: false }

/**
 * 🧾 Expéditions de l'agence COLLECTÉES ou REÇUES pendant les 14 dernières journées, mais CRÉÉES EN DEHORS de la
 * période chargée par la page ([loadedFrom, loadedTo]) — celles de la période sont déjà chargées.
 * Sans elles, une expédition du 07/10 collectée aujourd'hui manquait dans la carte du jour dès que la période
 * affichée ne contenait pas le 07/10. Version allégée (parcelsLite), en temps réel.
 * ⚡ (24/10/2026) Ensemble gardé en mémoire et dans le navigateur, rattrapé puis vérifié à chaque ouverture
 * (firebase/recentCollectedStore) : plus de relecture complète (Agadir : 7 Mo) à chaque ouverture ni à chaque
 * changement de période — la période ne fait que filtrer l'ensemble.
 * `enabled` : la page a le droit de lire ; `pageLoaded` : sa période est chargée. Sur téléphone, la lecture attend
 * la période puis un moment libre du navigateur ; sur PC, elle part tout de suite.
 * (31/10/2026, mesuré : partir tout de suite sur téléphone même avec une mémoire récente retardait la liste des
 * livreurs de ~2,5 s pour 1,5 s gagnée ici → gardé tel quel.)
 */
export function useRecentCollected(city: string | undefined | null, loadedFrom: Date | null, loadedTo: Date | null, enabled = true, pageLoaded = true,
  windowMode: 'start' | 'recent' = 'start') {
  const fromMs = loadedFrom ? loadedFrom.getTime() : 0
  const toMs = loadedTo ? loadedTo.getTime() : 0
  // Départ de la fenêtre (journée d'opération) — 'start' : depuis le 05/10 (Caisse Agence : une journée non versée de
  // plus de 14 jours reste visible et versable) ; 'recent' (chef d'exploitation, 01/11/2026) : ses cartes ne montrent que
  // les 14 dernières journées (+ la période choisie) → fenêtre BORNÉE (avant : tout depuis le 05/10, qui grossissait
  // chaque jour — Agadir ≈ 16 Mo à chaque ouverture).
  const today = opDayOf(new Date())
  const sinceMs = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    const dayStart = (back: number) => {
      const x = new Date(y, m - 1, d - back)
      return opStart(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`)
    }
    const since14 = dayStart(recentCollectDays() - 1)
    if (windowMode === 'start') return (MONEY_START < since14 ? MONEY_START : since14).getTime()
    // + 7 jours de marge (jours sans collecte) ; période choisie plus longue (« Tout ») : couverte
    let s = dayStart(recentCollectDays() - 1 + 7).getTime()
    if (fromMs && fromMs < s) s = fromMs
    return Math.max(s, MONEY_START.getTime())
  }, [today, windowMode, fromMs])
  const desktop = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 1024px)').matches
  const go = enabled && !!city && (pageLoaded || desktop)
  const needed = hasOutsideRanges(fromMs, toMs)

  // Téléphone : la lecture (lourde au premier passage) attend que le navigateur soit libre
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!go) { setIdle(false); return }
    if (desktop) { setIdle(true); return }
    const w = window as any
    const done = () => setIdle(true)
    const id = w.requestIdleCallback ? w.requestIdleCallback(done, { timeout: 2500 }) : setTimeout(done, 800)
    return () => { if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id) }
  }, [go, desktop])

  const [state, setState] = useState<RecentCollectedState>(EMPTY)
  const [timedOut, setTimedOut] = useState(false)
  const shownCity = useRef<string | null | undefined>(null)
  useEffect(() => {
    // Même ville : les chiffres déjà affichés restent (pas de trou pendant le rattrapage), seulement « pas prêt »
    setState(prev => (shownCity.current === city && prev.docs.length ? { docs: prev.docs, ready: false } : EMPTY))
    shownCity.current = city
    setTimedOut(false)
    if (!go || !idle || !needed || !city) return
    // Filet de sécurité (réseau coupé) : prêt au bout de 30 s au plus
    const safety = setTimeout(() => setTimedOut(true), 30000)
    const unsub = subscribeRecentCollected(city, sinceMs, s => startTransition(() => setState(s)))
    return () => { clearTimeout(safety); unsub() }
  }, [city, go, idle, needed, sinceMs])

  const docs = useMemo(
    () => (needed ? state.docs.filter(p => createdOutsidePeriod(p, fromMs, toMs)) : []),
    [state.docs, needed, fromMs, toMs],
  )
  // Rien hors période (période ouverte sans début) : complet dès que la lecture est autorisée, comme avant
  const ready = go && idle && (!needed || state.ready || timedOut)
  return { docs, ready }
}
