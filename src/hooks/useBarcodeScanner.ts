import { useEffect, useCallback, useRef } from 'react'

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void
  minLength?: number
  maxDelay?: number
  enabled?: boolean
  azertyFix?: boolean // Correction AZERTY/QWERTY
}

/**
 * Hook pour détecter automatiquement les scans de code-barres (douchette)
 *
 * Les douchettes fonctionnent comme des claviers ultra-rapides :
 * - Tapent le code complet en < 100ms
 * - Envoient Enter à la fin
 *
 * Ce hook détecte cette séquence et appelle onScan()
 */
// Correction AZERTY <-> QWERTY
const azertyToQwerty: Record<string, string> = {
  'a': 'q', 'q': 'a',
  'z': 'w', 'w': 'z',
  'm': ',', ',': 'm',
  ';': 'm', '.': ';',
}

const normalizeAzerty = (text: string, enabled: boolean): string => {
  if (!enabled) return text
  return text.split('').map(c => azertyToQwerty[c.toLowerCase()] || c).join('')
}

export function useBarcodeScanner({
  onScan,
  minLength = 5,
  maxDelay = 100,
  enabled = true,
  azertyFix = true
}: BarcodeScannerOptions) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout>()
  const scanCountRef = useRef(0)

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!enabled) return

    // Ignorer si dans un input/textarea (sauf si c'est un scan rapide)
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

    const now = Date.now()
    const timeSinceLastKey = now - lastKeyTimeRef.current

    // Reset buffer si trop de délai entre les touches (saisie humaine)
    if (timeSinceLastKey > maxDelay && bufferRef.current.length > 0) {
      bufferRef.current = ''
    }

    lastKeyTimeRef.current = now

    // Enter = fin du scan
    if (e.key === 'Enter') {
      const rawBarcode = bufferRef.current.trim()

      if (rawBarcode.length >= minLength) {
        scanCountRef.current++
        const scanNum = scanCountRef.current

        // Essayer les deux versions
        const qwertyBarcode = rawBarcode
        const azertyBarcode = normalizeAzerty(rawBarcode, azertyFix)

        console.log(`🔍 Scan #${scanNum}:`, {
          raw: rawBarcode,
          qwerty: qwertyBarcode,
          azerty: azertyBarcode,
          length: rawBarcode.length,
          delay: now - lastKeyTimeRef.current
        })

        e.preventDefault()
        e.stopPropagation()

        // Essayer d'abord QWERTY, puis AZERTY si nécessaire
        onScan(qwertyBarcode)

        // Si différent et azertyFix activé, proposer aussi la version AZERTY
        if (azertyFix && azertyBarcode !== qwertyBarcode) {
          setTimeout(() => {
            console.log(`🔄 Essai AZERTY: ${azertyBarcode}`)
          }, 100)
        }
      }

      bufferRef.current = ''
      return
    }

    // Caractères alphanumériques + tirets
    if (/^[a-zA-Z0-9\-]$/.test(e.key)) {
      // Si scan rapide, même dans un input, on l'intercepte
      if (timeSinceLastKey < maxDelay) {
        if (isInput) {
          e.preventDefault()
        }
      }

      bufferRef.current += e.key

      // Log en temps réel pour debug
      if (bufferRef.current.length === 1) {
        console.log('🎯 Début scan:', e.key, 'time:', now)
      }
    } else if (e.key.length === 1 && e.key !== 'Enter') {
      // Capturer TOUS les caractères pour debug
      console.log('⚠️ Caractère ignoré:', e.key, 'code:', e.code, 'keyCode:', e.keyCode)
    }

    // Auto-reset après maxDelay * 2
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      bufferRef.current = ''
    }, maxDelay * 2)
  }, [enabled, maxDelay, minLength, onScan])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyPress, true)

    return () => {
      window.removeEventListener('keydown', handleKeyPress, true)
      clearTimeout(timeoutRef.current)
    }
  }, [enabled, handleKeyPress])
}
