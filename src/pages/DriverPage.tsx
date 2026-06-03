import { useRef, useState, useEffect, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { Suspense, lazy } from 'react'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  updateParcelStatus, subscribeDriverParcels, subscribeDeliveryDriverParcels,
  collectCod, collectPortDu, rejectDeliveryAssignment,
  subscribeDriverOwnPortDuTransactions,
} from '../firebase/firestore'
import { findParcel } from '../firebase/parcelsRead'
import { markParcelAsReturned } from '../firebase/parcels'
import {
  confirmDeliveryAfterSignature,
  generateSignatureToken,
  submitDeliverySignature,
  subscribeDeliverySignature,
} from '../firebase/signatures'
import { STATUSES, STATUS_COLORS, COD_PAYMENT_TYPES, COD_STATUS, codCollectedLabel } from '../firebase/constants'
import {
  Truck, LogOut, ScanLine, Search, CheckCircle,
  ArrowLeft, MapPin, Package, X, Phone, Calendar, Home, Banknote, Menu, Printer,
  PenLine, QrCode, Building2, Camera, Upload, RotateCcw
} from 'lucide-react'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import { printDeliveryList } from '../utils/printDeliveryList'
import SignatureViewerModal from '../components/SignatureViewerModal'
import { fmt } from '../utils/formatNumber'

const QRCodeSVG = lazy(() => import('../components/QRCodeSvg'))

const SERVICE_TYPE_DISPLAY = {
  simple:    { label: 'Simple',    emoji: '📦', bg: 'bg-gray-700/50',    text: 'text-gray-300'    },
  especes:   { label: 'C/Espèces', emoji: '💵', bg: 'bg-green-900/40',   text: 'text-green-300'   },
  cheque:    { label: 'C/Chèque',  emoji: '📋', bg: 'bg-blue-900/40',    text: 'text-blue-300'    },
  traite:    { label: 'C/Traite',  emoji: '📝', bg: 'bg-indigo-900/40',  text: 'text-indigo-300'  },
  retour_bl: { label: 'C/BL',      emoji: '🧾', bg: 'bg-amber-900/40',   text: 'text-amber-300'   },
}

const parcelDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const filterByDate = (list: any, preset: any, from: any, to: any) => {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  return list.filter((p: any) => {
    const d = parcelDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}
const STATUS_ORDER = [
  'En cours de livraison', 'Arrivé en agence', 'En transit',
  'Initialisé', 'Livré', 'Retourné'
]

const statusLabelForDriverTab = (status: any, driverTab: any) =>
  driverTab === 'transport' && status === 'Arrivé en agence'
    ? 'Arrivé en agence de destination'
    : status
const normalizeRole = (value: any) => String(value || '').trim().toLowerCase()

export default function DriverPage() {
  const navigate   = useNavigate()
  const scannerRef = useRef<any>(null)
  const inputRef   = useRef<any>(null)
  const uid        = auth.currentUser?.uid

  const [profile, setProfile]             = useState<any>(null)
  const [tab, setTab]                     = useState('parcels')
  const [driverTab, setDriverTab]         = useState('transport') // 'transport' | 'delivery'
  const [menuOpen, setMenuOpen]           = useState(false)

  // Liste des colis
  const [parcels, setParcels]             = useState<any[]>([])
  const [deliveryParcels, setDeliveryParcels] = useState<any[]>([])
  const [loadingParcels, setLoadingParcels] = useState(false)
  const [filter, setFilter]               = useState('active') // 'active' | 'done' | 'all'
  const [datePreset, setDatePreset]       = useState('all')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [missionSearch, setMissionSearch] = useState('')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<any[]>([])
  const [bulkStatus, setBulkStatus]       = useState('')
  const [bulkBusy, setBulkBusy]           = useState(false)
  const [bulkError, setBulkError]         = useState('')

  // Modal mise à jour statut
  const [statusModal, setStatusModal]     = useState<any>(null)
  const [rejectModal, setRejectModal]     = useState<any>(null)

  // Scanner
  // Port dû
  const [myPortDuTxs, setMyPortDuTxs]   = useState<any[]>([])
  const [users, setUsers]                 = useState<any[]>([])

  // Filtres COD
  const [codSearchQuery, setCodSearchQuery] = useState('')
  const [codStatusFilter, setCodStatusFilter] = useState('all') // 'all' | 'collected' | 'remis' | 'received' | 'paid'
  const [codTypeFilter, setCodTypeFilter] = useState('all') // 'all' | 'especes' | 'cheque' | 'traite' | 'bon_livraison'
  const [codDateFilter, setCodDateFilter] = useState('all') // 'all' | 'today' | 'week' | 'month'

  const [scanning, setScanning]           = useState(false)
  const [scannedParcel, setScannedParcel] = useState<any>(null)
  const [newStatus, setNewStatus]         = useState('')
  const [msg, setMsg]                     = useState<any>(null)
  const [scanLoading, setScanLoading]     = useState(false)
  const [searchId, setSearchId]           = useState('')

  // Signature électronique
  const [signatureModal,   setSignatureModal]   = useState<any>(null)
  const [viewSignature,    setViewSignature]     = useState<any>(null)
  // signatureModal = { parcel, token, url, receivedSig, codPaymentType, confirming, done, error, stampMode, driverStamp, driverCompanyName, stampSubmitting, handSubmitting, driverHandSignatureEmpty }
  const signatureUnsubRef = useRef<any>(null)
  const stampInputRef     = useRef<any>(null)
  const handSignatureCanvasRef = useRef<any>(null)
  const handSignatureDrawing   = useRef(false)
  const handSignatureLastPos   = useRef<any>(null)
  const isLivreur = normalizeRole(profile?.role) === 'livreur'
  const workerLabel = isLivreur ? 'Livreur' : 'Chauffeur'
  const isDeliveryView = driverTab === 'delivery'

  const sortByStatus = (list: any) =>
    [...list].sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.status)
      const ib = STATUS_ORDER.indexOf(b.status)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  useEffect(() => {
    if (!uid) return
    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) setProfile(snap.data())
      },
      err => console.warn('DriverPage user profile listener error:', err.code)
    )
    setLoadingParcels(true)
    const unsubTransport = subscribeDriverParcels(uid, (data: any) => {
      setParcels(sortByStatus(data))
      setLoadingParcels(false)
    })
    const unsubDelivery = subscribeDeliveryDriverParcels(uid, (data: any) => {
      setDeliveryParcels(sortByStatus(data))
    })
    const unsubPortDu = subscribeDriverOwnPortDuTransactions(uid, setMyPortDuTxs)
    setUsers([])
    return () => { unsubProfile(); unsubTransport(); unsubDelivery(); unsubPortDu() }
  }, [uid])

  useEffect(() => {
    if (normalizeRole(profile?.role) === 'livreur') setDriverTab('delivery')
  }, [profile?.role])

  const resolveDeliveryManagerName = (deliveries: any) => {
    const explicitNames = [...new Set(deliveries
      .map((p: any) => p.deliveryAssignedBy || p.destinationAgentName || p.agentName)
      .filter((name: any) => name && name !== profile?.name)
    )]
    if (explicitNames.length > 0) return explicitNames.join(' / ')

    const city = deliveries.find((p: any) => p.destinationCity || p.receiver?.city)?.destinationCity
      || deliveries.find((p: any) => p.receiver?.city)?.receiver?.city
      || profile?.city
      || ''
    const sameCityStaff = users.filter(u =>
      u.city === city &&
      u.id !== uid &&
      !['chauffeur', 'livreur'].includes(u.role)
    )
    const manager = sameCityStaff.find(u => u.role === 'chef_agence')
      || sameCityStaff.find(u => u.role === 'agent')
      || sameCityStaff[0]
    return manager?.name || '-'
  }

  // Mise à jour statut depuis la liste
  const handleStatusSave = async () => {
    if (!statusModal) return
    const { parcel, status, codPaymentType, note } = statusModal
    const name = profile?.name || workerLabel

    // RETOUR FOND et port dû : uniquement par le chauffeur de livraison assigné
    const isDeliveryDriver = parcel.deliveryDriverId === uid
    // COD : uniquement pour les colis livrés (pas de COD pour retours)
    const needsCod = isDeliveryDriver
      && parcel.codAmount > 0
      && status === 'Livré'
      && (parcel.codStatus === 'pending' || !parcel.codStatus)
    // Port dû : pour les colis livrés ET retournés (si non payé à l'expédition)
    const needsPortDu = isDeliveryDriver
      && parcel.portType === 'port_du'
      && parcel.portStatus !== 'collected'
      && (status === 'Livré' || status === 'Retourné')

    // RETOUR FOND requires a payment type — warn and block only if RETOUR FOND needs action
    if (needsCod && !codPaymentType) {
      setStatusModal((m: any) => ({ ...m, error: 'Sélectionnez le mode de paiement RETOUR FOND avant de confirmer.' }))
      return
    }
    setStatusModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      // Handle RETOUR FOND and port dû independently so one never blocks the other
      if (needsCod) {
        await collectCod(parcel.id, codPaymentType, name)
      }
      if (needsPortDu) {
        // Marquer collecté par le chauffeur — la caisse sera créditée au versement du chauffeur à l'agent
        await collectPortDu(parcel.id, name, uid || '')
      }
      // Si c'est un colis retourné (wasReturned) et qu'on le livre, c'est "Retour finalisé"
      const finalStatus = (parcel.wasReturned && status === 'Livré') ? 'Retour finalisé' : status
      await updateParcelStatus(parcel.id, finalStatus, note ? { note } : {})
      const updateList = (ps: any) => ps.map((p: any) =>
        p.id === parcel.id
          ? {
              ...p, status: finalStatus,
              ...(needsCod   && { codStatus: 'collected', codPaymentType }),
              ...(needsPortDu && { portStatus: 'collected' }),
            }
          : p
      )
      setParcels(updateList)
      setDeliveryParcels(updateList)
      setStatusModal(null)
    } catch {
      setStatusModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la mise à jour.' }))
    }
  }

  const handleRejectDelivery = async () => {
    if (!rejectModal?.parcel) return
    const { parcel, note } = rejectModal
    const name = profile?.name || workerLabel
    setRejectModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      // CORRECTION : Marquer le colis comme "Retourné" au lieu de juste rejeter
      const returnNote = note || `Non livré - retour par ${name}`
      await markParcelAsReturned(parcel, { note: returnNote })

      // Mettre à jour l'UI locale
      const updateList = (ps: any) => ps.map((p: any) =>
        p.id === parcel.id ? { ...p, status: 'Retourné' } : p
      )
      setParcels(updateList)
      setDeliveryParcels(updateList)
      setRejectModal(null)
    } catch (err: any) {
      setRejectModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors du retour.' }))
    }
  }

  // Scanner
  const startScan = async () => {
    setMsg(null)
    setScanning(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner: any = new Html5Qrcode('qr-reader-driver')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded: any) => {
          await scanner.stop()
          setScanning(false)
          await lookupParcel(decoded.trim())
        },
        () => {}
      )
    } catch {
      setScanning(false)
      setMsg({ type: 'error', text: "Impossible d'accéder à la caméra. Saisie manuelle." })
    }
  }

  const stopScan = async () => {
    try { await scannerRef.current?.stop() } catch (_: any) {}
    setScanning(false)
  }

  const lookupParcel = async (trackingId: any) => {
    setScanLoading(true)
    setMsg(null)
    const q = String(trackingId || '').trim().toLowerCase()
    const localFound = [...parcels, ...deliveryParcels].find(p =>
      String(p.trackingId || '').toLowerCase() === q ||
      String(p.sender?.nic || '').toLowerCase() === q
    )
    const found = localFound || await findParcel(trackingId)
    if (found) { setScannedParcel(found); setNewStatus(found.status) }
    else setMsg({ type: 'error', text: `❌ Aucun colis : ${trackingId}` })
    setScanLoading(false)
  }

  const handleScanUpdate = async () => {
    if (!scannedParcel || !newStatus) return
    setScanLoading(true)
    try {
      // Si c'est un colis retourné et qu'on le livre, c'est "Retourné à l'expéditeur"
      const finalStatus = (scannedParcel.wasReturned && newStatus === 'Livré') ? 'Retourné à l\'expéditeur' : newStatus
      await updateParcelStatus(scannedParcel.id, finalStatus)
      setParcels(ps => ps.map(p => p.id === scannedParcel.id ? { ...p, status: finalStatus } : p))
      setMsg({ type: 'success', text: `✅ Statut mis à jour : "${finalStatus}"` })
      setScannedParcel(null); setNewStatus('')
    } catch {
      setMsg({ type: 'error', text: 'Erreur lors de la mise à jour.' })
    } finally {
      setScanLoading(false)
    }
  }

  const activeList      = driverTab === 'transport' ? parcels : deliveryParcels
  const doneStatuses    = driverTab === 'transport'
    ? ['Arrivé en agence', 'Livré', 'Retourné']
    : ['Livré', 'Retourné', 'En transit retour']
  const activeParcels   = activeList.filter(p => !doneStatuses.includes(p.status))
  const doneParcels     = activeList.filter(p =>  doneStatuses.includes(p.status))
  const byStatus        = filter === 'active' ? activeParcels
                        : filter === 'done'   ? doneParcels
                        : activeList
  const dateFilteredParcels = filterByDate(byStatus, datePreset, dateFrom, dateTo)
  const missionQuery = missionSearch.trim().toLowerCase()
  const statusFilteredParcels = parcelStatusFilter === 'all' ? dateFilteredParcels : dateFilteredParcels.filter((p: any) => p.status === parcelStatusFilter)
  const filteredParcels = !missionQuery ? statusFilteredParcels : statusFilteredParcels.filter((p: any) => {
    const codPayment = COD_PAYMENT_TYPES.find(t => t.key === p.codPaymentType)
    const codState = COD_STATUS[p.codStatus || 'pending']
    return [
      p.trackingId,
      p.status,
      p.sender?.name,
      p.sender?.nic,
      p.sender?.tel,
      p.sender?.city,
      p.receiver?.name,
      p.receiver?.tel,
      p.receiver?.city,
      p.destinationCity,
      p.originCity,
      p.chauffeurName,
      p.deliveryDriverName,
      p.serviceType,
      p.portType,
      p.portStatus,
      p.weight,
      p.price,
      p.codAmount,
      codPayment?.label,
      codPayment?.key,
      codState?.label,
    ].filter(v => v !== undefined && v !== null).join(' ').toLowerCase().includes(missionQuery)
  })

  const handlePrintMyDeliveries = async () => {
    const deliveries = driverTab === 'delivery'
      ? filteredParcels.filter((p: any) => p.deliveryDriverId === uid)
      : []
    if (!deliveries.length) return

    // Charger les signatures pour les colis livrés
    const signaturesMap = {}
    await Promise.all(
      deliveries
        .filter((p: any) => p.status === 'Livré')
        .map(async (p: any) => {
          try {
            const snap = await getDoc(doc(db, 'deliverySignatures', p.id))
            if (snap.exists()) (signaturesMap as any)[p.id] = snap.data().signatureDataUrl
          } catch { /* pas de signature */ }
        })
    )

    const enriched = deliveries.map((p: any) => ({
      ...p,
      signatureDataUrl: (signaturesMap as any)[p.id] || null,
    }))

    const managerName = resolveDeliveryManagerName(deliveries)
    printDeliveryList([{
      id: uid,
      name: profile?.name || workerLabel,
      matricule: profile?.matricule || '',
      parcels: enriched,
    }], profile, {
      title: 'LISTE DES LIVRAISONS',
      subtitle: `Livraisons filtrées - ${profile?.city || ''}`,
      managerName,
    })
  }

  const canBulkManageParcel = (parcel: any) => {
    if (['Livré', 'Retourné', 'En transit retour'].includes(parcel.status)) return false
    return driverTab === 'transport'
      ? parcel.chauffeurId === uid
      : parcel.deliveryDriverId === uid
  }

  const bulkManageableParcels = filteredParcels.filter(canBulkManageParcel)
  const selectedBulkParcels = bulkSelectedIds
    .map(id => bulkManageableParcels.find((p: any) => p.id === id))
    .filter(Boolean)
  const allBulkSelected = bulkManageableParcels.length > 0 && selectedBulkParcels.length === bulkManageableParcels.length
  const bulkStatusOptions = driverTab === 'transport'
    ? ['Arrivé en agence', 'Retourné']
    : ['En cours de livraison', 'Livré', 'Retourné']
  const openDeliveryStatusModal = (parcel: any, status = parcel.status) => setStatusModal({
    parcel,
    status,
    note: '',
    codPaymentType: parcel.serviceType === 'retour_bl' ? 'bon_livraison' : (parcel.serviceType || 'especes'),
    loading: false,
    error: ''
  })
  const quickSetStatus = async (parcel: any, status: any) => {
    try {
      // Si c'est un colis retourné et qu'on le livre, c'est "Retourné à l'expéditeur"
      const finalStatus = (parcel.wasReturned && status === 'Livré') ? 'Retourné à l\'expéditeur' : status
      await updateParcelStatus(parcel.id, finalStatus, { note: `${finalStatus} par ${profile?.name || workerLabel}` })
      const patchList = (list: any) => list.map((p: any) => p.id === parcel.id ? { ...p, status: finalStatus } : p)
      setParcels(patchList)
      setDeliveryParcels(patchList)
    } catch {
      setMsg({ type: 'error', text: 'Erreur lors de la mise à jour.' })
    }
  }

  const handleBulkStatusSave = async () => {
    setBulkError('')
    if (selectedBulkParcels.length === 0) {
      setBulkError('Sélectionnez au moins un colis.')
      return
    }
    if (!bulkStatus) {
      setBulkError('Choisissez le statut à appliquer.')
      return
    }
    if (bulkStatus === 'Livré') {
      const blocked = selectedBulkParcels.filter(p =>
        (p.codAmount > 0 && (p.codStatus === 'pending' || !p.codStatus)) ||
        (p.portType === 'port_du' && p.portStatus !== 'collected')
      )
      if (blocked.length > 0) {
        setBulkError(`${blocked.length} colis nécessitent un encaissement RETOUR FOND/port dû. Traitez-les individuellement.`)
        return
      }
    }

    setBulkBusy(true)
    try {
      await Promise.all(selectedBulkParcels.map(parcel => {
        // Si c'est un colis retourné et qu'on le livre, c'est "Retourné à l'expéditeur"
        const finalStatus = (parcel.wasReturned && bulkStatus === 'Livré') ? 'Retourné à l\'expéditeur' : bulkStatus
        return updateParcelStatus(parcel.id, finalStatus, {
          note: `Mise à jour groupée par ${profile?.name || 'chauffeur'}`
        })
      }))
      const patchList = (list: any) => list.map((p: any) => {
        const selected = selectedBulkParcels.find(sel => sel.id === p.id)
        if (!selected) return p
        // Appliquer le même logic finalStatus
        const finalStatus = (selected.wasReturned && bulkStatus === 'Livré') ? 'Retourné à l\'expéditeur' : bulkStatus
        return { ...p, status: finalStatus }
      })
      setParcels(patchList)
      setDeliveryParcels(patchList)
      setBulkSelectedIds([])
      setBulkStatus('')
    } catch {
      setBulkError('Erreur lors de la mise à jour groupée.')
    } finally {
      setBulkBusy(false)
    }
  }

  // ── Signature électronique ───────────────────────────────────────────────────

  const handleRequestSignature = useCallback(async (parcel: any) => {
    try {
      const token = await generateSignatureToken(parcel.id)
      const url   = `${window.location.origin}/sign/${parcel.id}/${token}`
      setSignatureModal({ parcel, token, url, receivedSig: null, codPaymentType: '', confirming: false, done: false, error: '', stampMode: 'qr', driverStamp: null, driverCompanyName: '', stampSubmitting: false, handSubmitting: false, driverHandSignatureEmpty: true })
    } catch {
      setMsg({ type: 'error', text: 'Impossible de générer le QR code. Réessayez.' })
    }
  }, [])

  // Écoute en temps réel la signature du client dès que le modal est ouvert
  useEffect(() => {
    if (!signatureModal?.parcel?.id || signatureModal.receivedSig || signatureModal.done) return
    if (signatureUnsubRef.current) signatureUnsubRef.current()
    signatureUnsubRef.current = subscribeDeliverySignature(signatureModal.parcel.id, (sig: any) => {
      if (sig) setSignatureModal((m: any) => m ? { ...m, receivedSig: sig } : m)
    })
    return () => { if (signatureUnsubRef.current) signatureUnsubRef.current() }
  }, [signatureModal?.parcel?.id])

  useEffect(() => {
    if (signatureModal?.stampMode !== 'handwritten' || !handSignatureCanvasRef.current) return
    const canvas = handSignatureCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#1d4ed8'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    handSignatureDrawing.current = false
    handSignatureLastPos.current = null
    setSignatureModal((m: any) => m ? { ...m, driverHandSignatureEmpty: true, error: '' } : m)
  }, [signatureModal?.stampMode])

  const getHandSignaturePos = useCallback((e: any) => {
    const canvas = handSignatureCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const src = e.touches?.[0] || e
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    }
  }, [])

  const startHandSignature = useCallback((e: any) => {
    e.preventDefault()
    if (!handSignatureCanvasRef.current) return
    handSignatureDrawing.current = true
    const pos = getHandSignaturePos(e)
    handSignatureLastPos.current = pos
    const ctx = handSignatureCanvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
    setSignatureModal((m: any) => m ? { ...m, driverHandSignatureEmpty: false, error: '' } : m)
  }, [getHandSignaturePos])

  const drawHandSignature = useCallback((e: any) => {
    e.preventDefault()
    if (!handSignatureDrawing.current || !handSignatureLastPos.current || !handSignatureCanvasRef.current) return
    const pos = getHandSignaturePos(e)
    const ctx = handSignatureCanvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(handSignatureLastPos.current.x, handSignatureLastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    handSignatureLastPos.current = pos
  }, [getHandSignaturePos])

  const stopHandSignature = useCallback(() => {
    handSignatureDrawing.current = false
    handSignatureLastPos.current = null
  }, [])

  const clearHandSignature = () => {
    const canvas = handSignatureCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setSignatureModal((m: any) => m ? { ...m, driverHandSignatureEmpty: true, error: '' } : m)
  }

  const handleDriverStampSubmit = async () => {
    const { parcel, token, driverStamp, driverCompanyName } = signatureModal
    if (!driverStamp)             { setSignatureModal((m: any) => ({ ...m, error: 'Photographiez ou importez le cachet.' })); return }
    if (!driverCompanyName.trim()) { setSignatureModal((m: any) => ({ ...m, error: 'Saisissez le nom de la société.' })); return }
    setSignatureModal((m: any) => ({ ...m, stampSubmitting: true, error: '' }))
    try {
      await submitDeliverySignature(parcel.id, token, driverStamp, {
        signatureType: 'company_stamp',
        companyName: driverCompanyName.trim(),
      })
      // Le listener temps-réel va détecter la signature et passer à l'étape de confirmation
    } catch (err: any) {
      setSignatureModal((m: any) => ({ ...m, stampSubmitting: false, error: err.message || 'Erreur lors de la soumission.' }))
    }
  }

  const handleDriverHandSignatureSubmit = async () => {
    const { parcel, token, driverHandSignatureEmpty } = signatureModal
    if (driverHandSignatureEmpty || !handSignatureCanvasRef.current) {
      setSignatureModal((m: any) => ({ ...m, error: 'Faites signer le destinataire dans le cadre.' }))
      return
    }
    setSignatureModal((m: any) => ({ ...m, handSubmitting: true, error: '' }))
    try {
      await submitDeliverySignature(parcel.id, token, handSignatureCanvasRef.current.toDataURL('image/png'), {
        signatureType: 'personal',
        companyName: '',
      })
      // Le listener temps-reel detecte la signature et passe a l'etape de confirmation.
    } catch (err: any) {
      setSignatureModal((m: any) => ({ ...m, handSubmitting: false, error: err.message || 'Erreur lors de la soumission.' }))
    }
  }

  const handleConfirmWithSignature = async () => {
    if (!signatureModal) return
    const { parcel, codPaymentType } = signatureModal
    const name = profile?.name || workerLabel
    const isDeliveryDriver = parcel.deliveryDriverId === uid
    const needsCod = isDeliveryDriver
      && parcel.codAmount > 0
      && (parcel.codStatus === 'pending' || !parcel.codStatus)
    const needsPortDu = isDeliveryDriver
      && parcel.portType === 'port_du'
      && parcel.portStatus !== 'collected'
    if (needsCod && !codPaymentType) {
      setSignatureModal((m: any) => ({ ...m, error: 'Sélectionnez le mode de paiement RETOUR FOND avant de confirmer.' }))
      return
    }
    setSignatureModal((m: any) => ({ ...m, confirming: true, error: '' }))
    try {
      if (needsCod) await collectCod(parcel.id, codPaymentType, name)
      if (needsPortDu) await collectPortDu(parcel.id, name, uid || '')
      await confirmDeliveryAfterSignature(parcel.id, name)
      const patchList = (ps: any) => ps.map((p: any) =>
        p.id === parcel.id
          ? { ...p, status: 'Livré', ...(needsCod && { codStatus: 'collected', codPaymentType }) }
          : p
      )
      setParcels(patchList)
      setDeliveryParcels(patchList)
      if (signatureUnsubRef.current) signatureUnsubRef.current()
      setSignatureModal((m: any) => ({ ...m, confirming: false, done: true }))
      setTimeout(() => setSignatureModal(null), 2500)
    } catch {
      setSignatureModal((m: any) => ({ ...m, confirming: false, error: 'Erreur lors de la confirmation. Réessayez.' }))
    }
  }

  useEffect(() => {
    if (!signatureModal?.receivedSig || signatureModal.confirming || signatureModal.done) return
    const parcel = signatureModal.parcel
    const isDeliveryDriver = parcel.deliveryDriverId === uid
    const needsCod = isDeliveryDriver
      && parcel.codAmount > 0
      && (parcel.codStatus === 'pending' || !parcel.codStatus)
    const needsPortDu = isDeliveryDriver
      && parcel.portType === 'port_du'
      && parcel.portStatus !== 'collected'
    if (!needsCod && !needsPortDu) handleConfirmWithSignature()
  }, [signatureModal?.receivedSig, signatureModal?.confirming, signatureModal?.done])

  const scanColors: any = scannedParcel
    ? (STATUS_COLORS[scannedParcel.status] || STATUS_COLORS['Initialisé'])
    : null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <CompanyContact />

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg px-2 py-0.5">
                <img src="/LOGO.jpg" alt="BG Express" className="h-8 object-contain" />
              </div>
              <div className="flex items-center gap-1.5 border-l border-gray-700 pl-2">
                <Truck className="w-4 h-4 text-blue-400" />
                <span className="font-bold hidden sm:inline">Interface {workerLabel}</span>
              </div>
              {profile?.name && (
                <span className="text-gray-400 text-sm hidden md:inline">— {profile.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-800 transition"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {/* Desktop tabs */}
          <div className="hidden md:flex border-t border-gray-800">
            <button
              onClick={() => setTab('parcels')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${tab === 'parcels' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              Mes missions
              {(parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length + deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length) > 0 && (
                <span className="ml-2 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length + deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('scan')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${tab === 'scan' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              Scanner
            </button>
            <button
              onClick={() => setTab('portdu')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${tab === 'portdu' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              📮 Ports dus
              {myPortDuTxs.filter(t => t.status === 'pending').length > 0 && (
                <span className="ml-2 bg-orange-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {myPortDuTxs.filter(t => t.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('cod')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${tab === 'cod' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              💰 Mes COD
              {deliveryParcels.filter(p => parseFloat(p.codAmount || 0) > 0 && ['collected', 'remis'].includes(p.codStatus || '')).length > 0 && (
                <span className="ml-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {deliveryParcels.filter(p => parseFloat(p.codAmount || 0) > 0 && ['collected', 'remis'].includes(p.codStatus || '')).length}
                </span>
              )}
            </button>
          </div>
          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-800 py-2 space-y-1">
              <button
                onClick={() => { setTab('parcels'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'parcels' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                <Truck className="w-4 h-4" />
                Mes missions
                {(parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length + deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length) > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length + deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab('scan'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'scan' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                <ScanLine className="w-4 h-4" /> Scanner
              </button>
              <button
                onClick={() => { setTab('portdu'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'portdu' ? 'bg-orange-600/20 text-orange-400' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                <Banknote className="w-4 h-4" /> Ports dus
                {myPortDuTxs.filter(t => t.status === 'pending').length > 0 && (
                  <span className="ml-auto bg-orange-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {myPortDuTxs.filter(t => t.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab('cod'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'cod' ? 'bg-green-600/20 text-green-400' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                <Banknote className="w-4 h-4" /> 💰 Mes COD
                {deliveryParcels.filter(p => parseFloat(p.codAmount || 0) > 0 && ['collected', 'remis'].includes(p.codStatus || '')).length > 0 && (
                  <span className="ml-auto bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {deliveryParcels.filter(p => parseFloat(p.codAmount || 0) > 0 && ['collected', 'remis'].includes(p.codStatus || '')).length}
                  </span>
                )}
              </button>
              <div className="border-t border-gray-800 mt-2 pt-2 px-4 py-2">
                <button
                  onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition"
                >
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 pb-16">

        {/* ── MES MISSIONS ── */}
        {tab === 'parcels' && (
          <div className="space-y-3 mt-2">

            {/* Type sub-tabs */}
            {!isLivreur ? (
              <div className="flex bg-gray-800 border border-gray-700 rounded-xl p-1">
                <button
                  onClick={() => setDriverTab('transport')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition ${driverTab === 'transport' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <Truck className="w-4 h-4" />
                  <span className="hidden sm:inline">Trajets inter-villes</span>
                  <span className="sm:hidden">Inter-villes</span>
                  {parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${driverTab === 'transport' ? 'bg-white/20' : 'bg-gray-700'}`}>
                      {parcels.filter(p => !['Livré','Retourné'].includes(p.status)).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDriverTab('delivery')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition ${driverTab === 'delivery' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">Livraisons locales</span>
                  <span className="sm:hidden">Locales</span>
                  {deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${driverTab === 'delivery' ? 'bg-white/20' : 'bg-gray-700'}`}>
                      {deliveryParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length}
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 to-amber-400/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-950/30">
                    <Home className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-white">Mes livraisons</p>
                    <p className="text-sm text-orange-100">{activeParcels.length} colis à livrer aujourd'hui</p>
                  </div>
                </div>
              </div>
            )}

            {/* Info banner */}
            {!isLivreur && <div className={`rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${driverTab === 'transport' ? 'bg-blue-900/50 text-blue-300 border border-blue-800' : 'bg-orange-900/50 text-orange-300 border border-orange-800'}`}>
              {driverTab === 'transport'
                ? <><Truck className="w-3.5 h-3.5 shrink-0" /> Transport entre agences — remettez le colis à l'agence de destination</>
                : <><Home className="w-3.5 h-3.5 shrink-0" /> Livraison au domicile du client — traitez ou refusez chaque colis séparément</>
              }
            </div>}

            {/* Recherche */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={missionSearch}
                  onChange={e => setMissionSearch(e.target.value)}
                  placeholder={driverTab === 'transport'
                    ? 'Rechercher trajet, colis, ville, agent...'
                    : 'Rechercher livraison, client, tel, RETOUR FOND...'}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-10 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                {missionSearch && (
                  <button
                    onClick={() => setMissionSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition"
                    title="Effacer la recherche"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {missionSearch && (
                <p className="mt-2 text-xs text-gray-500">
                  {filteredParcels.length} resultat(s) sur {dateFilteredParcels.length}
                </p>
              )}
            </div>

            {/* Filtres + refresh */}
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-800 border border-gray-700 rounded-xl p-1 flex-1">
                {[
                  { key: 'active', label: driverTab === 'transport' ? `En route (${activeParcels.length})` : `À livrer (${activeParcels.length})` },
                  { key: 'done',   label: `Terminés (${doneParcels.length})` },
                  { key: 'all',    label: 'Tous' },
                ].map(({ key, label }) => (
                  <button key={key}
                    onClick={() => setFilter(key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${filter === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium p-2.5 bg-gray-800 border border-gray-700 rounded-xl">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
              </span>
            </div>

            {driverTab === 'delivery' && !isLivreur && (
              <button
                onClick={handlePrintMyDeliveries}
                disabled={filteredParcels.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:hover:bg-orange-600 text-white text-sm font-bold py-3 rounded-xl transition"
              >
                <Printer className="w-4 h-4" /> Imprimer la liste des livraisons
              </button>
            )}

            {bulkManageableParcels.length > 0 && !isLivreur && (
              <div className={`rounded-2xl border p-4 space-y-3 ${
                driverTab === 'transport'
                  ? 'bg-blue-950/30 border-blue-800'
                  : 'bg-orange-950/30 border-orange-800'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-bold flex items-center gap-2 ${
                      driverTab === 'transport' ? 'text-blue-300' : 'text-orange-300'
                    }`}>
                      <Truck className="w-4 h-4" /> Gestion globale
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedBulkParcels.length} sélectionné(s) sur {bulkManageableParcels.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkError('')
                      setBulkSelectedIds(allBulkSelected ? [] : bulkManageableParcels.map((p: any) => p.id))
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                      allBulkSelected
                        ? 'bg-gray-800 text-gray-300 border border-gray-700'
                        : driverTab === 'transport'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    {allBulkSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <select
                    value={bulkStatus}
                    onChange={e => { setBulkStatus(e.target.value); setBulkError('') }}
                    className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Choisir un statut global</option>
                    {bulkStatusOptions.map(status => (
                      <option key={status} value={status}>{statusLabelForDriverTab(status, driverTab)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkStatusSave}
                    disabled={bulkBusy || selectedBulkParcels.length === 0 || !bulkStatus}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition flex items-center justify-center gap-2 ${
                      driverTab === 'transport' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                    }`}
                  >
                    {bulkBusy
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mise à jour...</>
                      : <><CheckCircle className="w-4 h-4" /> Appliquer</>
                    }
                  </button>
                </div>
                {bulkError && (
                  <p className="text-xs font-semibold text-red-300 bg-red-950/40 border border-red-800 rounded-xl px-3 py-2">
                    {bulkError}
                  </p>
                )}
              </div>
            )}

            {/* Filtre date */}
            {!isLivreur && <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                {[
                  { key: 'all',    label: 'Tout' },
                  { key: 'today',  label: "Aujourd'hui" },
                  { key: 'week',   label: '7 jours' },
                  { key: 'month',  label: 'Ce mois' },
                  { key: 'custom', label: 'Personnalisé' },
                ].map(({ key, label }) => (
                  <button key={key}
                    onClick={() => setDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      datePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-6">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 flex-1"
                  />
                  <span className="text-gray-500 text-xs shrink-0">→</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 flex-1"
                  />
                </div>
              )}
            </div>}

            {/* Filtre statut */}
            {!isLivreur && <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase shrink-0 mr-1">Statut :</span>
              <button
                onClick={() => setParcelStatusFilter('all')}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition border ${parcelStatusFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-700 text-gray-400 border-transparent hover:bg-gray-600'}`}
              >Tous</button>
              {STATUSES.map(s => {
                const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                const active = parcelStatusFilter === s
                return (
                  <button key={s} onClick={() => setParcelStatusFilter(s)}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition whitespace-nowrap border ${active ? `${sc.bg} ${sc.text} border-current` : 'bg-gray-700 text-gray-400 border-transparent hover:bg-gray-600'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {s}
                  </button>
                )
              })}
            </div>}

            {loadingParcels ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredParcels.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  {filter === 'active' ? 'Aucun colis à livrer' : 'Aucun colis terminé'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredParcels.map((parcel: any) => {
                  const sc   = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                  const done = ['Livré', 'Retourné'].includes(parcel.status)
                  const bulkManageable = canBulkManageParcel(parcel)
                  const bulkSelected = bulkSelectedIds.includes(parcel.id)
                  return (
                    <div key={parcel.id}
                      className={`${isDeliveryView ? 'bg-white text-slate-950 rounded-2xl p-4 border border-orange-100 shadow-xl shadow-black/20' : 'bg-gray-800 rounded-xl p-4 border'} transition ${
                        done ? (isDeliveryView ? 'border-emerald-300' : 'border-gray-700 opacity-60') : (isDeliveryView ? 'border-orange-200' : 'border-gray-600')
                      }`}
                    >
                      {bulkManageable && !isLivreur && (
                        <label className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                          bulkSelected
                            ? driverTab === 'transport'
                              ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                              : 'bg-orange-900/50 border-orange-600 text-orange-200'
                            : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}>
                          <input
                            type="checkbox"
                            checked={bulkSelected}
                            onChange={e => {
                              setBulkError('')
                              setBulkSelectedIds(prev => e.target.checked
                                ? [...new Set([...prev, parcel.id])]
                                : prev.filter(id => id !== parcel.id)
                              )
                            }}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-xs font-bold">Sélection gestion globale</span>
                        </label>
                      )}
                      {/* Statut + type */}
                      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-black ${
                            isDeliveryView && parcel.status === 'Livré'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : isDeliveryView && parcel.status === 'En cours de livraison'
                                ? 'bg-orange-100 text-orange-900 border border-orange-300'
                                : isDeliveryView
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : `${sc.bg} ${sc.text}`
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {parcel.status}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${isDeliveryView ? 'bg-orange-100 text-orange-900 border border-orange-200' : driverTab === 'transport' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>
                            {driverTab === 'transport' ? <><Truck className="w-3 h-3" /> Transport</> : <><Home className="w-3 h-3" /> Livraison</>}
                          </span>
                          {(() => {
                            const st = (SERVICE_TYPE_DISPLAY as any)[parcel.serviceType]
                            if (!st) return null
                            const lightService = isDeliveryView
                              ? parcel.serviceType === 'simple'
                                ? 'bg-slate-100 text-slate-900 border-slate-300'
                                : parcel.serviceType === 'especes'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : parcel.serviceType === 'cheque'
                                    ? 'bg-blue-100 text-blue-900 border-blue-300'
                                    : parcel.serviceType === 'traite'
                                      ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                      : 'bg-amber-100 text-amber-900 border-amber-300'
                              : `${st.bg} ${st.text} border-current/20`
                            return (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold border ${lightService}`}>
                                {st.emoji} {st.label}
                              </span>
                            )
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Badge RETOUR permanent pour les colis retournés */}
                          {parcel.wasReturned && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300">
                              🔄 RETOUR
                            </span>
                          )}
                          <span className={`font-mono text-xs ${isDeliveryView ? 'text-slate-700 font-bold' : 'text-gray-500'}`}>{parcel.trackingId}</span>
                        </div>
                      </div>

                      {/* Destinataire */}
                      <div className={`${isDeliveryView ? 'flex flex-col' : 'flex items-start justify-between'} gap-3`}>
                        <div className="flex-1">
                          <p className={`font-semibold text-base ${isDeliveryView ? 'text-slate-950 text-xl font-black' : 'text-white'}`}>{parcel.receiver?.name}</p>

                          {/* Téléphone cliquable */}
                          <a href={`tel:${parcel.receiver?.tel}`}
                            className={`inline-flex items-center gap-1.5 font-medium mt-1 ${isDeliveryView ? 'text-lg text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2' : 'text-sm text-blue-400 hover:text-blue-300'}`}
                          >
                            <Phone className="w-3.5 h-3.5" /> {parcel.receiver?.tel}
                          </a>

                          {/* Adresse complète */}
                          {parcel.receiver?.address && (
                            <div className={`flex items-start gap-1.5 mt-2 border rounded-xl px-3 py-2 ${isDeliveryView ? 'text-sm text-amber-950 bg-amber-50 border-amber-300 font-black' : 'text-xs text-amber-300 bg-amber-900/30 border-amber-700/40'}`}>
                              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{parcel.receiver.address}, <span className="font-semibold">{parcel.receiver?.city}</span></span>
                            </div>
                          )}
                          {!parcel.receiver?.address && (
                            <div className={`flex items-center gap-1 mt-1 ${isDeliveryView ? 'text-sm text-slate-700 font-semibold' : 'text-xs text-gray-400'}`}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{parcel.sender?.city}</span>
                              <span className="text-gray-600">→</span>
                              <span className="font-medium text-gray-300">{parcel.receiver?.city}</span>
                            </div>
                          )}

                          <div className={`flex items-center gap-3 mt-2 ${isDeliveryView ? 'text-sm text-slate-700 font-bold' : 'text-xs text-gray-500'}`}>
                            <span>{parcel.weight} kg</span>
                            <span>{parcel.price} DH</span>
                          </div>
                          {(parcel.natureOfGoods || (parcel.arrivedNbColis ?? parcel.nbColis) > 1) && (
                            <div className="flex items-center gap-2 mt-1.5">
                              {parcel.natureOfGoods && (
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full font-medium">
                                  📦 {parcel.natureOfGoods}
                                </span>
                              )}
                              {(parcel.arrivedNbColis ?? parcel.nbColis) > 1 && (
                                <span className="inline-flex items-center gap-1 text-xs bg-gray-700/40 text-gray-300 border border-gray-600/40 px-2 py-0.5 rounded-full font-medium">
                                  × {parcel.arrivedNbColis ?? parcel.nbColis} colis
                                  {parcel.arrivedNbColis != null && parcel.arrivedNbColis < parcel.nbColis && (
                                    <span className="text-orange-400 font-bold">/{parcel.nbColis}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                          {/* COD : NE PAS afficher pour les colis retournés */}
                          {parcel.codAmount > 0 && parcel.status !== 'Retourné' && (() => {
                            const cs  = COD_STATUS[parcel.codStatus || 'pending']
                            const cpt = COD_PAYMENT_TYPES.find(t => t.key === parcel.codPaymentType)
                            const isCollected = parcel.codStatus === 'collected'
                            const bg   = isCollected && cpt ? cpt.darkBg   : cs.darkBg
                            const txt  = isCollected && cpt ? cpt.darkText : cs.darkText
                            const lbl  = isCollected
                              ? codCollectedLabel(parcel.codPaymentType)
                              : cs.label
                            return (
                              <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${bg} ${txt} border border-current/20`}>
                                <span>{cpt?.emoji || '💵'}</span>
                                RETOUR FOND {parcel.codAmount} DH — {lbl}
                              </div>
                            )
                          })()}
                          {parcel.portType === 'port_du' && (
                            <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                              parcel.portStatus === 'collected'
                                ? 'bg-green-900/30 text-green-300 border-green-700/40'
                                : 'bg-orange-900/30 text-orange-300 border-orange-700/40'
                            }`}>
                              📮 Port dû {parcel.price > 0 ? `${parcel.price} DH` : ''}
                              {parcel.portStatus === 'collected' ? ' — Encaissé ✓' : ' — À encaisser'}
                            </div>
                          )}
                          {parcel.portType === 'port_en_compte' && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-900/30 text-purple-300 border-purple-700/40">
                              🗂️ En compte {parcel.price > 0 ? `${parcel.price} DH` : ''}
                            </div>
                          )}
                        </div>

                        {/* Voir signature — colis livré par signature */}
                        {done && driverTab === 'delivery' && parcel.signatureConfirmedAt && (
                          <div className="shrink-0">
                            <button
                              onClick={() => setViewSignature(parcel)}
                              className={`${isDeliveryView ? 'flex items-center justify-center gap-2 text-sm font-black px-4 py-3 rounded-2xl border border-violet-300 text-violet-900 bg-violet-50 hover:bg-violet-100' : 'flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-violet-500/40 text-violet-300 bg-violet-950/30 hover:bg-violet-900/50'} transition`}
                            >
                              <PenLine className="w-3.5 h-3.5" /> Signature
                            </button>
                          </div>
                        )}

                        {/* Actions statut / refus */}
                        {!done && (
                          <div className={`${isLivreur ? 'w-full mt-4 grid grid-cols-2 gap-2' : 'shrink-0 flex flex-col gap-2'}`}>
                            {isLivreur ? (
                              <>
                                <button
                                  onClick={() => handleRequestSignature(parcel)}
                                  className="col-span-2 flex items-center justify-center gap-2 text-base font-black px-4 py-4 rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 transition"
                                >
                                  <PenLine className="w-5 h-5" /> Livrer et faire signer
                                </button>
                                {parcel.status !== 'En cours de livraison' && (
                                  <button
                                    onClick={() => quickSetStatus(parcel, 'En cours de livraison')}
                                    className="flex items-center justify-center gap-2 text-sm font-black px-3 py-3 rounded-2xl text-orange-700 bg-orange-50 border border-orange-200 transition"
                                  >
                                    <Truck className="w-4 h-4" /> En route
                                  </button>
                                )}
                                <button
                                  onClick={() => setRejectModal({ parcel, note: '', loading: false, error: '' })}
                                  className={`${parcel.status !== 'En cours de livraison' ? '' : 'col-span-2'} text-sm font-black px-3 py-3 rounded-2xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition`}
                                >
                                  Pas livré
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => openDeliveryStatusModal(parcel)}
                                  className={`text-white text-xs font-semibold px-3 py-2 rounded-lg transition ${driverTab === 'transport' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                                >
                                  Mettre à jour
                                </button>
                                {driverTab === 'delivery' && (
                                  <button
                                    onClick={() => setRejectModal({ parcel, note: '', loading: false, error: '' })}
                                    className="text-xs font-semibold px-3 py-2 rounded-lg border border-red-500/40 text-red-300 bg-red-950/30 hover:bg-red-900/50 transition"
                                  >
                                    Refuser
                                  </button>
                                )}
                                {driverTab === 'delivery' && !['Livré', 'Retourné'].includes(parcel.status) && parcel.deliveryDriverId === uid && (
                                  <button
                                    onClick={() => handleRequestSignature(parcel)}
                                    className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-violet-500/40 text-violet-300 bg-violet-950/30 hover:bg-violet-900/50 transition"
                                    title="Générer le QR de signature"
                                  >
                                    <PenLine className="w-3.5 h-3.5" /> Signer
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Historique résumé */}
                      {parcel.history?.length > 0 && (
                        <div className={`mt-3 pt-3 space-y-1 ${isDeliveryView ? 'border-t border-slate-200' : 'border-t border-gray-700'}`}>
                          {[...parcel.history].reverse().slice(0, 3).map((h, i) => (
                            <div key={i} className={`flex items-center gap-2 text-xs ${isDeliveryView ? 'text-slate-700 font-semibold' : 'text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[h.status]?.dot || 'bg-gray-500'}`} />
                              <span className={`font-medium ${isDeliveryView ? 'text-slate-700' : 'text-gray-400'}`}>{h.status}</span>
                              <span className="ml-auto">
                                {new Date(h.timestamp).toLocaleString('fr-MA', {
                                  day: '2-digit', month: 'short',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>
                          ))}
                          {parcel.history.length > 3 && (
                            <p className={`text-xs pl-3 ${isDeliveryView ? 'text-slate-700 font-semibold' : 'text-gray-600'}`}>
                              + {parcel.history.length - 3} événement(s) antérieur(s)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PORTS DUS ── */}
        {tab === 'portdu' && (() => {
          const myPortDuParcels = deliveryParcels
            .filter(p => p.portType === 'port_du' && p.portStatus === 'collected')
            .sort((a, b) => {
              const ta = a.portCollectedAt?.toDate ? a.portCollectedAt.toDate() : new Date(a.portCollectedAt || 0)
              const tb = b.portCollectedAt?.toDate ? b.portCollectedAt.toDate() : new Date(b.portCollectedAt || 0)
              return tb - ta
            })
          const totalCollected = myPortDuParcels.reduce((s, p) => s + (parseFloat(p.price) || 0), 0)
          const receivedByChefParcels = myPortDuParcels.filter(p => p.portChefReceivedAt)
          const totalReceivedByChef = receivedByChefParcels.reduce((s, p) => s + (parseFloat(p.price) || 0), 0)
          const balance = totalCollected - totalReceivedByChef
          
          const fmtDate = (ts: any) => {
            if (!ts) return '—'
            const d = ts.toDate ? ts.toDate() : new Date(ts)
            return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          }
          return (
            <div className="mt-2 space-y-3">

              {/* KPIs */}
              <div className="grid grid-cols-3 bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Collecté</p>
                  <p className="text-lg font-black text-orange-400">{fmt(totalCollected)}</p>
                  <p className="text-[9px] text-gray-500">DH</p>
                </div>
                <div className="px-3 py-3 text-center border-x border-gray-700">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Reçu chef</p>
                  <p className="text-lg font-black text-green-400">{fmt(totalReceivedByChef)}</p>
                  <p className="text-[9px] text-gray-500">DH</p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Solde dû</p>
                  <p className={`text-lg font-black ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(balance)}</p>
                  <p className="text-[9px] text-gray-500">DH</p>
                </div>
              </div>

              <div className="bg-gray-800 border border-orange-800/50 rounded-2xl p-4 space-y-2">
                <p className="text-sm font-bold text-orange-300 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Remise directe au chef d'agence
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Le port dû est validé par le chef colis par colis. Aucun versement groupé n'est créé ici, pour éviter les doublons en caisse.
                </p>
              </div>

              {/* Colis port dû collectés */}
              {myPortDuParcels.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                    <span className="text-base">📦</span>
                    <span className="text-sm font-bold text-gray-200">Colis collectés ({myPortDuParcels.length})</span>
                    <span className="ml-auto text-xs font-bold text-orange-400">{fmt(balance)} DH à remettre</span>
                  </div>
                  <div className="divide-y divide-gray-700/50">
                    {myPortDuParcels.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{p.receiver?.name || '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.trackingId}</p>
                          <p className="text-[10px] text-gray-500">{fmtDate(p.portCollectedAt || p.updatedAt)}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <p className="text-sm font-black text-orange-400">{fmt(p.price)} DH</p>
                          {p.portChefReceivedAt ? (
                            <span className="text-[10px] bg-green-900/40 text-green-300 border border-green-700/40 px-2 py-0.5 rounded-full font-semibold">Reçu chef</span>
                          ) : (
                            <span className="text-[10px] bg-orange-900/40 text-orange-300 border border-orange-700/40 px-2 py-0.5 rounded-full font-semibold">À remettre</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {myPortDuParcels.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Aucun port dû collecté pour l'instant</p>
                </div>
              )}

              {receivedByChefParcels.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                    <span className="text-base">✅</span>
                    <span className="text-sm font-bold text-gray-200">Reçus par le chef</span>
                    <span className="ml-auto text-xs font-bold text-green-400">{fmt(totalReceivedByChef)} DH</span>
                  </div>
                  <div className="divide-y divide-gray-700/50">
                    {receivedByChefParcels.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-green-300">{p.receiver?.name || '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.trackingId}</p>
                          {p.portChefReceivedBy && <p className="text-[10px] text-gray-500">Reçu par {p.portChefReceivedBy}</p>}
                          <p className="text-[10px] text-gray-500">{fmtDate(p.portChefReceivedAt)}</p>
                        </div>
                        <span className="text-sm font-black text-green-400 shrink-0">{fmt(p.price)} DH</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )
        })()}

        {/* ── MES COD ── */}
        {tab === 'cod' && (() => {
          // Helper pour obtenir le statut d'un COD
          const getCodStatusKey = (p: any) => {
            if (p.codSenderPaid) return 'paid'
            if (p.codReceivedByChef) return 'received'
            if (p.codRemisBy || p.codStatus === 'remis') return 'remis'
            if (p.codStatus === 'collected') return 'collected'
            return 'pending'
          }

          // Tous les COD du livreur
          let myCodParcels = deliveryParcels
            .filter(p => parseFloat(p.codAmount || 0) > 0)

          // Appliquer les filtres
          // 1. Recherche par tracking ou nom
          if (codSearchQuery.trim()) {
            const q = codSearchQuery.toLowerCase()
            myCodParcels = myCodParcels.filter(p =>
              p.trackingId?.toLowerCase().includes(q) ||
              p.receiver?.name?.toLowerCase().includes(q)
            )
          }

          // 2. Filtre par statut
          if (codStatusFilter !== 'all') {
            myCodParcels = myCodParcels.filter(p => getCodStatusKey(p) === codStatusFilter)
          }

          // 3. Filtre par type de paiement
          if (codTypeFilter !== 'all') {
            myCodParcels = myCodParcels.filter(p => p.codPaymentType === codTypeFilter)
          }

          // 4. Filtre par date
          if (codDateFilter !== 'all') {
            const now = new Date()
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
            const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0)
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

            myCodParcels = myCodParcels.filter(p => {
              const date = p.codCollectedAt?.toDate ? p.codCollectedAt.toDate() : new Date(p.codCollectedAt || 0)
              if (codDateFilter === 'today') return date >= todayStart
              if (codDateFilter === 'week') return date >= weekStart
              if (codDateFilter === 'month') return date >= monthStart
              return true
            })
          }

          // Trier par date de collecte (plus récent en premier)
          myCodParcels.sort((a, b) => {
            const ta = a.codCollectedAt?.toDate ? a.codCollectedAt.toDate() : new Date(a.codCollectedAt || 0)
            const tb = b.codCollectedAt?.toDate ? b.codCollectedAt.toDate() : new Date(b.codCollectedAt || 0)
            return tb - ta
          })

          const codStatusLabel = (p: any) => {
            if (p.codSenderPaid) return { label: '🎯 Règlé', bg: 'bg-purple-600', desc: 'Chef a payé l\'expéditeur', color: 'text-purple-300' }
            if (p.codReceivedByChef) return { label: '✅ Réceptionné', bg: 'bg-green-600', desc: 'Chef a confirmé réception', color: 'text-green-300' }
            if (p.codRemisBy || p.codStatus === 'remis') return { label: '🟠 Versé au chef', bg: 'bg-orange-600', desc: 'En attente de réception', color: 'text-orange-300' }
            if (p.codStatus === 'collected') return { label: '🟡 Collecté', bg: 'bg-yellow-600', desc: 'À verser au chef', color: 'text-yellow-300' }
            return { label: '⚪ En attente', bg: 'bg-gray-600', desc: 'À collecter', color: 'text-gray-300' }
          }

          const totalCollected = myCodParcels.filter(p => ['collected', 'remis'].includes(p.codStatus || '')).reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0)
          const totalReceived = myCodParcels.filter(p => p.codReceivedByChef).reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0)
          const totalPaid = myCodParcels.filter(p => p.codSenderPaid).reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0)

          const fmtDate = (ts: any) => {
            if (!ts) return '—'
            const d = ts.toDate ? ts.toDate() : new Date(ts)
            return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          }

          return (
            <div className="mt-2 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3">
                  <p className="text-yellow-300 text-xs font-medium">Collectés (à verser)</p>
                  <p className="text-2xl font-black text-yellow-200">{fmt(totalCollected)} DH</p>
                  <p className="text-[10px] text-yellow-400/60">
                    {myCodParcels.filter(p => ['collected', 'remis'].includes(p.codStatus || '')).length} colis
                  </p>
                </div>
                <div className="bg-green-900/30 border border-green-700 rounded-xl p-3">
                  <p className="text-green-300 text-xs font-medium">Réceptionnés par chef</p>
                  <p className="text-2xl font-black text-green-200">{fmt(totalReceived)} DH</p>
                  <p className="text-[10px] text-green-400/60">
                    {myCodParcels.filter(p => p.codReceivedByChef).length} colis
                  </p>
                </div>
              </div>

              {/* Filtres */}
              <div className="space-y-3">
                {/* Recherche */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Rechercher par N° ou nom..."
                    value={codSearchQuery}
                    onChange={e => setCodSearchQuery(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {codSearchQuery && (
                    <button
                      onClick={() => setCodSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filtres par statut */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setCodStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      codStatusFilter === 'all'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setCodStatusFilter('collected')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      codStatusFilter === 'collected'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    🟡 Collectés
                  </button>
                  <button
                    onClick={() => setCodStatusFilter('remis')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      codStatusFilter === 'remis'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    🟠 Versés
                  </button>
                  <button
                    onClick={() => setCodStatusFilter('received')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      codStatusFilter === 'received'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    ✅ Réceptionnés
                  </button>
                  <button
                    onClick={() => setCodStatusFilter('paid')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      codStatusFilter === 'paid'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    🎯 Réglés
                  </button>
                </div>

                {/* Filtres par type et date */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={codTypeFilter}
                    onChange={e => setCodTypeFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">Tous types</option>
                    <option value="especes">💵 Espèces</option>
                    <option value="cheque">📋 Chèque</option>
                    <option value="traite">📝 Traite</option>
                    <option value="bon_livraison">🧾 BL</option>
                    <option value="retour_bl">🧾 Retour BL</option>
                  </select>

                  <select
                    value={codDateFilter}
                    onChange={e => setCodDateFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">Toutes dates</option>
                    <option value="today">Aujourd'hui</option>
                    <option value="week">7 derniers jours</option>
                    <option value="month">Ce mois</option>
                  </select>
                </div>
              </div>

              {/* Liste COD */}
              <div className="space-y-3">
                <h3 className="text-gray-300 font-bold text-sm flex items-center gap-2">
                  💰 Résultats ({myCodParcels.length})
                </h3>

                {myCodParcels.length === 0 && (
                  <div className="text-center py-12 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
                    <p className="text-3xl mb-2">💰</p>
                    <p className="text-sm">Aucun COD collecté</p>
                  </div>
                )}

                {myCodParcels.map((p: any) => {
                  const status = codStatusLabel(p)
                  const receivedDate = p.codReceivedByChefAt
                    ? (p.codReceivedByChefAt.toDate ? p.codReceivedByChefAt.toDate() : new Date(p.codReceivedByChefAt))
                    : null
                  const collectedDate = p.codCollectedAt?.toDate ? p.codCollectedAt.toDate() : new Date(p.codCollectedAt || 0)

                  return (
                    <div key={p.id} className="bg-gray-800/70 border border-gray-700 rounded-xl p-4 space-y-3">
                      {/* En-tête */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">{p.trackingId}</p>
                          <p className="text-gray-400 text-xs truncate">{p.receiver?.name}</p>
                          {p.codCollectedAt && (
                            <p className="text-gray-500 text-xs">
                              Collecté le {fmtDate(collectedDate)}
                            </p>
                          )}
                        </div>
                        <p className="text-green-400 font-black text-lg shrink-0">{fmt(p.codAmount)} DH</p>
                      </div>

                      {/* Type */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded">
                          {p.codPaymentType === 'especes' ? '💵 Espèces' :
                           p.codPaymentType === 'cheque' ? '📋 Chèque' :
                           p.codPaymentType === 'traite' ? '📝 Traite' :
                           p.codPaymentType === 'bon_livraison' ? '🧾 BL' :
                           p.codPaymentType === 'retour_bl' ? '🧾 Retour BL' : '💵 Espèces'}
                        </span>
                      </div>

                      {/* Statut */}
                      <div className={`${status.bg} rounded-lg p-3`}>
                        <p className="text-white font-bold text-sm">{status.label}</p>
                        <p className="text-white/80 text-xs mt-0.5">{status.desc}</p>
                        {receivedDate && (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <p className="text-white/90 text-xs font-semibold">
                              ✅ Accusé de réception
                            </p>
                            <p className="text-white/70 text-xs mt-0.5">
                              Reçu le {fmtDate(receivedDate)}
                            </p>
                            {p.codReceivedByChefBy && (
                              <p className="text-white/70 text-xs">
                                par {p.codReceivedByChefBy}
                              </p>
                            )}
                          </div>
                        )}
                        {p.codSenderPaid && p.codSenderPaidAt && (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <p className="text-white/90 text-xs font-semibold">
                              🎯 Expéditeur payé
                            </p>
                            <p className="text-white/70 text-xs mt-0.5">
                              le {fmtDate(p.codSenderPaidAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── SCANNER ── */}
        {tab === 'scan' && (
          <div className="mt-2 space-y-4">
            {msg && (
              <div className={`rounded-xl p-3 text-sm text-center font-medium ${
                msg.type === 'success'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>{msg.text}</div>
            )}

            {scanLoading && (
              <div className="flex justify-center my-6">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!scannedParcel && !scanLoading && (
              <div className="space-y-4">
                <div
                  className={`rounded-2xl overflow-hidden border-2 ${scanning ? 'border-blue-500' : 'border-gray-700'} bg-black`}
                  style={{ minHeight: scanning ? 280 : 0 }}
                >
                  <div id="qr-reader-driver" className={scanning ? 'block' : 'hidden'} />
                </div>

                {scanning ? (
                  <button onClick={stopScan}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 py-4 rounded-xl font-semibold transition"
                  >
                    ⏹ Arrêter le scan
                  </button>
                ) : (
                  <button onClick={startScan}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 py-5 rounded-xl font-bold text-lg transition"
                  >
                    <ScanLine className="w-6 h-6" /> Scanner un colis
                  </button>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700" />
                  </div>
                  <div className="relative text-center">
                    <span className="bg-gray-900 px-3 text-xs text-gray-500">OU SAISIR MANUELLEMENT</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={searchId}
                    onChange={e => setSearchId(e.target.value)}
                    placeholder="LMA-XXXXXX"
                    onKeyDown={e => e.key === 'Enter' && lookupParcel(searchId)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm font-mono placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => lookupParcel(searchId)}
                    className="bg-gray-700 hover:bg-gray-600 px-4 rounded-xl transition"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {scannedParcel && !scanLoading && (
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700">
                  <div className={`p-4 ${scanColors.bg}`}>
                    <p className={`text-sm font-semibold ${scanColors.text}`}>
                      Statut actuel : {scannedParcel.status}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">{scannedParcel.trackingId}</p>
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Destinataire</span>
                      <span className="font-semibold">{scannedParcel.receiver.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Téléphone</span>
                      <a href={`tel:${scannedParcel.receiver.tel}`} className="text-blue-400">
                        {scannedParcel.receiver.tel}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Destination
                      </span>
                      <span className="font-bold text-white">{scannedParcel.receiver.city}</span>
                    </div>
                    {(() => {
                      const st = (SERVICE_TYPE_DISPLAY as any)[scannedParcel.serviceType]
                      if (!st) return null
                      return (
                        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mt-2 ${st.bg}`}>
                          <span className={`text-sm font-bold ${st.text}`}>{st.emoji} {st.label}</span>
                        </div>
                      )
                    })()}
                    {/* COD : NE PAS afficher pour les colis retournés */}
                    {scannedParcel.codAmount > 0 && scannedParcel.status !== 'Retourné' && (
                      <div className="flex justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2 mt-2">
                        <span className="text-yellow-400 font-semibold">💵 RETOUR FOND à collecter</span>
                        <span className="text-yellow-300 font-bold">{scannedParcel.codAmount} DH</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
                  <p className="text-sm text-gray-400 mb-3 font-medium">Mettre à jour le statut :</p>
                  <div className="space-y-2">
                    {STATUSES.map(s => (
                      <button key={s} onClick={() => setNewStatus(s)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition border ${
                          newStatus === s
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {statusLabelForDriverTab(s, driverTab)}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleScanUpdate}
                  disabled={!newStatus || newStatus === scannedParcel.status}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 py-4 rounded-xl font-bold transition"
                >
                  <CheckCircle className="w-5 h-5" /> Confirmer la mise à jour
                </button>

                <button
                  onClick={() => { setScannedParcel(null); setMsg(null); setSearchId('') }}
                  className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl text-sm font-medium transition"
                >
                  <ArrowLeft className="w-4 h-4" /> Scanner un autre colis
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Visionneuse signature */}
      {viewSignature && (
        <SignatureViewerModal
          parcelId={viewSignature.id}
          trackingId={viewSignature.trackingId}
          recipientName={viewSignature.receiver?.name}
          onClose={() => setViewSignature(null)}
        />
      )}

      {/* ── MODAL SIGNATURE ÉLECTRONIQUE ── */}
      {signatureModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[95vh]">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-700 shrink-0">
              <div>
                <h3 className="font-bold text-white flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-violet-400" />
                  Signature électronique
                </h3>
                <p className="text-xs font-mono text-violet-400 mt-0.5">{signatureModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {signatureModal.parcel.receiver?.name} · {signatureModal.parcel.receiver?.city}
                </p>
              </div>
              {!signatureModal.confirming && !signatureModal.done && (
                <button
                  onClick={() => { if (signatureUnsubRef.current) signatureUnsubRef.current(); setSignatureModal(null) }}
                  className="p-2 hover:bg-gray-700 rounded-xl transition"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">

              {/* ✅ Livraison confirmée */}
              {signatureModal.done ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-white font-bold text-lg">Livraison confirmée !</p>
                  <p className="text-gray-400 text-sm mt-1">La signature du client a été enregistrée.</p>
                </div>

              ) : signatureModal.receivedSig ? (
                /* Signature reçue — confirmation par le chauffeur */
                <div className="space-y-4">
                  <div className="bg-green-900/30 border border-green-700/40 rounded-2xl p-4 text-center">
                    <p className="text-green-300 font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Signature reçue du client !
                    </p>
                    <p className="text-green-400/70 text-xs mt-1">
                      Signé à {new Date(signatureModal.receivedSig.signedAt).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Aperçu de la signature */}
                  <div className="bg-white rounded-2xl p-3 border border-gray-200">
                    <p className="text-xs text-gray-400 mb-2 text-center font-medium">Signature du destinataire</p>
                    <img
                      src={signatureModal.receivedSig.signatureDataUrl}
                      alt="Signature"
                      className="w-full h-24 object-contain"
                    />
                    <div className="border-t border-gray-200 mt-2 pt-2 text-center">
                      <p className="text-xs text-gray-500">{signatureModal.receivedSig.recipientName}</p>
                    </div>
                  </div>

                  {/* RETOUR FOND si nécessaire */}
                  {(() => {
                    const { parcel } = signatureModal
                    const isDD = parcel.deliveryDriverId === uid
                    const hasCod = isDD && parcel.codAmount > 0 && (parcel.codStatus === 'pending' || !parcel.codStatus)
                    const hasPortDu = isDD && parcel.portType === 'port_du' && parcel.portStatus !== 'collected'
                    if (!hasCod && !hasPortDu) return null
                    return (
                      <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-2xl p-4 space-y-3">
                        <p className="text-sm font-bold text-yellow-300 flex items-center gap-2">
                          <Banknote className="w-4 h-4" /> À encaisser du client
                        </p>
                        {hasCod && (
                          <div className="space-y-1.5">
                            {(() => {
                              const st = (SERVICE_TYPE_DISPLAY as any)[parcel.serviceType]
                              if (!st) return null
                              return (
                                <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold border border-current/20 ${st.bg} ${st.text}`}>
                                  {st.emoji} {st.label}
                                </div>
                              )
                            })()}
                            <div className="flex justify-between text-sm">
                              <span className="text-yellow-400/80">💰 RETOUR FOND</span>
                              <span className="text-yellow-200 font-bold">{parcel.codAmount} DH</span>
                            </div>
                          </div>
                        )}
                        {hasPortDu && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-400/80">📮 Port dû</span>
                            <span className="text-orange-200 font-bold">{parcel.price || 0} DH</span>
                          </div>
                        )}
                        {hasCod && (
                          <>
                            <p className="text-xs text-yellow-500/80">Mode de paiement RETOUR FOND :</p>
                            <div className="grid grid-cols-2 gap-2">
                              {COD_PAYMENT_TYPES.map(pt => (
                                <button key={pt.key}
                                  onClick={() => setSignatureModal((m: any) => ({ ...m, codPaymentType: pt.key, error: '' }))}
                                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition border ${
                                    signatureModal.codPaymentType === pt.key
                                      ? 'bg-yellow-500 text-gray-900 border-yellow-400'
                                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                  }`}
                                >
                                  <span>{pt.emoji}</span> {pt.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}

                  {signatureModal.error && (
                    <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm">
                      ⚠️ {signatureModal.error}
                    </div>
                  )}

                  <button
                    onClick={handleConfirmWithSignature}
                    disabled={signatureModal.confirming}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition"
                  >
                    {signatureModal.confirming
                      ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Confirmation...</>
                      : <><CheckCircle className="w-5 h-5" /> Confirmer la livraison</>
                    }
                  </button>
                </div>

              ) : (
                /* En attente — toggle QR / Cachet */
                <div className="space-y-4">

                  {/* Toggle */}
                  <div className="grid grid-cols-3 rounded-2xl bg-gray-900 p-1 gap-1">
                    <button
                      onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'qr', error: '' }))}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${signatureModal.stampMode === 'qr' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                      <QrCode className="w-4 h-4" /> QR Code
                    </button>
                    <button
                      onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'handwritten', error: '' }))}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${signatureModal.stampMode === 'handwritten' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                      <PenLine className="w-4 h-4" /> Signature
                    </button>
                    <button
                      onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'company', error: '' }))}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${signatureModal.stampMode === 'company' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                      <Building2 className="w-4 h-4" /> Cachet société
                    </button>
                  </div>

                  {signatureModal.stampMode === 'company' ? (
                    /* ── Mode cachet société (chauffeur capture) ── */
                    <div className="space-y-3">
                      <input
                        value={signatureModal.driverCompanyName}
                        onChange={e => setSignatureModal((m: any) => ({ ...m, driverCompanyName: e.target.value, error: '' }))}
                        placeholder="Nom de la société *"
                        className="w-full bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
                      />

                      <input
                        ref={stampInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => setSignatureModal((m: any) => ({ ...m, driverStamp: (ev.target as any).result, error: '' }))
                          reader.readAsDataURL(file)
                        }}
                      />

                      {signatureModal.driverStamp ? (
                        <div className="relative bg-orange-950/30 border border-orange-700/40 rounded-2xl p-3">
                          <img src={signatureModal.driverStamp} alt="Cachet" className="w-full max-h-36 object-contain rounded-xl" />
                          <button
                            onClick={() => setSignatureModal((m: any) => ({ ...m, driverStamp: null }))}
                            className="absolute top-2 right-2 bg-gray-800 rounded-full p-1.5 text-gray-400 hover:text-red-400 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { if (stampInputRef.current) { stampInputRef.current.setAttribute('capture', 'environment'); stampInputRef.current.click() } }}
                            className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-orange-700/50 bg-orange-950/20 text-orange-400 hover:bg-orange-950/40 transition"
                          >
                            <Camera className="w-7 h-7" />
                            <span className="text-xs font-semibold">Photographier</span>
                          </button>
                          <button
                            onClick={() => { if (stampInputRef.current) { stampInputRef.current.removeAttribute('capture'); stampInputRef.current.click() } }}
                            className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800 transition"
                          >
                            <Upload className="w-7 h-7" />
                            <span className="text-xs font-semibold">Importer</span>
                          </button>
                        </div>
                      )}

                      <div className="bg-orange-950/20 border border-orange-800/30 rounded-2xl px-4 py-2.5 text-xs text-orange-400">
                        📌 Faites signer et apposer le cachet de la société sur papier, puis photographiez-le.
                      </div>

                      {signatureModal.error && (
                        <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm">
                          ⚠️ {signatureModal.error}
                        </div>
                      )}

                      <button
                        onClick={handleDriverStampSubmit}
                        disabled={signatureModal.stampSubmitting || !signatureModal.driverStamp}
                        className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition"
                      >
                        {signatureModal.stampSubmitting
                          ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi...</>
                          : <><CheckCircle className="w-5 h-5" /> Valider le cachet</>
                        }
                      </button>
                    </div>

                  ) : signatureModal.stampMode === 'handwritten' ? (
                    <div className="space-y-3">
                      <div className="bg-blue-900/20 border border-blue-700/30 rounded-2xl px-4 py-3 text-center">
                        <p className="text-blue-300 text-sm font-medium">
                          Faites signer le destinataire directement sur l'ecran du livreur.
                        </p>
                      </div>

                      <div className="relative bg-blue-50 border-2 border-dashed border-blue-300 rounded-2xl overflow-hidden">
                        {signatureModal.driverHandSignatureEmpty && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <PenLine className="w-8 h-8 text-blue-200 mb-2" />
                            <p className="text-xs text-blue-300 font-medium">Signature manuscrite ici</p>
                          </div>
                        )}
                        <canvas
                          ref={handSignatureCanvasRef}
                          width={600}
                          height={220}
                          className="w-full touch-none cursor-crosshair block"
                          style={{ touchAction: 'none' }}
                          onMouseDown={startHandSignature}
                          onMouseMove={drawHandSignature}
                          onMouseUp={stopHandSignature}
                          onMouseLeave={stopHandSignature}
                          onTouchStart={startHandSignature}
                          onTouchMove={drawHandSignature}
                          onTouchEnd={stopHandSignature}
                        />
                      </div>

                      <button
                        onClick={clearHandSignature}
                        className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-400 font-medium transition mx-auto"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Effacer
                      </button>

                      {signatureModal.error && (
                        <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm">
                          {signatureModal.error}
                        </div>
                      )}

                      <button
                        onClick={handleDriverHandSignatureSubmit}
                        disabled={signatureModal.handSubmitting || signatureModal.driverHandSignatureEmpty}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition"
                      >
                        {signatureModal.handSubmitting
                          ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi...</>
                          : <><CheckCircle className="w-5 h-5" /> Valider la signature</>
                        }
                      </button>
                    </div>

                  ) : (
                    /* ── Mode QR code (client signe sur son téléphone) ── */
                    <>
                      <div className="bg-violet-900/20 border border-violet-700/30 rounded-2xl px-4 py-3 text-center">
                        <p className="text-violet-300 text-sm font-medium">
                          Montrez ce QR code au client pour qu'il signe la réception
                        </p>
                      </div>
                      <div className="flex justify-center">
                        <div className="bg-white p-5 rounded-3xl shadow-xl">
                          <Suspense fallback={<div className="w-[220px] h-[220px] bg-gray-100 rounded-2xl" />}>
                            <QRCodeSVG value={signatureModal.url} size={220} level="M" includeMargin={false} />
                          </Suspense>
                        </div>
                      </div>
                      <div className="bg-gray-900 rounded-2xl px-4 py-3 text-center">
                        <p className="text-[10px] text-gray-500 mb-1">Lien de signature</p>
                        <p className="text-xs font-mono text-gray-300 break-all leading-relaxed">{signatureModal.url}</p>
                      </div>
                      <div className="flex items-center justify-center gap-3 py-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <p className="text-xs text-gray-400">En attente de la signature du client...</p>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Refus livraison locale */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <div>
                <h3 className="font-bold text-white">Refuser cette livraison</h3>
                <p className="text-xs font-mono text-red-300 mt-0.5">{rejectModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {rejectModal.parcel.receiver?.name} - {rejectModal.parcel.receiver?.city}
                </p>
              </div>
              <button onClick={() => setRejectModal(null)} className="p-2 hover:bg-gray-700 rounded-xl transition">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {rejectModal.error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm">
                  {rejectModal.error}
                </div>
              )}
              <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 text-sm text-red-100">
                Le colis reviendra a l'agent destination. Il pourra choisir un autre chauffeur.
              </div>
              <textarea
                value={rejectModal.note}
                onChange={e => setRejectModal((m: any) => ({ ...m, note: e.target.value }))}
                placeholder="Motif du refus (optionnel)"
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none min-h-[90px]"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRejectModal(null)}
                  className="py-3 rounded-xl border border-gray-600 text-gray-300 font-semibold hover:bg-gray-700 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRejectDelivery}
                  disabled={rejectModal.loading}
                  className="py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2"
                >
                  {rejectModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Refus...</>
                    : 'Confirmer le refus'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL STATUT ── */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between p-5 border-b border-gray-700 shrink-0">
              <div>
                <h3 className="font-bold text-white">Mettre à jour le statut</h3>
                <p className="text-xs font-mono text-blue-400 mt-0.5">{statusModal.parcel.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {statusModal.parcel.receiver.name} · {statusModal.parcel.receiver.city}
                </p>
              </div>
              <button onClick={() => setStatusModal(null)} className="p-2 hover:bg-gray-700 rounded-xl transition">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {statusModal.error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm">
                  ⚠️ {statusModal.error}
                </div>
              )}

              <div className="space-y-2">
                {STATUSES.map(s => {
                  const sc       = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                  const selected = statusModal.status === s
                  return (
                    <button key={s}
                      onClick={() => setStatusModal((m: any) => ({ ...m, status: s }))}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                        selected
                          ? `${sc.bg} ${sc.text} border-current`
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${sc.dot} shrink-0`} />
                      {statusLabelForDriverTab(s, driverTab)}
                      {selected && <CheckCircle className="w-4 h-4 ml-auto" />}
                    </button>
                  )
                })}
              </div>

              {/* RETOUR FOND + port dû — uniquement pour le chauffeur de livraison assigné */}
              {statusModal.parcel.deliveryDriverId === uid && statusModal.status === 'Livré' && (() => {
                const hasCod    = statusModal.parcel.codAmount > 0 && (statusModal.parcel.codStatus === 'pending' || !statusModal.parcel.codStatus)
                const hasPortDu = statusModal.parcel.portType === 'port_du' && statusModal.parcel.portStatus !== 'collected'
                if (!hasCod && !hasPortDu) return null
                const total = (hasCod ? statusModal.parcel.codAmount : 0) + (hasPortDu ? (statusModal.parcel.price || 0) : 0)
                return (
                  <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-bold text-yellow-300 flex items-center gap-2">
                      <Banknote className="w-4 h-4" /> À encaisser du client
                    </p>
                    <div className="space-y-1">
                      {hasCod && (
                        <div className="space-y-1.5">
                          {(() => {
                            const st = (SERVICE_TYPE_DISPLAY as any)[statusModal.parcel.serviceType]
                            if (!st) return null
                            return (
                              <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold border border-current/20 ${st.bg} ${st.text}`}>
                                {st.emoji} {st.label}
                              </div>
                            )
                          })()}
                          <div className="flex justify-between text-sm">
                            <span className="text-yellow-400/80">💰 RETOUR FOND</span>
                            <span className="text-yellow-200 font-bold">{statusModal.parcel.codAmount} DH</span>
                          </div>
                        </div>
                      )}
                      {hasPortDu && (
                        <div className="flex justify-between text-sm">
                          <span className="text-orange-400/80">📮 Port dû</span>
                          <span className="text-orange-200 font-bold">{statusModal.parcel.price || 0} DH</span>
                        </div>
                      )}
                      {hasCod && hasPortDu && (
                        <div className="flex justify-between text-sm border-t border-yellow-600/30 pt-1 mt-1">
                          <span className="text-white font-semibold">Total</span>
                          <span className="text-white font-black">{total} DH</span>
                        </div>
                      )}
                    </div>
                    {hasCod && (
                      <>
                        <p className="text-xs text-yellow-500/80">Mode de paiement RETOUR FOND :</p>
                        <div className="grid grid-cols-2 gap-2">
                          {COD_PAYMENT_TYPES.map(pt => (
                            <button key={pt.key}
                              onClick={() => setStatusModal((m: any) => ({ ...m, codPaymentType: pt.key }))}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition border ${
                                statusModal.codPaymentType === pt.key
                                  ? 'bg-yellow-500 text-gray-900 border-yellow-400'
                                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              <span className="text-base">{pt.emoji}</span> {pt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              <input
                placeholder="Note (optionnel) — ex: client absent"
                value={statusModal.note}
                onChange={e => setStatusModal((m: any) => ({ ...m, note: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={() => setStatusModal(null)}
                  className="py-3 rounded-xl border border-gray-600 text-gray-300 font-semibold hover:bg-gray-700 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleStatusSave}
                  disabled={statusModal.loading || statusModal.status === statusModal.parcel.status}
                  className="py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold transition flex items-center justify-center gap-2"
                >
                  {statusModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mise à jour...</>
                    : <><CheckCircle className="w-4 h-4" /> Confirmer</>
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
