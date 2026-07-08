import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import {
  getWorkingDateStr,
  setWorkingDate,
  getWorkingDateDisplay,
  nextDay,
  previousDay,
  resetToToday
} from '../utils/workingDate'

export default function WorkingDateManager() {
  const [dateStr, setDateStr] = useState(getWorkingDateStr())
  const [displayDate, setDisplayDate] = useState(getWorkingDateDisplay())

  // Écouter les changements de date
  useEffect(() => {
    const handleChange = () => {
      setDateStr(getWorkingDateStr())
      setDisplayDate(getWorkingDateDisplay())
    }

    window.addEventListener('working-date-changed', handleChange)
    return () => window.removeEventListener('working-date-changed', handleChange)
  }, [])

  const handleDateChange = async (newDate: string) => {
    await setWorkingDate(newDate)
  }

  const handlePreviousDay = async () => {
    await previousDay()
  }

  const handleNextDay = async () => {
    await nextDay()
  }

  const handleResetToday = async () => {
    if (window.confirm('Réinitialiser à la date du jour système?')) {
      await resetToToday()
    }
  }

  // Vérifier si la date de travail est différente de la date système
  const systemDate = new Date()
  const systemDateStr = `${systemDate.getFullYear()}-${String(systemDate.getMonth() + 1).padStart(2, '0')}-${String(systemDate.getDate()).padStart(2, '0')}`
  const isDifferentFromSystem = dateStr !== systemDateStr

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
          <Calendar className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-800 text-lg">📅 Date de Travail</h3>
          <p className="text-sm text-gray-600">Contrôle manuel de la date du système</p>
        </div>
      </div>

      {/* Date actuelle en grand */}
      <div className="bg-white rounded-xl p-6 mb-4 text-center border-2 border-blue-300">
        <div className="text-sm text-gray-500 mb-2">Date de travail actuelle</div>
        <div className="text-4xl font-black text-blue-600 mb-2">{displayDate}</div>
        {isDifferentFromSystem && (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
            <span>⚠️</span>
            <span>Date différente du système ({new Date().toLocaleDateString('fr-FR')})</span>
          </div>
        )}
      </div>

      {/* Contrôles */}
      <div className="space-y-3">
        {/* Sélecteur de date */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousDay}
            className="p-3 bg-white hover:bg-blue-50 border-2 border-blue-200 rounded-lg transition"
            title="Jour précédent"
          >
            <ChevronLeft className="w-5 h-5 text-blue-600" />
          </button>

          <input
            type="date"
            value={dateStr}
            onChange={e => handleDateChange(e.target.value)}
            className="flex-1 px-4 py-3 border-2 border-blue-200 rounded-lg text-center font-bold text-blue-600 text-lg focus:border-blue-400 focus:outline-none"
          />

          <button
            onClick={handleNextDay}
            className="p-3 bg-white hover:bg-blue-50 border-2 border-blue-200 rounded-lg transition"
            title="Jour suivant"
          >
            <ChevronRight className="w-5 h-5 text-blue-600" />
          </button>
        </div>

        {/* Bouton reset */}
        <button
          onClick={handleResetToday}
          className="w-full px-4 py-3 bg-white hover:bg-blue-50 border-2 border-blue-200 rounded-lg font-semibold text-blue-600 transition flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Réinitialiser à la date du jour système
        </button>
      </div>

      {/* Info */}
      <div className="mt-4 bg-blue-100 border border-blue-300 rounded-lg p-3">
        <div className="flex items-start gap-2 text-sm text-blue-800">
          <span className="text-lg">ℹ️</span>
          <div>
            <strong>Mode manuel activé :</strong> La date ne change pas automatiquement.
            Vous devez la modifier manuellement chaque jour si nécessaire.
          </div>
        </div>
      </div>
    </div>
  )
}
