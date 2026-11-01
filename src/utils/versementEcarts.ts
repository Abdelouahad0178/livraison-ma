// 💼 Écarts de versement chef d'agence → admin (30/10/2026).
// Un versement validé pour MOINS que le montant envoyé laisse un ÉCART (amountSent − amount) que le chef d'agence doit
// régulariser par des versements « regul » ; reste à régulariser = écarts − régularisations validées.

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Montant envoyé par le chef d'agence (avant modification par l'admin). */
export const transferSent = (t: any): number => r2(num(t?.amountSent ?? t?.amount))
/** Écart d'un versement VALIDÉ (envoyé − reçu), jamais négatif ; centimes d'arrondi ignorés. */
export const transferEcart = (t: any): number => {
  if (t?.status !== 'confirmed' || t?.kind === 'regul' || t?.amountSent == null) return 0
  const e = r2(transferSent(t) - num(t.amount))
  return e > 0.009 ? e : 0
}
export const isRegulTransfer = (t: any) => t?.kind === 'regul'

export interface EcartSummary {
  ecarts: number          // total des écarts des versements validés
  regulValidees: number   // régularisations validées
  regulEnAttente: number  // régularisations envoyées, pas encore validées
  reste: number           // reste à régulariser (écarts − régularisations validées)
  list: any[]             // versements avec écart (plus récents d'abord)
}

/** Résumé des écarts d'une liste de versements (une agence). */
export function summarizeEcarts(transfers: any[]): EcartSummary {
  const ts = transfers || []
  const withEcart = ts.filter(t => transferEcart(t) > 0)
  const ecarts = r2(withEcart.reduce((s, t) => s + transferEcart(t), 0))
  const regulValidees = r2(ts.filter(t => isRegulTransfer(t) && t.status === 'confirmed').reduce((s, t) => s + num(t.amount), 0))
  const regulEnAttente = r2(ts.filter(t => isRegulTransfer(t) && t.status === 'pending').reduce((s, t) => s + num(t.amount), 0))
  const date = (t: any) => t?.createdAt?.toMillis?.() ?? (t?.createdAt?.toDate?.()?.getTime() || 0)
  return { ecarts, regulValidees, regulEnAttente, reste: Math.max(0, r2(ecarts - regulValidees)), list: withEcart.sort((a, b) => date(b) - date(a)) }
}
