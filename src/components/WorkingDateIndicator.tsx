import { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { getWorkingDateDisplay } from '../utils/workingDate'

export default function WorkingDateIndicator() {
  const [displayDate, setDisplayDate] = useState(getWorkingDateDisplay())

  useEffect(() => {
    const handleChange = () => {
      setDisplayDate(getWorkingDateDisplay())
    }

    window.addEventListener('working-date-changed', handleChange)
    return () => window.removeEventListener('working-date-changed', handleChange)
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">
      <Calendar className="w-4 h-4" />
      <span>{displayDate}</span>
    </div>
  )
}
