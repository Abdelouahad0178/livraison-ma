import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loaded: vi.fn(),
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doMock('@sentry/react', () => {
    mocks.loaded()
    return {
      init: mocks.init, setUser: mocks.setUser, captureException: mocks.captureException,
      browserTracingIntegration: vi.fn(), replayIntegration: vi.fn(),
    }
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@sentry/react')
})

describe('Deferred monitoring', () => {
  it('does not load Sentry without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    vi.stubEnv('DEV', false)
    const { initMonitoring, setUserContext, captureError } = await import('./monitoring')
    initMonitoring()
    setUserContext('user')
    captureError(new Error('Example'))
    await Promise.resolve()
    expect(mocks.loaded).not.toHaveBeenCalled()
  })

  it('initializes once before sending queued errors and user changes', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    vi.stubEnv('DEV', false)
    const { initMonitoring, setUserContext, captureError } = await import('./monitoring')
    const error = new Error('Example')
    initMonitoring()
    setUserContext('user', 'user@example.invalid')
    captureError(error, { action: 'test' })
    setUserContext('')
    await vi.waitFor(() => expect(mocks.captureException).toHaveBeenCalledOnce())
    expect(mocks.init).toHaveBeenCalledOnce()
    expect(mocks.setUser.mock.calls).toEqual([[{ id: 'user', email: 'user@example.invalid' }], [null]])
    expect(mocks.captureException).toHaveBeenCalledWith(error, { extra: { action: 'test' } })
    expect(mocks.init.mock.invocationCallOrder[0]).toBeLessThan(mocks.setUser.mock.invocationCallOrder[0])
  })

  it('keeps monitoring failures from rejecting into the application', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    mocks.init.mockImplementationOnce(() => { throw new Error('Initialization failed') })
    const { initMonitoring, setUserContext } = await import('./monitoring')
    initMonitoring()
    setUserContext('user')
    await vi.waitFor(() => expect(mocks.init).toHaveBeenCalledOnce())
    expect(mocks.setUser).not.toHaveBeenCalled()
  })
})
