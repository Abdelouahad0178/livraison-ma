import * as Sentry from '@sentry/react'

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return // skip in dev without DSN

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
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.error('[captureError]', err, context)
  } else {
    Sentry.captureException(err, context ? { extra: context } : undefined)
  }
}

export function setUserContext(uid: string, email?: string) {
  Sentry.setUser(uid ? { id: uid, email } : null)
}
