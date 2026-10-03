/**
 * Vérifie si la requête de recherche est valide pour déclencher une recherche
 * Règles:
 * - Pour les chiffres: minimum 7 chiffres
 * - Pour les lettres: minimum 3 caractères
 * - Pour un mélange: prend le minimum le plus élevé (5 si majorité chiffres, 3 si majorité lettres)
 */
export function shouldTriggerSearch(query: string): boolean {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) return false

  // Compter les chiffres et les lettres
  const digitCount = (trimmedQuery.match(/\d/g) || []).length
  const letterCount = (trimmedQuery.match(/[a-zA-Z]/g) || []).length

  // Chèque / traite par montant (« C5000 », « T3000 ») : inchangé
  if (/^[ct]\s*\d+([.,]\d+)?$/i.test(trimmedQuery)) return trimmedQuery.length >= 4

  // Si la recherche contient majoritairement des chiffres : à partir du 7e chiffre seulement
  // (la saisie d'un N° EXP / téléphone reste fluide, sans recherche à chaque chiffre)
  if (digitCount >= letterCount) {
    return digitCount >= 7
  }

  // Si la recherche contient majoritairement des lettres
  return trimmedQuery.length >= 3
}
