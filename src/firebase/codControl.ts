import { collection, getDocs, limit, orderBy, query, startAfter, where, Timestamp, type QueryConstraint } from 'firebase/firestore'
import { db } from './db'

/**
 * 💰 Page admin « Contre Remboursement » : chargement LECTURE SEULE des expéditions à COD d'une période.
 * Jamais toute la base : deux familles de requêtes bornées par la période, paginées par 1 000 :
 *  1. expéditions CRÉÉES sur la période avec un service à retour de fonds
 *     (serviceType 'in' […] + createdAt — index existant parcels(serviceType ASC, createdAt DESC)) ;
 *  2. expéditions dont le COD a été COLLECTÉ sur la période (codCollectedAt, enregistré tantôt en texte ISO,
 *     tantôt en Timestamp → les deux formats ; index simple champ automatique) — base des « COD collectés »,
 *     rangés au jour de collecte comme dans Caisse Agence, même pour une expédition créée avant.
 * Collection `parcels` (et non parcelsLite) : les champs du pointage central (controlled*, deliveryControlled*)
 * ne sont pas copiés dans parcelsLite.
 */

/** Valeurs de serviceType portant un retour de fonds (alias compris, voir COD_TYPE_ALIASES). */
export const COD_SERVICE_TYPES = [
  'especes', 'cheque', 'traite', 'cod_especes', 'cod_cheque', 'cod_traite', 'bon_livraison',
  // anciennes listes multiples (ancien écran multi-sélection)
  'cheque,traite', 'traite,cheque', 'especes,cheque', 'especes,traite',
]

const PAGE = 1000
const MAX_PAGES = 100

async function pagedGet(constraints: QueryConstraint[], onDocs: (docs: any[]) => void) {
  let cursor: any = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const snap = await getDocs(query(collection(db, 'parcels'), ...constraints, ...(cursor ? [startAfter(cursor)] : []), limit(PAGE)))
    onDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    if (snap.docs.length < PAGE) return
    cursor = snap.docs[snap.docs.length - 1]
  }
}

/**
 * Expéditions à COD de la période [from, to] (bornes larges : le filtrage exact par journée d'opération est fait
 * ensuite par la page). onProgress(n) = nombre d'expéditions distinctes déjà reçues.
 */
export async function loadCodControlParcels(from: Date, to: Date, onProgress?: (n: number) => void): Promise<any[]> {
  const map = new Map<string, any>()
  const add = (docs: any[]) => { docs.forEach(d => map.set(d.id, d)); onProgress?.(map.size) }
  const fromTs = Timestamp.fromDate(from), toTs = Timestamp.fromDate(to)
  await Promise.all([
    pagedGet([
      where('serviceType', 'in', COD_SERVICE_TYPES),
      where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs),
      orderBy('createdAt', 'desc'),
    ], add),
    pagedGet([
      where('codCollectedAt', '>=', from.toISOString()), where('codCollectedAt', '<=', to.toISOString()),
      orderBy('codCollectedAt', 'desc'),
    ], add),
    pagedGet([
      where('codCollectedAt', '>=', fromTs), where('codCollectedAt', '<=', toTs),
      orderBy('codCollectedAt', 'desc'),
    ], add),
  ])
  return [...map.values()]
}
