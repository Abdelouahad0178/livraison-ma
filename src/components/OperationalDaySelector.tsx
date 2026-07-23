import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'
import { useOperationalDaySelector } from '../hooks/useOperationalDay'
import { OPERATIONAL_DAY_CONFIG } from '../config/operationalDay'

interface OperationalDaySelectorProps {
  /** Journée sélectionnée (contrôlé de l'extérieur) */
  selectedDay?: Date | string

  /** Callback quand la journée change */
  onDayChange?: (day: Date) => void

  /** Afficher les horaires de la journée? */
  showTimeRange?: boolean

  /** Afficher le bouton "Aujourd'hui"? */
  showTodayButton?: boolean

  /** Classe CSS personnalisée */
  className?: string
}

/**
 * 🗓️ Sélecteur de journée opérationnelle
 *
 * Composant réutilisable pour naviguer entre les journées d'exploitation
 *
 * @example
 * <OperationalDaySelector
 *   selectedDay={selectedDay}
 *   onDayChange={setSelectedDay}
 *   showTimeRange={true}
 *   showTodayButton={true}
 * />
 */
export function OperationalDaySelector({
  selectedDay: externalSelectedDay,
  onDayChange,
  showTimeRange = false,
  showTodayButton = true,
  className = '',
}: OperationalDaySelectorProps) {
  const {
    selectedDay,
    formatted,
    formattedWithTime,
    isToday,
    goToPrevious,
    goToNext,
    goToToday,
    range,
  } = useOperationalDaySelector(externalSelectedDay)

  // Gérer les changements (mode contrôlé vs non-contrôlé)
  const handlePrevious = () => {
    goToPrevious()
    if (onDayChange) {
      const prev = new Date(selectedDay)
      prev.setDate(prev.getDate() - 1)
      onDayChange(prev)
    }
  }

  const handleNext = () => {
    goToNext()
    if (onDayChange) {
      const next = new Date(selectedDay)
      next.setDate(next.getDate() + 1)
      onDayChange(next)
    }
  }

  const handleToday = () => {
    goToToday()
    if (onDayChange) {
      const today = new Date()
      onDayChange(today)
    }
  }

  const displayText = showTimeRange ? formattedWithTime : formatted

  const startHour = String(OPERATIONAL_DAY_CONFIG.START_HOUR).padStart(2, '0')
  const endHour = String(OPERATIONAL_DAY_CONFIG.END_HOUR).padStart(2, '0')

  return (
    <div
      className={`flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 px-4 py-3 rounded-lg border border-blue-200 dark:border-gray-600 shadow-sm ${className}`}
    >
      {/* Bouton Précédent */}
      <button
        onClick={handlePrevious}
        className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-colors group"
        title="Journée précédente"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-blue-600" />
      </button>

      {/* Affichage de la journée */}
      <div className="flex-1 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {displayText}
          </span>
        </div>

        {/* Badge "Aujourd'hui" */}
        {isToday && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-bold">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            En cours
          </span>
        )}

        {/* Horaires (si demandé) */}
        {showTimeRange && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">
              {startHour}:00 → {endHour}:00
            </span>
          </div>
        )}
      </div>

      {/* Bouton Suivant */}
      <button
        onClick={handleNext}
        className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-colors group"
        title="Journée suivante"
      >
        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-blue-600" />
      </button>

      {/* Bouton "Aujourd'hui" */}
      {showTodayButton && !isToday && (
        <button
          onClick={handleToday}
          className="ml-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-sm font-bold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-105"
          title="Retour à la journée en cours"
        >
          Aujourd'hui
        </button>
      )}
    </div>
  )
}

/**
 * 🎨 Composant compact pour affichage simple de la journée courante
 */
export function OperationalDayBadge({
  showTimeRange = false,
  className = '',
}: {
  showTimeRange?: boolean
  className?: string
}) {
  const { formatted, formattedWithTime, isToday } =
    useOperationalDaySelector()

  const displayText = showTimeRange ? formattedWithTime : formatted

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        isToday
          ? 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700'
          : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      } ${className}`}
    >
      <Calendar
        className={`w-4 h-4 ${
          isToday
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-600 dark:text-gray-400'
        }`}
      />
      <span
        className={`text-sm font-semibold ${
          isToday
            ? 'text-green-700 dark:text-green-200'
            : 'text-gray-700 dark:text-gray-200'
        }`}
      >
        {displayText}
      </span>
    </div>
  )
}
