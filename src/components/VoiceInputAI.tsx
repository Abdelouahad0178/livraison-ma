/**
 * 🤖 VOICE INPUT AI - VERSION INTELLIGENTE
 * Comprend darija + français + arabe mélangés
 * Remplit automatiquement tout le formulaire en parlant librement
 */

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Sparkles, Check, X, AlertCircle, Loader } from 'lucide-react'
import { extractParcelDataFromSpeech, type ExtractionResult } from '../services/aiAgent'
import type { Client } from '../firebase/clients'

interface VoiceInputAIProps {
  onResult: (field: string, value: string) => void
  onBulkFill?: (data: Record<string, any>) => void // Remplissage multiple
  onClientFound?: (client: Client, isSender: boolean) => void
}

export default function VoiceInputAI({ onResult, onBulkFill, onClientFound }: VoiceInputAIProps) {
  const [isListening, setIsListening] = useState(false)
  const [aiMode, setAiMode] = useState(false) // Toggle IA ON/OFF
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null)
  const [editableData, setEditableData] = useState<Record<string, any>>({}) // Données éditables
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const recognitionRef = useRef<any>(null)
  const accumulatedTextRef = useRef('')
  const isListeningRef = useRef(isListening)

  // Clé API Claude depuis .env.local
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY

  // Initialiser Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('❌ Reconnaissance vocale non supportée. Utilisez Chrome ou Edge.')
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'fr-FR' // Français comme base
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += text
        } else {
          interim += text
        }
      }

      setInterimTranscript(interim)

      if (final) {
        console.log('🎤 Texte final:', final)
        accumulatedTextRef.current += ' ' + final
        setTranscript(accumulatedTextRef.current.trim())
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error)

      if (event.error === 'not-allowed') {
        setError('🎤 Permission microphone refusée. Autorisez dans les paramètres du navigateur.')
        setIsListening(false)
      } else if (event.error === 'network') {
        // Erreur réseau - informer l'utilisateur mais continuer
        console.warn('⚠️ Erreur réseau temporaire - le micro va redémarrer automatiquement')
        setError('⚠️ Connexion perdue. Redémarrage automatique...')
        setTimeout(() => setError(''), 3000)
        // Le micro redémarrera automatiquement via onend
      } else if (event.error === 'no-speech') {
        // Aucun son détecté - afficher un message d'aide
        console.log('ℹ️ Aucun son détecté - vérifier le microphone')
        setError('🎤 Aucune parole détectée. Parlez PLUS FORT et vérifiez votre micro.')
        setTimeout(() => setError(''), 4000)
        // Le micro redémarrera automatiquement
      } else if (event.error === 'aborted') {
        // Arrêt normal - ne rien faire
        console.log('ℹ️ Reconnaissance arrêtée')
      } else {
        // Autres erreurs
        console.warn('⚠️ Erreur reconnaissance vocale:', event.error)
        setError(`⚠️ Erreur: ${event.error}`)
        setTimeout(() => setError(''), 3000)
      }
    }

    recognition.onend = () => {
      // Redémarrage automatique si le micro est censé être actif
      if (isListeningRef.current) {
        console.log('🔄 Redémarrage automatique du micro...')
        setTimeout(() => {
          try {
            if (recognitionRef.current && isListeningRef.current) {
              recognitionRef.current.start()
            }
          } catch (e) {
            console.error('Erreur redémarrage:', e)
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition

    return () => {
      if (recognition) recognition.stop()
    }
  }, [])

  // Démarrer/Arrêter la reconnaissance
  useEffect(() => {
    isListeningRef.current = isListening

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start()
      } catch (e) {
        console.error('Erreur démarrage micro:', e)
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore
      }
    }
  }, [isListening])

  const toggleListening = () => {
    if (!isListening) {
      // Démarrer
      accumulatedTextRef.current = ''
      setTranscript('')
      setInterimTranscript('')
      setExtracted(null)
      setError('')
      setSuccess('')
    }
    setIsListening(!isListening)
  }

  const handleExtract = async () => {
    if (!transcript.trim()) {
      setError('Parlez d\'abord pour enregistrer votre message')
      return
    }

    setExtracting(true)
    setError('')

    try {
      const result = await extractParcelDataFromSpeech(transcript, apiKey)
      console.log('✅ Extraction réussie:', result)
      setExtracted(result)

      // Initialiser les données éditables avec les données extraites
      setEditableData(result.data || {})

      if (result.confidence < 0.5 && apiKey) {
        setError('⚠️ Confiance faible. Vérifiez et corrigez les données avant de valider.')
      }
    } catch (err: any) {
      console.error('❌ Erreur extraction:', err)
      setError('Erreur lors de l\'extraction. Réessayez.')
    } finally {
      setExtracting(false)
    }
  }

  const handleValidate = () => {
    if (!editableData || Object.keys(editableData).length === 0) return

    // Remplir tous les champs avec les données ÉDITÉES
    if (onBulkFill) {
      onBulkFill(editableData)
    } else {
      // Fallback : remplir un par un
      Object.entries(editableData).forEach(([field, value]) => {
        if (value) onResult(field, String(value))
      })
    }

    setSuccess('✅ Formulaire rempli avec succès !')
    setTimeout(() => {
      setExtracted(null)
      setEditableData({})
      setTranscript('')
      accumulatedTextRef.current = ''
      setSuccess('')
    }, 2000)
  }

  const handleCancel = () => {
    setExtracted(null)
    setEditableData({})
    setTranscript('')
    accumulatedTextRef.current = ''
  }

  // Affichage des données extraites - GRAND ET CLAIR
  const renderExtractedData = () => {
    if (!extracted) return null

    const { data, confidence, needsConfirmation } = extracted
    const fields = Object.entries(data).filter(([_, value]) => value)

    // Mapping des noms de champs en français
    const fieldLabels: Record<string, string> = {
      senderName: '📤 Expéditeur - Nom',
      senderTel: '📤 Expéditeur - Téléphone',
      senderCity: '📤 Expéditeur - Ville',
      senderAddress: '📤 Expéditeur - Adresse',
      receiverName: '📥 Destinataire - Nom',
      receiverTel: '📥 Destinataire - Téléphone',
      receiverCity: '📥 Destinataire - Ville',
      receiverAddress: '📥 Destinataire - Adresse',
      weight: '⚖️ Poids (kg)',
      nbColis: '📦 Nombre de colis',
      portType: '💰 Type de port',
      portPrice: '💰 Prix du port (DH)',
      codAmount: '💵 Retour fond (DH)',
      parcelContent: '📦 Contenu'
    }

    return (
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-purple-300 overflow-hidden mb-4">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6" />
              <h3 className="text-xl font-bold">Données extraites par l'IA</h3>
            </div>
            <div className={`px-4 py-2 rounded-xl text-base font-bold ${
              confidence > 0.7
                ? 'bg-green-500 text-white'
                : confidence > 0.5
                ? 'bg-yellow-400 text-gray-900'
                : 'bg-orange-500 text-white'
            }`}>
              {Math.round(confidence * 100)}% confiance
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="p-6">
          {fields.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-lg text-gray-500">Aucune donnée extraite</p>
              <p className="text-sm text-gray-400 mt-1">Essayez de parler plus clairement</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">
                  ✏️ Vous pouvez modifier les données ci-dessous avant de valider
                </p>
              </div>

              {fields.map(([field, value]) => {
                const needsCheck = needsConfirmation?.includes(field)
                const label = fieldLabels[field] || field
                const editableValue = editableData[field] !== undefined ? editableData[field] : value

                return (
                  <div
                    key={field}
                    className={`p-4 rounded-xl border-2 ${
                      needsCheck
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">
                      {needsCheck && <AlertCircle className="w-4 h-4 text-yellow-600 inline mr-1" />}
                      {label}
                    </label>

                    {/* Champ éditable selon le type */}
                    {field === 'portType' ? (
                      <select
                        value={editableValue || ''}
                        onChange={(e) => setEditableData({ ...editableData, [field]: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-base font-semibold text-gray-900 focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">-- Choisir --</option>
                        <option value="port_paye">Port Payé</option>
                        <option value="port_du">Port Dû</option>
                      </select>
                    ) : field === 'weight' || field === 'portPrice' || field === 'codAmount' || field === 'nbColis' ? (
                      <input
                        type="number"
                        value={editableValue || ''}
                        onChange={(e) => setEditableData({ ...editableData, [field]: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-base font-semibold text-gray-900 focus:border-purple-500 focus:outline-none"
                        placeholder={`Entrez ${label.toLowerCase()}`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={editableValue || ''}
                        onChange={(e) => setEditableData({ ...editableData, [field]: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-base font-semibold text-gray-900 focus:border-purple-500 focus:outline-none"
                        placeholder={`Entrez ${label.toLowerCase()}`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Annuler
            </button>
            <button
              onClick={handleValidate}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold hover:shadow-2xl hover:scale-105 transition flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> Valider et remplir le formulaire
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Barre de contrôle */}
      <div className="flex items-center gap-3 mb-3">
        {/* Toggle Mode IA */}
        <button
          type="button"
          onClick={() => setAiMode(!aiMode)}
          title={aiMode ? "Mode IA activé" : "Mode classique"}
          className={`px-4 py-2 rounded-xl font-bold transition-all ${
            aiMode
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {aiMode ? (
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> Mode IA
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Mic className="w-5 h-5" /> Activer IA
            </span>
          )}
        </button>

        {/* Bouton Micro */}
        {aiMode && (
          <button
            type="button"
            onClick={toggleListening}
            title={isListening ? "Arrêter l'écoute" : "Démarrer l'écoute"}
            className={`px-4 py-2 rounded-xl font-bold transition-all transform ${
              isListening
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse'
                : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'
            }`}
          >
            {isListening ? (
              <span className="flex items-center gap-2">
                <MicOff className="w-5 h-5" /> Arrêter
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Mic className="w-5 h-5" /> Parler
              </span>
            )}
          </button>
        )}

        {/* Bouton Extraire */}
        {aiMode && transcript && !isListening && (
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {extracting ? (
              <>
                <Loader className="w-5 h-5 animate-spin" /> Analyse en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" /> Extraire les données
              </>
            )}
          </button>
        )}
      </div>

      {/* Zone de texte GRANDE et CLAIRE */}
      {aiMode && (
        <div className="mb-4">
          <div className="bg-white rounded-2xl shadow-lg border-2 border-purple-200 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 flex items-center gap-2">
              <Mic className="w-5 h-5" />
              <span className="font-bold">
                {isListening ? '🎙️ En écoute... Parlez maintenant !' : '📝 Texte à analyser'}
              </span>
            </div>

            <textarea
              value={transcript + (isListening ? ' ' + interimTranscript : '')}
              onChange={(e) => {
                setTranscript(e.target.value)
                accumulatedTextRef.current = e.target.value
              }}
              placeholder="Parlez librement en darija/français/arabe mélangés...

Exemple: '3andi colis mn Mohammed dyal Casa téléphone 0661234567 ghadi l Rabat l Fatima rue Mohammed V 25 wazn 3 kilos port khalsatou 80 dirham'"
              className="w-full p-4 text-lg text-gray-900 focus:outline-none resize-none"
              style={{ minHeight: '150px' }}
              disabled={isListening}
            />

            {transcript && !isListening && (
              <div className="px-4 pb-3 flex items-center gap-2 text-sm text-gray-500">
                <AlertCircle className="w-4 h-4" />
                <span>Vous pouvez modifier le texte avant de cliquer sur "Extraire"</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Données extraites - CENTRÉES ET CLAIRES */}
      {extracted && renderExtractedData()}

      {/* Messages - CENTRÉS */}
      {error && (
        <div className="bg-red-50 rounded-xl shadow-lg border-2 border-red-300 p-4 mb-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-bold text-red-900 mb-1">Erreur</p>
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError('')}
              className="text-red-600 hover:text-red-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 rounded-xl shadow-lg border-2 border-green-300 p-4 mb-3">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 text-green-600" />
            <p className="text-base font-bold text-green-900">{success}</p>
          </div>
        </div>
      )}

      {/* Info pas de clé API */}
      {aiMode && !apiKey && (
        <div className="bg-yellow-50 rounded-xl shadow-lg border-2 border-yellow-300 p-4 mb-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-bold text-yellow-900 mb-1">⚠️ Mode basique activé</p>
              <p className="text-sm text-yellow-800">Clé API Claude non configurée. Ajoutez VITE_CLAUDE_API_KEY dans .env.local pour l'IA complète.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
