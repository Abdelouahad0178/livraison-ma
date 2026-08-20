/**
 * Vérifie si la requête de recherche est valide pour déclencher une recherche
 * Règles:
 * - Pour les chiffres: minimum 5 caractères
 * - Pour les lettres: minimum 3 caractères
 * - Pour un mélange: prend le minimum le plus élevé (5 si majorité chiffres, 3 si majorité lettres)
 */
export function shouldTriggerSearch(query: string): boolean {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) return false

  // Compter les chiffres et les lettres
  const digitCount = (trimmedQuery.match(/\d/g) || []).length
  const letterCount = (trimmedQuery.match(/[a-zA-Z]/g) || []).length

  // Si la recherche contient majoritairement des chiffres
  if (digitCount >= letterCount) {
    return trimmedQuery.length >= 5
  }

  // Si la recherche contient majoritairement des lettres
  return trimmedQuery.length >= 3
}
