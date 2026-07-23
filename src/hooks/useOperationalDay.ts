import { useState, useEffect, useMemo } from 'react'
import {
  getCurrentOperationalDay,
  getCurrentOperationalDayString,
  getOperationalDayRange,
  getOperationalDayString,
  formatOperationalDay,
  groupByOperationalDay,
  getOperationalDayStats,
  OPERATIONAL_DAY_CONFIG,
} from '../config/operationalDay'

/**
 * 🎯 Hook pour gérer la journée opérationnelle actuelle
 *
 * Met à jour automatiquement quand on change de journée opérationnelle
 *
 * @example
 * const { currentDay, dayString, range, formatted } = useOperationalDay()
 *
 * console.log(formatted) // "Journée du 23 juillet 2026"
 * console.log(range) // { start: Date, end: Date }
 */
export function useOperationalDay() {
  const [currentDay, setCurrentDay] = useState(() => getCurrentOperationalDay())
  const [dayString, setDayString] = useState(() =>
    getCurrentOperationalDayString()
  )

  // ⏰ Mise à jour automatique à chaque changement de journée
  useEffect(() => {
    const updateDay = () => {
      const newDay = getCurrentOperationalDay()
      const newDayString = getCurrentOperationalDayString()

      if (newDayString !== dayString) {
        setCurrentDay(newDay)
        setDayString(newDayString)
        console.log('🔄 Changement de journée opérationnelle:', newDayString)
      }
    }

    // Vérifier toutes les minutes
    const interval = setInterval(updateDay, 60000)

    return () => clearInterval(interval)
  }, [dayString])

  const range = useMemo(() => getOperationalDayRange(currentDay), [currentDay])

  const formatted = useMemo(
    () => formatOperationalDay(currentDay, false),
    [currentDay]
  )

  const formattedWithTime = useMemo(
    () => formatOperationalDay(currentDay, true),
    [currentDay]
  )

  return {
    /** Date de début de la journée opérationnelle courante */
    currentDay,

    /** String YYYY-MM-DD de la journée courante */
    dayString,

    /** Plage horaire complète { start, end } */
    range,

    /** Formaté pour UI: "Journée du 23 juillet 2026" */
    formatted,

    /** Formaté avec horaires: "Journée du 23 juillet 2026 (08:00 → 06:00 lendemain)" */
    formattedWithTime,

    /** Configuration actuelle */
    config: OPERATIONAL_DAY_CONFIG,
  }
}

/**
 * 🗓️ Hook pour sélecteur de journée opérationnelle
 *
 * Permet de naviguer entre les journées (précédente/suivante)
 *
 * @example
 * const { selectedDay, goToPrevious, goToNext, goToToday, formatted } = useOperationalDaySelector()
 *
 * <button onClick={goToPrevious}>← Jour précédent</button>
 * <span>{formatted}</span>
 * <button onClick={goToNext}>Jour suivant →</button>
 * <button onClick={goToToday}>Aujourd'hui</button>
 */
export function useOperationalDaySelector(initialDay?: Date | string) {
  const { currentDay: today } = useOperationalDay()

  const [selectedDay, setSelectedDay] = useState(() => {
    if (!initialDay) return today
    if (typeof initialDay === 'string') return new Date(initialDay)
    return initialDay
  })

  const selectedDayString = useMemo(
    () => getOperationalDayString(selectedDay),
    [selectedDay]
  )

  const range = useMemo(
    () => getOperationalDayRange(selectedDay),
    [selectedDay]
  )

  const formatted = useMemo(
    () => formatOperationalDay(selectedDay, false),
    [selectedDay]
  )

  const formattedWithTime = useMemo(
    () => formatOperationalDay(selectedDay, true),
    [selectedDay]
  )

  const isToday = useMemo(
    () => selectedDayString === getOperationalDayString(today),
    [selectedDayString, today]
  )

  // Navigation
  const goToPrevious = () => {
    setSelectedDay(prev => {
      const newDay = new Date(prev)
      newDay.setDate(newDay.getDate() - 1)
      return newDay
    })
  }

  const goToNext = () => {
    setSelectedDay(prev => {
      const newDay = new Date(prev)
      newDay.setDate(newDay.getDate() + 1)
      return newDay
    })
  }

  const goToToday = () => {
    setSelectedDay(today)
  }

  const goToDate = (date: Date | string) => {
    if (typeof date === 'string') {
      setSelectedDay(new Date(date))
    } else {
      setSelectedDay(date)
    }
  }

  return {
    /** Journée opérationnelle sélectionnée */
    selectedDay,

    /** String YYYY-MM-DD */
    selectedDayString,

    /** Plage horaire { start, end } */
    range,

    /** Formaté: "Journée du 23 juillet 2026" */
    formatted,

    /** Formaté avec horaires */
    formattedWithTime,

    /** Est-ce la journée actuelle? */
    isToday,

    /** Aller au jour précédent */
    goToPrevious,

    /** Aller au jour suivant */
    goToNext,

    /** Retour à aujourd'hui */
    goToToday,

    /** Aller à une date spécifique */
    goToDate,

    /** Changer directement la journée */
    setSelectedDay,
  }
}

/**
 * 📊 Hook pour filtrer et grouper des items par journée opérationnelle
 *
 * @param items Items à filtrer (avec propriété createdAt)
 * @param selectedDay Journée opérationnelle sélectionnée (optionnel, défaut = aujourd'hui)
 *
 * @example
 * const { filteredItems, groupedItems, stats } = useOperationalDayFilter(parcels, selectedDay)
 *
 * console.log(stats.total) // Nombre d'items dans cette journée
 * console.log(groupedItems) // Map groupée par journée opérationnelle
 */
export function useOperationalDayFilter<T extends { createdAt: any }>(
  items: T[],
  selectedDay?: Date | string | null
) {
  const { currentDay } = useOperationalDay()

  const targetDay = selectedDay || currentDay

  const targetDayString = useMemo(
    () =>
      typeof targetDay === 'string'
        ? targetDay
        : getOperationalDayString(targetDay),
    [targetDay]
  )

  // Items filtrés pour la journée sélectionnée
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const timestamp =
        typeof item.createdAt?.toDate === 'function'
          ? item.createdAt.toDate()
          : item.createdAt

      const itemDayString = getOperationalDayString(timestamp)
      return itemDayString === targetDayString
    })
  }, [items, targetDayString])

  // Tous les items groupés par journée
  const groupedItems = useMemo(() => {
    return groupByOperationalDay(items)
  }, [items])

  // Stats de la journée sélectionnée
  const stats = useMemo(() => {
    return getOperationalDayStats(items, targetDayString)
  }, [items, targetDayString])

  return {
    /** Items de la journée sélectionnée */
    filteredItems,

    /** Tous les items groupés par journée opérationnelle */
    groupedItems,

    /** Statistiques de la journée sélectionnée */
    stats,

    /** String de la journée sélectionnée */
    targetDayString,
  }
}
