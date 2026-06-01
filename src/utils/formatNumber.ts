/**
 * Formatage unifié des montants monétaires pour BG Express.
 *
 * Règles :
 *  - Séparateur de milliers : point  (ex: 1.234.567)
 *  - Séparateur décimal     : virgule (ex: 1.234,50)
 *  - Décimales              : affichées uniquement si ≠ 0  (ex: 1.234 mais 1.234,50)
 *  - Chiffre < 1            : la virgule est toujours présente  (ex: 0,50)
 *  - Nombre négatif         : tiret avant                       (ex: -1.234,50)
 */
export function fmt(n: number | string | null | undefined): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n ?? 0)) || 0
  if (!isFinite(num)) return '0'

  const abs    = Math.abs(num)
  const sign   = num < 0 ? '-' : ''
  const cents  = Math.round((abs % 1) * 100)
  const intPart = Math.floor(abs)

  // Séparateur de milliers : point
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  if (cents > 0) {
    return `${sign}${intStr},${String(cents).padStart(2, '0')}`
  }
  return `${sign}${intStr}`
}

/**
 * Version avec toujours 2 décimales — pour les tableaux financiers
 * (ex: solde caisse, totaux règlements)
 *
 * Ex: 1234 → "1.234,00"   |   1234.5 → "1.234,50"
 */
export function fmtFixed(n: number | string | null | undefined): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n ?? 0)) || 0
  if (!isFinite(num)) return '0,00'

  const abs     = Math.abs(num)
  const sign    = num < 0 ? '-' : ''
  const intPart = Math.floor(abs)
  const cents   = Math.round((abs - intPart) * 100)
  const intStr  = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${sign}${intStr},${String(cents).padStart(2, '0')}`
}
