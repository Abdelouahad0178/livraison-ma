// ⚡ Recherche locale rapide dans les expéditions (Chef d'agence / Agent Pro, Facturier).
//
// Avant, chaque évaluation d'un filtre (chaque frappe, chaque journée chargée) re-normalisait
// ~10 champs × 15 000 expéditions (NFD + expressions régulières). Ici, les champs normalisés de
// chaque expédition sont calculés UNE fois puis mis en cache (WeakMap indexée par l'objet
// expédition : libéré automatiquement quand l'objet disparaît). Le cache est validé par identité
// de chaque valeur source (===) : si un champ change (objet muté, mise à jour locale), seule
// cette valeur est recalculée. Les règles de correspondance sont STRICTEMENT celles d'avant.
import { normName } from './billingAgency'
import { normText } from './normText'

type Norm = (v: unknown) => string
interface Entry { src: unknown[]; out: string[] }

const stores = new Map<string, WeakMap<object, Entry>>()
const storeFor = (key: string) => {
  let wm = stores.get(key)
  if (!wm) { wm = new WeakMap(); stores.set(key, wm) }
  return wm
}

/** Valeurs normalisées (`norm`) de `values`, mises en cache pour l'objet `owner` sous `key`. */
export function cachedNorms(owner: object, key: string, values: unknown[], norm: Norm): string[] {
  const wm = storeFor(key)
  let e = wm.get(owner)
  if (!e || e.src.length !== values.length) {
    e = { src: values.slice(), out: values.map(norm) }
    wm.set(owner, e)
    return e.out
  }
  for (let i = 0; i < values.length; i++) {
    if (e.src[i] !== values[i]) { e.src[i] = values[i]; e.out[i] = norm(values[i]) }
  }
  return e.out
}

const isObj = (p: unknown): p is object => !!p && typeof p === 'object'

// ── Chef d'agence / Agent Pro : barre de recherche principale (recherche locale) ─────────────
// Même règle que l'ancien matchesSearch d'AgentPage : un champ correspond si sa forme
// normalisée contient le terme, ou si sa forme « compacte » (lettres/chiffres seuls) contient
// le terme compact.
const compact = (v: unknown) => normName(v).replace(/[^a-z0-9]/g, '')
const agentNormRaw: Norm = v => normText(v)
const agentNormCompact: Norm = v => compact(normText(v))
// 0-3 : communs ; 4-8 : expéditeur ; 9-12 : destinataire
const agentFields = (p: any): unknown[] => [
  p.id, p.trackingId, p.senderNic, p.sender?.nic,
  p.clientName, p.sender?.name, p.sender?.tel, p.sender?.city, p.originCity,
  p.receiver?.name, p.receiver?.tel, p.receiver?.city, p.destinationCity,
]

/**
 * Prédicat de recherche locale d'AgentPage. `scope` : 'sender' retire les champs destinataire,
 * 'receiver' retire les champs expéditeur (comme avant).
 */
export function makeAgentSearchMatcher(query: string, scope: 'all' | 'sender' | 'receiver' | string): (p: any) => boolean {
  const q = normText(query)
  if (!q) return () => true
  const compactQ = compact(q)
  const skipSender = scope === 'receiver'
  const skipReceiver = scope === 'sender'
  return (p: any) => {
    const vals = agentFields(p)
    if (!isObj(p)) {
      return vals.some((v, i) => {
        if ((skipSender && i >= 4 && i <= 8) || (skipReceiver && i >= 9)) return false
        const raw = agentNormRaw(v)
        return raw.includes(q) || compact(raw).includes(compactQ)
      })
    }
    const raw = cachedNorms(p, 'agent.raw', vals, agentNormRaw)
    let cmp: string[] | null = null
    for (let i = 0; i < vals.length; i++) {
      if ((skipSender && i >= 4 && i <= 8) || (skipReceiver && i >= 9)) continue
      if (raw[i].includes(q)) return true
      if (!cmp) cmp = cachedNorms(p, 'agent.cmp', vals, agentNormCompact)
      if (cmp[i].includes(compactQ)) return true
    }
    return false
  }
}

// ── Générique : un champ parmi `fields(p)` contient le terme (normName des deux côtés) ─────
function makeNormNameMatcher(key: string, fields: (p: any) => unknown[], term: string): (p: any) => boolean {
  const t = normName(term)
  return (p: any) => {
    const vals = fields(p)
    const out = isObj(p) ? cachedNorms(p, key, vals, normName) : vals.map(normName)
    for (let i = 0; i < out.length; i++) if (out[i].includes(t)) return true
    return false
  }
}

/** Recherche du tableau des Expéditions (ParcelsTab). */
export const makeTableSearchMatcher = (term: string) => makeNormNameMatcher('table', (p: any) => [
  p.sender?.nic, p.trackingId, p.clientName, p.sender?.name, p.receiver?.name, p.sender?.tel,
  p.receiver?.tel, p.sender?.city, p.receiver?.city, p.receiver?.address,
], term)

/** Recherche du Facturier (onglet Expéditions). */
export const makeFacturierSearchMatcher = (term: string) => makeNormNameMatcher('facturier', (p: any) => [
  p.trackingId, p.sender?.nic, p.sender?.name, p.receiver?.name, p.sender?.tel, p.receiver?.tel, p.clientName,
], term)

/**
 * Tri par createdAt décroissant (plus récent d'abord), identique à
 * `sort((a, b) => (b.createdAt?.toDate?.() || new Date(0)) - (a.createdAt?.toDate?.() || new Date(0)))`
 * mais en convertissant chaque date UNE fois (au lieu de 2 × n·log n conversions). Tri stable :
 * même ordre pour les ex æquo.
 */
export function sortByCreatedAtDesc<T>(list: T[]): T[] {
  const keys = list.map((p: any) => +(p?.createdAt?.toDate?.() || new Date(0)))
  const idx = list.map((_, i) => i)
  idx.sort((i, j) => keys[j] - keys[i])
  return idx.map(i => list[i])
}
