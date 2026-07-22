import { useEffect, useMemo, useRef, useState } from 'react'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import * as XLSX from 'xlsx'
import {
  createCentralSupplierPayment,
  markCentralSupplierPaymentPaid,
  updateCentralSupplierPayment,
  deleteCentralSupplierPayment,
  subscribeAllCentralCodDeposits,
  subscribeAllCentralSupplierPayments,
  updateCentralCodDeposit,
  deleteCentralCodDeposit,
  resetAllAgencyCashBalances,
  deleteAllCentralCodDeposits,
  deleteAllCentralSupplierPayments,
  subscribeAllParcels,
  getParcelsPage,
  searchParcels,
  getAllArchivedParcels,
  markParcelsControlled,
  unmarkParcelsControlled,
  COD_PAYMENT_TYPES,
  COD_STATUS,
  STATUS_COLORS,
  STATUSES,
} from '../firebase/firestore'
import { Banknote, Building2, CheckCircle2, ClipboardCheck, Database, LogOut, MapPin, Package, Search, FileText, X, Save, Printer, Calendar, Filter, Edit, Trash2, Sparkles, TrendingUp, Wallet, Archive } from 'lucide-react'
import ProfilePhotoUpload from '../components/ProfilePhotoUpload'

const PAGE_SIZE = 800 // Chargement progressif par tranches de 800

const money = (n: any) => (parseFloat(n) || 0).toLocaleString('fr-MA')
const asDate = (value: any) => {
  if (!value) return null
  if (value.toDate) return value.toDate()
  return new Date(value)
}
const fmtDate = (value: any) => {
  const d = asDate(value)
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-MA') : '-'
}
const senderKey = (p: any) => `${String(p.sender?.name || '').trim().toLowerCase()}|${String(p.sender?.tel || '').trim()}`
const parcelAgency = (p: any) => p?.centralDepositCity || p?.destinationCity || p?.receiver?.city || p?.originCity || p?.sender?.city || 'Agence non definie'
const supplierAgency = (p: any) => p?.originCity || p?.sender?.city || 'Agence non definie'
const supplierAgenciesText = (parcels: any) => [...new Set((parcels || []).map(supplierAgency).filter(Boolean))].join(', ') || '-'
const isParcelPaid = (p: any) => !!p.centralSupplierPaid || !!p.codSenderPaid || p.centralSupplierPaymentStatus === 'paid'
const isParcelPrepared = (p: any) => !isParcelPaid(p) && (p.centralSupplierPaymentStatus === 'prepared' || !!p.centralSupplierPaymentId)
const paymentStatus = (pay: any) => pay?.status || 'paid'
const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/\s+/g, '')
const hasSearch = (values: any, q: any) => {
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = String(v ?? '').toLowerCase()
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}
const inDateRange = (value: any, preset: any, from: any, to: any) => {
  if (preset === 'all') return true
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return false
  const now = new Date()
  let start: any = null
  let end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (preset === 'today') {
    start = new Date(now)
    start.setHours(0, 0, 0, 0)
  } else if (preset === 'week') {
    start = new Date(now)
    start.setDate(now.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (preset === 'custom') {
    start = from ? new Date(from + 'T00:00:00') : null
    end = to ? new Date(to + 'T23:59:59') : end
  }
  return (!start || d >= start) && (!end || d <= end)
}

export default function CentralCollectorPage() {
  const [profile, setProfile] = useState<any>(null)
  const [deposits, setDeposits] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'controle' | 'fournisseurs' | 'archives'>('controle')

  // 📦 Archives
  const [archivedParcels, setArchivedParcels] = useState<any[]>([])
  const [archivesLoading, setArchivesLoading] = useState(false)
  const [archivesLoaded, setArchivesLoaded] = useState(false)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveDatePreset, setArchiveDatePreset] = useState('all')
  const [archiveDateFrom, setArchiveDateFrom] = useState('')
  const [archiveDateTo, setArchiveDateTo] = useState('')
  const [archivePaymentType, setArchivePaymentType] = useState('all')

  // ── Chargement progressif des colis (tranches de 800) ────────────────────
  const [liveParcels, setLiveParcels] = useState<any[]>([])       // 800 derniers, temps réel
  const [moreParcels, setMoreParcels] = useState<any[]>([])       // pages suivantes (statique)
  const [serverResults, setServerResults] = useState<any[]>([])   // recherche serveur toute la base
  const [controlOverrides, setControlOverrides] = useState<Record<string, any>>({}) // pointage optimiste
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadAllProgress, setLoadAllProgress] = useState(0)
  const [deepSearching, setDeepSearching] = useState(false)
  const lastDocRef = useRef<any>(null)
  const pagedRef = useRef(false)

  // Filtres onglet fournisseurs (existant)
  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('unpaid')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [modal, setModal] = useState<any>(null)
  const [selectedAgency, setSelectedAgency] = useState('')
  const [payingId, setPayingId] = useState('')
  const [editPaymentModal, setEditPaymentModal] = useState<any>(null)
  const [deletePaymentId, setDeletePaymentId] = useState('')
  const [editDepositModal, setEditDepositModal] = useState<any>(null)
  const [deleteDepositId, setDeleteDepositId] = useState('')
  const [resettingBalances, setResettingBalances] = useState(false)
  const [deletingAllDeposits, setDeletingAllDeposits] = useState(false)
  const [deletingAllPayments, setDeletingAllPayments] = useState(false)

  // Filtres onglet contrôle & pointage
  const [ctlQuery, setCtlQuery] = useState('')
  const [ctlDebounced, setCtlDebounced] = useState('')
  const [ctlCity, setCtlCity] = useState('all')
  const [ctlPayType, setCtlPayType] = useState('all')
  const [ctlCodStatus, setCtlCodStatus] = useState('all')
  const [ctlControl, setCtlControl] = useState('all')
  const [ctlParcelStatus, setCtlParcelStatus] = useState('all')
  const [ctlDatePreset, setCtlDatePreset] = useState('all')
  const [ctlDateFrom, setCtlDateFrom] = useState('')
  const [ctlDateTo, setCtlDateTo] = useState('')
  const [ctlMinAmount, setCtlMinAmount] = useState('')
  const [ctlMaxAmount, setCtlMaxAmount] = useState('')
  const [ctlSelected, setCtlSelected] = useState<Set<string>>(new Set())
  const [ctlDisplayLimit, setCtlDisplayLimit] = useState(200)
  const [pointing, setPointing] = useState(false)

  // ⚡ Debounce de la recherche contrôle (300ms — filtre dynamique)
  useEffect(() => {
    const timer = setTimeout(() => setCtlDebounced(ctlQuery), 300)
    return () => clearTimeout(timer)
  }, [ctlQuery])

  // Réinitialiser la limite d'affichage quand les filtres changent
  useEffect(() => {
    setCtlDisplayLimit(200)
  }, [ctlDebounced, ctlCity, ctlPayType, ctlCodStatus, ctlControl, ctlParcelStatus, ctlDatePreset, ctlDateFrom, ctlDateTo, ctlMinAmount, ctlMaxAmount])

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    return onSnapshot(
      doc(db, 'users', uid),
      snap => setProfile(snap.exists() ? snap.data() : null),
      err => console.warn('CentralCollectorPage user profile listener error:', err.code)
    )
  }, [])

  // Abonnement temps réel : 800 derniers colis seulement (rapide)
  useEffect(() => {
    const onError = (err: any) => console.error('CentralCollectorPage:', err)
    const unsubParcels = subscribeAllParcels((docs: any[], lastSnap: any) => {
      setLiveParcels(docs)
      if (!pagedRef.current) lastDocRef.current = lastSnap
      if (docs.length < PAGE_SIZE) setHasMore(false)
    }, onError, 0, PAGE_SIZE)
    return () => { unsubParcels() }
  }, [])

  // 🚀 Chargement automatique de toute la base en arrière-plan (après premiers 800)
  useEffect(() => {
    if (!hasMore || loadingAll || loadingMore || !lastDocRef.current) return
    if (liveParcels.length === 0) return // attendre le chargement initial

    // Lancer le chargement complet automatiquement après 2 secondes
    const timer = setTimeout(() => {
      if (hasMore && !loadingAll && !loadingMore && lastDocRef.current) {
        loadAllParcels()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [liveParcels.length, hasMore])

  // 📦 Charger les archives quand l'onglet est sélectionné
  useEffect(() => {
    if (activeTab !== 'archives' || archivesLoaded) return

    const loadArchives = async () => {
      setArchivesLoading(true)
      try {
        // Récupérer toutes les archives (sans filtre par ville)
        const archived = await getAllArchivedParcels(1000)
        setArchivedParcels(archived)
        setArchivesLoaded(true)
      } catch (err: any) {
        console.error('Erreur chargement archives:', err)
        alert(`❌ Erreur: ${err.message}`)
      } finally {
        setArchivesLoading(false)
      }
    }

    loadArchives()
  }, [activeTab, archivesLoaded])

  // Charger 800 colis de plus (curseur Firestore startAfter)
  const loadMoreParcels = async () => {
    if (!hasMore || loadingMore || loadingAll || !lastDocRef.current) return
    setLoadingMore(true)
    try {
      const { docs, lastDocSnap, hasMore: moreAvailable } = await getParcelsPage(lastDocRef.current, PAGE_SIZE)
      pagedRef.current = true
      setMoreParcels(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        docs.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      })
      if (lastDocSnap) lastDocRef.current = lastDocSnap
      if (!moreAvailable) setHasMore(false)
    } catch (err) {
      console.error('CentralCollectorPage loadMore:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  // Tout charger : boucle par tranches de 800 jusqu'à la fin de la base
  const loadAllParcels = async () => {
    if (loadingAll || loadingMore || !hasMore || !lastDocRef.current) return
    setLoadingAll(true)
    setLoadAllProgress(0)
    try {
      let cursor = lastDocRef.current
      let more = true
      let loaded = 0
      let safety = 0
      while (more && cursor && safety < 500) {
        const page = await getParcelsPage(cursor, PAGE_SIZE)
        pagedRef.current = true
        const pageDocs = page.docs
        loaded += pageDocs.length
        setLoadAllProgress(loaded)
        setMoreParcels(prev => {
          const map = new Map()
          prev.forEach((p: any) => map.set(p.id, p))
          pageDocs.forEach((p: any) => map.set(p.id, p))
          return [...map.values()]
        })
        cursor = page.lastDocSnap
        more = page.hasMore && !!page.lastDocSnap
        safety += 1
      }
      if (cursor) lastDocRef.current = cursor
      setHasMore(false)
    } catch (err) {
      console.error('CentralCollectorPage loadAll:', err)
    } finally {
      setLoadingAll(false)
    }
  }

  // 🔍 Recherche approfondie côté serveur (toute la base, index Firestore)
  const runDeepSearch = async () => {
    const term = ctlQuery.trim()
    if (term.length < 3 || deepSearching) return
    setDeepSearching(true)
    try {
      const res = await searchParcels(term, { includeArchived: false })
      setServerResults(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        res.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      })
    } catch (err) {
      console.error('CentralCollectorPage deepSearch:', err)
    } finally {
      setDeepSearching(false)
    }
  }

  // Fusion : temps réel + pages chargées + résultats serveur + pointage optimiste
  const parcels = useMemo(() => {
    const map = new Map()
    moreParcels.forEach((p: any) => map.set(p.id, p))
    serverResults.forEach((p: any) => map.set(p.id, p))
    liveParcels.forEach((p: any) => map.set(p.id, p)) // le temps réel gagne
    let arr = [...map.values()]
    if (Object.keys(controlOverrides).length) {
      arr = arr.map((p: any) => controlOverrides[p.id] ? { ...p, ...controlOverrides[p.id] } : p)
    }
    return arr.sort((a: any, b: any) => {
      const ta = asDate(a.createdAt)?.getTime() || 0
      const tb = asDate(b.createdAt)?.getTime() || 0
      return tb - ta
    })
  }, [liveParcels, moreParcels, serverResults, controlOverrides])

  useEffect(() => {
    const onError = (err: any) => console.error('CentralCollectorPage:', err)
    const unsubDeposits = subscribeAllCentralCodDeposits(setDeposits, onError)
    const unsubPayments = subscribeAllCentralSupplierPayments(setPayments, onError)
    return () => {
      unsubDeposits()
      unsubPayments()
    }
  }, [])

  const depositedParcels = useMemo(() => parcels.filter(p =>
    parseFloat(p.codAmount || 0) > 0 && p.centralDeposited
  ), [parcels])

  // ── Onglet Contrôle & Pointage : contre-espèces de toutes les agences ────
  const parcelCity = (p: any) => p.destinationCity || p.receiver?.city || 'Ville inconnue'
  const isControlled = (p: any) => !!p.controlled

  const codParcels = useMemo(() => parcels.filter((p: any) => (parseFloat(p.codAmount) || 0) > 0), [parcels])

  const ctlCities = useMemo(() => [...new Set(codParcels.map(parcelCity).filter(Boolean))].sort(), [codParcels])

  // Filtrage des archives
  const filteredArchives = useMemo(() => {
    let filtered = archivedParcels

    // Filtre de recherche
    if (archiveSearch) {
      const q = archiveSearch.toLowerCase()
      filtered = filtered.filter((p: any) =>
        hasSearch([
          p.trackingId,
          p.senderNic,
          p.sender?.nic,
          p.sender?.name,
          p.sender?.tel,
          p.receiver?.name,
          p.receiver?.tel,
          p.destinationCity,
        ], q)
      )
    }

    // Filtre de date
    filtered = filtered.filter((p: any) =>
      inDateRange(p.archivedAt || p.createdAt, archiveDatePreset, archiveDateFrom, archiveDateTo)
    )

    // Filtre type de paiement COD
    if (archivePaymentType !== 'all') {
      filtered = filtered.filter((p: any) => p.codPaymentType === archivePaymentType)
    }

    return filtered
  }, [archivedParcels, archiveSearch, archiveDatePreset, archiveDateFrom, archiveDateTo, archivePaymentType])

  // Filtre complet SAUF la ville (sert aux compteurs par ville)
  const ctlFilteredAllCities = useMemo(() => {
    const qq = ctlDebounced.trim().toLowerCase()
    const mn = ctlMinAmount === '' ? null : parseFloat(ctlMinAmount)
    const mx = ctlMaxAmount === '' ? null : parseFloat(ctlMaxAmount)
    return parcels.filter((p: any) => {
      if (ctlPayType !== 'all') {
        const t = p.codPaymentType || ''
        if (ctlPayType === 'none' && t) return false
        if (ctlPayType !== 'none' && t !== ctlPayType) return false
      }
      if (ctlCodStatus !== 'all' && (p.codStatus || 'pending') !== ctlCodStatus) return false
      if (ctlControl === 'controlled' && !isControlled(p)) return false
      if (ctlControl === 'uncontrolled' && isControlled(p)) return false
      if (ctlParcelStatus !== 'all' && p.status !== ctlParcelStatus) return false
      if (!inDateRange(p.createdAt, ctlDatePreset, ctlDateFrom, ctlDateTo)) return false
      const n = parseFloat(p.codAmount) || 0
      if (mn !== null && !Number.isNaN(mn) && n < mn) return false
      if (mx !== null && !Number.isNaN(mx) && n > mx) return false
      if (!qq) return true
      return hasSearch([
        p.trackingId, p.id, p.sender?.nic, p.senderNic, p.sender?.name, p.senderName,
        p.sender?.tel, p.senderTel, p.receiver?.name, p.receiverName,
        p.receiver?.tel, p.receiverTel, p.originCity, p.destinationCity,
        p.receiver?.city, p.codAmount, p.status, p.controlledBy,
      ], qq)
    })
  }, [parcels, ctlDebounced, ctlPayType, ctlCodStatus, ctlControl, ctlParcelStatus, ctlDatePreset, ctlDateFrom, ctlDateTo, ctlMinAmount, ctlMaxAmount])

  // Compteurs par ville (pointage ville par ville)
  const ctlCityStats = useMemo(() => {
    const map = new Map()
    ctlFilteredAllCities.forEach((p: any) => {
      const city = parcelCity(p)
      if (!map.has(city)) map.set(city, { city, count: 0, controlled: 0, amount: 0, controlledAmount: 0 })
      const s = map.get(city)
      const amt = parseFloat(p.codAmount) || 0
      s.count += 1
      s.amount += amt
      if (isControlled(p)) { s.controlled += 1; s.controlledAmount += amt }
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [ctlFilteredAllCities])

  // Liste finale filtrée (avec ville) + tri intelligent si recherche numérique (N° EXP)
  const ctlFiltered = useMemo(() => {
    let rows = ctlCity === 'all'
      ? ctlFilteredAllCities
      : ctlFilteredAllCities.filter((p: any) => parcelCity(p) === ctlCity)
    const term = ctlDebounced.trim().toUpperCase()
    if (term && /^[0-9]+$/.test(term)) {
      const score = (p: any) => {
        const nic = String(p.senderNic || p.sender?.nic || '')
        const track = String(p.trackingId || '')
        if (nic === term || track === term) return 1000
        if (nic.startsWith(term) || track.startsWith(term)) return 100
        if (nic.includes(term) || track.includes(term)) return 10
        return 0
      }
      rows = [...rows].sort((a, b) => score(b) - score(a))
    }
    return rows
  }, [ctlFilteredAllCities, ctlCity, ctlDebounced])

  const ctlDisplayed = useMemo(() => ctlFiltered.slice(0, ctlDisplayLimit), [ctlFiltered, ctlDisplayLimit])

  // KPIs contrôle
  const ctlKpis = useMemo(() => {
    let totalAmount = 0, controlledCount = 0, controlledAmount = 0
    const byType: Record<string, { count: number; amount: number }> = {}
    ctlFiltered.forEach((p: any) => {
      const amt = parseFloat(p.codAmount) || 0
      totalAmount += amt
      if (isControlled(p)) { controlledCount += 1; controlledAmount += amt }
      const t = p.codPaymentType || 'none'
      if (!byType[t]) byType[t] = { count: 0, amount: 0 }
      byType[t].count += 1
      byType[t].amount += amt
    })
    return {
      total: ctlFiltered.length,
      totalAmount,
      controlledCount,
      controlledAmount,
      uncontrolledCount: ctlFiltered.length - controlledCount,
      uncontrolledAmount: totalAmount - controlledAmount,
      pct: ctlFiltered.length ? Math.round((controlledCount / ctlFiltered.length) * 100) : 0,
      byType,
    }
  }, [ctlFiltered])

  const clearCtlFilters = () => {
    setCtlQuery('')
    setCtlCity('all')
    setCtlPayType('all')
    setCtlCodStatus('all')
    setCtlControl('all')
    setCtlParcelStatus('all')
    setCtlDatePreset('all')
    setCtlDateFrom('')
    setCtlDateTo('')
    setCtlMinAmount('')
    setCtlMaxAmount('')
  }

  // ✅ Pointage : marquer / dé-marquer contrôlé (batch Firestore + MAJ optimiste)
  const applyControl = async (ids: string[], value: boolean) => {
    const clean = ids.filter(Boolean)
    if (clean.length === 0 || pointing) return
    setPointing(true)
    try {
      const name = profile?.name || 'Encaisseur central'
      const uid = auth.currentUser?.uid || ''
      if (value) await markParcelsControlled(clean, name, uid)
      else await unmarkParcelsControlled(clean)
      const now = new Date().toISOString()
      setControlOverrides(prev => {
        const next = { ...prev }
        clean.forEach(id => {
          next[id] = value
            ? { controlled: true, controlledBy: name, controlledById: uid, controlledAt: now }
            : { controlled: false, controlledBy: '', controlledById: '', controlledAt: '' }
        })
        return next
      })
      setCtlSelected(prev => {
        const s = new Set(prev)
        clean.forEach(id => s.delete(id))
        return s
      })
    } catch (err: any) {
      alert(err?.message || 'Erreur lors du pointage.')
    } finally {
      setPointing(false)
    }
  }

  const toggleSelect = (id: string) => {
    setCtlSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const allDisplayedSelected = ctlDisplayed.length > 0 && ctlDisplayed.every((p: any) => ctlSelected.has(p.id))
  const toggleSelectAllDisplayed = () => {
    setCtlSelected(prev => {
      const s = new Set(prev)
      if (allDisplayedSelected) ctlDisplayed.forEach((p: any) => s.delete(p.id))
      else ctlDisplayed.forEach((p: any) => s.add(p.id))
      return s
    })
  }

  const payTypeBadge = (p: any) => {
    const t = COD_PAYMENT_TYPES.find((x: any) => x.key === p.codPaymentType)
    if (!t) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">—</span>
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${t.bg} ${t.text}`}>{t.emoji} {t.label}</span>
  }

  const codStatusBadge = (p: any) => {
    const s = COD_STATUS[p.codStatus || 'pending'] || COD_STATUS.pending
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.bg} ${s.text}`}>{s.label}</span>
  }

  const statusBadge = (p: any) => {
    const c = STATUS_COLORS[p.status] || { bg: 'bg-slate-100', text: 'text-slate-600' }
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${c.bg} ${c.text}`}>{p.status || '-'}</span>
  }

  const cities = useMemo(() => [...new Set(deposits.map(d => d.city).filter(Boolean))].sort(), [deposits])
  const parcelById = useMemo(() => new Map(parcels.map(p => [p.id, p])), [parcels])
  const q = query.trim().toLowerCase()
  const min = parseFloat(minAmount) || null
  const max = parseFloat(maxAmount) || null
  const amountOk = (amount: any) => {
    const n = parseFloat(amount) || 0
    if (min !== null && n < min) return false
    if (max !== null && n > max) return false
    return true
  }

  const filteredDeposits = deposits.filter(d => {
    if (cityFilter !== 'all' && d.city !== cityFilter) return false
    if (!inDateRange(d.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(d.amount)) return false
    if (!q) return true
    const linkedParcels = (d.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
    const values = [
      d.city, d.agentName, d.amount, d.note,
      ...(d.parcels || []).flatMap((p: any) => [
        p.id, p.trackingId, p.senderNic, p.sender?.nic, p.senderName, p.senderTel,
        p.receiverName, p.receiverTel, p.originCity, p.destinationCity,
      ]),
      ...linkedParcels.flatMap((p: any) => [
        p.trackingId, p.sender?.nic, p.sender?.name, p.sender?.tel,
        p.receiver?.name, p.receiver?.tel, p.originCity, p.destinationCity,
      ]),
    ]
    return hasSearch(values, q)
  })

  const filteredPayments = payments.filter(pay => {
    if (!inDateRange(pay.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(pay.amount)) return false
    if (cityFilter !== 'all') {
      const hasCity = (pay.parcels || []).some((p: any) => p.originCity === cityFilter || p.destinationCity === cityFilter)
      if (!hasCity) return false
    }
    if (!q) return true
    const linkedParcels = (pay.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
    const values = [
      pay.senderName, pay.senderTel, pay.senderNic, pay.chequeNum, pay.bankName, pay.amount, pay.note,
      ...(pay.parcels || []).flatMap((p: any) => [
        p.id, p.trackingId, p.senderNic, p.sender?.nic, p.senderName, p.senderTel,
        p.receiverName, p.receiverTel, p.originCity, p.destinationCity,
      ]),
      ...linkedParcels.flatMap((p: any) => [
        p.trackingId, p.sender?.nic, p.sender?.name, p.sender?.tel,
        p.receiver?.name, p.receiver?.tel, p.originCity, p.destinationCity,
      ]),
    ]
    return hasSearch(values, q)
  })

  const filteredParcelsForSuppliers = useMemo(() => depositedParcels.filter(p => {
    if (cityFilter !== 'all' && p.centralDepositCity !== cityFilter) return false
    if (!inDateRange(p.centralDepositAt || p.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(p.codAmount)) return false
    const paid = isParcelPaid(p)
    const prepared = isParcelPrepared(p)
    if (paymentFilter === 'unpaid' && (paid || prepared)) return false
    if (paymentFilter === 'prepared' && !prepared) return false
    if (paymentFilter === 'paid' && !paid) return false
    const values = [
      p.id, p.trackingId, p.sender?.name, p.sender?.nic, p.sender?.tel, p.receiver?.name, p.receiver?.tel,
      p.originCity, p.destinationCity, p.centralDepositCity, p.codAmount,
      p.centralChequeNum, p.centralChequeBank,
    ]
    return hasSearch(values, q)
  }), [depositedParcels, cityFilter, datePreset, dateFrom, dateTo, minAmount, maxAmount, paymentFilter, q])

  const supplierGroups = useMemo(() => {
    const map = new Map()
    filteredParcelsForSuppliers.forEach(p => {
      const key = senderKey(p)
      if (!map.has(key)) {
        map.set(key, {
          key,
          senderName: p.sender?.name || 'Expediteur sans nom',
          senderTel: p.sender?.tel || '',
          supplierAgencies: [],
          parcels: [],
          total: 0,
        })
      }
      const group = map.get(key)
      const agency = supplierAgency(p)
      if (agency && !group.supplierAgencies.includes(agency)) group.supplierAgencies.push(agency)
      group.parcels.push(p)
      group.total += parseFloat(p.codAmount) || 0
    })
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filteredParcelsForSuppliers])

  const agencySections = useMemo(() => {
    const map = new Map()
    const ensure = (city: any) => {
      const key = city || 'Agence non definie'
      if (!map.has(key)) {
        map.set(key, {
          city: key,
          deposits: [],
          payments: [],
          supplierGroups: [],
          totalDeposits: 0,
          totalWaiting: 0,
          totalPaid: 0,
          parcelCount: 0,
        })
      }
      return map.get(key)
    }

    filteredDeposits.forEach(dep => {
      const section = ensure(dep.city)
      section.deposits.push(dep)
      section.totalDeposits += parseFloat(dep.amount) || 0
    })

    const parcelsByAgency = new Map()
    filteredParcelsForSuppliers.forEach(p => {
      const city = parcelAgency(p)
      if (!parcelsByAgency.has(city)) parcelsByAgency.set(city, [])
      parcelsByAgency.get(city).push(p)
      const section = ensure(city)
      section.totalWaiting += parseFloat(p.codAmount) || 0
      section.parcelCount += 1
    })

    parcelsByAgency.forEach((list, city) => {
      const bySupplier = new Map()
      list.forEach((p: any) => {
        const key = senderKey(p)
        if (!bySupplier.has(key)) {
          bySupplier.set(key, {
            key: `${city}|${key}`,
            city,
            senderName: p.sender?.name || 'Expediteur sans nom',
            senderTel: p.sender?.tel || '',
            supplierAgencies: [],
            parcels: [],
            total: 0,
          })
        }
        const group = bySupplier.get(key)
        const agency = supplierAgency(p)
        if (agency && !group.supplierAgencies.includes(agency)) group.supplierAgencies.push(agency)
        group.parcels.push(p)
        group.total += parseFloat(p.codAmount) || 0
      })
      ensure(city).supplierGroups = [...bySupplier.values()].sort((a, b) => b.total - a.total)
    })

    filteredPayments.forEach(pay => {
      const linkedParcels = (pay.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
      const cities = new Set([
        ...(pay.parcels || []).map((p: any) => p.centralDepositCity || p.destinationCity || p.originCity).filter(Boolean),
        ...linkedParcels.map(parcelAgency).filter(Boolean),
      ])
      if (cities.size === 0) cities.add('Agence non definie')
      cities.forEach(city => {
        const section = ensure(city)
        section.payments.push(pay)
        section.totalPaid += parseFloat(pay.amount) || 0
      })
    })

    return [...map.values()]
      .filter(section => section.deposits.length || section.payments.length || section.supplierGroups.length)
      .sort((a, b) => a.city.localeCompare(b.city))
  }, [filteredDeposits, filteredPayments, filteredParcelsForSuppliers, parcelById])

  const agencyNames = agencySections.map(section => section.city)
  const agencyKey = agencyNames.join('|')
  useEffect(() => {
    if (cityFilter !== 'all') {
      if (selectedAgency !== cityFilter) setSelectedAgency(cityFilter)
      return
    }
    if (!agencyNames.length) {
      if (selectedAgency) setSelectedAgency('')
      return
    }
    if (!selectedAgency || !agencyNames.includes(selectedAgency)) {
      setSelectedAgency(agencyNames[0])
    }
  }, [agencyKey, cityFilter, selectedAgency])
  const activeAgency = agencySections.find(section => section.city === selectedAgency) || agencySections[0] || null

  const totalDeposited = deposits.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const totalWaiting = supplierGroups.reduce((s, g) => s + g.total, 0)
  const preparedPayments = payments.filter(p => paymentStatus(p) !== 'paid')
  const paidPayments = payments.filter(p => paymentStatus(p) === 'paid')
  const totalPaid = paidPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const totalPrepared = preparedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const unpaidCount = depositedParcels.filter(p => !isParcelPaid(p) && !isParcelPrepared(p)).length
  const clearFilters = () => {
    setQuery('')
    setCityFilter('all')
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
    setPaymentFilter('unpaid')
    setMinAmount('')
    setMaxAmount('')
  }

  const openPayment = (group: any) => setModal({
    group,
    chequeNum: '',
    bankName: '',
    chequeDate: new Date().toISOString().split('T')[0],
    note: '',
    loading: false,
    error: '',
  })

  const submitPayment = async () => {
    if (!modal?.group) return
    setModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await createCentralSupplierPayment({
        parcelIds: modal.group.parcels.map((p: any) => p.id),
        parcels: modal.group.parcels,
        amount: modal.group.total,
        senderName: modal.group.senderName,
        senderTel: modal.group.senderTel,
        chequeNum: modal.chequeNum.trim(),
        bankName: modal.bankName.trim(),
        chequeDate: modal.chequeDate,
        preparedBy: profile?.name || 'Encaisseur central',
        preparedById: auth.currentUser?.uid,
        note: modal.note.trim(),
      })
      setModal(null)
    } catch (err: any) {
      setModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors de la preparation du cheque.' }))
    }
  }

  const confirmPaymentPaid = async (pay: any) => {
    if (!pay?.id) return
    if (!window.confirm(`Marquer le cheque ${pay.chequeNum || ''} comme paye ?\nLes colis seront alors affiches payes dans la plateforme.`)) return
    setPayingId(pay.id)
    try {
      await markCentralSupplierPaymentPaid(
        pay.id,
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid,
      )
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la validation du paiement.')
    } finally {
      setPayingId('')
    }
  }

  const handleEditPayment = async () => {
    if (!editPaymentModal) return
    try {
      await updateCentralSupplierPayment(editPaymentModal.id, {
        amount: editPaymentModal.amount,
        senderName: editPaymentModal.senderName,
        senderTel: editPaymentModal.senderTel,
        chequeNum: editPaymentModal.chequeNum,
        bankName: editPaymentModal.bankName,
        chequeDate: editPaymentModal.chequeDate,
        note: editPaymentModal.note,
        updatedBy: profile?.name || 'Encaisseur central',
        updatedById: auth.currentUser?.uid,
      })
      setEditPaymentModal(null)
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la modification.')
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!paymentId) return
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?\nCette action ne peut pas être annulée.')) return
    setDeletePaymentId(paymentId)
    try {
      await deleteCentralSupplierPayment(
        paymentId,
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid,
      )
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la suppression.')
    } finally {
      setDeletePaymentId('')
    }
  }

  const handleEditDeposit = async () => {
    if (!editDepositModal) return
    try {
      await updateCentralCodDeposit(editDepositModal.id, {
        amount: editDepositModal.amount,
        agentName: editDepositModal.agentName,
        note: editDepositModal.note,
        updatedBy: profile?.name || 'Encaisseur central',
        updatedById: auth.currentUser?.uid,
      })
      setEditDepositModal(null)
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la modification du versement.')
    }
  }

  const handleDeleteDeposit = async (depositId: string) => {
    if (!depositId) return
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce versement ?\nCette action ne peut pas être annulée.')) return
    setDeleteDepositId(depositId)
    try {
      await deleteCentralCodDeposit(
        depositId,
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid,
      )
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la suppression du versement.')
    } finally {
      setDeleteDepositId('')
    }
  }

  const handleResetAllBalances = async () => {
    setResettingBalances(true)
    try {
      const result = await resetAllAgencyCashBalances(
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid || ''
      )
      alert(result.message)
    } catch (err: any) {
      if (err?.message !== 'Opération annulée.') {
        alert(err?.message || 'Erreur lors de la réinitialisation des soldes.')
      }
    } finally {
      setResettingBalances(false)
    }
  }

  const handleDeleteAllDeposits = async () => {
    setDeletingAllDeposits(true)
    try {
      const result = await deleteAllCentralCodDeposits(
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid || ''
      )
      alert(result.message)
    } catch (err: any) {
      if (err?.message !== 'Opération annulée.') {
        alert(err?.message || 'Erreur lors de la suppression des versements.')
      }
    } finally {
      setDeletingAllDeposits(false)
    }
  }

  const handleDeleteAllPayments = async () => {
    setDeletingAllPayments(true)
    try {
      const result = await deleteAllCentralSupplierPayments(
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid || ''
      )
      alert(result.message)
    } catch (err: any) {
      if (err?.message !== 'Opération annulée.') {
        alert(err?.message || 'Erreur lors de la suppression des paiements.')
      }
    } finally {
      setDeletingAllPayments(false)
    }
  }

  const printControle = () => {
    // Imprimer les colis sélectionnés ou tous les colis filtrés
    const toPrint = ctlSelected.size > 0
      ? ctlFiltered.filter((p: any) => ctlSelected.has(p.id))
      : ctlFiltered

    if (toPrint.length === 0) {
      alert('Aucun colis à imprimer.')
      return
    }

    const totalAmount = toPrint.reduce((sum: number, p: any) => sum + (parseFloat(p.codAmount) || 0), 0)
    const controlledCount = toPrint.filter((p: any) => isControlled(p)).length

    // Déterminer la période affichée
    let periodeText = 'Toutes les périodes'
    if (ctlDatePreset === 'today') periodeText = "Aujourd'hui"
    else if (ctlDatePreset === 'week') periodeText = '7 derniers jours'
    else if (ctlDatePreset === 'month') periodeText = 'Ce mois'
    else if (ctlDatePreset === 'custom' && ctlDateFrom && ctlDateTo) {
      periodeText = `Du ${new Date(ctlDateFrom).toLocaleDateString('fr-MA')} au ${new Date(ctlDateTo).toLocaleDateString('fr-MA')}`
    } else if (ctlDatePreset === 'custom' && ctlDateFrom) {
      periodeText = `Depuis le ${new Date(ctlDateFrom).toLocaleDateString('fr-MA')}`
    } else if (ctlDatePreset === 'custom' && ctlDateTo) {
      periodeText = `Jusqu'au ${new Date(ctlDateTo).toLocaleDateString('fr-MA')}`
    }

    // Déterminer la ville concernée
    const villeText = ctlCity === 'all' ? 'Toutes les villes' : ctlCity

    const rows = toPrint.map((p: any) => `
      <tr>
        <td>${p.sender?.nic || p.senderNic || '-'}</td>
        <td>${p.sender?.name || p.senderName || '-'}</td>
        <td>${p.receiver?.name || p.receiverName || '-'}</td>
        <td>${p.receiver?.tel || p.receiverTel || '-'}</td>
        <td>${parcelCity(p)}</td>
        <td>${p.codPaymentType ? COD_PAYMENT_TYPES[p.codPaymentType] || p.codPaymentType : '-'}</td>
        <td style="text-align:right;font-weight:bold">${money(p.codAmount)} DH</td>
        <td style="text-align:center">${isControlled(p) ? '✓' : ''}</td>
      </tr>
    `).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rapport Contrôle & Pointage - ${villeText}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:22px;font-size:11px}
        h1{font-size:20px;margin:0 0 4px;color:#7c3aed}
        h2{font-size:16px;margin:0 0 8px;color:#6b7280;font-weight:normal}
        .info{background:#f3f4f6;padding:12px;border-radius:8px;margin:12px 0}
        .info p{margin:4px 0;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:14px}
        th{background:#7c3aed;color:white;text-align:left;padding:8px;font-size:11px}
        td{border-bottom:1px solid #e5e7eb;padding:7px;font-size:11px}
        .total{background:#f9fafb;padding:12px;margin-top:14px;border-radius:8px}
        .total p{margin:4px 0;font-weight:bold}
        .footer{margin-top:20px;padding-top:12px;border-top:2px solid #e5e7eb;text-align:center;color:#6b7280;font-size:10px}
      </style>
    </head><body>
      <h1>📋 Rapport Contrôle & Pointage - ${villeText}</h1>
      <h2>Période: ${periodeText}</h2>
      <div class="info">
        <p><strong>Encaisseur Central:</strong> ${profile?.name || 'Encaisseur central'}</p>
        <p><strong>Date d'impression:</strong> ${new Date().toLocaleDateString('fr-MA')} - ${new Date().toLocaleTimeString('fr-MA')}</p>
        <p><strong>Type de rapport:</strong> ${ctlSelected.size > 0 ? 'Colis sélectionnés' : 'Tous les colis filtrés'}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>N° EXP (NIC)</th>
            <th>Expéditeur</th>
            <th>Destinataire</th>
            <th>Téléphone</th>
            <th>Ville</th>
            <th>Type Paiement</th>
            <th>Montant</th>
            <th>Contrôlé</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">
        <p>Total colis: ${toPrint.length}</p>
        <p>Total montant: ${money(totalAmount)} DH</p>
        <p>Contrôlés: ${controlledCount} / ${toPrint.length} (${Math.round((controlledCount / toPrint.length) * 100)}%)</p>
        <p>Non contrôlés: ${toPrint.length - controlledCount}</p>
      </div>
      <div class="footer">
        <p>Document généré par le système de gestion - Encaisseur Central</p>
      </div>
    </body></html>`

    const w: any = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const exportToExcel = () => {
    // Exporter les colis sélectionnés ou tous les colis filtrés
    const toExport = ctlSelected.size > 0
      ? ctlFiltered.filter((p: any) => ctlSelected.has(p.id))
      : ctlFiltered

    if (toExport.length === 0) {
      alert('Aucun colis à exporter.')
      return
    }

    // Déterminer la période
    let periodeText = 'Toutes les périodes'
    if (ctlDatePreset === 'today') periodeText = "Aujourd'hui"
    else if (ctlDatePreset === 'week') periodeText = '7 derniers jours'
    else if (ctlDatePreset === 'month') periodeText = 'Ce mois'
    else if (ctlDatePreset === 'custom' && ctlDateFrom && ctlDateTo) {
      periodeText = `Du ${new Date(ctlDateFrom).toLocaleDateString('fr-MA')} au ${new Date(ctlDateTo).toLocaleDateString('fr-MA')}`
    }

    const villeText = ctlCity === 'all' ? 'Toutes les villes' : ctlCity

    // Préparer les données pour Excel
    const data = toExport.map((p: any) => ({
      'N° EXP (NIC)': p.sender?.nic || p.senderNic || '-',
      'Expéditeur': p.sender?.name || p.senderName || '-',
      'Destinataire': p.receiver?.name || p.receiverName || '-',
      'Téléphone': p.receiver?.tel || p.receiverTel || '-',
      'Ville': parcelCity(p),
      'Type Paiement': p.codPaymentType ? (COD_PAYMENT_TYPES.find((t: any) => t.key === p.codPaymentType)?.label || p.codPaymentType) : '-',
      'Montant (DH)': parseFloat(p.codAmount) || 0,
      'Contrôlé': isControlled(p) ? 'Oui' : 'Non',
      'Contrôlé par': isControlled(p) ? p.controlledBy || '-' : '-',
      'Date contrôle': isControlled(p) && p.controlledAt ? new Date(p.controlledAt).toLocaleDateString('fr-MA') : '-',
    }))

    // Calculer les totaux
    const totalAmount = toExport.reduce((sum: number, p: any) => sum + (parseFloat(p.codAmount) || 0), 0)
    const controlledCount = toExport.filter((p: any) => isControlled(p)).length

    // Créer le workbook et worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    // Ajouter des lignes d'en-tête avant les données
    XLSX.utils.sheet_add_aoa(ws, [
      [`Rapport Contrôle & Pointage - ${villeText}`],
      [`Période: ${periodeText}`],
      [`Encaisseur: ${profile?.name || 'Encaisseur central'}`],
      [`Date d'export: ${new Date().toLocaleDateString('fr-MA')} - ${new Date().toLocaleTimeString('fr-MA')}`],
      [], // Ligne vide
    ], { origin: 'A1' })

    // Ajouter les totaux à la fin
    const lastRow = data.length + 6 // 5 lignes d'en-tête + 1 ligne de titres de colonnes + données
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['TOTAUX'],
      [`Total colis: ${toExport.length}`],
      [`Total montant: ${money(totalAmount)} DH`],
      [`Contrôlés: ${controlledCount} / ${toExport.length} (${Math.round((controlledCount / toExport.length) * 100)}%)`],
      [`Non contrôlés: ${toExport.length - controlledCount}`],
    ], { origin: `A${lastRow}` })

    // Ajuster la largeur des colonnes
    const colWidths = [
      { wch: 15 }, // N° EXP
      { wch: 25 }, // Expéditeur
      { wch: 25 }, // Destinataire
      { wch: 15 }, // Téléphone
      { wch: 15 }, // Ville
      { wch: 18 }, // Type Paiement
      { wch: 12 }, // Montant
      { wch: 10 }, // Contrôlé
      { wch: 20 }, // Contrôlé par
      { wch: 15 }, // Date contrôle
    ]
    ws['!cols'] = colWidths

    // Ajouter le worksheet au workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Contrôle & Pointage')

    // Générer le nom du fichier
    const fileName = `Controle_Pointage_${villeText.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`

    // Télécharger le fichier
    XLSX.writeFile(wb, fileName)
  }

  const printGroup = (group: any) => {
    const rows = group.parcels.map((p: any) => `
      <tr>
        <td>${p.trackingId || '-'}</td>
        <td>${p.receiver?.name || '-'}</td>
        <td>${p.receiver?.tel || '-'}</td>
        <td>${p.originCity || p.sender?.city || '-'}</td>
        <td>${p.destinationCity || p.receiver?.city || '-'}</td>
        <td style="text-align:right;font-weight:bold">${money(p.codAmount)} DH</td>
      </tr>
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cheque ${group.senderName}</title>
      <style>body{font-family:Arial,sans-serif;margin:22px;font-size:12px}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#047857;color:white;text-align:left;padding:7px}td{border-bottom:1px solid #e5e7eb;padding:6px}.total{text-align:right;font-size:16px;font-weight:bold;margin-top:14px}</style>
    </head><body><h1>Etat remboursement fournisseur</h1><p>${group.senderName} ${group.senderTel ? '- ' + group.senderTel : ''}</p><p>Agence fournisseur: ${(group.supplierAgencies || []).join(', ') || '-'}</p>
    <table><thead><tr><th>Tracking</th><th>Client</th><th>Tel</th><th>Origine</th><th>Destination</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">Total cheque: ${money(group.total)} DH</p></body></html>`
    const w: any = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-pink-50 text-slate-900">
      {/* Header magnifique */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-pink-100/50 px-6 py-5 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          {/* Photo de profil avec effet brillant */}
          {auth.currentUser?.uid && (
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-pink-400 via-purple-400 to-rose-400 rounded-full opacity-30 blur animate-pulse" />
              <div className="relative">
                <ProfilePhotoUpload
                  userId={auth.currentUser.uid}
                  currentPhotoURL={profile?.photoURL}
                  userName={profile?.name || profile?.email}
                  size="md"
                  editable={true}
                />
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black bg-gradient-to-r from-pink-600 via-purple-600 to-rose-600 bg-clip-text text-transparent">
                Encaisseur Central
              </h1>
              <Sparkles className="w-5 h-5 text-pink-500 animate-pulse" />
            </div>
            <p className="text-sm text-purple-600/70 font-medium mt-0.5">
              Versements agences • RETOUR FOND • Chèques fournisseurs
            </p>
            {profile?.name && (
              <p className="text-sm text-rose-600 font-semibold mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                {profile.name}
              </p>
            )}
          </div>
          <button
            onClick={() => signOut(auth)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600 text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Onglets */}
        <div className="flex gap-2 bg-white/70 backdrop-blur-xl rounded-2xl border border-pink-100/50 p-1.5 shadow-sm w-fit">
          <button
            onClick={() => setActiveTab('controle')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all duration-300 ${
              activeTab === 'controle'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : 'text-purple-600 hover:bg-purple-50'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" /> Contrôle & Pointage
          </button>
          <button
            onClick={() => setActiveTab('fournisseurs')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all duration-300 ${
              activeTab === 'fournisseurs'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : 'text-purple-600 hover:bg-purple-50'
            }`}
          >
            <Wallet className="w-4 h-4" /> Fournisseurs & Versements
          </button>
          <button
            onClick={() => setActiveTab('archives')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all duration-300 ${
              activeTab === 'archives'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : 'text-purple-600 hover:bg-purple-50'
            }`}
          >
            <Archive className="w-4 h-4" /> Archives
          </button>
        </div>

        {activeTab === 'controle' && (
          <>
            {/* Bandeau chargement progressif */}
            <section className="bg-white/70 backdrop-blur-xl rounded-3xl border border-indigo-100/60 p-4 shadow-lg">
              <div className="flex flex-wrap items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-lg">
                  <Database className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-52">
                  <p className="text-sm font-black text-slate-800">
                    {parcels.length.toLocaleString('fr-MA')} colis chargés · {codParcels.length.toLocaleString('fr-MA')} contre-espèces détectées
                  </p>
                  <p className="text-xs text-slate-500">
                    {loadingAll
                      ? `⏳ Chargement complet en cours... +${loadAllProgress.toLocaleString('fr-MA')} colis récupérés`
                      : hasMore
                        ? 'Historique plus ancien disponible — chargez par tranches de 800 ou toute la base.'
                        : '✓ Toute la base est chargée'}
                  </p>
                </div>
                {hasMore && (
                  <div className="flex gap-2">
                    <button
                      onClick={loadMoreParcels}
                      disabled={loadingMore || loadingAll}
                      className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition shadow-lg flex items-center gap-2"
                    >
                      {loadingMore ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                      ) : (
                        <>↓ Charger 800 de plus</>
                      )}
                    </button>
                    <button
                      onClick={loadAllParcels}
                      disabled={loadingMore || loadingAll}
                      className="px-4 py-2.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 border-2 border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition flex items-center gap-2"
                    >
                      {loadingAll ? (
                        <><span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> {loadAllProgress.toLocaleString('fr-MA')}...</>
                      ) : (
                        <>⚡ Tout charger</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ⚠️ Avertissement filtre de date actif */}
            {ctlDatePreset !== 'all' && hasMore && !loadingAll && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-300 p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-400 text-white flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-amber-900 mb-1">⚠️ Filtre de date actif - Résultats partiels</h3>
                    <p className="text-sm text-amber-800">
                      Vous avez activé un filtre de date, mais <strong>toute la base n'est pas encore chargée</strong>.
                      Les résultats affichés ne concernent que les <strong>{parcels.length.toLocaleString('fr-MA')} colis chargés</strong>.
                    </p>
                    <p className="text-sm text-amber-800 mt-2">
                      Le chargement complet est en cours automatiquement. Vous pouvez aussi cliquer sur <strong>"⚡ Tout charger"</strong> ci-dessus
                      pour accélérer le processus et obtenir tous les résultats pour votre filtre de date.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* KPIs contrôle */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600/70">Contre-espèces (filtré)</p>
                  <div className="p-2 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 text-white shadow-lg"><Package className="w-5 h-5" /></div>
                </div>
                <p className="text-3xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{ctlKpis.total.toLocaleString('fr-MA')}</p>
                <p className="text-sm font-semibold text-slate-600 mt-1">{money(ctlKpis.totalAmount)} DH</p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600/70">Contrôlés ✓</p>
                  <div className="p-2 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg"><CheckCircle2 className="w-5 h-5" /></div>
                </div>
                <p className="text-3xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{ctlKpis.controlledCount.toLocaleString('fr-MA')}</p>
                <p className="text-sm font-semibold text-slate-600 mt-1">{money(ctlKpis.controlledAmount)} DH</p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600/70">Non contrôlés</p>
                  <div className="p-2 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg"><ClipboardCheck className="w-5 h-5" /></div>
                </div>
                <p className="text-3xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{ctlKpis.uncontrolledCount.toLocaleString('fr-MA')}</p>
                <p className="text-sm font-semibold text-slate-600 mt-1">{money(ctlKpis.uncontrolledAmount)} DH</p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600/70">Taux de contrôle</p>
                  <div className="p-2 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-lg"><TrendingUp className="w-5 h-5" /></div>
                </div>
                <p className="text-3xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{ctlKpis.pct}%</p>
                <div className="mt-2 h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" style={{ width: `${ctlKpis.pct}%` }} />
                </div>
              </div>
            </section>

            {/* Répartition par type de paiement — cliquable */}
            <section className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: '🌟 Tous types', count: ctlKpis.total, amount: ctlKpis.totalAmount },
                ...COD_PAYMENT_TYPES.map((t: any) => ({
                  key: t.key,
                  label: `${t.emoji} ${t.label}`,
                  count: ctlKpis.byType[t.key]?.count || 0,
                  amount: ctlKpis.byType[t.key]?.amount || 0,
                })),
                { key: 'none', label: '❔ Non défini', count: ctlKpis.byType.none?.count || 0, amount: ctlKpis.byType.none?.amount || 0 },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setCtlPayType(t.key)}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all duration-300 ${
                    ctlPayType === t.key
                      ? 'bg-purple-600 border-purple-600 text-white shadow-lg'
                      : 'bg-white/70 border-purple-100 text-slate-600 hover:border-purple-300'
                  }`}
                >
                  {t.label} · {t.count.toLocaleString('fr-MA')} · {money(t.amount)} DH
                </button>
              ))}
            </section>

            {/* Filtres contrôle */}
            <section className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 space-y-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 text-white">
                  <Filter className="w-4 h-4" />
                </div>
                <p className="text-base font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Filtres intelligents</p>
                <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">{ctlFiltered.length.toLocaleString('fr-MA')} résultats</span>
                <button onClick={clearCtlFilters} className="ml-auto text-xs font-bold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-full hover:bg-rose-50 transition-all duration-300">
                  Réinitialiser
                </button>
              </div>

              <div className="grid md:grid-cols-[1.5fr_auto] gap-3">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 group-focus-within:text-pink-500 transition-colors" />
                  <input
                    value={ctlQuery}
                    onChange={e => setCtlQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') runDeepSearch() }}
                    placeholder="N° EXP, tracking, nom expéditeur/client, téléphone, ville..."
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm focus:outline-none text-sm font-medium placeholder:text-purple-300 transition-all duration-300"
                  />
                </div>
                <button
                  onClick={runDeepSearch}
                  disabled={deepSearching || ctlQuery.trim().length < 3}
                  className="px-4 py-3 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-40 transition shadow-lg flex items-center gap-2"
                  title="Recherche par index dans TOUTE la base (N° EXP exact, tracking, téléphone, nom exact)"
                >
                  {deepSearching ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Recherche...</>
                  ) : (
                    <><Database className="w-3.5 h-3.5" /> Chercher toute la base</>
                  )}
                </button>
                <button
                  onClick={printControle}
                  className="px-4 py-3 rounded-2xl text-xs font-black text-emerald-700 bg-emerald-50 border-2 border-emerald-200 hover:bg-emerald-100 transition shadow-lg flex items-center gap-2"
                  title={ctlSelected.size > 0 ? `Imprimer ${ctlSelected.size} colis sélectionnés` : `Imprimer tous les colis filtrés (${ctlFiltered.length})`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  {ctlSelected.size > 0 ? `Imprimer (${ctlSelected.size})` : 'Imprimer tout'}
                </button>
                <button
                  onClick={exportToExcel}
                  className="px-4 py-3 rounded-2xl text-xs font-black text-green-700 bg-green-50 border-2 border-green-200 hover:bg-green-100 transition shadow-lg flex items-center gap-2"
                  title={ctlSelected.size > 0 ? `Exporter ${ctlSelected.size} colis en Excel` : `Exporter tous les colis filtrés (${ctlFiltered.length}) en Excel`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {ctlSelected.size > 0 ? `Excel (${ctlSelected.size})` : 'Excel tout'}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <select value={ctlCity} onChange={e => setCtlCity(e.target.value)} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                  <option value="all">📍 Toutes les villes</option>
                  {ctlCities.map(c => <option key={c} value={c}>📍 {c}</option>)}
                </select>
                <select value={ctlPayType} onChange={e => setCtlPayType(e.target.value)} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                  <option value="all">💳 Tous types paiement</option>
                  {COD_PAYMENT_TYPES.map((t: any) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
                  <option value="none">❔ Non défini</option>
                </select>
                <select value={ctlCodStatus} onChange={e => setCtlCodStatus(e.target.value)} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                  <option value="all">💰 Tous statuts COD</option>
                  <option value="pending">⏳ En attente</option>
                  <option value="collected">📥 Collecté</option>
                  <option value="remis">✅ Remis agence</option>
                </select>
                <select value={ctlControl} onChange={e => setCtlControl(e.target.value)} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                  <option value="all">🔎 Contrôle : tous</option>
                  <option value="uncontrolled">🔲 Non contrôlés</option>
                  <option value="controlled">✅ Contrôlés</option>
                </select>
                <select value={ctlParcelStatus} onChange={e => setCtlParcelStatus(e.target.value)} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                  <option value="all">📦 Tous statuts colis</option>
                  {STATUSES.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="relative group">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <select value={ctlDatePreset} onChange={e => setCtlDatePreset(e.target.value)} className="w-full pl-9 pr-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-semibold text-purple-700 cursor-pointer transition-all duration-300">
                    <option value="all">🗓️ Toutes les dates</option>
                    <option value="today">📅 Aujourd'hui</option>
                    <option value="week">📆 7 jours</option>
                    <option value="month">🌙 Ce mois</option>
                    <option value="custom">🎯 Personnalisé</option>
                  </select>
                </div>
                <input type="date" value={ctlDateFrom} onChange={e => { setCtlDateFrom(e.target.value); setCtlDatePreset('custom') }} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-medium transition-all duration-300" />
                <input type="date" value={ctlDateTo} onChange={e => { setCtlDateTo(e.target.value); setCtlDatePreset('custom') }} className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-medium transition-all duration-300" />
                <input type="number" min="0" value={ctlMinAmount} onChange={e => setCtlMinAmount(e.target.value)} placeholder="Min DH" className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-medium placeholder:text-purple-300 transition-all duration-300" />
                <input type="number" min="0" value={ctlMaxAmount} onChange={e => setCtlMaxAmount(e.target.value)} placeholder="Max DH" className="px-3 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 text-sm font-medium placeholder:text-purple-300 transition-all duration-300" />
              </div>
            </section>

            {/* Vue par ville — pointage ville par ville */}
            <section className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-400 text-white">
                  <MapPin className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Contrôle ville par ville</h2>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{ctlCityStats.length} villes</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                <button
                  onClick={() => setCtlCity('all')}
                  className={`text-left rounded-xl border-2 px-3 py-3 transition ${
                    ctlCity === 'all'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <p className="font-black">✨ Toutes les villes</p>
                  <p className={`text-[11px] font-bold mt-1 ${ctlCity === 'all' ? 'text-blue-100' : 'text-slate-500'}`}>
                    {ctlFilteredAllCities.length.toLocaleString('fr-MA')} colis
                  </p>
                </button>
                {ctlCityStats.map((s: any) => {
                  const isActive = ctlCity === s.city
                  const pct = s.count ? Math.round((s.controlled / s.count) * 100) : 0
                  return (
                    <button
                      key={s.city}
                      onClick={() => setCtlCity(isActive ? 'all' : s.city)}
                      className={`text-left rounded-xl border-2 px-3 py-3 transition ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black truncate">{s.city}</p>
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${isActive ? 'bg-white/20 text-white' : pct === 100 ? 'bg-green-100 text-green-700' : 'bg-white text-slate-500 border border-slate-200'}`}>
                          {s.controlled}/{s.count}
                        </span>
                      </div>
                      <div className={`mt-1.5 text-[11px] font-bold ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                        {money(s.amount)} DH · {pct}% contrôlé
                      </div>
                      <div className={`mt-1.5 h-1.5 rounded-full overflow-hidden ${isActive ? 'bg-white/20' : 'bg-slate-200'}`}>
                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Barre d'actions sélection */}
            {ctlSelected.size > 0 && (
              <section className="sticky top-24 z-10 bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center gap-3">
                <p className="text-sm font-black">{ctlSelected.size.toLocaleString('fr-MA')} colis sélectionné{ctlSelected.size > 1 ? 's' : ''}</p>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    onClick={() => applyControl([...ctlSelected], true)}
                    disabled={pointing}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 transition"
                  >
                    {pointing ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Pointer contrôlé
                  </button>
                  <button
                    onClick={() => applyControl([...ctlSelected], false)}
                    disabled={pointing}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black transition"
                  >
                    Annuler contrôle
                  </button>
                  <button
                    onClick={() => setCtlSelected(new Set())}
                    disabled={pointing}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black transition"
                  >
                    Vider
                  </button>
                </div>
              </section>
            )}

            {/* Tableau des contre-espèces */}
            <section className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-purple-600" />
                <h3 className="font-black text-slate-800">Contre-espèces — toutes agences</h3>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                  {ctlDisplayed.length.toLocaleString('fr-MA')} affichés / {ctlFiltered.length.toLocaleString('fr-MA')} filtrés
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allDisplayedSelected}
                          onChange={toggleSelectAllDisplayed}
                          className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
                          title="Sélectionner tous les colis affichés"
                        />
                      </th>
                      <th className="px-3 py-3">Colis</th>
                      <th className="px-3 py-3">Expéditeur</th>
                      <th className="px-3 py-3">Destinataire</th>
                      <th className="px-3 py-3 text-right">Montant</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">COD</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3">Contrôle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ctlDisplayed.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">
                          Aucune contre-espèce ne correspond aux filtres.
                          {hasMore && ' Essayez de charger plus de colis ou la recherche "toute la base".'}
                        </td>
                      </tr>
                    )}
                    {ctlDisplayed.map((p: any) => {
                      const controlled = isControlled(p)
                      const selected = ctlSelected.has(p.id)
                      return (
                        <tr key={p.id} className={`transition ${controlled ? 'bg-emerald-50/60' : selected ? 'bg-purple-50/60' : 'hover:bg-slate-50'}`}>
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelect(p.id)}
                              className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-mono text-xs font-bold text-blue-700">{p.trackingId || '-'}</p>
                            <p className="text-[11px] text-slate-500">
                              {(p.senderNic || p.sender?.nic) ? `N° EXP ${p.senderNic || p.sender?.nic} · ` : ''}{fmtDate(p.createdAt)}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-slate-800 truncate max-w-36">{p.sender?.name || p.senderName || '-'}</p>
                            <p className="text-[11px] text-slate-500">{p.originCity || p.sender?.city || '-'}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-slate-800 truncate max-w-36">{p.receiver?.name || p.receiverName || '-'}</p>
                            <p className="text-[11px] text-slate-500">{parcelCity(p)}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right font-black text-emerald-700 whitespace-nowrap">{money(p.codAmount)} DH</td>
                          <td className="px-3 py-2.5">{payTypeBadge(p)}</td>
                          <td className="px-3 py-2.5">{codStatusBadge(p)}</td>
                          <td className="px-3 py-2.5">{statusBadge(p)}</td>
                          <td className="px-3 py-2.5">
                            {controlled ? (
                              <div className="flex items-center gap-2">
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-green-100 text-green-700">
                                    <CheckCircle2 className="w-3 h-3" /> Contrôlé
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{p.controlledBy || ''} {p.controlledAt ? `· ${fmtDate(p.controlledAt)}` : ''}</p>
                                </div>
                                <button
                                  onClick={() => applyControl([p.id], false)}
                                  disabled={pointing}
                                  className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 disabled:opacity-50 transition"
                                  title="Annuler le contrôle"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => applyControl([p.id], true)}
                                disabled={pointing}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[11px] font-black transition"
                              >
                                Pointer
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {ctlFiltered.length > ctlDisplayLimit && (
                <div className="p-4 border-t border-slate-100 text-center">
                  <button
                    onClick={() => setCtlDisplayLimit(l => l + 200)}
                    className="px-6 py-2.5 rounded-xl text-sm font-black text-purple-700 bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 transition"
                  >
                    Afficher 200 de plus ({(ctlFiltered.length - ctlDisplayLimit).toLocaleString('fr-MA')} restants)
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'fournisseurs' && (
        <>
        {/* Bandeau actions globales - Réinitialisation */}
        <section className="bg-gradient-to-r from-red-50 via-orange-50 to-rose-50 rounded-3xl border-2 border-red-200 p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-red-900 text-lg">Réinitialisation globale</h3>
              <p className="text-sm text-red-700">Actions de suppression massive - Utilisez avec précaution</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Bouton 1: Réinitialiser soldes */}
            <div className="bg-white rounded-2xl border-2 border-red-300 p-4 hover:shadow-xl transition-all">
              <div className="flex items-center gap-2 mb-2">
                <X className="w-5 h-5 text-red-600" />
                <h4 className="font-black text-red-900">Soldes de caisse</h4>
              </div>
              <p className="text-xs text-red-700 mb-3">Remet toutes les soldes à 0 DH</p>
              <button
                onClick={handleResetAllBalances}
                disabled={resettingBalances}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-50 text-white font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {resettingBalances ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    En cours...
                  </>
                ) : (
                  <>Réinitialiser</>
                )}
              </button>
            </div>

            {/* Bouton 2: Supprimer versements */}
            <div className="bg-white rounded-2xl border-2 border-orange-300 p-4 hover:shadow-xl transition-all">
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="w-5 h-5 text-orange-600" />
                <h4 className="font-black text-orange-900">Versements</h4>
              </div>
              <p className="text-xs text-orange-700 mb-3">Supprime tous les versements</p>
              <button
                onClick={handleDeleteAllDeposits}
                disabled={deletingAllDeposits}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 text-white font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {deletingAllDeposits ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    En cours...
                  </>
                ) : (
                  <>Supprimer tout</>
                )}
              </button>
            </div>

            {/* Bouton 3: Supprimer TOUS les chèques */}
            <div className="bg-white rounded-2xl border-2 border-purple-300 p-4 hover:shadow-xl transition-all">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h4 className="font-black text-purple-900">Tous les chèques</h4>
              </div>
              <p className="text-xs text-purple-700 mb-3">Supprime TOUS les chèques (payés et non payés)</p>
              <button
                onClick={handleDeleteAllPayments}
                disabled={deletingAllPayments}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {deletingAllPayments ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    En cours...
                  </>
                ) : (
                  <>Supprimer tout</>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Cartes statistiques magnifiques */}
        <section className="grid md:grid-cols-3 gap-4">
          {[
            {
              label: 'Versé au compte société',
              total: totalDeposited,
              count: deposits.length,
              gradient: 'from-emerald-400 to-teal-500',
              bgGradient: 'from-emerald-50 to-teal-50',
              icon: <TrendingUp className="w-6 h-6" />
            },
            {
              label: 'À payer fournisseurs',
              total: totalWaiting,
              count: unpaidCount,
              gradient: 'from-amber-400 to-orange-500',
              bgGradient: 'from-amber-50 to-orange-50',
              icon: <Wallet className="w-6 h-6" />
            },
            {
              label: 'Chèques préparés',
              total: totalPrepared,
              count: preparedPayments.length,
              gradient: 'from-blue-400 to-indigo-500',
              bgGradient: 'from-blue-50 to-indigo-50',
              icon: <CheckCircle2 className="w-6 h-6" />
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`relative rounded-3xl bg-gradient-to-br ${stat.bgGradient} p-6 overflow-hidden group hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1`}
            >
              {/* Effet de brillance */}
              <div className={`absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br ${stat.gradient} rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-500`} />
              <div className={`absolute -left-4 -bottom-4 w-24 h-24 bg-gradient-to-tr ${stat.gradient} rounded-full opacity-5 group-hover:opacity-15 transition-opacity duration-500`} />

              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600/70">
                    {stat.label}
                  </p>
                  <div className={`p-2 rounded-2xl bg-gradient-to-br ${stat.gradient} text-white shadow-lg`}>
                    {stat.icon}
                  </div>
                </div>
                <p className={`text-4xl font-black bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-2`}>
                  {money(stat.total)} DH
                </p>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${stat.gradient}`} />
                  <p className="text-sm font-semibold text-slate-600">
                    {stat.count} opération{stat.count > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Section filtres élégante */}
        <section className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 text-white">
              <Filter className="w-4 h-4" />
            </div>
            <p className="text-base font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Filtres
            </p>
            <button
              onClick={clearFilters}
              className="ml-auto text-xs font-bold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-full hover:bg-rose-50 transition-all duration-300"
            >
              Réinitialiser
            </button>
          </div>

          <div className="grid md:grid-cols-[1.3fr_0.8fr_0.8fr] gap-3">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 group-focus-within:text-pink-500 transition-colors" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher tracking, fournisseur, client, agence..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm focus:outline-none text-sm font-medium placeholder:text-purple-300 transition-all duration-300"
              />
            </div>
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-semibold text-purple-700 cursor-pointer hover:bg-white/70 transition-all duration-300"
            >
              <option value="all">✨ Toutes les agences</option>
              {cities.map(city => <option key={city} value={city}>📍 {city}</option>)}
            </select>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-semibold text-purple-700 cursor-pointer hover:bg-white/70 transition-all duration-300"
            >
              <option value="unpaid">💰 À payer</option>
              <option value="prepared">📝 Chèques préparés</option>
              <option value="paid">✅ Payés</option>
              <option value="all">🌟 Tous statuts</option>
            </select>
          </div>

          <div className="grid md:grid-cols-[1fr_0.65fr_0.65fr_0.55fr_0.55fr] gap-3">
            <div className="relative group">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 group-focus-within:text-pink-500 transition-colors" />
              <select
                value={datePreset}
                onChange={e => setDatePreset(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-semibold text-purple-700 cursor-pointer hover:bg-white/70 transition-all duration-300"
              >
                <option value="all">🗓️ Toutes les dates</option>
                <option value="today">📅 Aujourd'hui</option>
                <option value="week">📆 7 jours</option>
                <option value="month">🌙 Ce mois</option>
                <option value="custom">🎯 Personnalisé</option>
              </select>
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setDatePreset('custom') }}
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-medium transition-all duration-300"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setDatePreset('custom') }}
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-medium transition-all duration-300"
            />
            <input
              type="number"
              min="0"
              value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              placeholder="Min DH"
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-medium placeholder:text-purple-300 transition-all duration-300"
            />
            <input
              type="number"
              min="0"
              value={maxAmount}
              onChange={e => setMaxAmount(e.target.value)}
              placeholder="Max DH"
              className="px-4 py-3 rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-white/50 backdrop-blur-sm text-sm font-medium placeholder:text-purple-300 transition-all duration-300"
            />
          </div>
        </section>

        <section className="space-y-5">
          {agencySections.length === 0 && (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-16 text-center shadow-lg">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 mb-4">
                <Sparkles className="w-10 h-10 text-purple-400" />
              </div>
              <p className="text-purple-400 text-sm font-medium">
                Aucune opération ne correspond aux filtres
              </p>
            </div>
          )}

          {agencySections.length > 0 && (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-pink-100/50 p-5 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-400 text-white">
                  <Building2 className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Agences
                </h2>
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 text-xs font-bold">
                  {agencySections.length}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {agencySections.map(section => {
                  const isActive = activeAgency?.city === section.city
                  return (
                    <button
                      key={section.city}
                      type="button"
                      onClick={() => setSelectedAgency(section.city)}
                      className={`text-left rounded-xl border px-3 py-3 transition ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black truncate">{section.city}</p>
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                          {section.parcelCount}
                        </span>
                      </div>
                      <div className={`mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold ${isActive ? 'text-blue-50' : 'text-slate-500'}`}>
                        <span>{money(section.totalDeposits)} DH verse</span>
                        <span className="text-right">{money(section.totalWaiting)} DH a payer</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeAgency && [activeAgency].map(section => (
            <div key={section.city} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-4 bg-slate-900 text-white flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <h2 className="font-black text-lg">{section.city}</h2>
                  <p className="text-xs text-slate-300">{section.parcelCount} colis a payer · {section.deposits.length} versement(s) · {section.payments.length} cheque(s)</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-emerald-300">{money(section.totalDeposits)} DH</p>
                    <p className="text-slate-300">verse</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-amber-300">{money(section.totalWaiting)} DH</p>
                    <p className="text-slate-300">a payer</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-blue-300">{money(section.payments.filter((p: any) => paymentStatus(p) !== 'paid').reduce((s: any, p: any) => s + (parseFloat(p.amount) || 0), 0))} DH</p>
                    <p className="text-slate-300">prepares</p>
                  </div>
                </div>
              </div>

              <div className="grid xl:grid-cols-[1.15fr_0.85fr]">
                <div className="border-r border-slate-100">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-black">Fournisseurs a payer</h3>
                    <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{section.supplierGroups.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {section.supplierGroups.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun fournisseur a payer pour cette agence.</p>}
                    {section.supplierGroups.map((group: any) => {
                      const alreadyPaid = group.parcels.every(isParcelPaid)
                      const alreadyPrepared = group.parcels.every((p: any) => isParcelPaid(p) || isParcelPrepared(p))
                      return (
                        <div key={group.key} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-slate-900 truncate">{group.senderName}</p>
                              <p className="text-xs font-bold text-blue-700 mt-1">Agence fournisseur: {(group.supplierAgencies || []).join(', ') || '-'}</p>
                              <p className="text-xs text-slate-500">{group.senderTel || '-'}{group.parcels[0]?.sender?.nic ? ` · N EXP ${group.parcels[0].sender.nic}` : ''} · {group.parcels.length} colis</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-emerald-700">{money(group.total)} DH</p>
                              <div className="flex gap-2 mt-2 justify-end">
                                <button onClick={() => printGroup(group)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="Imprimer detail">
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => !alreadyPrepared && openPayment(group)}
                                  disabled={alreadyPrepared}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold ${
                                    alreadyPrepared
                                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  }`}
                                >
                                  {alreadyPaid ? 'Deja paye' : alreadyPrepared ? 'Cheque prepare' : 'Preparer cheque'}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                            {group.parcels.slice(0, 6).map((p: any) => (
                              <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-xs bg-slate-50 border-b last:border-b-0 border-slate-100">
                                <span className="font-mono text-blue-600">{p.trackingId}</span>
                                <span className="flex-1 truncate text-slate-600">{p.receiver?.name || '-'} · {p.destinationCity || p.receiver?.city || '-'}</span>
                                <span className="font-black text-emerald-700">{money(p.codAmount)} DH</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-1">
                  <div className="border-b md:border-b-0 md:border-r xl:border-r-0 xl:border-b border-slate-100">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-blue-600" />
                      <h3 className="font-black">Versements</h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {section.deposits.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun versement.</p>}
                      {section.deposits.map((dep: any) => (
                        <div key={dep.id} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800">{dep.agentName || '-'}</p>
                              <p className="text-xs text-slate-500">{fmtDate(dep.createdAt)} · {dep.parcelCount || dep.parcelIds?.length || 0} colis</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-blue-700">{money(dep.amount)} DH</p>
                              <div className="mt-2 flex gap-1">
                                <button
                                  onClick={() => setEditDepositModal({ ...dep })}
                                  disabled={deleteDepositId === dep.id}
                                  className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-60 text-blue-700"
                                  title="Modifier"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDeposit(dep.id)}
                                  disabled={deleteDepositId === dep.id}
                                  className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 disabled:opacity-60 text-red-700"
                                  title="Supprimer"
                                >
                                  {deleteDepositId === dep.id ? '...' : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          {(dep.parcels || []).slice(0, 3).map((p: any) => (
                            <p key={p.id || p.trackingId} className="text-xs text-slate-400 mt-1 truncate">{p.trackingId} · {p.senderName} → {p.receiverName} · {money(p.amount)} DH</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <h3 className="font-black">Cheques prepares</h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {section.payments.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun cheque prepare.</p>}
                      {section.payments.map((pay: any) => (
                        <div key={`${section.city}-${pay.id}`} className="p-4 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate">{pay.senderName}</p>
                            <p className="text-xs font-bold text-blue-700">Agence fournisseur: {supplierAgenciesText(pay.parcels)}</p>
                            <p className="text-xs text-slate-500">Cheque {pay.chequeNum || '-'} · {pay.bankName || '-'} · {fmtDate(pay.createdAt)}</p>
                            <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-black ${paymentStatus(pay) === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {paymentStatus(pay) === 'paid' ? 'Paye systeme' : 'Prepare - attente paye'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-green-700">{money(pay.amount)} DH</p>
                            {paymentStatus(pay) !== 'paid' ? (
                              <div className="mt-2 flex gap-1">
                                <button
                                  onClick={() => setEditPaymentModal({ ...pay })}
                                  disabled={payingId === pay.id || deletePaymentId === pay.id}
                                  className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-60 text-blue-700"
                                  title="Modifier"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeletePayment(pay.id)}
                                  disabled={payingId === pay.id || deletePaymentId === pay.id}
                                  className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 disabled:opacity-60 text-red-700"
                                  title="Supprimer"
                                >
                                  {deletePaymentId === pay.id ? '...' : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => confirmPaymentPaid(pay)}
                                  disabled={payingId === pay.id || deletePaymentId === pay.id}
                                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-black"
                                >
                                  {payingId === pay.id ? '...' : 'Payé'}
                                </button>
                              </div>
                            ) : (
                              <span className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-black">✓ Payé</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="hidden">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h2 className="font-black">Remboursements fournisseurs</h2>
              <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{supplierGroups.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {supplierGroups.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun fournisseur en attente.</p>}
              {supplierGroups.map(group => {
                const alreadyPaid = group.parcels.every(isParcelPaid)
                const alreadyPrepared = group.parcels.every((p: any) => isParcelPaid(p) || isParcelPrepared(p))
                return (
                <div key={group.key} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 truncate">{group.senderName}</p>
                      <p className="text-xs text-slate-500">{group.senderTel || '-'}{group.parcels[0]?.sender?.nic ? ` · N EXP ${group.parcels[0].sender.nic}` : ''} · {group.parcels.length} colis</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-emerald-700">{money(group.total)} DH</p>
                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={() => printGroup(group)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="Imprimer detail">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => !alreadyPrepared && openPayment(group)}
                          disabled={alreadyPrepared}
                          className={`px-3 py-2 rounded-xl text-xs font-bold ${
                            alreadyPrepared
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {alreadyPaid ? 'Deja paye' : alreadyPrepared ? 'Cheque prepare' : 'Preparer cheque'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                    {group.parcels.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-xs bg-slate-50 border-b last:border-b-0 border-slate-100">
                        <span className="font-mono text-blue-600">{p.trackingId}</span>
                        <span className="flex-1 truncate text-slate-600">{p.receiver?.name || '-'} · {p.destinationCity || p.receiver?.city || '-'}</span>
                        <span className="font-black text-emerald-700">{money(p.codAmount)} DH</span>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-600" />
                <h2 className="font-black">Versements agences</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {filteredDeposits.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun versement trouve.</p>}
                {filteredDeposits.map(dep => (
                  <div key={dep.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800">{dep.city || '-'} · {dep.agentName || '-'}</p>
                        <p className="text-xs text-slate-500">{fmtDate(dep.createdAt)} · {dep.parcelCount || dep.parcelIds?.length || 0} colis</p>
                      </div>
                      <p className="font-black text-blue-700">{money(dep.amount)} DH</p>
                    </div>
                    {(dep.parcels || []).slice(0, 3).map((p: any) => (
                      <p key={p.id || p.trackingId} className="text-xs text-slate-400 mt-1 truncate">{p.trackingId} · {p.senderName} → {p.receiverName} · {money(p.amount)} DH</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <h2 className="font-black">Cheques prepares</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {filteredPayments.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun cheque prepare.</p>}
                {filteredPayments.slice(0, 20).map(pay => (
                  <div key={pay.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{pay.senderName}</p>
                      <p className="text-xs text-slate-500">Cheque {pay.chequeNum || '-'} · {pay.bankName || '-'} · {fmtDate(pay.createdAt)}</p>
                      <p className={`text-xs font-bold mt-1 ${paymentStatus(pay) === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                        {paymentStatus(pay) === 'paid' ? 'Paye systeme' : 'Prepare - attente paye'}
                      </p>
                    </div>
                    <p className="font-black text-green-700">{money(pay.amount)} DH</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ONGLET ARCHIVES */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'archives' && (
          <>
            <section className="bg-white/70 backdrop-blur-xl rounded-3xl border border-purple-100/60 p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg">
                  <Archive className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 text-xl">📦 Expéditions Archivées</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Historique des expéditions archivées</p>
                </div>
              </div>

              {archivesLoading ? (
                <div className="py-20 text-center">
                  <div className="inline-block w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600 font-semibold">Chargement des archives...</p>
                </div>
              ) : archivedParcels.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Archive className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-semibold">Aucune expédition archivée</p>
                  <p className="text-sm mt-2">Les expéditions archivées apparaîtront ici</p>
                </div>
              ) : (
                <>
                  {/* Filtres */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-200 p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Recherche */}
                      <div>
                        <label className="block text-xs font-bold text-purple-800 mb-2">🔍 Recherche</label>
                        <input
                          type="text"
                          value={archiveSearch}
                          onChange={(e) => setArchiveSearch(e.target.value)}
                          placeholder="N° EXP, Tracking, Expéditeur, Destinataire..."
                          className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                        />
                      </div>

                      {/* Période */}
                      <div>
                        <label className="block text-xs font-bold text-purple-800 mb-2">📅 Période</label>
                        <select
                          value={archiveDatePreset}
                          onChange={(e) => setArchiveDatePreset(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                        >
                          <option value="all">Toutes les dates</option>
                          <option value="today">Aujourd'hui</option>
                          <option value="week">7 derniers jours</option>
                          <option value="month">30 derniers jours</option>
                          <option value="custom">Période personnalisée</option>
                        </select>
                      </div>

                      {/* Type de paiement */}
                      <div>
                        <label className="block text-xs font-bold text-purple-800 mb-2">💰 Type de paiement</label>
                        <select
                          value={archivePaymentType}
                          onChange={(e) => setArchivePaymentType(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                        >
                          <option value="all">Tous les types</option>
                          <option value="especes">💵 Espèces</option>
                          <option value="cheque">📋 Chèque</option>
                          <option value="traite">📝 Traite</option>
                          <option value="bon_livraison">🧾 Bon de livraison</option>
                        </select>
                      </div>

                      {/* Dates personnalisées */}
                      {archiveDatePreset === 'custom' && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-purple-800 mb-2">Du</label>
                            <input
                              type="date"
                              value={archiveDateFrom}
                              onChange={(e) => setArchiveDateFrom(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-purple-800 mb-2">Au</label>
                            <input
                              type="date"
                              value={archiveDateTo}
                              onChange={(e) => setArchiveDateTo(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-200">
                      <p className="text-xs text-purple-600 font-semibold mb-1">Résultats</p>
                      <p className="text-2xl font-black text-purple-800">{filteredArchives.length}</p>
                      <p className="text-[10px] text-purple-500 mt-1">sur {archivedParcels.length} au total</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-4 border border-blue-200">
                      <p className="text-xs text-blue-600 font-semibold mb-1">Avec COD</p>
                      <p className="text-2xl font-black text-blue-800">
                        {filteredArchives.filter((p: any) => (parseFloat(p.codAmount) || 0) > 0).length}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-200">
                      <p className="text-xs text-green-600 font-semibold mb-1">Livrées</p>
                      <p className="text-2xl font-black text-green-800">
                        {filteredArchives.filter((p: any) => p.status === 'delivered').length}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-4 border border-orange-200">
                      <p className="text-xs text-orange-600 font-semibold mb-1">Retournées</p>
                      <p className="text-2xl font-black text-orange-800">
                        {filteredArchives.filter((p: any) => p.status === 'returned').length}
                      </p>
                    </div>
                  </div>

                  {/* Liste */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-purple-50 border-b border-purple-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">N° Tracking</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Expéditeur</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Destinataire</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Ville</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Statut</th>
                            <th className="px-4 py-3 text-right font-bold text-purple-900">COD</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Type paiement</th>
                            <th className="px-4 py-3 text-right font-bold text-purple-900">Prix</th>
                            <th className="px-4 py-3 text-left font-bold text-purple-900">Archivé le</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredArchives.slice(0, 500).map((p: any) => (
                            <tr key={p.id} className="hover:bg-purple-50/30 transition">
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs font-bold text-gray-800">{p.trackingId}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">N° EXP {p.senderNic || p.sender?.nic || '—'}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-gray-800 font-semibold text-xs">{p.sender?.name || '—'}</div>
                                <div className="text-gray-400 text-[10px]">{p.sender?.tel || '—'}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-gray-800 font-semibold text-xs">{p.receiver?.name || '—'}</div>
                                <div className="text-gray-400 text-[10px]">{p.receiver?.tel || '—'}</div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {p.destinationCity || p.receiver?.city || '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  p.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                  p.status === 'returned' ? 'bg-orange-100 text-orange-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {STATUSES.find((s: any) => s.key === p.status)?.label || p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-xs text-blue-700">
                                {(parseFloat(p.codAmount) || 0) > 0 ? `${money(p.codAmount)} DH` : '—'}
                              </td>
                              <td className="px-4 py-3">
                                {p.codPaymentType ? (
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    p.codPaymentType === 'especes' ? 'bg-green-100 text-green-700' :
                                    p.codPaymentType === 'cheque' ? 'bg-blue-100 text-blue-700' :
                                    p.codPaymentType === 'traite' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {COD_PAYMENT_TYPES.find((t: any) => t.key === p.codPaymentType)?.label || p.codPaymentType}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-xs text-gray-800">
                                {money(p.price)} DH
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {fmtDate(p.archivedAt || p.updatedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {filteredArchives.length > 500 && (
                      <div className="bg-purple-50 border-t border-purple-100 px-4 py-3 text-center">
                        <p className="text-xs text-purple-700 font-semibold">
                          Affichage limité à 500 expéditions · Total filtré : {filteredArchives.length}
                        </p>
                      </div>
                    )}

                    {filteredArchives.length === 0 && archiveSearch && (
                      <div className="py-12 text-center text-gray-400">
                        <p className="text-sm font-semibold">Aucun résultat trouvé</p>
                        <p className="text-xs mt-1">Essayez avec d'autres critères de recherche</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !modal.loading && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Banknote className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-lg">Preparer cheque societe</h3>
                <p className="text-xs font-bold text-blue-700 mt-1">Agence fournisseur: {(modal.group.supplierAgencies || []).join(', ') || '-'}</p>
                <p className="text-xs text-slate-500">{modal.group.senderName} · {money(modal.group.total)} DH · {modal.group.parcels.length} colis</p>
              </div>
              <button onClick={() => setModal(null)} disabled={modal.loading} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">
                Numero cheque
                <input value={modal.chequeNum} onChange={e => setModal((m: any) => ({ ...m, chequeNum: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500">
                Banque
                <input value={modal.bankName} onChange={e => setModal((m: any) => ({ ...m, bankName: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500 col-span-2">
                Date cheque
                <input type="date" value={modal.chequeDate} onChange={e => setModal((m: any) => ({ ...m, chequeDate: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500 col-span-2">
                Note
                <textarea value={modal.note} onChange={e => setModal((m: any) => ({ ...m, note: e.target.value }))} rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-none" />
              </label>
            </div>
            {modal.error && <p className="mt-3 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 font-semibold">{modal.error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={modal.loading} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Annuler</button>
              <button onClick={submitPayment} disabled={modal.loading} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> {modal.loading ? 'Enregistrement...' : 'Preparer cheque'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification */}
      {editPaymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditPaymentModal(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Modifier le paiement</h2>
              <button onClick={() => setEditPaymentModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Expéditeur *</label>
                  <input
                    type="text"
                    value={editPaymentModal.senderName || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, senderName: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={editPaymentModal.senderTel || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, senderTel: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">N° Chèque *</label>
                  <input
                    type="text"
                    value={editPaymentModal.chequeNum || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, chequeNum: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Banque *</label>
                  <input
                    type="text"
                    value={editPaymentModal.bankName || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, bankName: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Date d'échéance</label>
                  <input
                    type="date"
                    value={editPaymentModal.chequeDate || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, chequeDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Montant (DH) *</label>
                  <input
                    type="number"
                    value={editPaymentModal.amount || ''}
                    onChange={e => setEditPaymentModal({ ...editPaymentModal, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Note</label>
                <textarea
                  value={editPaymentModal.note || ''}
                  onChange={e => setEditPaymentModal({ ...editPaymentModal, note: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700">
                  <strong>⚠️ Attention :</strong> Une fois ce paiement marqué comme payé, il ne pourra plus être modifié (sauf par l'admin).
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setEditPaymentModal(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Annuler</button>
              <button onClick={handleEditPayment} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification versement */}
      {editDepositModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditDepositModal(null)}>
          <div className="bg-white rounded-2xl max-w-xl w-full" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Modifier le versement</h2>
              <button onClick={() => setEditDepositModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Agent *</label>
                <input
                  type="text"
                  value={editDepositModal.agentName || ''}
                  onChange={e => setEditDepositModal({ ...editDepositModal, agentName: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Montant (DH) *</label>
                <input
                  type="number"
                  value={editDepositModal.amount || ''}
                  onChange={e => setEditDepositModal({ ...editDepositModal, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Note</label>
                <textarea
                  value={editDepositModal.note || ''}
                  onChange={e => setEditDepositModal({ ...editDepositModal, note: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700">
                  <strong>📝 Information :</strong> Cette modification affecte uniquement les informations du versement, pas les colis associés.
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setEditDepositModal(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Annuler</button>
              <button onClick={handleEditDeposit} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
