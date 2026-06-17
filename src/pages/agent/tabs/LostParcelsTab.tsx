import { useState, useEffect } from 'react'
import { AlertTriangle, Search, CheckCircle, XCircle, Trash2, Plus, X, MessageSquare } from 'lucide-react'
import { getAllLostParcels, respondToLostParcel, deleteLostParcel, declareLostParcel, LostParcelDeclaration, getLostParcelMessages } from '../../../firebase/lostParcels'
import { searchParcelByTrackingId } from '../../../firebase/parcels'
import { CITIES } from '../../../firebase/constants'
import LostParcelConversationModal from '../../../components/LostParcelConversationModal'

interface LostParcelsTabProps {
  agencyCity: string
  profile: any
  setMsg: (msg: { type: string; text: string } | null) => void
}

export default function LostParcelsTab({ agencyCity, profile, setMsg }: LostParcelsTabProps) {
  const [lostParcels, setLostParcels] = useState<LostParcelDeclaration[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [responding, setResponding] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showDeclareModal, setShowDeclareModal] = useState(false)
  const [declareTrackingId, setDeclareTrackingId] = useState('')
  const [declareLocation, setDeclareLocation] = useState(agencyCity)
  const [declareDetails, setDeclareDetails] = useState('')
  const [declaring, setDeclaring] = useState(false)
  const [conversationParcel, setConversationParcel] = useState<LostParcelDeclaration | null>(null)

  useEffect(() => {
    loadLostParcels()
  }, [agencyCity])

  const loadLostParcels = async () => {
    setLoading(true)
    try {
      const all = await getAllLostParcels()
      const relevant = all.filter(lp => lp.responses[agencyCity])
      relevant.sort((a, b) => {
        const aResponded = a.responses[agencyCity]?.responded
        const bResponded = b.responses[agencyCity]?.responded
        if (aResponded === bResponded) return b.declaredAt.toMillis() - a.declaredAt.toMillis()
        return aResponded ? 1 : -1
      })
      setLostParcels(relevant)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRespond = async (lp: LostParcelDeclaration, found: boolean, comment: string) => {
    setResponding(lp.id)
    try {
      await respondToLostParcel(lp.id, {
        agencyCity,
        found,
        comment,
        respondedBy: {
          uid: profile?.uid || profile?.id || '',
          name: profile?.name || 'Chef ' + agencyCity
        }
      })
      setMsg({ type: 'success', text: found ? '✅ Trouvé !' : '✅ Réponse envoyée' })
      await loadLostParcels()
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    } finally {
      setResponding(null)
    }
  }

  const handleDelete = async (lp: LostParcelDeclaration) => {
    if (confirmDelete !== lp.id) {
      setConfirmDelete(lp.id)
      setTimeout(() => setConfirmDelete(null), 3000)
      return
    }
    setDeleting(lp.id)
    try {
      await deleteLostParcel(lp.id, lp.parcelId)
      setMsg({ type: 'success', text: '✅ Supprimé' })
      setConfirmDelete(null)
      await loadLostParcels()
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    } finally {
      setDeleting(null)
    }
  }

  const filtered = lostParcels.filter(lp =>
    !searchTerm || lp.trackingId.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pending = filtered.filter(lp => !lp.responses[agencyCity]?.responded)
  const answered = filtered.filter(lp => lp.responses[agencyCity]?.responded)

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  const handleDeclare = async () => {
    if (!declareTrackingId.trim()) {
      setMsg({ type: 'error', text: '❌ Entrez un tracking ID' })
      return
    }
    if (!declareDetails.trim()) {
      setMsg({ type: 'error', text: '❌ Ajoutez des détails' })
      return
    }

    setDeclaring(true)
    try {
      const parcel = await searchParcelByTrackingId(declareTrackingId)
      if (!parcel) {
        setMsg({ type: 'error', text: '❌ Colis introuvable' })
        setDeclaring(false)
        return
      }

      await declareLostParcel(
        parcel.id,
        declareTrackingId,
        {
          uid: profile.uid || profile.id || profile.email || 'chef-' + agencyCity,
          name: profile.name || 'Chef ' + agencyCity,
          role: profile.role || 'chef_agence',
          city: agencyCity
        },
        declareLocation,
        declareDetails,
        CITIES
      )

      setMsg({ type: 'success', text: '✅ Colis déclaré perdu. Toutes les agences alertées !' })
      setShowDeclareModal(false)
      setDeclareTrackingId('')
      setDeclareDetails('')
      setDeclareLocation(agencyCity)
      await loadLostParcels()
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    } finally {
      setDeclaring(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <div>
              <h2 className="font-bold text-gray-800">Colis perdus - {agencyCity}</h2>
              <p className="text-sm text-gray-600">{pending.length} en attente</p>
            </div>
          </div>
          <button onClick={() => setShowDeclareModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition">
            <Plus className="w-4 h-4" /> Déclarer
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher..."
          className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
        />
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">⏳ En attente ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map(lp => <Card key={lp.id} lp={lp} agencyCity={agencyCity} onRespond={handleRespond} onDelete={handleDelete} onOpenConversation={() => setConversationParcel(lp)} responding={responding === lp.id} deleting={deleting === lp.id} confirmDelete={confirmDelete === lp.id} />)}
          </div>
        </div>
      )}

      {answered.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-600 mb-3">✅ Traités ({answered.length})</h3>
          <div className="space-y-3">
            {answered.map(lp => <Card key={lp.id} lp={lp} agencyCity={agencyCity} onDelete={handleDelete} onOpenConversation={() => setConversationParcel(lp)} deleting={deleting === lp.id} confirmDelete={confirmDelete === lp.id} answered />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && <div className="text-center py-12 bg-gray-50 rounded-xl"><p className="text-gray-500">Aucun colis perdu</p></div>}

      {/* Modal Conversation */}
      {conversationParcel && (
        <LostParcelConversationModal
          lostParcel={conversationParcel}
          agencyCity={agencyCity}
          userProfile={{
            uid: profile?.uid || profile?.id || profile?.email || 'user-' + agencyCity,
            name: profile?.name || 'Chef ' + agencyCity,
            role: profile?.role || 'agent'
          }}
          onClose={() => setConversationParcel(null)}
          onRefresh={loadLostParcels}
        />
      )}

      {/* Modal Déclaration */}
      {showDeclareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Déclarer un colis perdu</h3>
              <button onClick={() => setShowDeclareModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Tracking ID</label>
                <input value={declareTrackingId} onChange={(e) => setDeclareTrackingId(e.target.value)} placeholder="LMA-XXXXXXXX-XXXX" className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Dernière localisation</label>
                <select value={declareLocation} onChange={(e) => setDeclareLocation(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none">
                  {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Détails de la perte</label>
                <textarea value={declareDetails} onChange={(e) => setDeclareDetails(e.target.value)} placeholder="Décrivez les circonstances..." className="w-full p-3 border-2 border-gray-200 rounded-lg resize-none focus:border-blue-500 focus:outline-none" rows={4} />
              </div>
              <button onClick={handleDeclare} disabled={declaring} className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition disabled:opacity-50">
                {declaring ? 'Déclaration en cours...' : '🚨 Déclarer perdu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ lp, agencyCity, onRespond, onDelete, onOpenConversation, responding, deleting, confirmDelete, answered }: any) {
  const [comment, setComment] = useState('')
  const response = lp.responses[agencyCity]
  const messages = getLostParcelMessages(lp)
  const messageCount = messages.length

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
      <div className="flex justify-between mb-3">
        <div>
          <p className="font-mono font-bold text-lg text-red-700">{lp.trackingId}</p>
          <p className="text-sm text-gray-600">{lp.declaredAt.toDate().toLocaleDateString('fr-FR')}</p>
        </div>
        {messageCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
            <MessageSquare className="w-3 h-3" />
            {messageCount}
          </div>
        )}
      </div>
      <div className="space-y-1 mb-3 text-sm">
        <p><strong>Localisation :</strong> {lp.lastKnownLocation}</p>
        <p><strong>Détails :</strong> {lp.details}</p>
        <p><strong>Par :</strong> {lp.declaredBy.name} ({lp.declaredBy.city})</p>
      </div>

      {/* Bouton principal : Ouvrir la conversation */}
      <button
        onClick={onOpenConversation}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 mb-2"
      >
        <MessageSquare className="w-5 h-5" />
        {messageCount === 0 ? '💬 Répondre (conversation)' : `💬 Voir conversation (${messageCount})`}
      </button>

      {/* Mode rapide (ancien système pour compatibilité) */}
      {!answered && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 py-1">
            ⚡ Mode rapide (ancienne méthode)
          </summary>
          <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commentaire rapide..." className="w-full p-2 border-2 rounded-lg resize-none text-sm" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => onRespond(lp, true, comment)} disabled={responding} className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm">
                {responding ? '...' : '✅ Trouvé'}
              </button>
              <button onClick={() => onRespond(lp, false, comment)} disabled={responding} className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold text-sm">
                {responding ? '...' : '❌ Non'}
              </button>
            </div>
          </div>
        </details>
      )}

      {answered && response && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            {response.found ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-gray-500" />}
            <span className="font-semibold">{response.found ? 'Trouvé' : 'Pas trouvé'}</span>
          </div>
          {response.comment && <p className="text-xs text-gray-600 mt-2">"{response.comment}"</p>}
        </div>
      )}

      <button onClick={() => onDelete(lp)} disabled={deleting} className={`w-full mt-2 px-4 py-2 rounded-lg text-sm font-semibold ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>
        {deleting ? '...' : confirmDelete ? '⚠️ Confirmer ?' : '🗑️ Supprimer'}
      </button>
    </div>
  )
}
