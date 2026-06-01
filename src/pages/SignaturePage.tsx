import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/db'
import { submitDeliverySignature } from '../firebase/signatures'
import { CheckCircle, PenLine, RotateCcw, Package, MapPin, Building2, Upload, Camera } from 'lucide-react'

export default function SignaturePage() {
  const { parcelId, token } = useParams()
  const canvasRef  = useRef<any>(null)
  const drawing    = useRef(false)
  const lastPos    = useRef<any>(null)
  const hasDrawn   = useRef(false)

  const [parcel,        setParcel]        = useState<any>(null)
  const [pageStatus,    setPageStatus]    = useState('loading')
  const [isEmpty,       setIsEmpty]       = useState(true)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [savedSigUrl,   setSavedSigUrl]   = useState<any>(null)
  const [sigMode,       setSigMode]       = useState('personal') // 'personal' | 'company'
  const [companyName,   setCompanyName]   = useState('')
  const [stampPreview,  setStampPreview]  = useState<any>(null) // base64 de la photo du cachet
  const stampInputRef = useRef<any>(null)

  useEffect(() => {
    if (!parcelId || !token) { setPageStatus('invalid'); return }
    getDoc(doc(db, 'parcels', parcelId))
      .then(snap => {
        if (!snap.exists()) { setPageStatus('invalid'); return }
        const data = snap.data()
        if (data.signatureToken !== token) { setPageStatus('invalid'); return }
        if (data.status === 'Livré') { setPageStatus('already_delivered'); return }
        setParcel({ id: snap.id, ...data })
        setPageStatus('ready')
      })
      .catch(() => setPageStatus('error'))
  }, [parcelId, token])

  const stampReady = !!stampPreview

  // Init canvas context when canvas becomes visible
  useEffect(() => {
    if (pageStatus !== 'ready') return
    if (sigMode === 'company' && !stampReady) return
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.fillStyle   = '#1d4ed8'
  }, [pageStatus, sigMode, stampReady])

  const getPos = useCallback((e: any) => {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const src    = e.touches?.[0] || e
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }, [])

  const startDraw = useCallback((e: any) => {
    e.preventDefault()
    drawing.current = true
    const pos = getPos(e)
    lastPos.current = pos
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
    hasDrawn.current = true
    setIsEmpty(false)
  }, [getPos])

  const draw = useCallback((e: any) => {
    e.preventDefault()
    if (!drawing.current || !lastPos.current) return
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }, [getPos])

  const stopDraw = useCallback(() => {
    drawing.current = false
    lastPos.current = null
  }, [])

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
    setIsEmpty(true)
    setError('')
  }

  const handleStampFile = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setStampPreview((ev.target as any).result); clearCanvas() }
    reader.readAsDataURL(file)
    setError('')
  }

  const mergeStampAndSignature = () => new Promise((resolve) => {
    const contain = (srcW: any, srcH: any, maxW: any, maxH: any) => {
      const ratio = Math.min(maxW / srcW, maxH / srcH)
      return { w: srcW * ratio, h: srcH * ratio }
    }

    const merged = document.createElement('canvas')
    merged.width  = 600
    merged.height = 420
    const ctx: any = merged.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 600, 420)

    const img = new Image()
    img.onload = () => {
      // Stamp — contain dans 580×190, centré
      const { w: sW, h: sH } = contain(img.width, img.height, 580, 190)
      ctx.drawImage(img, 10 + (580 - sW) / 2, 10 + (190 - sH) / 2, sW, sH)

      // Séparateur
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#d1d5db'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(20, 210)
      ctx.lineTo(580, 210)
      ctx.stroke()
      ctx.restore()

      // Label
      ctx.fillStyle = '#9ca3af'
      ctx.font = '11px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Signature du représentant', 300, 228)

      // Signature — contain dans 580×180, centré
      const sigC = canvasRef.current
      const { w: gW, h: gH } = contain(sigC.width, sigC.height, 580, 180)
      ctx.drawImage(sigC as CanvasImageSource, 10 + (580 - gW) / 2, 235 + (180 - gH) / 2, gW, gH)

      resolve(merged.toDataURL('image/png'))
    }
    img.src = stampPreview
  })

  const handleSubmit = async () => {
    if (sigMode === 'personal') {
      if (isEmpty) { setError('Veuillez signer dans le cadre avant de confirmer.'); return }
    } else {
      if (!stampPreview) { setError('Veuillez photographier ou charger le cachet de la société.'); return }
      if (!companyName.trim()) { setError('Veuillez saisir le nom de la société.'); return }
      if (isEmpty) { setError('Veuillez signer dans le cadre ci-dessous (étape 2).'); return }
    }
    setSubmitting(true)
    setError('')
    try {
      const dataUrl = sigMode === 'personal'
        ? canvasRef.current.toDataURL('image/png')
        : await mergeStampAndSignature()
      await submitDeliverySignature(parcelId, token, dataUrl, {
        signatureType: sigMode === 'personal' ? 'personal' : 'company_stamp',
        companyName: sigMode === 'company' ? companyName.trim() : '',
      })
      setSavedSigUrl(dataUrl)
      setPageStatus('submitted')
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la soumission. Réessayez.')
      setSubmitting(false)
    }
  }

  const handleDownloadReceipt = () => {
    const now     = new Date()
    const dateStr = now.toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
    const logoUrl = `${window.location.origin}/LOGO.jpg`

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Bon de livraison – ${parcel?.trackingId || ''}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    *    { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 20px; max-width: 620px; margin: 0 auto; }
    .hdr { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 18px; }
    .brand-name { font-weight: 900; color: #ea580c; font-size: 18px; }
    .brand-sub  { font-size: 10px; color: #6b7280; }
    .badge      { margin-left: auto; background: #dcfce7; color: #166534; font-weight: 800; font-size: 12px; padding: 5px 12px; border-radius: 20px; border: 2px solid #86efac; white-space: nowrap; }
    .print-btn  { display: block; width: 100%; padding: 13px; background: #2563eb; color: #fff; font-weight: 700; font-size: 15px; border: none; border-radius: 12px; cursor: pointer; margin-bottom: 18px; }
    @media print { .print-btn { display: none !important; } }
    .title    { font-size: 17px; font-weight: 900; text-align: center; color: #111827; margin: 0 0 4px; }
    .tracking { text-align: center; font-family: monospace; font-size: 13px; color: #2563eb; font-weight: 700; margin-bottom: 18px; letter-spacing: 1px; }
    .lbl  { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
    .val  { font-size: 14px; font-weight: 700; color: #111827; }
    .sub  { font-size: 11px; color: #6b7280; margin-top: 1px; }
    .sec  { margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 14px; }
    .cell { background: #f9fafb; border-radius: 10px; padding: 9px; text-align: center; }
    .route { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 9px 13px; margin-bottom: 14px; font-size: 12px; color: #1d4ed8; font-weight: 600; }
    .cod  { background: #fefce8; border: 2px solid #fde047; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .sig-box { border: 2px solid #c7d2fe; border-radius: 12px; padding: 12px; background: #eef2ff; margin-bottom: 14px; }
    .sig-box img { width: 100%; max-height: 90px; object-fit: contain; display: block; }
    .sig-line { border-top: 1px solid #c7d2fe; margin-top: 9px; padding-top: 7px; text-align: center; font-size: 11px; color: #6b7280; }
    .stamp { border: 3px solid #16a34a; border-radius: 12px; padding: 12px 16px; text-align: center; color: #15803d; margin-top: 18px; }
    .stamp-title { font-size: 15px; font-weight: 900; }
    .stamp-date  { font-size: 11px; margin-top: 3px; }
    .footer { margin-top: 18px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="hdr">
    <img src="${logoUrl}" style="height:38px;object-fit:contain" onerror="this.style.display='none'" />
    <div>
      <div class="brand-name">BG EXPRESS</div>
      <div class="brand-sub">N°19, Rue 5, Hay Tissir2 – Casablanca | 0522 62 92 89</div>
    </div>
    <span class="badge">Livré ✓</span>
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

  <div class="title">BON DE LIVRAISON</div>
  <div class="tracking">${parcel?.trackingId || ''}</div>

  <div class="sec">
    <div class="lbl">Destinataire</div>
    <div class="val">${parcel?.receiver?.name || ''}</div>
    ${parcel?.receiver?.tel     ? `<div class="sub">${parcel.receiver.tel}</div>` : ''}
    ${parcel?.receiver?.address ? `<div class="sub">${parcel.receiver.address}</div>` : ''}
  </div>

  <div class="route">📍 ${parcel?.originCity || ''} &rarr; ${parcel?.destinationCity || ''}</div>

  <div class="grid">
    <div class="cell"><div class="lbl">Poids</div><div class="val">${parcel?.weight || '–'} kg</div></div>
    <div class="cell"><div class="lbl">Colis</div><div class="val">&times; ${parcel?.arrivedNbColis ?? parcel?.nbColis ?? 1}${parcel?.arrivedNbColis != null && parcel.arrivedNbColis < parcel.nbColis ? `<span style="color:#f97316">/${parcel.nbColis}</span>` : ''}</div></div>
    <div class="cell"><div class="lbl">Date</div><div class="val" style="font-size:11px">${dateStr}</div></div>
  </div>

  <div class="sec">
    <div class="lbl">Expéditeur</div>
    <div class="val">${parcel?.sender?.name || ''}</div>
  </div>

  ${parcel?.codAmount > 0 ? `<div class="cod"><span style="font-weight:700;color:#854d0e">💵 Montant RETOUR FOND</span><span style="font-weight:900;font-size:15px;color:#713f12">${parcel.codAmount} DH</span></div>` : ''}

  <div class="sig-box">
    <div class="lbl" style="margin-bottom:7px">Signature du destinataire</div>
    <img src="${savedSigUrl}" alt="Signature" />
    <div class="sig-line">${parcel?.receiver?.name || ''} — signé le ${dateStr} à ${timeStr}</div>
  </div>

  <div class="stamp">
    <div class="stamp-title">✅ LIVRAISON CONFIRMÉE</div>
    <div class="stamp-date">${dateStr} à ${timeStr}</div>
  </div>

  <div class="footer">
    BG Express • N°19, Rue 5, Hay Tissir2, Casablanca • 0522 62 92 89 | 0661 97 86 12<br/>
    Ce document constitue une preuve légale de réception de votre colis.
  </div>
</body></html>`

    const win = window.open('', '_blank', 'width=720,height=960')
    if (win) { win.document.write(html); win.document.close() }
  }

  const fmt = (d: any) => {
    if (!d) return '—'
    const date = d?.toDate ? d.toDate() : new Date(d)
    return date.toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  // ── États d'erreur ──────────────────────────────────────────────────────────
  if (pageStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (pageStatus === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center text-4xl mb-4">⛔</div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-gray-500 text-sm">Ce lien de signature est invalide ou a expiré. Demandez au chauffeur de générer un nouveau QR code.</p>
        </div>
      </div>
    )
  }

  if (pageStatus === 'already_delivered') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-4xl mb-4">✅</div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Déjà livré</h1>
          <p className="text-gray-500 text-sm">Ce colis a déjà été livré et validé. Aucune action nécessaire.</p>
        </div>
      </div>
    )
  }

  if (pageStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-yellow-100 flex items-center justify-center text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Erreur réseau</h1>
          <p className="text-gray-500 text-sm">Impossible de charger le bon de livraison. Vérifiez votre connexion et réessayez.</p>
          <button onClick={() => window.location.reload()} className="mt-5 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm hover:bg-blue-700 transition">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (pageStatus === 'submitted') {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-5">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Livraison confirmée !</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Votre signature a bien été enregistrée.<br />
            Merci de votre confiance en <span className="font-bold text-blue-700">BG Express</span>.
          </p>
          <div className="mt-4 bg-gray-50 rounded-2xl px-4 py-3 text-xs text-gray-400">
            Référence : <span className="font-mono font-semibold text-gray-600">{parcel?.trackingId}</span>
          </div>

          {/* Bouton téléchargement bon signé */}
          <button
            onClick={handleDownloadReceipt}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-2xl text-sm transition shadow-lg shadow-blue-200"
          >
            <PenLine className="w-4 h-4" />
            Enregistrer mon bon de livraison
          </button>
          <p className="text-[10px] text-gray-400 mt-2">
            Ouvre une page imprimable — enregistrez-la en PDF depuis votre navigateur
          </p>
        </div>
      </div>
    )
  }

  // ── Page de signature principale ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="bg-white border border-gray-200 rounded-xl px-2 py-1 shadow-sm">
            <img src="/LOGO.jpg" alt="BG Express" className="h-8 object-contain" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-900">BG EXPRESS</p>
            <p className="text-[10px] text-gray-400">Validation de livraison</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-5">

        {/* Bon de livraison */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-blue-600 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-white/80" />
                <span className="text-white font-bold text-sm">Bon de livraison</span>
              </div>
              <span className="font-mono text-xs bg-white/20 text-white px-3 py-1 rounded-full">
                {parcel?.trackingId}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Destinataire */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Destinataire</p>
              <p className="text-lg font-black text-gray-900">{parcel?.receiver?.name}</p>
              {parcel?.receiver?.tel && (
                <p className="text-sm text-blue-600 font-medium mt-0.5">{parcel.receiver.tel}</p>
              )}
            </div>

            {/* Adresse */}
            {(parcel?.receiver?.address || parcel?.destinationCity) && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5">
                <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 font-medium">
                  {parcel?.receiver?.address && <span>{parcel.receiver.address}, </span>}
                  <span className="font-bold">{parcel?.destinationCity}</span>
                </p>
              </div>
            )}

            {/* Détails */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Poids</p>
                <p className="text-sm font-black text-gray-800">{parcel?.weight} kg</p>
              </div>
              <div className="bg-gray-50 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Colis</p>
                <p className="text-sm font-black text-gray-800">
                  × {parcel?.arrivedNbColis ?? parcel?.nbColis ?? 1}
                  {parcel?.arrivedNbColis != null && parcel.arrivedNbColis < parcel.nbColis && (
                    <span className="text-orange-500 font-bold text-xs">/{parcel.nbColis}</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Date</p>
                <p className="text-sm font-black text-gray-800">{fmt(parcel?.createdAt)}</p>
              </div>
            </div>

            {/* Expéditeur */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Expéditeur</p>
              <p className="text-sm font-semibold text-gray-700">{parcel?.sender?.name}</p>
              <p className="text-xs text-gray-400">{parcel?.originCity} → {parcel?.destinationCity}</p>
            </div>

            {/* RETOUR FOND si applicable */}
            {parcel?.codAmount > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-yellow-800">💵 Montant RETOUR FOND</span>
                <span className="text-base font-black text-yellow-700">{parcel.codAmount} DH</span>
              </div>
            )}
          </div>
        </div>

        {/* Zone de validation */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Toggle Signature / Cachet */}
          <div className="px-5 pt-5 pb-0">
            <div className="flex rounded-2xl bg-gray-100 p-1 gap-1 mb-4">
              <button
                onClick={() => { setSigMode('personal'); setError('') }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${sigMode === 'personal' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <PenLine className="w-4 h-4" /> Signature personnelle
              </button>
              <button
                onClick={() => { setSigMode('company'); setError('') }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${sigMode === 'company' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Building2 className="w-4 h-4" /> Cachet + Signature
              </button>
            </div>
          </div>

          {/* ── Mode signature personnelle ── */}
          {sigMode === 'personal' && (
            <>
              <div className="px-5 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-gray-700">Signez avec votre doigt ou stylet</p>
                  <button onClick={clearCanvas} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 font-medium transition px-2.5 py-1.5 rounded-xl hover:bg-red-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Effacer
                  </button>
                </div>
              </div>
              <div className="mx-4 mb-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 overflow-hidden relative">
                {isEmpty && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <PenLine className="w-8 h-8 text-blue-200 mb-2" />
                    <p className="text-xs text-blue-300 font-medium">Signez ici</p>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full touch-none cursor-crosshair block"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
              </div>
              <div className="mx-4 mb-5 flex items-center gap-3">
                <div className="flex-1 border-b-2 border-gray-300" />
                <p className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Signature du destinataire</p>
                <div className="flex-1 border-b-2 border-gray-300" />
              </div>
            </>
          )}

          {/* ── Mode cachet + signature ── */}
          {sigMode === 'company' && (
            <div className="px-5 pb-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nom de la société *</label>
                <input
                  value={companyName}
                  onChange={e => { setCompanyName(e.target.value); setError('') }}
                  placeholder="Ex : AL HIKMA SARL"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:border-orange-400 focus:outline-none bg-gray-50 focus:bg-white transition"
                />
              </div>

              {/* Étape 1 : Cachet */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  <span className="bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">1</span>
                  Cachet de la société *
                </label>
                <input
                  ref={stampInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleStampFile}
                />
                {stampPreview ? (
                  <div className="relative bg-orange-50 border-2 border-orange-200 rounded-2xl p-4">
                    <img src={stampPreview} alt="Cachet" className="w-full max-h-40 object-contain rounded-xl" />
                    <button
                      onClick={() => { setStampPreview(null); clearCanvas(); if (stampInputRef.current) stampInputRef.current.value = '' }}
                      className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow text-gray-500 hover:text-red-500 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => stampInputRef.current?.click()}
                      className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition"
                    >
                      <Camera className="w-7 h-7" />
                      <span className="text-xs font-semibold">Photographier</span>
                    </button>
                    <button
                      onClick={() => { if (stampInputRef.current) { stampInputRef.current.removeAttribute('capture'); stampInputRef.current.click() } }}
                      className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition"
                    >
                      <Upload className="w-7 h-7" />
                      <span className="text-xs font-semibold">Importer</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Étape 2 : Signature — apparaît après le cachet */}
              {stampPreview && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">2</span>
                      Signature du représentant *
                    </label>
                    <button onClick={clearCanvas} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 font-medium transition px-2.5 py-1.5 rounded-xl hover:bg-red-50">
                      <RotateCcw className="w-3.5 h-3.5" /> Effacer
                    </button>
                  </div>
                  <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 overflow-hidden relative">
                    {isEmpty && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <PenLine className="w-8 h-8 text-blue-200 mb-2" />
                        <p className="text-xs text-blue-300 font-medium">Signez ici</p>
                      </div>
                    )}
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full touch-none cursor-crosshair block"
                      style={{ touchAction: 'none' }}
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 border-b-2 border-gray-300" />
                    <p className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Signature du représentant</p>
                    <div className="flex-1 border-b-2 border-gray-300" />
                  </div>
                </div>
              )}

              <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 text-xs text-orange-700 leading-relaxed">
                📌 <b>Étape 1 :</b> Photographiez ou importez le cachet de la société.<br />
                <b>Étape 2 :</b> Le représentant signe dans le cadre bleu.
              </div>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Bouton confirmer */}
          <div className="px-4 pb-5">
            <button
              onClick={handleSubmit}
              disabled={submitting || (sigMode === 'personal' && isEmpty) || (sigMode === 'company' && (!stampPreview || isEmpty))}
              className={`w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition shadow-lg ${
                sigMode === 'company' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              {submitting
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi en cours...</>
                : <><CheckCircle className="w-5 h-5" /> Confirmer la réception</>
              }
            </button>
            <p className="text-center text-[10px] text-gray-400 mt-3 leading-relaxed">
              {sigMode === 'company'
                ? 'En apposant le cachet et signant, la société confirme avoir reçu ce colis.\nCe document a valeur légale de preuve de livraison.'
                : 'En signant, vous confirmez avoir reçu ce colis en bon état.\nCette signature a valeur légale de preuve de livraison.'
              }
            </p>
          </div>
        </div>

      </main>
    </div>
  )
}
