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
  return normText(hay).includes(lastNeedle)
}
