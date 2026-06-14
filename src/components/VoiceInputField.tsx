import { useState, useRef, useEffect } from 'react'
import { Mic, Check, X } from 'lucide-react'

interface VoiceInputFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
  type?: string
}

export default function VoiceInputField({
  value,
  onChange,
  placeholder,
  className,
  required,
  type = 'text'
}: VoiceInputFieldProps) {
  const [isListening, setIsListening] = useState(false)
  const [tempValue, setTempValue] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'fr-FR'
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let final = ''
      let interim = ''

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final = transcript
        } else {
          interim = transcript
        }
      }

      if (final) {
        const cleaned = cleanText(final)
        setTempValue(cleaned)
        setShowConfirm(true)
        setIsListening(false)
      } else if (interim) {
        setTempValue(interim)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      if (recognition) {
        recognition.stop()
      }
    }
  }, [])

  const cleanText = (text: string): string => {
    // Supprimer les répétitions
    const words = text.split(' ')
    const cleaned = words.filter((word, index) =>
      word !== words[index - 1] || index === 0
    )

    // Corriger les fautes courantes
    return cleaned.join(' ')
      .replace(/mohamed/gi, 'Mohamed')
      .replace(/maroc/gi, 'Maroc')
      .replace(/casablanca/gi, 'Casablanca')
      .replace(/rabat/gi, 'Rabat')
      .trim()
  }

  const startListening = () => {
    if (!recognitionRef.current) return

    setTempValue('')
    setShowConfirm(false)
    setIsListening(true)

    try {
      recognitionRef.current.start()
    } catch (e) {
      console.error('Error starting:', e)
      setIsListening(false)
    }
  }

  const confirmValue = () => {
    onChange(tempValue)
    setShowConfirm(false)
    setTempValue('')
  }

  const cancelValue = () => {
    setShowConfirm(false)
    setTempValue('')
  }

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (showConfirm) {
      setTempValue(e.target.value)
    } else {
      onChange(e.target.value)
    }
  }

  const displayValue = showConfirm ? tempValue : value

  return (
    <div className="relative flex items-center gap-2">
      <input
        ref={inputRef}
        type={type}
        value={displayValue}
        onChange={handleManualChange}
        placeholder={placeholder}
        required={required}
        className={`${className} ${isListening ? 'ring-2 ring-purple-400 ring-opacity-50' : ''} ${showConfirm ? 'ring-2 ring-green-400' : ''}`}
      />

      {/* Bouton Micro */}
      <button
        type="button"
        onClick={startListening}
        disabled={isListening}
        className={`flex-shrink-0 p-2 rounded-lg transition-all ${
          isListening
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-600 hover:from-purple-200 hover:to-pink-200'
        }`}
        title="Dicter"
      >
        <Mic className="w-4 h-4" />
      </button>

      {/* Boutons Confirmer/Annuler */}
      {showConfirm && (
        <div className="absolute -top-12 right-0 bg-white rounded-lg shadow-xl border-2 border-green-200 p-2 flex gap-2 z-50 animate-bounce">
          <button
            type="button"
            onClick={confirmValue}
            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            title="Confirmer"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={cancelValue}
            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            title="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Indicateur d'écoute */}
      {isListening && (
        <div className="absolute -top-10 left-0 right-0 bg-purple-500 text-white text-xs py-1 px-2 rounded-lg text-center animate-pulse">
          🎤 J'écoute...
        </div>
      )}
    </div>
  )
}
