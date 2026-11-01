// 💬 Envoi WhatsApp d'une liste « Reste à encaisser » (Admin) : le PDF est déposé en ligne, le message contient son lien.
// Envoi SANS pièce jointe à ajouter : par NUMÉRO (application WhatsApp de Windows ou WhatsApp Web) ou par QR CODE
// (scanné avec le téléphone → WhatsApp s'ouvre avec le message prêt).
import { lazy, Suspense, useEffect, useState } from 'react'
import { Copy, ExternalLink, Monitor, X } from 'lucide-react'
import { prepareResteWhatsApp, waNumber, type ShareResteOpts } from '../../../utils/shareResteWhatsApp'

const QRCodeSVG = lazy(() => import('../../../components/QRCodeSvg'))

export default function WhatsAppSendDialog({ opts, defaultPhone = '', onClose }: {
  opts: ShareResteOpts; defaultPhone?: string; onClose: () => void
}) {
  const [prep, setPrep] = useState<{ url: string; message: string } | null>(null)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState(defaultPhone)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setPhone(p => p || defaultPhone) }, [defaultPhone])
  useEffect(() => {
    let alive = true
    prepareResteWhatsApp(opts).then(r => { if (alive) setPrep(r) }).catch(e => { if (alive) setError(e?.message || String(e)) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const num = waNumber(phone)
  const text = encodeURIComponent(prep?.message || '')
  // Application WhatsApp de Windows (protocole whatsapp://), WhatsApp Web, et lien universel (QR / téléphone)
  const appLink = `whatsapp://send?${num ? `phone=${num}&` : ''}text=${text}`
  const webLink = `https://web.whatsapp.com/send?${num ? `phone=${num}&` : ''}text=${text}`
  const qrLink = `https://wa.me/${num}?text=${text}`
  const copy = async () => { try { await navigator.clipboard.writeText(prep?.message || ''); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* presse-papiers refusé */ } }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b bg-green-50 rounded-t-2xl">
          <h3 className="font-bold text-green-900">💬 Envoyer par WhatsApp{opts.driver ? ` — ${opts.driver}` : ''}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-green-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        {error ? (
          <p className="p-5 text-sm text-red-700">Préparation impossible : {error}</p>
        ) : !prep ? (
          <p className="p-8 text-center text-sm text-slate-500">Préparation du PDF ({opts.lines.length} expédition(s))…</p>
        ) : (
          <div className="p-5 grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">Numéro WhatsApp (laisser vide pour choisir le contact)
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 XX XX XX XX" inputMode="tel"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-base tabular-nums" />
              </label>
              {phone && !num && <p className="text-[11px] text-red-600">Numéro incomplet (ex. 0612345678 ou +212612345678).</p>}
              <a href={appLink} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold">
                <Monitor className="w-4 h-4" /> Ouvrir WhatsApp (application Windows)
              </a>
              <a href={webLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 font-semibold text-sm">
                <ExternalLink className="w-4 h-4" /> Ouvrir WhatsApp Web
              </a>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 whitespace-pre-wrap break-all max-h-32 overflow-auto">{prep.message}</div>
              <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Message copié ✓' : 'Copier le message'}
              </button>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-white border rounded-xl">
                <Suspense fallback={<div className="w-[220px] h-[220px] bg-slate-100 rounded" />}>
                  <QRCodeSVG value={qrLink} size={220} level="L" includeMargin={false} />
                </Suspense>
              </div>
              <p className="text-[11px] text-slate-500 text-center max-w-[230px]">📱 Scannez avec l'appareil photo du téléphone : WhatsApp s'ouvre avec le message{num ? ` pour ${phone}` : ''}, prêt à envoyer.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
