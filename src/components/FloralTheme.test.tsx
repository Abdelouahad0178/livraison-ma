// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { DirectionThanksPopup, isFloralUser, isThanksPopupUser, resetThanksPopup, THANKS_NEXT_TIP_DELAY_MS, THANKS_NEXT_TIP_SHOW_MS, THANKS_POPUP_MS, THANKS_SIGNATURE, THANKS_TEXT, whenThanksShown } from './FloralTheme'
import RefreshTipBanner from './RefreshTipBanner'

describe('Thème fleurs et remerciement de la direction (06/11/2026)', () => {
  beforeEach(() => { resetThanksPopup(); vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('fleurs : Noura et Zineb comme avant, plus Manal et Hajar ; pas les autres', () => {
    for (const e of ['noura@gmail.com', 'noura2@gmail.com', 'zinebechef@gmail.com', 'manal@gmail.com', ' HAJAR@gmail.com ']) expect(isFloralUser(e)).toBe(true)
    for (const e of ['zahra@gmail.com', '', null, undefined]) expect(isFloralUser(e)).toBe(false)
  })
  it('popup : seulement Manal et Hajar', () => {
    expect(isThanksPopupUser('manal@gmail.com')).toBe(true)
    expect(isThanksPopupUser('Hajar@gmail.com')).toBe(true)
    for (const e of ['noura@gmail.com', 'zinebechef@gmail.com', 'zahra@gmail.com', null]) expect(isThanksPopupUser(e)).toBe(false)
  })
  it('affiché au démarrage, en arabe, puis disparu après 4 secondes', () => {
    render(<DirectionThanksPopup email="manal@gmail.com" />)
    expect(screen.getByText(THANKS_TEXT)).toBeTruthy()
    expect(screen.getByText(THANKS_SIGNATURE)).toBeTruthy()
    expect(THANKS_POPUP_MS).toBe(4000)
    act(() => { vi.advanceTimersByTime(3999) })
    expect(screen.queryByText(THANKS_TEXT)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByText(THANKS_TEXT)).toBeNull()
  })
  it('ne bloque pas les clics, et le texte est écrit de droite à gauche', () => {
    const { container } = render(<DirectionThanksPopup email="hajar@gmail.com" />)
    expect((container.firstChild as HTMLElement).className).toContain('pointer-events-none')
    expect(container.querySelector('[dir="rtl"][lang="ar"]')).toBeTruthy()
  })
  it('jamais pour un autre compte', () => {
    render(<DirectionThanksPopup email="noura@gmail.com" />)
    expect(screen.queryByText(THANKS_TEXT)).toBeNull()
  })
  it('une seule fois par ouverture de la page, même si l\'écran est réaffiché', () => {
    const a = render(<DirectionThanksPopup email="manal@gmail.com" />)
    a.unmount()
    render(<DirectionThanksPopup email="manal@gmail.com" />)
    expect(screen.queryByText(THANKS_TEXT)).toBeNull()
  })

  describe('enchaînement : remerciement d\'abord, rappel 10 s après, pendant 3 s', () => {
    const TIP = /Ctrl\+Shift\+R/
    beforeEach(() => { localStorage.clear() })
    const banner = () => <RefreshTipBanner scope="u:/agent" delayMs={THANKS_NEXT_TIP_DELAY_MS} showMs={THANKS_NEXT_TIP_SHOW_MS} waitFor={whenThanksShown} />

    it('ordre et durées', () => {
      render(<>{banner()}<DirectionThanksPopup email="manal@gmail.com" /></>)
      expect(screen.queryByText(THANKS_TEXT)).toBeTruthy()
      expect(screen.queryByText(TIP)).toBeNull()
      act(() => { vi.advanceTimersByTime(4000) }) // 4 s : remerciement parti, rappel pas encore là
      expect(screen.queryByText(THANKS_TEXT)).toBeNull()
      expect(screen.queryByText(TIP)).toBeNull()
      act(() => { vi.advanceTimersByTime(5999) }) // 9,999 s : toujours rien
      expect(screen.queryByText(TIP)).toBeNull()
      act(() => { vi.advanceTimersByTime(1) }) // 10 s : le rappel s'affiche
      expect(screen.queryByText(TIP)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(2999) })
      expect(screen.queryByText(TIP)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1) }) // 13 s : il disparaît
      expect(screen.queryByText(TIP)).toBeNull()
    })
    it('page lente : le rappel attend que le remerciement soit apparu', () => {
      const { rerender } = render(<>{banner()}<DirectionThanksPopup email={null} /></>)
      act(() => { vi.advanceTimersByTime(15000) }) // profil pas encore chargé : ni l'un ni l'autre
      expect(screen.queryByText(TIP)).toBeNull()
      rerender(<>{banner()}<DirectionThanksPopup email="hajar@gmail.com" /></>)
      expect(screen.queryByText(THANKS_TEXT)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(9999) })
      expect(screen.queryByText(TIP)).toBeNull()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.queryByText(TIP)).toBeTruthy()
    })
    it('les autres comptes gardent le rappel habituel : 5 s après le chargement, pendant 20 s', () => {
      render(<RefreshTipBanner scope="v:/agent" />)
      act(() => { vi.advanceTimersByTime(4999) })
      expect(screen.queryByText(TIP)).toBeNull()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.queryByText(TIP)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(19999) })
      expect(screen.queryByText(TIP)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.queryByText(TIP)).toBeNull()
    })
  })
})
