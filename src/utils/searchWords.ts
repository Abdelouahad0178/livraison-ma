// 🔎 INDEX DE RECHERCHE PAR MOT (Admin, 03/11/2026) — règle PARTAGÉE page ⇄ serveur (compilée dans
// functions/shared/searchWords.js par scripts/build-functions-shared.mjs ; Cloud Function syncParcelSearch).
// parcelSearch/{id de l'expédition} = { w: jetons, d: date de création (ms) } :
//   s:<mot> / r:<mot> / k:<mot>  mots du nom de l'expéditeur / du destinataire / du client en compte, et leurs débuts
//                                (3 lettres et plus) → « BAKRIM » trouve « NOUREDINE BAKRIM », « bakr » aussi ;
//   c:<numéro>                   numéros de chèque / traite (et leurs débuts, 4 caractères et plus).
// L'index est séparé des expéditions (elles ne sont jamais modifiées) et de parcelsLite (les listes ne s'alourdissent pas).

/** Minuscules, sans accents. */
const fold = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Mots d'un nom (lettres et chiffres, 2 caractères et plus), 12 au plus. */
export const wordsOf = (s: unknown): string[] => fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2).slice(0, 12)

/** Un mot et ses débuts de 3 caractères et plus (20 au plus). */
const prefixesOf = (w: string): string[] => {
  const out = [w]
  for (let n = 3; n < w.length && n <= 20; n++) out.push(w.slice(0, n))
  return out
}

/** Numéro de chèque / traite normalisé (chiffres et lettres, majuscules). */
export const chequeKeyOf = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

/** Tous les numéros de chèque / traite d'une expédition (COD, port dû, port payé, paiement fournisseur). */
export function chequeNumbersOf(p: any): string[] {
  const docs = Array.isArray(p?.codDocuments) ? p.codDocuments.map((d: any) => d?.numero) : []
  return [...docs, p?.codReceivedChequeNum, p?.portDuChequeNumero, p?.portPayeChequeNumero, p?.centralChequeNum]
    .map(chequeKeyOf).filter(k => k.length >= 3)
}

/** Jetons de recherche d'une expédition (triés, sans doublon). */
export function searchTokensOf(p: any): string[] {
  const set = new Set<string>()
  const names: [string, unknown][] = [['s', p?.sender?.name ?? p?.senderName], ['r', p?.receiver?.name ?? p?.receiverName], ['k', p?.clientName]]
  for (const [f, name] of names) for (const w of wordsOf(name)) for (const x of prefixesOf(w)) set.add(`${f}:${x}`)
  for (const k of chequeNumbersOf(p)) {
    set.add(`c:${k}`)
    for (let n = 4; n < k.length; n++) set.add(`c:${k.slice(0, n)}`)
  }
  return [...set].sort()
}

const toMs = (v: any): number => {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v._seconds === 'number') return v._seconds * 1000
  if (typeof v.seconds === 'number') return v.seconds * 1000
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

/** Document d'index d'une expédition. */
export const searchDocOf = (p: any): { w: string[]; d: number } => ({ w: searchTokensOf(p), d: toMs(p?.createdAt) })

export interface WordQuery {
  /** Jetons pour la requête serveur (array-contains-any) */
  any: string[]
  /** Mots tapés : TOUS doivent se retrouver dans le nom (un des champs visés) */
  words: string[]
  fields: string[]
  /** Numéro de chèque / traite tapé (ou null) */
  cheque: string | null
}

/**
 * Requête par mot pour un texte tapé (null s'il n'y a rien à chercher : moins de 3 lettres utiles).
 * Le mot le plus long sert à la requête serveur ; les autres filtrent le résultat (wordQueryMatches).
 */
export function wordQueryOf(term: string, scope: 'all' | 'sender' | 'receiver' = 'all'): WordQuery | null {
  const words = wordsOf(term)
  const fields = scope === 'sender' ? ['s'] : scope === 'receiver' ? ['r'] : ['s', 'r', 'k']
  const best = [...words].sort((a, b) => b.length - a.length)[0]
  const raw = String(term ?? '').trim()
  const ck = chequeKeyOf(raw)
  const cheque = scope === 'all' && !/\s/.test(raw) && ck.length >= 4 && /\d/.test(ck) ? ck : null
  const any = [...(best && best.length >= 3 ? fields.map(f => `${f}:${best}`) : []), ...(cheque ? [`c:${cheque}`] : [])]
  return any.length ? { any, words: best && best.length >= 3 ? words : [], fields, cheque } : null
}

/**
 * Le document d'index correspond-il à la recherche ? Le numéro de chèque, ou TOUS les mots dans le MÊME nom
 * (« ZONE AUTO » ne trouve pas « BEST AUTO » → « M2A ZONE A » : un mot chez l'expéditeur, l'autre chez le destinataire).
 */
export function wordQueryMatches(w: string[], q: WordQuery): boolean {
  const set = new Set(w)
  if (q.cheque && set.has(`c:${q.cheque}`)) return true
  return q.words.length > 0 && q.fields.some(f => q.words.every(x => set.has(`${f}:${x}`)))
}
