/**
 * Échappe les caractères HTML pour prévenir les attaques XSS
 *
 * Convertit les caractères dangereux en entités HTML:
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot;
 * - ' → &#x27;
 *
 * @param value - La valeur à échapper (peut être null/undefined)
 * @returns La chaîne échappée, sécurisée pour insertion dans HTML
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // → '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 *
 * escapeHtml('Jean & Marie')
 * // → 'Jean &amp; Marie'
 */
export function escapeHtml(value: any): string {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')   // DOIT être en premier
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')  // Protection contre injection dans attributs
}

/**
 * Valide qu'une URL est sécurisée (data: ou https: uniquement)
 * Empêche les javascript:, file:, etc.
 *
 * @param url - L'URL à valider
 * @returns L'URL si valide, chaîne vide sinon
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return ''
  const trimmed = url.trim()

  // Autoriser seulement data: et https:
  if (trimmed.startsWith('data:') || trimmed.startsWith('https://')) {
    return trimmed
  }

  console.warn('⚠️ URL non sécurisée bloquée:', trimmed)
  return ''
}
