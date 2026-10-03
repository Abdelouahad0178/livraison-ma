import { useEffect, useState, startTransition } from 'react'
import { subscribeAgencyParcelsFull } from '../firebase/parcels'

/**
 * 📡 Toutes les expéditions (envoyées + reçues) d'une agence sur [dateFrom, dateTo], chargées
 * jusqu'à épuisement en temps réel, archivés inclus (voir subscribeAgencyParcelsFull).
 * Sans dateFrom : 45 derniers jours. L'état est remis à zéro à chaque changement de ville ou de
 * bornes, pour ne jamais afficher un mélange de l'ancien et du nouveau filtre.
 *
 * `loading` reste vrai tant que toutes les tranches ne sont pas confirmées par le serveur :
 * à afficher avec <LoadProgress loading={loading} count={loaded} />.
 */
export function useAgencyParcelsFull(
  city: string | undefined | null,
  dateFrom: Date | null,
  dateTo: Date | null,
  enabled = true,
) {
  const [parcels, setParcels] = useState<any[]>([])
  const [loaded, setLoaded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)

  const fromMs = dateFrom ? dateFrom.getTime() : 0
  const toMs = dateTo ? dateTo.getTime() : 0

  useEffect(() => {
    if (!enabled || !city) return
    // ⚡ Listes en TRANSITION : le recalcul (soldes, totaux) qu'elles déclenchent ne bloque pas
    // les clics sur les filtres (le bouton cliqué s'allume immédiatement). Mêmes données.
    startTransition(() => setParcels([]))
    setLoaded(0)
    setLoading(true)
    setInitialLoading(true)
    const unsub = subscribeAgencyParcelsFull(
      city,
      { dateFrom: fromMs ? new Date(fromMs) : null, dateTo: toMs ? new Date(toMs) : null },
      (data, meta) => {
        startTransition(() => setParcels(data))
        setLoaded(meta.loaded)
        setLoading(!meta.complete)
        setInitialLoading(false)
      },
      err => {
        console.error('useAgencyParcelsFull:', err)
        setLoading(false)
        setInitialLoading(false)
      },
    )
    return unsub
  }, [city, fromMs, toMs, enabled])

  return { parcels, loaded, loading, initialLoading }
}
