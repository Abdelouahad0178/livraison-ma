/**
 * 🔒 Date d'une expédition VERROUILLÉE dès son arrivée à destination (demande du 25/10/2026) : l'agence qui l'a créée ne
 * peut plus changer sa date une fois l'expédition « Arrivé en agence », « En cours de livraison » ou « Livré » dans la
 * ville de destination (avant : modifiable à tout moment — la journée de la caisse / du bilan de l'agence de
 * destination changeait après coup). Seul l'admin peut encore la changer (Admin › Changer la date).
 * Même règle dans firestore.rules (parcelDateLockedOk).
 */
export const DATE_LOCKED_STATUSES = ['Arrivé en agence', 'En cours de livraison', 'Livré'] as const

export function isParcelDateLocked(p: { status?: string | null } | null | undefined): boolean {
  return !!p && (DATE_LOCKED_STATUSES as readonly string[]).includes(p.status || '')
}

export function parcelDateLockMessage(p: { status?: string | null; senderNic?: string | null; trackingId?: string | null }): string {
  return `${p.senderNic || p.trackingId || 'Expédition'} : date non modifiable — l'expédition est « ${p.status} » à destination. Seul l'admin peut encore changer sa date.`
}
