/**
 * 🚚 Cartes « Livraison du jour » (COD espèces + Ports) de l'en-tête Admin, aussi affichées à certains chefs d'agence,
 * limitées à leurs villes.
 */
export const LIVRAISON_STATS_ACCESS: Record<string, string[]> = {
  'noura@gmail.com': ['Agadir', 'Ait Melloul'],
  // Chefs d'agence : leur ville seulement
  'noura2@gmail.com': ['Ait Melloul'],
  'bouzndag@gmail.com': ['Marrakech'],
  'said@gmail.com': ['Casablanca'],
  // Chefs d'exploitation : leur ville seulement
  'zinebechef@gmail.com': ['Agadir'],
  'elkerdaouichef@gmail.com': ['Ait Melloul'],
  'madanichef@gmail.com': ['Marrakech'],
}

export const livraisonStatsCitiesFor = (email?: string | null): string[] | null =>
  (email && LIVRAISON_STATS_ACCESS[email.trim().toLowerCase()]) || null
