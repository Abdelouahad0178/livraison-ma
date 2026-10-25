/**
 * 🚚 Livraison réservée à l'agence de destination.
 * Chef d'agence, agent pro et aide agent ne peuvent marquer « Livré » qu'une expédition destinée à LEUR
 * ville (même règle côté serveur : deliveryCityGuard() dans firestore.rules). Les autres rôles
 * (livreurs, comptes « En gare », chef d'exploitation, admin…) ne sont pas concernés ici.
 */
export const DEST_ONLY_DELIVERY_ROLES = ['chef_agence', 'agentpro', 'aide_agent']

/** Message de refus, ou null si la livraison est permise. */
export function deliveryCityBlock(
  role: string | null | undefined,
  userCity: string | null | undefined,
  parcel: { status?: string | null; destinationCity?: string | null },
): string | null {
  if (!role || !DEST_ONLY_DELIVERY_ROLES.includes(role)) return null
  if (parcel.status === 'Livré') return null
  const dest = parcel.destinationCity || ''
  if ((userCity || '') === dest) return null
  return `Livraison refusée : cette expédition est destinée à ${dest || 'une autre ville'}. `
    + `Seule l'agence de ${dest || 'destination'} peut la marquer « Livré ».`
}

/**
 * 💰 Encaissement d'une VALEUR (COD) ou d'un PORT DÛ réservé à l'agence de DESTINATION (c'est le destinataire qui
 * paie). Concerne les comptes d'agence rattachés à une ville (chef d'agence, agent pro, aide agent, chef
 * d'exploitation). Aucune exception (même entre Agadir et Ait Melloul : la bascule de ville et les livreurs
 * restent partagés, mais l'argent est encaissé par l'agence de destination).
 */
export const DEST_ONLY_COLLECT_ROLES = ['chef_agence', 'agentpro', 'aide_agent', 'chef_exploitation']

/** Message de refus, ou null si l'encaissement est permis. */
export function collectCityBlock(
  role: string | null | undefined,
  userCity: string | null | undefined,
  parcel: { destinationCity?: string | null; senderNic?: string | null; trackingId?: string | null },
  what: 'valeur (COD)' | 'port dû' = 'valeur (COD)',
): string | null {
  if (!role || !DEST_ONLY_COLLECT_ROLES.includes(role)) return null
  const city = userCity || ''
  const dest = parcel.destinationCity || ''
  if (!city || !dest || city === dest) return null
  return `${parcel.senderNic || parcel.trackingId || 'Expédition'} : encaissement refusé — la ${what} se paie à l'arrivée, `
    + `c'est l'agence de ${dest} (destination) qui l'encaisse, pas ${city}.`
}
