// 👥 Clients de la saisie « Nouvelle expédition » — fonctions PURES (testées dans clientLookup.test.ts).
// La page charge les clients de SON agence (+ clients à code, + villes de destination choisies) au lieu des
// ≈ 14 000 clients de toutes les agences ; les autres sont cherchés à la demande (firebase/clients lookupClients).

const createdMs = (c: any): number => {
  const v = c?.createdAt
  if (!v) return -Infinity
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  const t = new Date(v).getTime()
  return isNaN(t) ? -Infinity : t
}

/**
 * Fusionne plusieurs listes de clients sans doublon (même id) : la PREMIÈRE liste qui contient un client
 * l'emporte (mettre d'abord les listes temps réel, en dernier les résultats de recherche ponctuels).
 * Résultat trié du plus récent au plus ancien (createdAt ; fiches sans date à la fin) — même ordre que
 * l'ancienne liste complète (orderBy createdAt desc).
 */
export function mergeClientLists(...lists: (any[] | null | undefined)[]): any[] {
  const seen = new Map<string, any>()
  for (const list of lists) {
    if (!list) continue
    for (const c of list) if (c?.id && !seen.has(c.id)) seen.set(c.id, c)
  }
  return [...seen.values()].sort((a, b) => createdMs(b) - createdMs(a))
}

/**
 * Variantes d'écriture d'un début de nom pour une recherche par PRÉFIXE côté serveur (Firestore distingue
 * majuscules / minuscules) : tel que saisi, MAJUSCULES, minuscules, Première Lettre De Chaque Mot.
 */
export function clientNameVariants(term: string): string[] {
  const t = term.trim().replace(/\s+/g, ' ')
  if (!t) return []
  const title = t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase())
  return [...new Set([t, t.toUpperCase(), t.toLowerCase(), title])]
}

/** Chiffres d'un numéro de téléphone saisi ('' si moins de 6 chiffres : pas une recherche par téléphone). */
export function phoneDigits(term: string): string {
  const d = term.replace(/\D/g, '')
  return d.length >= 6 ? d : ''
}
