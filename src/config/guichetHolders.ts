/**
 * 🏬 Détenteur du port payé encaissé AU GUICHET, par ville (demande du 23/10/2026).
 * Le chef d'agence / l'agent pro saisit l'expédition, mais l'argent du port payé est chez la personne en gare :
 * il est attribué à ce compte (champs portGuichetHolderId / portGuichetHolderName de l'expédition) et se reçoit
 * dans SA carte (Caisse Agence, Collecte du soir) — chef d'exploitation ou chef d'agence, chacun sous sa responsabilité.
 * Ville absente (ex. Casablanca) ou expédition sans détenteur : reste « En gare - <ville> » comme avant.
 */
export const GUICHET_HOLDERS: Record<string, { id: string; name: string }> = {
  'Ait Melloul': { id: 'XC5YJs1l1bS4G0MDdb3TSB6RF932', name: 'rachida' },
  Agadir: { id: 'OVMkys7PVFfx8zLvltBoQ4PN35x2', name: 'ENGAREAGA6017' },
  Marrakech: { id: '7K2AN6bkS3NnJuRRUyrbBPsN5Jz2', name: 'HAMZA EN GARE' },
}

export const guichetHolderForCity = (city?: string | null) => (city ? GUICHET_HOLDERS[city] || null : null)
