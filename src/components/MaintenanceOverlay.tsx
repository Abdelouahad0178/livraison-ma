import { lazy, Suspense, useEffect, useState } from 'react'

const LiveCodingPanel = lazy(() => import('./LiveCodingPanel'))
const loadMaintenanceStore = () => Promise.all([import('firebase/firestore'), import('../firebase/db')])

/**
 * 🚧 Grand message rouge « plateforme occupée par l'équipe de programmation ».
 * Piloté par settings/maintenance { active, message } (lecture publique, écriture admin seul).
 * - Avant connexion : affiché 5 secondes au démarrage, puis disparaît (l'admin peut se connecter).
 * - Connecté (hors admin) : plein écran, bloquant, tant que le message est actif.
 * - Admin connecté : jamais bloqué — simple bandeau rouge avec « Désactiver pour tout le monde ».
 */
const DEFAULT_MESSAGE = "LA PLATEFORME EST OCCUPÉE PAR L'ÉQUIPE DE PROGRAMMATION. NE TOUCHEZ À RIEN."
const PRE_LOGIN_SECONDS = 5

export default function MaintenanceOverlay({ role, userName }: Readonly<{ role?: string | null; userName?: string }>) {
  const [state, setState] = useState<{ active: boolean; message: string }>({ active: false, message: DEFAULT_MESSAGE })
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(PRE_LOGIN_SECONDS)
  const [codeOpen, setCodeOpen] = useState(true)
  const loggedIn = !!role
  const isAdmin = role === 'admin'

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    // Subscribe immediately after render without placing Firestore in the initial public bundle.
    loadMaintenanceStore().then(([{ doc, onSnapshot }, { db }]) => {
      if (cancelled) return
      unsubscribe = onSnapshot(doc(db, 'settings', 'maintenance'), snap => {
        const d = snap.data() || {}
        setState({ active: d.active === true, message: String(d.message || DEFAULT_MESSAGE) })
      }, () => { /* lecture impossible : aucun message */ })
    }).catch(() => { /* lecture impossible : aucun message */ })
    return () => { cancelled = true; unsubscribe?.() }
  }, [])

  // ⏱️ Avant connexion : compte à rebours de 5 s, puis le message disparaît
  useEffect(() => {
    if (loggedIn || !state.active || left <= 0) return
    const t = setTimeout(() => setLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [loggedIn, state.active, left])

  if (!state.active) return null

  const deactivate = async () => {
    setBusy(true)
    try {
      const [{ doc, setDoc }, { db }] = await loadMaintenanceStore()
      await setDoc(doc(db, 'settings', 'maintenance'),
        { active: false, updatedAt: new Date().toISOString(), updatedBy: userName || 'Admin' }, { merge: true })
    } catch (e: any) {
      alert('Désactivation impossible : ' + (e?.message || e))
    } finally { setBusy(false) }
  }

  // 👑 Admin connecté : bandeau seulement (il travaille normalement)
  if (isAdmin) {
    return (
      <>
        <div className="fixed top-0 inset-x-0 z-[10000] bg-red-700 text-white text-xs sm:text-sm font-bold px-3 py-2 flex items-center justify-center gap-3 shadow-lg">
          <span>⛔ Message « plateforme occupée » ACTIF : les autres utilisateurs sont bloqués.</span>
          <button type="button" onClick={deactivate} disabled={busy}
            className="px-3 py-1 rounded-lg bg-white text-red-700 font-black hover:bg-red-50 disabled:opacity-60">
            {busy ? '…' : 'Désactiver pour tout le monde'}
          </button>
        </div>
        {/* ⌨️ Code en direct, discret : petit, transparent, les clics le traversent (la page reste utilisable) */}
        <div className="fixed bottom-3 right-3 z-[9990] flex flex-col items-end gap-1">
          <button type="button" onClick={() => setCodeOpen(o => !o)}
            className="px-2 py-0.5 rounded-md bg-black/70 text-emerald-300 text-[10px] font-mono hover:bg-black/90">
            {codeOpen ? '▾ réduire' : '▸ code en direct'}
          </button>
          {codeOpen && <Suspense fallback={null}><LiveCodingPanel compact className="w-72 opacity-80 pointer-events-none" /></Suspense>}
        </div>
      </>
    )
  }

  // Avant connexion : seulement les 5 premières secondes
  if (!loggedIn && left <= 0) return null

  return (
    <div role="alertdialog" aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-red-700/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-6xl w-full flex flex-col lg:flex-row items-center gap-8">
      <div className="flex-1 text-center text-white">
        <div className="text-7xl sm:text-8xl mb-6 animate-pulse">⛔</div>
        <h1 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight uppercase drop-shadow-lg">
          {state.message}
        </h1>
        <p className="mt-6 text-lg sm:text-xl font-semibold text-red-100">
          Merci de patienter : le site sera de nouveau disponible dès la fin des travaux.
        </p>
        {!loggedIn && (
          <p className="mt-8 text-sm font-bold text-white/80 tabular-nums">Ce message se ferme dans {left} s…</p>
        )}
      </div>
      {/* ⌨️ Code qui s'écrit en temps réel, à côté du message */}
      <Suspense fallback={null}><LiveCodingPanel className="w-full lg:w-[460px] shrink-0" /></Suspense>
      </div>
    </div>
  )
}
