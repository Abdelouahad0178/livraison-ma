import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot, query, where, collection } from 'firebase/firestore'
import { createArrivage, subscribeArrivages, subscribeAllArrivages, subscribeAllArrivedParcels, saveArrivagePointage, searchParcelByTrackingId, subscribeArrivedParcelsByCity, subscribeDrivers, assignDeliveryDriver, createAutoArrivageForCity } from '../firebase/firestore'
import {
  Truck, Package, CheckSquare, Square, ChevronDown, ChevronRight,
  Clock, CheckCircle2, AlertTriangle, LogOut, MapPin, Minus, Plus,
  Search, X, RotateCcw, Save, CheckCircle, User, UserCheck,
} from 'lucide-react'

const SERVICE_TYPE_DISPLAY = {
  simple:    { label: 'Simple',    emoji: '📦', bg: 'bg-gray-100',    text: 'text-gray-600'   },
  especes:   { label: 'C/Espèces', emoji: '💵', bg: 'bg-green-100',   text: 'text-green-700'  },
  cheque:    { label: 'C/Chèque',  emoji: '📋', bg: 'bg-blue-100',    text: 'text-blue-700'   },
  traite:    { label: 'C/Traite',  emoji: '📝', bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  retour_bl: { label: 'C/BL',      emoji: '🧾', bg: 'bg-amber-100',   text: 'text-amber-700'  },
}

const TYPE_CONFIG = {
  complet:             { label: 'Arrivage complet',    bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  icon: '✅' },
  partiel:             { label: 'Arrivage partiel',    bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: '⚠️' },
  documents_seulement: { label: 'Documents seulement', bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200',   icon: '📄' },
  auto:                { label: 'Réception directe',   bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', icon: '📥' },
}

const POINTAGE_STATUS = {
  pending:     { label: 'Non pointé',       bg: 'bg-gray-700',   text: 'text-gray-300' },
  in_progress: { label: 'Pointage en cours', bg: 'bg-yellow-900/60', text: 'text-yellow-300' },
  done:        { label: 'Pointé ✓',          bg: 'bg-green-900/60', text: 'text-green-300' },
}

const fmt = (d: any) => {
  if (!d) return '—'
  const date = d?.toDate ? d.toDate() : new Date(d)
  return date.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ArrivagePage() {
  const navigate = useNavigate()
  const [profile,        setProfile]        = useState<any>(null)
  const [tab,            setTab]            = useState('nouveau')
  const [transitParcels, setTransitParcels] = useState<any[]>([])
  const [arrivages,      setArrivages]      = useState<any[]>([])
  const [arrivedBoxes,   setArrivedBoxes]   = useState<any>({})
  const [expandedGroups, setExpandedGroups] = useState<any>({})
  const [notes,          setNotes]          = useState('')
  const [confirming,     setConfirming]     = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState<any>(null)

  // ── Pointage state ──────────────────────────────────────────────────────────
  const [expandedArrivage, setExpandedArrivage] = useState<any>(null)
  const [pointageEdits,    setPointageEdits]    = useState<any>({})
  const [savingPointage,   setSavingPointage]   = useState<any>({})
  const [pointageError,    setPointageError]    = useState<any>({})
  const [searchQuery,      setSearchQuery]      = useState('')
  const [searchResult,     setSearchResult]     = useState<any>(null)
  const [searching,        setSearching]        = useState(false)
  const [searchError,      setSearchError]      = useState('')

  // ── Arrivés du jour state ────────────────────────────────────────────────────
  const [receivedParcels,  setReceivedParcels]  = useState<any[]>([])
  const [drivers,          setDrivers]          = useState<any[]>([])
  const [assignModal,      setAssignModal]      = useState<any>(null)
  const [selectedDriver,   setSelectedDriver]   = useState('')
  const [assigningId,      setAssigningId]      = useState<any>(null)
  const [creatingArrivage, setCreatingArrivage] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) { navigate('/login'); return }
    return onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) setProfile(snap.data())
      },
      err => console.warn('ArrivagePage user profile listener error:', err.code)
    )
  }, [])

  useEffect(() => {
    if (!profile?.city) return
    const q = query(
      collection(db, 'parcels'),
      where('destinationCity', '==', profile.city)
    )
    return onSnapshot(q, snap => {
      const parcels = (snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[])
        .filter(p => p.status === 'En transit')
        .sort((a, b) => (a.chauffeurName || '').localeCompare(b.chauffeurName || ''))
      setTransitParcels(parcels)
      setArrivedBoxes((prev: any) => {
        const next = {}
        parcels.forEach(p => {
          const total = p.nbColis || 1
          ;(next as any)[p.id] = prev[p.id] !== undefined ? Math.min(prev[p.id], total) : total
        })
        return next
      })
    })
  }, [profile?.city])

  useEffect(() => {
    if (!profile) return
    const onErr = (err: any) => console.error('subscribeArrivages:', err)
    if (profile.city) return subscribeArrivages(profile.city, setArrivages, onErr)
    return subscribeAllArrivages(setArrivages, onErr)
  }, [profile?.city, profile?.role])

  useEffect(() => {
    if (!profile) return
    const onErr = (err: any) => console.error('subscribeArrivedParcels:', err)
    if (profile.city) return subscribeArrivedParcelsByCity(profile.city, setReceivedParcels, onErr)
    return subscribeAllArrivedParcels(setReceivedParcels, onErr)
  }, [profile?.city, profile?.role])

  useEffect(() => {
    return subscribeDrivers((data: any) => setDrivers(data.filter((d: any) => d.role === 'livreur')), err => console.error('subscribeDrivers:', err))
  }, [])

  // ── Helpers création ────────────────────────────────────────────────────────
  const nbColis  = (p: any) => p.nbColis || 1
  const arrived  = (p: any) => arrivedBoxes[p.id] ?? nbColis(p)
  const isArrived = (p: any) => arrived(p) > 0
  const isPartialBoxes = (p: any) => arrived(p) > 0 && arrived(p) < nbColis(p)
  const isFullyArrived = (p: any) => arrived(p) === nbColis(p)

  const setBoxes = (parcelId: any, val: any, total: any) =>
    setArrivedBoxes((prev: any) => ({ ...prev, [parcelId]: Math.max(0, Math.min(total, val)) }))

  const toggleParcel = (p: any) => {
    const cur = arrived(p)
    setArrivedBoxes((prev: any) => ({ ...prev, [p.id]: cur > 0 ? 0 : nbColis(p) }))
  }

  const groups = transitParcels.reduce((acc, p) => {
    const key = p.chauffeurId || '__none__'
    if (!acc[key]) acc[key] = {
      key,
      chauffeurName: p.chauffeurName || 'Sans chauffeur assigné',
      originCity: p.originCity || '—',
      parcels: []
    }
    acc[key].parcels.push(p)
    return acc
  }, {})

  const toggleGroup = (key: any) => {
    const gParcels = groups[key].parcels
    const allFull  = gParcels.every((p: any) => isFullyArrived(p))
    const next     = { ...arrivedBoxes }
    gParcels.forEach((p: any) => { next[p.id] = allFull ? 0 : nbColis(p) })
    setArrivedBoxes(next)
  }

  const toggleAll = (full: any) => {
    const next = {}
    transitParcels.forEach(p => { (next as any)[p.id] = full ? nbColis(p) : 0 })
    setArrivedBoxes(next)
  }

  const toggleExpand = (key: any) => setExpandedGroups((prev: any) => ({ ...prev, [key]: !prev[key] }))

  // ── Calculs création ────────────────────────────────────────────────────────
  const arrivedParcels = transitParcels.filter(p => isArrived(p))
  const missingParcels = transitParcels.filter(p => !isArrived(p))
  const hasPartialBoxes = transitParcels.some(p => isPartialBoxes(p))
  const totalExpectedBoxes = transitParcels.reduce((s, p) => s + nbColis(p), 0)
  const totalArrivedBoxes  = transitParcels.reduce((s, p) => s + arrived(p), 0)

  const computedType = arrivedParcels.length === 0
    ? 'documents_seulement'
    : (arrivedParcels.length === transitParcels.length && !hasPartialBoxes)
      ? 'complet'
      : 'partiel'

  const parcelToDetail = (p: any) => ({
    parcelId:      p.id,
    trackingId:    p.trackingId || '',
    senderName:    p.sender?.name || '',
    receiverName:  p.receiver?.name || '',
    receiverPhone: p.receiver?.phone || '',
    weight:        p.weight || 0,
    nbColis:       nbColis(p),
    serviceType:   p.serviceType || '',
    originCity:    p.originCity || '',
    chauffeurName: p.chauffeurName || '',
    codAmount:     p.codAmount || 0,
  })

  const arrivedColisDetail = arrivedParcels.map(p => ({
    ...parcelToDetail(p),
    arrived: arrived(p),
    total:   nbColis(p),
    pointed: false,
  }))

  const missingColisDetail = missingParcels.map(p => ({
    ...parcelToDetail(p),
    total: nbColis(p),
  }))

  const missingParcelIds = missingParcels.map(p => p.id)

  const handleConfirm = async () => {
    setConfirming(true)
    setError('')
    try {
      const result = await createArrivage({
        city: profile.city,
        arrivedColisDetail,
        missingParcelIds,
        missingColisDetail,
        type: computedType,
        notes: notes.trim(),
        agentId:   auth.currentUser!.uid,
        agentName: profile.name || profile.email || 'Agent',
      })
      setSuccess({
        arrivageRef:       result.arrivageRef,
        arrivedCount:      arrivedParcels.length,
        missingCount:      missingParcels.length,
        totalArrivedBoxes,
        totalExpectedBoxes,
      })
      setNotes('')
    } catch {
      setError("Erreur lors de la confirmation de l'arrivage.")
    } finally {
      setConfirming(false)
    }
  }

  // ── Pointage handlers ───────────────────────────────────────────────────────
  const getEdit = (id: any) => pointageEdits[id] || null

  const initEdit = (arr: any, forceTransitMissing = false) => {
    if (pointageEdits[arr.id]) return
    const arrivedIds      = new Set(arr.arrivedParcelIds || [])
    const existMissingIds = new Set((arr.missingColisDetail || []).map((d: any) => d.parcelId).filter(Boolean))
    // For auto-arrivages (claimParcel receipts) also surface transit parcels as missing
    const addTransit = forceTransitMissing || arr.type === 'auto'
    const extraMissing = addTransit
      ? transitParcels
          .filter(p => !arrivedIds.has(p.id) && !existMissingIds.has(p.id))
          .map(p => ({
            parcelId:      p.id,
            trackingId:    p.trackingId || '',
            senderName:    p.sender?.name || '',
            receiverName:  p.receiver?.name || '',
            receiverPhone: p.receiver?.phone || '',
            weight:        p.weight || 0,
            nbColis:       p.nbColis || 1,
            serviceType:   p.serviceType || '',
            originCity:    p.originCity || '',
            chauffeurName: p.chauffeurName || '',
            codAmount:     p.codAmount || 0,
            total:         p.nbColis || 1,
          }))
      : []
    setPointageEdits((prev: any) => ({
      ...prev,
      [arr.id]: {
        arrived: (arr.arrivedColisDetail || []).map((d: any) => ({ ...d })),
        missing: [
          ...(arr.missingColisDetail || []).map((d: any) => ({ ...d })),
          ...extraMissing,
        ],
        dirty: false,
      }
    }))
  }

  const patchArrived = (arrivageId: any, fn: any) => {
    setPointageEdits((prev: any) => {
      const cur = prev[arrivageId]
      if (!cur) return prev
      return { ...prev, [arrivageId]: { ...cur, arrived: fn(cur.arrived), dirty: true } }
    })
  }

  const handleTogglePointed = (arrivageId: any, parcelId: any) =>
    patchArrived(arrivageId, (arr: any) =>
      arr.map((d: any) => d.parcelId === parcelId ? { ...d, pointed: !d.pointed } : d)
    )

  const handleSetBoxes = (arrivageId: any, parcelId: any, val: any) =>
    patchArrived(arrivageId, (arr: any) =>
      arr.map((d: any) => d.parcelId === parcelId
        ? { ...d, arrived: Math.max(0, Math.min(d.total || d.nbColis || 1, val)), pointed: val > 0 }
        : d
      )
    )

  const handleRemoveFromArrived = (arrivageId: any, parcelId: any) => {
    setPointageEdits((prev: any) => {
      const cur = prev[arrivageId]
      if (!cur) return prev
      const removed = cur.arrived.find((d: any) => d.parcelId === parcelId)
      return {
        ...prev,
        [arrivageId]: {
          ...cur,
          arrived: cur.arrived.filter((d: any) => d.parcelId !== parcelId),
          missing: removed ? [...cur.missing, { ...removed, arrived: 0 }] : cur.missing,
          dirty: true,
        }
      }
    })
  }

  const handleRecoverMissing = (arrivageId: any, parcelId: any) => {
    setPointageEdits((prev: any) => {
      const cur = prev[arrivageId]
      if (!cur) return prev
      const found = cur.missing.find((d: any) => d.parcelId === parcelId)
      if (!found) return prev
      const total = found.total || found.nbColis || 1
      return {
        ...prev,
        [arrivageId]: {
          ...cur,
          missing:  cur.missing.filter((d: any) => d.parcelId !== parcelId),
          arrived:  [...cur.arrived, { ...found, arrived: total, total, pointed: true }],
          dirty: true,
        }
      }
    })
  }

  const handleSearchParcel = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError('')
    setSearchResult(null)
    try {
      const p = await searchParcelByTrackingId(searchQuery.trim().toUpperCase())
      if (!p) { setSearchError('Colis introuvable.'); return }
      setSearchResult(p)
    } catch {
      setSearchError('Erreur de recherche.')
    } finally {
      setSearching(false)
    }
  }

  const handleAddSearchResult = (arrivageId: any) => {
    if (!searchResult) return
    const p = searchResult
    const total = p.nbColis || 1
    const entry = {
      parcelId:      p.id,
      trackingId:    p.trackingId || '',
      senderName:    p.sender?.name || '',
      receiverName:  p.receiver?.name || '',
      receiverPhone: p.receiver?.phone || '',
      weight:        p.weight || 0,
      nbColis:       total,
      serviceType:   p.serviceType || '',
      originCity:    p.originCity || '',
      chauffeurName: p.chauffeurName || '',
      codAmount:     p.codAmount || 0,
      arrived:       total,
      total,
      pointed:       true,
      addedDuringPointage: true,
    }
    patchArrived(arrivageId, (arr: any) => {
      if (arr.some((d: any) => d.parcelId === p.id)) return arr
      return [...arr, entry]
    })
    setSearchQuery('')
    setSearchResult(null)
    setSearchError('')
  }

  const handleSavePointage = async (arrivageId: any, arr: any, markDone: any) => {
    const edit = pointageEdits[arrivageId]
    if (!edit) return
    setSavingPointage((prev: any) => ({ ...prev, [arrivageId]: true }))
    setPointageError((prev: any) => ({ ...prev, [arrivageId]: '' }))
    try {
      await saveArrivagePointage(arrivageId, {
        arrivedColisDetail: edit.arrived,
        missingColisDetail:  edit.missing,
        missingParcelIds:    edit.missing.map((d: any) => d.parcelId).filter(Boolean),
        arrivageRef:         arr.arrivageRef,
        markDone,
        pointedById:         auth.currentUser?.uid,
        pointedBy:           profile?.name || profile?.email || 'Agent',
      })
      setPointageEdits((prev: any) => ({
        ...prev,
        [arrivageId]: { ...prev[arrivageId], dirty: false }
      }))
    } catch {
      setPointageError((prev: any) => ({ ...prev, [arrivageId]: 'Erreur lors de la sauvegarde.' }))
    } finally {
      setSavingPointage((prev: any) => ({ ...prev, [arrivageId]: false }))
    }
  }

  // ── Arrivés du jour handlers ─────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)

  const handleAssignLivreur = async () => {
    if (!assignModal || !selectedDriver) return
    const driver = drivers.find(d => d.id === selectedDriver)
    if (!driver) return
    setAssigningId(assignModal.parcelId)
    try {
      await assignDeliveryDriver(assignModal.parcelId, driver.id, driver.name || driver.email, {
        deliveryAssignedBy: profile?.name || profile?.email || 'Agent',
      })
      setAssignModal(null)
      setSelectedDriver('')
    } catch (e: any) {
      console.error('Assign livreur error:', e)
    } finally {
      setAssigningId(null)
    }
  }

  // ── Today's auto-arrivage ───────────────────────────────────────────────────
  const todayCompact    = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const autoArrivageId  = profile?.city ? `auto-${profile.city}-${todayCompact}` : null
  const todayArrivage   = autoArrivageId ? arrivages.find(a => a.id === autoArrivageId) : null

  // Auto-init pointage edit when arrived tab opens (or when today's arrivage first loads)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'arrived' || !todayArrivage) return
    initEdit(todayArrivage)
  }, [tab, todayArrivage?.id, transitParcels.length])

  const handleCreateTodayArrivage = async () => {
    if (!profile?.city) return
    setCreatingArrivage(true)
    try {
      const arrivedToday = receivedParcels.filter(p => (p.destinationArrivedAt || '').startsWith(todayStr))
      const arrivedIds   = new Set(arrivedToday.map(p => p.id))
      const missing      = transitParcels.filter(p => !arrivedIds.has(p.id))
      await createAutoArrivageForCity(
        profile.city,
        auth.currentUser!.uid,
        profile.name || profile.email || 'Agent',
        arrivedToday,
        missing
      )
    } catch (e: any) {
      console.error('createAutoArrivageForCity:', e)
    } finally {
      setCreatingArrivage(false)
    }
  }

  const typeConf = TYPE_CONFIG[computedType]

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Gestion des Arrivages</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" />{profile.city}
            </p>
          </div>
        </div>
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-700 rounded-xl transition">
          <LogOut className="w-4 h-4 text-gray-400" />
        </button>
      </header>

      <div className="flex bg-gray-800 border-b border-gray-700 px-4 gap-1 overflow-x-auto">
        {[
          { key: 'arrived',    label: 'Arrivés du jour', icon: <Package className="w-4 h-4" />, badge: receivedParcels.filter(p => (p.destinationArrivedAt || '').startsWith(todayStr)).length || null },
          { key: 'nouveau',    label: 'Nouvel arrivage', icon: <Truck className="w-4 h-4" /> },
          { key: 'historique', label: 'Historique',      icon: <Clock className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              tab === t.key ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.icon} {t.label}
            {t.badge ? <span className="ml-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Succès */}
        {success && (
          <div className="bg-green-900/50 border border-green-600 rounded-2xl p-5 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <p className="font-bold text-green-300 text-lg">Arrivage confirmé !</p>
            <p className="font-mono text-green-400 text-sm">{success.arrivageRef}</p>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              <span className="bg-green-800 text-green-200 px-3 py-1 rounded-full font-semibold">
                {success.arrivedCount} bon{success.arrivedCount > 1 ? 's' : ''} reçus
              </span>
              <span className="bg-green-700 text-green-100 px-3 py-1 rounded-full font-semibold">
                {success.totalArrivedBoxes}/{success.totalExpectedBoxes} colis physiques
              </span>
              {success.missingCount > 0 && (
                <span className="bg-orange-800 text-orange-200 px-3 py-1 rounded-full font-semibold">
                  {success.missingCount} bon{success.missingCount > 1 ? 's' : ''} manquants
                </span>
              )}
            </div>
            <button onClick={() => { setSuccess(null); setTab('historique') }}
              className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition"
            >
              Voir l'historique
            </button>
          </div>
        )}

        {/* ═══════════════ ARRIVÉS DU JOUR ═══════════════ */}
        {tab === 'arrived' && (() => {
          const todayEdit  = todayArrivage ? getEdit(todayArrivage.id) : null
          const saving     = todayArrivage ? savingPointage[todayArrivage.id] : false
          const pErr       = todayArrivage ? pointageError[todayArrivage.id]  : ''
          const todayCount = receivedParcels.filter(p => (p.destinationArrivedAt || '').startsWith(todayStr)).length

          return (
            <>
              {/* ── Header stats ── */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 space-y-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  Pointage du jour
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">{todayCount} reçus</span>
                </h2>
                {todayArrivage && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${(POINTAGE_STATUS as any)[todayArrivage.pointageStatus]?.bg} ${(POINTAGE_STATUS as any)[todayArrivage.pointageStatus]?.text}`}>
                      {(POINTAGE_STATUS as any)[todayArrivage.pointageStatus]?.label}
                    </span>
                    <span className="text-gray-400 font-mono">{todayArrivage.arrivageRef}</span>
                    {todayEdit && (
                      <span className="text-green-400">{todayEdit.arrived.filter((d: any) => d.pointed).length}/{todayEdit.arrived.length} pointés</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Full pointage UI (when today's auto-arrivage exists) ── */}
              {todayArrivage && todayEdit ? (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                  <div className="p-4 space-y-4">

                    {/* Arrived list */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        Colis arrivés ({todayEdit.arrived.length})
                      </p>
                      {todayEdit.arrived.length === 0 && (
                        <p className="text-xs text-gray-500 italic pl-2">Aucun colis dans la liste arrivée.</p>
                      )}
                      <div className="space-y-2">
                        {todayEdit.arrived.map((d: any) => {
                          const total      = d.total || d.nbColis || 1
                          const realParcel = receivedParcels.find(p => p.id === d.parcelId)
                          const st         = (SERVICE_TYPE_DISPLAY as any)[d.serviceType]
                          return (
                            <div key={d.parcelId} className={`rounded-xl border transition ${d.pointed ? 'bg-green-900/20 border-green-700/40' : 'bg-gray-700/50 border-gray-600/50'}`}>
                              <div className="flex items-center gap-2 px-3 py-2.5">
                                <button onClick={() => handleTogglePointed(todayArrivage.id, d.parcelId)} className="shrink-0">
                                  {d.pointed
                                    ? <CheckSquare className="w-4 h-4 text-green-400" />
                                    : <Square className="w-4 h-4 text-gray-500" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-mono font-bold text-blue-400">{d.trackingId}</span>
                                    {st && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>{st.emoji} {st.label}</span>}
                                    {d.addedDuringPointage && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-900/60 text-purple-300 font-semibold">+Ajouté</span>}
                                  </div>
                                  <p className="text-xs text-gray-300 font-medium truncate">{d.receiverName || '—'}</p>
                                  <p className="text-[10px] text-gray-500">{d.senderName} · {d.originCity} · {d.weight} kg</p>
                                  {d.codAmount > 0 && <p className="text-[10px] text-green-400">{d.codAmount} DH</p>}
                                </div>
                                {total > 1 && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleSetBoxes(todayArrivage.id, d.parcelId, (d.arrived || 0) - 1)} disabled={(d.arrived || 0) <= 0}
                                      className="w-5 h-5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 flex items-center justify-center transition">
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[32px] text-center ${
                                      (d.arrived || 0) === 0 ? 'bg-red-900/40 text-red-300'
                                      : (d.arrived || 0) < total ? 'bg-orange-900/40 text-orange-300'
                                      : 'bg-green-900/40 text-green-300'
                                    }`}>{d.arrived || 0}/{total}</span>
                                    <button onClick={() => handleSetBoxes(todayArrivage.id, d.parcelId, (d.arrived || 0) + 1)} disabled={(d.arrived || 0) >= total}
                                      className="w-5 h-5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 flex items-center justify-center transition">
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                                <button onClick={() => handleRemoveFromArrived(todayArrivage.id, d.parcelId)}
                                  className="w-6 h-6 rounded-lg bg-red-900/40 hover:bg-red-900/70 flex items-center justify-center transition shrink-0">
                                  <X className="w-3 h-3 text-red-400" />
                                </button>
                              </div>
                              {/* Livreur row */}
                              <div className="px-3 pb-2.5 pl-9">
                                {realParcel?.deliveryDriverId ? (
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 bg-green-900/40 border border-green-700/50 text-green-300 text-xs px-2.5 py-1 rounded-lg">
                                      <UserCheck className="w-3 h-3" /> {realParcel.deliveryDriverName || 'Livreur assigné'}
                                    </span>
                                    <button onClick={() => { setAssignModal({ parcelId: d.parcelId, name: d.receiverName || '' }); setSelectedDriver(realParcel.deliveryDriverId) }}
                                      className="text-xs text-gray-400 hover:text-blue-300 transition">Changer</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setAssignModal({ parcelId: d.parcelId, name: d.receiverName || '' }); setSelectedDriver('') }}
                                    className="inline-flex items-center gap-1.5 bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:text-blue-200 hover:bg-blue-900/60 text-xs px-2.5 py-1 rounded-lg transition">
                                    <User className="w-3 h-3" /> Assigner livreur
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Missing parcels */}
                    {todayEdit.missing.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                          Manquants ({todayEdit.missing.length})
                        </p>
                        <div className="space-y-1.5">
                          {todayEdit.missing.map((d: any) => {
                            const st = (SERVICE_TYPE_DISPLAY as any)[d.serviceType]
                            return (
                              <div key={d.parcelId} className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-red-900/20 border border-red-700/40">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-mono font-bold text-blue-400">{d.trackingId || d.parcelId}</span>
                                    {st && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>{st.emoji} {st.label}</span>}
                                  </div>
                                  <p className="text-xs text-gray-400 truncate">{d.receiverName || '—'} · {d.originCity || '—'}</p>
                                </div>
                                <button onClick={() => handleRecoverMissing(todayArrivage.id, d.parcelId)}
                                  className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-green-800/60 hover:bg-green-700/80 text-green-300 transition shrink-0">
                                  <RotateCcw className="w-2.5 h-2.5" /> Trouvé
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Add parcel by tracking */}
                    <div className="bg-gray-700/40 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-blue-400" /> Ajouter un colis
                      </p>
                      <div className="flex gap-2">
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSearchParcel()}
                          placeholder="N° de tracking (ex: BG-XXXX)"
                          className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                        <button onClick={handleSearchParcel} disabled={searching || !searchQuery.trim()}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1">
                          {searching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                        </button>
                      </div>
                      {searchError && <p className="text-xs text-red-400">{searchError}</p>}
                      {searchResult && (
                        <div className="bg-gray-800 border border-blue-700/50 rounded-xl p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-bold text-blue-400">{searchResult.trackingId}</p>
                            <p className="text-sm font-semibold text-gray-200 truncate">{searchResult.receiver?.name}</p>
                            <p className="text-xs text-gray-400">{searchResult.sender?.name} · {searchResult.originCity} → {searchResult.destinationCity}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Statut : <span className="text-yellow-300">{searchResult.status}</span></p>
                          </div>
                          <button onClick={() => handleAddSearchResult(todayArrivage.id)}
                            className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-xs font-bold transition shrink-0">
                            Ajouter
                          </button>
                        </div>
                      )}
                    </div>

                    {pErr && <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{pErr}</p>}

                    <div className="flex gap-2">
                      <button onClick={() => handleSavePointage(todayArrivage.id, todayArrivage, false)}
                        disabled={saving || !todayEdit.dirty}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition border bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 disabled:opacity-40">
                        {saving ? <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        Enregistrer
                      </button>
                      <button onClick={() => handleSavePointage(todayArrivage.id, todayArrivage, true)}
                        disabled={saving || todayArrivage.pointageStatus === 'done'}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition bg-green-700 hover:bg-green-600 text-white disabled:opacity-40">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Valider pointage
                      </button>
                    </div>

                    {todayArrivage.pointedBy && (
                      <p className="text-[10px] text-center text-gray-500">
                        Pointé par {todayArrivage.pointedBy} le {fmt(todayArrivage.pointedAt)}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Fallback: no auto-arrivage yet — show preview and start button */
                <div className="space-y-3">
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 space-y-4">
                    {/* Summary counts */}
                    <div className="flex flex-wrap gap-3 text-sm">
                      <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/40 rounded-xl px-3 py-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-green-300 font-bold">{receivedParcels.filter(p => (p.destinationArrivedAt || '').startsWith(todayStr)).length}</span>
                        <span className="text-green-400/70 text-xs">reçus</span>
                      </div>
                      <div className="flex items-center gap-2 bg-orange-900/30 border border-orange-700/40 rounded-xl px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-300 font-bold">{transitParcels.length}</span>
                        <span className="text-orange-400/70 text-xs">en transit</span>
                      </div>
                    </div>

                    {/* Transit parcels preview */}
                    {transitParcels.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Colis attendus</p>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {transitParcels.map(p => {
                            const alreadyReceived = receivedParcels.some(r => r.id === p.id)
                            return (
                              <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${alreadyReceived ? 'bg-green-900/20 border border-green-700/40' : 'bg-gray-700/50 border border-gray-600/40'}`}>
                                {alreadyReceived
                                  ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                  : <Square className="w-4 h-4 text-gray-500 shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <span className="font-mono text-xs text-blue-400">{p.trackingId}</span>
                                  <span className="text-gray-400 text-xs ml-2">→ {p.receiver?.name || '—'}</span>
                                </div>
                                <span className="text-[10px] text-gray-500">{p.chauffeurName || '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {transitParcels.length === 0 && receivedParcels.filter(p => (p.destinationArrivedAt || '').startsWith(todayStr)).length === 0 && (
                      <div className="text-center py-4 text-gray-500">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Aucun colis en transit ni reçu aujourd'hui</p>
                      </div>
                    )}

                    <button
                      onClick={handleCreateTodayArrivage}
                      disabled={creatingArrivage || (transitParcels.length === 0 && receivedParcels.filter(p => (p.destinationArrivedAt||'').startsWith(todayStr)).length === 0)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-sm transition"
                    >
                      {creatingArrivage
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Création...</>
                        : <><Package className="w-4 h-4" /> Démarrer le pointage du jour</>}
                    </button>
                    <p className="text-[10px] text-center text-gray-500">
                      Crée un arrivage groupé pour aujourd'hui avec les colis reçus et en transit.
                    </p>
                  </div>
                </div>
              )}

              {/* Assign livreur modal */}
              {assignModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setAssignModal(null)}>
                  <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-400" /> Assigner un livreur
                    </h3>
                    {assignModal.name && <p className="text-sm text-gray-400">Destinataire : <span className="text-white">{assignModal.name}</span></p>}
                    {drivers.length === 0 ? (
                      <p className="text-sm text-yellow-400">Aucun livreur disponible dans le système.</p>
                    ) : (
                      <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
                        <option value="">— Choisir un livreur —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name || d.email}{d.city ? ` (${d.city})` : ''}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-3">
                      <button onClick={() => setAssignModal(null)}
                        className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm font-semibold hover:bg-gray-700 transition">
                        Annuler
                      </button>
                      <button onClick={handleAssignLivreur} disabled={!selectedDriver || assigningId === assignModal.parcelId}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition flex items-center justify-center gap-2">
                        {assigningId === assignModal.parcelId
                          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><UserCheck className="w-4 h-4" /> Assigner</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* ═══════════════ NOUVEL ARRIVAGE ═══════════════ */}
        {tab === 'nouveau' && !success && (
          <>
            <div className={`flex items-center gap-3 ${typeConf.bg} ${typeConf.border} border rounded-2xl px-4 py-3`}>
              <span className="text-2xl">{typeConf.icon}</span>
              <div>
                <p className={`font-bold text-sm ${typeConf.text}`}>{typeConf.label}</p>
                <p className={`text-xs ${typeConf.text} opacity-70`}>
                  {computedType === 'complet' && `Tous les ${transitParcels.length} bons — ${totalArrivedBoxes} colis physiques reçus`}
                  {computedType === 'partiel' && (() => {
                    const parts: any[] = []
                    if (missingParcels.length > 0) parts.push(`${missingParcels.length} bon${missingParcels.length > 1 ? 's' : ''} manquant${missingParcels.length > 1 ? 's' : ''}`)
                    if (hasPartialBoxes) parts.push('colis partiels')
                    return `${totalArrivedBoxes}/${totalExpectedBoxes} colis physiques — ${parts.join(', ')}`
                  })()}
                  {computedType === 'documents_seulement' && transitParcels.length === 0 && 'Aucun bon en transit pour cette ville'}
                  {computedType === 'documents_seulement' && transitParcels.length > 0 && 'Aucun colis physique reçu'}
                </p>
              </div>
            </div>

            {transitParcels.length === 0 && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Aucun bon en transit</p>
                <p className="text-sm mt-1">Tous les bons attendus à {profile.city} ont été réceptionnés.</p>
              </div>
            )}

            {transitParcels.length > 0 && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                  <div>
                    <p className="text-sm font-bold text-gray-200">
                      {arrivedParcels.length}/{transitParcels.length} bons reçus
                    </p>
                    <p className="text-xs text-gray-400">
                      {totalArrivedBoxes}/{totalExpectedBoxes} colis physiques
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleAll(true)}
                      className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg transition"
                    >
                      Tout cocher
                    </button>
                    <button onClick={() => toggleAll(false)}
                      className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg transition"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>

                {Object.values(groups).map(group => {
                  const g = group as any
                  const gArrived = g.parcels.filter((p: any) => isArrived(p)).length
                  const allFull  = g.parcels.every((p: any) => isFullyArrived(p))
                  const expanded = expandedGroups[g.key] !== false

                  return (
                    <div key={g.key} className="border-b border-gray-700 last:border-0">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition">
                        <button onClick={() => toggleGroup(g.key)} className="shrink-0">
                          {allFull
                            ? <CheckSquare className="w-5 h-5 text-green-400" />
                            : gArrived > 0
                              ? <div className="w-5 h-5 border-2 border-orange-400 rounded flex items-center justify-center"><div className="w-2.5 h-2.5 bg-orange-400 rounded-sm" /></div>
                              : <Square className="w-5 h-5 text-gray-500" />
                          }
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-100 truncate">🚚 {g.chauffeurName}</p>
                          <p className="text-xs text-gray-400">
                            {g.originCity} → {profile.city} · {gArrived}/{g.parcels.length} bons
                          </p>
                        </div>
                        <button onClick={() => toggleExpand(g.key)} className="p-1 shrink-0">
                          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>

                      {expanded && g.parcels.map((parcel: any) => {
                        const total    = nbColis(parcel)
                        const rcvd     = arrived(parcel)
                        const checked  = rcvd > 0
                        const partial  = isPartialBoxes(parcel)
                        const multiBox = total > 1

                        return (
                          <div
                            key={parcel.id}
                            className={`flex items-center gap-3 px-4 py-3 pl-12 border-t border-gray-700/50 transition ${
                              checked ? (partial ? 'bg-orange-900/15' : 'bg-green-900/15') : 'bg-red-900/10'
                            }`}
                          >
                            <button onClick={() => toggleParcel(parcel)} className="shrink-0">
                              {checked
                                ? <CheckSquare className={`w-4 h-4 ${partial ? 'text-orange-400' : 'text-green-400'}`} />
                                : <Square className="w-4 h-4 text-gray-500" />
                              }
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <p className="text-xs font-mono font-bold text-blue-400">{parcel.trackingId}</p>
                                {(() => {
                                  const st = (SERVICE_TYPE_DISPLAY as any)[parcel.serviceType]
                                  if (!st) return null
                                  return (
                                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>
                                      {st.emoji} {st.label}
                                    </span>
                                  )
                                })()}
                              </div>
                              <p className="text-sm font-semibold text-gray-200 truncate">{parcel.receiver?.name}</p>
                              <p className="text-xs text-gray-500">{parcel.sender?.name} · {parcel.weight} kg</p>
                            </div>
                            {multiBox ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => setBoxes(parcel.id, rcvd - 1, total)} disabled={rcvd === 0}
                                  className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center transition">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <div className={`text-xs font-bold px-2 py-1 rounded-lg min-w-[42px] text-center ${
                                  rcvd === 0 ? 'bg-red-900/40 text-red-300'
                                  : rcvd < total ? 'bg-orange-900/40 text-orange-300'
                                  : 'bg-green-900/40 text-green-300'
                                }`}>{rcvd}/{total}</div>
                                <button onClick={() => setBoxes(parcel.id, rcvd + 1, total)} disabled={rcvd === total}
                                  className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center transition">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-bold ${
                                checked ? 'bg-green-700 text-green-100' : 'bg-red-800 text-red-200'
                              }`}>
                                {checked ? 'Reçu' : 'Manquant'}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes (optionnel)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observations, incidents, remarques..."
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-xl px-4 py-3 text-sm text-red-300 font-medium">{error}</div>
            )}

            <button
              onClick={handleConfirm}
              disabled={confirming || (transitParcels.length === 0 && !notes.trim())}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition shadow-lg"
            >
              {confirming
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Confirmation...</>
                : <><CheckCircle2 className="w-5 h-5" /> Confirmer l'arrivage</>
              }
            </button>

            {computedType === 'documents_seulement' && transitParcels.length > 0 && (
              <p className="text-center text-xs text-orange-400">
                ⚠️ Aucun colis coché — l'arrivage sera enregistré en "Documents seulement".
              </p>
            )}
          </>
        )}

        {/* ═══════════════ HISTORIQUE + POINTAGE ═══════════════ */}
        {tab === 'historique' && (
          <>
            {arrivages.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Aucun arrivage enregistré</p>
              </div>
            ) : (
              <div className="space-y-3">
                {arrivages.map(arr => {
                  const tc = (TYPE_CONFIG as any)[arr.type] || TYPE_CONFIG.complet
                  const ps = (POINTAGE_STATUS as any)[arr.pointageStatus] || POINTAGE_STATUS.pending
                  const isOpen = expandedArrivage === arr.id
                  const edit = getEdit(arr.id)
                  const saving = savingPointage[arr.id]
                  const pErr = pointageError[arr.id]

                  return (
                    <div key={arr.id} className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                      {/* ── Card header ── */}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono font-bold text-blue-400 text-sm">{arr.arrivageRef}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmt(arr.confirmedAt)} · {arr.agentName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ps.bg} ${ps.text}`}>
                              {ps.label}
                            </span>
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${tc.bg} ${tc.text}`}>
                              {tc.icon} {tc.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-sm mb-3">
                          <div className="flex items-center gap-1.5 bg-green-900/30 border border-green-700/50 rounded-xl px-3 py-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-green-300 font-bold">{arr.arrivedCount}</span>
                            <span className="text-green-400/60 text-xs">bons reçus</span>
                          </div>
                          {arr.totalArrivedBoxes !== undefined && (
                            <div className="flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/50 rounded-xl px-3 py-2">
                              <Package className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-blue-300 font-bold">{arr.totalArrivedBoxes}/{arr.totalExpectedBoxes}</span>
                              <span className="text-blue-400/60 text-xs">colis</span>
                            </div>
                          )}
                          {arr.missingCount > 0 && (
                            <div className="flex items-center gap-1.5 bg-red-900/30 border border-red-700/50 rounded-xl px-3 py-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              <span className="text-red-300 font-bold">{arr.missingCount}</span>
                              <span className="text-red-400/60 text-xs">manquants</span>
                            </div>
                          )}
                        </div>

                        {arr.notes && (
                          <p className="text-xs text-gray-400 italic mb-3 pb-3 border-b border-gray-700">{arr.notes}</p>
                        )}

                        {/* Expand toggle */}
                        <button
                          onClick={() => {
                            if (isOpen) {
                              setExpandedArrivage(null)
                            } else {
                              setExpandedArrivage(arr.id)
                              initEdit(arr)
                              setSearchQuery('')
                              setSearchResult(null)
                              setSearchError('')
                            }
                          }}
                          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition border ${
                            isOpen
                              ? 'bg-gray-700 border-gray-600 text-gray-300'
                              : 'bg-blue-900/30 border-blue-700/50 text-blue-300 hover:bg-blue-900/50'
                          }`}
                        >
                          {isOpen ? <><ChevronDown className="w-3.5 h-3.5" /> Fermer le pointage</> : <><ChevronRight className="w-3.5 h-3.5" /> Ouvrir le pointage</>}
                        </button>
                      </div>

                      {/* ── Pointage section ── */}
                      {isOpen && edit && (
                        <div className="border-t border-gray-700 space-y-4 p-4">

                          {/* ── Arrived parcels list ── */}
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              Colis arrivés ({edit.arrived.length})
                            </p>
                            {edit.arrived.length === 0 && (
                              <p className="text-xs text-gray-500 italic pl-2">Aucun colis dans la liste arrivée.</p>
                            )}
                            <div className="space-y-1.5">
                              {edit.arrived.map((d: any) => {
                                const total = d.total || d.nbColis || 1
                                const multiBox = total > 1
                                const st = (SERVICE_TYPE_DISPLAY as any)[d.serviceType]
                                return (
                                  <div key={d.parcelId} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border transition ${
                                    d.pointed ? 'bg-green-900/20 border-green-700/40' : 'bg-gray-700/50 border-gray-600/50'
                                  }`}>
                                    {/* Pointed checkbox */}
                                    <button onClick={() => handleTogglePointed(arr.id, d.parcelId)} className="shrink-0">
                                      {d.pointed
                                        ? <CheckSquare className="w-4 h-4 text-green-400" />
                                        : <Square className="w-4 h-4 text-gray-500" />
                                      }
                                    </button>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-mono font-bold text-blue-400">{d.trackingId}</span>
                                        {st && (
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>
                                            {st.emoji} {st.label}
                                          </span>
                                        )}
                                        {d.addedDuringPointage && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-900/60 text-purple-300 font-semibold">+Ajouté</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-300 font-medium truncate">{d.receiverName || '—'}</p>
                                      <p className="text-[10px] text-gray-500">{d.originCity} · {d.weight} kg</p>
                                    </div>

                                    {/* Box stepper */}
                                    {multiBox && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => handleSetBoxes(arr.id, d.parcelId, (d.arrived || 0) - 1)}
                                          disabled={(d.arrived || 0) <= 0}
                                          className="w-5 h-5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 flex items-center justify-center transition">
                                          <Minus className="w-2.5 h-2.5" />
                                        </button>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[32px] text-center ${
                                          (d.arrived || 0) === 0 ? 'bg-red-900/40 text-red-300'
                                          : (d.arrived || 0) < total ? 'bg-orange-900/40 text-orange-300'
                                          : 'bg-green-900/40 text-green-300'
                                        }`}>{d.arrived || 0}/{total}</span>
                                        <button onClick={() => handleSetBoxes(arr.id, d.parcelId, (d.arrived || 0) + 1)}
                                          disabled={(d.arrived || 0) >= total}
                                          className="w-5 h-5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 flex items-center justify-center transition">
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    )}

                                    {/* Remove */}
                                    <button onClick={() => handleRemoveFromArrived(arr.id, d.parcelId)}
                                      className="w-6 h-6 rounded-lg bg-red-900/40 hover:bg-red-900/70 flex items-center justify-center transition shrink-0">
                                      <X className="w-3 h-3 text-red-400" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* ── Missing parcels ── */}
                          {edit.missing.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                                Manquants ({edit.missing.length})
                              </p>
                              <div className="space-y-1.5">
                                {edit.missing.map((d: any) => {
                                  const st = (SERVICE_TYPE_DISPLAY as any)[d.serviceType]
                                  return (
                                    <div key={d.parcelId} className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-red-900/20 border border-red-700/40">
                                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs font-mono font-bold text-blue-400">{d.trackingId || d.parcelId}</span>
                                          {st && (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>
                                              {st.emoji} {st.label}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-gray-400 truncate">{d.receiverName || '—'} · {d.originCity || '—'}</p>
                                      </div>
                                      <button
                                        onClick={() => handleRecoverMissing(arr.id, d.parcelId)}
                                        className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-green-800/60 hover:bg-green-700/80 text-green-300 transition shrink-0"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" /> Trouvé
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Ajouter un colis ── */}
                          <div className="bg-gray-700/40 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5 text-blue-400" /> Ajouter un colis
                            </p>
                            <div className="flex gap-2">
                              <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchParcel()}
                                placeholder="N° de tracking (ex: BG-XXXX)"
                                className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                onClick={handleSearchParcel}
                                disabled={searching || !searchQuery.trim()}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1"
                              >
                                {searching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                              </button>
                            </div>
                            {searchError && <p className="text-xs text-red-400">{searchError}</p>}
                            {searchResult && (
                              <div className="bg-gray-800 border border-blue-700/50 rounded-xl p-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-mono font-bold text-blue-400">{searchResult.trackingId}</p>
                                  <p className="text-sm font-semibold text-gray-200 truncate">{searchResult.receiver?.name}</p>
                                  <p className="text-xs text-gray-400">{searchResult.sender?.name} · {searchResult.originCity} → {searchResult.destinationCity}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">Statut : <span className="text-yellow-300">{searchResult.status}</span></p>
                                </div>
                                <button
                                  onClick={() => handleAddSearchResult(arr.id)}
                                  className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-xs font-bold transition shrink-0"
                                >
                                  Ajouter
                                </button>
                              </div>
                            )}
                          </div>

                          {/* ── Actions pointage ── */}
                          {pErr && <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{pErr}</p>}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSavePointage(arr.id, arr, false)}
                              disabled={saving || !edit.dirty}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition border bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 disabled:opacity-40"
                            >
                              {saving ? <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                              Enregistrer
                            </button>
                            <button
                              onClick={() => handleSavePointage(arr.id, arr, true)}
                              disabled={saving || arr.pointageStatus === 'done'}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition bg-green-700 hover:bg-green-600 text-white disabled:opacity-40"
                            >
                              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              Valider pointage
                            </button>
                          </div>

                          {arr.pointedBy && (
                            <p className="text-[10px] text-center text-gray-500">
                              Pointé par {arr.pointedBy} le {fmt(arr.pointedAt)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
