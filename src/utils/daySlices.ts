import { OPERATIONAL_DAY_CONFIG } from '../config/operationalDay'

/**
 * 📅 Découpe une plage [start, end] (bornes createdAt) en tranches contiguës, une par journée
 * d'opération, de la plus RÉCENTE à la plus ancienne — pour charger / afficher une période
 * « jour par jour ».
 *
 * - Les frontières sont les débuts de journée d'opération (START_HOUR, ex. 8h, heure locale)
 *   strictement comprises dans ]start, end[ : l'union des tranches est EXACTEMENT [start, end],
 *   sans trou ni doublon (tranche du haut : [.., end] incluse ; les autres : [.., frontière[).
 *   Les totaux une fois tout chargé sont donc identiques à une requête unique sur la plage.
 * - Les éventuelles marges (ex. ±1 jour du Facturier) sont rattachées aux tranches extrêmes.
 */
export interface DaySlice {
  start: Date
  end: Date
  /** true : borne haute incluse (<=), sinon exclue (<). */
  endInclusive: boolean
  /** Journée d'opération représentée (YYYY-MM-DD). */
  day: string
  /** Libellé court (JJ/MM). */
  label: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Journée d'opération (YYYY-MM-DD, heure locale) d'un instant : avant START_HOUR → la veille. */
export function opDayOf(d: Date): string {
  const x = new Date(d)
  if (x.getHours() * 60 + x.getMinutes() < OPERATIONAL_DAY_CONFIG.START_HOUR * 60 + OPERATIONAL_DAY_CONFIG.START_MINUTE) {
    x.setDate(x.getDate() - 1)
  }
  return ymdLocal(x)
}

const opStart = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, OPERATIONAL_DAY_CONFIG.START_HOUR, OPERATIONAL_DAY_CONFIG.START_MINUTE, 0, 0)
}

/**
 * @param fromDay / toDay journées d'opération extrêmes (YYYY-MM-DD). Par défaut : déduites de
 *        start / end.
 */
export function buildDaySlices(start: Date, end: Date, fromDay?: string, toDay?: string): DaySlice[] {
  const first = fromDay ?? opDayOf(start)
  const last = toDay ?? opDayOf(end)
  // Frontières (débuts de journée) strictement dans ]start, end[, de la plus récente à la plus ancienne
  const bounds: { at: Date; day: string }[] = []
  const cur = opStart(last)
  const firstStart = opStart(first)
  for (let guard = 0; guard < 400 && cur.getTime() > firstStart.getTime(); guard++) {
    if (cur.getTime() > start.getTime() && cur.getTime() < end.getTime()) bounds.push({ at: new Date(cur), day: ymdLocal(cur) })
    cur.setDate(cur.getDate() - 1)
  }
  const slices: DaySlice[] = []
  let top = end
  let inclusive = true
  for (const b of bounds) {
    slices.push({ start: b.at, end: top, endInclusive: inclusive, day: b.day, label: b.day.slice(8, 10) + '/' + b.day.slice(5, 7) })
    top = b.at
    inclusive = false
  }
  slices.push({ start, end: top, endInclusive: inclusive, day: first, label: first.slice(8, 10) + '/' + first.slice(5, 7) })
  return slices
}
