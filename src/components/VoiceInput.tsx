import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { searchExpediteurs, searchDestinataires, type Client } from '../firebase/clients'

interface VoiceInputProps {
  onResult: (field: string, value: string) => void
  onClientFound?: (client: Client, isSender: boolean) => void
  isListening: boolean
  setIsListening: (value: boolean) => void
}

// Mapping intelligent des champs - ORDRE IMPORTANT (du plus spécifique au plus général)
const FIELD_MAPPINGS: Record<string, string> = {
  // Expéditeur - phrases spécifiques d'abord
  'nom expéditeur': 'senderName',
  'nom de l\'expéditeur': 'senderName',
  'nom expé': 'senderName',
  'téléphone expéditeur': 'senderTel',
  'téléphone expé': 'senderTel',
  'tel expéditeur': 'senderTel',
  'tel expé': 'senderTel',
  'adresse expéditeur': 'senderAddress',
  'adresse expé': 'senderAddress',
  'ville expéditeur': 'senderCity',
  'ville expé': 'senderCity',
  'n exp': 'senderNic',
  'numéro exp': 'senderNic',
  'numéro expéditeur': 'senderNic',
  'nexp': 'senderNic',
  'n e x p': 'senderNic',
  'n x p': 'senderNic',
  'nex': 'senderNic',
  'numexp': 'senderNic',

  // Destinataire - phrases spécifiques
  'nom destinataire': 'receiverName',
  'nom du destinataire': 'receiverName',
  'nom dest': 'receiverName',
  'téléphone destinataire': 'receiverTel',
  'téléphone dest': 'receiverTel',
  'tel destinataire': 'receiverTel',
  'tel dest': 'receiverTel',
  'numéro destinataire': 'receiverTel',
  'adresse destinataire': 'receiverAddress',
  'adresse dest': 'receiverAddress',
  'ville destinataire': 'receiverCity',
  'ville dest': 'receiverCity',

  // Détails colis
  'nombre de colis': 'nbColis',
  'nombre colis': 'nbColis',
  'contre remboursement': 'codAmount',
  'montant cod': 'codAmount',
  'cod montant': 'codAmount',
  'nature marchandise': 'natureOfGoods',

  // Génériques en dernier
  'nom': 'senderName',
  'non': 'senderName', // ⚠️ Erreur courante de reconnaissance vocale !
  'noms': 'senderName',
  'téléphone': 'senderTel',
  'telephone': 'senderTel',
  'tel': 'senderTel',
  'tél': 'senderTel',
  'tèl': 'senderTel',
  'tele': 'senderTel',
  'numéro': 'senderTel',
  'numero': 'senderTel',
  'numéro de téléphone': 'senderTel',
  'portable': 'senderTel',
  'gsm': 'senderTel',
  'adresse': 'senderAddress',
  'adress': 'senderAddress',
  'address': 'senderAddress',
  'adres': 'senderAddress',
  'ville': 'senderCity',
  'vil': 'senderCity',
  'city': 'senderCity',
  'poids': 'weight',
  'poid': 'weight',
  'nombre': 'nbColis',
  'nature': 'natureOfGoods',
  'marchandise': 'natureOfGoods',
  'montant': 'codAmount',
}

// Nettoyer et corriger le texte de manière avancée
const cleanText = (text: string): string => {
  // Supprimer les répétitions
  const words = text.split(' ')
  const cleaned = words.filter((word, index) =>
    word !== words[index - 1] || index === 0
  )

  let result = cleaned.join(' ')

  // Correction des noms propres
  result = result
    .replace(/\b(mohamed|mohammed|mohamad)\b/gi, 'Mohamed')
    .replace(/\b(fatima|fatouma)\b/gi, 'Fatima')
    .replace(/\b(hassan|hassen)\b/gi, 'Hassan')
    .replace(/\b(omar|omer)\b/gi, 'Omar')
    .replace(/\b(ali)\b/gi, 'Ali')

  // Correction des villes marocaines
  result = result
    .replace(/\b(casablanca|casa|kazablanka)\b/gi, 'Casablanca')
    .replace(/\b(rabat|rbat)\b/gi, 'Rabat')
    .replace(/\b(marrakech|marrakesh)\b/gi, 'Marrakech')
    .replace(/\b(tanger|tangier)\b/gi, 'Tanger')
    .replace(/\b(agadir)\b/gi, 'Agadir')
    .replace(/\b(fès|fes|fez)\b/gi, 'Fès')
    .replace(/\b(meknès|meknes)\b/gi, 'Meknès')
    .replace(/\b(oujda)\b/gi, 'Oujda')
    .replace(/\b(tétouan|tetouan)\b/gi, 'Tétouan')

  // Correction des quartiers/zones courants
  result = result
    .replace(/\b(hay\s+)?mohammadi\b/gi, 'Hay Mohammadi')
    .replace(/\b(hay\s+)?hassani\b/gi, 'Hay Hassani')
    .replace(/\b(derb\s+)?sultan\b/gi, 'Derb Sultan')
    .replace(/\b(ain\s+)?sebaa\b/gi, 'Ain Sebaa')
    .replace(/\b(ain\s+)?chock\b/gi, 'Ain Chock')

  // Conversion des nombres dictés en chiffres
  result = result
    .replace(/\bzéro\b/gi, '0')
    .replace(/\bun\b/gi, '1')
    .replace(/\bdeux\b/gi, '2')
    .replace(/\btrois\b/gi, '3')
    .replace(/\bquatre\b/gi, '4')
    .replace(/\bcinq\b/gi, '5')
    .replace(/\bsix\b/gi, '6')
    .replace(/\bsept\b/gi, '7')
    .replace(/\bhuit\b/gi, '8')
    .replace(/\bneuf\b/gi, '9')

  return result.trim()
}

export default function VoiceInput({ onResult, onClientFound, isListening, setIsListening }: VoiceInputProps) {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const [targetInputName, setTargetInputName] = useState('')
  const focusedInputRef = useRef<HTMLInputElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const shouldRestartRef = useRef(true)
  const lastProcessedTextRef = useRef('')

  // Écouter les changements d'input en temps réel
  useEffect(() => {
    const handleFocusChange = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const input = target as HTMLInputElement

        // Toujours mettre à jour si le micro est actif
        if (isListening) {
          focusedInputRef.current = input
          setTargetInputName(input.placeholder || input.name || 'Champ actif')

          // RÉINITIALISER TOUT pour le nouvel input
          lastProcessedTextRef.current = ''
          setTranscript('')
          setInterimTranscript('')

        }
      }
    }

    // Écouter tous les focus sur le document (même si micro pas encore actif)
    document.addEventListener('focusin', handleFocusChange, true)

    return () => {
      document.removeEventListener('focusin', handleFocusChange, true)
    }
  }, [isListening])

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setIsSupported(false)
      setError('❌ Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez Chrome ou Edge.')
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true // ✅ ACTIVÉ pour rester actif en permanence
    recognition.interimResults = true
    recognition.lang = 'fr-FR'
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      setInterimTranscript(interim)

      if (final) {
        const cleaned = cleanText(final)

        // Vérifier l'état de focusedInput : 'NULL')

        parseAndFillForm(cleaned)

        // PAS DE REDÉMARRAGE - continuous = true garde le micro actif !
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)

      if (event.error === 'not-allowed') {
        shouldRestartRef.current = false
        setError('🎤 Permission du microphone refusée ! Cliquez sur l\'icône 🔒 dans la barre d\'adresse et autorisez le microphone.')
        setIsListening(false)
      } else if (event.error === 'no-speech') {
        // Normal - aucun son détecté, le système redémarre automatiquement
      } else if (event.error === 'aborted') {
        // Normal - redémarrage en cours, ne rien faire
      } else if (event.error === 'network') {
        shouldRestartRef.current = false
        setError('🌐 Erreur réseau. Vérifiez votre connexion internet.')
        setIsListening(false)
      } else if (event.error === 'service-not-allowed') {
        shouldRestartRef.current = false
        setError('🔒 Site non sécurisé (HTTPS requis). Le microphone ne fonctionne que sur HTTPS.')
        setIsListening(false)
      } else {
        console.warn('Unhandled speech recognition error:', event.error)
        // Ne pas arrêter pour les erreurs inconnues
      }
    }

    recognition.onend = () => {
      // NE PAS redémarrer ici - le redémarrage se fait dans onresult après succès
    }

    recognitionRef.current = recognition

    return () => {
      if (recognition) {
        recognition.stop()
      }
    }
  }, [isListening])

  useEffect(() => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start()
      } catch (e: any) {
        console.error('Error starting recognition:', e)
        setError('❌ Impossible de démarrer le micro. Vérifiez les permissions.')
        setIsListening(false)
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore les erreurs lors de l'arrêt
      }
    }
  }, [isListening, setIsListening])

  // Mapper les placeholders vers les noms de champs
  const getFieldNameFromInput = (input: HTMLInputElement): string | null => {
    const placeholder = input.placeholder?.toLowerCase() || ''
    const name = input.name?.toLowerCase() || ''

    // Chercher dans la section PARENTE directe de l'input
    const parentSection = input.closest('section')?.textContent?.toLowerCase() || ''
    const isDestinataireSection = parentSection.includes('destinataire')
    const isExpediteurSection = parentSection.includes('expéditeur')

    // Mapping pour les noms complets
    if (placeholder.includes('nom complet') || placeholder.includes('nom') || placeholder.includes('chercher')) {
      if (isDestinataireSection) return 'receiverName'
      if (isExpediteurSection) return 'senderName'
      return 'senderName' // Par défaut
    }

    // Mapping des placeholders pour téléphone
    if (placeholder.includes('téléphone') || name.includes('tel')) {
      if (isDestinataireSection) return 'receiverTel'
      if (isExpediteurSection) return 'senderTel'
      return 'senderTel' // Par défaut
    }

    // Mapping pour adresse
    if (placeholder.includes('adresse') || name.includes('address')) {
      if (isDestinataireSection) return 'receiverAddress'
      if (isExpediteurSection) return 'senderAddress'
      return 'senderAddress'
    }

    // Mapping pour ville
    if (placeholder.includes('ville') || name.includes('city')) {
      if (isDestinataireSection) return 'receiverCity'
      if (isExpediteurSection) return 'senderCity'
      return 'senderCity'
    }

    // Mapping pour NIC (Numéro expéditeur)
    if (placeholder.includes('nic') || placeholder.includes('numéro') || placeholder.includes('n°') ||
        placeholder.includes('n exp') || placeholder.includes('nexp')) {
      if (isExpediteurSection) return 'senderNic'
      return 'senderNic'
    }

    // Mapping pour poids
    if (placeholder.includes('poids') || name.includes('weight')) {
      return 'weight'
    }

    // Mapping pour nombre de colis
    if (placeholder.includes('nb de colis') || placeholder.includes('nombre de colis')) {
      return 'nbColis'
    }

    // Mapping pour contenu du colis
    if (placeholder.includes('contenu')) {
      return 'parcelContent'
    }

    // Mapping pour prix
    if (placeholder.includes('prix') || name.includes('price')) {
      return 'price'
    }

    // Mapping pour COD / Retour fond
    if (placeholder.includes('cod') || placeholder.includes('contre remboursement') ||
        placeholder.includes('retour fond')) {
      return 'codAmount'
    }

    // Mapping pour montant du port
    // Le placeholder change dynamiquement dans le formulaire
    if (placeholder.includes('montant du port payé') ||
        placeholder.includes('montant à payer par le destinataire')) {
      return 'portPrice'
    }

    // Mapping pour remarques
    if (placeholder.includes('remarque') || placeholder.includes('note')) {
      return 'remarks'
    }

    return null
  }

  const parseAndFillForm = (text: string) => {
    // Éviter de traiter plusieurs fois le même texte
    if (text === lastProcessedTextRef.current) {
      return
    }

    // Nettoyer et corriger le texte
    const cleanedValue = cleanText(text)

    if (!cleanedValue) {
      return
    }

    // Marquer comme traité
    lastProcessedTextRef.current = text

    // Si on a un input focalisé
    if (focusedInputRef.current) {

      // Essayer de trouver le nom du champ
      const fieldName = getFieldNameFromInput(focusedInputRef.current)

      if (fieldName) {

        // 🔍 RECHERCHE AUTOMATIQUE DE CLIENT si c'est un champ nom
        if ((fieldName === 'senderName' || fieldName === 'receiverName') && onClientFound) {
          const isSender = fieldName === 'senderName'
          const searchFunc = isSender ? searchExpediteurs : searchDestinataires

          // Recherche asynchrone
          searchFunc(cleanedValue).then(clients => {
            if (clients.length > 0) {
              const client = clients[0]
              onClientFound(client, isSender)
              setSuccess(`✅ ${client.name} - ${client.tel}`)
              setTimeout(() => setSuccess(''), 2000)
            } else {
              // Si pas trouvé, juste remplir le nom
              onResult(fieldName, cleanedValue)
              setSuccess(`✓ ${cleanedValue}`)
              setTimeout(() => setSuccess(''), 1500)
            }
          }).catch(err => {
            console.error('❌ Erreur recherche client:', err)
            // En cas d'erreur, juste remplir le nom
            onResult(fieldName, cleanedValue)
          })
          return
        }

        // ✅ TOUJOURS utiliser le callback React (pas de DOM direct)
        onResult(fieldName, cleanedValue)
        setSuccess(`✓ ${cleanedValue}`)
        setTimeout(() => setSuccess(''), 1500)
        return
      }

      // Si aucun champ détecté, afficher erreur
      setError('Champ non reconnu')
      setTimeout(() => setError(''), 2000)
    } else {
    }

    // Sinon, utiliser le mapping comme fallback
    const lowerText = text.toLowerCase()
    for (const [trigger, field] of Object.entries(FIELD_MAPPINGS)) {
      const triggerIndex = lowerText.indexOf(trigger)
      if (triggerIndex !== -1) {
        const afterTrigger = text.substring(triggerIndex + trigger.length).trim()
        if (afterTrigger) {
          const cleanedValue = cleanText(afterTrigger)
          onResult(field, cleanedValue)
          setSuccess(`✓ ${cleanedValue}`)
          setTimeout(() => {
            setTranscript('')
            setSuccess('')
          }, 2000)
          return
        }
      }
    }
  }

  const toggleListening = () => {
    if (!isSupported) {
      setError('❌ Reconnaissance vocale non supportée. Utilisez Chrome ou Edge.')
      return
    }

    if (!isListening) {
      // Démarrer l'écoute
      setTargetInputName('👉 Cliquez sur un input pour commencer')

      // Vérifier si un input est déjà focalisé
      const activeElement = document.activeElement as HTMLInputElement
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        focusedInputRef.current = activeElement
        setTargetInputName(activeElement.placeholder || activeElement.name || 'Champ actif')
      }

      // Réinitialiser les textes
      lastProcessedTextRef.current = ''
      setTranscript('')
      setInterimTranscript('')
    } else {
      // Arrêter l'écoute
      focusedInputRef.current = null
      setTargetInputName('')
    }

    setError('')
    setSuccess('')
    shouldRestartRef.current = true
    setIsListening(!isListening)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleListening}
        disabled={!isSupported}
        title={isListening ? "Arrêter la dictée" : "Activer la dictée vocale"}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all transform ${
          !isSupported
            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
            : isListening
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse'
            : 'bg-gray-800 text-white hover:bg-gray-700 hover:shadow-lg hover:scale-110'
        }`}
      >
        {isListening ? (
          <MicOff className="w-5 h-5" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      {/* Indicateur de l'input ciblé */}
      {isListening && (
        <div className={`absolute top-full mt-2 left-0 right-0 rounded-xl shadow-xl border-2 p-3 z-50 ${
          focusedInputRef.current
            ? 'bg-green-50 border-green-200 animate-pulse'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            <div className="text-xl">{focusedInputRef.current ? '🎯' : '👉'}</div>
            <p className={`text-sm font-bold ${focusedInputRef.current ? 'text-green-900' : 'text-yellow-900'}`}>
              {focusedInputRef.current ? (
                <>Écriture dans : <span className="text-green-600">{targetInputName}</span></>
              ) : (
                <span className="text-yellow-600">{targetInputName}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-red-50 rounded-xl shadow-xl border-2 border-red-200 p-4 z-50">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900 mb-2">{error}</p>
              {error.includes('Permission') && (
                <div className="text-xs text-red-700 space-y-1">
                  <p><strong>📱 Sur Chrome/Edge :</strong></p>
                  <p>1. Cliquez sur l'icône 🔒 ou ⓘ à gauche de l'URL</p>
                  <p>2. Autorisez le microphone</p>
                  <p>3. Rechargez la page</p>
                </div>
              )}
              <button
                onClick={() => setError('')}
                className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message de succès */}
      {success && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-green-50 rounded-xl shadow-xl border-2 border-green-200 p-3 z-50 animate-bounce">
          <div className="flex items-center gap-2">
            <div className="text-2xl">✅</div>
            <p className="text-sm font-bold text-green-900">{success}</p>
          </div>
        </div>
      )}

      {/* Transcript en temps réel */}
      {!success && (transcript || interimTranscript) && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border-2 border-purple-200 p-3 z-50">
          <div className="flex items-start gap-2">
            <Volume2 className="w-4 h-4 text-purple-500 mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-900">
                {transcript}
                <span className="text-gray-400 italic">{interimTranscript}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
