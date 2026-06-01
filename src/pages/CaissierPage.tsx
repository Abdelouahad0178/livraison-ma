import { useState, useEffect, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  subscribeCaisseByCity,
  createCaisseEntry, deleteCaisseEntry,
  createCaisseEntryAtomic, updateCaisseEntryAtomic, deleteCaisseEntryAtomic,
  depositAgentCashAtomic, approveRecoveryAtomic,
  subscribeAllUsers,
  createCaissierRemark, resolveRemark, deleteRemark,
  subscribeCaissierRemarks, REMARK_TYPES,
  subscribePendingCods, remitCod,
  subscribeCaissierTransactions,
  createCaisseRequest, CAISSE_REQUEST_TYPES, subscribeCaisseRequests,
  subscribeAgentCashRecoveryRequests, rejectAgentCashRecoveryRequest,
  completeRhSalaryCaisseRequest, subscribeAgencyCash,
  createAdminTransferFromCaissier, subscribeAdminTransfersByCity,
} from '../firebase/firestore'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import {
  LogOut, Plus, X, Check, Search, Calendar, Trash2, Menu,
  TrendingUp, TrendingDown, Wallet, MapPin, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Send, DollarSign, Lock, Banknote, Building2, Eye, Edit2,
} from 'lucide-react'
import { CAISSE_CATEGORIES, COD_PAYMENT_TYPES } from '../firebase/constants'
import { fmt } from '../utils/formatNumber'

const entryDate = (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)

const filterByDate = (list: any, preset: any, from: any, to: any) => {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end: any = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  return list.filter((e: any) => {
    const d = entryDate(e)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}

const CASHIER_MANUAL_ENTREE_KEYS = ['autre_entree']
const ENTREE_CATS = CAISSE_CATEGORIES.filter(c => CASHIER_MANUAL_ENTREE_KEYS.includes(c.key))
const CHARGE_CATS = CAISSE_CATEGORIES.filter(c => ['eau','electricite','telephone','loyer','fournitures','autre_charge'].includes(c.key))
const PERSO_CATS  = CAISSE_CATEGORIES.filter(c => ['salaire','avance'].includes(c.key))

const fmtDate = (e: any) => {
  const d = entryDate(e)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
}

const matchesSearch = (item: any, query: any, fields: any) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((field: any) => String(field(item) ?? '').toLowerCase().includes(q))
}

const ListFilters = ({
  search, onSearch, placeholder,
  preset, onPreset, from, onFrom, to, onTo,
  tone = 'teal',
}: any) => {
  const active = tone === 'red' ? 'bg-red-500'
    : tone === 'emerald' ? 'bg-emerald-600'
    : tone === 'blue' ? 'bg-blue-600'
    : 'bg-teal-600'
  const focus = tone === 'red' ? 'focus:border-red-500'
    : tone === 'emerald' ? 'focus:border-emerald-500'
    : tone === 'blue' ? 'focus:border-blue-500'
    : 'focus:border-teal-500'
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-white border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-sm ${focus} focus:outline-none`}
        />
        {search && (
          <button onClick={() => onSearch('')}
            className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Effacer la recherche">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {[
            { key: 'all',    label: 'Tout'    },
            { key: 'today',  label: 'Auj.'    },
            { key: 'week',   label: '7 jours' },
            { key: 'month',  label: 'Ce mois' },
            { key: 'custom', label: 'Perso'   },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => onPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                preset === key ? `${active} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 pl-6">
            <input type="date" value={from} onChange={e => onFrom(e.target.value)}
              className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focus} flex-1`} />
            <span className="text-gray-400 text-xs shrink-0">a</span>
            <input type="date" value={to} onChange={e => onTo(e.target.value)}
              className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focus} flex-1`} />
          </div>
        )}
      </div>
    </div>
  )
}

const EMPTY_MODAL = {
  open: false, type: 'entree', category: '', amount: '',
  description: '', reference: '', staffName: '', agentName: '',
  staffId: '', staffRole: '', salaryMonth: new Date().toISOString().slice(0, 7),
  note: '', loading: false, error: '', codParcelId: null,
}

export default function CaissierPage() {
  const navigate = useNavigate()

  const [profile,       setProfile]       = useState<any>(null)
  const [entries,       setEntries]       = useState<any[]>([])
  const [pendingCods,   setPendingCods]   = useState<any[]>([])
  const [tab,           setTab]           = useState('home')
  const [entryModal,    setEntryModal]    = useState(EMPTY_MODAL)
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [datePreset,    setDatePreset]    = useState('all')
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [search,        setSearch]        = useState('')
  const [remarkSearch,  setRemarkSearch]  = useState('')
  const [remarkDatePreset, setRemarkDatePreset] = useState('all')
  const [remarkDateFrom,   setRemarkDateFrom]   = useState('')
  const [remarkDateTo,     setRemarkDateTo]     = useState('')
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionDatePreset, setTransactionDatePreset] = useState('all')
  const [transactionDateFrom,   setTransactionDateFrom]   = useState('')
  const [transactionDateTo,     setTransactionDateTo]     = useState('')
  const [recoverySearch, setRecoverySearch] = useState('')
  const [recoveryDatePreset, setRecoveryDatePreset] = useState('all')
  const [recoveryDateFrom,   setRecoveryDateFrom]   = useState('')
  const [recoveryDateTo,     setRecoveryDateTo]     = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [viewEntry,     setViewEntry]     = useState<any>(null)
  const [editEntry,     setEditEntry]     = useState<any>(null)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [remarks,       setRemarks]       = useState<any[]>([])
  const [remarkModal,   setRemarkModal]   = useState<any>(null)
  const [remarkFilter,  setRemarkFilter]  = useState('open')
  // NOUVEAU: Transactions et demandes de caisse
  const [transactions,  setTransactions]  = useState<any[]>([])
  const [requests,      setRequests]      = useState<any[]>([])
  const [recoveryRequests, setRecoveryRequests] = useState<any[]>([])
  const [recoveryAction, setRecoveryAction] = useState<any>(null)
  const [rhRequestAction, setRhRequestAction] = useState<any>(null)
  const [agencyCash,    setAgencyCash]    = useState<any>(null)
  const [agents,        setAgents]        = useState<any[]>([])
  const [staffUsers,    setStaffUsers]    = useState<any[]>([])
  const [depositModal,  setDepositModal]  = useState<any>(null)
  const [requestModal,  setRequestModal]  = useState<any>(null)
  const [adminTransferForm, setAdminTransferForm] = useState({ amount: '', note: '', loading: false, error: '', success: '' })
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])

  const uid = auth.currentUser?.uid

  useEffect(() => {
    if (!uid) return
    let unsubCaisse: any = null
    let unsubRemarks: any = null
    let unsubTransactions: any = null
    let unsubRequests: any = null
    let unsubRecoveryRequests: any = null
    let unsubCash: any = null
    const unsubUsers = subscribeAllUsers(data => {
      setAgents(data.filter(u => u.role === 'agent'))
      setStaffUsers(data.filter(u => ['directeur', 'agent', 'chauffeur', 'caissier', 'salarie'].includes(u.role)))
    })
    let currentCity: any = null

    let unsubCods: any = null

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (!snap.exists()) return
        const data = snap.data()
        setProfile(data)
        const city = data.city
        if (city && city !== currentCity) {
          unsubCaisse?.()
          unsubRemarks?.()
          unsubCods?.()
          unsubTransactions?.()
          unsubRequests?.()
          unsubRecoveryRequests?.()
          unsubCash?.()
          currentCity = city
          unsubCaisse = subscribeCaisseByCity(city, setEntries)
          unsubRemarks = subscribeCaissierRemarks(city, setRemarks)
          unsubCods = subscribePendingCods(city, setPendingCods)
          unsubTransactions = subscribeCaissierTransactions(city, setTransactions)
          unsubRequests = subscribeCaisseRequests(city, setRequests)
          unsubRecoveryRequests = subscribeAgentCashRecoveryRequests(city, setRecoveryRequests)
          unsubCash = subscribeAgencyCash(city, setAgencyCash)
          subscribeAdminTransfersByCity(city, setAdminTransfers)
        }
      },
      err => console.warn('CaissierPage user profile listener error:', err.code)
    )

    return () => {
      unsubProfile()
      unsubCaisse?.()
      unsubRemarks?.()
      unsubCods?.()
      unsubTransactions?.()
      unsubRequests?.()
      unsubRecoveryRequests?.()
      unsubCash?.()
      unsubUsers?.()
    }
  }, [uid])

  const cashierEntries = useMemo(() => entries.filter(e => {
    if (e.cashierId !== uid) return false
    if (e.category === 'remise_caissier' && e.agentId && e.agentId !== uid) return false
    if (e.category === 'recuperation_caissier' && e.agentId && e.agentId !== uid) return false
    return true
  }), [entries, uid])
  const todayEntries   = useMemo(() => filterByDate(cashierEntries, 'today', '', ''), [cashierEntries])
  const entreesToday   = useMemo(() => todayEntries.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0), [todayEntries])
  const sortiesToday   = useMemo(() => todayEntries.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0), [todayEntries])
  const soldeToday     = entreesToday - sortiesToday
  const caisseLocaleSolde = Math.max(0, soldeToday)
  const caisseLocaleCheques = 0
  const caisseLocaleVirement = 0
  const caisseLocaleEspeces = caisseLocaleSolde

  // Entrées filtrées par date et recherche (sans filtre de type)
  const entriesDateSearch = useMemo(() =>
    filterByDate(cashierEntries, datePreset, dateFrom, dateTo)
      .filter((e: any) => !search || [e.description, e.staffName, e.agentName, e.reference]
        .some(v => v?.toLowerCase().includes(search.toLowerCase())))
  , [cashierEntries, datePreset, dateFrom, dateTo, search])

  // Entrées filtrées avec le filtre de type en plus
  const filteredEntries = useMemo(() =>
    entriesDateSearch.filter((e: any) => typeFilter === 'all' || e.type === typeFilter)
  , [entriesDateSearch, typeFilter])

  // Totaux calculés sur entriesDateSearch (sans filtre de type)
  const entreesFiltered = useMemo(() => entriesDateSearch.filter((e: any) => e.type === 'entree').reduce((s: any, e: any) => s + (e.amount || 0), 0), [entriesDateSearch])
  const sortiesFiltered = useMemo(() => entriesDateSearch.filter((e: any) => e.type === 'sortie').reduce((s: any, e: any) => s + (e.amount || 0), 0), [entriesDateSearch])
  const cashierRecoveryRequests = useMemo(() =>
    recoveryRequests.filter(r => r.cashierId === uid || (!!profile?.name && r.cashierName === profile.name))
  , [recoveryRequests, uid, profile?.name])
  const pendingRecoveryRequests = useMemo(() =>
    cashierRecoveryRequests.filter(r => r.status === 'pending')
  , [cashierRecoveryRequests])
  const cashierPendingRequests = useMemo(() =>
    requests.filter(r => r.status === 'pending' && r.source !== 'rh')
  , [requests])
  const rhSalaryRequests = useMemo(() =>
    requests.filter(r => r.status === 'pending' && r.source === 'rh')
  , [requests])
  const filteredRecoveryRequests = useMemo(() =>
    filterByDate(cashierRecoveryRequests, recoveryDatePreset, recoveryDateFrom, recoveryDateTo)
      .filter((r: any) => matchesSearch(r, recoverySearch, [
        (x: any) => x.agentName, (x: any) => x.cashierName, (x: any) => x.description, (x: any) => x.amount, (x: any) => x.status,
      ]))
  , [cashierRecoveryRequests, recoveryDatePreset, recoveryDateFrom, recoveryDateTo, recoverySearch])
  const filteredTransactions = useMemo(() =>
    filterByDate(transactions, transactionDatePreset, transactionDateFrom, transactionDateTo)
      .filter((t: any) => matchesSearch(t, transactionSearch, [
        (x: any) => x.agentName, (x: any) => x.description, (x: any) => x.amount, (x: any) => x.amountEspeces, (x: any) => x.amountCheques, (x: any) => x.amountVirement,
      ]))
  , [transactions, transactionDatePreset, transactionDateFrom, transactionDateTo, transactionSearch])
  const filteredRemarks = useMemo(() =>
    filterByDate(remarks, remarkDatePreset, remarkDateFrom, remarkDateTo)
      .filter((r: any) =>
        remarkFilter === 'all' ? true :
        remarkFilter === 'open' ? !r.resolved :
        r.resolved
      )
      .filter((r: any) => matchesSearch(r, remarkSearch, [
        (x: any) => x.agentName, (x: any) => x.caissierName, (x: any) => x.description, (x: any) => x.amount, (x: any) => {
          const rt = REMARK_TYPES.find(t => t.key === x.type)
          return rt?.label || x.type
        },
      ]))
  , [remarks, remarkDatePreset, remarkDateFrom, remarkDateTo, remarkFilter, remarkSearch])

  const selectCod = (parcel: any) => {
    const pt = COD_PAYMENT_TYPES.find(t => t.key === parcel.codPaymentType)
    const agentName = parcel.codCollectedBy || parcel.deliveryDriverName || parcel.destinationAgentName || ''
    const category = parcel.codPaymentType === 'cheque' ? 'cod_cheque'
                   : parcel.codPaymentType === 'traite' ? 'cod_traite'
                   : 'cod_agent'
    setEntryModal(m => ({
      ...m,
      category,
      amount:       String(parcel.codAmount),
      description:  `RETOUR FOND remis - ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
      reference:    parcel.trackingId,
      agentName,
      note:         pt ? `Paiement : ${pt.label}` : '',
      codParcelId:  parcel.id,
      error:        '',
    }))
  }

  const handleSaveEntry = async () => {
    if (!entryModal.category || !entryModal.amount || !entryModal.description) {
      setEntryModal(m => ({ ...m, error: 'Categorie, montant et description sont obligatoires.' }))
      return
    }
    const amount = parseFloat(entryModal.amount || '0')
    if (!amount || amount <= 0) {
      setEntryModal(m => ({ ...m, error: 'Le montant doit etre superieur a 0.' }))
      return
    }
    if (['salaire', 'avance'].includes(entryModal.category) && !entryModal.staffId && !entryModal.staffName) {
      setEntryModal(m => ({ ...m, error: 'Selectionnez le personnel concerne.' }))
      return
    }
    setEntryModal(m => ({ ...m, loading: true, error: '' }))
    try {
      const entryData = {
        type:        entryModal.type,
        category:    entryModal.category,
        amount:      entryModal.amount,
        description: entryModal.description,
        reference:   entryModal.reference,
        staffId:     entryModal.staffId    || null,
        staffName:   entryModal.staffName  || null,
        staffRole:   entryModal.staffRole  || '',
        salaryMonth: entryModal.salaryMonth || '',
        paymentKind: entryModal.category === 'salaire' ? 'salaire' : entryModal.category === 'avance' ? 'avance' : '',
        agentName:   entryModal.agentName  || null,
        note:        entryModal.note,
        city:        profile.city,
        cashierId:   uid,
        cashierName: profile?.name || 'Caissier',
      }
      if (entryModal.codParcelId) {
        // RETOUR FOND : pas d'ajustement caisse ici (géré séparément)
        await createCaisseEntry(entryData)
        await remitCod(entryModal.codParcelId, profile?.name || 'Caissier')
      } else {
        // Opération standard : entrée + ajustement solde ATOMIQUES
        const sign = entryModal.type === 'entree' ? 1 : -1
        await createCaisseEntryAtomic(entryData, {
          soldeDelta:    sign * amount,
          especesDelta:  sign * amount,
          lastUpdatedBy: profile?.name || 'Caissier',
        })
      }
      setEntryModal(EMPTY_MODAL)
    } catch (err: any) {
      setEntryModal(m => ({ ...m, loading: false, error: err?.message || "Erreur lors de l'enregistrement." }))
    }
  }

  const handleDeleteEntry = async () => {
    if (!deleteConfirm) return
    const amount = parseFloat(deleteConfirm.amount || 0) || 0
    const sign = deleteConfirm.type === 'entree' ? -1 : 1
    try {
      if (deleteConfirm.codParcelId) {
        await deleteCaisseEntry(deleteConfirm.id)
      } else {
        await deleteCaisseEntryAtomic(deleteConfirm.id, profile.city, {
          soldeDelta:    sign * amount,
          especesDelta:  sign * amount,
          lastUpdatedBy: profile?.name || 'Caissier',
        })
      }
      setDeleteConfirm(null)
    } catch {
      setDeleteConfirm(null)
    }
  }

  const openEditEntry = (entry: any) => {
    setEditEntry({
      ...entry,
      amount: String(entry.amount || ''),
      loading: false,
      error: '',
    })
  }

  const handleUpdateEntry = async () => {
    if (!editEntry?.id) return
    const original = entries.find(e => e.id === editEntry.id) || editEntry
    const amount = parseFloat(editEntry.amount || 0)
    if (!editEntry.category || !amount || !editEntry.description) {
      setEditEntry((m: any) => ({ ...m, error: 'Categorie, montant et description sont obligatoires.' }))
      return
    }
    if (amount <= 0) {
      setEditEntry((m: any) => ({ ...m, error: 'Le montant doit etre superieur a 0.' }))
      return
    }
    setEditEntry((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const oldSigned = original.type === 'entree'
        ? (parseFloat(original.amount || 0) || 0)
        : -(parseFloat(original.amount || 0) || 0)
      const newSigned = editEntry.type === 'entree' ? amount : -amount
      const delta = newSigned - oldSigned

      await updateCaisseEntryAtomic(
        editEntry.id,
        {
          type: editEntry.type,
          category: editEntry.category,
          amount,
          description: editEntry.description,
          reference: editEntry.reference,
          agentName: editEntry.agentName,
          staffId: editEntry.staffId,
          staffName: editEntry.staffName,
          staffRole: editEntry.staffRole,
          salaryMonth: editEntry.salaryMonth,
          paymentKind: editEntry.category === 'salaire' ? 'salaire' : editEntry.category === 'avance' ? 'avance' : '',
          note: editEntry.note,
        },
        profile.city,
        original.codParcelId ? 0 : delta,
        profile?.name || 'Caissier',
      )
      setEditEntry(null)
    } catch (err: any) {
      setEditEntry((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors de la modification.' }))
    }
  }

  const handleSaveRemark = async () => {
    if (!remarkModal?.type || !remarkModal?.description) {
      setRemarkModal((m: any) => ({ ...m, error: 'Type et description sont obligatoires.' }))
      return
    }
    setRemarkModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await createCaissierRemark({
        agentName:    remarkModal.agentName,
        type:         remarkModal.type,
        amount:       remarkModal.amount,
        description:  remarkModal.description,
        city:         profile.city,
        caissierName: profile?.name || 'Caissier',
        caissierId:   uid,
      })
      setRemarkModal(null)
    } catch {
      setRemarkModal((m: any) => ({ ...m, loading: false, error: "Erreur lors de l'enregistrement." }))
    }
  }

  const handleSaveDeposit = async () => {
    const selectedAgent = agents.find(a => a.id === depositModal.agentId)
    if (!selectedAgent) {
      setDepositModal((m: any) => ({ ...m, error: 'Selectionnez l agent qui remet l argent.' }))
      return
    }
    if (!depositModal.amountEspeces && !depositModal.amountCheques && !depositModal.amountVirement) {
      setDepositModal((m: any) => ({ ...m, error: 'Veuillez entrer au moins un montant.' }))
      return
    }
    const total = parseFloat(depositModal.amountEspeces || 0) + parseFloat(depositModal.amountCheques || 0) + parseFloat(depositModal.amountVirement || 0)
    if (total <= 0) {
      setDepositModal((m: any) => ({ ...m, error: 'Le montant total doit etre > 0.' }))
      return
    }
    setDepositModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const agentName = selectedAgent.name || depositModal.agentName || 'Agent'
      const depositNote = [
        parseFloat(depositModal.amountEspeces  || 0) > 0 ? `Especes ${depositModal.amountEspeces} DH`   : '',
        parseFloat(depositModal.amountCheques  || 0) > 0 ? `Cheques ${depositModal.amountCheques} DH`   : '',
        parseFloat(depositModal.amountVirement || 0) > 0 ? `Virement ${depositModal.amountVirement} DH` : '',
      ].filter(Boolean).join(' | ')
      await depositAgentCashAtomic({
        city:           profile.city,
        agentId:        selectedAgent.id,
        agentName,
        caisserId:      uid,
        cashierName:    profile?.name || 'Caissier',
        amount:         total,
        amountEspeces:  depositModal.amountEspeces,
        amountCheques:  depositModal.amountCheques,
        amountVirement: depositModal.amountVirement,
        description:    depositModal.description || 'Depot especes',
        note:           depositModal.description || '',
        depositNote,
      })
      setDepositModal(null)
    } catch (err: any) {
      console.error('Erreur depot:', err)
      setDepositModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors du depot.' }))
    }
  }

  const handleApproveRecovery = async (req: any) => {
    if (!req || req.status !== 'pending') return
    const amount = parseFloat(req.amount || 0)
    if (req.cashierId !== uid && req.cashierName !== profile?.name) return
    if (amount <= 0) return
    if (amount > (agencyCash?.soldeEspeces || agencyCash?.solde || 0)) {
      setRecoveryAction({ id: req.id, error: 'Solde caisse insuffisant.' })
      return
    }
    setRecoveryAction({ id: req.id, loading: true, error: '' })
    try {
      await approveRecoveryAtomic(req.id, {
        city:        profile.city,
        agentId:     req.agentId,
        agentName:   req.agentName || 'Agent',
        caisserId:   uid,
        cashierName: profile?.name || 'Caissier',
        amount,
        description: req.description || 'Recuperation agent acceptee',
        note:        req.description || '',
        approvedBy:  profile?.name || 'Caissier',
        approvedById: uid,
      })
      setRecoveryAction(null)
    } catch (err: any) {
      console.error('Erreur recuperation agent:', err)
      setRecoveryAction({ id: req.id, error: err?.message || 'Erreur lors de l acceptation.' })
    }
  }

  const handleRejectRecovery = async (req: any) => {
    if (!req || req.status !== 'pending' || (req.cashierId !== uid && req.cashierName !== profile?.name)) return
    setRecoveryAction({ id: req.id, loading: true, error: '' })
    try {
      await rejectAgentCashRecoveryRequest(req.id, {
        rejectedBy: profile?.name || 'Caissier',
        rejectedById: uid,
        rejectionReason: 'Refuse par le caissier',
      })
      setRecoveryAction(null)
    } catch (err: any) {
      console.error('Erreur refus recuperation:', err)
      setRecoveryAction({ id: req.id, error: 'Erreur lors du refus.' })
    }
  }

  const handleAdminTransfer = async () => {
    const amount = parseFloat(adminTransferForm.amount || '0')
    const maxAmount = agencyCash?.soldeEspeces ?? agencyCash?.solde ?? 0
    if (!amount || amount <= 0) {
      setAdminTransferForm(m => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > maxAmount) {
      setAdminTransferForm(m => ({ ...m, error: `Solde insuffisant. Disponible : ${fmt(maxAmount)} DH.`, success: '' }))
      return
    }
    setAdminTransferForm(m => ({ ...m, loading: true, error: '', success: '' }))
    try {
      await createAdminTransferFromCaissier({
        fromId: uid, fromName: profile?.name || 'Caissier',
        city: profile.city,
        amount, note: adminTransferForm.note,
      })
      setAdminTransferForm({ amount: '', note: '', loading: false, error: '', success: "Transfert envoye a l'Admin. En attente de confirmation." })
    } catch (err: any) {
      setAdminTransferForm(m => ({ ...m, loading: false, error: err?.message || 'Erreur lors du transfert.', success: '' }))
    }
  }

  const handleSaveRequest = async () => {
    if (!requestModal.type || !requestModal.amount) {
      setRequestModal((m: any) => ({ ...m, error: 'Type et montant sont obligatoires.' }))
      return
    }
    if (parseFloat(requestModal.amount) <= 0) {
      setRequestModal((m: any) => ({ ...m, error: 'Le montant doit etre > 0.' }))
      return
    }
    setRequestModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const reqId = await createCaisseRequest({
        city: profile.city,
        caisserId: uid,
        cashierName: profile?.name || 'Caissier',
        type: requestModal.type,
        amount: requestModal.amount,
        description: requestModal.description || '',
      })
      setRequestModal(null)
    } catch (err: any) {
      console.error('Erreur demande:', err)
      setRequestModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la demande.' }))
    }
  }

  const handleCompleteRhRequest = async (req: any) => {
    const amount = parseFloat(req.amount || 0)
    if (!req?.id || !amount || amount <= 0) return
    setRhRequestAction({ id: req.id, loading: true, error: '' })
    try {
      await completeRhSalaryCaisseRequest(req.id, {
        city: profile.city,
        cashierName: profile?.name || 'Caissier',
        cashierId: uid,
      })
      setRhRequestAction(null)
    } catch (err: any) {
      setRhRequestAction({ id: req.id, loading: false, error: err?.message || 'Erreur lors du paiement RH.' })
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-xl p-3 text-sm focus:border-teal-500 focus:outline-none transition bg-gray-50 focus:bg-white"

  const openEntry = (type: any) => setEntryModal({ ...EMPTY_MODAL, open: true, type })

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyContact />

      {/* ---- Header ---- */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                <Wallet className="w-4 h-4 text-teal-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Interface Caissier</span>
              </div>
              {profile?.name && (
                <span className="text-gray-400 text-sm hidden md:inline">- {profile.name}</span>
              )}
              {profile?.city && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                  <MapPin className="w-3 h-3" /> {profile.city}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition"
              >
                <LogOut className="w-4 h-4" /> Deconnexion
              </button>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Fil d'Ariane quand hors accueil */}
          {tab !== 'home' && (
            <div className="border-t border-gray-50 flex items-center gap-2 py-2">
              <button
                onClick={() => setTab('home')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition px-1 py-1 rounded-lg hover:bg-teal-50"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
                <span>Accueil</span>
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-semibold text-teal-600">
                {tab === 'mouvements' ? 'Mouvements' : tab === 'remarques' ? 'Remarques agents' : 'Depots recus'}
              </span>
            </div>
          )}

          {/* Menu mobile */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 space-y-1">
              <button
                onClick={() => { setTab('home'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Accueil
              </button>
              <button
                onClick={() => { setTab('mouvements'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'mouvements' ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Mouvements
              </button>
              <button
                onClick={() => { setTab('remarques'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'remarques' ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <AlertTriangle className="w-4 h-4" /> Remarques agents
                {remarks.filter(r => !r.resolved).length > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {remarks.filter(r => !r.resolved).length > 9 ? '9+' : remarks.filter(r => !r.resolved).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab('transactions'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'transactions' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Depots recus
                {transactions.length > 0 && (
                  <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {transactions.length > 9 ? '9+' : transactions.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab('recoveries'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'recoveries' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Banknote className="w-4 h-4" /> Demandes agents
                {pendingRecoveryRequests.length > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingRecoveryRequests.length > 9 ? '9+' : pendingRecoveryRequests.length}
                  </span>
                )}
              </button>
              <div className="border-t border-gray-100 mt-2 pt-2 px-4 py-2">
                <button
                  onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition"
                >
                  <LogOut className="w-4 h-4" /> Deconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-20">

        {/* ══════════════ ACCUEIL ══════════════ */}
        {tab === 'home' && (
          <div className="mt-6 space-y-5">

            {/* Bienvenue */}
            <div className="text-center mb-2">
              <p className="text-gray-400 text-sm">Bonjour,</p>
              <h1 className="font-black text-gray-800 text-2xl">{profile?.name || 'Caissier'}</h1>
              {profile?.city && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs bg-teal-50 text-teal-600 border border-teal-200 px-3 py-1 rounded-full font-medium">
                  Caisse de {profile.city}
                </span>
              )}
            </div>

            {/* KPIs du jour */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Entrees',    value: fmt(entreesToday),          color: 'text-green-600',  bg: 'bg-green-50'  },
                { label: 'Sorties',    value: fmt(sortiesToday),          color: 'text-red-600',    bg: 'bg-red-50'    },
                { label: 'Solde jour', value: fmt(Math.abs(soldeToday)),  color: soldeToday >= 0 ? 'text-teal-600' : 'text-orange-600', bg: soldeToday >= 0 ? 'bg-teal-50' : 'bg-orange-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center border border-white shadow-sm`}>
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 font-medium mt-1">{s.label} DH</p>
                </div>
              ))}
            </div>

            {/* Deux grandes actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => openEntry('entree')}
                className="relative overflow-hidden rounded-3xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]"
                style={{ minHeight: 180 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500 via-emerald-600 to-teal-700" />
                <div className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)' }} />
                <div className="relative p-7 flex flex-col items-start h-full justify-between">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <div className="mt-4 text-left">
                    <p className="text-white font-black text-2xl leading-tight">+ Entree</p>
                    <p className="text-green-200 text-sm mt-0.5">RETOUR FOND agents, documents...</p>
                    <div className="mt-3 inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                      Enregistrer
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => openEntry('sortie')}
                className="relative overflow-hidden rounded-3xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]"
                style={{ minHeight: 180 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500 via-red-600 to-pink-700" />
                <div className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 0%, transparent 50%)' }} />
                <div className="relative p-7 flex flex-col items-start h-full justify-between">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner">
                    <TrendingDown className="w-7 h-7 text-white" />
                  </div>
                  <div className="mt-4 text-left">
                    <p className="text-white font-black text-2xl leading-tight">+ Charge</p>
                    <p className="text-red-200 text-sm mt-0.5">Eau, electricite, personnel...</p>
                    <div className="mt-3 inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                      Enregistrer
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Solde caisse locale */}
            <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-3xl p-6 text-white shadow-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-teal-100 text-sm font-medium">CAISSE LOCALE</p>
                  <h2 className="text-3xl font-black mt-1">{fmt(caisseLocaleSolde)} DH</h2>
                </div>
                <Building2 className="w-16 h-16 opacity-20" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-white/20 rounded-xl px-2.5 py-1.5 backdrop-blur-sm">
                  <p className="text-teal-100 text-xs">Especes</p>
                  <p className="font-bold text-xs mt-0.5">{fmt(caisseLocaleEspeces)}</p>
                </div>
                <div className="bg-white/20 rounded-xl px-2.5 py-1.5 backdrop-blur-sm">
                  <p className="text-teal-100 text-xs">Cheques</p>
                  <p className="font-bold text-xs mt-0.5">{fmt(caisseLocaleCheques)}</p>
                </div>
                <div className="bg-white/20 rounded-xl px-2.5 py-1.5 backdrop-blur-sm">
                  <p className="text-teal-100 text-xs">Virement</p>
                  <p className="font-bold text-xs mt-0.5">{fmt(caisseLocaleVirement)}</p>
                </div>
              </div>
            </div>

            {/* Transfert à l'Admin */}
            <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-purple-50 flex items-center gap-2">
                <Send className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-gray-700 text-sm">Transfert a l'Admin</h3>
                <span className="ml-auto text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                  Solde agence : {fmt(agencyCash?.soldeEspeces ?? agencyCash?.solde ?? 0)} DH
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="number" min="0"
                    value={adminTransferForm.amount}
                    onChange={e => setAdminTransferForm(m => ({ ...m, amount: e.target.value, error: '', success: '' }))}
                    placeholder={`Montant (max ${fmt(agencyCash?.soldeEspeces ?? agencyCash?.solde ?? 0)} DH)`}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <input
                    value={adminTransferForm.note}
                    onChange={e => setAdminTransferForm(m => ({ ...m, note: e.target.value, error: '', success: '' }))}
                    placeholder="Motif (optionnel)"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                {(adminTransferForm.error || adminTransferForm.success) && (
                  <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${adminTransferForm.error ? 'text-red-600 bg-red-50 border border-red-100' : 'text-purple-700 bg-purple-50 border border-purple-100'}`}>
                    {adminTransferForm.error || adminTransferForm.success}
                  </div>
                )}
                <button
                  onClick={handleAdminTransfer}
                  disabled={adminTransferForm.loading}
                  className="w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-3 rounded-xl transition"
                >
                  {adminTransferForm.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transfert...</>
                    : <><Send className="w-4 h-4" /> Envoyer a l'Admin</>}
                </button>
              </div>
              {adminTransfers.filter(t => t.fromRole === 'caissier').length > 0 && (
                <div className="border-t border-purple-50 divide-y divide-gray-50">
                  {adminTransfers.filter(t => t.fromRole === 'caissier').slice(0, 5).map(t => {
                    const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                    return (
                      <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800">{fmt(t.amount)} DH</p>
                          <p className="text-[11px] text-gray-400">{t.note || 'Sans motif'} · {d.toLocaleDateString('fr-MA')}</p>
                        </div>
                        <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${t.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {t.status === 'confirmed' ? 'Confirme' : 'En attente'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {pendingRecoveryRequests.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-blue-100 border-b border-blue-200 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-blue-700" />
                  <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                    Demandes de recuperation agent
                  </p>
                </div>
                <div className="divide-y divide-blue-100">
                  {pendingRecoveryRequests.map(req => (
                    <div key={req.id} className="px-4 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{req.agentName || 'Agent'}</p>
                          <p className="text-xs text-gray-500">{req.description || 'Demande sans motif'}</p>
                        </div>
                        <p className="font-black text-blue-700 text-sm shrink-0">{fmt(req.amount)} DH</p>
                      </div>
                      {recoveryAction?.id === req.id && recoveryAction.error && (
                        <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                          {recoveryAction.error}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleRejectRecovery(req)}
                          disabled={recoveryAction?.id === req.id && recoveryAction.loading}
                          className="py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-60 transition"
                        >
                          Refuser
                        </button>
                        <button
                          onClick={() => handleApproveRecovery(req)}
                          disabled={recoveryAction?.id === req.id && recoveryAction.loading}
                          className="py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 transition"
                        >
                          {recoveryAction?.id === req.id && recoveryAction.loading ? 'Traitement...' : 'Accepter et donner'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions rapides ? Nouveau flux */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setDepositModal({ amountEspeces: '', amountCheques: '', amountVirement: '', agentId: '', agentName: '', description: '', loading: false, error: '' })}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-4 hover:shadow-md transition"
              >
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <DollarSign className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-gray-800">Recevoir depot</p>
                  <p className="text-xs text-gray-500">D'un agent</p>
                </div>
              </button>

              <button
                onClick={() => setRequestModal({ type: '', amount: '', description: '', loading: false, error: '' })}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-4 hover:shadow-md transition"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Send className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-gray-800">Demander appro</p>
                  <p className="text-xs text-gray-500">Virement ou stockage</p>
                </div>
              </button>
              <button
                onClick={() => setTab('recoveries')}
                className="flex items-center gap-3 bg-white border border-blue-200 rounded-2xl px-4 py-4 hover:shadow-md transition relative"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Banknote className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-gray-800">Demandes agents</p>
                  <p className="text-xs text-gray-500">{pendingRecoveryRequests.length} en attente</p>
                </div>
                {pendingRecoveryRequests.length > 0 && (
                  <span className="absolute top-3 right-3 bg-blue-600 text-white text-[10px] font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                    {pendingRecoveryRequests.length}
                  </span>
                )}
              </button>
            </div>

            {/* Demandes en attente */}
            {rhSalaryRequests.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-green-100 border-b border-green-200 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-green-700" />
                  <p className="text-xs font-bold text-green-800 uppercase tracking-wide">
                    {rhSalaryRequests.length} demande(s) RH a payer
                  </p>
                </div>
                <div className="divide-y divide-green-100">
                  {rhSalaryRequests.map(req => {
                    const isLoading = rhRequestAction?.id === req.id && rhRequestAction.loading
                    const hasError = rhRequestAction?.id === req.id && rhRequestAction.error
                    return (
                      <div key={req.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-gray-800 truncate">{req.staffName || 'Employe'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {(req.category === 'avance' ? 'Avance salaire' : 'Salaire')} - {req.salaryMonth || 'Mois non precise'}
                            </p>
                            {req.note && <p className="text-xs text-gray-400 truncate mt-0.5">{req.note}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-green-700 text-sm">{fmt(req.amount)} DH</p>
                            <button
                              onClick={() => handleCompleteRhRequest(req)}
                              disabled={isLoading}
                              className="mt-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-60"
                            >
                              {isLoading ? 'Paiement...' : 'Payer'}
                            </button>
                          </div>
                        </div>
                        {hasError && <p className="text-xs text-red-600 font-semibold mt-2">{rhRequestAction.error}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {cashierPendingRequests.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
                  <LiveClock className="w-4 h-4 text-amber-700" />
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                    {cashierPendingRequests.length} demande(s) en attente
                  </p>
                </div>
                <div className="divide-y divide-amber-100">
                  {cashierPendingRequests.map(req => {
                    const rt = CAISSE_REQUEST_TYPES.find(t => t.key === req.type)
                    return (
                      <div key={req.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold px-2 py-1 rounded-lg ${rt?.color}`}>
                              {rt?.emoji} {rt?.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{req.description || 'Aucune description'}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-black text-amber-700 text-sm">{fmt(req.amount)} DH</p>
                          <p className="text-xs text-amber-600">En attente</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Transactions recentes */}
            {transactions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-700">Depots recus</h3>
                  <button
                    onClick={() => setTab('transactions')}
                    className="text-xs text-teal-600 font-semibold hover:underline"
                  >
                    Tout voir
                  </button>
                </div>
                <div className="space-y-2">
                  {transactions.slice(0, 3).map(t => (
                    <div key={t.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{t.agentName || 'Depot'}</p>
                        <p className="text-xs text-gray-400">{t.description} - {new Date(t.createdAt?.toDate?.() || t.createdAt || 0).toLocaleDateString('fr-MA', { month: 'short', day: '2-digit' })}</p>
                      </div>
                      <p className="text-sm font-black text-emerald-600 shrink-0">+{fmt(t.amount)} DH</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const open = remarks.filter(r => !r.resolved).length
              return (
                <button onClick={() => setTab('remarques')}
                  className="w-full flex items-center justify-between bg-white border border-gray-100 shadow-sm hover:shadow-md rounded-2xl px-4 py-3.5 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${open > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                      <AlertTriangle className={`w-5 h-5 ${open > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-800">Remarques agents</p>
                      <p className="text-xs text-gray-400">
                        {open > 0
                          ? <span className="text-red-500 font-semibold">{open} remarque(s) ouverte(s)</span>
                          : <span className="text-green-600 font-semibold">Aucune remarque ouverte</span>
                        }
                        {remarks.length > 0 && ` - ${remarks.length} au total`}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
                </button>
              )
            })()}

            {/* Derniers mouvements */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700">Derniers mouvements</h3>
                <button
                  onClick={() => setTab('mouvements')}
                  className="text-xs text-teal-600 font-semibold hover:underline"
                >
                  Tout voir
                </button>
              </div>

              {cashierEntries.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <Wallet className="w-9 h-9 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun mouvement enregistre</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cashierEntries.slice(0, 5).map(e => {
                    const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                    return (
                      <div key={e.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm border border-gray-100">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                          {cat?.emoji || '$'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">{e.description}</p>
                          <p className="text-xs text-gray-400">{cat?.label} - {fmtDate(e)}</p>
                        </div>
                        <p className={`text-sm font-black shrink-0 ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                          {e.type === 'entree' ? '+' : '-'}{fmt(e.amount)} DH
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ MOUVEMENTS ══════════════ */}
        {tab === 'mouvements' && (
          <div className="mt-4 space-y-3">

            {/* Barre de controle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-white border border-gray-200 rounded-xl p-1 flex-1">
                {[
                  { key: 'all',    label: 'Tout',    cls: 'bg-teal-600'  },
                  { key: 'entree', label: 'Entrees', cls: 'bg-green-600' },
                  { key: 'sortie', label: 'Sorties', cls: 'bg-red-500'   },
                ].map(t => (
                  <button key={t.key} onClick={() => setTypeFilter(t.key)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                      typeFilter === t.key ? `${t.cls} text-white` : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => openEntry('entree')}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition"
              >
                <Plus className="w-4 h-4" /> Nouveau
              </button>
            </div>

            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                placeholder="Rechercher description, agent, ref..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Filtre date */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {[
                  { key: 'all',    label: 'Tout'    },
                  { key: 'today',  label: "Auj."    },
                  { key: 'week',   label: '7 jours' },
                  { key: 'month',  label: 'Ce mois' },
                  { key: 'custom', label: 'Perso'   },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      datePreset === key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >{label}</button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-6">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500 flex-1" />
                  <span className="text-gray-400 text-xs shrink-0">a</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500 flex-1" />
                </div>
              )}
            </div>

            {/* Totaux periode */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Entrees</p>
                <p className="font-black text-green-600 text-sm mt-0.5">{fmt(entreesFiltered)} DH</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Sorties</p>
                <p className="font-black text-red-600 text-sm mt-0.5">{fmt(sortiesFiltered)} DH</p>
              </div>
              <div className={`${entreesFiltered - sortiesFiltered >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-xl p-3 text-center`}>
                <p className="text-xs text-gray-500">Solde</p>
                <p className={`font-black text-sm mt-0.5 ${entreesFiltered - sortiesFiltered >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                  {fmt(Math.abs(entreesFiltered - sortiesFiltered))} DH
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-400 px-1">{filteredEntries.length} mouvement(s)</p>

            {/* Liste */}
            {filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucun mouvement trouve</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((e: any) => {
                  const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                  return (
                    <div key={e.id} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
                      e.type === 'entree' ? 'border-l-green-500 border border-green-50' : 'border-l-red-400 border border-red-50'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                          {cat?.emoji || '$'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-800 truncate">{e.description}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${cat?.color || 'bg-gray-100 text-gray-600'}`}>
                                  {cat?.emoji} {cat?.label}
                                </span>
                                {e.agentName && <span className="text-xs text-blue-600">Agent: {e.agentName}</span>}
                                {e.staffName && <span className="text-xs text-purple-600">Personnel: {e.staffName}</span>}
                              </div>
                              {e.reference && <p className="text-xs text-gray-400 mt-1 font-mono">Ref: {e.reference}</p>}
                              {e.note      && <p className="text-xs text-gray-500 mt-1 italic">{e.note}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-base font-black ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                                {e.type === 'entree' ? '+' : '-'}{fmt(e.amount)} DH
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{fmtDate(e)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-gray-50">
                        <button onClick={() => setViewEntry(e)}
                          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition">
                          <Eye className="w-3.5 h-3.5" /> Voir
                        </button>
                        <button onClick={() => openEditEntry(e)}
                          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 transition">
                          <Edit2 className="w-3.5 h-3.5" /> Modifier
                        </button>
                        <button onClick={() => setDeleteConfirm(e)}
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition">
                          <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {/* ══════════════ REMARQUES AGENTS ══════════════ */}
        {tab === 'remarques' && (
          <div className="mt-4 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex bg-white border border-gray-200 rounded-xl p-1 flex-1 mr-2">
                {[
                  { key: 'open',     label: 'Ouvertes', count: remarks.filter(r => !r.resolved).length },
                  { key: 'resolved', label: 'Resolues', count: remarks.filter(r => r.resolved).length  },
                  { key: 'all',      label: 'Toutes',   count: remarks.length                          },
                ].map(f => (
                  <button key={f.key} onClick={() => setRemarkFilter(f.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 ${
                      remarkFilter === f.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {f.label}
                    {f.count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${remarkFilter === f.key ? 'bg-white/30' : 'bg-gray-100'}`}>{f.count}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setRemarkModal({ type: '', agentName: '', amount: '', description: '', loading: false, error: '' })}
                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition shrink-0"
              >
                <Plus className="w-4 h-4" /> Nouvelle
              </button>
            </div>

            <ListFilters
              search={remarkSearch}
              onSearch={setRemarkSearch}
              placeholder="Rechercher remarque, agent, type, montant..."
              preset={remarkDatePreset}
              onPreset={setRemarkDatePreset}
              from={remarkDateFrom}
              onFrom={setRemarkDateFrom}
              to={remarkDateTo}
              onTo={setRemarkDateTo}
              tone="red"
            />
            <p className="text-xs text-gray-400 px-1">{filteredRemarks.length} remarque(s)</p>

            {/* Liste */}
            {(() => {
              const filtered = filteredRemarks
              if (filtered.length === 0) return (
                <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">
                    {remarkFilter === 'open' ? 'Aucune remarque ouverte - tout est en ordre' : 'Aucune remarque'}
                  </p>
                </div>
              )
              return (
                <div className="space-y-3">
                  {filtered.map((r: any) => {
                    const rt = REMARK_TYPES.find(t => t.key === r.type) || (REMARK_TYPES as any).at(-1)
                    const d  = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt || 0)
                    const dr = r.resolvedAt?.toDate ? r.resolvedAt.toDate() : null
                    return (
                      <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.resolved ? 'border-green-100 opacity-75' : 'border-red-100'}`}>
                        <div className={`px-4 py-3 flex items-center gap-3 ${r.resolved ? 'bg-green-50' : 'bg-red-50'}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border ${rt.color}`}>
                            {rt.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rt.color}`}>{rt.label}</span>
                              {r.resolved
                                ? <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolue</span>
                                : <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><LiveClock className="w-3 h-3" /> Ouverte</span>
                              }
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {d.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                              {r.caissierName && ` - par ${r.caissierName}`}
                            </p>
                          </div>
                          {r.amount > 0 && (
                            <div className="text-right shrink-0">
                              <p className="text-sm font-black text-red-600">-{fmt(r.amount)} DH</p>
                              <p className="text-xs text-gray-400">manquant</p>
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-3 space-y-2">
                          {r.agentName && (
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              Agent concerne : <span className="text-blue-700">{r.agentName}</span>
                            </p>
                          )}
                          <p className="text-sm text-gray-700">{r.description}</p>
                          {r.resolved && dr && (
                            <p className="text-xs text-green-600 italic">
                              Resolue le {dr.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit' })}
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                            {!r.resolved && (
                              <button onClick={() => resolveRemark(r.id)}
                                className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Marquer resolue
                              </button>
                            )}
                            <button onClick={() => deleteRemark(r.id)}
                              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition ml-auto">
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* ══════════════ TRANSACTIONS RECUES ══════════════ */}
        {tab === 'recoveries' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">Demandes de recuperation des agents</h2>
                <p className="text-sm text-gray-500 mt-1">{pendingRecoveryRequests.length} demande(s) en attente</p>
              </div>
              <span className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1.5 rounded-full">
                {cashierRecoveryRequests.length} total
              </span>
            </div>

            <ListFilters
              search={recoverySearch}
              onSearch={setRecoverySearch}
              placeholder="Rechercher agent, montant, statut, motif..."
              preset={recoveryDatePreset}
              onPreset={setRecoveryDatePreset}
              from={recoveryDateFrom}
              onFrom={setRecoveryDateFrom}
              to={recoveryDateTo}
              onTo={setRecoveryDateTo}
              tone="blue"
            />
            <p className="text-xs text-gray-400 px-1">{filteredRecoveryRequests.length} demande(s)</p>

            {filteredRecoveryRequests.length === 0 ? (
              <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Aucune demande recue</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRecoveryRequests.map((req: any) => {
                  const d = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt || 0)
                  const isPending = req.status === 'pending'
                  return (
                    <div key={req.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${isPending ? 'border-blue-100' : req.status === 'approved' ? 'border-green-100' : 'border-red-100'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{req.agentName || 'Agent'}</p>
                          <p className="text-xs text-gray-500 mt-1">{req.description || 'Demande sans motif'}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                            {' '}{d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-blue-700 text-base">{fmt(req.amount)} DH</p>
                          <span className={`inline-flex mt-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                            req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            req.status === 'approved' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Acceptee' : 'Refusee'}
                          </span>
                        </div>
                      </div>

                      {recoveryAction?.id === req.id && recoveryAction.error && (
                        <div className="mt-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                          {recoveryAction.error}
                        </div>
                      )}

                      {isPending && (
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-gray-50">
                          <button
                            onClick={() => handleRejectRecovery(req)}
                            disabled={recoveryAction?.id === req.id && recoveryAction.loading}
                            className="py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-60 transition"
                          >
                            Refuser
                          </button>
                          <button
                            onClick={() => handleApproveRecovery(req)}
                            disabled={recoveryAction?.id === req.id && recoveryAction.loading}
                            className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 transition"
                          >
                            {recoveryAction?.id === req.id && recoveryAction.loading ? 'Traitement...' : 'Accepter et donner'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'transactions' && (
          <div className="mt-4 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">Depots recus des agents</h2>
                <p className="text-sm text-gray-500 mt-1">{transactions.length} depot(s) enregistre(s)</p>
              </div>
              <button
                onClick={() => setDepositModal({ amountEspeces: '', amountCheques: '', amountVirement: '', agentId: '', agentName: '', description: '', loading: false, error: '' })}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition"
              >
                <Plus className="w-4 h-4" /> Nouveau
              </button>
            </div>

            {/* Total du jour */}
            {filteredTransactions.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total especes</p>
                  <p className="font-black text-emerald-600 text-sm mt-0.5">{fmt(filteredTransactions.reduce((s: any, t: any) => s + (t.amountEspeces || 0), 0))} DH</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total cheques</p>
                  <p className="font-black text-blue-600 text-sm mt-0.5">{fmt(filteredTransactions.reduce((s: any, t: any) => s + (t.amountCheques || 0), 0))} DH</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total virements</p>
                  <p className="font-black text-purple-600 text-sm mt-0.5">{fmt(filteredTransactions.reduce((s: any, t: any) => s + (t.amountVirement || 0), 0))} DH</p>
                </div>
              </div>
            )}

            <ListFilters
              search={transactionSearch}
              onSearch={setTransactionSearch}
              placeholder="Rechercher depot, agent, montant, description..."
              preset={transactionDatePreset}
              onPreset={setTransactionDatePreset}
              from={transactionDateFrom}
              onFrom={setTransactionDateFrom}
              to={transactionDateTo}
              onTo={setTransactionDateTo}
              tone="emerald"
            />
            <p className="text-xs text-gray-400 px-1">{filteredTransactions.length} depot(s)</p>

            {/* Liste */}
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Aucun depot enregistre</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTransactions.map((t: any) => {
                  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0)
                  return (
                    <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-emerald-50">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 text-base">
                            $
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800">{t.agentName || 'Depot'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t.description || '-'}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                              {' '}{d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Montants detailles */}
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                        {t.amountEspeces > 0 && (
                          <div className="text-xs">
                            <p className="text-gray-500">Especes</p>
                            <p className="font-bold text-emerald-600 mt-0.5">{fmt(t.amountEspeces)} DH</p>
                          </div>
                        )}
                        {t.amountCheques > 0 && (
                          <div className="text-xs">
                            <p className="text-gray-500">Cheques</p>
                            <p className="font-bold text-blue-600 mt-0.5">{fmt(t.amountCheques)} DH</p>
                          </div>
                        )}
                        {t.amountVirement > 0 && (
                          <div className="text-xs">
                            <p className="text-gray-500">Virements</p>
                            <p className="font-bold text-purple-600 mt-0.5">{fmt(t.amountVirement)} DH</p>
                          </div>
                        )}
                      </div>

                      {/* Total */}
                      <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Total recu</p>
                        <p className="font-black text-gray-800 text-base">+{fmt(t.amount)} DH</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ══════════════ MODAL DEPOT D'AGENT ══════════════ */}
      {depositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">Recevoir depot d'agent</h3>
              </div>
              <button onClick={() => setDepositModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {depositModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {depositModal.error}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Agent qui remet l'argent</p>
                <select
                  value={depositModal.agentId}
                  onChange={e => {
                    const agent = agents.find(a => a.id === e.target.value)
                    setDepositModal((m: any) => ({ ...m, agentId: e.target.value, agentName: agent?.name || '' }))
                  }}
                  className={inputCls}
                >
                  <option value="">Selectionner un agent</option>
                  {agents
                    .filter(a => profile?.city && a.city === profile.city)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.email || 'Agent'}{agent.city ? ` - ${agent.city}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Especes (DH)</p>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={depositModal.amountEspeces}
                  onChange={e => setDepositModal((m: any) => ({ ...m, amountEspeces: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cheques (DH)</p>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={depositModal.amountCheques}
                  onChange={e => setDepositModal((m: any) => ({ ...m, amountCheques: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Virement (DH)</p>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={depositModal.amountVirement}
                  onChange={e => setDepositModal((m: any) => ({ ...m, amountVirement: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
                <p className="text-xs text-teal-700 font-medium">
                  Total: <span className="font-black text-lg">{fmt(parseFloat(depositModal.amountEspeces || 0) + parseFloat(depositModal.amountCheques || 0) + parseFloat(depositModal.amountVirement || 0))} DH</span>
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description (optionnel)</p>
                <input
                  placeholder="Ex: Remise RETOUR FOND livraison Casablanca"
                  value={depositModal.description}
                  onChange={e => setDepositModal((m: any) => ({ ...m, description: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <button
                onClick={handleSaveDeposit}
                disabled={depositModal.loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition flex items-center justify-center gap-2"
              >
                {depositModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                  : <><Check className="w-4 h-4" /> Enregistrer le depot</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL DEMANDE D'APPROBATION ══════════════ */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">Demander approbation</h3>
              </div>
              <button onClick={() => setRequestModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {requestModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {requestModal.error}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type d'operation <span className="text-red-400">*</span></p>
                <div className="grid grid-cols-1 gap-2">
                  {CAISSE_REQUEST_TYPES.map(rt => (
                    <button key={rt.key}
                      onClick={() => setRequestModal((m: any) => ({ ...m, type: rt.key }))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border-2 transition text-left ${
                        requestModal.type === rt.key
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{rt.emoji}</span>
                      <span>{rt.label}</span>
                      {requestModal.type === rt.key && <Check className="w-4 h-4 ml-auto text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Montant (DH) <span className="text-red-400">*</span></p>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={requestModal.amount}
                  onChange={e => setRequestModal((m: any) => ({ ...m, amount: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description (optionnel)</p>
                <textarea
                  rows={3}
                  placeholder="Ex: Virement du solde de la caisse vers le compte bancaire"
                  value={requestModal.description}
                  onChange={e => setRequestModal((m: any) => ({ ...m, description: e.target.value }))}
                  className={inputCls + ' resize-none'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRequestModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button
                  onClick={handleSaveRequest}
                  disabled={requestModal.loading}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold transition flex items-center justify-center gap-2">
                  {requestModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> ...</>
                    : <><Send className="w-4 h-4" /> Demander</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL NOUVELLE ECRITURE ══════════════ */}
      {entryModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

            {/* Entete modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${entryModal.type === 'entree' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {entryModal.type === 'entree'
                    ? <TrendingUp className="w-5 h-5 text-green-600" />
                    : <TrendingDown className="w-5 h-5 text-red-600" />
                  }
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">
                    {entryModal.type === 'entree' ? 'Nouvelle entree' : 'Nouvelle sortie / charge'}
                  </h3>
                  <p className="text-xs text-gray-400">Caisse de {profile?.city}</p>
                </div>
              </div>
              <button onClick={() => setEntryModal(EMPTY_MODAL)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {entryModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {entryModal.error}
                </div>
              )}

              {/* ---- RETOUR FOND en attente de remise ---- */}
              {false && entryModal.type === 'entree' && pendingCods.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
                    <span className="text-base">$</span>
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                      RETOUR FOND en attente de remise ({pendingCods.length})
                    </p>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {pendingCods.map(p => {
                      const pt = COD_PAYMENT_TYPES.find(t => t.key === p.codPaymentType)
                      const isSelected = entryModal.codParcelId === p.id
                      return (
                        <div
                          key={p.id}
                          className={`px-4 py-3 flex items-center gap-3 transition ${isSelected ? 'bg-green-50' : 'hover:bg-amber-100/60'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-gray-700">{p.trackingId}</span>
                              {pt && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pt.bg} ${pt.text}`}>
                                  {pt.emoji} {pt.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 truncate mt-0.5">
                              {p.receiver?.name}
                              {(p.codCollectedBy || p.deliveryDriverName) && (
                                <span className="text-gray-400"> - par {p.codCollectedBy || p.deliveryDriverName}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-black text-amber-700 text-sm">{fmt(p.codAmount)} DH</span>
                            {isSelected
                              ? <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Selectionne
                                </span>
                              : <button
                                  onClick={() => selectCod(p)}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-200 hover:bg-amber-300 px-2.5 py-1 rounded-lg transition"
                                >
                                  Selectionner
                                </button>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {entryModal.codParcelId && (
                    <div className="px-4 py-2 bg-green-50 border-t border-green-200 flex items-center justify-between">
                      <p className="text-xs text-green-700 font-medium">Formulaire pre-rempli - Le RETOUR FOND sera marque "Remis" a la sauvegarde</p>
                      <button
                        onClick={() => setEntryModal(m => ({ ...m, codParcelId: null, category: '', amount: '', description: '', reference: '', agentName: '', note: '' }))}
                        className="text-[10px] text-gray-500 hover:text-gray-700 underline ml-2 shrink-0"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Selection du type */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type d'operation</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEntryModal(m => ({ ...m, type: 'entree', category: '' }))}
                    className={`py-3 rounded-xl border-2 text-sm font-bold transition ${
                      entryModal.type === 'entree'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-green-200'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 inline mr-1.5" />Entree
                  </button>
                  <button
                    onClick={() => setEntryModal(m => ({ ...m, type: 'sortie', category: '' }))}
                    className={`py-3 rounded-xl border-2 text-sm font-bold transition ${
                      entryModal.type === 'sortie'
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-red-200'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4 inline mr-1.5" />Sortie
                  </button>
                </div>
              </div>

              {/* Categories ? Entree */}
              {entryModal.type === 'entree' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categorie <span className="text-red-400">*</span></p>
                  <div className="grid grid-cols-1 gap-2">
                    {ENTREE_CATS.map(cat => (
                      <button key={cat.key}
                        onClick={() => setEntryModal(m => ({ ...m, category: cat.key }))}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border-2 transition text-left ${
                          entryModal.category === cat.key
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-xl">{cat.emoji}</span>
                        <span>{cat.label}</span>
                        {entryModal.category === cat.key && <Check className="w-4 h-4 ml-auto text-teal-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Categories ? Sortie : s?par?es en Charges et Personnel */}
              {entryModal.type === 'sortie' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Charges d'exploitation <span className="text-red-400">*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {CHARGE_CATS.map(cat => (
                        <button key={cat.key}
                          onClick={() => setEntryModal(m => ({ ...m, category: cat.key }))}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                            entryModal.category === cat.key
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span>{cat.emoji}</span>
                          <span className="truncate">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Paiements personnel</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PERSO_CATS.map(cat => (
                        <button key={cat.key}
                          onClick={() => setEntryModal(m => ({
                            ...m,
                            category: cat.key,
                            description: cat.key === 'salaire' ? 'Paiement salaire personnel' : 'Avance sur salaire',
                            salaryMonth: m.salaryMonth || new Date().toISOString().slice(0, 7),
                          }))}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                            entryModal.category === cat.key
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span>{cat.emoji}</span>
                          <span>{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Montant */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Montant (DH) <span className="text-red-400">*</span>
                </p>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={entryModal.amount}
                  onChange={e => setEntryModal(m => ({ ...m, amount: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Description <span className="text-red-400">*</span>
                </p>
                <input
                  placeholder={entryModal.type === 'entree' ? 'Ex: Remise RETOUR FOND de l\'agent Ahmed' : 'Ex: Facture eau mars 2025'}
                  value={entryModal.description}
                  onChange={e => setEntryModal(m => ({ ...m, description: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {/* Reference document */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Reference document <span className="text-gray-300 font-normal normal-case">(optionnel)</span>
                </p>
                <input
                  placeholder="No facture, recu, bon de caisse..."
                  value={entryModal.reference}
                  onChange={e => setEntryModal(m => ({ ...m, reference: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {/* Nom agent (pour entrees) */}
              {entryModal.type === 'entree' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Nom de l'agent <span className="text-gray-300 font-normal normal-case">(optionnel)</span>
                  </p>
                  <input
                    placeholder="Nom de l'agent concerne"
                    value={entryModal.agentName}
                    onChange={e => setEntryModal(m => ({ ...m, agentName: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              )}

              {/* Personnel (salaire / avance) */}
              {['salaire', 'avance'].includes(entryModal.category) && (() => {
                const agencyStaff = staffUsers.filter(u => !profile?.city || u.city === profile.city)
                const selectedStaff = staffUsers.find(u => u.id === entryModal.staffId)
                const salaryBase = parseFloat(selectedStaff?.salaire || 0) || 0
                const paidThisMonth = selectedStaff ? entries
                  .filter(e => e.category === 'salaire'
                    && e.salaryMonth === entryModal.salaryMonth
                    && (e.staffId === selectedStaff.id || (!e.staffId && e.staffName === selectedStaff.name)))
                  .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0) : 0
                const advanceThisMonth = selectedStaff ? entries
                  .filter(e => e.category === 'avance'
                    && e.salaryMonth === entryModal.salaryMonth
                    && (e.staffId === selectedStaff.id || (!e.staffId && e.staffName === selectedStaff.name)))
                  .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0) : 0
                const remaining = Math.max(0, salaryBase - paidThisMonth - advanceThisMonth)
                return (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Employe de l'agence <span className="text-red-400">*</span>
                      </p>
                      <div className="relative">
                        <select
                          value={entryModal.staffId}
                          onChange={e => {
                            const staff = staffUsers.find(u => u.id === e.target.value)
                            const staffSalary = parseFloat(staff?.salaire || 0) || 0
                            const paid = staff ? entries
                              .filter(entry => entry.category === 'salaire'
                                && entry.salaryMonth === entryModal.salaryMonth
                                && (entry.staffId === staff.id || (!entry.staffId && entry.staffName === staff.name)))
                              .reduce((sum, entry) => sum + (parseFloat(entry.amount || 0) || 0), 0) : 0
                            const advanced = staff ? entries
                              .filter(entry => entry.category === 'avance'
                                && entry.salaryMonth === entryModal.salaryMonth
                                && (entry.staffId === staff.id || (!entry.staffId && entry.staffName === staff.name)))
                              .reduce((sum, entry) => sum + (parseFloat(entry.amount || 0) || 0), 0) : 0
                            const remainingSalary = Math.max(0, staffSalary - paid - advanced)
                            setEntryModal(m => ({
                              ...m,
                              staffId: staff?.id || '',
                              staffName: staff?.name || '',
                              staffRole: staff?.role || '',
                              amount: m.category === 'salaire' && staff ? String(remainingSalary || staffSalary || '') : m.amount,
                              description: staff ? `${m.category === 'salaire' ? 'Salaire' : 'Avance salaire'} ${staff.name}` : m.description,
                            }))
                          }}
                          className={inputCls + ' appearance-none'}
                        >
                          <option value="">-- Selectionner un employe --</option>
                          {agencyStaff.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name || 'Sans nom'} - {u.role || 'personnel'}{u.salaire ? ` - ${fmt(parseFloat(u.salaire || 0))} DH` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                      {agencyStaff.length === 0 && (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-2 mt-2">
                          Aucun employe trouve pour l'agence {profile?.city || ''}.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mois concerne</p>
                      <input
                        type="month"
                        value={entryModal.salaryMonth}
                        onChange={e => setEntryModal(m => ({ ...m, salaryMonth: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    {selectedStaff && (
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-gray-400">Nom</p><p className="font-bold text-gray-800">{selectedStaff.name || '-'}</p></div>
                        <div><p className="text-gray-400">Role</p><p className="font-bold text-gray-800">{selectedStaff.role || '-'}</p></div>
                        <div><p className="text-gray-400">Telephone</p><p className="font-bold text-gray-800">{selectedStaff.tel || '-'}</p></div>
                        <div><p className="text-gray-400">CIN / CNSS</p><p className="font-bold text-gray-800">{selectedStaff.cin || '-'} / {selectedStaff.cnss || '-'}</p></div>
                        <div><p className="text-gray-400">Salaire mensuel</p><p className="font-black text-green-700">{fmt(salaryBase)} DH</p></div>
                        <div><p className="text-gray-400">Reste a payer</p><p className="font-black text-red-600">{fmt(remaining)} DH</p></div>
                        {advanceThisMonth > 0 && (
                          <div className="col-span-2"><p className="text-gray-400">Avances ce mois</p><p className="font-black text-pink-600">{fmt(advanceThisMonth)} DH</p></div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Note */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Note <span className="text-gray-300 font-normal normal-case">(optionnel)</span>
                </p>
                <input
                  placeholder="Remarque ou precision supplementaire..."
                  value={entryModal.note}
                  onChange={e => setEntryModal(m => ({ ...m, note: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <button
                onClick={handleSaveEntry}
                disabled={entryModal.loading}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition flex items-center justify-center gap-2"
              >
                {entryModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                  : <><Check className="w-4 h-4" /> Enregistrer l'ecriture</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL DETAIL MOUVEMENT ══════════════ */}
      {viewEntry && (() => {
        const cat = CAISSE_CATEGORIES.find(c => c.key === viewEntry.category)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Operation de caisse</p>
                  <h3 className="font-black text-gray-800 text-lg mt-1">{viewEntry.description}</h3>
                </div>
                <button onClick={() => setViewEntry(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-gray-500">Type</span>
                  <span className={`font-black ${viewEntry.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                    {viewEntry.type === 'entree' ? 'Entree' : 'Sortie'}
                  </span>
                </div>
                <div className="flex justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-gray-500">Categorie</span>
                  <span className="font-bold text-gray-800">{cat?.emoji} {cat?.label || viewEntry.category}</span>
                </div>
                <div className="flex justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-gray-500">Montant</span>
                  <span className={`font-black ${viewEntry.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                    {viewEntry.type === 'entree' ? '+' : '-'}{fmt(viewEntry.amount)} DH
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs">Date</p>
                    <p className="font-bold text-gray-800 mt-1">{fmtDate(viewEntry)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs">Reference</p>
                    <p className="font-bold text-gray-800 mt-1 break-all">{viewEntry.reference || '-'}</p>
                  </div>
                </div>
                {(viewEntry.agentName || viewEntry.staffName) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs">Concerne</p>
                    <p className="font-bold text-gray-800 mt-1">{viewEntry.agentName || viewEntry.staffName}</p>
                  </div>
                )}
                {viewEntry.note && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs">Note</p>
                    <p className="font-medium text-gray-700 mt-1">{viewEntry.note}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button onClick={() => { setViewEntry(null); openEditEntry(viewEntry) }}
                  className="py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold transition flex items-center justify-center gap-2">
                  <Edit2 className="w-4 h-4" /> Modifier
                </button>
                <button onClick={() => { setDeleteConfirm(viewEntry); setViewEntry(null) }}
                  className="py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════ MODAL MODIFICATION MOUVEMENT ══════════════ */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">Modifier l'operation</h3>
                <p className="text-xs text-gray-400">Caisse de {profile?.city}</p>
              </div>
              <button onClick={() => setEditEntry(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {editEntry.error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl p-3">
                  {editEntry.error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {['entree', 'sortie'].map(t => (
                  <button key={t} onClick={() => setEditEntry((m: any) => ({ ...m, type: t, category: '' }))}
                    className={`py-3 rounded-xl border-2 font-bold transition ${
                      editEntry.type === t
                        ? t === 'entree' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}>
                    {t === 'entree' ? 'Entree' : 'Sortie'}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categorie</p>
                <select value={editEntry.category} onChange={e => setEditEntry((m: any) => ({ ...m, category: e.target.value }))}
                  className={inputCls}>
                  <option value="">-- Selectionner --</option>
                  {CAISSE_CATEGORIES.filter(c => c.type === editEntry.type).map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Montant (DH)</p>
                <input type="number" min="0" step="0.01" value={editEntry.amount}
                  onChange={e => setEditEntry((m: any) => ({ ...m, amount: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</p>
                <input value={editEntry.description || ''} onChange={e => setEditEntry((m: any) => ({ ...m, description: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reference</p>
                <input value={editEntry.reference || ''} onChange={e => setEditEntry((m: any) => ({ ...m, reference: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {editEntry.type === 'entree' ? 'Agent / origine' : 'Personnel / beneficiaire'}
                </p>
                <input value={editEntry.type === 'entree' ? (editEntry.agentName || '') : (editEntry.staffName || '')}
                  onChange={e => setEditEntry((m: any) => editEntry.type === 'entree'
                    ? { ...m, agentName: e.target.value }
                    : { ...m, staffName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Note</p>
                <input value={editEntry.note || ''} onChange={e => setEditEntry((m: any) => ({ ...m, note: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <button onClick={handleUpdateEntry} disabled={editEntry.loading}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition flex items-center justify-center gap-2">
                {editEntry.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Modification...</>
                  : <><Check className="w-4 h-4" /> Enregistrer la modification</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL SUPPRESSION ══════════════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-800">Supprimer ce mouvement ?</h3>
              <p className="text-sm text-gray-500 mt-1 truncate px-4">{deleteConfirm.description}</p>
              <p className={`text-xl font-black mt-2 ${deleteConfirm.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                {deleteConfirm.type === 'entree' ? '+' : '-'}{fmt(deleteConfirm.amount)} DH
              </p>
              <p className="text-xs text-red-400 mt-1">Cette action est irreversible.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                Annuler
              </button>
              <button
                onClick={handleDeleteEntry}
                className="py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════════ MODAL NOUVELLE REMARQUE ══════════════ */}
      {remarkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Nouvelle remarque agent</h3>
                  <p className="text-xs text-gray-400">Caisse de {profile?.city}</p>
                </div>
              </div>
              <button onClick={() => setRemarkModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
              {remarkModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{remarkModal.error}</div>
              )}

              {/* Type */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type de defaut <span className="text-red-400">*</span></p>
                <div className="grid grid-cols-1 gap-2">
                  {REMARK_TYPES.map(rt => (
                    <button key={rt.key}
                      onClick={() => setRemarkModal((m: any) => ({ ...m, type: rt.key }))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border-2 transition text-left ${
                        remarkModal.type === rt.key
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}>
                      <span className="text-xl">{rt.emoji}</span>
                      <span>{rt.label}</span>
                      {remarkModal.type === rt.key && <Check className="w-4 h-4 ml-auto text-red-500" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent concerne */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Agent concerne</p>
                <input
                  placeholder="Nom de l'agent..."
                  value={remarkModal.agentName}
                  onChange={e => setRemarkModal((m: any) => ({ ...m, agentName: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {/* Montant manquant */}
              {['manque_especes','manque_cheques','manque_virement','manque_cod'].includes(remarkModal.type) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Montant manquant (DH)</p>
                  <div className="relative">
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={remarkModal.amount}
                      onChange={e => setRemarkModal((m: any) => ({ ...m, amount: e.target.value }))}
                      className={inputCls}
                    />
                    <span className="absolute right-4 top-3.5 text-xs text-gray-400 font-semibold">DH</span>
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description <span className="text-red-400">*</span></p>
                <textarea
                  rows={3}
                  placeholder="Decrivez le probleme constate..."
                  value={remarkModal.description}
                  onChange={e => setRemarkModal((m: any) => ({ ...m, description: e.target.value }))}
                  className={inputCls + ' resize-none'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={() => setRemarkModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button
                  onClick={handleSaveRemark}
                  disabled={remarkModal.loading}
                  className="py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                  {remarkModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                    : <><AlertTriangle className="w-4 h-4" /> Enregistrer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
