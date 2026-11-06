/**
 * 🧳 Archivage anticipé des expéditions de PASSAGERS — 15 jours au lieu de 30 (demande du 04/11/2026).
 *
 * Passager = personne qui ne travaille pas avec nous (pas un client). Le site ne le marque pas sur l'expédition,
 * on le reconnaît à deux signes :
 *   • le port n'est pas « en compte » (port dû, port dû par chèque ou port payé) ;
 *   • l'expéditeur ET le destinataire apparaissent au plus PASSAGER_MAX_SEEN fois dans toute la base
 *     (cette expédition comprise, comme expéditeur ou comme destinataire).
 * Et l'expédition est terminée sans argent en attente : « Livré », simple (sans COD), port déjà payé / encaissé.
 *
 * Même marque que l'archivage automatique (isArchived + archivedAt + archivedBy) : l'expédition reste dans la base,
 * dans les caisses et les totaux (archivés inclus) et se retrouve par la recherche ; désarchivable.
 * Au-delà de 30 jours, l'archivage automatique « Livré sans COD » s'en charge de toute façon.
 *
 * Compilé pour les Cloud Functions : node scripts/build-functions-shared.mjs → functions/shared/passagerArchive.js
 * (utilisé par functions/archivePassagers.js, appelé par l'archivage automatique chaque jour à 2 h).
 */
export const PASSAGER_ARCHIVE_DAYS = 15
export const PASSAGER_MAX_SEEN = 2
export const PASSAGER_ARCHIVED_BY = 'auto-system-passager-15j'

const PASSAGER_PORT_TYPES = ['port_du', 'port_du_cheque', 'port_paye']

/** Port déjà payé / encaissé (même règle que isPortCollected des pages). */
export const isPortSettled = (p: any): boolean => p?.portStatus === 'collected' || p?.portStatus === 'received'

const filled = (s: any): boolean => String(s ?? '').trim() !== ''

/** Date de création en millisecondes (Timestamp Firestore, Date, nombre ou texte). */
export function createdMsOf(p: any): number {
  const c = p?.createdAt
  if (!c) return 0
  if (typeof c.toMillis === 'function') return c.toMillis()
  if (c instanceof Date) return c.getTime()
  if (typeof c === 'number') return c
  if (typeof c === 'string') return Date.parse(c) || 0
  if (typeof c._seconds === 'number') return c._seconds * 1000
  if (typeof c.seconds === 'number') return c.seconds * 1000
  return 0
}

/** Créée il y a plus de 15 jours ? */
export const passagerArchiveCutoffMs = (now: number): number => now - PASSAGER_ARCHIVE_DAYS * 86400000
export const isOldEnoughForPassagerArchive = (p: any, now: number): boolean => {
  const ms = createdMsOf(p)
  return ms > 0 && ms < passagerArchiveCutoffMs(now)
}

/**
 * L'expédition elle-même remplit les conditions (terminée, simple, port réglé, hors compte, pas encore archivée).
 * Reste à vérifier que les DEUX noms sont des passagers (isPassagerParcel).
 */
export function isPassagerArchiveCandidate(p: any): boolean {
  if (!p || p.isArchived) return false
  if (p.status !== 'Livré') return false
  if ((Number(p.codAmount) || 0) > 0 || p.codMixed) return false
  if ((p.serviceType || 'simple') !== 'simple') return false
  if (!PASSAGER_PORT_TYPES.includes(p.portType)) return false
  if (!isPortSettled(p)) return false
  return filled(p.senderNameNorm) && filled(p.receiverNameNorm)
}

/** Noms à compter (valeurs exactes enregistrées, pour les requêtes ==). */
export const passagerNamesOf = (p: any): string[] => [...new Set([String(p.senderNameNorm), String(p.receiverNameNorm)])]

/**
 * seen(nom) = nombre d'expéditions où le nom est expéditeur + nombre où il est destinataire (toute la base).
 * 0 = nom introuvable (incohérence) → prudence : pas un passager.
 */
export function isPassagerParcel(p: any, seen: (name: string) => number): boolean {
  return [p.senderNameNorm, p.receiverNameNorm].every(n => {
    const c = seen(String(n))
    return c > 0 && c <= PASSAGER_MAX_SEEN
  })
}

/** Champs écrits sur l'expédition (comme l'archivage automatique, avec sa propre signature). */
export const passagerArchiveFields = (now: number) => ({
  isArchived: true,
  archivedAt: new Date(now).toISOString(),
  archivedBy: PASSAGER_ARCHIVED_BY,
})
