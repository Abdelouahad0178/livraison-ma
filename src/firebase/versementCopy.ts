// 💼 Copie allégée des versements (versementDays / versementContrib, tenue par la Cloud Function syncVersementStats) —
// lecture côté pages. Caisse Agence › Versements (30/10/2026) : soldes et journées sans le gros chargement « Collectes
// par jour » ; le détail d'une journée (et le versement) ne lit que les expéditions DE cette journée.
import { useEffect, useState } from 'react'
import { collection, documentId, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './db'

export interface VersementDay {
  day: string
  aVerser: number; nonRecu: number; verse: number
  n_aVerser: number; n_nonRecu: number; n_verse: number
  nonRecu_portPaye?: number
}
export interface VersementDayDetail {
  day: string
  /** Contributions de la journée (id = expédition) : où est l'argent, montant */
  contribs: { id: string; bucket: 'aVerser' | 'nonRecu' | 'verse'; kind: 'portDu' | 'portPaye'; amount: number; nic: string }[]
  /** Expéditions de la journée (version allégée parcelsLite), avec `__bucket` */
  parcels: any[]
}

/** Totaux par journée d'une agence, en temps réel (null = chargement). */
export function useVersementDays(city?: string | null): VersementDay[] | null {
  const [days, setDays] = useState<VersementDay[] | null>(null)
  useEffect(() => {
    if (!city) return
    setDays(null)
    return onSnapshot(query(collection(db, 'versementDays'), where('city', '==', city)),
      s => setDays(s.docs.map(d => d.data() as VersementDay)),
      e => { console.error('Copie allégée des versements', e); setDays([]) })
  }, [city])
  return days
}

/** Détail d'UNE journée : contributions + expéditions (lues par lots de 30). */
export async function loadVersementDay(city: string, day: string): Promise<VersementDayDetail> {
  const s = await getDocs(query(collection(db, 'versementContrib'), where('city', '==', city), where('day', '==', day)))
  const contribs = s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
  const byId = new Map(contribs.map(c => [c.id, c]))
  const ids = contribs.map(c => c.id)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  // Lots lus EN PARALLÈLE (avant : l'un après l'autre — plusieurs secondes pour une grosse journée)
  const snaps = await Promise.all(chunks.map(c => getDocs(query(collection(db, 'parcelsLite'), where(documentId(), 'in', c)))))
  const parcels: any[] = []
  snaps.forEach(r => r.forEach(d => parcels.push({ id: d.id, ...d.data(), __bucket: byId.get(d.id)?.bucket })))
  return { day, contribs, parcels }
}
