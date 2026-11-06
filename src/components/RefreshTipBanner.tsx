import { useEffect, useState } from 'react'

/**
 * 🔄 Bandeau d'information (24/10/2026) : rappelle de recharger la page à fond (Ctrl+Shift+R / Ctrl+F5) pendant le
 * travail, pour toujours avoir la dernière version du site.
 * - S'affiche UNE fois, quelques secondes APRÈS le chargement complet de la page, puis à nouveau toutes les 3 heures
 *   (une seule fois par période de 3 h, PAR utilisateur et PAR page — heure mémorisée dans le navigateur).
 * - Ne dérange pas le travail : petit bandeau en haut au centre, aucun clic bloqué, disparaît seul au bout de 20 s (ou ✕).
 * - Texte en ARABE, de droite à gauche ; les raccourcis clavier restent en lettres latines (Ctrl+Shift+R, Ctrl+F5).
 */
const KEY = 'bg-refresh-tip-last'
const EVERY_MS = 3 * 60 * 60 * 1000
const SHOW_MS = 20_000

/** `scope` : utilisateur + page (ex. « uid:/agent ») — compté PAR utilisateur et PAR page (avant : pour tout le
 *  navigateur, une fois vu dans l'admin il ne s'affichait plus sur les autres pages pendant 3 h). */
export default function RefreshTipBanner({ scope = '', delayMs = 5000, showMs = SHOW_MS, waitFor }: Readonly<{
  scope?: string
  /** Délai avant l'affichage (défaut : 5 s après le chargement) et durée (défaut : 20 s). */
  delayMs?: number
  showMs?: number
  /** Attendre ce signal avant de compter le délai (ex. le message de remerciement, components/FloralTheme). */
  waitFor?: (cb: () => void) => () => void
}>) {
  const [open, setOpen] = useState(false)
  const key = scope ? `${KEY}:${scope}` : KEY
  const lastShown = () => { try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 } }
  const markShown = () => { try { localStorage.setItem(key, String(Date.now())) } catch { /* stockage indisponible */ } }

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const tryShow = () => {
      if (Date.now() - lastShown() < EVERY_MS) return
      markShown()
      setOpen(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setOpen(false), showMs)
    }
    // Après le chargement COMPLET de la page (+ 5 s pour laisser les données s'afficher)
    const start = () => { showTimer = setTimeout(tryShow, delayMs) }
    let stopWaiting = () => {}
    const begin = () => { if (waitFor) stopWaiting = waitFor(start); else start() }
    if (document.readyState === 'complete') begin()
    else window.addEventListener('load', begin, { once: true })
    // Puis vérification chaque minute : nouvel affichage quand 3 h sont passées
    const every = setInterval(tryShow, 60_000)
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearInterval(every); window.removeEventListener('load', begin); stopWaiting() }
  }, [key, delayMs, showMs, waitFor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const kbd = 'inline-block px-1 py-0 mx-0.5 rounded-md bg-white/20 border border-white/30 font-mono text-[11px] font-bold'
  return (
    // En HAUT de la page, au centre (demande du 24/10/2026)
    <div className="fixed top-24 inset-x-3 z-[60] flex justify-center pointer-events-none print:hidden">
      <div dir="rtl" lang="ar" role="status"
        className="pointer-events-auto max-w-xl w-full flex items-center gap-2 rounded-xl bg-indigo-700/95 text-white shadow-xl px-3 py-2 text-xs leading-relaxed">
        <span className="text-base shrink-0" aria-hidden>🔄</span>
        <p className="flex-1">
          <b>تنبيه:</b> للحصول دائمًا على آخر نسخة من الموقع، اضغط على
          {' '}<bdi dir="ltr" className={kbd}>Ctrl+Shift+R</bdi>{' '}أو{' '}<bdi dir="ltr" className={kbd}>Ctrl+F5</bdi>{' '}
          عدة مرات أثناء العمل.
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"
          className="shrink-0 w-6 h-6 rounded-full hover:bg-white/20 text-white/90 text-sm leading-none">✕</button>
      </div>
    </div>
  )
}
