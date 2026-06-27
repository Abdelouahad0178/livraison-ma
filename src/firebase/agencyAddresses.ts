// Adresses des agences BG Express par ville
// Source: bglocation.netlify.app

export const AGENCY_ADDRESSES: Record<string, string> = {
  // TODO: Remplir avec les vraies adresses depuis bglocation.netlify.app

  'CASABLANCA': 'N°19, Rue 5, Hay Tissir 2 - Casablanca',
  'AGADIR': '', // À remplir
  'MARRAKECH': '', // À remplir
  'TANGER': '', // À remplir
  'FES': '', // À remplir
  'RABAT': '', // À remplir
  'MEKNES': '', // À remplir
  'OUJDA': '', // À remplir
  'KENITRA': '', // À remplir
  'TETOUAN': '', // À remplir
  'SAFI': '', // À remplir
  'LAAYOUNE': '', // À remplir
  'MOHAMMEDIA': '', // À remplir
  'KHOURIBGA': '', // À remplir
  'BENI MELLAL': '', // À remplir
  'NADOR': '', // À remplir
  'AL HOCEIMA': '', // À remplir
}

// Fonction pour récupérer l'adresse d'une agence par ville
export function getAgencyAddress(city: string): string {
  const normalizedCity = city?.toUpperCase().trim()
  return AGENCY_ADDRESSES[normalizedCity] || 'N°19, Rue 5, Hay Tissir 2 - Casablanca'
}
