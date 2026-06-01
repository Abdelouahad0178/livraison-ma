import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { STATUS_COLORS } from '../firebase/constants'
import { Package, Search, MessageCircle, MapPin, Clock, PenLine } from 'lucide-react'
import CompanyContact from '../components/CompanyContact'

const STATUS_ICONS = {
  'Initialisé':            '📋',
  'En transit':            '🚚',
  'Arrivé en agence':      '🏪',
  'En cours de livraison': '🛵',
  'Livré':                 '✅',
  'Retourné':              '↩️',
}

export default function TrackingPage() {
  const [searchParams] = useSearchParams()
  const [trackingId, setTrackingId] = useState(searchParams.get('id') || '')
  const [parcel, setParcel]         = useState<any>(null)
  const [sig,    setSig]            = useState<any>(null)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const unsubRef = useRef<any>(null)

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) search(id)
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [])

  const search = async (id: any) => {
    if (!id?.trim()) return
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    setLoading(true)
    setError('')
    setParcel(null)
    try {
      const [{ findParcel }, { db }, { doc, onSnapshot }] = await Promise.all([
        import('../firebase/parcelsRead'),
        import('../firebase/db'),
        import('firebase/firestore'),
      ])
      const found = await findParcel(id)
      if (!found) {
        setError('Aucun colis trouvé avec ce numéro de suivi.')
        setLoading(false)
        return
      }
      setParcel(found)
      setLoading(false)

      unsubRef.current = onSnapshot(doc(db, 'parcels', found.id), snap => {
        if (snap.exists()) setParcel({ id: snap.id, ...snap.data() })
      })
    } catch {
      setError('Erreur réseau. Réessayez dans un instant.')
      setLoading(false)
    }
  }

  // Charger la signature quand le colis est livré
  useEffect(() => {
    let cancelled = false
    setSig(null)
    if (!parcel?.id || !parcel.signatureConfirmedAt) return () => { cancelled = true }
    Promise.all([
      import('../firebase/db'),
      import('firebase/firestore'),
    ])
      .then(([{ db }, { doc, getDoc }]) => getDoc(doc(db, 'deliverySignatures', parcel.id)))
      .then(snap => { if (!cancelled && snap.exists()) setSig(snap.data()) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [parcel?.id, parcel?.signatureConfirmedAt])

  const colors: any = parcel ? (STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']) : null
  const sortedHistory = parcel ? [...parcel.history].reverse() : []

  const whatsappMsg = parcel
    ? encodeURIComponent(`📦 Mon colis *${parcel.trackingId}* est : *${parcel.status}*\nSuivi en temps réel → https://votre-site.ma/track?id=${parcel.trackingId}`)
    : ''

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <CompanyContact />
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
          <p className="text-xs text-gray-400 border-l border-gray-200 pl-3">Suivi de colis — Maroc 🇲🇦</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 pb-16">
        {/* Barre de recherche */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <p className="text-sm text-gray-500 mb-3 font-medium">Entrez votre numéro de suivi</p>
          <div className="flex gap-2">
            <input
              value={trackingId}
              onChange={e => setTrackingId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(trackingId)}
              placeholder="Ex: LMA-ABC123-XY"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:border-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition"
            />
            <button
              onClick={() => search(trackingId)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-xl font-semibold transition flex items-center gap-1.5 disabled:opacity-60"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Search className="w-4 h-4" /> Suivre</>
              }
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-4 text-center text-sm">
            📭 {error}
          </div>
        )}

        {/* Résultat */}
        {parcel && (
          <div className="space-y-4">
            {/* Statut principal */}
            <div className={`rounded-2xl p-5 ${colors.bg} border ${colors.text.replace('text', 'border')}/20`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-sm font-medium ${colors.text} opacity-70`}>Statut actuel</p>
                  <p className={`text-2xl font-bold ${colors.text} mt-1`}>
                    {(STATUS_ICONS as any)[parcel.status]} {parcel.status}
                  </p>
                  <p className="font-mono text-xs mt-2 opacity-60">{parcel.trackingId}</p>
                </div>
              </div>
            </div>

            {/* Infos expéditeur / destinataire */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="p-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">Expéditeur</p>
                  <p className="font-semibold text-gray-800 text-sm">{parcel.sender.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{parcel.sender.city}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">Destinataire</p>
                  <p className="font-semibold text-gray-800 text-sm">{parcel.receiver.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{parcel.receiver.city}
                  </p>
                </div>
              </div>
              <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between text-xs text-gray-500">
                <span>Poids : <b className="text-gray-700">{parcel.weight} kg</b></span>
                <span>Livraison : <b className="text-gray-700">{parcel.price} DH</b></span>
                {parcel.codAmount > 0 && (
                  <span className="text-orange-600 font-semibold">RETOUR FOND : {parcel.codAmount} DH</span>
                )}
              </div>
            </div>

            {/* Timeline historique */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" /> Historique de suivi
              </h3>
              <div className="relative">
                {sortedHistory.map((entry, i) => {
                  const c = STATUS_COLORS[entry.status] || STATUS_COLORS['Initialisé']
                  return (
                    <div key={i} className="relative pl-8 mb-5 last:mb-0">
                      {/* Ligne verticale */}
                      {i < sortedHistory.length - 1 && (
                        <div className="absolute left-[11px] top-5 bottom-0 w-0.5 bg-gray-100" />
                      )}
                      {/* Dot */}
                      <div className={`absolute left-0 top-1 w-5 h-5 rounded-full border-2 border-white shadow ${i === 0 ? c.dot : 'bg-gray-200'} flex items-center justify-center`}>
                        {i === 0 && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      {/* Content */}
                      <div>
                        <p className={`text-sm font-semibold ${i === 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {(STATUS_ICONS as any)[entry.status]} {entry.status}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.timestamp).toLocaleString('fr-MA', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        {entry.note && <p className="text-xs text-gray-500 mt-0.5 italic">{entry.note}</p>}
                        {entry.location && (
                          <a
                            href={`https://maps.google.com/?q=${entry.location.lat},${entry.location.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-500 flex items-center gap-1 mt-0.5"
                          >
                            <MapPin className="w-3 h-3" /> Voir la position GPS
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Signature électronique */}
            {sig && (
              <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
                <div className="bg-green-600 px-5 py-3 flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-white/80" />
                  <p className="text-white font-bold text-sm">
                    {sig.signatureType === 'company_stamp' ? 'Preuve de livraison — Cachet société' : 'Preuve de livraison — Signature électronique'}
                  </p>
                </div>
                <div className="p-5 space-y-3">
                  <div className={`border rounded-2xl p-4 ${sig.signatureType === 'company_stamp' ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
                    <img
                      src={sig.signatureDataUrl}
                      alt={sig.signatureType === 'company_stamp' ? 'Cachet société' : 'Signature'}
                      className={sig.signatureType === 'company_stamp' ? 'w-full max-h-36 object-contain rounded-xl' : 'w-full h-20 object-contain'}
                    />
                    <div className={`border-t mt-3 pt-2 text-center space-y-1 ${sig.signatureType === 'company_stamp' ? 'border-orange-100' : 'border-green-100'}`}>
                      <p className="text-xs font-semibold text-gray-600">
                        {sig.signatureType === 'company_stamp' && sig.companyName ? sig.companyName : (sig.recipientName || parcel.receiver?.name)}
                      </p>
                      {sig.signatureType === 'company_stamp' && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">🏢 Cachet de société</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Confirmé le</span>
                    <span className="font-semibold text-gray-700">
                      {sig.signedAt
                        ? new Date(sig.signedAt).toLocaleString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 bg-green-100 rounded-xl px-4 py-2.5">
                    <span className="text-green-700 font-bold text-sm">✅ Livraison confirmée par le destinataire</span>
                  </div>
                </div>
              </div>
            )}

            {/* WhatsApp share */}
            <a
              href={`https://wa.me/?text=${whatsappMsg}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-semibold transition"
            >
              <MessageCircle className="w-5 h-5" /> Partager via WhatsApp
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
