import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * 💰 Totaux de « COD par agence » TENUS PAR LE SERVEUR (01/11/2026) : documents codAgencyDays des journées [fromDay, toDay]
 * (Cloud Function syncCodAgencyStats, même règle que computeAgencyCodStats), en temps réel. Même principe que
 * usePortAgencyDays (Port par agence). Les lignes de l'onglet se calculent ensuite avec codAgencyFromDays (toutes vues,
 * directions, villes d'origine) ; null tant que la période n'est pas chargée.
 */
export function useCodAgencyDays(fromDay: string, toDay: string, enabled: boolean) {
  const key = `${fromDay}|${toDay}`
  const [state, setState] = useState<{ key: string; docs: any[] | null; error?: string } | null>(null)
  useEffect(() => {
    if (!enabled || !fromDay || !toDay) return
    return onSnapshot(query(collection(db, 'codAgencyDays'), where('day', '>=', fromDay), where('day', '<=', toDay)),
      s => setState({ key, docs: s.docs.map(d => d.data()) }),
      err => { console.error('COD par agence — totaux du serveur', err); setState({ key, docs: null, error: err?.message || String(err) }) })
  }, [key, enabled])
  return useMemo(() => {
    if (!enabled || !state || state.key !== key) return { ready: false as const, error: null as string | null, docs: null as any[] | null }
    if (!state.docs) return { ready: false as const, error: state.error || 'lecture impossible', docs: null }
    return { ready: true as const, error: null, docs: state.docs }
  }, [enabled, state, key])
}
