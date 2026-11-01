import { permissionsOf } from '../utils/userPermissions'

/**
 * 🚚 Cartes « Livraison du jour » (COD espèces + Ports) de l'en-tête Admin, aussi affichées à certains chefs d'agence /
 * chefs d'exploitation, limitées à leurs villes. Depuis le 01/11/2026 : villes cochées par l'ADMIN dans la fiche employé
 * (permissions.livraisonStatsCities — avant : liste d'e-mails écrite ici).
 */
export const livraisonStatsCitiesFor = (profile: any): string[] | null => {
  const cities = permissionsOf(profile).livraisonStatsCities
  return cities && cities.length ? cities : null
}
