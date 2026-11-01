/**
 * 🏬 Détenteur du port payé encaissé AU GUICHET, par ville (demande du 23/10/2026).
 * Le chef d'agence / l'agent pro saisit l'expédition, mais l'argent du port payé est chez la personne en gare :
 * il est attribué à ce compte (champs portGuichetHolderId / portGuichetHolderName de l'expédition) et se reçoit
 * dans SA carte (Caisse Agence, Collecte du soir) — chef d'exploitation ou chef d'agence, chacun sous sa responsabilité.
 * Ville absente (ex. Casablanca) ou expédition sans détenteur : reste « En gare - <ville> » comme avant.
 * Agadir : ENGAREAGA6017 (les comptes ANCIEN / RAMASSAGE du 26/10/2026 ont été annulés le 27/10/2026).
 */
export const GUICHET_HOLDERS: Record<string, { id: string; name: string }> = {
  'Ait Melloul': { id: 'XC5YJs1l1bS4G0MDdb3TSB6RF932', name: 'rachida' },
  Agadir: { id: 'OVMkys7PVFfx8zLvltBoQ4PN35x2', name: 'ENGAREAGA6017' },
  Marrakech: { id: '7K2AN6bkS3NnJuRRUyrbBPsN5Jz2', name: 'HAMZA EN GARE' },
}

export const guichetHolderForCity = (city?: string | null) => (city ? GUICHET_HOLDERS[city] || null : null)

/**
 * 🔗 Même personne, deux comptes (30/10/2026) : le port payé encaissé au guichet par son compte CHEF D'AGENCE est
 * détenu par son compte CHEF D'EXPLOITATION et se verse depuis son bloc « Versements au chef d'agence ».
 * Ait Melloul : ABDELLAH ELKERDAOUI (chef d'agence) → ABDELLAH EL KERDAOUI (chef d'exploitation).
 */
export const LINKED_EXPLOITATION_OF: Record<string, string> = {
  sB9GAnS6IQZWdb3O0rVa9XJMg4q2: 'cvRsdyLS9xacqg0jXCVlR0O2W0f2',
}
export const linkedExploitationOf = (uid?: string | null) => (uid ? LINKED_EXPLOITATION_OF[uid] || null : null)
