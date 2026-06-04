import { useEffect, useCallback, useRef } from 'react'

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void
  minLength?: number
  maxDelay?: number
  enabled?: boolean
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
export function useBarcodeScanner({
  onScan,
  minLength = 5,
  maxDelay = 100,
  enabled = true
}: BarcodeScannerOptions) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout>()

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
      const barcode = bufferRef.current.trim()

      if (barcode.length >= minLength) {
        e.preventDefault()
        e.stopPropagation()
        onScan(barcode)
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
