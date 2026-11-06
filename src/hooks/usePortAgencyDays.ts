import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { PORT_ALL_CITY } from '../utils/portAgencyContribution'
import type { AgencyPortStat } from '../utils/agencyFollowUp'

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/**
 * 📮 Totaux de « Port par agence » TENUS PAR LE SERVEUR (01/11/2026) : documents portAgencyDays des journées
 * [fromDay, toDay] (Cloud Function syncPortAgencyStats, même règle que computeAgencyPortStats), en temps réel.
 * Quelques dizaines de petits documents au lieu de milliers d'expéditions (téléphone : ~25 s → ~1 s sur 7 jours).
 * Renvoie les lignes par agence (vue théorique ou situation caisse, direction « Toutes ») et le nombre d'expéditions
 * DISTINCTES de toutes les agences ; null tant que la période n'est pas chargée.
 */
export function usePortAgencyDays(fromDay: string, toDay: string, cities: readonly string[], viewMode: 'theoretical' | 'physical', enabled: boolean) {
  const key = `${fromDay}|${toDay}`
  const [state, setState] = useState<{ key: string; docs: any[] | null; error?: string } | null>(null)
  useEffect(() => {
    if (!enabled || !fromDay || !toDay) return
    return onSnapshot(query(collection(db, 'portAgencyDays'), where('day', '>=', fromDay), where('day', '<=', toDay)),
      s => setState({ key, docs: s.docs.map(d => d.data()) }),
      err => { console.error('Port par agence — totaux du serveur', err); setState({ key, docs: null, error: err?.message || String(err) }) })
  }, [key, enabled])
  return useMemo(() => {
    if (!enabled || !state || state.key !== key) return { ready: false as const, error: null, stats: null, nUnion: 0 }
    if (!state.docs) return { ready: false as const, error: state.error || 'lecture impossible', stats: null, nUnion: 0 }
    const pre = viewMode === 'physical' ? 'ph_' : 'th_'
    const rows = new Map<string, AgencyPortStat>(cities.map(city => [city,
      { city, portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0, totalPort: 0, nbExpeditions: 0, nbUnique: 0 }]))
    let nUnion = 0
    for (const d of state.docs) {
      if (d.city === PORT_ALL_CITY) { nUnion += Number(d.nUnion) || 0; continue }
      const row = rows.get(d.city)
      if (!row) continue
      row.portPaye += Number(d[`${pre}portPaye`]) || 0
      row.portDu += Number(d[`${pre}portDu`]) || 0
      row.portDuCheque += Number(d[`${pre}portDuCheque`]) || 0
      if (viewMode === 'theoretical') {
        row.enCompteExp += Number(d.th_enCompteExp) || 0
        row.enCompteDest += Number(d.th_enCompteDest) || 0
      }
      row.nbExpeditions += Number(d.nbExp) || 0
      row.nbUnique += Number(d.nbUnique) || 0
    }
    const stats = [...rows.values()].map(s => ({
      ...s,
      portPaye: r2(s.portPaye), portDu: r2(s.portDu), portDuCheque: r2(s.portDuCheque),
      enCompteExp: r2(s.enCompteExp), enCompteDest: r2(s.enCompteDest),
      totalPort: r2(s.portPaye + s.portDu + s.portDuCheque + s.enCompteExp + s.enCompteDest),
    }))
    return { ready: true as const, error: null, stats, nUnion }
  }, [enabled, state, key, viewMode, cities])
}
