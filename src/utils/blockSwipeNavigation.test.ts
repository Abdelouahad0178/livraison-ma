// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { blockSwipeNavigation } from './blockSwipeNavigation'

describe('blockSwipeNavigation', () => {
  blockSwipeNavigation()

  it('boutons précédent / suivant de la souris annulés', () => {
    for (const button of [3, 4]) {
      const e = new MouseEvent('mouseup', { button, cancelable: true, bubbles: true })
      window.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
    }
    const left = new MouseEvent('mouseup', { button: 0, cancelable: true, bubbles: true })
    window.dispatchEvent(left)
    expect(left.defaultPrevented).toBe(false)
  })

  it('garde-fou : au 1er clic, entrée « base » + entrée « garde » (même adresse)', () => {
    const before = history.length
    const url = location.href
    window.dispatchEvent(new Event('pointerdown'))
    expect(history.length).toBe(before + 1)
    expect(history.state?.bgGuard).toBe(true)
    expect(location.href).toBe(url)
    window.dispatchEvent(new Event('pointerdown')) // une seule fois
    expect(history.length).toBe(before + 1)
  })
})
