import { lazy, Suspense } from 'react'
import { Banknote } from 'lucide-react'

// 💰 Contrôle du COD de toutes les agences (lecture seule). L'ancien onglet AdminCodTab reste utilisé par
// AdminPage (/admin), avec ses propres données et actions.
const AdminCodControlTab = lazy(() => import('../admin/tabs/AdminCodControlTab'))

const AdminCodPage = () => {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center">
          <Banknote className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Contre Remboursement</h1>
          <p className="text-sm text-gray-500">Contrôle du COD (retour de fonds) de toutes les agences : collecte, remise, envoi, pointage, paiement de l'expéditeur</p>
        </div>
      </div>

      <Suspense fallback={
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        </div>
      }>
        <AdminCodControlTab />
      </Suspense>
    </div>
  )
}

export default AdminCodPage
