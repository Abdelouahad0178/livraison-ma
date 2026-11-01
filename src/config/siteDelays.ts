/**
 * ⏱️ DURÉES RÉGLABLES (01/11/2026, diagnostic de souplesse — lot C3) : Admin › Agences › Réglages des agences
 * (document settings/agencies, champ `delays`), au lieu de valeurs écrites dans le code.
 *  - collectDays : journées des cartes « Collectes par jour » / « Valeurs (COD) collectées par jour » (code : 14) ;
 *  - activeDays  : jours chargés par « Tout » ET durée avant l'archivage automatique de toute expédition (code : 45).
 * Bornes : on ne descend jamais sous les valeurs du code pour « Tout » / l'archivage (l'argent non réglé n'est jamais
 * archivé plus tôt qu'avant) ; plus de jours = pages plus lentes, d'où le plafond.
 * Module SANS Firebase : aussi compilé pour le serveur (agencyCaisseRules → functions/shared), où les valeurs du code
 * s'appliquent. Côté site, config/agencySettings.ts appelle applySiteDelays à chaque changement du document.
 */
export interface SiteDelays { collectDays?: number; activeDays?: number }

export const DELAY_BOUNDS = {
  collectDays: { min: 7, max: 31, code: 14 },
  activeDays: { min: 45, max: 90, code: 45 },
} as const

const clamp = (v: unknown, b: { min: number; max: number; code: number }) => {
  if (v === null || v === undefined || v === '') return b.code
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(b.max, Math.max(b.min, n)) : b.code
}

let current = { collectDays: DELAY_BOUNDS.collectDays.code as number, activeDays: DELAY_BOUNDS.activeDays.code as number }

/** Applique les durées réglées (valeurs hors bornes ramenées dans les bornes, absentes = code). */
export function applySiteDelays(d?: SiteDelays | null) {
  current = { collectDays: clamp(d?.collectDays, DELAY_BOUNDS.collectDays), activeDays: clamp(d?.activeDays, DELAY_BOUNDS.activeDays) }
}

/** Journées des cartes « Collectes par jour » / « Valeurs (COD) collectées par jour ». */
export const recentCollectDays = () => current.collectDays
/** Jours chargés par « Tout » (filtres larges) = durée avant l'archivage automatique de toute expédition. */
export const activeDays = () => current.activeDays
