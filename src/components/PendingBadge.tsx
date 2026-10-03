// ⏳ Petit indicateur flottant « Mise à jour… » affiché pendant qu'une liste/des totaux sont
// recalculés en arrière-plan après un clic de filtre (le bouton cliqué, lui, est déjà sélectionné).
// Position fixe : n'entraîne aucun décalage de la mise en page.
export default function PendingBadge({ show, label = 'Mise à jour…' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 border border-blue-200 text-blue-700 text-xs font-semibold shadow-lg pointer-events-none print:hidden"
    >
      <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}
