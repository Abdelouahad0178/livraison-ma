import { useEffect, type RefObject } from 'react'

export function useParcelEntryFocus(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const cancel = () => { timers.forEach(clearTimeout); timers.clear() }
    const schedule = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); fn() }, ms)
      timers.add(timer)
    }
    const focus = () => {
      cancel()
      const show = () => {
        const el = input.current
        if (!el?.isConnected) return
        const active = document.activeElement as HTMLElement | null
        if (active && active !== el && active !== document.body && active.closest('form') && active.tagName !== 'BUTTON') return
        el.style.scrollMarginTop = '140px'
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
        el.focus({ preventScroll: true })
      }
      ;[60, 250, 600, 1100, 1600].forEach(ms => schedule(show, ms))
      schedule(() => input.current?.select(), 70)
    }
    focus()
    window.addEventListener('focus-nexp', focus)
    // User interaction takes priority over delayed autofocus, including navigation in the header.
    window.addEventListener('pointerdown', cancel, true)
    window.addEventListener('keydown', cancel, true)
    return () => {
      cancel()
      window.removeEventListener('focus-nexp', focus)
      window.removeEventListener('pointerdown', cancel, true)
      window.removeEventListener('keydown', cancel, true)
    }
  }, [input])
}
