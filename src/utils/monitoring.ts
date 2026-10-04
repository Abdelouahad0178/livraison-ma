type SentryModule = typeof import('@sentry/react')
let monitoringPromise: Promise<SentryModule | null> | undefined

function loadMonitoring(): Promise<SentryModule | null> {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return Promise.resolve(null)

  if (!monitoringPromise) {
    monitoringPromise = import('@sentry/react').then(Sentry => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_APP_VERSION || '1.0.0',
        tracesSampleRate: 0.2,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
        ],
        replaysSessionSampleRate: 0.05,
        replaysOnErrorSampleRate: 1.0,
      })
      return Sentry
    }).catch(error => {
      monitoringPromise = undefined
      console.warn('Monitoring unavailable:', error)
      return null
    })
  }
  return monitoringPromise
}

export function initMonitoring() {
  void loadMonitoring()
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.error('[captureError]', err, context)
  } else {
    void loadMonitoring().then(Sentry => {
      Sentry?.captureException(err, context ? { extra: context } : undefined)
    })
  }
}

export function setUserContext(uid: string, email?: string) {
  void loadMonitoring().then(Sentry => {
    Sentry?.setUser(uid ? { id: uid, email } : null)
  })
}
