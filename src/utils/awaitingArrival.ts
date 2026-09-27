/**
 * 🚛 Un colis est-il VRAIMENT en attente d'arrivage dans l'agence de destination ?
 *
 * Le champ `status` seul ne suffit pas : certains colis gardent `status: 'En transit'`
 * alors que leur historique montre qu'ils ont déjà été réceptionnés (Arrivé en agence),
 * assignés à un livreur, voire livrés. Ils gonflaient le badge « Arrivages » et la liste.
 * On se fie donc aussi à l'historique et aux marqueurs d'arrivée.
 */
const lastHistoryStatus = (p: any): string | undefined => {
  const h = Array.isArray(p?.history) ? p.history : []
  if (h.length === 0) return undefined
  let last = h[h.length - 1]
  for (const e of h) {
    if (e?.timestamp && last?.timestamp && String(e.timestamp) > String(last.timestamp)) last = e
  }
  return last?.status
}

export function isAwaitingArrival(p: any, city?: string): boolean {
  if (!p) return false
  if (city && p.destinationCity !== city) return false
  if (p.status === 'Retour en transit') return true
  if (p.status !== 'En transit') return false
  if (p.deliveredAt) return false
  const last = lastHistoryStatus(p)
  // Historique présent : la dernière étape doit être le chargement (En transit)
  if (last !== undefined) return last === 'En transit'
  // Pas d'historique : se fier au marqueur d'arrivée
  return !p.destinationArrivedAt
}
