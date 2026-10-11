import { useEffect, useState, startTransition } from 'react'
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/db'
import { opDayOf, opStart } from '../utils/daySlices'

/** Fenêtre des cartes « Collectes par jour » / « Valeurs (COD) collectées par jour » : 14 journées d'opération. */
export const RECENT_COLLECT_DAYS = 14

// Date de collecte / réception → ville de l'agence concernée. Les dates sont enregistrées tantôt en Timestamp,
// tantôt en texte ISO (selon l'écran qui a collecté) : chaque champ est interrogé dans les DEUX formats.
const SHAPES: [cityField: 'destinationCity' | 'originCity', dateField: string][] = [
  ['destinationCity', 'portCollectedAt'],     // port dû collecté (livreur, guichet, chef)
  ['destinationCity', 'codCollectedAt'],      // COD collecté
  ['originCity', 'portPayeExpReceivedAt'],    // port payé ramassé remis au chef d'exploitation
  ['originCity', 'portReceivedAt'],           // port payé reçu par le chef d'agence
]

/**
 * 🧾 Expéditions de l'agence COLLECTÉES ou REÇUES pendant les 14 dernières journées, mais CRÉÉES EN DEHORS de la
 * période chargée par la page ([loadedFrom, loadedTo]) — celles de la période sont déjà chargées.
 * Sans elles, une expédition du 07/10 collectée aujourd'hui manquait dans la carte du jour dès que la période
 * affichée ne contenait pas le 07/10. Version allégée (parcelsLite), en temps réel, au plus 16 petites écoutes.
 */
export function useRecentCollected(city: string | undefined | null, loadedFrom: Date | null, loadedTo: Date | null, enabled = true) {
  const [docs, setDocs] = useState<any[]>([])
  const fromMs = loadedFrom ? loadedFrom.getTime() : 0
  const toMs = loadedTo ? loadedTo.getTime() : 0

  useEffect(() => {
    if (!enabled || !city) return
    startTransition(() => setDocs([]))
    const today = opDayOf(new Date())
    const [y, m, d] = today.split('-').map(Number)
    const first = new Date(y, m - 1, d - (RECENT_COLLECT_DAYS - 1))
    const since = opStart(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`)
    // Parties de « créée » NON couvertes par la période chargée
    const createdRanges: [op: '<' | '>', at: Date][] = []
    if (fromMs) createdRanges.push(['<', new Date(fromMs)])
    if (toMs && toMs < Date.now()) createdRanges.push(['>', new Date(toMs)])
    if (!createdRanges.length) return

    const byKey = new Map<string, Map<string, any>>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const emit = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const all = new Map<string, any>()
        byKey.forEach(m => m.forEach((p, id) => all.set(id, p)))
        startTransition(() => setDocs([...all.values()]))
      }, 80)
    }
    const unsubs: (() => void)[] = []
    for (const [cityField, dateField] of SHAPES) {
      for (const sinceValue of [Timestamp.fromDate(since), since.toISOString()] as const) {
        for (const [op, at] of createdRanges) {
          const key = `${dateField}|${typeof sinceValue}|${op}`
          unsubs.push(onSnapshot(
            query(collection(db, 'parcelsLite'),
              where(cityField, '==', city),
              where(dateField, '>=', sinceValue),
              where('createdAt', op, Timestamp.fromDate(at))),
            snap => {
              byKey.set(key, new Map(snap.docs.map(x => [x.id, { id: x.id, ...x.data() }])))
              emit()
            },
            err => console.error('Collectes récentes hors période :', key, err),
          ))
        }
      }
    }
    return () => { clearTimeout(timer); unsubs.forEach(u => u()) }
  }, [city, fromMs, toMs, enabled])

  return docs
}
