import { getOperationalDayString } from './operationalDay'

/**
 * ⏪ OPÉRATION EXCEPTIONNELLE (demande de l'admin, 28/10/2026) : le chef d'exploitation zinebechef@gmail.com
 * (ZINEBE BABIA CHEF, Agadir) collecte un ensemble d'expéditions du 07/10/2026 — leurs montants (port dû, COD, port payé
 * ramassé) comptent dans le solde du 07/10/2026 et non dans celui du jour : les dates d'encaissement / de réception sont
 * posées au 07/10/2026 18:00.
 * - UNIQUEMENT ce compte, UNIQUEMENT les expéditions de la journée du 07/10/2026 (workDate) ;
 * - UNIQUEMENT pendant la journée d'opération du 28/10/2026 : ensuite l'opération est AUTOMATIQUEMENT annulée
 *   (plus aucun effet, sans rien à faire). Les encaissements déjà faits le 28/10 restent datés du 07/10.
 */
export const BACKDATED_COLLECTION = {
  uid: 'N1gHn9JuBnOdUEM90vRhBfnl1xP2', // zinebechef@gmail.com
  parcelDay: '2026-10-07',
  activeOpDay: '2026-10-28',
  label: '07/10/2026',
}

/** L'opération exceptionnelle est-elle active MAINTENANT pour ce compte ? */
export function isBackdatedCollectionActive(uid?: string | null, now: Date = new Date()): boolean {
  return !!uid && uid === BACKDATED_COLLECTION.uid && getOperationalDayString(now) === BACKDATED_COLLECTION.activeOpDay
}

/** Date (ISO) à poser sur l'encaissement de cette expédition, ou null (encaissement à la date du jour, comme d'habitude). */
export function backdatedCollectionAt(p: any, uid?: string | null, now: Date = new Date()): string | null {
  if (!isBackdatedCollectionActive(uid, now) || p?.workDate !== BACKDATED_COLLECTION.parcelDay) return null
  const [y, m, d] = BACKDATED_COLLECTION.parcelDay.split('-').map(Number)
  return new Date(y, m - 1, d, 18, 0, 0).toISOString() // 18:00, en pleine journée d'opération du 07/10
}
