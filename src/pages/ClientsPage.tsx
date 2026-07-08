import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { doc, getDoc } from 'firebase/firestore'
import {
  subscribeClients, createClient, updateClient, deleteClient,
  subscribeClientPayments, addPayment, deletePayment,
  subscribeClientParcels,
} from '../firebase/clients'
import { logDirectorAction } from '../firebase/directorLogs'
import { STATUS_COLORS, CITIES } from '../firebase/constants'
import {
  ArrowLeft, Plus, Search, Users, Wallet, Edit2, Trash2, X, Save,
  ChevronRight, Phone, Mail, MapPin, FileText, Eye, EyeOff,
  Printer, Receipt, Tag, Info, Package, TrendingUp
} from 'lucide-react'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import { fmt } from '../utils/formatNumber'

const ACCOUNT_TYPES = [
  { key: 'cash',   label: 'Comptant',  color: 'bg-gray-100 text-gray-700'  },
  { key: 'compte', label: 'En compte', color: 'bg-blue-100 text-blue-700'  },
]

const EMPTY_CLIENT = {
  name: '', tel: '', email: '', address: '', city: '', nic: '',
  accountType: 'cash', remise: 0, notes: ''
}

const EMPTY_PAYMENT = {
  amount: '', type: 'debit', description: '', invoiced: true, parcelId: ''
}

export default function ClientsPage() {
  const navigate = useNavigate()

  const [clients,        setClients]       = useState<any[]>([])
  const [loading,        setLoading]       = useState(true)
  const [search,         setSearch]        = useState('')
  const [cityFilter,     setCityFilter]    = useState('')
  const [currentProfile, setCurrentProfile] = useState<any>(null)

  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [clientTab,      setClientTab]      = useState('mouvements')

  const [payments,            setPayments]            = useState<any[]>([])
  const [loadingPayments,     setLoadingPayments]     = useState(false)
  const [showNonInvoiced,     setShowNonInvoiced]     = useState(true)
  const [clientParcels,       setClientParcels]       = useState<any[]>([])
  const [loadingClientParcels,setLoadingClientParcels]= useState(false)

  const [clientModal,   setClientModal]   = useState<any>(null)
  const [paymentForm,   setPaymentForm]   = useState<any>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [saving,        setSaving]        = useState(false)

  // Load current user profile (to track director actions)
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    getDoc(doc(db, 'users', uid)).then(snap => { if (snap.exists()) setCurrentProfile(snap.data()) })
  }, [])

  // Subscribe clients
  useEffect(() => {
    setLoading(true)
    const unsub = subscribeClients(data => { setClients(data); setLoading(false) })
    return unsub
  }, [])

  // Subscribe payments when client selected
  useEffect(() => {
    if (!selectedClient?.id) { setPayments([]); return }
    setLoadingPayments(true)
    const unsub = subscribeClientPayments(selectedClient.id, data => {
      setPayments(data)
      setLoadingPayments(false)
    })
    return unsub
  }, [selectedClient?.id])

  // Subscribe parcels when client selected
  useEffect(() => {
    if (!selectedClient?.id) { setClientParcels([]); return }
    setLoadingClientParcels(true)
    const unsub = subscribeClientParcels(selectedClient.id, data => {
      setClientParcels(data)
      setLoadingClientParcels(false)
    })
    return unsub
  }, [selectedClient?.id])

  // Keep selected client in sync with live data
  useEffect(() => {
    if (!selectedClient?.id) return
    const updated = clients.find(c => c.id === selectedClient.id)
    if (updated) setSelectedClient(updated)
  }, [clients])

  const filteredClients = useMemo(() => {
    let list = clients
    if (cityFilter) list = list.filter(c => c.city === cityFilter)
    if (!search.trim()) return list
    const s = search.toLowerCase()
    return list.filter(c =>
      c.name?.toLowerCase().includes(s) ||
      c.tel?.includes(s) ||
      c.city?.toLowerCase().includes(s) ||
      c.nic?.toLowerCase().includes(s) ||
      c.createdByName?.toLowerCase().includes(s)
    )
  }, [clients, search, cityFilter])

  const displayedClients = useMemo(() => cityFilter ? clients.filter(c => c.city === cityFilter) : clients, [clients, cityFilter])
  const totalBalance  = useMemo(() => displayedClients.reduce((s, c) => s + (c.balance || 0), 0), [displayedClients])
  const enCompteCount = useMemo(() => displayedClients.filter(c => c.accountType === 'compte').length, [displayedClients])
  const cityList      = useMemo(() => [...new Set(clients.map(c => c.city).filter(Boolean))].sort(), [clients])

  const invoicedTotal = useMemo(() =>
    payments.filter(p => p.invoiced && p.type === 'debit').reduce((s, p) => s + (p.amount || 0), 0), [payments])
  const paidTotal = useMemo(() =>
    payments.filter(p => p.type === 'credit').reduce((s, p) => s + (p.amount || 0), 0), [payments])

  const _logIfDirector = (actionKey: any, details: any, meta = {}) => {
    const uid = auth.currentUser?.uid
    if (uid && currentProfile?.role === 'directeur') {
      logDirectorAction(uid, currentProfile.name || 'Directeur', actionKey, details, meta)
    }
  }

  const handleSaveClient = async (e: any) => {
    e.preventDefault()
    setSaving(true)
    try {
      const d = clientModal.data
      if (clientModal.mode === 'create') {
        await createClient({
          ...d,
          createdBy:     auth.currentUser?.uid,
          createdByName: currentProfile?.name || '—',
          createdByRole: currentProfile?.role || '—',
        })
        _logIfDirector('client_create', `Client créé : ${d.name}`, {
          clientName: d.name, city: d.city || '—', tel: d.tel || '—',
          accountType: d.accountType || 'cash',
        })
      } else {
        const original = clients.find(c => c.id === d.id)
        const changes: any[] = []
        if (original?.name !== d.name)  changes.push({ field: 'Nom',   before: original?.name  || '—', after: d.name  })
        if (original?.city !== d.city)  changes.push({ field: 'Ville', before: original?.city  || '—', after: d.city  })
        if (original?.tel  !== d.tel)   changes.push({ field: 'Tél',   before: original?.tel   || '—', after: d.tel   })
        await updateClient(d.id, {
          name: d.name, tel: d.tel, email: d.email, address: d.address,
          city: d.city, nic: d.nic, accountType: d.accountType,
          remise: parseFloat(d.remise) || 0, notes: d.notes
        })
        _logIfDirector('client_update', `Client modifié : ${d.name}`, {
          clientName: d.name, city: d.city || '—', changes,
        })
      }
      setClientModal(null)
    } finally {
      setSaving(false)
    }
  }

  const handleSavePayment = async (e: any) => {
    e.preventDefault()
    if (!selectedClient?.id || !paymentForm?.amount) return
    setSaving(true)
    try {
      await addPayment({
        clientId:    selectedClient.id,
        amount:      paymentForm.amount,
        type:        paymentForm.type,
        description: paymentForm.description,
        invoiced:    paymentForm.invoiced,
        parcelId:    paymentForm.parcelId || null,
        createdBy:   auth.currentUser?.uid,
      })
      setPaymentForm(null)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'client') {
      const item = deleteConfirm.item
      await deleteClient(item.id)
      _logIfDirector('client_delete', `Client supprimé : ${item.name}`, {
        clientName: item.name, city: item.city || '—',
      })
      if (selectedClient?.id === item.id) setSelectedClient(null)
    } else {
      const p = deleteConfirm.item
      await deletePayment(p.id, p.clientId, p.amount, p.type)
    }
    setDeleteConfirm(null)
  }

  const typeInfo = (c: any) => ACCOUNT_TYPES.find(t => t.key === c.accountType) || ACCOUNT_TYPES[0]

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <CompanyContact />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; }
          .print-page { padding: 16px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-xl transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <img src="/LOGO.jpg" alt="BG Express" className="h-8 object-contain" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">Gestion des Clients</h1>
              <p className="text-xs text-gray-400">Comptes · Paiements · Remises</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock className="text-gray-400 hidden sm:inline" />
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Temps réel
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 print-page">

        {/* ── LIST VIEW ── */}
        {!selectedClient && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Total clients{cityFilter ? ` · ${cityFilter}` : ''}</p>
                <p className="text-2xl font-bold text-gray-900">{displayedClients.length}</p>
                {cityFilter && <p className="text-xs text-gray-400">/ {clients.length} total</p>}
              </div>
              <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">En compte</p>
                <p className="text-2xl font-bold text-blue-600">{enCompteCount}</p>
              </div>
              <div className={`bg-white rounded-2xl p-4 border shadow-sm ${totalBalance > 0 ? 'border-orange-100' : 'border-green-100'}`}>
                <p className="text-xs text-gray-400 mb-1">Balance totale</p>
                <p className={`text-2xl font-bold ${totalBalance > 0 ? 'text-orange-600' : totalBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {fmt(Math.abs(totalBalance))} DH
                </p>
                <p className="text-xs text-gray-400">{totalBalance > 0 ? 'à encaisser' : totalBalance < 0 ? 'crédit' : 'soldé'}</p>
              </div>
            </div>

            {/* Filtre par ville */}
            {cityList.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                <button
                  onClick={() => setCityFilter('')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!cityFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Toutes les villes
                </button>
                {cityList.map(city => (
                  <button key={city}
                    onClick={() => setCityFilter(city === cityFilter ? '' : city)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${cityFilter === city ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}

            {/* Search + Add */}
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un client (nom, tél, ville, agent…)"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white" />
              </div>
              <button onClick={() => setClientModal({ mode: 'create', data: { ...EMPTY_CLIENT } })}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shrink-0">
                <Plus className="w-4 h-4" /> Nouveau client
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-gray-400">Chargement…</div>
              ) : filteredClients.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun client trouvé</p>
                </div>
              ) : (
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Client', 'Téléphone', 'Ville', 'Agence / Créé par', 'Type', 'Remise', 'Balance', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(c => (
                      <tr key={c.id}
                        className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition"
                        onClick={() => { setSelectedClient(c); setClientTab('mouvements') }}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{c.name}</p>
                          {c.nic && <p className="text-xs text-gray-400">N EXP: {c.nic}</p>}
                          {c.createdByRole === 'directeur' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                              👔 {c.createdByName || 'Directeur'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{c.tel || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{c.city || '—'}</td>
                        <td className="px-4 py-3">
                          {c.createdByName
                            ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.createdByRole === 'directeur' ? 'bg-purple-100 text-purple-700' : c.createdByRole === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
                                {c.createdByName}
                              </span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo(c).color}`}>
                            {typeInfo(c).label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {c.remise > 0
                            ? <span className="text-green-600 font-semibold">{c.remise}%</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${(c.balance || 0) > 0 ? 'text-orange-600' : (c.balance || 0) < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {(c.balance || 0) === 0 ? '—'
                              : `${(c.balance || 0) > 0 ? '+' : ''}${fmt(c.balance)} DH`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-blue-500 text-xs flex items-center gap-1 justify-end">
                            Voir <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── DETAIL VIEW ── */}
        {selectedClient && (
          <div>
            {/* Client header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 no-print">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <button onClick={() => setSelectedClient(null)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition shrink-0">
                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                  </button>
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0">
                    {selectedClient.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-gray-900 text-xl">{selectedClient.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo(selectedClient).color}`}>
                        {typeInfo(selectedClient).label}
                      </span>
                      {selectedClient.remise > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                          <Tag className="w-3 h-3" />Remise {selectedClient.remise}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-500">
                      {selectedClient.tel   && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selectedClient.tel}</span>}
                      {selectedClient.city  && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedClient.city}</span>}
                      {selectedClient.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selectedClient.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setClientModal({ mode: 'edit', data: { ...selectedClient } })}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-xl transition">
                    <Edit2 className="w-3.5 h-3.5" /> Modifier
                  </button>
                  <button onClick={() => setDeleteConfirm({ type: 'client', item: selectedClient })}
                    className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-100 px-3 py-2 rounded-xl transition">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </button>
                </div>
              </div>

              {/* Balance cards */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className={`rounded-xl p-3 ${(selectedClient.balance || 0) > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                  <p className="text-xs text-gray-500">Solde actuel</p>
                  <p className={`text-xl font-bold ${(selectedClient.balance || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {fmt(Math.abs(selectedClient.balance || 0))} DH
                  </p>
                  <p className="text-xs text-gray-400">
                    {(selectedClient.balance || 0) > 0 ? 'à encaisser' : (selectedClient.balance || 0) < 0 ? 'crédit' : 'soldé'}
                  </p>
                </div>
                <div className="bg-red-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Débits facturés</p>
                  <p className="text-xl font-bold text-red-600">{fmt(invoicedTotal)} DH</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Total encaissé</p>
                  <p className="text-xl font-bold text-blue-600">{fmt(paidTotal)} DH</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-4 shadow-sm w-fit no-print">
              {[
                { key: 'mouvements', label: 'Mouvements',  icon: <Wallet className="w-4 h-4" /> },
                { key: 'colis',      label: `Colis (${clientParcels.length})`, icon: <Package className="w-4 h-4" /> },
                { key: 'infos',      label: 'Infos client', icon: <Info className="w-4 h-4" /> },
              ].map(t => (
                <button key={t.key} onClick={() => setClientTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    clientTab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            {/* ── MOUVEMENTS TAB ── */}
            {clientTab === 'mouvements' && (
              <div>
                {/* Actions bar */}
                <div className="flex flex-wrap gap-3 mb-4 no-print">
                  <button onClick={() => setPaymentForm({ ...EMPTY_PAYMENT })}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition">
                    <Plus className="w-4 h-4" /> Ajouter un mouvement
                  </button>
                  <button onClick={() => setShowNonInvoiced(v => !v)}
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition">
                    {showNonInvoiced ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showNonInvoiced ? 'Masquer non-facturés' : 'Afficher tout'}
                  </button>
                  <button onClick={() => window.print()}
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition ml-auto">
                    <Printer className="w-4 h-4" /> Imprimer la facture
                  </button>
                </div>

                {/* Print header */}
                <div className="print-only mb-6 border-b pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <img src="/LOGO.jpg" alt="BG Express" className="h-12 object-contain" />
                    <div className="text-right">
                      <p className="font-bold text-xl">RELEVÉ DE COMPTE</p>
                      <p className="text-sm text-gray-500">Date: {new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-bold text-lg">{selectedClient.name}</p>
                    {selectedClient.tel     && <p className="text-sm text-gray-600">Tél: {selectedClient.tel}</p>}
                    {selectedClient.address && <p className="text-sm text-gray-600">{selectedClient.address}</p>}
                    {selectedClient.city    && <p className="text-sm text-gray-600">{selectedClient.city}</p>}
                    {selectedClient.nic     && <p className="text-sm text-gray-600">N EXP: {selectedClient.nic}</p>}
                  </div>
                </div>

                {/* Payments table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                  {loadingPayments ? (
                    <div className="p-8 text-center text-gray-400">Chargement…</div>
                  ) : payments.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Aucun mouvement enregistré</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Facture</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Montant</th>
                          <th className="px-4 py-3 no-print" />
                        </tr>
                      </thead>
                      <tbody>
                        {payments
                          .filter(p => showNonInvoiced || p.invoiced)
                          .map(p => (
                          <tr key={p.id}
                            className={`border-b border-gray-50 transition ${!p.invoiced ? 'opacity-50 bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {p.createdAt?.toDate
                                ? p.createdAt.toDate().toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              <span>{p.description || '—'}</span>
                              {p.parcelId && (
                                <span className="ml-2 text-xs text-blue-400 font-mono">#{p.parcelId}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                p.type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {p.type === 'debit' ? '↑ Débit' : '↓ Crédit'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {p.invoiced
                                ? <span className="text-xs text-green-600 flex items-center gap-1"><FileText className="w-3 h-3" />Facturé</span>
                                : <span className="text-xs text-gray-400 flex items-center gap-1"><EyeOff className="w-3 h-3" />À côté</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold ${p.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                              {p.type === 'debit' ? '+' : '-'}{fmt(p.amount)} DH
                            </td>
                            <td className="px-4 py-3 text-right no-print">
                              <button onClick={() => setDeleteConfirm({ type: 'payment', item: p })}
                                className="text-red-300 hover:text-red-600 transition p-1">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-600">
                            {showNonInvoiced ? 'Total (tous mouvements)' : 'Total facturés uniquement'}
                          </td>
                          <td colSpan={2} className="px-4 py-3 text-right">
                            {(() => {
                              const rows  = payments.filter(p => showNonInvoiced || p.invoiced)
                              const deb   = rows.filter(p => p.type === 'debit').reduce((s, p) => s + (p.amount || 0), 0)
                              const cred  = rows.filter(p => p.type === 'credit').reduce((s, p) => s + (p.amount || 0), 0)
                              const net   = deb - cred
                              return (
                                <div>
                                  <div className="text-xs text-red-500">Débits: {fmt(deb)} DH</div>
                                  <div className="text-xs text-green-600">Crédits: {fmt(cred)} DH</div>
                                  <div className={`text-sm font-bold mt-0.5 ${net > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    Net: {fmt(Math.abs(net))} DH {net > 0 ? '(dû)' : '(crédit)'}
                                  </div>
                                </div>
                              )
                            })()}
                          </td>
                          <td className="no-print" />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── COLIS TAB ── */}
            {clientTab === 'colis' && (
              <div>
                {/* Stats colis */}
                {clientParcels.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Total colis', value: clientParcels.length, color: 'text-gray-800' },
                      { label: 'Port Payé', value: clientParcels.filter(p => p.portType !== 'port_du').length, color: 'text-blue-600' },
                      { label: 'Port Dû', value: clientParcels.filter(p => p.portType === 'port_du').length, color: 'text-orange-600' },
                      { label: 'Total frais', value: `${fmt(clientParcels.reduce((s,p) => s+(p.price||0), 0))} DH`, color: 'text-red-600' },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                        <p className="text-xs text-gray-400">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                  {loadingClientParcels ? (
                    <div className="p-8 text-center text-gray-400">Chargement…</div>
                  ) : clientParcels.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Aucun colis lié à ce client</p>
                      <p className="text-xs mt-1 text-gray-300">Liez un client lors de la création d'un colis depuis l'interface Agent</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {['Suivi','Date','Trajet','Statut','Port','Prix','RETOUR FOND'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clientParcels.map(p => {
                          const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
                          const isPortDu = p.portType === 'port_du'
                          return (
                            <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                              <td className="px-4 py-3">
                                <p className="font-mono text-xs text-blue-600">{p.trackingId}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{p.nbColis > 1 ? `${p.nbColis} colis` : '1 colis'} · {p.weight} kg</p>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {p.createdAt?.toDate
                                  ? p.createdAt.toDate().toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-700">
                                <span>{p.sender?.city || '—'}</span>
                                <span className="text-gray-300 mx-1">→</span>
                                <span className="font-medium">{p.receiver?.city || '—'}</span>
                                <p className="text-gray-400 truncate max-w-[140px]">{p.receiver?.name}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPortDu ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isPortDu ? 'Port Dû' : 'Port Payé'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                                {fmt(p.price)} DH
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {p.codAmount > 0
                                  ? <span className="text-green-600 font-semibold">{fmt(p.codAmount)} DH</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-600">
                            {clientParcels.length} colis au total
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-red-600">
                            {fmt(clientParcels.reduce((s,p) => s+(p.price||0), 0))} DH
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-green-600">
                            {fmt(clientParcels.filter(p=>p.codAmount>0).reduce((s,p) => s+(p.codAmount||0), 0))} DH
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── INFOS TAB ── */}
            {clientTab === 'infos' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Nom complet',    value: selectedClient.name },
                    { label: 'N EXP',            value: selectedClient.nic     || '—' },
                    { label: 'Téléphone',      value: selectedClient.tel     || '—' },
                    { label: 'Email',          value: selectedClient.email   || '—' },
                    { label: 'Ville',          value: selectedClient.city    || '—' },
                    { label: 'Adresse',        value: selectedClient.address || '—' },
                    { label: 'Type de compte', value: typeInfo(selectedClient).label },
                    { label: 'Remise',         value: selectedClient.remise > 0 ? `${selectedClient.remise}%` : 'Aucune' },
                  ].map(({ label, value }) => (
                    <div key={label} className="border-b border-gray-50 pb-3">
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <p className="font-medium text-gray-800">{value}</p>
                    </div>
                  ))}
                  {selectedClient.notes && (
                    <div className="sm:col-span-2 border-b border-gray-50 pb-3">
                      <p className="text-xs text-gray-400 mb-0.5">Notes internes</p>
                      <p className="text-gray-800 whitespace-pre-wrap">{selectedClient.notes}</p>
                    </div>
                  )}
                </div>
                <button onClick={() => setClientModal({ mode: 'edit', data: { ...selectedClient } })}
                  className="mt-5 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition">
                  <Edit2 className="w-4 h-4" /> Modifier les informations
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── MODAL: CREATE / EDIT CLIENT ── */}
      {clientModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-900">
                {clientModal.mode === 'create' ? 'Nouveau client' : 'Modifier le client'}
              </h3>
              <button onClick={() => setClientModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveClient} autoComplete="off" className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Nom complet *</label>
                  <input required value={clientModal.data.name}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1 block">N EXP</label>
                  <input value={clientModal.data.nic}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, nic: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Téléphone (optionnel)</label>
                  <input type="tel" value={clientModal.data.tel}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, tel: e.target.value } }))}
                    placeholder="0612345678"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Ville</label>
                  <select value={clientModal.data.city}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, city: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white">
                    <option value="">Sélectionner…</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Adresse (optionnel)</label>
                  <input value={clientModal.data.address}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, address: e.target.value } }))}
                    placeholder="Adresse complète"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>

                {/* Account type */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium mb-2 block">Type de compte</label>
                  <div className="flex gap-2">
                    {ACCOUNT_TYPES.map(t => (
                      <button type="button" key={t.key}
                        onClick={() => setClientModal((m: any) => ({ ...m, data: { ...m.data, accountType: t.key } }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
                          clientModal.data.accountType === t.key
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Remise */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Remise (%)</label>
                  <div className="flex items-center gap-3">
                    <input type="number" min="0" max="100" step="0.5" value={clientModal.data.remise}
                      onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, remise: e.target.value } }))}
                      className="w-32 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                    {parseFloat(clientModal.data.remise) > 0 && (
                      <span className="text-sm text-green-600 font-medium">
                        Remise de {clientModal.data.remise}% appliquée sur les livraisons
                      </span>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium mb-1 block">Notes internes</label>
                  <textarea value={clientModal.data.notes} rows={2}
                    onChange={e => setClientModal((m: any) => ({ ...m, data: { ...m.data, notes: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setClientModal(null)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {clientModal.mode === 'create' ? 'Créer le client' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD PAYMENT ── */}
      {paymentForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Ajouter un mouvement</h3>
              <button onClick={() => setPaymentForm(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSavePayment} autoComplete="off" className="p-5 space-y-4">
              {/* Debit / Credit */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-2 block">Type de mouvement</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'debit',  label: 'Débit',    desc: 'Le client doit de l\'argent', active: 'bg-red-600 border-red-400 text-white' },
                    { key: 'credit', label: 'Crédit',   desc: 'Le client a payé',            active: 'bg-green-600 border-green-400 text-white' },
                  ].map(t => (
                    <button type="button" key={t.key}
                      onClick={() => setPaymentForm((f: any) => ({ ...f, type: t.key }))}
                      className={`p-3 rounded-xl border-2 text-left transition ${
                        paymentForm.type === t.key ? t.active : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className={`text-xs mt-0.5 ${paymentForm.type === t.key ? 'opacity-80' : 'text-gray-400'}`}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Montant (DH) *</label>
                <input type="number" min="0" step="0.01" required value={paymentForm.amount}
                  onChange={e => setPaymentForm((f: any) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Description</label>
                <input value={paymentForm.description}
                  onChange={e => setPaymentForm((f: any) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Livraisons semaine 18, Chèque n°123…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Parcel ID */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">N° Colis (optionnel)</label>
                <input value={paymentForm.parcelId}
                  onChange={e => setPaymentForm((f: any) => ({ ...f, parcelId: e.target.value }))}
                  placeholder="LMA-XXXXXX-XXXX"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500" />
              </div>

              {/* Invoiced toggle */}
              <div
                className={`rounded-xl p-4 border-2 cursor-pointer transition select-none ${
                  paymentForm.invoiced ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
                }`}
                onClick={() => setPaymentForm((f: any) => ({ ...f, invoiced: !f.invoiced }))}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${paymentForm.invoiced ? 'text-blue-800' : 'text-orange-800'}`}>
                      {paymentForm.invoiced ? '📄 Mouvement facturé' : '🔒 Paiement à côté'}
                    </p>
                    <p className={`text-xs mt-0.5 ${paymentForm.invoiced ? 'text-blue-600' : 'text-orange-600'}`}>
                      {paymentForm.invoiced
                        ? 'Apparaît dans les factures et rapports officiels'
                        : 'N\'apparaît PAS dans les factures officielles'}
                    </p>
                  </div>
                  <div className={`relative w-11 h-6 rounded-full transition shrink-0 ${paymentForm.invoiced ? 'bg-blue-500' : 'bg-orange-400'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${paymentForm.invoiced ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setPaymentForm(null)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-gray-500 mb-5">
              {deleteConfirm.type === 'client'
                ? `Supprimer le client "${deleteConfirm.item.name}" ?`
                : `Supprimer ce mouvement de ${fmt(deleteConfirm.item.amount)} DH ?`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
