/**
 * 🌸 Thème « fleurs » de la page Chef d'agence pour certains comptes (demande de l'admin, 20/10/2026) :
 * quatre petites fleurs placées DANS l'en-tête (AgentHeader, ChefExploitationPage), entre les éléments existants — elles ne
 * recouvrent rien — et un en-tête rose (index.css, .floral-page).
 * 06/11/2026 : aussi MANAL ABID et HAJAR BASRI (agence de Casablanca), avec un message de remerciement de la direction.
 */
import { useEffect, useState } from 'react'

export const FLORAL_EMAILS = ['noura@gmail.com', 'noura2@gmail.com', 'zinebechef@gmail.com', 'manal@gmail.com', 'hajar@gmail.com']
export const isFloralUser = (email?: string | null) => !!email && FLORAL_EMAILS.includes(email.trim().toLowerCase())

/** Une petite fleur décorative (ne prend que sa place, aucun clic intercepté). */
export function Flower({ e, className = '' }: Readonly<{ e: string; className?: string }>) {
  return <span aria-hidden className={`pointer-events-none select-none text-lg leading-none shrink-0 ${className}`}>{e}</span>
}

// 💐 Message de remerciement de la direction (06/11/2026) : MANAL ABID et HAJAR BASRI seulement.
export const THANKS_POPUP_EMAILS = ['manal@gmail.com', 'hajar@gmail.com']
export const isThanksPopupUser = (email?: string | null) => !!email && THANKS_POPUP_EMAILS.includes(email.trim().toLowerCase())
export const THANKS_POPUP_MS = 4000
export const THANKS_TEXT = 'شكراً على مجهوداتكم، واصلوا !'
export const THANKS_SIGNATURE = 'رسالة من إدارة BG EXPRESS'

// ⏱️ Enchaînement chez ces deux comptes (06/11/2026) : le remerciement d'abord, puis le rappel Ctrl+Shift+R
// (components/RefreshTipBanner) 10 secondes après le début du remerciement, pendant 3 secondes.
export const THANKS_NEXT_TIP_DELAY_MS = 10_000
export const THANKS_NEXT_TIP_SHOW_MS = 3_000

// Une seule fois par ouverture de la page (pas à chaque changement d'écran interne) ; revient au prochain démarrage.
const THANKS_EVENT = 'bg-thanks-popup-shown'
let thanksShown = false
/** Pour les tests : remet à zéro le « déjà affiché ». */
export const resetThanksPopup = () => { thanksShown = false }
/** Appelle `cb` dès que le remerciement s'est affiché (tout de suite s'il l'est déjà). Renvoie de quoi annuler l'attente. */
export function whenThanksShown(cb: () => void): () => void {
  if (thanksShown) { cb(); return () => {} }
  window.addEventListener(THANKS_EVENT, cb, { once: true })
  return () => window.removeEventListener(THANKS_EVENT, cb)
}

/**
 * Popup en arabe, 4 secondes au démarrage, couleurs clignotantes (index.css, .thanks-popup) — disparaît tout seul.
 * pointer-events-none : ne bloque ni les clics ni la saisie pendant ces 4 secondes.
 */
export function DirectionThanksPopup({ email }: Readonly<{ email?: string | null }>) {
  const eligible = isThanksPopupUser(email)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!eligible || thanksShown) return
    thanksShown = true
    setShow(true)
    window.dispatchEvent(new Event(THANKS_EVENT))
    const t = setTimeout(() => setShow(false), THANKS_POPUP_MS)
    return () => clearTimeout(t)
  }, [eligible])

  if (!show) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none" role="status" aria-live="polite">
      <div dir="rtl" lang="ar" className="thanks-popup w-full max-w-md rounded-2xl border-4 border-white px-6 py-7 text-center text-white shadow-2xl">
        <div className="text-3xl leading-none mb-3" aria-hidden>🌸 🌷 🌺 🌼</div>
        <div className="text-2xl sm:text-3xl font-black leading-snug">{THANKS_TEXT}</div>
        <div className="mt-3 text-base sm:text-lg font-bold">{THANKS_SIGNATURE}</div>
      </div>
    </div>
  )
}
