import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase/db'

/**
 * 🚧 Bouton admin (barre du haut) : active / désactive le grand message « plateforme occupée par l'équipe de
 * programmation » (settings/maintenance, affiché par MaintenanceOverlay sur toutes les pages).
 */
export default function MaintenanceToggleButton({ userName }: Readonly<{ userName?: string }>) {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'settings', 'maintenance'),
    snap => setActive(snap.data()?.active === true), () => { /* lecture impossible */ }), [])

  const toggle = async () => {
    const next = !active
    const msg = next
      ? "Activer le message « PLATEFORME OCCUPÉE PAR L'ÉQUIPE DE PROGRAMMATION » ?\n\nTous les utilisateurs (sauf l'admin) seront bloqués sur un grand écran rouge tant qu'il est actif. Avant connexion, il s'affiche 5 secondes."
      : 'Désactiver le message « plateforme occupée » ? Tout le monde pourra de nouveau travailler.'
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'settings', 'maintenance'),
        { active: next, updatedAt: new Date().toISOString(), updatedBy: userName || 'Admin' }, { merge: true })
    } catch (e: any) {
      alert('Changement impossible : ' + (e?.message || e))
    } finally { setBusy(false) }
  }

  return (
    <button type="button" onClick={toggle} disabled={busy}
      title={active ? 'Message « plateforme occupée » ACTIF — cliquer pour le désactiver' : 'Afficher le message « plateforme occupée » à tous les utilisateurs'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-60 ${active
        ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'}`}>
      🚧 <span className="hidden sm:inline">{active ? 'Plateforme occupée : ON' : 'Plateforme occupée'}</span>
    </button>
  )
}
