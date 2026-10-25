// 🔍 Recherche texte insensible à la casse, aux accents/trémas et aux espaces multiples
// ("copima" trouve "COPÏMA" et inversement). Même règle que normName (billingAgency.ts).
import { normName } from './billingAgency'

/** Normalise un texte pour la recherche (chemin rapide si le texte est purement ASCII). */
export const normText = (s: unknown): string => {
  const str = String(s ?? '')
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return normName(str)
  }
  return str.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Mémo du dernier terme : un filtre compare le même terme à des milliers de champs.
let lastNeedleRaw: unknown = undefined
let lastNeedle = ''

/** Vrai si `hay` contient `needle`, les deux normalisés (casse, accents, espaces). */
export const normIncludes = (hay: unknown, needle: unknown): boolean => {
  if (needle !== lastNeedleRaw) {
    lastNeedleRaw = needle
    lastNeedle = normText(needle)
  }
  return digitAwareIncludes(normText(hay), lastNeedle)
}

// 🔢 NUMÉROS (N° EXP, téléphone…) : le 0 est un chiffre comme les autres, jamais facultatif.
// Un terme composé uniquement de chiffres doit correspondre à un nombre DEPUIS SON PREMIER
// CHIFFRE : « 0987223 » ne trouve pas « 987223 », et « 987223 » ne trouve pas « 0987223 »
// (avant, « contient » trouvait un numéro au milieu d'un autre). Le début d'un numéro reste
// accepté (« 0987 » trouve « 0987223 »). Espaces, points, tirets et barres dans le numéro
// sont ignorés (« 06 12 34 56 78 » = « 0612345678 »).
const DIGITS_ONLY = /^\d+$/
const NUM_SEPARATORS = /[\s.\-\/]/g
export const isDigitsOnly = (s: string): boolean => DIGITS_ONLY.test(s)

/** Un des nombres de `hay` commence-t-il par `digits` (0 compris) ? */
export const numberStartsWith = (hay: unknown, digits: string): boolean => {
  const h = String(hay ?? '')
  if (!h) return false
  const runs = h.replace(NUM_SEPARATORS, '').match(/\d+/g)
  if (runs) for (const r of runs) if (r.startsWith(digits)) return true
  // Numéro collé à des lettres (« 1071387S ») : déjà couvert par les suites de chiffres ci-dessus
  return false
}

/**
 * « Contient » pour la recherche : texte → sous-chaîne (inchangé) ; terme uniquement en chiffres
 * → règle des numéros ci-dessus (le 0 compte). `hay` et `needle` déjà normalisés.
 */
export const digitAwareIncludes = (hay: string, needle: string): boolean => {
  if (!needle) return true
  if (DIGITS_ONLY.test(needle)) return numberStartsWith(hay, needle)
  return hay.includes(needle)
}
