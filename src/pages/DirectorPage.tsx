import { useEffect, useRef, useState, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { useNavigate } from 'react-router-dom'
import {
  subscribeAllParcels, subscribeAllUsers,
  updateParcelStatus, remitCod, updateUser,
  subscribeAllCaisse, createCaisseCloture, subscribeAllCaisseClotures,
  subscribeAllCaissierRemarks, REMARK_TYPES, resolveRemark, deleteRemark,
} from '../firebase/firestore'
import {
  subscribeAllClientMessages, resolveClientMessage, addClientMessageReply,
  deleteClientMessage, markClientMessageReadByStaff,
} from '../firebase/clients'
import { logDirectorAction } from '../firebase/directorLogs'
import { exportSiteBackup, BACKUP_COLLECTIONS } from '../firebase/backup'
import {
  CAISSE_CATEGORIES, CITIES, STATUSES, STATUS_COLORS, COD_PAYMENT_TYPES, COD_STATUS,
  codCollectedLabel, DIRECTOR_PERMISSIONS,
} from '../firebase/constants'
import {
  LayoutDashboard, LogOut, Package, Clock, CheckCircle,
  Banknote, Filter, ExternalLink, Edit2, X, Calendar, Users, Wallet,
  ChevronDown, Save, Search, BarChart2, Truck, MapPin, ArrowRight,
  Contact, Car, Menu, ShieldCheck, TrendingUp, TrendingDown, Lock,
  AlertTriangle, CheckCircle2, Trash2, FileText, Download, MessageCircle,
} from 'lucide-react'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import { fmt } from '../utils/formatNumber'

const parcelDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const caisseEntryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}
const filterByDate = (list: any, preset: any, from: any, to: any, getDate = parcelDate) => {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end: any = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  return list.filter((p: any) => {
    const d = getDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}

const currentSalaryMonth = () => new Date().toISOString().slice(0, 7)

const EDIT_ROLES = [
  { key: 'agent',     label: 'Agent',     emoji: '🧑‍💼', badge: 'bg-blue-100 text-blue-700'    },
  { key: 'chauffeur', label: 'Chauffeur', emoji: '🚚',  badge: 'bg-orange-100 text-orange-700' },
  { key: 'caissier',  label: 'Caissier',  emoji: '🏦',  badge: 'bg-teal-100 text-teal-700'     },
  { key: 'salarie',   label: 'Salarié',   emoji: '👤',  badge: 'bg-rose-100 text-rose-700'     },
]

export default function DirectorPage() {
  const navigate = useNavigate()

  const [profile,       setProfile]      = useState<any>(null)
  const [mainTab,       setMainTab]      = useState('home')
  const [menuOpen,      setMenuOpen]     = useState(false)

  // Parcels
  const [parcels,       setParcels]      = useState<any[]>([])
  const [loading,       setLoading]      = useState(true)
  const [cityFilter,    setCityFilter]   = useState('Toutes')
  const [statusFilter,  setStatusFilter] = useState('Tous')
  const [search,        setSearch]       = useState('')
  const [datePreset,    setDatePreset]   = useState('all')
  const [dateFrom,      setDateFrom]     = useState('')
  const [dateTo,        setDateTo]       = useState('')
  const [statusModal,   setStatusModal]  = useState<any>(null)

  // RETOUR FOND
  const [codFilter,     setCodFilter]    = useState('all')
  const [codSearch,     setCodSearch]    = useState('')
  const [codDatePreset, setCodDatePreset] = useState('all')
  const [codDateFrom,   setCodDateFrom]   = useState('')
  const [codDateTo,     setCodDateTo]     = useState('')

  // Users
  const [users,           setUsers]           = useState<any[]>([])
  const [userSearch,      setUserSearch]      = useState('')
  const [roleFilter,      setRoleFilter]      = useState('Tous')
  const [userEdit,        setUserEdit]        = useState<any>(null)
  const [usersDatePreset, setUsersDatePreset] = useState('all')
  const [usersDateFrom,   setUsersDateFrom]   = useState('')
  const [usersDateTo,     setUsersDateTo]     = useState('')

  // Activity
  const [activityRoleFilter,  setActivityRoleFilter]  = useState('all')
  const [activityDatePreset,  setActivityDatePreset]  = useState('all')
  const [activityDateFrom,    setActivityDateFrom]    = useState('')
  const [activityDateTo,      setActivityDateTo]      = useState('')
  const [userActivityModal,   setUserActivityModal]   = useState<any>(null)
  const [userDetailTab,       setUserDetailTab]       = useState('created')

  const [caisseEntries,    setCaisseEntries]    = useState<any[]>([])
  const [caisseClotures,   setCaisseClotures]   = useState<any[]>([])
  const [caisseCityFilter, setCaisseCityFilter] = useState('Toutes')
  const [caisseTypeFilter, setCaisseTypeFilter] = useState('all')
  const [clotureModal,     setClotureModal]     = useState<any>(null)
  const [clotureLoading,   setClotureLoading]   = useState(false)
  const [clotureError,     setClotureError]     = useState('')

  // ---- Remarques caissier
  const [allRemarks,       setAllRemarks]       = useState<any[]>([])
  const [clientMessages,   setClientMessages]   = useState<any[]>([])
  const [clientReplyDrafts, setClientReplyDrafts] = useState<any>({})
  const staffReadMarks = useRef(new Set())
  const [remarkFilter,     setRemarkFilter]     = useState('open')
  const [remarkCityFilter, setRemarkCityFilter] = useState('Toutes')

  // ---- Onglet dossier RH dans le modal d'édition employé
  const [userEditTab,      setUserEditTab]      = useState('access')

  const [backupBusy,       setBackupBusy]       = useState(false)
  const [backupMessage,    setBackupMessage]    = useState<any>(null)

  const permissions      = profile?.directorPermissions || []
  const hasPermission    = (key: any) => permissions.includes(key)

  // Onglets disponibles pour ce directeur
  const TAB_MAP = [
    { key: 'expeditions', label: 'Expéditions',         icon: Package   },
    { key: 'cod',         label: 'RETOUR FOND / Remboursement', icon: Wallet    },
    { key: 'users',       label: 'Utilisateurs',        icon: Users     },
    { key: 'activity',    label: 'Activité',            icon: BarChart2 },
    { key: 'caisse',      label: 'Caisse',              icon: Wallet    },
    { key: 'employees',   label: 'Dossiers RH',         icon: FileText  },
    { key: 'messages',    label: 'Messages clients',    icon: MessageCircle },
    { key: 'backups',     label: 'Sauvegardes',         icon: ShieldCheck },
  ]
  const availableTabs = TAB_MAP.filter(t => t.key === 'messages' || hasPermission(t.key))

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) setProfile(snap.data())
      },
      err => console.warn('DirectorPage user profile listener error:', err.code)
    )
    setLoading(true)
    const unsubParcels = subscribeAllParcels((data: any) => { setParcels(data); setLoading(false) })
    const unsubUsers   = subscribeAllUsers(setUsers)
    const unsubCaisse   = subscribeAllCaisse(setCaisseEntries)
    const unsubClotures = subscribeAllCaisseClotures(setCaisseClotures)
    const unsubRemarks  = subscribeAllCaissierRemarks(setAllRemarks)
    const unsubClientMessages = subscribeAllClientMessages(setClientMessages)
    return () => { unsubProfile(); unsubParcels(); unsubUsers(); unsubCaisse(); unsubClotures(); unsubRemarks(); unsubClientMessages() }
  }, [])

  useEffect(() => {
    clientMessages.slice(0, 20).forEach(m => {
      if (m.readByStaffAt || staffReadMarks.current.has(m.id)) return
      staffReadMarks.current.add(m.id)
      markClientMessageReadByStaff(m.id, profile?.name || auth.currentUser?.email || 'Directeur').catch(() => {
        staffReadMarks.current.delete(m.id)
      })
    })
  }, [clientMessages, profile?.name])

  const _log = (actionKey: any, details: any, meta = {}) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Directeur'
    if (uid) logDirectorAction(uid, name, actionKey, details, meta)
  }

  const handleReplyClientMessage = async (messageId: any) => {
    const text = (clientReplyDrafts[messageId] || '').trim()
    if (!text) return
    await addClientMessageReply(messageId, {
      message: text,
      authorName: profile?.name || auth.currentUser?.email || 'Directeur',
      authorEmail: auth.currentUser?.email || '',
      authorRole: 'directeur',
    })
    setClientReplyDrafts((d: any) => ({ ...d, [messageId]: '' }))
    _log('client_reply', 'Reponse envoyee a un client', { messageId })
  }

  const handleDeleteClientMessage = async (messageId: any) => {
    if (!window.confirm('Supprimer definitivement cette conversation client ?')) return
    await deleteClientMessage(messageId)
    _log('client_message_delete', 'Conversation client supprimee', { messageId })
  }

  // ---- Status update
  const downloadJson = (name: any, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportBackup = async () => {
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const backup = await exportSiteBackup()
      const totalDocs = (Object.values(backup.counts || {}) as any[]).reduce((s: any, n: any) => s + n, 0)
      downloadJson('bg-express-sauvegarde-directeur', backup)
      setBackupMessage({ type: 'success', text: `Sauvegarde exportee : ${totalDocs} document(s).` })
      _log('backup_export', `Sauvegarde exportee : ${totalDocs} document(s)`, {
        totalDocs,
        exportedAt: backup.exportedAt,
      })
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message || "Erreur pendant l'export de la sauvegarde." })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleStatusUpdate = async () => {
    if (!statusModal) return
    setStatusModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const p = statusModal.parcel
      await updateParcelStatus(p.id, statusModal.status, statusModal.note ? { note: statusModal.note } : {})
      _log('status_update', `Statut mis à jour : ${p.trackingId}`, {
        trackingId:   p.trackingId,
        senderName:   p.sender?.name  || '—',
        receiverName: p.receiver?.name || '—',
        receiverCity: p.receiver?.city || '—',
        receiverTel:  p.receiver?.tel  || '—',
        oldStatus:    p.status,
        newStatus:    statusModal.status,
        price:        p.price    || 0,
        codAmount:    p.codAmount || 0,
        note:         statusModal.note || '',
      })
      setStatusModal(null)
    } catch {
      setStatusModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la mise à jour.' }))
    }
  }

  const handleRemitCod = async (parcel: any) => {
    await remitCod(parcel.id, profile?.name || 'Directeur')
    _log('cod_remit', `RETOUR FOND remis : ${parcel.trackingId}`, {
      trackingId:      parcel.trackingId,
      receiverName:    parcel.receiver?.name || '—',
      receiverCity:    parcel.receiver?.city || '—',
      codAmount:       parcel.codAmount || 0,
      codPaymentType:  parcel.codPaymentType || '—',
      codStatus:       parcel.codStatus || '—',
    })
  }

  const handleSaveUser = async () => {
    if (!userEdit) return
    const { id, ...data } = userEdit
    const original = users.find(u => u.id === id)
    await updateUser(id, {
      name: data.name, role: data.role, city: data.city, code: data.code, tel: data.tel || '',
      cin: data.cin || '', cnss: data.cnss || '', assurance: data.assurance || '',
      dateEmbauche: data.dateEmbauche || '', dateSortie: data.dateSortie || '',
      dateNaissance: data.dateNaissance || '', salaire: data.salaire || '',
      adresse: data.adresse || '', situationFamiliale: data.situationFamiliale || '',
      contactUrgence: data.contactUrgence || '', noteRH: data.noteRH || '',
    } as any)
    const changes: any[] = []
    if (original?.name  !== data.name)  changes.push({ field: 'Nom',    before: original?.name  || '—', after: data.name  })
    if (original?.role  !== data.role)  changes.push({ field: 'Rôle',   before: original?.role  || '—', after: data.role  })
    if (original?.city  !== data.city)  changes.push({ field: 'Ville',  before: original?.city  || '—', after: data.city  })
    if (original?.tel   !== data.tel)   changes.push({ field: 'Tél',    before: original?.tel   || '—', after: data.tel   })
    if (original?.code  !== data.code)  changes.push({ field: 'Code',   before: original?.code  || '—', after: data.code  })
    _log('user_edit', `Utilisateur modifié : ${data.name}`, {
      userId:   id,
      name:     data.name,
      role:     data.role,
      city:     data.city,
      tel:      data.tel  || '—',
      code:     data.code || '—',
      changes,
    })
    setUserEdit(null)
  }

  // ---- Computed — Expéditions
  const filtered = useMemo(() => {
    const byDate = filterByDate(parcels, datePreset, dateFrom, dateTo)
    return byDate.filter((p: any) => {
      const cityOk   = cityFilter   === 'Toutes' || p.receiver?.city === cityFilter || p.sender?.city === cityFilter
      const statusOk = statusFilter === 'Tous'   || p.status === statusFilter
      const searchOk = !search || [p.trackingId, p.sender?.name, p.receiver?.name, p.receiver?.tel]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()))
      return cityOk && statusOk && searchOk
    })
  }, [parcels, cityFilter, statusFilter, search, datePreset, dateFrom, dateTo])

  // ---- Computed — RETOUR FOND
  const codParcels    = useMemo(() => parcels.filter(p => p.codAmount > 0), [parcels])

  const codDateFiltered = useMemo(() =>
    filterByDate(codParcels, codDatePreset, codDateFrom, codDateTo),
    [codParcels, codDatePreset, codDateFrom, codDateTo])

  const filteredCod   = useMemo(() => {
    let list = codDateFiltered
    if (codFilter !== 'all') list = list.filter((p: any) => (p.codStatus || 'pending') === codFilter)
    if (codSearch) {
      const q = codSearch.toLowerCase()
      list = list.filter((p: any) =>
        p.trackingId?.toLowerCase().includes(q) ||
        p.receiver?.name?.toLowerCase().includes(q) ||
        p.receiver?.city?.toLowerCase().includes(q)
      )
    }
    return list
  }, [codDateFiltered, codFilter, codSearch])

  const codStats = useMemo(() => ({
    pendingDH:   codParcels.filter(p => !p.codStatus || p.codStatus === 'pending').reduce((s,p) => s+(p.codAmount||0), 0),
    collectedDH: codParcels.filter(p => p.codStatus === 'collected').reduce((s,p) => s+(p.codAmount||0), 0),
    remisDH:     codParcels.filter(p => p.codStatus === 'remis').reduce((s,p) => s+(p.codAmount||0), 0),
    byType: COD_PAYMENT_TYPES.map(pt => ({
      ...pt,
      total: codParcels.filter(p => p.codPaymentType === pt.key).reduce((s,p) => s+(p.codAmount||0), 0),
      count: codParcels.filter(p => p.codPaymentType === pt.key).length,
    })).filter(pt => pt.total > 0),
  }), [codParcels])

  const codStatsFiltered = useMemo(() => ({
    pendingDH:   codDateFiltered.filter((p: any) => !p.codStatus || p.codStatus === 'pending').reduce((s: any,p: any) => s+(p.codAmount||0), 0),
    collectedDH: codDateFiltered.filter((p: any) => p.codStatus === 'collected').reduce((s: any,p: any) => s+(p.codAmount||0), 0),
    remisDH:     codDateFiltered.filter((p: any) => p.codStatus === 'remis').reduce((s: any,p: any) => s+(p.codAmount||0), 0),
    byType: COD_PAYMENT_TYPES.map(pt => ({
      ...pt,
      total: codDateFiltered.filter((p: any) => p.codPaymentType === pt.key).reduce((s: any,p: any) => s+(p.codAmount||0), 0),
      count: codDateFiltered.filter((p: any) => p.codPaymentType === pt.key).length,
    })).filter(pt => pt.total > 0),
  }), [codDateFiltered])

  // ---- Computed — KPIs
  const kpis = useMemo(() => ({
    total:   parcels.length,
    enCours: parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length,
    livres:  parcels.filter(p => p.status === 'Livré').length,
    cod:     parcels.filter(p => p.codAmount > 0 && (!p.codStatus || p.codStatus === 'pending'))
               .reduce((s,p) => s+(p.codAmount||0), 0),
  }), [parcels])

  // ---- Computed — Users (sans admin ni directeur)
  const nonAdminUsers = useMemo(() => users.filter(u => u.role !== 'admin' && u.role !== 'directeur'), [users])
  const filteredUsers = useMemo(() => {
    const now = new Date()
    let uStart: any = null, uEnd: any = now
    if      (usersDatePreset === 'today')  { uStart = new Date(); uStart.setHours(0,0,0,0) }
    else if (usersDatePreset === 'week')   { uStart = new Date(); uStart.setDate(now.getDate()-6); uStart.setHours(0,0,0,0) }
    else if (usersDatePreset === 'month')  { uStart = new Date(now.getFullYear(), now.getMonth(), 1) }
    else if (usersDatePreset === 'custom') { uStart = usersDateFrom ? new Date(usersDateFrom) : null; uEnd = usersDateTo ? new Date(usersDateTo+'T23:59:59') : now }
    return nonAdminUsers.filter(u => {
      const roleOk   = roleFilter === 'Tous' || u.role === roleFilter
      const searchOk = !userSearch || [u.name, u.email, u.city, u.code, u.cin, u.cnss, u.tel]
        .some(v => v?.toLowerCase().includes(userSearch.toLowerCase()))
      let dateOk = true
      if (usersDatePreset !== 'all') {
        const d = u.createdAt ? new Date(u.createdAt) : new Date(0)
        if (uStart && d < uStart) dateOk = false
        if (uEnd   && d > uEnd)   dateOk = false
      }
      return roleOk && searchOk && dateOk
    })
  }, [nonAdminUsers, roleFilter, userSearch, usersDatePreset, usersDateFrom, usersDateTo])

  // ---- Computed — Activité
  const activityStats = useMemo(() => {
    const filteredP = filterByDate(parcels, activityDatePreset, activityDateFrom, activityDateTo)
    const filteredCaisse = filterByDate(caisseEntries, activityDatePreset, activityDateFrom, activityDateTo, caisseEntryDate)
    return nonAdminUsers
      .filter(u => u.role === 'agent' || u.role === 'chauffeur' || u.role === 'caissier')
      .filter(u => activityRoleFilter === 'all' || u.role === activityRoleFilter)
      .map(u => {
        if (u.role === 'agent') {
          const created = filteredP.filter((p: any) => p.agentId === u.id)
          const claimed = filteredP.filter((p: any) => p.destinationAgentId === u.id)
          const all = [...new Map([...created, ...claimed].map(p => [p.id, p])).values()]
          return {
            user: u, created, claimed,
            livres:       created.filter((p: any) => p.status === 'Livré').length,
            retournes:    created.filter((p: any) => p.status === 'Retourné').length,
            enCours:      created.filter((p: any) => !['Livré','Retourné'].includes(p.status)).length,
            totalRevenue: created.reduce((s: any, p: any) => s + (p.price || 0), 0),
            codTotal:     created.reduce((s: any, p: any) => s + (p.codAmount || 0), 0),
            lastActivity: all.length ? Math.max(...all.map(p => parcelDate(p).getTime())) : null,
          }
        } else if (u.role === 'chauffeur') {
          const transports = filteredP.filter((p: any) => p.chauffeurId === u.id)
          const deliveries = filteredP.filter((p: any) => p.deliveryDriverId === u.id)
          const all = [...new Map([...transports, ...deliveries].map(p => [p.id, p])).values()]
          return {
            user: u, transports, deliveries,
            activeTransports: transports.filter((p: any) => !['Livré','Retourné','Arrivé en agence'].includes(p.status)).length,
            activeDeliveries: deliveries.filter((p: any) => p.status === 'En cours de livraison').length,
            codCollected: deliveries.filter((p: any) => ['collected','remis'].includes(p.codStatus)).reduce((s: any,p: any) => s+(p.codAmount||0), 0),
            lastActivity: all.length ? Math.max(...all.map(p => parcelDate(p).getTime())) : null,
          }
        } else {
          const entries = filteredCaisse.filter((e: any) => e.cashierId === u.id || (!e.cashierId && e.cashierName === u.name))
          const entrees = entries.filter((e: any) => e.type === 'entree')
          const sorties = entries.filter((e: any) => e.type === 'sortie')
          return {
            user: u,
            entries,
            entrees,
            sorties,
            totalEntrees: entrees.reduce((s: any, e: any) => s + (parseFloat(e.amount || 0) || 0), 0),
            totalSorties: sorties.reduce((s: any, e: any) => s + (parseFloat(e.amount || 0) || 0), 0),
            charges: sorties.filter((e: any) => !['remise_caissier', 'restitution_agent', 'cod_regle_expediteur', 'cod_sortie_source'].includes(e.category)),
            depotsAgents: entrees.filter((e: any) => e.category === 'depot_agent' || e.category === 'remise_caissier'),
            lastActivity: entries.length ? Math.max(...entries.map((e: any) => caisseEntryDate(e).getTime())) : null,
          }
        }
      })
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
  }, [parcels, caisseEntries, nonAdminUsers, activityRoleFilter, activityDatePreset, activityDateFrom, activityDateTo])

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
  const inputCls  = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 focus:outline-none w-full transition"

  if (!profile) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyContact />

      {/* ------ HEADER ------ */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Interface Directeur</span>
              </div>
              {profile?.name && (
                <span className="text-gray-400 text-sm hidden md:inline">— {profile.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Temps réel
              </span>
              <button onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition">
                <LogOut className="w-4 h-4" /> Déconnexion
              </button>
              <button onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition">
                {menuOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
              </button>
            </div>
          </div>

          {/* Breadcrumb quand on est dans une section */}
          {mainTab !== 'home' && (
            <div className="hidden md:flex border-t border-gray-50 items-center gap-2 py-2.5 px-1">
              <button onClick={() => setMainTab('home')}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-purple-600 transition font-medium">
                <ChevronDown className="w-4 h-4 rotate-90" /> Accueil
              </button>
              <span className="text-gray-200 font-light">/</span>
              <span className="text-sm font-bold text-purple-600">
                {availableTabs.find(t => t.key === mainTab)?.label || mainTab}
              </span>
            </div>
          )}

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 space-y-1">
              <button onClick={() => { setMainTab('home'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                🏠 <span>Accueil</span>
              </button>
              {availableTabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setMainTab(key); setMenuOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition ${
                    mainTab === key ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{label}</span>
                  {key === 'cod' && codStats.collectedDH > 0 && (
                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">{fmt(codStats.collectedDH)} DH</span>
                  )}
                </button>
              ))}
              {hasPermission('clients') && (
                <button onClick={() => { _log('page_clients', 'Accès à la page Clients', { page: 'Clients' }); navigate('/clients'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                  <Contact className="w-5 h-5" /> Clients
                </button>
              )}
              {hasPermission('fleet') && (
                <button onClick={() => { _log('page_fleet', 'Accès à la page Parc véhicules', { page: 'Parc véhicules' }); navigate('/fleet'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                  <Car className="w-5 h-5" /> Parc véhicules
                </button>
              )}
              <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Temps réel
                </span>
                <button onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ------ AUCUNE PERMISSION ------ */}
      {permissions.length === 0 && (
        <div className="max-w-md mx-auto mt-16 text-center px-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10">
            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🔒</div>
            <h2 className="font-bold text-gray-800 text-xl mb-2">Aucune permission accordée</h2>
            <p className="text-gray-500 text-sm">Contactez l'administrateur pour que des modules vous soient attribués.</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-4 pb-16">

        {/* ══ ACCUEIL ══ */}
        {mainTab === 'home' && permissions.length > 0 && (() => {
          const TAB_META = {
            expeditions: { grad: 'from-blue-500 via-blue-600 to-indigo-700',    desc: 'Voir et modifier tous les colis',     stat: `${kpis.enCours} en cours · ${kpis.livres} livrés` },
            cod:         { grad: 'from-orange-400 via-orange-500 to-amber-600', desc: 'Gérer les remboursements RETOUR FOND',         stat: `${fmt(codStats.pendingDH)} DH en attente`,           badge: codStats.collectedDH > 0 ? `${fmt(codStats.collectedDH)} DH` : null },
            users:       { grad: 'from-indigo-500 via-indigo-600 to-blue-700',  desc: 'Gérer agents, chauffeurs, caissiers et salariés', stat: `${nonAdminUsers.length} membres` },
            activity:    { grad: 'from-purple-500 via-purple-600 to-violet-700', desc: "Suivi d'activité de l'équipe",        stat: `${nonAdminUsers.filter(u=>u.role==='agent').length} agents · ${nonAdminUsers.filter(u=>u.role==='chauffeur').length} chauffeurs · ${nonAdminUsers.filter(u=>u.role==='caissier').length} caissiers` },
            caisse:      { grad: 'from-teal-500 via-teal-600 to-cyan-700',      desc: 'Mouvements · Charges · Personnel',    stat: `${caisseEntries.length} mouvement(s)` },
            employees:   { grad: 'from-rose-500 via-pink-600 to-fuchsia-700',  desc: 'CIN · CNSS · Contrats · Salaires',    stat: `${nonAdminUsers.length} employé(s)` },
            backups:     { grad: 'from-sky-500 via-blue-600 to-indigo-700',     desc: 'Exporter une sauvegarde complète',      stat: `${BACKUP_COLLECTIONS.length} collections` },
          }
          const clientsMeta = { grad: 'from-emerald-500 via-green-600 to-green-700', desc: 'Gestion de la clientèle', stat: 'Comptes · Paiements · Remises' }
          const fleetMeta   = { grad: 'from-slate-500 via-gray-600 to-zinc-700',     desc: 'Gestion du parc automobile', stat: 'Camions · Fourgons · Voitures' }

          return (
            <div className="mt-6 space-y-6">
              {/* Bandeau de bienvenue */}
              <div className="bg-gradient-to-r from-purple-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 90% 10%, white 0%, transparent 45%)' }} />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-sm font-medium">Bienvenue</p>
                    <h1 className="font-black text-3xl mt-0.5">{profile?.name || 'Directeur'} 👔</h1>
                    {profile?.city && <p className="text-purple-200 text-sm mt-1">📍 Agence de {profile.city}</p>}
                  </div>
                  <div className="hidden sm:grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total',    value: fmt(kpis.total),   color: 'text-white'       },
                      { label: 'En cours', value: fmt(kpis.enCours), color: 'text-orange-300'  },
                      { label: 'Livrés',   value: fmt(kpis.livres),  color: 'text-green-300'   },
                    ].map(s => (
                      <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 text-center">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-purple-200 text-xs font-medium mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cartes des modules */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableTabs.map(({ key, label, icon: Icon }) => {
                  const meta = (TAB_META as any)[key] || {}
                  return (
                    <button key={key} onClick={() => setMainTab(key)}
                      className="group relative overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97] text-left"
                      style={{ minHeight: 170 }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${meta.grad}`} />
                      <div className="absolute inset-0 opacity-20"
                        style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 55%)' }} />
                      <div className="relative p-6 flex flex-col justify-between h-full">
                        <div className="flex items-start justify-between">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          {meta.badge && (
                            <span className="bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">{meta.badge}</span>
                          )}
                        </div>
                        <div className="mt-4">
                          <p className="text-white font-black text-lg leading-tight">{label}</p>
                          <p className="text-white/70 text-xs mt-0.5">{meta.desc}</p>
                          <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                            {meta.stat}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {hasPermission('clients') && (
                  <button onClick={() => { _log('page_clients', 'Accès à la page Clients', { page: 'Clients' }); navigate('/clients') }}
                    className="group relative overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97] text-left"
                    style={{ minHeight: 170 }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${clientsMeta.grad}`} />
                    <div className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 55%)' }} />
                    <div className="relative p-6 flex flex-col justify-between h-full">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                        <Contact className="w-6 h-6 text-white" />
                      </div>
                      <div className="mt-4">
                        <p className="text-white font-black text-lg">Clients</p>
                        <p className="text-white/70 text-xs mt-0.5">{clientsMeta.desc}</p>
                        <div className="mt-3 inline-flex items-center bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">{clientsMeta.stat}</div>
                      </div>
                    </div>
                  </button>
                )}
                {hasPermission('fleet') && (
                  <button onClick={() => { _log('page_fleet', 'Accès à la page Parc véhicules', { page: 'Parc véhicules' }); navigate('/fleet') }}
                    className="group relative overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97] text-left"
                    style={{ minHeight: 170 }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${fleetMeta.grad}`} />
                    <div className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 55%)' }} />
                    <div className="relative p-6 flex flex-col justify-between h-full">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                        <Car className="w-6 h-6 text-white" />
                      </div>
                      <div className="mt-4">
                        <p className="text-white font-black text-lg">Parc véhicules</p>
                        <p className="text-white/70 text-xs mt-0.5">{fleetMeta.desc}</p>
                        <div className="mt-3 inline-flex items-center bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">{fleetMeta.stat}</div>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* ══ SAUVEGARDES ══ */}
        {mainTab === 'backups' && hasPermission('backups') && (
          <div className="mt-4 space-y-4">
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1">
                  <h2 className="font-black text-gray-800 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" /> Sauvegarde complète des données
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Export JSON complet de Firestore. La restauration reste reservee a l'Admin.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BACKUP_COLLECTIONS.map(name => (
                      <span key={name} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-lg font-semibold">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={handleExportBackup} disabled={backupBusy}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-3 rounded-xl transition">
                  <Download className="w-4 h-4" /> Exporter JSON
                </button>
              </div>
              {backupMessage && (
                <div className={`mt-4 text-sm font-semibold px-4 py-3 rounded-xl ${
                  backupMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {backupMessage.text}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ EXPÉDITIONS ══ */}
        {mainTab === 'messages' && (
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-black text-gray-800 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-600" /> Chat clients
                </h2>
                <p className="text-xs text-gray-400">Messages envoyes depuis les portails clients</p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-1 font-bold">
                {clientMessages.filter(m => m.status !== 'resolved').length} ouvert(s)
              </span>
            </div>
            {clientMessages.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">Aucun message client.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {clientMessages.slice(0, 20).map(m => (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.status === 'resolved' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800">
                          {m.clientName || 'Client'}
                          {m.trackingId && <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg ml-2">{m.trackingId}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{m.type || 'message'} - {m.clientEmail || '-'}</p>
                        <p className="text-sm text-gray-600 mt-2">{m.message}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span>{m.deliveredToStaffAt ? 'Recu instantanement' : 'En attente reception'}</span>
                          {m.readByStaffAt && <span className="text-blue-600 font-semibold">Lu par {m.readByStaffBy || 'Directeur'}</span>}
                          {m.lastReplyAt && (
                            <span className={m.readByClientAt ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>
                              {m.readByClientAt ? 'Lu par client' : 'Envoye au client'}
                            </span>
                          )}
                        </div>
                        {Array.isArray(m.replies) && m.replies.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {m.replies.map((r: any, idx: any) => (
                              <div key={idx} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                                <p className="text-xs font-bold text-blue-700">{r.authorName || r.authorRole || 'Equipe'}</p>
                                <p className="text-sm text-gray-700 mt-1">{r.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {m.status !== 'resolved' && (
                          <button onClick={() => resolveClientMessage(m.id, profile?.name || auth.currentUser?.email || 'Directeur')}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl font-semibold transition">
                            Marquer traite
                          </button>
                        )}
                        <button onClick={() => handleDeleteClientMessage(m.id)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl font-semibold transition inline-flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                      </div>
                    </div>
                    <div className="md:ml-13 flex flex-col sm:flex-row gap-2">
                      <input
                        value={clientReplyDrafts[m.id] || ''}
                        onChange={e => setClientReplyDrafts((d: any) => ({ ...d, [m.id]: e.target.value }))}
                        placeholder="Repondre au client..."
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleReplyClientMessage(m.id)}
                        disabled={!clientReplyDrafts[m.id]?.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-bold"
                      >
                        Repondre
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mainTab === 'expeditions' && hasPermission('expeditions') && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-2">
              {[
                { label: 'Total colis',    value: kpis.total,              icon: Package,     light: 'bg-blue-50 text-blue-600'    },
                { label: 'En cours',       value: kpis.enCours,            icon: Clock,       light: 'bg-orange-50 text-orange-600' },
                { label: 'Livrés',         value: kpis.livres,             icon: CheckCircle, light: 'bg-green-50 text-green-600'  },
                { label: 'RETOUR FOND en attente', value: `${fmt(kpis.cod)} DH`,   icon: Banknote,    light: 'bg-purple-50 text-purple-600' },
              ].map(({ label, value, icon: Icon, light }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${light.split(' ')[0]} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${light.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <p className="text-xl font-bold text-gray-800">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-purple-500 focus:outline-none flex-1 min-w-36"
                />
                <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className={selectCls}>
                  <option value="Toutes">Toutes les villes</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
                  <option value="Tous">Tous les statuts</option>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 items-center border-t border-gray-100 pt-3">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {[
                  { key: 'all', label: 'Tout' }, { key: 'today', label: "Aujourd'hui" },
                  { key: 'week', label: '7 jours' }, { key: 'month', label: 'Ce mois' },
                  { key: 'custom', label: 'Personnalisé' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      datePreset === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >{label}</button>
                ))}
                {datePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                  </div>
                )}
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1">{filtered.length} résultat(s)</span>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-215">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Tracking ID','Date','Expéditeur','Destinataire','Ville','Poids','RETOUR FOND','Statut RETOUR FOND','Statut','Suivi'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">📭 Aucun colis trouvé</td></tr>
                      ) : filtered.map((p: any) => {
                        const c   = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
                        const cs  = p.codAmount > 0 ? (COD_STATUS[p.codStatus || 'pending']) : null
                        const cpt = p.codPaymentType ? COD_PAYMENT_TYPES.find(t => t.key === p.codPaymentType) : null
                        const date = p.createdAt?.toDate?.()
                          ? p.createdAt.toDate().toLocaleDateString('fr-MA')
                          : p.history?.[0]?.timestamp
                            ? new Date(p.history[0].timestamp).toLocaleDateString('fr-MA') : '—'
                        return (
                          <tr key={p.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3"><span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span></td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{date}</td>
                            <td className="px-4 py-3"><p className="font-medium text-gray-800">{p.sender?.name}</p><p className="text-xs text-gray-400">{p.sender?.tel}</p></td>
                            <td className="px-4 py-3"><p className="font-medium text-gray-800">{p.receiver?.name}</p><p className="text-xs text-gray-400">{p.receiver?.tel}</p></td>
                            <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">{p.receiver?.city}</td>
                            <td className="px-4 py-3 text-gray-600">{p.weight} kg</td>
                            <td className="px-4 py-3">{p.codAmount > 0 ? <span className="text-orange-600 font-bold">{p.codAmount} DH</span> : <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3">
                              {cs ? (
                                <div>
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${p.codStatus === 'collected' && cpt ? cpt.bg+' '+cpt.text : cs.bg+' '+cs.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                                    {p.codStatus === 'collected'
                                      ? <>{cpt?.emoji} {codCollectedLabel(p.codPaymentType)}</>
                                      : cs.label
                                    }
                                  </span>
                                  {p.codStatus !== 'collected' && cpt && <p className="text-[10px] text-gray-400 mt-0.5">{cpt.emoji} {cpt.label}</p>}
                                </div>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setStatusModal({ parcel: p, status: p.status, note: '', loading: false, error: '' })}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} hover:opacity-80 transition cursor-pointer`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{p.status}
                                <Edit2 className="w-3 h-3 ml-0.5 opacity-60" />
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <a href={`/track?id=${p.trackingId}`} target="_blank" rel="noreferrer" className="text-purple-500 hover:text-purple-700 transition">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                    <span>{filtered.length} colis affichés</span>
                    <span>RETOUR FOND filtré : <b className="text-orange-600">{fmt(filtered.reduce((s: any,p: any) => s+(p.codAmount||0),0))} DH</b></span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ RETOUR FOND ══ */}
        {mainTab === 'cod' && hasPermission('cod') && (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'En attente',   value: fmt(codStats.pendingDH),   sub: `${codParcels.filter(p=>!p.codStatus||p.codStatus==='pending').length} colis`,   bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', emoji: '⏳' },
                { label: 'Collecté',     value: fmt(codStats.collectedDH), sub: `${codParcels.filter(p=>p.codStatus==='collected').length} colis`,                bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   emoji: '💰' },
                { label: 'Remis agence', value: fmt(codStats.remisDH),     sub: `${codParcels.filter(p=>p.codStatus==='remis').length} colis`,                   bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  emoji: '✅' },
              ].map(({ label, value, sub, bg, text, border, emoji }) => (
                <div key={label} className={`${bg} border ${border} rounded-2xl p-5`}>
                  <p className={`text-sm font-semibold ${text} mb-1`}>{emoji} {label}</p>
                  <p className={`text-3xl font-black ${text}`}>{value} <span className="text-lg">DH</span></p>
                  <p className={`text-xs ${text} opacity-70 mt-1`}>{sub}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input value={codSearch} onChange={e => setCodSearch(e.target.value)} placeholder="Rechercher..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  {[
                    { key: 'all', label: 'Tous' }, { key: 'pending', label: '⏳ En attente' },
                    { key: 'collected', label: '💰 Collecté' }, { key: 'remis', label: '✅ Remis' },
                  ].map(({ key, label }) => (
                    <button key={key} onClick={() => setCodFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${codFilter === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-205">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Tracking','Destinataire','Ville','Montant RETOUR FOND','Mode','Statut RETOUR FOND','Collecté par','Date','Action'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredCod.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">💳 Aucun remboursement trouvé</td></tr>
                    ) : filteredCod.map((p: any) => {
                      const cs  = COD_STATUS[p.codStatus || 'pending']
                      const cpt = COD_PAYMENT_TYPES.find(t => t.key === p.codPaymentType)
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3"><span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span></td>
                          <td className="px-4 py-3"><p className="font-medium text-gray-800">{p.receiver?.name}</p><p className="text-xs text-gray-400">{p.receiver?.tel}</p></td>
                          <td className="px-4 py-3 font-semibold text-gray-700">{p.receiver?.city}</td>
                          <td className="px-4 py-3"><span className="text-orange-600 font-bold text-base">{p.codAmount} DH</span></td>
                          <td className="px-4 py-3">{cpt ? <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cpt.bg} ${cpt.text}`}>{cpt.emoji} {cpt.label}</span> : <span className="text-gray-300 text-xs">—</span>}</td>
                          <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cs.bg} ${cs.text}`}><span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />{cs.label}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-600">{p.codCollectedBy || '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{p.codCollectedAt ? new Date(p.codCollectedAt).toLocaleDateString('fr-MA') : '—'}</td>
                          <td className="px-4 py-3">
                            {p.codStatus === 'collected' && (
                              <button onClick={() => handleRemitCod(p)}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" /> Marquer remis
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ UTILISATEURS ══ */}
        {mainTab === 'users' && hasPermission('users') && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Rechercher un utilisateur..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:outline-none bg-white" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setRoleFilter('Tous')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === 'Tous' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                >Tous</button>
                {EDIT_ROLES.map(r => (
                  <button key={r.key} onClick={() => setRoleFilter(r.key)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === r.key ? `${r.badge} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  >{r.emoji} {r.label}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-150">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Nom','Téléphone','Email','Rôle','Ville','Code','Créé le','Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">👤 Aucun utilisateur trouvé</td></tr>
                    ) : filteredUsers.map(u => {
                      const rMeta = EDIT_ROLES.find(r => r.key === u.role)
                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-800">{u.name || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{u.tel || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${rMeta?.badge || 'bg-gray-100 text-gray-600'}`}>
                              {rMeta ? `${rMeta.emoji} ${rMeta.label}` : (u.role || '—')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{u.city || '—'}</td>
                          <td className="px-4 py-3">{u.code ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">{u.code}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-MA') : '—'}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => { setUserEditTab('access'); setUserEdit({ id: u.id, name: u.name||'', role: u.role||'agent', city: u.city||'', code: u.code||'', tel: u.tel||'', cin: u.cin||'', cnss: u.cnss||'', assurance: u.assurance||'', dateEmbauche: u.dateEmbauche||'', dateSortie: u.dateSortie||'', dateNaissance: u.dateNaissance||'', salaire: u.salaire||'', adresse: u.adresse||'', situationFamiliale: u.situationFamiliale||'', contactUrgence: u.contactUrgence||'', noteRH: u.noteRH||'' }) }}
                              className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg transition font-medium">
                              <Edit2 className="w-3 h-3" /> Modifier
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 text-xs text-gray-500">
                {filteredUsers.length} personne(s) · {nonAdminUsers.filter(u=>u.role==='agent').length} agents · {nonAdminUsers.filter(u=>u.role==='chauffeur').length} chauffeurs · {nonAdminUsers.filter(u=>u.role==='caissier').length} caissiers · {nonAdminUsers.filter(u=>u.role==='salarie').length} salariés
              </div>
            </div>
          </div>
        )}

        {/* ══ ACTIVITÉ ══ */}
        {mainTab === 'activity' && hasPermission('activity') && (
          <div className="mt-4 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
              <div className="flex gap-1.5">
                {[
                  { key: 'all', label: 'Tous', emoji: '👥' },
                  { key: 'agent', label: 'Agents', emoji: '🧑‍💼' },
                  { key: 'chauffeur', label: 'Chauffeurs', emoji: '🚚' },
                  { key: 'caissier', label: 'Caissiers', emoji: '🏦' },
                ].map(({ key, label, emoji }) => (
                  <button key={key} onClick={() => setActivityRoleFilter(key)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${activityRoleFilter === key ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  >{emoji} {label}</button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {[
                  { key: 'all', label: 'Tout' }, { key: 'today', label: "Auj." },
                  { key: 'week', label: '7 jours' }, { key: 'month', label: 'Ce mois' },
                  { key: 'custom', label: 'Perso' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setActivityDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activityDatePreset === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{label}</button>
                ))}
                {activityDatePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={activityDateFrom} onChange={e => setActivityDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={activityDateTo} onChange={e => setActivityDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                  </div>
                )}
              </div>
            </div>

            {activityStats.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">👥 Aucune activité pour cette période</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activityStats.map(stat => {
                  const isAgent    = stat.user.role === 'agent'
                  const isCashier  = stat.user.role === 'caissier'
                  const totalCount = isAgent ? stat.created.length : isCashier ? stat.entries.length : (stat.transports.length + stat.deliveries.length)
                  const lastDate   = stat.lastActivity ? new Date(stat.lastActivity).toLocaleDateString('fr-MA', { day:'2-digit', month:'short' }) : '—'
                  return (
                    <div key={stat.user.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
                      <div className={`px-5 py-4 flex items-center gap-3 ${isAgent ? 'bg-blue-50 border-b border-blue-100' : isCashier ? 'bg-teal-50 border-b border-teal-100' : 'bg-orange-50 border-b border-orange-100'}`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${isAgent ? 'bg-blue-100' : isCashier ? 'bg-teal-100' : 'bg-orange-100'}`}>{isAgent ? '🧑‍💼' : isCashier ? '🏦' : '🚚'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{stat.user.name || '—'}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAgent ? 'bg-blue-100 text-blue-700' : isCashier ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>{isAgent ? 'Agent' : isCashier ? 'Caissier' : 'Chauffeur'}</span>
                            {stat.user.city && <span className="text-xs text-gray-500 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{stat.user.city}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-2xl font-black ${isAgent ? 'text-blue-600' : isCashier ? 'text-teal-600' : 'text-orange-600'}`}>{totalCount}</p>
                          <p className="text-xs text-gray-400">{isAgent ? 'créés' : isCashier ? 'mouvements' : 'total'}</p>
                        </div>
                      </div>
                      <div className="px-5 py-4 space-y-3">
                        {isAgent ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-xl py-2"><p className="text-lg font-bold text-green-600">{stat.livres}</p><p className="text-xs text-green-700">Livrés</p></div>
                              <div className="bg-orange-50 rounded-xl py-2"><p className="text-lg font-bold text-orange-500">{stat.enCours}</p><p className="text-xs text-orange-600">En cours</p></div>
                              <div className="bg-gray-50 rounded-xl py-2"><p className="text-lg font-bold text-gray-500">{stat.retournes}</p><p className="text-xs text-gray-500">Retournés</p></div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div><p className="text-xs text-gray-400">Récupérés dest.</p><p className="text-sm font-bold text-gray-700">{stat.claimed.length} colis</p></div>
                              <div className="text-right"><p className="text-xs text-gray-400">Frais totaux</p><p className="text-sm font-bold text-blue-600">{fmt(stat.totalRevenue)} DH</p></div>
                            </div>
                          </>
                        ) : isCashier ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-xl py-2"><p className="text-lg font-bold text-green-600">{fmt(stat.totalEntrees)}</p><p className="text-xs text-green-700">Entrées</p></div>
                              <div className="bg-red-50 rounded-xl py-2"><p className="text-lg font-bold text-red-600">{fmt(stat.totalSorties)}</p><p className="text-xs text-red-700">Sorties</p></div>
                              <div className="bg-teal-50 rounded-xl py-2"><p className="text-lg font-bold text-teal-600">{fmt(stat.totalEntrees - stat.totalSorties)}</p><p className="text-xs text-teal-700">Solde</p></div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div><p className="text-xs text-gray-400">Dépôts agents</p><p className="text-sm font-bold text-gray-700">{stat.depotsAgents.length} mouvement(s)</p></div>
                              <div className="text-right"><p className="text-xs text-gray-400">Charges</p><p className="text-sm font-bold text-red-600">{stat.charges.length}</p></div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div className="bg-blue-50 rounded-xl py-2"><p className="text-lg font-bold text-blue-600">{stat.transports.length}</p><p className="text-xs text-blue-700">Transports</p></div>
                              <div className="bg-orange-50 rounded-xl py-2"><p className="text-lg font-bold text-orange-600">{stat.deliveries.length}</p><p className="text-xs text-orange-700">Livraisons</p></div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div><p className="text-xs text-gray-400">Actifs</p><p className="text-sm font-bold text-orange-500">{stat.activeTransports + stat.activeDeliveries}</p></div>
                              {stat.codCollected > 0 && <div className="text-right"><p className="text-xs text-gray-400">RETOUR FOND collecté</p><p className="text-sm font-bold text-green-600">{fmt(stat.codCollected)} DH</p></div>}
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                          <span>Dernière activité : {lastDate}</span>
                          {stat.user.code && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{stat.user.code}</span>}
                        </div>
                      </div>
                      <div className="px-5 pb-4">
                        <button onClick={() => { setUserActivityModal(stat); setUserDetailTab(isAgent ? 'created' : isCashier ? 'entries' : 'transport') }}
                          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 ${isAgent ? 'bg-blue-600 hover:bg-blue-700 text-white' : isCashier ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                          Voir l'activité <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ------ MODAL STATUT ------ */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800">Changer le statut</h3>
                <p className="text-xs font-mono text-purple-600 mt-0.5">{statusModal.parcel.trackingId}</p>
              </div>
              <button onClick={() => setStatusModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              {statusModal.error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {statusModal.error}</div>}
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map(s => {
                  const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                  const selected = statusModal.status === s
                  return (
                    <button key={s} onClick={() => setStatusModal((m: any) => ({ ...m, status: s }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition border ${selected ? `${sc.bg} ${sc.text} border-current ring-2 ring-offset-1 ring-current` : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                      <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />{s}
                    </button>
                  )
                })}
              </div>
              <input placeholder="Note (optionnel)" value={statusModal.note}
                onChange={e => setStatusModal((m: any) => ({ ...m, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none bg-gray-50 focus:bg-white transition"
              />
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setStatusModal(null)} className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">Annuler</button>
                <button onClick={handleStatusUpdate} disabled={statusModal.loading || statusModal.status === statusModal.parcel.status}
                  className="py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2">
                  {statusModal.loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mise à jour...</> : <><CheckCircle className="w-4 h-4" /> Confirmer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------ MODAL ÉDITION USER ------ */}
      {userEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">

            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">
                  {EDIT_ROLES.find(r => r.key === userEdit.role)?.emoji || '👤'}
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Fiche employé</h3>
                  <p className="text-xs text-gray-400">{userEdit.name}</p>
                </div>
              </div>
              <button onClick={() => setUserEdit(null)} className="p-2 hover:bg-gray-100 rounded-xl transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="flex bg-gray-100 mx-5 mt-4 rounded-xl p-1 gap-1 shrink-0">
              <button onClick={() => setUserEditTab('access')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userEditTab === 'access' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                🔑 Accès système
              </button>
              <button onClick={() => setUserEditTab('hr')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userEditTab === 'hr' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                📋 Dossier RH
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">

              {userEditTab === 'access' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Nom complet</label>
                      <input value={userEdit.name} onChange={e => setUserEdit((m: any) => ({ ...m, name: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Téléphone</label>
                      <input type="tel" value={userEdit.tel || ''} onChange={e => setUserEdit((m: any) => ({ ...m, tel: e.target.value }))} placeholder="06XXXXXXXX" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Code agent</label>
                      <input value={userEdit.code} onChange={e => setUserEdit((m: any) => ({ ...m, code: e.target.value }))} placeholder="Ex: A123" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Rôle</label>
                    <div className="grid grid-cols-3 gap-2">
                      {EDIT_ROLES.map(r => (
                        <button type="button" key={r.key} onClick={() => setUserEdit((m: any) => ({ ...m, role: r.key }))}
                          className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-xl border-2 text-sm font-semibold transition ${userEdit.role === r.key ? `${r.badge} border-current shadow-sm` : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                          <span>{r.emoji}</span>{r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Ville / Agence</label>
                    <div className="relative">
                      <select value={userEdit.city} onChange={e => setUserEdit((m: any) => ({ ...m, city: e.target.value }))} className={inputCls + ' appearance-none'}>
                        <option value="">— Sélectionner —</option>
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}

              {userEditTab === 'hr' && (
                <>
                  <p className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    Informations confidentielles — accès restreint.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">CIN</label>
                      <input value={userEdit.cin||''} onChange={e => setUserEdit((m: any) => ({ ...m, cin: e.target.value }))} placeholder="AB123456" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">N° CNSS</label>
                      <input value={userEdit.cnss||''} onChange={e => setUserEdit((m: any) => ({ ...m, cnss: e.target.value }))} placeholder="Numéro CNSS" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Assurance / Mutuelle</label>
                      <input value={userEdit.assurance||''} onChange={e => setUserEdit((m: any) => ({ ...m, assurance: e.target.value }))} placeholder="Nom / N° police" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de naissance</label>
                      <input type="date" value={userEdit.dateNaissance||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateNaissance: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date d'embauche</label>
                      <input type="date" value={userEdit.dateEmbauche||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateEmbauche: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de sortie</label>
                      <input type="date" value={userEdit.dateSortie||''} onChange={e => setUserEdit((m: any) => ({ ...m, dateSortie: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Salaire (DH/mois)</label>
                      <input type="number" min="0" value={userEdit.salaire||''} onChange={e => setUserEdit((m: any) => ({ ...m, salaire: e.target.value }))} placeholder="0.00" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Situation familiale</label>
                      <div className="relative">
                        <select value={userEdit.situationFamiliale||''} onChange={e => setUserEdit((m: any) => ({ ...m, situationFamiliale: e.target.value }))} className={inputCls + ' appearance-none'}>
                          <option value="">— Sélectionner —</option>
                          {['Célibataire','Marié(e)','Divorcé(e)','Veuf/Veuve'].map(s => <option key={s}>{s}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Adresse</label>
                      <input value={userEdit.adresse||''} onChange={e => setUserEdit((m: any) => ({ ...m, adresse: e.target.value }))} placeholder="Adresse complète" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Contact d'urgence</label>
                      <input value={userEdit.contactUrgence||''} onChange={e => setUserEdit((m: any) => ({ ...m, contactUrgence: e.target.value }))} placeholder="Nom — 06XXXXXXXX" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note RH</label>
                      <textarea rows={3} value={userEdit.noteRH||''} onChange={e => setUserEdit((m: any) => ({ ...m, noteRH: e.target.value }))} placeholder="Observations, historique disciplinaire…" className={inputCls + ' resize-none'} />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={() => setUserEdit(null)} className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">Annuler</button>
                <button onClick={handleSaveUser} className="py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ══════════════ TAB: CAISSE ══════════════ */}
        {mainTab === 'caisse' && hasPermission('caisse') && (() => {
          const caisseDateFn = (e: any) => e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
          const caisseDateFiltered = caisseEntries.filter(e => {
            if (datePreset === 'all') return true
            const now = new Date()
            let start: any = null, end: any = now
            if (datePreset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
            else if (datePreset === 'week')  { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
            else if (datePreset === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
            else if (datePreset === 'custom') { start = dateFrom ? new Date(dateFrom) : null; end = dateTo ? new Date(dateTo+'T23:59:59') : now }
            const d = caisseDateFn(e)
            if (start && d < start) return false
            if (end   && d > end)   return false
            return true
          })
          const caisseFull = caisseDateFiltered
            .filter(e => caisseCityFilter === 'Toutes' || e.city === caisseCityFilter)
            .filter(e => caisseTypeFilter === 'all' || e.type === caisseTypeFilter)
          const totalEntrees = caisseFull.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
          const totalSorties = caisseFull.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
          const solde = totalEntrees - totalSorties
          const cities = [...new Set(caisseEntries.map(e => e.city).filter(Boolean))].sort()
          const catBreakdown = CAISSE_CATEGORIES.map(cat => ({
            ...cat,
            total: caisseFull.filter(e => e.category === cat.key).reduce((s, e) => s + (e.amount || 0), 0),
            count: caisseFull.filter(e => e.category === cat.key).length,
          })).filter(c => c.total > 0)

          const lastClotureForCity = (city: any) => caisseClotures
            .filter(c => c.city === city)
            .sort((a, b) => {
              const da  = a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt || 0)
              const db2 = b.closedAt?.toDate ? b.closedAt.toDate() : new Date(b.closedAt || 0)
              return db2 - da
            })[0] || null

          const allEntrees    = caisseDateFiltered.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
          const allSorties    = caisseDateFiltered.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
          const allSolde      = allEntrees - allSorties
          const citySummaries = cities.map(agCity => {
            const cityEs = caisseDateFiltered.filter(e => e.city === agCity)
            const ent    = cityEs.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
            const sor    = cityEs.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
            return { city: agCity, entrees: ent, sorties: sor, solde: ent - sor, count: cityEs.length, lastCloture: lastClotureForCity(agCity) }
          })

          const handleCloture = async () => {
            if (!clotureModal.city) { setClotureError('Sélectionnez une ville.'); return }
            setClotureLoading(true); setClotureError('')
            try {
              const last = lastClotureForCity(clotureModal.city)
              const periodFrom = last?.periodTo || null
              const toClose = caisseEntries
                .filter(e => e.city === clotureModal.city)
                .filter(e => {
                  if (!periodFrom) return true
                  const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                  return d > new Date(periodFrom)
                })
              const totalE = toClose.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
              const totalS = toClose.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
              await createCaisseCloture({
                city:         clotureModal.city,
                closedBy:     profile?.name || 'Directeur',
                closedById:   auth.currentUser?.uid,
                periodFrom,
                totalEntrees: totalE,
                totalSorties: totalS,
                solde:        totalE - totalS,
                entriesCount: toClose.length,
                note:         clotureModal.note,
              })
              _log('caisse_cloture', `Clôture de caisse — ${clotureModal.city}`, { city: clotureModal.city, solde: totalE - totalS })
              setClotureModal(null)
            } catch (err: any) { console.error('Cloture error:', err); setClotureError('Erreur : ' + (err?.message || err)) }
            finally { setClotureLoading(false) }
          }

          return (
            <div className="mt-4 space-y-5">

              {/* ------ Caisse Centrale ------ */}
              <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 rounded-3xl p-5 text-white shadow-xl">
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="text-teal-200 text-xs font-medium uppercase tracking-wider">Vue globale</p>
                      <h2 className="font-black text-xl mt-0.5">🏛️ Caisse Centrale</h2>
                      <p className="text-teal-300 text-xs mt-1">{cities.length} agence(s) · {caisseEntries.length} mouvement(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-teal-200 text-xs">Solde global</p>
                      <p className={`text-2xl font-black ${allSolde >= 0 ? 'text-white' : 'text-orange-300'}`}>
                        {allSolde < 0 ? '−' : ''}{fmt(Math.abs(allSolde))} DH
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3">
                      <p className="text-teal-200 text-xs mb-1">Total Entrées</p>
                      <p className="text-lg font-black text-green-300">{fmt(allEntrees)} DH</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3">
                      <p className="text-teal-200 text-xs mb-1">Total Sorties</p>
                      <p className="text-lg font-black text-red-300">{fmt(allSorties)} DH</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ------ Caisses par agence ------ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400" /> Caisses par agence
                  </h3>
                  {caisseCityFilter !== 'Toutes' && (
                    <button onClick={() => { setCaisseCityFilter('Toutes'); setCaisseTypeFilter('all') }}
                      className="ml-auto text-xs text-teal-600 font-semibold hover:underline">
                      ← Toutes les agences
                    </button>
                  )}
                </div>
                {citySummaries.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucune agence avec des mouvements</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {citySummaries.map(({ city: agCity, entrees: agEnt, sorties: agSor, solde: agSolde, count: agCount, lastCloture: agLast }) => (
                      <div key={agCity}
                        onClick={() => { setCaisseCityFilter(caisseCityFilter === agCity ? 'Toutes' : agCity); setCaisseTypeFilter('all') }}
                        className={`cursor-pointer rounded-2xl p-4 transition border-2 ${
                          caisseCityFilter === agCity
                            ? 'border-teal-500 bg-teal-50 shadow-md'
                            : 'border-transparent bg-white shadow-sm hover:shadow-md hover:border-gray-100'
                        }`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-gray-800 text-sm truncate">{agCity}</p>
                          {caisseCityFilter === agCity && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{agCount} mouv.</p>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-green-600">↑ {fmt(agEnt)} DH</p>
                          <p className="text-xs font-semibold text-red-500">↓ {fmt(agSor)} DH</p>
                        </div>
                        <p className={`text-base font-black mt-2 ${agSolde >= 0 ? 'text-teal-700' : 'text-orange-600'}`}>
                          {agSolde < 0 ? '−' : ''}{fmt(Math.abs(agSolde))} DH
                        </p>
                        {agLast && (
                          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 shrink-0" />
                            {(() => { const d = agLast.closedAt?.toDate?.() || new Date(agLast.closedAt || 0); return d.toLocaleDateString('fr-MA') })()}
                          </p>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setClotureModal({ city: agCity, note: '' }); setClotureError('') }}
                          className="mt-3 w-full text-xs font-bold py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition flex items-center justify-center gap-1">
                          <Lock className="w-3 h-3" /> Clôturer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ------ Détail agence sélectionnée ------ */}
              {caisseCityFilter !== 'Toutes' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-8 h-8 bg-teal-100 rounded-xl flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">Détail agence</p>
                        <p className="font-black text-gray-800">{caisseCityFilter}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { key: 'all',    label: 'Tout',    cls: 'bg-teal-600'  },
                          { key: 'entree', label: 'Entrées', cls: 'bg-green-600' },
                          { key: 'sortie', label: 'Sorties', cls: 'bg-red-500'   },
                        ].map(t => (
                          <button key={t.key} onClick={() => setCaisseTypeFilter(t.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                              caisseTypeFilter === t.key ? `${t.cls} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{t.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 rounded-2xl p-4 text-center border border-white shadow-sm">
                      <p className="text-xl font-black text-green-600">{fmt(totalEntrees)}</p>
                      <p className="text-xs text-gray-500 mt-1">Entrées DH</p>
                    </div>
                    <div className="bg-red-50 rounded-2xl p-4 text-center border border-white shadow-sm">
                      <p className="text-xl font-black text-red-600">{fmt(totalSorties)}</p>
                      <p className="text-xs text-gray-500 mt-1">Sorties DH</p>
                    </div>
                    <div className={`${solde >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-2xl p-4 text-center border border-white shadow-sm`}>
                      <p className={`text-xl font-black ${solde >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                        {solde < 0 ? '−' : ''}{fmt(Math.abs(solde))}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Solde DH</p>
                    </div>
                  </div>

                  {catBreakdown.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <h3 className="font-bold text-gray-700 text-sm mb-3">Répartition par catégorie</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {catBreakdown.map(cat => (
                          <div key={cat.key} className={`rounded-xl p-3 ${cat.color}`}>
                            <p className="text-lg">{cat.emoji}</p>
                            <p className="text-xs font-semibold mt-1">{cat.label}</p>
                            <p className="text-sm font-black mt-0.5">{fmt(cat.total)} DH</p>
                            <p className="text-xs opacity-70">{cat.count} opér.</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 px-1">{caisseFull.length} mouvement(s)</p>

                  {caisseFull.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
                      <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Aucun mouvement pour cette agence</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="divide-y divide-gray-50">
                        {caisseFull.map(e => {
                          const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                          const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                          return (
                            <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                                {cat?.emoji || '💱'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{e.description}</p>
                                <p className="text-xs text-gray-400">
                                  {cat?.label}
                                  {e.agentName && ` · 🧑‍💼 ${e.agentName}`}
                                  {e.staffName && ` · 👤 ${e.staffName}`}
                                  {e.reference && ` · Réf: ${e.reference}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-black ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                                  {e.type === 'entree' ? '+' : '−'}{fmt(e.amount)} DH
                                </p>
                                <p className="text-xs text-gray-400">{d.toLocaleDateString('fr-MA')}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {caisseClotures.filter(c => c.city === caisseCityFilter).length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-teal-600" />
                        <h3 className="font-bold text-gray-700 text-sm">Historique des clôtures</h3>
                        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {caisseClotures.filter(c => c.city === caisseCityFilter).length}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {caisseClotures
                          .filter(c => c.city === caisseCityFilter)
                          .map(cl => {
                            const dClosed = cl.closedAt?.toDate ? cl.closedAt.toDate() : new Date(cl.closedAt || 0)
                            const dFrom   = cl.periodFrom ? new Date(cl.periodFrom) : null
                            const fmtD = (d: any) => d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            return (
                              <div key={cl.id} className="px-4 py-3 hover:bg-gray-50 transition">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-700">
                                      {dFrom ? `${fmtD(dFrom)} → ${fmtD(dClosed)}` : `Début → ${fmtD(dClosed)}`}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">Par {cl.closedBy} · {cl.entriesCount} opér.</p>
                                    {cl.note && <p className="text-xs text-gray-500 italic mt-0.5">📝 {cl.note}</p>}
                                  </div>
                                  <div className="text-right shrink-0 space-y-0.5">
                                    <p className="text-xs text-green-600 font-semibold">+{fmt(cl.totalEntrees)} DH</p>
                                    <p className="text-xs text-red-500 font-semibold">−{fmt(cl.totalSorties)} DH</p>
                                    <p className={`text-sm font-black ${cl.solde >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                                      {cl.solde < 0 ? '−' : ''}{fmt(Math.abs(cl.solde))} DH
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ------ Remarques agents ------ */}
              {(() => {
                const openCount = allRemarks.filter(r => !r.resolved).length
                const filteredR = allRemarks
                  .filter(r => remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)
                  .filter(r =>
                    remarkFilter === 'all'      ? true :
                    remarkFilter === 'open'     ? !r.resolved :
                    r.resolved
                  )
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${openCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                        <AlertTriangle className={`w-5 h-5 ${openCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 text-sm">Remarques agents</h3>
                        <p className="text-xs text-gray-400">
                          {openCount > 0
                            ? <span className="text-red-500 font-semibold">{openCount} ouverte(s)</span>
                            : <span className="text-green-600 font-semibold">Aucune ouverte ✓</span>
                          }
                          {allRemarks.length > 0 && ` · ${allRemarks.length} au total`}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-2 shadow-sm">
                      <div className="flex flex-wrap gap-1.5">
                        {['Toutes', ...cities].map(c => (
                          <button key={c} onClick={() => setRemarkCityFilter(c)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                              remarkCityFilter === c ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >{c}</button>
                        ))}
                      </div>
                      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                        {[
                          { key: 'open',     label: 'Ouvertes', count: allRemarks.filter(r => !r.resolved && (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                          { key: 'resolved', label: 'Résolues', count: allRemarks.filter(r => r.resolved  && (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                          { key: 'all',      label: 'Toutes',   count: allRemarks.filter(r =>               (remarkCityFilter === 'Toutes' || r.city === remarkCityFilter)).length },
                        ].map(f => (
                          <button key={f.key} onClick={() => setRemarkFilter(f.key)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 ${
                              remarkFilter === f.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {f.label}
                            {f.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${remarkFilter === f.key ? 'bg-white/30' : 'bg-gray-200'}`}>{f.count}</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredR.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-gray-100">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">{remarkFilter === 'open' ? 'Aucune remarque ouverte ✓' : 'Aucune remarque'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredR.map(r => {
                          const rt = REMARK_TYPES.find(t => t.key === r.type) || (REMARK_TYPES as any).at(-1)
                          const d  = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt || 0)
                          return (
                            <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.resolved ? 'border-green-100 opacity-75' : 'border-red-100'}`}>
                              <div className={`px-4 py-3 flex items-center gap-3 ${r.resolved ? 'bg-green-50' : 'bg-red-50'}`}>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border ${rt.color}`}>{rt.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rt.color}`}>{rt.label}</span>
                                    {r.city && <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">📍 {r.city}</span>}
                                    {r.resolved
                                      ? <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Résolue</span>
                                      : <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">Ouverte</span>
                                    }
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {d.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                    {r.caissierName && ` · ${r.caissierName}`}
                                  </p>
                                </div>
                                {r.amount > 0 && (
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-black text-red-600">−{fmt(r.amount)} DH</p>
                                    <p className="text-xs text-gray-400">manquant</p>
                                  </div>
                                )}
                              </div>
                              <div className="px-4 py-3 space-y-1">
                                {r.agentName && (
                                  <p className="text-sm font-semibold text-gray-700">🧑‍💼 <span className="text-blue-700">{r.agentName}</span></p>
                                )}
                                <p className="text-sm text-gray-700">{r.description}</p>
                                <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                                  {!r.resolved && (
                                    <button onClick={() => resolveRemark(r.id)}
                                      className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Résoudre
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
                    )}
                  </div>
                )
              })()}

              {/* ------ Modal Clôture ------ */}
              {clotureModal && (() => {
                const last = clotureModal.city ? lastClotureForCity(clotureModal.city) : null
                const periodFrom = last?.periodTo || null
                const toClose = clotureModal.city
                  ? caisseEntries
                      .filter(e => e.city === clotureModal.city)
                      .filter(e => {
                        if (!periodFrom) return true
                        const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                        return d > new Date(periodFrom)
                      })
                  : []
                const totalE = toClose.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
                const totalS = toClose.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
                const soldeM  = totalE - totalS
                const fmtD = (d: any) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                return (
                  <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
                      <div className="flex items-center justify-between p-5 border-b">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
                            <Lock className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800">Clôturer la caisse</h3>
                            <p className="text-xs text-gray-400">{clotureModal.city || 'Sélectionnez une agence'}</p>
                          </div>
                        </div>
                        <button onClick={() => setClotureModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                          <X className="w-5 h-5 text-gray-500" />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        {clotureError && (
                          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {clotureError}</div>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Agence *</label>
                          <select
                            value={clotureModal.city}
                            onChange={e => setClotureModal((m: any) => ({ ...m, city: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-gray-50"
                          >
                            <option value="">— Sélectionner une agence —</option>
                            {cities.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        {clotureModal.city && (
                          <>
                            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                              <p>📅 Période : <strong className="text-gray-700">{periodFrom ? fmtD(periodFrom) : 'Depuis le début'}</strong> → <strong className="text-gray-700">Aujourd'hui</strong></p>
                              <p>📊 Opérations non clôturées : <strong className="text-gray-700">{toClose.length}</strong></p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-green-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Entrées</p>
                                <p className="font-black text-green-600 text-sm">{fmt(totalE)} DH</p>
                              </div>
                              <div className="bg-red-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Sorties</p>
                                <p className="font-black text-red-600 text-sm">{fmt(totalS)} DH</p>
                              </div>
                              <div className={`${soldeM >= 0 ? 'bg-teal-50' : 'bg-orange-50'} rounded-xl p-3 text-center`}>
                                <p className="text-xs text-gray-500">Solde</p>
                                <p className={`font-black text-sm ${soldeM >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>{soldeM < 0 ? '−' : ''}{fmt(Math.abs(soldeM))} DH</p>
                              </div>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note (optionnel)</label>
                          <input
                            placeholder="Remarque, observations..."
                            value={clotureModal.note}
                            onChange={e => setClotureModal((m: any) => ({ ...m, note: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-gray-50 focus:bg-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <button onClick={() => setClotureModal(null)}
                            className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                            Annuler
                          </button>
                          <button onClick={handleCloture} disabled={clotureLoading || !clotureModal.city}
                            className="py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                            {clotureLoading
                              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Clôture...</>
                              : <><Lock className="w-4 h-4" /> Clôturer</>
                            }
                          </button>
                        </div>
                        {clotureModal.city && toClose.length === 0 && (
                          <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-xl p-2">
                            ⚠️ Aucune opération ouverte — la clôture sera enregistrée avec solde zéro.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}

      {/* ------ MODAL ACTIVITÉ UTILISATEUR ------ */}
      {userActivityModal && (() => {
        const isAgent = userActivityModal.user.role === 'agent'
        const isCashier = userActivityModal.user.role === 'caissier'
        const list = isAgent
          ? (userDetailTab === 'created' ? userActivityModal.created : userActivityModal.claimed)
          : isCashier
            ? (userDetailTab === 'entrees' ? userActivityModal.entrees : userDetailTab === 'sorties' ? userActivityModal.sorties : userActivityModal.entries)
          : (userDetailTab === 'transport' ? userActivityModal.transports : userActivityModal.deliveries)
        return (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white sm:rounded-2xl w-full sm:max-w-3xl shadow-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
              <div className={`flex items-center gap-4 p-5 border-b shrink-0 ${isAgent ? 'bg-blue-50' : isCashier ? 'bg-teal-50' : 'bg-orange-50'}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${isAgent ? 'bg-blue-100' : isCashier ? 'bg-teal-100' : 'bg-orange-100'}`}>{isAgent ? '🧑‍💼' : isCashier ? '🏦' : '🚚'}</div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-800 text-lg truncate">{userActivityModal.user.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAgent ? 'bg-blue-100 text-blue-700' : isCashier ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>{isAgent ? 'Agent' : isCashier ? 'Caissier' : 'Chauffeur'}</span>
                    {userActivityModal.user.city && <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{userActivityModal.user.city}</span>}
                  </div>
                </div>
                <button onClick={() => setUserActivityModal(null)} className="p-2 hover:bg-white/60 rounded-xl transition shrink-0"><X className="w-5 h-5 text-gray-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                  {isAgent ? (
                    <>
                      <button onClick={() => setUserDetailTab('created')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'created' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>📦 Créés ({userActivityModal.created.length})</button>
                      <button onClick={() => setUserDetailTab('claimed')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'claimed' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>📬 Récupérés ({userActivityModal.claimed.length})</button>
                    </>
                  ) : isCashier ? (
                    <>
                      <button onClick={() => setUserDetailTab('entries')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'entries' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Mouvements ({userActivityModal.entries.length})</button>
                      <button onClick={() => setUserDetailTab('entrees')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'entrees' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Entrées ({userActivityModal.entrees.length})</button>
                      <button onClick={() => setUserDetailTab('sorties')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'sorties' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Sorties ({userActivityModal.sorties.length})</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setUserDetailTab('transport')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'transport' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>🚛 Transports ({userActivityModal.transports.length})</button>
                      <button onClick={() => setUserDetailTab('delivery')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${userDetailTab === 'delivery' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>🏠 Livraisons ({userActivityModal.deliveries.length})</button>
                    </>
                  )}
                </div>
                {list.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">📭 Aucun colis dans cette catégorie</div>
                ) : isCashier ? (
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {['Date','Type','Catégorie','Description','Montant'].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {list.map((e: any) => {
                            const isEntry = e.type === 'entree'
                            const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
                            return (
                              <tr key={e.id} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{caisseEntryDate(e).toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                                <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isEntry ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{isEntry ? 'Entrée' : 'Sortie'}</span></td>
                                <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">{cat?.label || e.category || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600">{e.description || e.reference || '—'}</td>
                                <td className={`px-4 py-2.5 font-bold whitespace-nowrap ${isEntry ? 'text-green-600' : 'text-red-600'}`}>{isEntry ? '+' : '-'}{fmt(parseFloat(e.amount || 0) || 0)} DH</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {['Tracking','Date','Expéditeur → Destinataire','Ville dest.','RETOUR FOND','Statut'].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {list.map((p: any) => {
                            const c = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
                            const date = parcelDate(p).toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit' })
                            return (
                              <tr key={p.id} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-2.5"><span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">{p.trackingId}</span></td>
                                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{date}</td>
                                <td className="px-4 py-2.5"><p className="text-sm font-medium text-gray-800">{p.sender?.name} → {p.receiver?.name}</p><p className="text-xs text-gray-400">{p.sender?.city} → {p.receiver?.city}</p></td>
                                <td className="px-4 py-2.5 text-gray-600 font-medium whitespace-nowrap">{p.receiver?.city}</td>
                                <td className="px-4 py-2.5">{p.codAmount > 0 ? <span className="text-orange-600 font-bold">{p.codAmount} DH</span> : <span className="text-gray-300">—</span>}</td>
                                <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{p.status}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

        {/* ══════════════ TAB: DOSSIERS RH ══════════════ */}
        {mainTab === 'employees' && hasPermission('employees') && (
          <div className="mt-4 space-y-4">
            {/* Barre de filtres */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Rechercher un employé..."
                  className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
                />
                {userSearch && <button onClick={() => setUserSearch('')}><X className="w-4 h-4 text-gray-400" /></button>}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { key: 'Tous',      label: 'Tous',        emoji: '👥' },
                  { key: 'agent',     label: 'Agents',      emoji: '🧑‍💼' },
                  { key: 'chauffeur', label: 'Chauffeurs',  emoji: '🚚' },
                  { key: 'caissier',  label: 'Caissiers',   emoji: '🏦' },
                  { key: 'salarie',   label: 'Salariés',    emoji: '👤' },
                ].map(({ key, label, emoji }) => (
                  <button key={key} onClick={() => setRoleFilter(key)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === key ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {emoji} {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grille des fiches employé */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nonAdminUsers
                .filter(u => roleFilter === 'Tous' || u.role === roleFilter)
                .filter(u => !userSearch || [u.name, u.city, u.code, u.cin, u.cnss].some(v => v?.toLowerCase().includes(userSearch.toLowerCase())))
                .map(u => {
                  const role = EDIT_ROLES.find(r => r.key === u.role) || { emoji: '👤', label: u.role, badge: 'bg-gray-100 text-gray-600' }
                  const month = currentSalaryMonth()
                  const salaryBase = parseFloat(u.salaire || 0) || 0
                  const salaryPaid = caisseEntries
                    .filter(e => e.category === 'salaire'
                      && e.salaryMonth === month
                      && (e.staffId === u.id || (!e.staffId && e.staffName === u.name)))
                    .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0)
                  const salaryAdvance = caisseEntries
                    .filter(e => e.category === 'avance'
                      && e.salaryMonth === month
                      && (e.staffId === u.id || (!e.staffId && e.staffName === u.name)))
                    .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0)
                  const remainingSalary = Math.max(0, salaryBase - salaryPaid - salaryAdvance)
                  return (
                    <div key={u.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                      <div className="flex items-center gap-3 p-4 border-b border-gray-50">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${role.badge.split(' ')[0]}`}>
                          {role.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{u.name}</p>
                          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${role.badge}`}>{role.label}</span>
                        </div>
                        {u.city && <span className="text-xs text-gray-400 shrink-0">📍 {u.city}</span>}
                      </div>
                      <div className="p-4 space-y-2 text-sm flex-1">
                        <div className="flex justify-between">
                          <span className="text-gray-400">CIN</span>
                          <span className={`font-mono font-medium ${u.cin ? 'text-gray-700' : 'text-gray-300'}`}>{u.cin || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">CNSS</span>
                          <span className={`font-mono font-medium ${u.cnss ? 'text-gray-700' : 'text-gray-300'}`}>{u.cnss || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Embauche</span>
                          <span className={`font-medium ${u.dateEmbauche ? 'text-gray-700' : 'text-gray-300'}`}>
                            {u.dateEmbauche ? new Date(u.dateEmbauche).toLocaleDateString('fr-MA') : '—'}
                          </span>
                        </div>
                        {u.dateSortie && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Sortie</span>
                            <span className="font-medium text-red-500">{new Date(u.dateSortie).toLocaleDateString('fr-MA')}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-400">Salaire</span>
                          <span className={`font-bold ${u.salaire ? 'text-green-600' : 'text-gray-300'}`}>
                            {u.salaire ? `${u.salaire} DH/mois` : '—'}
                          </span>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Payé ce mois</span>
                            <span className="font-bold text-blue-600">{fmt(salaryPaid)} DH</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Reste</span>
                            <span className={`font-bold ${remainingSalary > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(remainingSalary)} DH</span>
                          </div>
                          {salaryAdvance > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Avances</span>
                              <span className="font-bold text-pink-600">{fmt(salaryAdvance)} DH</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        <button
                          onClick={() => { setUserEditTab('hr'); setUserEdit({ id: u.id, name: u.name||'', role: u.role||'agent', city: u.city||'', code: u.code||'', tel: u.tel||'', cin: u.cin||'', cnss: u.cnss||'', assurance: u.assurance||'', dateEmbauche: u.dateEmbauche||'', dateSortie: u.dateSortie||'', dateNaissance: u.dateNaissance||'', salaire: u.salaire||'', adresse: u.adresse||'', situationFamiliale: u.situationFamiliale||'', contactUrgence: u.contactUrgence||'', noteRH: u.noteRH||'' }) }}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-semibold transition"
                        >
                          <FileText className="w-3.5 h-3.5" /> Ouvrir le dossier RH
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
    </div>
  )
}
