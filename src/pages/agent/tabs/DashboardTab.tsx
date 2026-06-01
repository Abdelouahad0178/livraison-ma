import { lazy, Suspense } from 'react'
import { BarChart2 } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'

const AgentDashboardCharts = lazy(() => import('./AgentDashboardCharts'))

export default function DashboardTab() {
  const { profile, dashKPIs, dashCaisseKPIs, dashLast7, dashLast30, dashPieData, arrivages } = useAgentCtx()

  const today = new Date()
  const { todayCount, deliveredCount, codPending, totalCount, tauxLivraison, thisMonth } = dashKPIs
  const arrivagesMois = arrivages.filter((a: any) => {
    const d = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === thisMonth
  }).length
  const { totalIn, totalOut } = dashCaisseKPIs

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-500" /> Dashboard Agence
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {profile?.city} - {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Colis aujourd'hui</p>
          <p className="text-3xl font-black text-blue-600">{todayCount}</p>
          <p className="text-[10px] text-gray-400 mt-1">sur {totalCount} total</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Taux livraison</p>
          <p className="text-3xl font-black text-green-600">{tauxLivraison}%</p>
          <p className="text-[10px] text-gray-400 mt-1">{deliveredCount} livres</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">COD en attente</p>
          <p className="text-3xl font-black text-amber-600">{codPending}</p>
          <p className="text-[10px] text-gray-400 mt-1">colis non encaisses</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Arrivages ce mois</p>
          <p className="text-3xl font-black text-purple-600">{arrivagesMois}</p>
          <p className="text-[10px] text-gray-400 mt-1">{thisMonth}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl border border-green-100 shadow-sm p-4">
          <p className="text-xs text-green-700 mb-1">Total entrees caisse</p>
          <p className="text-2xl font-black text-green-700">{totalIn.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-white rounded-2xl border border-red-100 shadow-sm p-4">
          <p className="text-xs text-red-700 mb-1">Total sorties caisse</p>
          <p className="text-2xl font-black text-red-700">{totalOut.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 shadow-sm p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-blue-700 mb-1">Solde caisse</p>
          <p className={`text-2xl font-black ${totalIn - totalOut >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
            {(totalIn - totalOut).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="h-80 rounded-2xl border border-gray-100 bg-white animate-pulse" />}>
        <AgentDashboardCharts
          dashLast7={dashLast7}
          dashLast30={dashLast30}
          dashPieData={dashPieData}
        />
      </Suspense>
    </div>
  )
}
