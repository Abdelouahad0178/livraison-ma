import { useEffect, useMemo, useRef } from 'react'
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * ⚡ Rend « temps réel » des colis chargés en lecture PONCTUELLE (pages « Charger plus »,
 * résultats de recherche serveur…) : écoute onSnapshot par paquets de 30 identifiants
 * (documentId() in [...], limite Firestore), uniquement sur les colis indiqués — jamais sur
 * toute la collection.
 *
 * - Les paquets sont STABLES : un paquet n'est recréé que si l'un de ses colis n'est plus
 *   demandé ; les nouveaux identifiants vont dans de nouveaux paquets (pas de réabonnement global
 *   quand on charge une page de plus).
 * - onPatch(updates) reçoit une Map id → données fraîches, ou null si le colis a été SUPPRIMÉ
 *   (vu puis disparu : un identifiant jamais vu — ex. colis de parcels_archive — n'est jamais
 *   signalé comme supprimé). Mises à jour regroupées toutes les ~300 ms.
 * - Coût : 1 lecture par colis à l'abonnement, puis 1 lecture par modification réelle.
 *
 * @param ids identifiants à suivre (ordre = priorité ; tronqué à maxIds)
 */
const CHUNK = 30

export function useLiveParcelPatches(
  ids: string[],
  onPatch: (updates: Map<string, any | null>) => void,
  options: { enabled?: boolean; maxIds?: number } = {}
) {
  const { enabled = true, maxIds = 3000 } = options
  const onPatchRef = useRef(onPatch)
  onPatchRef.current = onPatch
  const chunksRef = useRef<Map<string, { ids: string[]; unsub: () => void }>>(new Map())
  const pendingRef = useRef<Map<string, any | null>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clé stable du jeu d'identifiants (le contenu, pas l'identité du tableau)
  const wanted = useMemo(() => (enabled ? ids.slice(0, maxIds) : []), [ids, enabled, maxIds])
  const key = useMemo(() => wanted.join('|'), [wanted])

  useEffect(() => {
    const wantedSet = new Set(wanted)
    const chunks = chunksRef.current
    const covered = new Set<string>()

    // 1. Garder les paquets dont TOUS les colis sont encore demandés, couper les autres
    for (const [k, c] of chunks) {
      if (c.ids.every((id) => wantedSet.has(id))) c.ids.forEach((id) => covered.add(id))
      else { c.unsub(); chunks.delete(k) }
    }

    // 2. Nouveaux paquets pour les identifiants non couverts
    const missing = wanted.filter((id) => !covered.has(id))
    const flush = () => {
      timerRef.current = null
      if (pendingRef.current.size === 0) return
      const updates = pendingRef.current
      pendingRef.current = new Map()
      onPatchRef.current(updates)
    }
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunkIds = missing.slice(i, i + CHUNK)
      const chunkKey = chunkIds.join('|')
      const seen = new Set<string>()
      const unsub = onSnapshot(
        query(collection(db, 'parcels'), where(documentId(), 'in', chunkIds)),
        (snap) => {
          for (const ch of snap.docChanges()) {
            const id = ch.doc.id
            if (ch.type === 'removed') {
              if (seen.has(id)) pendingRef.current.set(id, null)
            } else {
              seen.add(id)
              pendingRef.current.set(id, { id, ...ch.doc.data() })
            }
          }
          if (pendingRef.current.size > 0 && !timerRef.current) timerRef.current = setTimeout(flush, 300)
        },
        (err) => console.error('useLiveParcelPatches:', err)
      )
      chunks.set(chunkKey, { ids: chunkIds, unsub })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Démontage : couper toutes les écoutes
  useEffect(() => () => {
    chunksRef.current.forEach((c) => c.unsub())
    chunksRef.current.clear()
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
}
