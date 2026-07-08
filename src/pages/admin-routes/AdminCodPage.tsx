import { lazy, Suspense } from 'react'
import { Banknote } from 'lucide-react'

const AdminCodTab = lazy(() => import('../admin/tabs/AdminCodTab'))

const AdminCodPage = () => {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center">
          <Banknote className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Contre Remboursement</h1>
          <p className="text-sm text-gray-500">Gestion des COD et encaissements</p>
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
        <AdminCodTab
          codDatePreset={'all'}
          codDateFrom={''}
          codDateTo={''}
          setCodDatePreset={() => {}}
          setCodDateFrom={() => {}}
          setCodDateTo={() => {}}
          codDateFiltered={[]}
          codStatsFiltered={{}}
          codFilter={'all'}
          setCodFilter={() => {}}
          codSearch={''}
          setCodSearch={() => {}}
          codRequestMsg={null}
          codRequestDrafts={{}}
          setCodRequestDrafts={() => {}}
          codRequestBusy={''}
          agentCodRequests={[]}
          filteredCod={[]}
          adminEmail={''}
          handleBatchSettleAdmin={() => {}}
          handleRemitCod={() => {}}
          handleSettleCodAdmin={() => {}}
          handleSendCodRequest={() => {}}
          handleReplyAgentCodRequest={() => {}}
          resolveAgentCodRequest={() => {}}
        />
      </Suspense>
    </div>
  )
}

export default AdminCodPage
