import { getOperationalDayString } from '../config/operationalDay'

/**
 * 📤 Versements chef d'exploitation → chef d'agence : période (jour / semaine / période / tout) et montant en
 * EXPÉDITIONS ENTIÈRES. Module unique et pur : même calcul sur toutes les pages concernées.
 */
export type VersementMode = 'jour' | 'semaine' | 'periode' | 'tout'
// « Tout » en premier : c'est le mode par défaut (tout ce qui reste à verser)
export const VERSEMENT_MODE_LABEL: Record<VersementMode, string> = { tout: 'Tout ce qui reste', jour: 'Jour', semaine: 'Semaine', periode: 'Période' }

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n, 12)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const fr = (key: string) => key.split('-').reverse().join('/')

/** Bornes en journées d'opération (AAAA-MM-JJ, incluses) + libellé. « tout » = aucune borne. */
export function versementBounds(mode: VersementMode, day: string, from?: string, to?: string): { fromKey: string | null; toKey: string | null; label: string } {
  if (mode === 'tout') return { fromKey: null, toKey: null, label: 'Tout ce qui reste' }
  if (mode === 'jour') return { fromKey: day, toKey: day, label: `Journée du ${fr(day)}` }
  if (mode === 'semaine') { const f = addDays(day, -6); return { fromKey: f, toKey: day, label: `Semaine du ${fr(f)} au ${fr(day)}` } }
  const f = from || day, t = to || day
  const [a, b] = f <= t ? [f, t] : [t, f]
  return { fromKey: a, toKey: b, label: `Période du ${fr(a)} au ${fr(b)}` }
}

/** Journée d'opération d'une date (Timestamp, ISO, Date) ou null. */
export function opDayKeyOf(v: any): string | null {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? getOperationalDayString(d) : null
}
export const inBounds = (key: string | null, b: { fromKey: string | null; toKey: string | null }) =>
  !b.fromKey || (!!key && key >= b.fromKey && key <= (b.toKey || key))

/**
 * 💡 Montant tapé → expéditions ENTIÈRES (les plus anciennes d'abord) : `lower` = ce qui tient sans dépasser,
 * `upper` = lower + l'expédition suivante. `exact` quand le montant tombe juste sur des expéditions entières.
 */
export function wholeExpeditionSplit<T extends { amount: number; at: number }>(groups: T[], typed: number) {
  const list = [...groups].sort((a, b) => a.at - b.at)
  const r2 = (n: number) => Math.round(n * 100) / 100
  const total = r2(list.reduce((s, g) => s + g.amount, 0))
  let lower = 0
  const lowerGroups: T[] = []
  let next: T | null = null
  for (const g of list) {
    if (lower + g.amount > typed + 0.001) { next = g; break }
    lower += g.amount; lowerGroups.push(g)
  }
  lower = r2(lower)
  const upper = next ? r2(lower + next.amount) : lower
  return {
    total, lower, upper, lowerGroups,
    upperGroups: next ? [...lowerGroups, next] : lowerGroups,
    exact: Math.abs(typed - lower) < 0.005,
  }
}
