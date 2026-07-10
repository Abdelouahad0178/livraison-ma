import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Package, CheckCircle2, Clock, QrCode, PenLine, Menu, X, Truck, Banknote } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { auth, db } from '../firebase/config'
import { collection, query, where, onSnapshot, orderBy, doc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { generateSignatureToken, confirmDeliveryAfterSignature, submitDeliverySignature } from '../firebase/firestore'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import LiveClock from '../components/LiveClock'
import CompanyContact from '../components/CompanyContact'

// Couleurs de statut
const STATUS_COLORS: any = {
  'Initialisé': { bg: 'bg-slate-100', txt: 'text-slate-700', dot: 'bg-slate-500', border: 'border-slate-200' },
  'En transit': { bg: 'bg-blue-100', txt: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  'Arrivé en agence': { bg: 'bg-purple-100', txt: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  'En cours de livraison': { bg: 'bg-orange-100', txt: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  'En livraison': { bg: 'bg-orange-100', txt: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  'Livré': { bg: 'bg-green-100', txt: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
  'Retourné': { bg: 'bg-red-100', txt: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' }
}

// Convertir récursivement les Timestamps Firestore en objets simples
const convertFirestoreData = (data: any): any => {
  if (data === null || data === undefined) return data

  // Approche hybride: conversion manuelle + JSON pour nettoyer
  const convert = (obj: any): any => {
    if (obj === null || obj === undefined) return obj

    // Timestamp Firestore
    if (obj && typeof obj === 'object' && typeof obj.toMillis === 'function') {
      return obj.toMillis()
    }

    // Tableau
    if (Array.isArray(obj)) {
      return obj.map(convert)
    }

    // Objet
    if (typeof obj === 'object' && obj.constructor?.name === 'Object') {
      const result: any = {}
      for (const key in obj) {
        result[key] = convert(obj[key])
      }
      return result
    }

    // Autres types d'objets (Date, etc.) - les sérialiser
    if (typeof obj === 'object') {
      try {
        return JSON.parse(JSON.stringify(obj))
      } catch {
        return String(obj)
      }
    }

    return obj
  }

  return convert(data)
}

export default function DriverGarePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [parcels, setParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
  const [signatureModal, setSignatureModal] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const signatureUnsubRef = useRef<any>(null)
  const handSignatureCanvasRef = useRef<any>(null)
  const handSignatureDrawing = useRef(false)
  const handSignatureLastPos = useRef<any>(null)
  const uid = auth.currentUser?.uid

  // Scanner de code-barres
  useBarcodeScanner({
    onScan: (code: string) => {
      const found = parcels.find(p =>
        p.trackingId?.toLowerCase() === code.toLowerCase() ||
        p.receiver?.tel?.includes(code)
      )
      if (found) handleOpenSignature(found)
    }
  })

  useEffect(() => {
    if (!uid) {
      navigate('/login')
      return
    }

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (!snap.exists()) {
          navigate('/login')
          return
        }
        const prof: any = snap.data()

        if (prof.role !== 'livreur-gare') {
          alert('❌ Accès réservé aux livreurs en gare')
          signOut(auth)
          return
        }

        setProfile(prof)
        setLoading(false)
      }
    )

    return () => unsubUser()
  }, [uid, navigate])

  useEffect(() => {
    if (!profile?.city) {
      setParcels([])
      setLoading(false)
      return
    }

    try {
      const unsubParcels = onSnapshot(
        query(
          collection(db, 'parcels'),
          where('deliveryMethod', '==', 'gare'),
          where('destinationCity', '==', String(profile.city)),
          where('status', 'in', ['En livraison', 'Arrivé en agence', 'Livré']),
          orderBy('createdAt', 'desc')
        ),
        {
          next: (snap) => {
            const docs = snap.docs.map(d => {
              const data = d.data()
              // Inclure tous les champs nécessaires pour COD, port dû, et historique
              // Convertir les Timestamps dans l'historique
              const cleanHistory = (data.history || []).map((h: any) => ({
                status: h.status || '',
                note: h.note || '',
                timestamp: h.timestamp?.toMillis ? h.timestamp.toMillis() :
                          (typeof h.timestamp === 'number' ? h.timestamp : Date.now()),
                by: h.by || ''
              }))

              return {
                id: d.id,
                trackingId: data.trackingId || '',
                status: data.status || '',
                destinationCity: data.destinationCity || '',
                receiver: data.receiver ? {
                  name: data.receiver.name || '',
                  tel: data.receiver.tel || '',
                  address: data.receiver.address || '',
                  city: data.receiver.city || ''
                } : null,
                sender: data.sender ? {
                  name: data.sender.name || '',
                  city: data.sender.city || ''
                } : null,
                codAmount: parseFloat(data.codAmount) || 0,
                codStatus: data.codStatus || '',
                codPaymentType: data.codPaymentType || '',
                portType: data.portType || '',
                portStatus: data.portStatus || '',
                price: parseFloat(data.price) || 0,
                history: cleanHistory,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
              }
            })

            console.log('🚉 Colis en gare récupérés:', docs.length, docs)
            setParcels(docs)
            setLoading(false)
          },
          error: (err) => {
            console.error('❌ Erreur snapshot parcels:', err)
            setParcels([])
            setLoading(false)
          }
        }
      )

      return () => unsubParcels()
    } catch (err) {
      console.error('❌ Erreur setup snapshot:', err)
      setParcels([])
      setLoading(false)
    }
  }, [profile])

  const handleOpenSignature = async (parcel: any) => {
    // Bloquer l'ouverture si colis déjà livré
    if (parcel.status === 'Livré') {
      setMsg({ type: 'error', text: '❌ Ce colis a déjà été remis' })
      setTimeout(() => setMsg(null), 3000)
      return
    }

    try {
      const token = await generateSignatureToken(parcel.id, false)
      const url = `${window.location.origin}/sign/${parcel.id}/${token}`

      // Créer une version nettoyée sans Timestamps
      const cleanParcel = {
        id: parcel.id,
        trackingId: parcel.trackingId,
        receiver: parcel.receiver,
        sender: parcel.sender,
        status: parcel.status,
        destinationCity: parcel.destinationCity,
        codAmount: parcel.codAmount,
        codStatus: parcel.codStatus,
        portType: parcel.portType,
        portStatus: parcel.portStatus,
        price: parcel.price
      }

      setSignatureModal({
        parcel: cleanParcel,
        token,
        url,
        receivedSig: null,
        confirming: false,
        done: false,
        error: '',
        stampMode: 'qr',
        handSignatureEmpty: true,
        handSubmitting: false,
        paperNote: ''
      })
    } catch (err: any) {
      console.error('Erreur génération signature:', err)
      setMsg({ type: 'error', text: 'Impossible de générer le QR code' })
    }
  }

  useEffect(() => {
    if (!signatureModal?.parcel?.id || signatureModal.receivedSig || signatureModal.done) return
    if (signatureUnsubRef.current) signatureUnsubRef.current()

    signatureUnsubRef.current = onSnapshot(doc(db, 'deliverySignatures', signatureModal.parcel.id), (s: any) => {
      if (s.exists()) setSignatureModal((m: any) => m ? { ...m, receivedSig: s.data(), handSubmitting: false, error: '' } : m)
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
    setSignatureModal((m: any) => m ? { ...m, handSignatureEmpty: true, error: '' } : m)
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
    setSignatureModal((m: any) => m ? { ...m, handSignatureEmpty: false, error: '' } : m)
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
    setSignatureModal((m: any) => m ? { ...m, handSignatureEmpty: true, error: '' } : m)
  }

  const handleHandSignatureSubmit = async () => {
    const { parcel, token, handSignatureEmpty } = signatureModal
    if (handSignatureEmpty || !handSignatureCanvasRef.current) {
      setSignatureModal((m: any) => ({ ...m, error: 'Faites signer le client dans le cadre.' }))
      return
    }
    setSignatureModal((m: any) => ({ ...m, handSubmitting: true, error: '' }))
    try {
      await submitDeliverySignature(parcel.id, token, handSignatureCanvasRef.current.toDataURL('image/png'), {
        signatureType: 'personal',
        companyName: '',
      })
    } catch (err: any) {
      setSignatureModal((m: any) => ({ ...m, handSubmitting: false, error: err.message || 'Erreur lors de la soumission.' }))
    }
  }

  const handleConfirmDelivery = async () => {
    if (!signatureModal?.receivedSig) {
      setMsg({ type: 'error', text: '❌ Signature requise' })
      return
    }

    setSignatureModal((m: any) => ({ ...m, confirming: true, error: '' }))

    try {
      await confirmDeliveryAfterSignature(
        signatureModal.parcel.id,
        profile?.name || profile?.email || 'Livreur gare',
        false
      )

      setParcels(prev => prev.map(p =>
        p.id === signatureModal.parcel.id ? { ...p, status: 'Livré' } : p
      ))

      if (signatureUnsubRef.current) signatureUnsubRef.current()
      setSignatureModal((m: any) => ({ ...m, confirming: false, done: true }))
      setTimeout(() => setSignatureModal(null), 2500)
      setMsg({ type: 'success', text: '✅ Colis remis en gare !' })
    } catch (err: any) {
      console.error('Erreur confirmation:', err)
      setSignatureModal((m: any) => ({ ...m, confirming: false, error: err.message }))
    }
  }

  const handlePaperDelivery = async () => {
    setSignatureModal((m: any) => ({ ...m, confirming: true, error: '' }))

    try {
      await confirmDeliveryAfterSignature(
        signatureModal.parcel.id,
        profile?.name || profile?.email || 'Livreur gare',
        false
      )

      setParcels(prev => prev.map(p =>
        p.id === signatureModal.parcel.id ? { ...p, status: 'Livré' } : p
      ))

      if (signatureUnsubRef.current) signatureUnsubRef.current()
      setSignatureModal((m: any) => ({ ...m, confirming: false, done: true }))
      setTimeout(() => setSignatureModal(null), 2500)
      setMsg({ type: 'success', text: '✅ Colis remis en gare (bon papier) !' })
    } catch (err: any) {
      console.error('Erreur confirmation:', err)
      setSignatureModal((m: any) => ({ ...m, confirming: false, error: err.message }))
    }
  }

  // Séparer en deux catégories: en attente et remis
  const activeParcels = parcels.filter(p => p.status !== 'Livré')
  const doneParcels = parcels.filter(p => p.status === 'Livré')

  console.log('📊 Stats:', {
    total: parcels.length,
    enAttente: activeParcels.length,
    remis: doneParcels.length,
    statuses: parcels.map(p => p.status)
  })

  // Appliquer le filtre de recherche
  const filtered = parcels.filter(p =>
    !search ||
    p.trackingId?.toLowerCase().includes(search.toLowerCase()) ||
    p.receiver?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.receiver?.tel?.includes(search)
  )

  const filteredActive = filtered.filter(p => p.status !== 'Livré')
  const filteredDone = filtered.filter(p => p.status === 'Livré')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Chargement...</p>
        </div>
      </div>
    )
  }

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
                <Package className="w-4 h-4 text-yellow-400" />
                <span className="font-bold hidden sm:inline">Livreur en Gare</span>
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

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-800 py-2 space-y-1">
              <div className="px-4 py-2 text-gray-400 text-sm">
                {profile?.city || 'Gare'}
              </div>
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
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-gray-400">En attente</span>
            </div>
            <p className="text-2xl font-bold text-orange-400">{activeParcels.length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400">Remis</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{doneParcels.length}</p>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className={`mb-4 p-4 rounded-xl border-2 ${
            msg.type === 'success' ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-red-900/20 border-red-700 text-red-400'
          }`}>
            {msg.text}
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par N° tracking, nom, tél..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
          />
        </div>

        {/* Liste des colis */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400">
              {search ? 'Aucun résultat' : 'Aucun colis en gare'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Section En attente */}
            {filteredActive.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  En attente ({filteredActive.length})
                </h3>
                <div className="space-y-3">
                  {filteredActive.map((p: any) => {
                    const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenSignature(p)}
                        className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-yellow-500 transition cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono font-bold text-yellow-400 mb-1">{p.trackingId}</p>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full border ${sc.bg} ${sc.txt} ${sc.border}`}>
                                {p.status}
                              </span>
                              {p.codAmount > 0 && (
                                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full border border-green-700 flex items-center gap-1">
                                  <Banknote className="w-3 h-3" />
                                  {p.codAmount} DH
                                </span>
                              )}
                              {p.portType === 'port_du' && p.portStatus !== 'collected' && (
                                <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded-full border border-amber-700">
                                  Port dû: {p.price || 0} DH
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="font-semibold text-white">{p.receiver?.name}</span>
                          </p>
                          <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                          <p className="text-xs text-gray-500">{p.sender?.city} → {p.receiver?.city}</p>
                        </div>

                        {/* Historique résumé */}
                        {p.history?.length > 0 && (
                          <div className="mt-3 pt-3 space-y-1 border-t border-gray-700">
                            {[...p.history].reverse().slice(0, 3).map((h: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[h.status]?.dot || 'bg-gray-500'}`} />
                                <span className="shrink-0">
                                  {new Date(h.timestamp).toLocaleString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                <span className="truncate">{h.status}{h.note ? ` - ${h.note}` : ''}</span>
                              </div>
                            ))}
                            {p.history.length > 3 && (
                              <p className="text-xs pl-3 text-gray-600">
                                + {p.history.length - 3} événement(s) antérieur(s)
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Section Remis */}
            {filteredDone.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Remis ({filteredDone.length})
                </h3>
                <div className="space-y-3">
                  {filteredDone.map((p: any) => {
                    const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Livré']
                    return (
                      <div
                        key={p.id}
                        className="bg-gray-800 border border-green-900/30 rounded-xl p-4 opacity-75"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono font-bold text-green-400 mb-1">{p.trackingId}</p>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full border ${sc.bg} ${sc.txt} ${sc.border}`}>
                                ✓ {p.status}
                              </span>
                              {p.codAmount > 0 && (
                                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full border border-green-700 flex items-center gap-1">
                                  <Banknote className="w-3 h-3" />
                                  {p.codAmount} DH
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="font-semibold text-white">{p.receiver?.name}</span>
                          </p>
                          <p className="text-xs text-gray-400">{p.receiver?.tel}</p>
                          <p className="text-xs text-gray-500">{p.sender?.city} → {p.receiver?.city}</p>
                        </div>

                        {/* Historique résumé */}
                        {p.history?.length > 0 && (
                          <div className="mt-3 pt-3 space-y-1 border-t border-gray-700">
                            {[...p.history].reverse().slice(0, 3).map((h: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[h.status]?.dot || 'bg-gray-500'}`} />
                                <span className="shrink-0">
                                  {new Date(h.timestamp).toLocaleString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                <span className="truncate">{h.status}{h.note ? ` - ${h.note}` : ''}</span>
                              </div>
                            ))}
                            {p.history.length > 3 && (
                              <p className="text-xs pl-3 text-gray-600">
                                + {p.history.length - 3} événement(s) antérieur(s)
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Signature */}
      {signatureModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 border border-gray-700">
            {signatureModal.done ? (
              <div className="text-center">
                <div className="w-20 h-20 bg-green-900/30 border border-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-12 h-12 text-green-400" />
                </div>
                <h3 className="text-2xl font-bold text-green-400 mb-2">Colis remis!</h3>
                <p className="text-gray-400">{signatureModal.parcel.trackingId}</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-4 text-white">Confirmation remise en gare</h3>
                <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-700">
                  <p className="font-mono font-bold text-lg mb-2 text-yellow-400">{signatureModal.parcel.trackingId}</p>
                  <p className="text-sm text-gray-300">Destinataire: {signatureModal.parcel.receiver?.name}</p>
                  <p className="text-xs text-gray-500">{signatureModal.parcel.receiver?.tel}</p>

                  {/* Afficher COD et Port dû si présents */}
                  {(signatureModal.parcel.codAmount > 0 || (signatureModal.parcel.portType === 'port_du' && signatureModal.parcel.portStatus !== 'collected')) && (
                    <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                      {signatureModal.parcel.codAmount > 0 && (
                        <div className="flex justify-between items-center bg-green-900/20 border border-green-700 rounded-lg px-3 py-2">
                          <span className="text-green-400 font-semibold flex items-center gap-2">
                            <Banknote className="w-4 h-4" />
                            RETOUR FOND à collecter
                          </span>
                          <span className="text-green-300 font-bold">{signatureModal.parcel.codAmount} DH</span>
                        </div>
                      )}
                      {signatureModal.parcel.portType === 'port_du' && signatureModal.parcel.portStatus !== 'collected' && (
                        <div className="flex justify-between items-center bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2">
                          <span className="text-amber-400 font-semibold">Port dû à collecter</span>
                          <span className="text-amber-300 font-bold">{signatureModal.parcel.price || 0} DH</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Boutons de basculement */}
                <div className="grid grid-cols-3 rounded-xl bg-gray-900 p-1 gap-1 mb-4 border border-gray-700">
                  <button
                    onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'qr', error: '' }))}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition ${signatureModal.stampMode === 'qr' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>QR Code</span>
                  </button>
                  <button
                    onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'handwritten', error: '' }))}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition ${signatureModal.stampMode === 'handwritten' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <PenLine className="w-4 h-4" />
                    <span>Signature</span>
                  </button>
                  <button
                    onClick={() => setSignatureModal((m: any) => ({ ...m, stampMode: 'paper', error: '' }))}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition ${signatureModal.stampMode === 'paper' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <Package className="w-4 h-4" />
                    <span>Bon papier</span>
                  </button>
                </div>

                {signatureModal.stampMode === 'qr' ? (
                  <div className="text-center mb-4">
                    <p className="text-sm text-gray-400 mb-3">Demandez au client de scanner le QR code:</p>
                    <div className="inline-block p-4 bg-white rounded-xl">
                      <QRCodeSVG value={signatureModal.url} size={192} level="H" />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">En attente de signature...</p>
                  </div>
                ) : signatureModal.stampMode === 'handwritten' ? (
                  <div className="space-y-3 mb-4">
                    <div className="bg-blue-900/20 border border-blue-700 rounded-xl px-4 py-3 text-center">
                      <p className="text-blue-300 text-sm font-medium">
                        Faites signer le client directement sur votre écran
                      </p>
                    </div>

                    <div className="relative bg-white border-2 border-dashed border-blue-500 rounded-xl overflow-hidden">
                      {signatureModal.handSignatureEmpty && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <PenLine className="w-10 h-10 text-blue-300 mb-2" />
                          <p className="text-sm text-blue-400 font-medium">Signez ici</p>
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

                    <div className="flex justify-between items-center">
                      <button
                        onClick={clearHandSignature}
                        className="text-sm text-gray-400 hover:text-gray-200 font-medium"
                      >
                        ✕ Effacer
                      </button>
                      <button
                        onClick={handleHandSignatureSubmit}
                        disabled={signatureModal.handSignatureEmpty || signatureModal.handSubmitting}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {signatureModal.handSubmitting ? 'Envoi...' : 'Valider signature'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Mode Bon papier */
                  <div className="space-y-3 mb-4">
                    <div className="bg-green-900/20 border border-green-700 rounded-xl px-4 py-3 text-center">
                      <p className="text-green-300 text-sm font-medium">
                        📋 Livraison sans signature électronique
                      </p>
                      <p className="text-xs text-green-400 mt-1">
                        Le client a signé sur le bon papier
                      </p>
                    </div>

                    <textarea
                      value={signatureModal.paperNote}
                      onChange={e => setSignatureModal((m: any) => ({ ...m, paperNote: e.target.value }))}
                      placeholder="Note optionnelle (ex: remis au gardien, pièce d'identité vérifiée...)"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:border-green-500 focus:outline-none"
                      rows={3}
                    />

                    <button
                      onClick={handlePaperDelivery}
                      disabled={signatureModal.confirming}
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {signatureModal.confirming ? 'Confirmation...' : '✓ Confirmer remise'}
                    </button>
                  </div>
                )}

                {signatureModal.error && (
                  <div className="bg-red-900/20 border border-red-700 text-red-400 rounded-xl p-3 mb-4 text-sm">
                    {signatureModal.error}
                  </div>
                )}

                {signatureModal.stampMode !== 'paper' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSignatureModal(null)}
                      disabled={signatureModal.confirming}
                      className="flex-1 px-4 py-3 border-2 border-gray-700 rounded-xl font-semibold hover:bg-gray-700 transition disabled:opacity-50 text-gray-300"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleConfirmDelivery}
                      disabled={!signatureModal.receivedSig || signatureModal.confirming}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
                    >
                      {signatureModal.confirming ? 'Confirmation...' : 'Confirmer remise'}
                    </button>
                  </div>
                )}

                {signatureModal.stampMode === 'paper' && (
                  <button
                    onClick={() => setSignatureModal(null)}
                    disabled={signatureModal.confirming}
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl font-semibold hover:bg-gray-700 transition disabled:opacity-50 text-gray-300"
                  >
                    Annuler
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
