import { Banknote, Package, TrendingUp } from 'lucide-react'
import { fmtFixed as fmtAmt } from '../../utils/formatNumber'

/** Chiffres utilisés (computeCaisseView().filteredStats, src/utils/agencyCaisseRules.ts). */
export interface CaisseSummaryStats {
  portsACollecterCount: number; portsACollecterMontant: number
  portsCollectes: number; portsCollectesMontant: number
  enRetardCount: number
  portsPayesARecevoirCount: number; portsPayesARecevoirMontant: number
  portsPayesRecusCount: number; portsPayesRecusMontant: number
  ramassesRemisCount: number; ramassesRemisMontant: number
}

const exp = (n: number) => `${n} expédition${n > 1 ? 's' : ''}`

/**
 * 🧾 3 cartes du haut — composant UNIQUE de Caisse Agence (chef d'agence) et de la Collecte du soir
 * (chef d'exploitation) : mêmes chiffres, même présentation (montant en gras, nombre d'expéditions à part).
 * - Ports dus : total = collectés + reste à collecter (dont en retard) ;
 * - Ports payés à ramasser : reçus (chef d'agence, ou remis au chef d'exploitation) / à recevoir ;
 * - À verser : ports dus collectés + ports payés à ramasser reçus (`aVerser`, calculé par la page).
 */
export default function CaisseSummaryCards({ stats, aVerser }: Readonly<{ stats: CaisseSummaryStats; aVerser: number }>) {
  const ppRecusN = stats.portsPayesRecusCount + stats.ramassesRemisCount
  const ppRecusM = stats.portsPayesRecusMontant + stats.ramassesRemisMontant
  const ppARecevoirN = Math.max(0, stats.portsPayesARecevoirCount - stats.ramassesRemisCount)
  const ppARecevoirM = Math.max(0, stats.portsPayesARecevoirMontant - stats.ramassesRemisMontant)
  const line = (label: string, n: number, m: number, cls: string) => (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={cls}>{label}</span>
      <span className="tabular-nums text-right"><b className={cls}>{fmtAmt(m)} DH</b> <span className="text-xs text-gray-500">({exp(n)})</span></span>
    </div>
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 💰 Ports dus — total = collectés + reste à collecter (« reste » ≠ total du jour) */}
      <div className="bg-linear-to-br from-blue-50 to-green-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-bold text-blue-800"><Package className="w-5 h-5 text-blue-600" /> Ports dus</span>
          <span className="text-right tabular-nums"><b className="text-sm text-blue-900">{fmtAmt(stats.portsCollectesMontant + stats.portsACollecterMontant)} DH</b> <span className="text-xs text-gray-500">({exp(stats.portsCollectes + stats.portsACollecterCount)})</span></span>
        </div>
        {line('Collectés', stats.portsCollectes, stats.portsCollectesMontant, 'text-green-700')}
        {line('Reste à collecter', stats.portsACollecterCount, stats.portsACollecterMontant, 'text-blue-700')}
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-amber-700">dont en retard (&gt; 24 h)</span>
          <span className="text-xs text-amber-700 tabular-nums"><b>{exp(stats.enRetardCount)}</b></span>
        </div>
      </div>

      {/* 📬 Ports payés à ramasser */}
      <div className="bg-linear-to-br from-indigo-50 to-sky-50 border border-indigo-200 rounded-xl p-4 space-y-1.5"
        title="Ports payés à ramasser : au guichet par « En gare - ville » (toutes destinations) et par les livreurs de ramassage">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-bold text-indigo-800"><Banknote className="w-5 h-5 text-indigo-600" /> Ports payés à ramasser</span>
          <span className="text-right tabular-nums"><b className="text-sm text-indigo-900">{fmtAmt(ppRecusM + ppARecevoirM)} DH</b> <span className="text-xs text-gray-500">({exp(ppRecusN + ppARecevoirN)})</span></span>
        </div>
        {line('Reçus', ppRecusN, ppRecusM, 'text-teal-700')}
        {line('À recevoir', ppARecevoirN, ppARecevoirM, 'text-indigo-700')}
      </div>

      {/* 💼 À verser */}
      <div className="bg-linear-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-sm font-bold text-purple-800"><TrendingUp className="w-5 h-5 text-purple-600" /> À verser</span>
        </div>
        <div className="text-2xl font-bold text-purple-900 tabular-nums">{fmtAmt(aVerser)} DH</div>
        <div className="text-xs text-purple-700 font-medium mt-1">Ports dus collectés + ports payés à ramasser reçus</div>
      </div>
    </div>
  )
}
