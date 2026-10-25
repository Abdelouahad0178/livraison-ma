/**
 * 👥 Personnel d'agence : les rôles qui saisissent et gèrent les expéditions d'une agence.
 * Remplace l'ancien rôle « agent » simple (supprimé — aucun compte ne l'utilisait).
 * ⚠️ Ne pas confondre avec la DONNÉE `fromRole: 'agent'` des versements (versement d'un chef d'agence).
 */
export const AGENCY_STAFF_ROLES = ['chef_agence', 'agentpro', 'aide_agent'] as const

export const isAgencyStaff = (role: unknown): boolean => AGENCY_STAFF_ROLES.includes(role as any)

/** Filtre « rôle » des écrans d'activité : la clé 'agent' regroupe tout le personnel d'agence. */
export const matchesActivityRole = (filter: string, role: unknown): boolean =>
  filter === 'all' || (filter === 'agent' ? isAgencyStaff(role) : role === filter)
