import { lazy, Suspense, useState } from 'react'
import { useOperationalDaySelector } from '../../hooks/useOperationalDay'

const AdminPortAgenciesTab = lazy(() => import('../admin/tabs/AdminPortAgenciesTab'))

const AdminPortAgenciesPage = () => {
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 🗓️ Journée opérationnelle
  const {
    selectedDay: operationalDayRaw,
    setSelectedDay: setOperationalDayRaw,
  } = useOperationalDaySelector()

  // Wrapper pour accepter null (reset vers aujourd'hui)
  const operationalDay: Date | null = operationalDayRaw
  const setOperationalDay = (day: Date | null) => {
    if (day === null) {
      setOperationalDayRaw(new Date()) // Reset vers aujourd'hui
    } else {
      setOperationalDayRaw(day)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📮 Port par agence</h1>
        <p className="text-sm text-gray-500 mt-1">Statistiques détaillées du port par ville</p>
      </div>

      <Suspense fallback={
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        </div>
      }>
        <AdminPortAgenciesTab
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          operationalDay={operationalDay}
          setOperationalDay={setOperationalDay}
        />
      </Suspense>
    </div>
  )
}

export default AdminPortAgenciesPage
