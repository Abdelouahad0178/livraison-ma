// ⚡ LECTURE DIRECTE (API REST Firestore) des journées passées — 01/11/2026.
// Pour une lecture ponctuelle de milliers d'expéditions (journées passées de la « mémoire des journées », collectes
// récentes), la bibliothèque Firebase trie, met en cache et recherche dans son cache local à chaque requête : sur téléphone,
// la période « Tout » (45 jours) passait plus de 40 s dans ces seuls traitements. Ici la requête part directement au serveur
// (mêmes règles de sécurité : jeton de connexion de l'utilisateur) et la réponse est convertie dans la MÊME forme que
// `doc.data()` (Timestamp, GeoPoint, références…). Toute erreur → l'appelant reprend la lecture habituelle (SDK).
import { doc } from 'firebase/firestore'
import { db } from './db'
import { auth } from './auth'
import app from './appCore'
import { fromRestFields, toRestValue } from '../utils/restValue'

const OPS: Record<string, string> = { '==': 'EQUAL', '>=': 'GREATER_THAN_OR_EQUAL', '>': 'GREATER_THAN', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL' }
const REF = { ref: (path: string) => doc(db, path) }

export interface RestFilter { field: string; op: '==' | '>=' | '>' | '<' | '<=' ; value: any }
export interface RestDoc { id: string; name: string; data: Record<string, any>; raw: Record<string, any> }

/**
 * Exécute une requête (une collection, filtres ET, tri, limite, reprise après un document) et renvoie les documents
 * convertis. `after` : { createdAtRaw, name } du dernier document de la page précédente (tri createdAt décroissant).
 */
export async function restRunQuery(opts: {
  collection: string; filters: RestFilter[]; orderBy?: { field: string; desc?: boolean }; limit?: number
  after?: { value: any; name: string } | null
}): Promise<RestDoc[]> {
  const user = auth.currentUser
  if (!user) throw new Error('lecture directe : non connecté')
  const token = await user.getIdToken()
  const structuredQuery: any = {
    from: [{ collectionId: opts.collection }],
    where: opts.filters.length === 1
      ? { fieldFilter: { field: { fieldPath: opts.filters[0].field }, op: OPS[opts.filters[0].op], value: toRestValue(opts.filters[0].value) } }
      : { compositeFilter: { op: 'AND', filters: opts.filters.map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: OPS[f.op], value: toRestValue(f.value) } })) } },
  }
  if (opts.orderBy) structuredQuery.orderBy = [{ field: { fieldPath: opts.orderBy.field }, direction: opts.orderBy.desc ? 'DESCENDING' : 'ASCENDING' },
    { field: { fieldPath: '__name__' }, direction: opts.orderBy.desc ? 'DESCENDING' : 'ASCENDING' }]
  if (opts.limit) structuredQuery.limit = opts.limit
  if (opts.after) structuredQuery.startAt = { values: [opts.after.value, { referenceValue: opts.after.name }], before: false }
  const projectId = app.options.projectId
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  if (!res.ok) throw new Error(`lecture directe : ${res.status} ${(await res.text()).slice(0, 200)}`)
  const rows: any[] = await res.json()
  const out: RestDoc[] = []
  for (const r of rows) {
    const d = r?.document
    if (!d?.name) continue
    out.push({ id: String(d.name).split('/').pop() as string, name: d.name, data: fromRestFields(d.fields || {}, REF), raw: d.fields || {} })
  }
  return out
}
