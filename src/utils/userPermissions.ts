/**
 * 🔑 DROITS INDIVIDUELS (01/11/2026, diagnostic de souplesse — lot C2) : cochés par l'ADMIN dans la fiche employé
 * (users/{uid}.permissions), au lieu d'e-mails / d'identifiants écrits dans le code.
 *  - fullParcelEdit       : modifie (et crée, toutes villes) TOUTES les expéditions comme l'admin (avant : zahra, uid en dur).
 *                           Les règles Firestore le lisent dans le jeton de connexion (claim `fullEdit`, posé par la Cloud
 *                           Function syncUserClaims) : effet à la reconnexion, ou dans l'heure.
 *  - clientAccounts       : onglet « Comptes clients » (avant : config/clientAccountsAccess.ts).
 *  - livraisonStatsCities : cartes « Livraison du jour » pour ces villes (avant : config/livraisonStatsAccess.ts).
 * Seul l'admin peut les modifier (firestore.rules : ni soi-même, ni le directeur).
 */
export interface UserPermissions {
  fullParcelEdit?: boolean
  clientAccounts?: boolean
  livraisonStatsCities?: string[]
}

export const permissionsOf = (profile: any): UserPermissions =>
  (profile?.permissions && typeof profile.permissions === 'object' && !Array.isArray(profile.permissions) ? profile.permissions : {})

/** Version propre à enregistrer (seulement les droits accordés, villes dédoublonnées). */
export const cleanPermissions = (p: UserPermissions | null | undefined): UserPermissions => {
  const out: UserPermissions = {}
  if (p?.fullParcelEdit) out.fullParcelEdit = true
  if (p?.clientAccounts) out.clientAccounts = true
  const cities = [...new Set((p?.livraisonStatsCities || []).filter(c => typeof c === 'string' && c))]
  if (cities.length) out.livraisonStatsCities = cities
  return out
}

/** Libellés de la fiche employé (Admin). */
export const PERMISSION_LABELS = {
  fullParcelEdit: { emoji: '✏️', label: 'Modification totale des expéditions', desc: 'Modifie et crée les expéditions de toutes les villes, comme l\'admin' },
  clientAccounts: { emoji: '📝', label: 'Comptes clients', desc: 'Onglet des fiches d\'ouverture de compte client' },
  livraisonStatsCities: { emoji: '🚚', label: 'Cartes « Livraison du jour »', desc: 'COD espèces et ports livrés du jour, pour les villes cochées' },
} as const
