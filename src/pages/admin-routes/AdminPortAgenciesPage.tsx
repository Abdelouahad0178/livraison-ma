import { lazy, Suspense, useState } from 'react'

const AdminPortAgenciesTab = lazy(() => import('../admin/tabs/AdminPortAgenciesTab'))

const AdminPortAgenciesPage = () => {
  const [datePreset, setDatePreset] = useState('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const allParcels: any[] = [] // Placeholder - dans un contexte réel, cela viendrait d'un hook ou contexte

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
          allParcels={allParcels}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
        />
      </Suspense>
    </div>
  )
}

export default AdminPortAgenciesPage
