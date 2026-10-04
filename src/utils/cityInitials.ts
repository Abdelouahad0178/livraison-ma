// 🏙️ Sélection de la ville de destination par initiales (liste déroulante au clavier).
// Chaque ville reçoit sa première lettre ; si la lettre est déjà prise par une ville
// précédente de la liste, elle est doublée (puis triplée…).
// Avec CITIES = Casablanca, Rabat, Agadir, Marrakech, Guelmim, Ait Melloul :
//   A = Agadir · AA = Ait Melloul · C = Casablanca · M = Marrakech · G = Guelmim · R = Rabat

export const CITY_INITIALS_DELAY_MS = 700

const firstLetter = (city: string) =>
  city.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase()

/** Code (lettres majuscules) → ville */
export const buildCityInitialsMap = (cities: readonly string[]): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const city of cities) {
    const l = firstLetter(city)
    if (!/^[A-Z]$/.test(l)) continue
    let code = l
    while (map[code]) code += l
    map[code] = city
  }
  return map
}

/**
 * Applique une lettre tapée au tampon courant.
 * Renvoie le nouveau tampon et la ville correspondante (null si la lettre ne correspond à aucun code).
 */
export const matchCityInitials = (
  map: Record<string, string>, buffer: string, letter: string,
): { buffer: string; city: string | null } => {
  const l = letter.toUpperCase()
  const extended = buffer + l
  const hasPrefix = (s: string) => Object.keys(map).some(k => k.startsWith(s))
  if (buffer && hasPrefix(extended)) return { buffer: extended, city: map[extended] || null }
  if (hasPrefix(l)) return { buffer: l, city: map[l] || null }
  return { buffer: '', city: null }
}
