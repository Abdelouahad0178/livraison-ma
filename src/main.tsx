import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// When a new deploy changes chunk hashes the stale service worker may try to
// load a chunk that no longer exists. Force a hard reload so the user gets the
// fresh version automatically instead of seeing a blank/crash screen.
globalThis.addEventListener('vite:preloadError', () => {
  globalThis.location.reload()
})

// Keep permission-denied diagnostics without forcing Firebase Auth into the
// public initial bundle. Auth is loaded only if this rare error occurs.
globalThis.addEventListener('unhandledrejection', event => {
  const err = event.reason
  if (err?.code !== 'permission-denied') return

  event.preventDefault()
  import('./firebase/auth.js')
    .then(({ auth }) => {
      const uid = auth.currentUser?.uid ?? '(non connecte)'
      const email = auth.currentUser?.email ?? '-'
      const msg = err.message ?? ''
      console.warn(
        `[Firestore permission-denied]\n` +
        `  uid  : ${uid}\n` +
        `  email: ${email}\n` +
        `  msg  : ${msg}`
      )
    })
    .catch(() => {
      console.warn('[Firestore permission-denied]', err.message ?? err)
    })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
