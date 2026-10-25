/** Les événements du suivi sont affichés à l'heure du Maroc, quel que soit le poste. */
export function formatTrackingDate(value: string | null | undefined, timeKnown = true): string {
  if (!value) return 'Date indisponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return date.toLocaleString('fr-MA', {
    timeZone: 'Africa/Casablanca',
    day: '2-digit', month: 'short', year: 'numeric',
    ...(timeKnown ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  })
}
