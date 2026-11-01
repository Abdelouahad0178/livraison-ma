/**
 * 🏷️ Libellé COURT de la période réellement chargée par la page Agent (filtre de date de l'onglet Expéditions) — lot 2
 * du diagnostic de la page chef d'agence (25/10/2026) : les chiffres de l'Accueil, de RETOUR FOND et de la Caisse portent
 * sur cette période seulement ; leur titre le dit (au lieu de charger davantage d'expéditions).
 * Mêmes préréglages que AgentPage : 'all' = « Récent » (30 dernières journées), 'operational', 'custom', 'day',
 * 'today', 'week', 'month'.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const isYmd = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export function loadedPeriodLabel(preset: string, dateFrom?: string, dateTo?: string, operationalDay?: Date | null): string {
  if (preset === 'operational' && operationalDay) return `journée du ${dm(operationalDay)}`
  if (preset === 'custom' && isYmd(dateFrom) && isYmd(dateTo)) {
    return dateFrom === dateTo ? `journée du ${dm(fromYmd(dateFrom!))}` : `du ${dm(fromYmd(dateFrom!))} au ${dm(fromYmd(dateTo!))}`
  }
  if (preset === 'custom' && isYmd(dateFrom)) return `depuis le ${dm(fromYmd(dateFrom!))}`
  if (preset === 'day' && isYmd(dateFrom)) return `journée du ${dm(fromYmd(dateFrom!))}`
  if (preset === 'today') return "aujourd'hui"
  if (preset === 'week') return '7 derniers jours'
  if (preset === 'month') return 'ce mois'
  return '30 derniers jours'
}
