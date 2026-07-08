// Adresses des agences BG Express par ville
// Source: bglocation.netlify.app
//
// ⚠️ ACTION REQUISE AVANT PRODUCTION:
// 1. Visitez https://bglocation.netlify.app
// 2. Copiez les adresses exactes de chaque agence
// 3. Remplacez les chaînes vides ci-dessous
//
// Ces adresses apparaissent dans:
// - Les bordereaux imprimés (BL)
// - Les tableaux livreur
// - Les documents clients

export const AGENCY_ADDRESSES: Record<string, string> = {
  'CASABLANCA': 'N°19, Rue 5, Hay Tissir 2 - Casablanca',
  'AGADIR': '', // TODO: À remplir depuis bglocation.netlify.app
  'MARRAKECH': '', // TODO: À remplir depuis bglocation.netlify.app
  'TANGER': '', // TODO: À remplir depuis bglocation.netlify.app
  'FES': '', // TODO: À remplir depuis bglocation.netlify.app
  'RABAT': '', // TODO: À remplir depuis bglocation.netlify.app
  'MEKNES': '', // TODO: À remplir depuis bglocation.netlify.app
  'OUJDA': '', // TODO: À remplir depuis bglocation.netlify.app
  'KENITRA': '', // TODO: À remplir depuis bglocation.netlify.app
  'TETOUAN': '', // TODO: À remplir depuis bglocation.netlify.app
  'SAFI': '', // TODO: À remplir depuis bglocation.netlify.app
  'LAAYOUNE': '', // TODO: À remplir depuis bglocation.netlify.app
  'MOHAMMEDIA': '', // TODO: À remplir depuis bglocation.netlify.app
  'KHOURIBGA': '', // TODO: À remplir depuis bglocation.netlify.app
  'BENI MELLAL': '', // TODO: À remplir depuis bglocation.netlify.app
  'NADOR': '', // TODO: À remplir depuis bglocation.netlify.app
  'AL HOCEIMA': '', // TODO: À remplir depuis bglocation.netlify.app
}

// Fonction pour récupérer l'adresse d'une agence par ville
export function getAgencyAddress(city: string): string {
  const normalizedCity = city?.toUpperCase().trim()
  return AGENCY_ADDRESSES[normalizedCity] || 'N°19, Rue 5, Hay Tissir 2 - Casablanca'
}
