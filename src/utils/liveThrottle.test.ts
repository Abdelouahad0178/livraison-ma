import { describe, it, expect, vi, afterEach } from 'vitest'
import { planLiveEmit, LIVE_THROTTLE_MS, LIVE_URGENT_MS } from './liveThrottle'

describe('planLiveEmit — chargement initial (comportement historique)', () => {
  it('urgent : 60 ms', () => {
    expect(planLiveEmit({ settled: false, timerPending: true, lastEmit: 0, now: 5000, urgent: true }))
      .toEqual({ action: 'schedule', delay: LIVE_URGENT_MS })
  })
  it('non urgent : au plus une toutes les 800 ms', () => {
    expect(planLiveEmit({ settled: false, timerPending: false, lastEmit: 1000, now: 1200 }))
      .toEqual({ action: 'schedule', delay: 600 })
    expect(planLiveEmit({ settled: false, timerPending: false, lastEmit: 1000, now: 3000 }))
      .toEqual({ action: 'schedule', delay: LIVE_URGENT_MS })
  })
})

describe('planLiveEmit — après le chargement initial', () => {
  it('garde la mise à jour déjà programmée', () => {
    expect(planLiveEmit({ settled: true, timerPending: true, lastEmit: 0, now: 10, urgent: true }))
      .toEqual({ action: 'keep' })
  })
  it('au plus une par seconde', () => {
    expect(planLiveEmit({ settled: true, timerPending: false, lastEmit: 1000, now: 1100, urgent: true }))
      .toEqual({ action: 'schedule', delay: 900 })
    expect(planLiveEmit({ settled: true, timerPending: false, lastEmit: 1000, now: 5000, urgent: true }))
      .toEqual({ action: 'schedule', delay: LIVE_URGENT_MS })
  })
})

describe('planLiveEmit — simulation avec minuteur', () => {
  afterEach(() => { vi.useRealTimers() })

  it('rafale d’événements : ≤ 1 mise à jour / s et le dernier état est livré', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let state = 0
    const delivered: { at: number; value: number }[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastEmit = 0
    let settled = false
    const emitNow = () => {
      timer = undefined
      lastEmit = Date.now()
      delivered.push({ at: lastEmit, value: state })
      settled = true
    }
    const emit = (urgent = false) => {
      const plan = planLiveEmit({ settled, timerPending: !!timer, lastEmit, now: Date.now(), urgent })
      if (plan.action === 'keep') return
      clearTimeout(timer)
      timer = setTimeout(emitNow, plan.delay)
    }

    // Premier chargement : immédiat (60 ms)
    state = 1; emit(true)
    vi.advanceTimersByTime(LIVE_URGENT_MS)
    expect(delivered).toEqual([{ at: 60, value: 1 }])

    // Rafale : un événement toutes les 50 ms pendant 3 s
    for (let t = 0; t < 3000; t += 50) {
      state += 1
      emit(true)
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(2000)

    // Intervalle minimal d'une seconde entre deux mises à jour après la première
    for (let i = 1; i < delivered.length; i++) {
      expect(delivered[i].at - delivered[i - 1].at).toBeGreaterThanOrEqual(LIVE_THROTTLE_MS)
    }
    // Pas de famine : plusieurs mises à jour pendant la rafale
    expect(delivered.length).toBeGreaterThanOrEqual(3)
    // Appel final garanti : le dernier état est livré
    expect(delivered[delivered.length - 1].value).toBe(state)
  })
})
