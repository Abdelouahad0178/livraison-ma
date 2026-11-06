// 💰 COD par agence — listes CIBLÉES (01/11/2026) : au lieu de charger toutes les expéditions de la période (toutes villes),
// les contributions tenues par le serveur (codAgencyContrib, champ cityList) désignent les seules expéditions qui comptent
// pour l'agence ; elles sont lues dans la copie allégée (parcelsLite, comme l'onglet), puis les listes sont calculées par
// les MÊMES fonctions qu'avant (codAgencyLines / codResteLines) → mêmes lignes.
import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from './config'
import { PARCELS_LITE_COLLECTION } from './parcels'

/**
 * Expéditions de la période [fromDay, toDay] qui comptent pour `city`, filtrées sur leurs chiffres (`keep` reçoit les
 * compteurs de l'agence, ex. v => v.th_rcv_especes > 0). Renvoie les expéditions (copie allégée) avec leur id.
 */
export async function fetchCodAgencyParcels(city: string, fromDay: string, toDay: string, keep: (v: Record<string, number>) => boolean): Promise<any[]> {
  const snap = await getDocs(query(collection(db, 'codAgencyContrib'),
    where('cityList', 'array-contains', city), where('day', '>=', fromDay), where('day', '<=', toDay)))
  const ids = snap.docs.filter(d => { const v = d.data().cities?.[city]; return !!v && keep(v) }).map(d => d.id)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  const parts = await Promise.all(chunks.map(c => getDocs(query(collection(db, PARCELS_LITE_COLLECTION), where(documentId(), 'in', c)))))
  return parts.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
}
