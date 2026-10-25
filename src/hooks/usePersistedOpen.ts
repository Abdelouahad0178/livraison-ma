import { useState } from 'react'

/**
 * 📂 Bloc pliable des pages de caisse (Collecte du soir, Caisse Agence) : TOUJOURS replié au démarrage
 * (demande de l'admin, 20/10/2026 — avant, l'état était mémorisé d'une visite à l'autre). La clé est gardée
 * pour compatibilité ; l'état ne vit que pendant l'affichage de la page.
 */
export function usePersistedOpen(_key: string, defaultOpen = false): [boolean, (v: boolean | ((o: boolean) => boolean)) => void] {
  return useState<boolean>(defaultOpen)
}
