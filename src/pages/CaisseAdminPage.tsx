import { useState, useEffect, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import { useNavigate } from 'react-router-dom'
import {
  subscribeAllAgencyCashes, subscribeAllCaisseRequests, subscribeAllCaissierTransactions,
  subscribeAllCaisse, subscribeAllUsers,
  approveCaisseRequest, rejectCaisseRequest, completeCaisseRequest,
  CAISSE_REQUEST_TYPES,
  subscribeAdminTransfers, confirmAdminTransfer,
} from '../firebase/firestore'
import { logDirectorAction } from '../firebase/directorLogs'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import {
  LogOut, Menu, X, Check, AlertTriangle, Clock, TrendingUp, ChevronDown,
  DollarSign, Building2, Eye, Filter, Download, Send, Lock,
} from 'lucide-react'
import { fmt } from '../utils/formatNumber'

const entryDate = (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
const isToday = (e: any) => {
  const d = entryDate(e)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return d >= start
}
const isMirrorEntry = (e: any) =>
  (e.category === 'remise_caissier' || e.category === 'recuperation_caissier') && e.agentId

const fmtDate = (d: any) => {
  if (!d) return '-'
  const date = d.toDate ? d.toDate() : new Date(d)
  return date.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function CaisseAdminPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tab, setTab] = useState('virtuelle')

  // Données
  const [agencyCashes, setAgencyCashes] = useState<any[]>([])
  const [caisseEntries, setCaisseEntries] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])
  const [transferConfirmLoading, setTransferConfirmLoading] = useState('')

  // Filtres
  const [requestFilter, setRequestFilter] = useState('all')
  const [selectedCity, setSelectedCity] = useState<any>(null)

  // Modales
  const [requestDetail, setRequestDetail] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const uid = auth.currentUser?.uid

  useEffect(() => {
    const unsubCashes = subscribeAllAgencyCashes(setAgencyCashes)
    const unsubEntries = subscribeAllCaisse(setCaisseEntries)
    const unsubUsers = subscribeAllUsers(setUsers)
    const unsubRequests = subscribeAllCaisseRequests(setRequests)
    const unsubTransactions = subscribeAllCaissierTransactions(setTransactions)
    const unsubAdminTx = subscribeAdminTransfers(setAdminTransfers)

    return () => {
      unsubCashes?.()
      unsubEntries?.()
      unsubUsers?.()
      unsubRequests?.()
      unsubTransactions?.()
      unsubAdminTx?.()
    }
  }, [])

  // Calculs
  const cashierIds = useMemo(() =>
    new Set(users.filter(u => u.role === 'caissier').map(u => u.id))
  , [users])

  const liveAgencyCashes = useMemo(() => {
    const byCity = new Map()
    caisseEntries
      .filter(e => e.city && isToday(e) && cashierIds.has(e.cashierId) && !isMirrorEntry(e))
      .forEach(e => {
        const current = byCity.get(e.city) || {
          id: e.city,
          city: e.city,
          solde: 0,
          soldeEspeces: 0,
          soldeCheques: 0,
          soldeVirement: 0,
          lastUpdatedAt: e.createdAt,
        }
        const amount = parseFloat(e.amount || 0) || 0
        const signedAmount = e.type === 'entree' ? amount : -amount
        current.solde += signedAmount
        current.soldeEspeces += signedAmount
        if (!current.lastUpdatedAt || entryDate(e) > entryDate({ createdAt: current.lastUpdatedAt })) {
          current.lastUpdatedAt = e.createdAt
        }
        byCity.set(e.city, current)
      })

    agencyCashes.forEach(cash => {
      if (!byCity.has(cash.city)) {
        byCity.set(cash.city, { ...cash, solde: 0, soldeEspeces: 0, soldeCheques: 0, soldeVirement: 0 })
      }
    })

    return [...byCity.values()].map(cash => ({
      ...cash,
      solde: Math.max(0, cash.solde || 0),
      soldeEspeces: Math.max(0, cash.soldeEspeces || 0),
    }))
  }, [agencyCashes, caisseEntries, cashierIds])
  const totalCashes = useMemo(() => liveAgencyCashes.reduce((sum, c) => sum + (c.solde || 0), 0), [liveAgencyCashes])
  const totalEspeces = useMemo(() => liveAgencyCashes.reduce((sum, c) => sum + (c.soldeEspeces || 0), 0), [liveAgencyCashes])
  const totalCheques = useMemo(() => liveAgencyCashes.reduce((sum, c) => sum + (c.soldeCheques || 0), 0), [liveAgencyCashes])
  const totalVirement = useMemo(() => liveAgencyCashes.reduce((sum, c) => sum + (c.soldeVirement || 0), 0), [liveAgencyCashes])

  const directorRequests = useMemo(() => requests.filter(r => r.source !== 'rh'), [requests])
  const pendingRequests = useMemo(() => directorRequests.filter(r => r.status === 'pending'), [directorRequests])
  const approvedRequests = useMemo(() => directorRequests.filter(r => r.status === 'approved'), [directorRequests])
  const rejectedRequests = useMemo(() => directorRequests.filter(r => r.status === 'rejected'), [directorRequests])
  const completedRequests = useMemo(() => directorRequests.filter(r => r.status === 'completed'), [directorRequests])

  const filteredRequests = useMemo(() => {
    let filtered = directorRequests
    if (requestFilter !== 'all') {
      filtered = filtered.filter(r => r.status === requestFilter)
    }
    if (selectedCity) {
      filtered = filtered.filter(r => r.city === selectedCity)
    }
    return filtered.sort((a, b) => {
      const da = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
      const db = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
      return db - da
    })
  }, [directorRequests, requestFilter, selectedCity])

  const handleApprove = async (req: any) => {
    setActionLoading(true)
    setActionError('')
    try {
      await approveCaisseRequest(req.id, profile?.name || 'Admin', uid)
      await logDirectorAction(uid, profile?.name || 'Admin', 'caisse_approve', `Approbation demande ${req.type} - ${fmt(req.amount)} DH`, { requestId: req.id, city: req.city })
      setRequestDetail(null)
    } catch (err: any) {
      console.error('Erreur approbation:', err)
      setActionError('Erreur lors de l\'approbation')
    }
    setActionLoading(false)
  }

  const handleReject = async (req: any) => {
    const reason = prompt('Motif du refus (optionnel):')
    if (reason === null) return

    setActionLoading(true)
    setActionError('')
    try {
      await rejectCaisseRequest(req.id, reason)
      await logDirectorAction(uid, profile?.name || 'Admin', 'caisse_reject', `Refus demande ${req.type} - ${fmt(req.amount)} DH`, { requestId: req.id, city: req.city, reason })
      setRequestDetail(null)
    } catch (err: any) {
      console.error('Erreur refus:', err)
      setActionError('Erreur lors du refus')
    }
    setActionLoading(false)
  }

  const handleConfirmTransfer = async (transfer: any) => {
    setTransferConfirmLoading(transfer.id)
    try {
      await confirmAdminTransfer(transfer.id, profile?.name || 'Admin', uid)
    } catch (err: any) {
      console.error('Erreur confirmation transfert:', err)
    }
    setTransferConfirmLoading('')
  }

  const handleComplete = async (req: any) => {
    setActionLoading(true)
    setActionError('')
    try {
      await completeCaisseRequest(req.id)
      await logDirectorAction(uid, profile?.name || 'Admin', 'caisse_complete', `Finalisation demande ${req.type} - ${fmt(req.amount)} DH`, { requestId: req.id, city: req.city })
      setRequestDetail(null)
    } catch (err: any) {
      console.error('Erreur finalisation:', err)
      setActionError('Erreur lors de la finalisation')
    }
    setActionLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <CompanyContact />

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Caisse Centrale</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition"
              >
                <LogOut className="w-4 h-4" /> Déconnexion
              </button>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Menu mobile */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 space-y-1">
              <button
                onClick={() => { setTab('virtuelle'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'virtuelle' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                💰 Soldes Agences
              </button>
              <button
                onClick={() => { setTab('demandes'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'demandes' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <LiveClock className="w-4 h-4" /> Demandes d'approbation
                {pendingRequests.length > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab('historique'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'historique' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                📊 Historique
              </button>
              <button
                onClick={() => { setTab('transferts'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'transferts' ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                🏛️ Transferts reçus
                {adminTransfers.filter(t => t.status === 'pending').length > 0 && (
                  <span className="ml-auto bg-purple-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {adminTransfers.filter(t => t.status === 'pending').length}
                  </span>
                )}
              </button>
              <div className="border-t border-gray-100 mt-2 pt-2 px-4 py-2">
                <button
                  onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition"
                >
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </div>
          )}

          {/* Onglets */}
          <div className="hidden md:flex border-t border-gray-100 gap-1 py-2">
            {[
              { key: 'virtuelle', label: '💰 Soldes Agences', count: null },
              { key: 'demandes', label: '⏳ Demandes', count: pendingRequests.length },
              { key: 'historique', label: '📊 Historique', count: null },
              { key: 'transferts', label: '🏛️ Transferts reçus', count: adminTransfers.filter(t => t.status === 'pending').length },
            ].map(t => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  tab === t.key
                    ? t.key === 'virtuelle' ? 'bg-blue-100 text-blue-700' : t.key === 'demandes' ? 'bg-amber-100 text-amber-700' : t.key === 'transferts' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
                {t.count !== null && t.count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.key ? 'bg-white/50' : 'bg-gray-200'
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 pb-20">

        {/* ══════════════ CAISSE VIRTUELLE ══════════════ */}
        {tab === 'virtuelle' && (
          <div className="mt-6 space-y-6">

            {/* Grand KPI */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-8 text-white shadow-xl">
              <p className="text-blue-100 text-sm font-medium">CAISSE GÉNÉRALE</p>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-5xl font-black">{fmt(totalCashes)} DH</p>
                  <p className="text-blue-200 text-sm mt-1">Solde consolidé de toutes les agences</p>
                </div>
                <div className="text-6xl opacity-20">🏦</div>
              </div>
            </div>

            {/* Détails par type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">ESPÈCES</p>
                  <span className="text-2xl">💵</span>
                </div>
                <p className="text-3xl font-black text-emerald-600">{fmt(totalEspeces)}</p>
                <p className="text-xs text-gray-500 mt-1">DH en circulation</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">CHÈQUES</p>
                  <span className="text-2xl">📋</span>
                </div>
                <p className="text-3xl font-black text-blue-600">{fmt(totalCheques)}</p>
                <p className="text-xs text-gray-500 mt-1">DH à encaisser</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">VIREMENTS</p>
                  <span className="text-2xl">🔄</span>
                </div>
                <p className="text-3xl font-black text-purple-600">{fmt(totalVirement)}</p>
                <p className="text-xs text-gray-500 mt-1">DH en compte</p>
              </div>
            </div>

            {/* Tableau par agence */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 text-lg">Soldes par agence</h3>
                <p className="text-sm text-gray-500">{liveAgencyCashes.length} agence(s)</p>
              </div>

              {liveAgencyCashes.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Aucune caisse enregistrée</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {[...liveAgencyCashes].sort((a, b) => (b.solde || 0) - (a.solde || 0)).map(cash => (
                    <div key={cash.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 text-lg">
                            📍
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800">{cash.city}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Mise à jour: {fmtDate(cash.lastUpdatedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-right">
                          <div className="text-xs">
                            <p className="text-gray-500">Espèces</p>
                            <p className="font-bold text-emerald-600 text-sm mt-0.5">{fmt(cash.soldeEspeces || 0)}</p>
                          </div>
                          <div className="text-xs">
                            <p className="text-gray-500">Chèques</p>
                            <p className="font-bold text-blue-600 text-sm mt-0.5">{fmt(cash.soldeCheques || 0)}</p>
                          </div>
                          <div className="text-xs">
                            <p className="text-gray-500">Virements</p>
                            <p className="font-bold text-purple-600 text-sm mt-0.5">{fmt(cash.soldeVirement || 0)}</p>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded-lg ${cash.solde > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            <p className="text-gray-500">Total</p>
                            <p className="font-black text-sm mt-0.5">{fmt(cash.solde || 0)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ DEMANDES D'APPROBATION ══════════════ */}
        {tab === 'demandes' && (
          <div className="mt-6 space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-xs text-gray-500 font-medium">EN ATTENTE</p>
                <p className={`text-2xl font-black mt-1 ${pendingRequests.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {pendingRequests.length}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-xs text-gray-500 font-medium">APPROUVÉES</p>
                <p className="text-2xl font-black text-blue-600 mt-1">{approvedRequests.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-xs text-gray-500 font-medium">FINALISÉES</p>
                <p className="text-2xl font-black text-green-600 mt-1">{completedRequests.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-xs text-gray-500 font-medium">REFUSÉES</p>
                <p className="text-2xl font-black text-red-600 mt-1">{rejectedRequests.length}</p>
              </div>
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'Toutes' },
                { key: 'pending', label: 'En attente' },
                { key: 'approved', label: 'Approuvées' },
                { key: 'completed', label: 'Finalisées' },
              ].map(f => (
                <button key={f.key}
                  onClick={() => setRequestFilter(f.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    requestFilter === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Liste */}
            {filteredRequests.length === 0 ? (
              <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <LiveClock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">
                  {requestFilter === 'pending' ? 'Aucune demande en attente' : 'Aucune demande'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map(req => {
                  const rt = CAISSE_REQUEST_TYPES.find(t => t.key === req.type)
                  return (
                    <button key={req.id}
                      onClick={() => setRequestDetail(req)}
                      className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${rt?.color}`}>
                            {rt?.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-800">{rt?.label}</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                req.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                                req.status === 'completed' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {req.status === 'pending' ? 'En attente' :
                                 req.status === 'approved' ? 'Approuvée' :
                                 req.status === 'completed' ? 'Finalisée' :
                                 'Refusée'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Agence: <span className="font-medium">{req.city}</span> · Par {req.cashierName}
                            </p>
                            {req.description && (
                              <p className="text-xs text-gray-600 mt-1 italic">📝 {req.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{fmtDate(req.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-lg text-gray-800">{fmt(req.amount)} DH</p>
                          <Eye className="w-4 h-4 text-gray-400 mt-2 mx-auto" />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ HISTORIQUE ══════════════ */}
        {tab === 'historique' && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 mb-3">Derniers mouvements de caisse</h3>
              <p className="text-sm text-gray-500 mb-4">{transactions.length} transaction(s) total</p>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Aucune transaction enregistrée</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 50).map(t => {
                  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                  return (
                    <div key={t.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        💰
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{t.agentName || 'Dépôt'}</p>
                        <p className="text-xs text-gray-500">{t.city} · {fmtDate(d)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-emerald-600">+{fmt(t.amount)} DH</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TRANSFERTS REÇUS ══════════════ */}
        {tab === 'transferts' && (() => {
          const pending   = adminTransfers.filter(t => t.status === 'pending')
          const confirmed = adminTransfers.filter(t => t.status === 'confirmed')
          const totalPending   = pending.reduce((s, t) => s + (t.amount || 0), 0)
          const totalConfirmed = confirmed.reduce((s, t) => s + (t.amount || 0), 0)
          return (
            <div className="mt-6 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">En attente</p>
                  <p className="text-2xl font-black text-amber-700 mt-1">{fmt(totalPending)} DH</p>
                  <p className="text-xs text-amber-500 mt-0.5">{pending.length} transfert(s)</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Confirmes</p>
                  <p className="text-2xl font-black text-green-700 mt-1">{fmt(totalConfirmed)} DH</p>
                  <p className="text-xs text-green-500 mt-0.5">{confirmed.length} transfert(s)</p>
                </div>
              </div>

              {/* Pending transfers */}
              {pending.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-amber-800 text-sm">⏳ A confirmer ({pending.length})</h3>
                    <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                      {fmt(totalPending)} DH en attente
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {pending.map(t => {
                      const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                      return (
                        <div key={t.id} className="px-4 py-4 hover:bg-amber-50/30 transition">
                          <div className="flex items-start gap-3">
                            <div className="w-11 h-11 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl flex items-center justify-center shrink-0 text-xl border border-purple-200">
                              {t.fromRole === 'agent' ? '👤' : '🏦'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-800 truncate">{t.fromName}</p>
                                  <p className="text-xs text-gray-500">
                                    {t.fromRole === 'agent' ? '👤 Agent / Chef' : '🏦 Caissier'} · 📍 {t.city}
                                  </p>
                                </div>
                                <p className="text-lg font-black text-purple-700 shrink-0">{fmt(t.amount)} DH</p>
                              </div>
                              <p className="text-xs text-gray-400 mb-2">
                                📅 Envoyé le {d.toLocaleDateString('fr-MA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {t.note && (
                                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-2">
                                  <p className="text-xs text-gray-600 italic">💬 {t.note}</p>
                                </div>
                              )}
                              <button
                                onClick={() => handleConfirmTransfer(t)}
                                disabled={transferConfirmLoading === t.id}
                                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                              >
                                {transferConfirmLoading === t.id
                                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Confirmation...</>
                                  : <><Check className="w-4 h-4" /> Confirmer la réception</>}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Confirmed transfers */}
              {confirmed.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <h3 className="font-bold text-gray-700 text-sm">✓ Historique confirmés ({confirmed.length})</h3>
                    <span className="ml-auto text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
                      {fmt(totalConfirmed)} DH
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {confirmed.slice(0, 30).map(t => {
                      const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                      const confirmedDate = t.confirmedAt?.toDate ? t.confirmedAt.toDate() : null
                      return (
                        <div key={t.id} className="px-4 py-3 hover:bg-green-50/20 transition">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0 text-lg border border-green-100">
                              {t.fromRole === 'agent' ? '👤' : '🏦'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-700 truncate">{t.fromName}</p>
                                  <p className="text-xs text-gray-500">{t.fromRole === 'agent' ? '👤 Agent / Chef' : '🏦 Caissier'} · 📍 {t.city}</p>
                                </div>
                                <p className="text-sm font-black text-green-600 shrink-0">{fmt(t.amount)} DH</p>
                              </div>
                              <p className="text-[11px] text-gray-400 mb-1">
                                📅 Envoyé le {d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              {t.note && (
                                <p className="text-[11px] text-gray-500 italic mb-1">💬 {t.note}</p>
                              )}
                              <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold px-2 py-1 rounded-lg">
                                <Check className="w-3 h-3" />
                                Confirmé par {t.confirmedBy || 'Admin'}
                                {confirmedDate && ` le ${confirmedDate.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {adminTransfers.length === 0 && (
                <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <p className="text-3xl mb-3">🏛️</p>
                  <p className="text-sm">Aucun transfert recu pour l'instant</p>
                </div>
              )}
            </div>
          )
        })()}

      </main>

      {/* ══════════════ MODAL DÉTAIL DEMANDE ══════════════ */}
      {requestDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-gray-800">Détail demande</h3>
              <button onClick={() => setRequestDetail(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-6 space-y-5">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  ⚠️ {actionError}
                </div>
              )}

              {/* Type */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <p className="text-xs text-blue-700 font-medium uppercase tracking-wide">Type d'opération</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-2xl">{CAISSE_REQUEST_TYPES.find(t => t.key === requestDetail.type)?.emoji}</span>
                  <p className="font-bold text-blue-700 text-lg">{CAISSE_REQUEST_TYPES.find(t => t.key === requestDetail.type)?.label}</p>
                </div>
              </div>

              {/* Montant */}
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Montant</p>
                <p className="text-3xl font-black text-gray-800">{fmt(requestDetail.amount)} DH</p>
              </div>

              {/* Agence */}
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Agence</p>
                <p className="text-lg font-semibold text-gray-800">{requestDetail.city}</p>
              </div>

              {/* Caissier */}
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Caissier</p>
                <p className="font-semibold text-gray-800">{requestDetail.cashierName}</p>
              </div>

              {/* Description */}
              {requestDetail.description && (
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Description</p>
                  <p className="text-gray-700">{requestDetail.description}</p>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Demandé le</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{fmtDate(requestDetail.createdAt)}</p>
                </div>
                {requestDetail.approvedAt && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Approuvé le</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{fmtDate(requestDetail.approvedAt)}</p>
                  </div>
                )}
              </div>

              {/* Statut */}
              <div className={`rounded-xl p-3 text-center font-bold text-sm ${
                requestDetail.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                requestDetail.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                requestDetail.status === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-red-100 text-red-700'
              }`}>
                {requestDetail.status === 'pending' ? '⏳ En attente d\'approbation' :
                 requestDetail.status === 'approved' ? '✓ Approuvée' :
                 requestDetail.status === 'completed' ? '✓ Finalisée' :
                 `✗ Refusée${requestDetail.rejectionReason ? ': ' + requestDetail.rejectionReason : ''}`}
              </div>

              {/* Actions */}
              {requestDetail.status === 'pending' && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => handleReject(requestDetail)}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold transition disabled:opacity-50"
                  >
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
                    Refuser
                  </button>
                  <button
                    onClick={() => handleApprove(requestDetail)}
                    disabled={actionLoading}
                    className="py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Approuver
                      </>
                    )}
                  </button>
                </div>
              )}

              {requestDetail.status === 'approved' && (
                <button
                  onClick={() => handleComplete(requestDetail)}
                  disabled={actionLoading}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Marquer comme finalisée
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => setRequestDetail(null)}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
