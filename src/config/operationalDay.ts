/**
 * ⏰ Configuration de la journée d'exploitation
 *
 * Standard professionnel pour systèmes logistiques où la "journée opérationnelle"
 * ne correspond pas à la journée calendaire (00:00-23:59).
 *
 * Exemple: Journée 08:00→06:00 (lendemain)
 * - Expédition du 23 juillet à 20:00 → Journée opérationnelle du 23 juillet
 * - Expédition du 24 juillet à 02:00 → Journée opérationnelle du 23 juillet (même journée!)
 * - Expédition du 24 juillet à 10:00 → Journée opérationnelle du 24 juillet
 */

export const OPERATIONAL_DAY_CONFIG = {
  /**
   * ⏰ Heure de début de la journée opérationnelle (format 24h)
   *
   * Toute expédition créée après cette heure appartient à la journée opérationnelle courante.
   *
   * Exemples:
   * - 0 = minuit (journée calendaire standard)
   * - 6 = 6h du matin
   * - 8 = 8h du matin (votre cas)
   */
  START_HOUR: 8,

  /**
   * ⏰ Heure de fin de la journée opérationnelle (format 24h, lendemain)
   *
   * Toute expédition créée avant cette heure appartient à la journée opérationnelle PRÉCÉDENTE.
   *
   * Exemples:
   * - 0 = minuit (se termine à 23:59:59 du même jour)
   * - 2 = 2h du matin (lendemain)
   * - 6 = 6h du matin (votre cas)
   */
  END_HOUR: 6,

  /**
   * 🏷️ Labels pour l'affichage UI
   */
  LABELS: {
    fr: {
      operationalDay: 'Journée du',
      currentDay: 'Journée en cours',
      previousDay: 'Journée précédente',
      nextDay: 'Journée suivante',
      timeRange: (start: string, end: string) => `${start} → ${end}`,
    },
  },
}

/**
 * 🔄 Convertit une date calendaire en date de journée opérationnelle
 *
 * @param date Date calendaire (timestamp ou Date)
 * @returns Date de début de la journée opérationnelle correspondante
 *
 * @example
 * // Journée: 08:00→06:00
 * getOperationalDay(new Date('2026-07-24T02:00:00'))
 * // → 2026-07-23T08:00:00 (appartient à la journée du 23)
 *
 * getOperationalDay(new Date('2026-07-24T10:00:00'))
 * // → 2026-07-24T08:00:00 (appartient à la journée du 24)
 */
export function getOperationalDay(date: Date | number): Date {
  const d = typeof date === 'number' ? new Date(date) : new Date(date)
  const hour = d.getHours()

  // Si avant l'heure de fin (ex: 02:00 < 06:00)
  // → On recule d'un jour car ça appartient à la journée précédente
  if (hour < OPERATIONAL_DAY_CONFIG.END_HOUR) {
    d.setDate(d.getDate() - 1)
  }

  // Définir l'heure de début de journée opérationnelle
  d.setHours(OPERATIONAL_DAY_CONFIG.START_HOUR, 0, 0, 0)

  return d
}

/**
 * 📅 Obtient la date de journée opérationnelle au format YYYY-MM-DD
 *
 * Utile pour le grouping et l'affichage
 *
 * @example
 * getOperationalDayString(new Date('2026-07-24T02:00:00'))
 * // → '2026-07-23' (appartient à la journée du 23)
 */
export function getOperationalDayString(date: Date | number): string {
  const opDay = getOperationalDay(date)
  return opDay.toISOString().split('T')[0]
}

/**
 * ⏰ Obtient la plage horaire complète d'une journée opérationnelle
 *
 * @param operationalDate Date de journée opérationnelle (ou date calendaire)
 * @returns { start: Date, end: Date }
 *
 * @example
 * // Pour la journée opérationnelle du 23 juillet
 * getOperationalDayRange(new Date('2026-07-23'))
 * // → {
 * //   start: 2026-07-23T08:00:00,
 * //   end: 2026-07-24T05:59:59
 * // }
 */
export function getOperationalDayRange(operationalDate: Date | string): {
  start: Date
  end: Date
} {
  const baseDate =
    typeof operationalDate === 'string'
      ? new Date(operationalDate)
      : new Date(operationalDate)

  // Début: Jour donné à START_HOUR
  const start = new Date(baseDate)
  start.setHours(OPERATIONAL_DAY_CONFIG.START_HOUR, 0, 0, 0)

  // Fin: Lendemain à END_HOUR - 1 seconde
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(OPERATIONAL_DAY_CONFIG.END_HOUR, 0, 0, -1) // -1ms pour avoir 05:59:59.999

  return { start, end }
}

/**
 * 📊 Obtient la journée opérationnelle actuelle
 *
 * @returns Date de début de la journée opérationnelle en cours
 *
 * @example
 * // Si maintenant = 24 juillet 2026 à 02:00
 * getCurrentOperationalDay()
 * // → 2026-07-23T08:00:00 (encore dans la journée du 23)
 *
 * // Si maintenant = 24 juillet 2026 à 10:00
 * getCurrentOperationalDay()
 * // → 2026-07-24T08:00:00 (nouvelle journée du 24)
 */
export function getCurrentOperationalDay(): Date {
  return getOperationalDay(new Date())
}

/**
 * 📅 Obtient la journée opérationnelle actuelle au format string
 */
export function getCurrentOperationalDayString(): string {
  return getOperationalDayString(new Date())
}

/**
 * ✅ Vérifie si une date appartient à une journée opérationnelle donnée
 *
 * @param date Date à vérifier
 * @param operationalDay Date de la journée opérationnelle (format YYYY-MM-DD ou Date)
 * @returns true si la date appartient à cette journée opérationnelle
 *
 * @example
 * isInOperationalDay(
 *   new Date('2026-07-24T02:00:00'),
 *   '2026-07-23'
 * ) // → true (02:00 du 24 = encore journée du 23)
 *
 * isInOperationalDay(
 *   new Date('2026-07-24T10:00:00'),
 *   '2026-07-23'
 * ) // → false (10:00 du 24 = nouvelle journée du 24)
 */
export function isInOperationalDay(
  date: Date | number,
  operationalDay: Date | string
): boolean {
  const dateOpDay = getOperationalDayString(date)
  const targetOpDay =
    typeof operationalDay === 'string'
      ? operationalDay
      : getOperationalDayString(operationalDay)

  return dateOpDay === targetOpDay
}

/**
 * 🎨 Formate une journée opérationnelle pour l'affichage UI
 *
 * @param operationalDay Date ou string YYYY-MM-DD
 * @param includeTimeRange Inclure la plage horaire (08:00 → 06:00)?
 * @returns String formaté
 *
 * @example
 * formatOperationalDay('2026-07-23', false)
 * // → 'Journée du 23 juillet 2026'
 *
 * formatOperationalDay('2026-07-23', true)
 * // → 'Journée du 23 juillet 2026 (08:00 → 06:00 lendemain)'
 */
export function formatOperationalDay(
  operationalDay: Date | string,
  includeTimeRange = false
): string {
  const date =
    typeof operationalDay === 'string'
      ? new Date(operationalDay)
      : operationalDay

  const formatted = date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (!includeTimeRange) {
    return `${OPERATIONAL_DAY_CONFIG.LABELS.fr.operationalDay} ${formatted}`
  }

  const startHour = String(OPERATIONAL_DAY_CONFIG.START_HOUR).padStart(2, '0')
  const endHour = String(OPERATIONAL_DAY_CONFIG.END_HOUR).padStart(2, '0')

  return `${OPERATIONAL_DAY_CONFIG.LABELS.fr.operationalDay} ${formatted} (${startHour}:00 → ${endHour}:00 lendemain)`
}

/**
 * 🔍 Groupe des expéditions par journée opérationnelle
 *
 * @param parcels Liste d'expéditions avec createdAt
 * @returns Map<opDayString, Parcel[]>
 *
 * @example
 * const grouped = groupByOperationalDay(parcels)
 * // → {
 * //   '2026-07-23': [parcel1, parcel2, ...],
 * //   '2026-07-24': [parcel3, parcel4, ...],
 * // }
 */
export function groupByOperationalDay<T extends { createdAt: any }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  items.forEach(item => {
    const timestamp =
      typeof item.createdAt?.toDate === 'function'
        ? item.createdAt.toDate()
        : item.createdAt

    const opDay = getOperationalDayString(timestamp)

    if (!groups.has(opDay)) {
      groups.set(opDay, [])
    }
    groups.get(opDay)!.push(item)
  })

  return groups
}

/**
 * 📈 Obtient les statistiques d'une journée opérationnelle
 *
 * @param parcels Expéditions à analyser
 * @param operationalDay Date de la journée opérationnelle
 * @returns Stats de la journée
 */
export function getOperationalDayStats<T extends { createdAt: any }>(
  items: T[],
  operationalDay: string
): {
  total: number
  items: T[]
  operationalDay: string
  startTime: Date
  endTime: Date
} {
  const filtered = items.filter(item => {
    const timestamp =
      typeof item.createdAt?.toDate === 'function'
        ? item.createdAt.toDate()
        : item.createdAt
    return isInOperationalDay(timestamp, operationalDay)
  })

  const { start, end } = getOperationalDayRange(operationalDay)

  return {
    total: filtered.length,
    items: filtered,
    operationalDay,
    startTime: start,
    endTime: end,
  }
}
