import { useState, useEffect, useRef } from 'react'
import { X, MessageSquare, Send, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { LostParcelDeclaration, sendLostParcelMessage, getLostParcelMessages, LostParcelMessage } from '../firebase/lostParcels'

interface LostParcelConversationModalProps {
  lostParcel: LostParcelDeclaration
  agencyCity: string
  userProfile: {
    uid: string
    name: string
    role: string
  }
  onClose: () => void
  onRefresh: () => void
}

export default function LostParcelConversationModal({
  lostParcel,
  agencyCity,
  userProfile,
  onClose,
  onRefresh
}: LostParcelConversationModalProps) {
  const [newMessage, setNewMessage] = useState('')
  const [messageType, setMessageType] = useState<'question' | 'update' | 'response' | 'found'>('update')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = getLostParcelMessages(lostParcel)

  useEffect(() => {
    // Auto-scroll au dernier message
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    if (!newMessage.trim()) {
      setError('Écrivez un message')
      return
    }

    setSending(true)
    setError('')

    try {
      await sendLostParcelMessage(lostParcel.id, {
        agencyCity,
        sentBy: userProfile,
        messageType,
        found: messageType === 'found' ? true : undefined,
        text: newMessage.trim()
      })

      setNewMessage('')
      setMessageType('update')
      onRefresh()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setSending(false)
    }
  }

  const getMessageIcon = (msg: LostParcelMessage) => {
    if (msg.messageType === 'found' || msg.found) {
      return <CheckCircle className="w-4 h-4 text-green-600" />
    }
    if (msg.messageType === 'question') {
      return <AlertCircle className="w-4 h-4 text-blue-600" />
    }
    return <Info className="w-4 h-4 text-gray-600" />
  }

  const getMessageBgColor = (msg: LostParcelMessage) => {
    if (msg.agencyCity === agencyCity) {
      return 'bg-blue-500 text-white'
    }
    if (msg.messageType === 'found' || msg.found) {
      return 'bg-green-50 border border-green-200'
    }
    return 'bg-gray-100'
  }

  const timeRemaining = () => {
    const declared = lostParcel.declaredAt.toMillis()
    const fortyEightHours = 48 * 60 * 60 * 1000
    const deadline = declared + fortyEightHours
    const now = Date.now()
    const remaining = deadline - now

    if (remaining <= 0) return '⚠️ DÉLAI DÉPASSÉ'

    const hours = Math.floor(remaining / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}j ${hours % 24}h restantes`
    return `${hours}h restantes`
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">Conversation : Colis perdu</h3>
              <p className="text-xs font-mono text-red-600">{lostParcel.trackingId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Info */}
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div className="text-xs text-amber-800">
            <p><strong>Déclaré par :</strong> {lostParcel.declaredBy.name} ({lostParcel.declaredBy.city})</p>
            <p><strong>Dernière localisation :</strong> {lostParcel.lastKnownLocation}</p>
          </div>
          <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
            timeRemaining().includes('DÉPASSÉ')
              ? 'bg-red-500 text-white'
              : 'bg-amber-500 text-white'
          }`}>
            ⏰ {timeRemaining()}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Message initial */}
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="font-bold text-red-800">Déclaration initiale</span>
            </div>
            <p className="text-sm text-gray-700 mb-1">
              <strong>{lostParcel.declaredBy.name}</strong> ({lostParcel.declaredBy.city})
            </p>
            <p className="text-sm text-gray-600">{lostParcel.details}</p>
            <p className="text-xs text-gray-400 mt-2">
              {lostParcel.declaredAt.toDate().toLocaleString('fr-FR')}
            </p>
          </div>

          {/* Messages de conversation */}
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Aucun message pour le moment</p>
              <p className="text-gray-400 text-xs">Soyez le premier à répondre !</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMyMessage = msg.agencyCity === agencyCity
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${getMessageBgColor(msg)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {getMessageIcon(msg)}
                      <span className={`text-xs font-bold ${
                        isMyMessage ? 'text-blue-100' : 'text-gray-700'
                      }`}>
                        {msg.sentBy.name} ({msg.agencyCity})
                      </span>
                    </div>
                    <p className={`text-sm ${isMyMessage ? 'text-white' : 'text-gray-800'}`}>
                      {msg.text}
                    </p>
                    {msg.found && (
                      <div className="mt-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-lg inline-block">
                        ✅ COLIS TROUVÉ
                      </div>
                    )}
                    <p className={`text-xs mt-2 ${
                      isMyMessage ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {msg.sentAt.toDate().toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Input */}
        {lostParcel.status !== 'found' && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs font-semibold text-gray-600">Type :</label>
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as any)}
                className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="update">📢 Mise à jour</option>
                <option value="question">❓ Question</option>
                <option value="response">💬 Réponse</option>
                <option value="found">✅ TROUVÉ !</option>
              </select>
            </div>
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  messageType === 'found'
                    ? "Où se trouve le colis ? Quand peut-il être récupéré ?"
                    : "Écrivez votre message..."
                }
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
                className={`px-6 rounded-xl font-semibold transition disabled:opacity-50 ${
                  messageType === 'found'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 Appuyez sur <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">Entrée</kbd> pour envoyer
            </p>
          </div>
        )}

        {lostParcel.status === 'found' && (
          <div className="p-4 bg-green-50 border-t-2 border-green-500">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              <span className="font-bold">Colis retrouvé ! Conversation clôturée.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
