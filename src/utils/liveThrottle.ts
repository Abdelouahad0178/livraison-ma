// ⏱️ Cadence des mises à jour TEMPS RÉEL envoyées à une page (listes d'expéditions écoutées).
//
// - Pendant le chargement initial (pas encore « posé ») : comportement historique — chaque
//   événement repousse la mise à jour (60 ms si urgente, sinon au plus une toutes les 800 ms
//   pendant la lecture des journées passées). Le premier affichage reste donc immédiat.
// - Une fois le chargement initial terminé : au plus UNE mise à jour par seconde. Une mise à jour
//   déjà programmée n'est PAS repoussée (pas de famine si les événements s'enchaînent) et, comme
//   elle lit l'état courant au moment où elle part, le DERNIER état est toujours livré (appel final
//   garanti).
//
// Fonction pure (testée dans liveThrottle.test.ts) : l'appelant gère le minuteur.

export const LIVE_THROTTLE_MS = 1000
export const LIVE_URGENT_MS = 60
export const LIVE_LOADING_MS = 800

export type LiveEmitPlan =
  | { action: 'keep' }                      // une mise à jour est déjà programmée : la garder
  | { action: 'schedule'; delay: number }   // (re)programmer la mise à jour dans `delay` ms

export function planLiveEmit(opts: {
  settled: boolean       // chargement initial terminé (au moins une mise à jour complète livrée)
  timerPending: boolean  // une mise à jour est déjà programmée
  lastEmit: number       // horodatage (ms) de la dernière mise à jour livrée (0 si aucune)
  now: number
  urgent?: boolean
}): LiveEmitPlan {
  const elapsed = opts.now - opts.lastEmit
  if (!opts.settled) {
    // Comportement historique (annule et reprogramme)
    const delay = opts.urgent ? LIVE_URGENT_MS : Math.max(LIVE_URGENT_MS, LIVE_LOADING_MS - elapsed)
    return { action: 'schedule', delay }
  }
  if (opts.timerPending) return { action: 'keep' }
  return { action: 'schedule', delay: Math.max(LIVE_URGENT_MS, LIVE_THROTTLE_MS - elapsed) }
}
