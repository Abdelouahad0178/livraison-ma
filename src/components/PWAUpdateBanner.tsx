import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

let _registration: ServiceWorkerRegistration | undefined

export default function PWAUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, reg) {
      _registration = reg
    },
  })

  const handleUpdate = async () => {
    try { await updateServiceWorker(true) } catch { }

    const waiting = _registration?.waiting
    if (waiting) {
      waiting.addEventListener('statechange', () => {
        if (waiting.state === 'activated') window.location.reload()
      })
      waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    setTimeout(() => window.location.reload(), 800)
  }

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-9999 w-full max-w-sm px-4">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-white/10">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <RefreshCw className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Mise à jour disponible</p>
          <p className="text-xs text-gray-400 mt-0.5">Nouvelle version de BG Express</p>
        </div>
        <button
          onClick={handleUpdate}
          className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
        >
          Mettre à jour
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
