import { useState, useEffect } from 'react'

interface InternetStatusProps {
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline'

export default function InternetStatus({
  className = '',
  showLabel = true,
  size = 'md'
}: InternetStatusProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [latency, setLatency] = useState<number | null>(null)
  const [quality, setQuality] = useState<ConnectionQuality>('good')

  // Tailles selon la prop size
  const sizes = {
    sm: { container: 'w-16 h-16', ring: 'w-12 h-12', dot: 'w-3 h-3', text: 'text-xs' },
    md: { container: 'w-24 h-24', ring: 'w-20 h-20', dot: 'w-4 h-4', text: 'text-sm' },
    lg: { container: 'w-32 h-32', ring: 'w-28 h-28', dot: 'w-5 h-5', text: 'text-base' }
  }

  // Couleurs selon la qualité
  const colors = {
    excellent: {
      bg: 'bg-green-100 dark:bg-green-900/20',
      ring: 'border-green-500',
      dot: 'bg-green-500',
      text: 'text-green-700 dark:text-green-400',
      glow: 'shadow-green-500/50'
    },
    good: {
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      ring: 'border-blue-500',
      dot: 'bg-blue-500',
      text: 'text-blue-700 dark:text-blue-400',
      glow: 'shadow-blue-500/50'
    },
    poor: {
      bg: 'bg-orange-100 dark:bg-orange-900/20',
      ring: 'border-orange-500',
      dot: 'bg-orange-500',
      text: 'text-orange-700 dark:text-orange-400',
      glow: 'shadow-orange-500/50'
    },
    offline: {
      bg: 'bg-red-100 dark:bg-red-900/20',
      ring: 'border-red-500',
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-400',
      glow: 'shadow-red-500/50'
    }
  }

  const labels = {
    excellent: 'Excellent',
    good: 'Bonne',
    poor: 'Faible',
    offline: 'Hors ligne'
  }

  // Mesurer la latence en temps réel
  useEffect(() => {
    const measureLatency = async () => {
      if (!navigator.onLine) {
        setQuality('offline')
        setLatency(null)
        return
      }

      try {
        const startTime = performance.now()

        // Ping vers Firestore (autorisé par CSP)
        await fetch('https://firestore.googleapis.com', {
          method: 'HEAD',
          cache: 'no-cache'
        }).catch(() => {
          // Si la requête HEAD échoue, essayer avec l'icône de votre propre domaine
          return fetch('/favicon.ico', {
            method: 'HEAD',
            cache: 'no-cache'
          })
        })

        const endTime = performance.now()
        const ping = Math.round(endTime - startTime)
        setLatency(ping)

        // Déterminer la qualité selon la latence
        if (ping < 100) setQuality('excellent')
        else if (ping < 300) setQuality('good')
        else setQuality('poor')
      } catch (error) {
        setQuality('offline')
        setLatency(null)
      }
    }

    // Mesurer au démarrage
    measureLatency()

    // Mesurer toutes les 10 secondes
    const interval = setInterval(measureLatency, 10000)

    // Écouter les changements online/offline
    const handleOnline = () => {
      setIsOnline(true)
      measureLatency()
    }
    const handleOffline = () => {
      setIsOnline(false)
      setQuality('offline')
      setLatency(null)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const currentSize = sizes[size]
  const currentColors = colors[quality]

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Carte circulaire */}
      <div className={`relative ${currentSize.container} flex items-center justify-center`}>
        {/* Background circulaire */}
        <div className={`absolute inset-0 rounded-full ${currentColors.bg} transition-colors duration-500`} />

        {/* Anneau animé */}
        <div
          className={`absolute ${currentSize.ring} rounded-full border-4 ${currentColors.ring} transition-all duration-500 ${
            quality !== 'offline' ? 'animate-ping opacity-20' : ''
          }`}
        />

        {/* Anneau principal */}
        <div
          className={`relative ${currentSize.ring} rounded-full border-4 ${currentColors.ring} transition-colors duration-500 flex items-center justify-center bg-white dark:bg-gray-800`}
        >
          {/* Point central */}
          <div
            className={`${currentSize.dot} rounded-full ${currentColors.dot} shadow-lg ${currentColors.glow} transition-all duration-500 ${
              quality !== 'offline' ? 'animate-pulse' : ''
            }`}
          />
        </div>

        {/* Badge de latence (optionnel) */}
        {latency !== null && quality !== 'offline' && (
          <div className={`absolute -bottom-1 -right-1 ${currentColors.bg} ${currentColors.text} px-2 py-0.5 rounded-full text-xs font-semibold border-2 border-white dark:border-gray-800 shadow-sm`}>
            {latency}ms
          </div>
        )}
      </div>

      {/* Label */}
      {showLabel && (
        <div className="text-center">
          <p className={`font-semibold ${currentColors.text} ${currentSize.text} transition-colors duration-500`}>
            {labels[quality]}
          </p>
          {latency !== null && quality !== 'offline' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {latency < 100 ? 'Connexion rapide' : latency < 300 ? 'Connexion stable' : 'Connexion lente'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
