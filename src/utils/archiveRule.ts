/**
 * 🗄️ Archivage « ranger, mais jamais cacher ni bloquer » (lot 1, 05/11/2026).
 *
 * Archiver = marque isArchived sur l'expédition (elle RESTE dans la base) : elle sort des listes de travail du jour,
 * mais les caisses, les totaux, le Facturier et la recherche la voient toujours.
 *
 * Règle (passage automatique chaque nuit, functions/weeklyArchiving.js) :
 *   • expéditions créées depuis le 05/10/2026 (argent suivi dans le site) : rangées après 30 jours SEULEMENT si elles
 *     sont TERMINÉES ET RÉGLÉES (isArchiveSettled) — jamais une expédition non livrée ou avec de l'argent en attente
 *     (avant : tout était rangé après 45 jours, même non livré, même avec un port dû / COD non encaissé) ;
 *   • passagers : 15 jours (règle passagerArchive, inchangée — elle exige déjà « livré, simple, port réglé ») ;
 *   • période d'essai (créées avant le 05/10/2026) : ancienne règle gardée (décision de l'utilisateur : l'argent de
 *     cette période n'était pas suivi dans le site) — livrées sans COD à 30 jours, tout le reste à 45 jours (réglage).
 * Réveil : une expédition rangée qui redevient « à régler » (encaissement annulé, statut changé…) ressort des archives.
 * « Anciennes à régler » : expéditions non rangées, créées depuis le 05/10, plus vieilles que la fenêtre des listes
 * (45 jours par défaut) et pas réglées — listées chaque nuit dans archiveWatch/oldUnsettled.
 *
 * Compilé pour les Cloud Functions : node scripts/build-functions-shared.mjs → functions/shared/archiveRule.js
 */
export const DAY_MS = 86400000
/** Début du vrai calcul de l'argent (05/10/2026 08:00, heure du Maroc) — même date que MONEY_START (utils/moneyFlow). */
export const ARCHIVE_MONEY_START_MS = Date.parse('2026-10-05T08:00:00+01:00')
/** Expédition terminée et réglée : rangée après ce délai. */
export const SETTLED_ARCHIVE_DAYS = 30
/** Signature des archivages automatiques. */
export const ARCHIVED_BY_AUTO = 'auto-system'
export const UNARCHIVED_BY_AUTO = 'auto-system-reveil'

const num = (v: any): number => {
  const n = Number.parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Date de création en millisecondes (Timestamp Firestore, Date, nombre, texte). */
export function archiveCreatedMs(p: any): number {
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

/** Port réglé : rien à encaisser (prix 0), en compte (facturé), payé au départ, ou déjà encaissé / reçu. */
export function isPortSettledForArchive(p: any): boolean {
  if (num(p?.price) <= 0) return true
  const t = String(p?.portType || '')
  if (t.startsWith('port_en_compte')) return true
  if (p?.portPayeMethod) return true
  return p?.portStatus === 'collected' || p?.portStatus === 'received'
}

/** COD réglé : pas de COD, ou reçu par le chef d'agence (« remis ») / réglé, ou déjà payé au client expéditeur. */
export function isCodSettledForArchive(p: any): boolean {
  if (num(p?.codAmount) <= 0) return true
  if (p?.codStatus === 'remis' || p?.codStatus === 'regle') return true
  return !!p?.codSenderPaid || !!p?.centralSupplierPaid || p?.centralSupplierPaymentStatus === 'paid'
}

/** Terminée ET réglée : livrée (port + COD réglés), retour finalisé (port du retour réglé), ou annulée. */
export function isArchiveSettled(p: any): boolean {
  const st = p?.status
  if (st === 'Annulé') return true
  if (st === 'Retour finalisé') return isPortSettledForArchive(p)
  if (st === 'Livré') return isPortSettledForArchive(p) && isCodSettledForArchive(p)
  return false
}

/** Créée pendant la période d'essai (avant le 05/10/2026) ? */
export const isTrialPeriodParcel = (p: any): boolean => {
  const ms = archiveCreatedMs(p)
  return ms > 0 && ms < ARCHIVE_MONEY_START_MS
}

/**
 * Faut-il ranger cette expédition maintenant ? (hors passagers : règle à part, 15 jours)
 * `legacyForceDays` : ancienne règle « tout après N jours » (45 à 90), appliquée à la seule période d'essai.
 */
export function shouldArchiveNow(p: any, now: number, legacyForceDays: number): boolean {
  if (!p || p.isArchived) return false
  const ms = archiveCreatedMs(p)
  if (!(ms > 0)) return false
  const age = now - ms
  if (ms < ARCHIVE_MONEY_START_MS) {
    // Période d'essai : ancienne règle
    if (age > legacyForceDays * DAY_MS) return true
    return age > SETTLED_ARCHIVE_DAYS * DAY_MS && p.status === 'Livré' && !(num(p.codAmount) > 0)
  }
  return age > SETTLED_ARCHIVE_DAYS * DAY_MS && isArchiveSettled(p)
}

/**
 * Réveil automatique : la modification vient de rendre « à régler » une expédition rangée (avant : réglée, après : non).
 * Période d'essai exclue (jamais réveillée : décision de l'utilisateur).
 */
export function shouldWakeArchived(before: any, after: any): boolean {
  if (!before || !after) return false
  if (before.isArchived !== true || after.isArchived !== true) return false
  if (isTrialPeriodParcel(after)) return false
  return isArchiveSettled(before) && !isArchiveSettled(after)
}

/** Encore rangée et à régler (vérification dans la transaction du réveil, sur l'état relu). */
export const isArchivedButUnsettled = (p: any): boolean =>
  !!p && p.isArchived === true && !isTrialPeriodParcel(p) && archiveCreatedMs(p) > 0 && !isArchiveSettled(p)

/** « Ancienne à régler » : pas rangée, créée depuis le 05/10, plus vieille que la fenêtre des listes, pas réglée. */
export function isOldUnsettled(p: any, now: number, windowDays: number): boolean {
  if (!p || p.isArchived) return false
  const ms = archiveCreatedMs(p)
  if (!(ms >= ARCHIVE_MONEY_START_MS)) return false
  if (!(now - ms > windowDays * DAY_MS)) return false
  return !isArchiveSettled(p)
}

/** Ce qui reste à faire, en mots simples (liste « Anciennes à régler »). */
export function unsettledReason(p: any): string {
  const st = String(p?.status || '—')
  if (st !== 'Livré' && st !== 'Retour finalisé' && st !== 'Annulé') return `statut « ${st} »`
  const parts: string[] = []
  if (!isPortSettledForArchive(p)) parts.push('port non encaissé')
  if (st === 'Livré' && !isCodSettledForArchive(p)) parts.push(p?.codStatus === 'collected' ? 'COD encaissé, pas encore reçu par le chef d\'agence' : 'COD non encaissé')
  return parts.join(' + ') || 'à vérifier'
}

/** Ligne compacte de la liste « Anciennes à régler » (document archiveWatch/oldUnsettled). */
export function oldUnsettledItem(id: string, p: any) {
  const ms = archiveCreatedMs(p)
  return {
    id,
    nic: String(p?.senderNic || p?.sender?.nic || p?.trackingId || id),
    status: String(p?.status || ''),
    createdAt: ms ? new Date(ms).toISOString() : '',
    from: String(p?.originCity || ''),
    to: String(p?.destinationCity || ''),
    city: String((p?.wasReturned && p?.returnToCity) || p?.destinationCity || p?.receiver?.city || ''),
    port: isPortSettledForArchive(p) ? 0 : num(p?.price),
    cod: isCodSettledForArchive(p) ? 0 : num(p?.codAmount),
    driver: String(p?.deliveryDriverName || ''),
    reason: unsettledReason(p),
  }
}
