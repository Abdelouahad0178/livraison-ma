import { useEffect, useState, useRef, useCallback } from 'react'
import type { MouseEvent as RMouseEvent, TouchEvent as RTouchEvent } from 'react'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/db'
import { deleteDeliverySignature, updateDeliverySignature } from '../firebase/signatures'
import { X, PenLine, Trash2, RotateCcw, Save, AlertTriangle, MessageCircle } from 'lucide-react'

interface SignatureViewerModalProps {
  parcelId: string
  trackingId: string
  recipientName: string
  nexpCode?: string
  onClose: () => void
  canEdit?: boolean
  userName?: string
  isReturn?: boolean
}

interface SigDoc {
  signatureDataUrl: string
  signatureType?: string
  companyName?: string
  recipientName?: string
  signedAt?: string
  updatedBy?: string
  originCity?: string
  destinationCity?: string
}

type DrawMode = 'view' | 'edit' | 'delete_confirm'
type CanvasPointerEvent = RMouseEvent<HTMLCanvasElement> | RTouchEvent<HTMLCanvasElement>

export default function SignatureViewerModal({
  parcelId, trackingId, recipientName, nexpCode, onClose,
  canEdit = false, userName = 'Administrateur', isReturn = false,
}: Readonly<SignatureViewerModalProps>) {
  const [sig,      setSig]      = useState<SigDoc | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [mode,     setMode]     = useState<DrawMode>('view')
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isEmpty,  setIsEmpty]  = useState(true)
  const [error,    setError]    = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const lastPos   = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!parcelId) return
    getDoc(doc(db, 'deliverySignatures', parcelId))
      .then(snap => { setSig(snap.exists() ? snap.data() as SigDoc : null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [parcelId])

  useEffect(() => {
    if (mode !== 'edit' || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.fillStyle   = '#1e293b'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }, [mode])

  const getPos = useCallback((e: CanvasPointerEvent) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const src: { clientX: number; clientY: number } =
      'touches' in e
        ? (e.touches[0] ?? { clientX: 0, clientY: 0 })
        : e
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }, [])

  const startDraw = useCallback((e: CanvasPointerEvent) => {
    e.preventDefault()
    drawing.current = true
    const pos = getPos(e)
    lastPos.current = pos
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
    setIsEmpty(false)
  }, [getPos])

  const draw = useCallback((e: CanvasPointerEvent) => {
    e.preventDefault()
    if (!drawing.current || !lastPos.current) return
    const pos = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!
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
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  const handleSave = async () => {
    if (isEmpty) { setError('Veuillez dessiner une signature.'); return }
    setSaving(true)
    setError('')
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      await updateDeliverySignature(parcelId, dataUrl, userName)
      setSig(s => ({
        ...(s ?? {} as Partial<SigDoc>),
        signatureDataUrl: dataUrl,
        signedAt: new Date().toISOString(),
        updatedBy: userName,
      } as SigDoc))
      setMode('view')
    } catch {
      setError('Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteDeliverySignature(parcelId)
      onClose()
    } catch {
      setError('Erreur lors de la suppression.')
      setDeleting(false)
    }
  }

  const cancelEdit = () => { setMode('view'); setError('') }

  const fmtDate = (d: string | undefined): string => d
    ? new Date(d).toLocaleString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
              <PenLine className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Signature électronique</p>
              <p className="text-[10px] text-gray-400">
                {mode === 'edit' ? 'Mode modification' : mode === 'delete_confirm' ? 'Confirmation de suppression' : isReturn ? 'Preuve de remise retour' : 'Preuve de livraison'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Infos colis */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              {nexpCode && (
                <p className="text-base font-mono font-black text-gray-900 truncate">{nexpCode}</p>
              )}
              <p className="text-[10px] font-mono text-blue-500 truncate">{trackingId}</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{recipientName}</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${isReturn ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{isReturn ? 'Retourné ✓' : 'Livré ✓'}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>

          ) : !sig ? (
            <div className="text-center py-10 text-gray-400">
              <PenLine className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Aucune signature électronique enregistrée</p>
              <p className="text-xs mt-1">Ce colis a été livré sans signature numérique</p>
            </div>

          ) : mode === 'delete_confirm' ? (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-red-800">Supprimer cette signature ?</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed">
                  Cette action est irréversible.<br />La preuve de livraison sera définitivement effacée.
                </p>
              </div>
              {error && <p className="text-xs text-red-600 text-center">{error}</p>}
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? 'Suppression...' : 'Confirmer'}
                </button>
              </div>
            </div>

          ) : mode === 'edit' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 text-center">Dessinez la nouvelle signature dans le cadre ci-dessous</p>
              <div className="relative bg-blue-50 border-2 border-dashed border-blue-200 rounded-2xl overflow-hidden">
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xs text-blue-300 font-medium">Signez ici</p>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={160}
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
              <button
                onClick={clearCanvas}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 font-medium transition mx-auto"
              >
                <RotateCcw className="w-3 h-3" /> Effacer
              </button>
              {error && <p className="text-xs text-red-600 text-center">{error}</p>}
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isEmpty}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold transition"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
              </div>
            </div>

          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {sig.signatureType === 'company_stamp' ? 'Cachet de la société' : isReturn ? 'Signature de l\'expéditeur' : 'Signature du destinataire'}
                </p>
                <div className={`border-2 rounded-2xl p-4 ${sig.signatureType === 'company_stamp' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
                  <img
                    src={sig.signatureDataUrl}
                    alt={sig.signatureType === 'company_stamp' ? 'Cachet société' : 'Signature'}
                    className={sig.signatureType === 'company_stamp' ? 'w-full max-h-32 object-contain rounded-xl' : 'w-full h-24 object-contain'}
                  />
                  <div className={`border-t mt-3 pt-2 text-center ${sig.signatureType === 'company_stamp' ? 'border-orange-100' : 'border-blue-100'}`}>
                    <p className="text-xs font-semibold text-gray-600">
                      {sig.signatureType === 'company_stamp' && sig.companyName
                        ? sig.companyName
                        : (sig.recipientName || recipientName)}
                    </p>
                    {sig.signatureType === 'company_stamp' && (
                      <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">🏢 Cachet société</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Signé le</span>
                  <span className="font-semibold text-gray-700">{fmtDate(sig.signedAt)}</span>
                </div>
                {sig.updatedBy && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Modifié par</span>
                    <span className="font-semibold text-gray-700">{sig.updatedBy}</span>
                  </div>
                )}
                {sig.originCity && sig.destinationCity && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Trajet</span>
                    <span className="font-semibold text-gray-700">{sig.originCity} → {sig.destinationCity}</span>
                  </div>
                )}
              </div>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`📦 ${isReturn ? 'Retour confirmé' : 'Livraison confirmée'} — *${nexpCode || trackingId}*\n${isReturn ? 'Expéditeur' : 'Destinataire'} : *${recipientName}*\nSigné le : ${fmtDate(sig.signedAt)}\nSuivi → https://www.bgexpress.ma/track?id=${trackingId}`)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Envoyer via WhatsApp
              </a>

              {canEdit && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setMode('edit'); setError('') }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 text-xs font-bold transition"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Modifier
                  </button>
                  <button
                    onClick={() => { setMode('delete_confirm'); setError('') }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
