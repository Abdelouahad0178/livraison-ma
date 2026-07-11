import { useMemo, useState } from 'react'
import {
  Truck, Banknote, Clock, CheckCircle2, X, Wallet, ArrowUpRight, Landmark,
} from 'lucide-react'
import { auth } from '../../firebase/config'
import { fmt } from '../../utils/formatNumber'
import DirectorVersementsTab from './tabs/DirectorVersementsTab'
import VersementAdminModal from './components/VersementAdminModal'

const PAYMENT_META: Record<string, { label: string, emoji: string }> = {
  especes:  { label: 'Espèces',  emoji: '💵' },
  cheque:   { label: 'Chèque',   emoji: '📝' },
  virement: { label: 'Virement', emoji: '🏦' },
}
// Type de versement — les anciens transferts sans champ `type` sont traités comme Port Dû
const TYPE_META: Record<string, { label: string, emoji: string, cls: string }> = {
  port_du: { label: 'Port Dû', emoji: '📮', cls: 'bg-orange-100 text-orange-700' },
  cod:     { label: 'COD',     emoji: '💰', cls: 'bg-green-100 text-green-700' },
}
const transferType = (t: any): string => (t.type === 'cod' ? 'cod' : 'port_du')
const STATUS_META: Record<string, { label: string, cls: string }> = {
  pending:   { label: '⏳ En attente', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  confirmed: { label: '✅ Validé',     cls: 'bg-green-50 text-green-700 border-green-200'   },
  rejected:  { label: '❌ Rejeté',     cls: 'bg-red-50 text-red-700 border-red-200'         },
}

const sumAmounts = (list: any[]) => list.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0)
const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Caisse du Chef d'agence — version simple, deux flux :
 *   1. "Versements Livreurs" : les livreurs versent leurs collectes (Port Dû + COD)
 *      au chef, qui valide ou rejette (DirectorVersementsTab).
 *   2. "Verser à l'Admin" : le chef verse l'argent collecté à l'admin
 *      (VersementAdminModal + historique des transferts).
 */
export default function DirectorCaisseSimple({
  profile,
  agencyCash,
  driverVersements = [],
  adminTransfers = [],
}: any) {
  const [activeTab, setActiveTab] = useState<'livreurs' | 'admin'>('livreurs')
  const [versementAdminModal, setVersementAdminModal] = useState(false)

  const city = profile?.city

  // ── Flux 1 : Livreurs → Chef ────────────────────────────────────────────────
  const livStats = useMemo(() => {
    const pending   = driverVersements.filter((v: any) => v.status === 'pending')
    const confirmed = driverVersements.filter((v: any) => v.status === 'confirmed')
    return {
      pendingCount:  pending.length,
      pendingDH:     sumAmounts(pending),
      confirmedDH:   sumAmounts(confirmed),
      // Séparation Port Dû / COD sur les versements validés
      portDuConfirmedDH: sumAmounts(confirmed.filter((v: any) => v.type === 'port_du')),
      codConfirmedDH:    sumAmounts(confirmed.filter((v: any) => v.type === 'cod')),
    }
  }, [driverVersements])

  // ── Flux 2 : Chef → Admin ───────────────────────────────────────────────────
  const myTransfers = useMemo(
    () => adminTransfers.filter((t: any) =>
      t.fromRole === 'chef_agence' && (!city || t.city === city)
    ),
    [adminTransfers, city]
  )

  const adminStats = useMemo(() => {
    const pending   = myTransfers.filter((t: any) => t.status === 'pending')
    const confirmed = myTransfers.filter((t: any) => t.status === 'confirmed')
    const rejected  = myTransfers.filter((t: any) => t.status === 'rejected')
    // Versé à l'admin (en attente + validé), séparé Port Dû / COD
    const active = [...pending, ...confirmed]
    return {
      pendingCount:   pending.length,
      pendingDH:      sumAmounts(pending),
      confirmedCount: confirmed.length,
      confirmedDH:    sumAmounts(confirmed),
      rejectedCount:  rejected.length,
      rejectedDH:     sumAmounts(rejected),
      versedPortDuDH: sumAmounts(active.filter((t: any) => transferType(t) === 'port_du')),
      versedCodDH:    sumAmounts(active.filter((t: any) => transferType(t) === 'cod')),
    }
  }, [myTransfers])

  // Solde disponible du chef, séparé par type :
  // validé des livreurs − (versé à l'admin en attente + validé)
  const versedToAdmin     = adminStats.pendingDH + adminStats.confirmedDH
  const availablePortDu   = livStats.portDuConfirmedDH - adminStats.versedPortDuDH
  const availableCod      = livStats.codConfirmedDH - adminStats.versedCodDH
  const availableBalance  = livStats.confirmedDH - versedToAdmin

  const modalUser = { ...(profile || {}), uid: auth.currentUser?.uid, city }

  const TABS = [
    { key: 'livreurs' as const, label: 'Versements Livreurs', icon: Truck,    badge: livStats.pendingCount },
    { key: 'admin'    as const, label: "Verser à l'Admin",    icon: Banknote, badge: adminStats.pendingCount },
  ]

  return (
    <div className="mt-4 space-y-4">
      {/* Navigation : 2 onglets */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap border ${
              activeTab === tab.key
                ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-orange-500 text-white'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════ Onglet 1 : Versements Livreurs ══════════ */}
      {activeTab === 'livreurs' && (
        <DirectorVersementsTab profile={profile} versements={driverVersements} />
      )}

      {/* ══════════ Onglet 2 : Verser à l'Admin ══════════ */}
      {activeTab === 'admin' && (
        <div className="space-y-4">
          {/* Cartes de solde */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Solde disponible */}
            <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700 rounded-2xl p-4 text-white shadow-lg">
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
              <div className="relative">
                <p className="text-orange-100 text-xs font-semibold mb-1 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" /> Solde disponible à verser
                </p>
                <p className={`text-3xl font-black ${availableBalance >= 0 ? 'text-white' : 'text-red-200'}`}>
                  {availableBalance < 0 ? '−' : ''}{fmt(Math.abs(availableBalance))} DH
                </p>
                {/* Soldes disponibles par type */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-white/15 rounded-xl px-2.5 py-2">
                    <p className="text-orange-100 text-[10px] font-semibold uppercase">📮 Port Dû dispo</p>
                    <p className={`text-lg font-black ${availablePortDu >= 0 ? 'text-white' : 'text-red-200'}`}>
                      {availablePortDu < 0 ? '−' : ''}{fmt(Math.abs(availablePortDu))} DH
                    </p>
                  </div>
                  <div className="bg-white/15 rounded-xl px-2.5 py-2">
                    <p className="text-orange-100 text-[10px] font-semibold uppercase">💰 COD dispo</p>
                    <p className={`text-lg font-black ${availableCod >= 0 ? 'text-white' : 'text-red-200'}`}>
                      {availableCod < 0 ? '−' : ''}{fmt(Math.abs(availableCod))} DH
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-orange-100">📮 Port Dû validé</span>
                    <span className="font-bold">{fmt(livStats.portDuConfirmedDH)} DH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-100">💰 COD validé</span>
                    <span className="font-bold">{fmt(livStats.codConfirmedDH)} DH</span>
                  </div>
                  <div className="flex justify-between border-t border-white/20 pt-1">
                    <span className="text-orange-100">↗ Versé / en attente Admin</span>
                    <span className="font-bold">−{fmt(versedToAdmin)} DH</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Caisse agence (temps réel) */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" /> Caisse agence {city ? `— ${city}` : ''}
              </p>
              <p className="text-2xl font-black text-blue-700">{fmt(agencyCash?.solde || 0)} DH</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-blue-500">💵 Espèces</span>
                  <span className="font-bold text-blue-700">{fmt(agencyCash?.soldeEspeces || 0)} DH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-500">📝 Chèques</span>
                  <span className="font-bold text-blue-700">{fmt(agencyCash?.soldeCheques || 0)} DH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-500">🏦 Virement</span>
                  <span className="font-bold text-blue-700">{fmt(agencyCash?.soldeVirement || 0)} DH</span>
                </div>
              </div>
            </div>

            {/* Versements vers l'Admin + action */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5" /> Versements vers l'Admin
              </p>
              <div className="space-y-1.5 text-xs flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3 text-orange-500" /> En attente ({adminStats.pendingCount})</span>
                  <span className="font-bold text-orange-600">{fmt(adminStats.pendingDH)} DH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Validés ({adminStats.confirmedCount})</span>
                  <span className="font-bold text-green-600">{fmt(adminStats.confirmedDH)} DH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1"><X className="w-3 h-3 text-red-500" /> Rejetés ({adminStats.rejectedCount})</span>
                  <span className="font-bold text-red-500">{fmt(adminStats.rejectedDH)} DH</span>
                </div>
              </div>
              <button
                onClick={() => setVersementAdminModal(true)}
                className="mt-3 w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2"
              >
                <Banknote className="w-4 h-4" /> Nouveau versement à l'Admin
              </button>
            </div>
          </div>

          {/* Historique des versements vers l'Admin */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Historique des versements vers l'Admin</h3>
              <p className="text-xs text-gray-500 mt-1">Vos versements envoyés à l'administration centrale</p>
            </div>
            {myTransfers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Banknote className="w-10 h-10 mx-auto mb-3 opacity-25" />
                <p className="text-sm">Aucun versement pour le moment</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Date', 'Type', 'Mode paiement', 'Montant', 'Note', 'Statut'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {myTransfers.map((t: any) => {
                      const p = PAYMENT_META[t.paymentType] || { label: t.paymentType || '—', emoji: '💳' }
                      const s = STATUS_META[t.status] || STATUS_META.pending
                      const ty = TYPE_META[transferType(t)]
                      return (
                        <tr key={t.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${ty.cls}`}>
                              {ty.emoji} {ty.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                              {p.emoji} {p.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-black text-gray-800">{fmt(t.amount)} DH</span>
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="text-xs text-gray-500 truncate" title={t.note}>{t.note || '—'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${s.cls}`}>
                              {s.label}
                            </span>
                            {t.status === 'confirmed' && t.confirmedBy && (
                              <p className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">par {t.confirmedBy} · {fmtDate(t.confirmedAt)}</p>
                            )}
                            {t.status === 'rejected' && (
                              <p className="text-[10px] text-red-400 mt-1 max-w-[180px]" title={t.rejectionReason}>
                                {t.rejectedBy ? `par ${t.rejectedBy}` : ''}{t.rejectionReason ? ` — ${t.rejectionReason}` : ''}
                              </p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Versement Admin (déduit la caisse agence, en attente de validation Admin) */}
      {versementAdminModal && (
        <VersementAdminModal
          isOpen={versementAdminModal}
          onClose={() => setVersementAdminModal(false)}
          user={modalUser}
          agencyCash={agencyCash}
          typeBalances={{ port_du: availablePortDu, cod: availableCod }}
        />
      )}
    </div>
  )
}
