import { useEffect, useState, useMemo } from 'react'
import { auth } from '../../../firebase/config'
import {
  subscribeDriverVersements,
  confirmDriverVersementChef,
  rejectDriverVersementChef,
  subscribeAgencyParcels,
} from '../../../firebase/firestore'
import { fmt } from '../../../utils/formatNumber'
import { Banknote, CheckCircle2, X, Clock, Search, AlertTriangle, Eye, Package } from 'lucide-react'
import DateFilter from '../../agent/DateFilter'
import { filterByDate } from '../../../utils/dateFilter'
import type { DateFilterPreset } from '../../../types'

const TYPE_META: Record<string, { label: string, emoji: string, cls: string }> = {
  port_du: { label: 'Port Dû', emoji: '📮', cls: 'bg-orange-100 text-orange-700' },
  cod:     { label: 'COD',     emoji: '💰', cls: 'bg-green-100 text-green-700' },
}
const PAYMENT_META: Record<string, { label: string, emoji: string }> = {
  especes:  { label: 'Espèces',  emoji: '💵' },
  cheque:   { label: 'Chèque',   emoji: '📋' },
  virement: { label: 'Virement', emoji: '🏦' },
}
const STATUS_META: Record<string, { label: string, cls: string }> = {
  pending:   { label: '⏳ En attente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  confirmed: { label: '✅ Validé',     cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected:  { label: '✗ Rejeté',      cls: 'bg-red-100 text-red-700 border-red-200' },
}

const versementDate = (v: any) => {
  if (v.createdAt?.toDate) return v.createdAt.toDate()
  return new Date(v.createdAt || 0)
}
const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Onglet Chef d'agence : validation des versements des livreurs (Port Dû / COD).
 * - Stats en attente / validés / rejetés
 * - Filtres par statut + recherche livreur
 * - Valider (crédite la caisse agence) ou Rejeter (avec motif, recrédite le livreur)
 *
 * Peut être utilisé en mode autonome (souscription interne) ou intégré :
 * si la prop `versements` est fournie (ex: depuis DirectorCaisseSimple), la
 * souscription interne est désactivée et les données du parent sont utilisées.
 */
export default function DirectorVersementsTab({ profile, versements: versementsProp }: any) {
  const [ownVersements, setOwnVersements] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('all')       // all | port_du | cod
  const [paymentFilter, setPaymentFilter] = useState('all') // all | especes | cheque | virement
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<any>(null)
  const [actionError, setActionError] = useState('')
  const [rejectModal, setRejectModal] = useState<any>(null) // { versement, reason, loading, error }
  const [detailsModal, setDetailsModal] = useState<any>(null) // { versement, loading }
  const [allParcels, setAllParcels] = useState<any[]>([])

  const city = profile?.city
  const isExternal = versementsProp !== undefined
  const versements = isExternal ? (versementsProp || []) : ownVersements

  useEffect(() => {
    if (!city || isExternal) return
    const unsub = subscribeDriverVersements(city, setOwnVersements, (err: any) =>
      console.error('subscribeDriverVersements:', err)
    )
    return () => unsub()
  }, [city, isExternal])

  // S'abonner aux colis de l'agence pour afficher les détails des expéditions
  useEffect(() => {
    if (!city) return
    const unsub = subscribeAgencyParcels(city, setAllParcels, (err: any) =>
      console.error('subscribeAgencyParcels:', err)
    )
    return () => unsub()
  }, [city])

  // Base filtrée (type + paiement + période + recherche) — les stats reflètent ces filtres
  const baseFiltered = useMemo(() => {
    let list = versements
    if (typeFilter !== 'all') list = list.filter((v: any) => v.type === typeFilter)
    if (paymentFilter !== 'all') list = list.filter((v: any) => v.paymentType === paymentFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((v: any) =>
        (v.driverName || '').toLowerCase().includes(q) ||
        (v.note || '').toLowerCase().includes(q)
      )
    }
    return filterByDate(list, datePreset, dateFrom, dateTo, versementDate)
  }, [versements, typeFilter, paymentFilter, search, datePreset, dateFrom, dateTo])

  const stats = useMemo(() => {
    const sum = (list: any[]) => list.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0)
    const pending   = baseFiltered.filter((v: any) => v.status === 'pending')
    const confirmed = baseFiltered.filter((v: any) => v.status === 'confirmed')
    const rejected  = baseFiltered.filter((v: any) => v.status === 'rejected')
    const byType = (list: any[]) => ({
      portDu: sum(list.filter((v: any) => v.type === 'port_du')),
      cod:    sum(list.filter((v: any) => v.type === 'cod')),
    })
    return {
      pendingDH: sum(pending),     pendingCount: pending.length,     pendingByType: byType(pending),
      confirmedDH: sum(confirmed), confirmedCount: confirmed.length, confirmedByType: byType(confirmed),
      rejectedDH: sum(rejected),   rejectedCount: rejected.length,   rejectedByType: byType(rejected),
      totalDH: sum(baseFiltered),  totalCount: baseFiltered.length,  totalByType: byType(baseFiltered),
    }
  }, [baseFiltered])

  const filtered = useMemo(() => {
    let list = baseFiltered
    if (statusFilter !== 'all') list = list.filter((v: any) => v.status === statusFilter)
    return [...list].sort((a, b) => versementDate(b).getTime() - versementDate(a).getTime())
  }, [baseFiltered, statusFilter])

  // Récupérer les expéditions d'un livreur avec COD ou Port Dû collecté
  const getDriverCollectedParcels = (driverId: string, type: 'cod' | 'port_du') => {
    return allParcels.filter((p: any) => {
      if (p.assignedDriverId !== driverId && p.deliveryDriverId !== driverId) return false
      if (p.status !== 'Livré') return false
      if (type === 'cod') {
        return p.codStatus === 'collected' && parseFloat(p.codAmount || 0) > 0
      } else {
        // Pour Port Dû, le champ est portStatus (pas portDuStatus)
        return p.portStatus === 'collected' && parseFloat(p.portDuAmount || 0) > 0
      }
    }).sort((a: any, b: any) => {
      const dateA = a.codCollectedAt || a.portCollectedAt || a.deliveredAt || ''
      const dateB = b.codCollectedAt || b.portCollectedAt || b.deliveredAt || ''
      return dateB.localeCompare(dateA)
    })
  }

  const handleConfirm = async (v: any) => {
    const typeLabel = TYPE_META[v.type]?.label || v.type
    if (!window.confirm(
      `Valider le versement de ${fmt(v.amount)} DH (${typeLabel}) de ${v.driverName} ?\n\nLe montant sera ajouté à la caisse de l'agence.`
    )) return
    setBusyId(v.id)
    setActionError('')
    try {
      await confirmDriverVersementChef(
        v.id,
        profile?.name || 'Chef Agence',
        auth.currentUser?.uid || ''
      )
    } catch (err: any) {
      console.error('confirmDriverVersementChef:', err)
      setActionError(err.message || 'Erreur lors de la validation.')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal?.versement) return
    if (!rejectModal.reason?.trim()) {
      setRejectModal((m: any) => ({ ...m, error: 'Veuillez indiquer le motif du rejet.' }))
      return
    }
    setRejectModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await rejectDriverVersementChef(
        rejectModal.versement.id,
        profile?.name || 'Chef Agence',
        auth.currentUser?.uid || '',
        rejectModal.reason.trim()
      )
      setRejectModal(null)
    } catch (err: any) {
      console.error('rejectDriverVersementChef:', err)
      setRejectModal((m: any) => ({ ...m, loading: false, error: err.message || 'Erreur lors du rejet.' }))
    }
  }

  if (!city) {
    return (
      <div className="mt-8 max-w-md mx-auto bg-white border border-gray-100 rounded-2xl p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="font-bold text-gray-800">Aucune agence associée</p>
        <p className="text-sm text-gray-500 mt-1">
          Votre compte n'est rattaché à aucune ville. Contactez l'administrateur.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-amber-600 font-semibold">En attente</p>
              <p className="text-xl font-black text-amber-700">{fmt(stats.pendingDH)} DH</p>
              <p className="text-[11px] text-amber-500">{stats.pendingCount} versement(s)</p>
            </div>
          </div>
          <p className="text-[10px] text-amber-600 mt-2 pt-2 border-t border-amber-200/70 font-medium">
            📮 Port Dû: {fmt(stats.pendingByType.portDu)} DH · 💰 COD: {fmt(stats.pendingByType.cod)} DH
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-green-600 font-semibold">Validés</p>
              <p className="text-xl font-black text-green-700">{fmt(stats.confirmedDH)} DH</p>
              <p className="text-[11px] text-green-500">{stats.confirmedCount} versement(s)</p>
            </div>
          </div>
          <p className="text-[10px] text-green-600 mt-2 pt-2 border-t border-green-200/70 font-medium">
            📮 Port Dû: {fmt(stats.confirmedByType.portDu)} DH · 💰 COD: {fmt(stats.confirmedByType.cod)} DH
          </p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border border-red-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-red-500 rounded-xl flex items-center justify-center shrink-0">
              <X className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-red-600 font-semibold">Rejetés</p>
              <p className="text-xl font-black text-red-700">{fmt(stats.rejectedDH)} DH</p>
              <p className="text-[11px] text-red-500">{stats.rejectedCount} versement(s)</p>
            </div>
          </div>
          <p className="text-[10px] text-red-600 mt-2 pt-2 border-t border-red-200/70 font-medium">
            📮 Port Dû: {fmt(stats.rejectedByType.portDu)} DH · 💰 COD: {fmt(stats.rejectedByType.cod)} DH
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-purple-500 rounded-xl flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-purple-600 font-semibold">Total général</p>
              <p className="text-xl font-black text-purple-700">{fmt(stats.totalDH)} DH</p>
              <p className="text-[11px] text-purple-500">{stats.totalCount} versement(s)</p>
            </div>
          </div>
          <p className="text-[10px] text-purple-600 mt-2 pt-2 border-t border-purple-200/70 font-medium">
            📮 Port Dû: {fmt(stats.totalByType.portDu)} DH · 💰 COD: {fmt(stats.totalByType.cod)} DH
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un livreur..."
              className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
            />
            {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-gray-400" /></button>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'pending',   label: '⏳ En attente' },
              { key: 'confirmed', label: '✅ Validés' },
              { key: 'rejected',  label: '✗ Rejetés' },
              { key: 'all',       label: 'Tous' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  statusFilter === key
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {label}
                {key === 'pending' && stats.pendingCount > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === key ? 'bg-white/25' : 'bg-amber-500 text-white'}`}>
                    {stats.pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Type de versement + mode de paiement */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'all',     label: '📦 Tous types' },
              { key: 'port_du', label: '📮 Port Dû' },
              { key: 'cod',     label: '💰 COD' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  typeFilter === key
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'all',      label: '💳 Tous paiements' },
              { key: 'especes',  label: '💵 Espèces' },
              { key: 'cheque',   label: '📋 Chèque' },
              { key: 'virement', label: '🏦 Virement' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPaymentFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  paymentFilter === key
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Période */}
        <DateFilter
          value={datePreset}
          onChange={setDatePreset}
          from={dateFrom}
          onFromChange={setDateFrom}
          to={dateTo}
          onToChange={setDateTo}
          tone="amber"
        />
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
          <span>❌ {actionError}</span>
          <button onClick={() => setActionError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Banknote className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-sm">Aucun versement {statusFilter !== 'all' ? `« ${STATUS_META[statusFilter]?.label || ''} »` : ''} trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'Livreur', 'Type', 'Mode paiement', 'Montant', 'Note', 'Statut', '', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(v => {
                  const t = TYPE_META[v.type] || { label: v.type, emoji: '📦', cls: 'bg-gray-100 text-gray-600' }
                  const p = PAYMENT_META[v.paymentType] || { label: v.paymentType, emoji: '💳' }
                  const s = STATUS_META[v.status] || STATUS_META.pending
                  return (
                    <tr key={v.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(v.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 whitespace-nowrap">🚚 {v.driverName || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${t.cls}`}>
                          {t.emoji} {t.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.emoji} {p.label}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-black text-gray-800">{fmt(v.amount)} DH</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-xs text-gray-500 truncate" title={v.note}>{v.note || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${s.cls}`}>
                          {s.label}
                        </span>
                        {v.status === 'confirmed' && v.confirmedBy && (
                          <p className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">par {v.confirmedBy} · {fmtDate(v.confirmedAt)}</p>
                        )}
                        {v.status === 'rejected' && (
                          <p className="text-[10px] text-red-400 mt-1 max-w-[160px]" title={v.rejectionReason}>
                            {v.rejectedBy ? `par ${v.rejectedBy}` : ''}{v.rejectionReason ? ` — ${v.rejectionReason}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailsModal({ versement: v })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold transition whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" /> Détails
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {v.status === 'pending' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleConfirm(v)}
                              disabled={busyId === v.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                            >
                              {busyId === v.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Valider
                            </button>
                            <button
                              onClick={() => setRejectModal({ versement: v, reason: '', loading: false, error: '' })}
                              disabled={busyId === v.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold transition whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" /> Rejeter
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
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

      {/* Modal rejet */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <X className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="font-bold text-gray-800">Rejeter le versement</h3>
              </div>
              <button
                onClick={() => setRejectModal(null)}
                disabled={rejectModal.loading}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Livreur</span><span className="font-semibold text-gray-700">{rejectModal.versement.driverName}</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-400">Type</span><span className="font-semibold text-gray-700">{TYPE_META[rejectModal.versement.type]?.label || rejectModal.versement.type}</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-400">Montant</span><span className="font-black text-red-600">{fmt(rejectModal.versement.amount)} DH</span></div>
            </div>

            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
              Motif du rejet <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectModal.reason}
              onChange={e => setRejectModal((m: any) => ({ ...m, reason: e.target.value, error: '' }))}
              placeholder="Ex: montant incorrect, chèque invalide..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none"
            />

            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              Le montant sera automatiquement recrédité au livreur.
            </div>

            {rejectModal.error && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                ❌ {rejectModal.error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => setRejectModal(null)}
                disabled={rejectModal.loading}
                className="py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                disabled={rejectModal.loading}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {rejectModal.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Rejet...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" /> Rejeter
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détails expéditions */}
      {detailsModal && (() => {
        const v = detailsModal.versement
        const t = TYPE_META[v.type] || { label: v.type, emoji: '📦', cls: 'bg-gray-100 text-gray-600' }
        const parcels = getDriverCollectedParcels(v.driverId, v.type)
        const totalCollected = parcels.reduce((sum: number, p: any) =>
          sum + parseFloat(v.type === 'cod' ? (p.codAmount || 0) : (p.portDuAmount || 0)), 0
        )
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">Détails des expéditions - {t.emoji} {t.label}</h3>
                      <p className="text-sm text-gray-500">Livreur: {v.driverName} · Versement: {fmt(v.amount)} DH</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDetailsModal(null)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="px-6 py-4 bg-gradient-to-br from-blue-50 to-blue-100/50 border-b border-blue-100">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs font-semibold text-blue-600 uppercase">Total collecté</p>
                    <p className="text-2xl font-black text-blue-700">{fmt(totalCollected)} DH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-blue-600 uppercase">Versement</p>
                    <p className="text-2xl font-black text-blue-700">{fmt(v.amount)} DH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-blue-600 uppercase">Expéditions</p>
                    <p className="text-2xl font-black text-blue-700">{parcels.length}</p>
                  </div>
                </div>
                {totalCollected !== parseFloat(v.amount) && (
                  <div className="mt-3 p-2 bg-amber-100 border border-amber-200 rounded-lg text-xs text-amber-700 text-center">
                    ⚠️ Le montant versé ({fmt(v.amount)} DH) diffère du total collecté ({fmt(totalCollected)} DH)
                  </div>
                )}
              </div>

              {/* Liste des expéditions */}
              <div className="flex-1 overflow-y-auto p-6">
                {parcels.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-25" />
                    <p className="text-sm">Aucune expédition {t.label} collectée trouvée pour ce livreur</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">N° EXP</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Tracking ID</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Expéditeur</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Destinataire</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Ville</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Date livraison</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {parcels.map((p: any) => {
                          const amount = v.type === 'cod' ? parseFloat(p.codAmount || 0) : parseFloat(p.portDuAmount || 0)
                          const collectedDate = p.codCollectedAt || p.portCollectedAt || p.deliveredAt || ''
                          return (
                            <tr key={p.id} className="hover:bg-gray-50 transition">
                              <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800">{p.senderNic || p.sender?.nic || '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-blue-600">{p.trackingId || '—'}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-700 text-xs">{p.sender?.name || p.senderName || '—'}</p>
                                <p className="text-xs text-gray-400">{p.sender?.tel || p.senderTel || ''}</p>
                              </td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-700 text-xs">{p.receiver?.name || p.receiverName || '—'}</p>
                                <p className="text-xs text-gray-400">{p.receiver?.tel || p.receiverTel || ''}</p>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{p.destinationCity || p.receiver?.city || '—'}</td>
                              <td className="px-3 py-2">
                                <span className="font-black text-green-600">{fmt(amount)} DH</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-500">
                                {collectedDate ? fmtDate(collectedDate) : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                                  ✓ Collecté
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={5} className="px-3 py-2 text-right font-bold text-gray-700">TOTAL:</td>
                          <td className="px-3 py-2">
                            <span className="font-black text-lg text-green-700">{fmt(totalCollected)} DH</span>
                          </td>
                          <td colSpan={2} className="px-3 py-2 text-xs text-gray-500">
                            {parcels.length} expédition(s)
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setDetailsModal(null)}
                  className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-white transition"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
