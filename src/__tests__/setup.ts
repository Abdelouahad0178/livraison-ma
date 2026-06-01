import '@testing-library/jest-dom'
import { beforeAll, vi } from 'vitest'

// Supprimer les erreurs console pendant les tests (notamment ErrorBoundary)
beforeAll(() => {
  const originalError = console.error
  const originalWarn = console.warn

  vi.spyOn(console, 'error').mockImplementation((...args) => {
    // Ignorer les erreurs React attendues dans les tests
    const message = args[0]?.toString() || ''
    if (
      message.includes('Error: Test error') ||
      message.includes('The above error occurred') ||
      message.includes('React will try to recreate')
    ) {
      return
    }
    originalError.apply(console, args)
  })

  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    const message = args[0]?.toString() || ''
    // Filtrer les warnings non pertinents
    if (message.includes('deprecated') || message.includes('React does not recognize')) {
      return
    }
    originalWarn.apply(console, args)
  })
})
