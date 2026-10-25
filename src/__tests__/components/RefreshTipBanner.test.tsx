// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import RefreshTipBanner from '../../components/RefreshTipBanner'

describe('RefreshTipBanner', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('s’affiche une fois après le chargement, se cache seul, revient après 3 h', () => {
    render(<RefreshTipBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { vi.advanceTimersByTime(5000) })
    const b = screen.getByRole('status')
    expect(b.getAttribute('dir')).toBe('rtl')
    expect(b.textContent).toContain('Ctrl+Shift+R')
    expect(b.textContent).toContain('Ctrl+F5')
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(screen.queryByRole('status')).toBeNull() // caché seul après 20 s
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })
    expect(screen.queryByRole('status')).toBeNull() // pas avant 3 h
    // Affiché à 5 s → 3 h plus tard, la vérification de la minute suivante (3 h 01 min) le réaffiche (puis 20 s visible)
    act(() => { vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 40 * 1000) }) // → 3 h 01 min 05 s
    expect(screen.getByRole('status')).toBeTruthy() // de nouveau après 3 h
  })

  it('ne se réaffiche pas au rechargement si déjà vu il y a moins de 3 h', () => {
    localStorage.setItem('bg-refresh-tip-last', String(Date.now() - 60 * 60 * 1000))
    render(<RefreshTipBanner />)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
