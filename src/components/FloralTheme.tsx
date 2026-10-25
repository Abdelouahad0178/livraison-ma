/**
 * 🌸 Thème « fleurs » de la page Chef d'agence pour certains comptes (demande de l'admin, 20/10/2026) :
 * quatre petites fleurs placées DANS l'en-tête (AgentHeader, ChefExploitationPage), entre les éléments existants — elles ne
 * recouvrent rien — et un en-tête rose (index.css, .floral-page).
 */
export const FLORAL_EMAILS = ['noura@gmail.com', 'noura2@gmail.com', 'zinebechef@gmail.com']
export const isFloralUser = (email?: string | null) => !!email && FLORAL_EMAILS.includes(email.trim().toLowerCase())

/** Une petite fleur décorative (ne prend que sa place, aucun clic intercepté). */
export function Flower({ e, className = '' }: Readonly<{ e: string; className?: string }>) {
  return <span aria-hidden className={`pointer-events-none select-none text-lg leading-none shrink-0 ${className}`}>{e}</span>
}
