// ─────────────────────────────────────────────────────────────────────────────
// RETOUR DE FONDS MIXTE — module unique de lecture / répartition par type
//
// MODÈLE DE DONNÉES (colis) :
//   - codAmount      = TOTAL du retour de fonds (inchangé pour tous les colis : les
//                      lecteurs qui ne connaissent que le total restent justes —
//                      facture CRBT, portail client, stats globales…).
//   - serviceType    = type principal. Colis MIXTE : 'cheque' | 'traite' (le document).
//   - codPaymentType = cohérent avec serviceType (type du document pour un mixte).
//   - codMixed       = true uniquement pour un colis mixte (Espèces + 1 document).
//   - codCashAmount  = part ESPÈCES d'un colis mixte (> 0). Absent / 0 sinon.
//   → part document = codAmount − codCashAmount (jamais stockée : aucune désynchro
//     possible si un ancien écran modifie codAmount).
//
// Un colis mono-type (tous les colis existants) : une seule part = codAmount du type
// codPaymentTypeOf(p). Aucun colis existant n'a codMixed → comportement identique.
// Chèque + Traite ensemble : interdit (un seul document par expédition).
// Statut d'encaissement : un seul codStatus pour tout le colis (le livreur encaisse
// les deux parts en même temps, à la livraison).
// ─────────────────────────────────────────────────────────────────────────────
import { codPaymentTypeOf, codPaymentTypeForService } from '../firebase/constants'

export type CodValueType = 'especes' | 'cheque' | 'traite'
export type CodPart = { type: string; amount: number }

export const COD_DOC_TYPES = ['cheque', 'traite']

export const COD_PART_EMOJI: Record<string, string> = {
  especes: '💵', cheque: '📋', traite: '📝', bon_livraison: '🧾', retour_bl: '🧾',
}
export const COD_PART_LABEL: Record<string, string> = {
  especes: 'Espèces', cheque: 'Chèque', traite: 'Traite', bon_livraison: 'Retour BL', retour_bl: 'Retour BL',
}

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Type du document (chèque / traite) d'un colis mixte ('' sinon). */
export function codDocTypeOf(p: any): string {
  const fromService = codPaymentTypeForService(p?.serviceType)
  if (COD_DOC_TYPES.includes(fromService)) return fromService
  const t = codPaymentTypeOf(p)
  return COD_DOC_TYPES.includes(t) ? t : ''
}

/** Colis à retour de fonds mixte (Espèces + un chèque OU une traite). */
export function isMixedCod(p: any): boolean {
  return !!p && p.codMixed === true && num(p.codCashAmount) > 0 && !!codDocTypeOf(p) && num(p.codAmount) > 0
}

/** Total du retour de fonds (= codAmount, y compris pour un mixte). */
export function codTotalOf(p: any): number {
  return num(p?.codAmount)
}

/**
 * Parts du retour de fonds par type de valeur.
 * - mixte  : [{ document }, { especes }]
 * - simple : [{ codPaymentTypeOf(p) || fallback, codAmount }]
 * - sans RF: []
 * `fallback` = type retenu quand le colis n'a aucun type connu (historiquement 'especes').
 */
export function codPartsOf(p: any, fallback = 'especes'): CodPart[] {
  const total = codTotalOf(p)
  if (total <= 0) return []
  if (isMixedCod(p)) {
    const cash = Math.min(num(p.codCashAmount), total)
    const doc = round2(total - cash)
    const parts: CodPart[] = []
    if (doc > 0) parts.push({ type: codDocTypeOf(p), amount: doc })
    parts.push({ type: 'especes', amount: round2(cash) })
    return parts
  }
  const t = codPaymentTypeOf(p) || fallback
  return t ? [{ type: t, amount: total }] : []
}

/** Montant du retour de fonds pour un type donné ('especes' | 'cheque' | 'traite' | …). */
export function codAmountOfType(p: any, type: string, fallback = 'especes'): number {
  return codPartsOf(p, fallback).filter(x => x.type === type).reduce((s, x) => s + x.amount, 0)
}

/** Part ESPÈCES (0 pour un colis chèque/traite simple). */
export function codCashPartOf(p: any, fallback = 'especes'): number {
  return codAmountOfType(p, 'especes', fallback)
}

/** Part DOCUMENT (chèque + traite) — 0 pour un colis espèces simple. */
export function codDocPartOf(p: any, fallback = 'especes'): number {
  return codPartsOf(p, fallback).filter(x => COD_DOC_TYPES.includes(x.type)).reduce((s, x) => s + x.amount, 0)
}

/** Le colis contient-il une part d'un de ces types ? */
export function codHasType(p: any, type: string | string[], fallback = 'especes'): boolean {
  const types = Array.isArray(type) ? type : [type]
  return codPartsOf(p, fallback).some(x => types.includes(x.type) && x.amount > 0)
}

/** Totaux par type sur une liste de colis : { especes, cheque, traite, … }. */
export function codTotalsByType(list: any[], fallback = 'especes'): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of list || []) {
    for (const part of codPartsOf(p, fallback)) out[part.type] = (out[part.type] || 0) + part.amount
  }
  return out
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-MA')

/** "💵 1 200 + 📋 5 000" (vide pour un colis mono-type). */
export function codPartsBreakdown(p: any): string {
  if (!isMixedCod(p)) return ''
  return codPartsOf(p)
    .slice()
    .sort((a, b) => (a.type === 'especes' ? -1 : b.type === 'especes' ? 1 : 0))
    .map(x => `${COD_PART_EMOJI[x.type] || ''} ${fmt(x.amount)}`)
    .join(' + ')
}

/** Libellé détaillé pour impression / livreur : "Espèces 1 200 DH + Chèque 5 000 DH". */
export function codPartsDetailLabel(p: any): string {
  if (!isMixedCod(p)) return ''
  return codPartsOf(p)
    .slice()
    .sort((a, b) => (a.type === 'especes' ? -1 : b.type === 'especes' ? 1 : 0))
    .map(x => `${COD_PART_LABEL[x.type] || x.type} ${fmt(x.amount)} DH`)
    .join(' + ')
}

/** "6 200 DH (💵 1 200 + 📋 5 000)" ou "6 200 DH". */
export function codAmountDisplay(p: any): string {
  const total = codTotalOf(p)
  const b = codPartsBreakdown(p)
  return `${fmt(total)} DH${b ? ` (${b})` : ''}`
}

/** Libellé du type : "Espèces + Chèque" pour un mixte, sinon le type unique. */
export function codTypeDisplay(p: any): string {
  if (isMixedCod(p)) return `Espèces + ${COD_PART_LABEL[codDocTypeOf(p)] || codDocTypeOf(p)}`
  const t = codPaymentTypeOf(p)
  return t ? (COD_PART_LABEL[t] || t) : ''
}

// ── Libellés partagés (service / mode de règlement) ───────────────────────────
const SERVICE_LABEL: Record<string, string> = {
  simple: 'Simple', especes: 'C/Espèces', cheque: 'C/Chèque', traite: 'C/Traite',
  retour_bl: 'Retour BL', bon_livraison: 'Retour BL', retourne: 'Retourné',
}
const SERVICE_EMOJI: Record<string, string> = {
  simple: '📦', especes: '💵', cheque: '📋', traite: '📝', retour_bl: '🧾', bon_livraison: '🧾', retourne: '↩️',
}

/** Parts triées espèces d'abord (affichage / listes par mode). */
export function codPartsSorted(p: any, fallback = 'especes'): CodPart[] {
  return codPartsOf(p, fallback).slice().sort((a, b) => (a.type === 'especes' ? -1 : b.type === 'especes' ? 1 : 0))
}

/** Clés de service affichées : ['especes','cheque'] pour un mixte, sinon [serviceType normalisé]. */
export function codServiceKeys(p: any): string[] {
  if (isMixedCod(p)) return ['especes', codDocTypeOf(p)]
  const st = String(p?.serviceType || '').split(',')[0].trim().toLowerCase()
  return st ? [st] : []
}

/**
 * Libellé du service (toutes les parts) :
 * mixte  → "💵 C/Espèces + 📋 C/Chèque" ; mono → "📋 C/Chèque" ; sans service → "".
 * `emoji: false` → "C/Espèces + C/Chèque".
 */
export function codServiceLabel(p: any, opts: { emoji?: boolean } = {}): string {
  const withEmoji = opts.emoji !== false
  return codServiceKeys(p)
    .map(k => {
      const lbl = SERVICE_LABEL[k] || k
      return withEmoji && SERVICE_EMOJI[k] ? `${SERVICE_EMOJI[k]} ${lbl}` : lbl
    })
    .join(' + ')
}

/**
 * Libellé du mode de règlement du RF (toutes les parts) :
 * mixte → "💵 Espèces + 📋 Chèque" ; mono → "📋 Chèque" (type codPaymentTypeOf / fallback).
 * `amounts: true` → "💵 Espèces 1 200 DH + 📋 Chèque 590 DH" (mono : sans montant).
 */
export function codPartsLabel(p: any, opts: { emoji?: boolean; amounts?: boolean; fallback?: string } = {}): string {
  const withEmoji = opts.emoji !== false
  const parts = codPartsSorted(p, opts.fallback ?? 'especes')
  const types = parts.length ? parts : (() => { const t = codPaymentTypeOf(p) || opts.fallback || ''; return t ? [{ type: t, amount: 0 }] : [] })()
  const mixed = types.length > 1
  return types
    .map(x => {
      const lbl = COD_PART_LABEL[x.type] || x.type
      const base = withEmoji && COD_PART_EMOJI[x.type] ? `${COD_PART_EMOJI[x.type]} ${lbl}` : lbl
      return opts.amounts && mixed ? `${base} ${fmt(x.amount)} DH` : base
    })
    .join(' + ')
}

/**
 * Lignes d'une liste groupée par mode de règlement : un colis mixte donne UNE ligne par
 * part ({ ...colis, codAmount: part, codAmountTotal, codPartType, codPartMixed: true }).
 * Colis mono-type : renvoyé tel quel (codPartType = son type). Lecture seule.
 */
export function codPartRows<T extends Record<string, any>>(list: T[], fallback = 'especes'): (T & { codPartType: string; codPartMixed?: boolean; codAmountTotal?: number })[] {
  const out: any[] = []
  for (const p of list || []) {
    if (isMixedCod(p)) {
      for (const part of codPartsSorted(p, fallback)) {
        out.push({ ...p, codAmount: part.amount, codAmountTotal: codTotalOf(p), codPartType: part.type, codPartMixed: true })
      }
    } else {
      out.push({ ...p, codPartType: codPaymentTypeOf(p) || fallback })
    }
  }
  return out
}

/**
 * Vue d'un colis limitée à UNE part (pages DRFE espèces / DRFC chèques) :
 * codAmount = montant de la part, codAmountTotal = total d'origine.
 * Lecture seule : ne jamais réécrire l'objet renvoyé en base.
 */
export function codPartView<T extends Record<string, any>>(p: T, part: 'especes' | 'document'): T {
  if (!isMixedCod(p)) return p
  const amount = part === 'especes' ? codCashPartOf(p) : codDocPartOf(p)
  return { ...p, codAmount: amount, codAmountTotal: codTotalOf(p), codPartType: part === 'especes' ? 'especes' : codDocTypeOf(p) }
}

/**
 * Champs RF à écrire à partir d'un choix de formulaire.
 * `cashAmount` > 0 avec un serviceType chèque/traite ⇒ colis mixte.
 * Renvoie { serviceType, codAmount (TOTAL), codMixed, codCashAmount }.
 */
export function buildCodWriteFields(input: {
  serviceType: string
  codAmount: any            // montant du type principal (document si mixte)
  cashAmount?: any          // part espèces (mixte uniquement)
  mixed?: boolean
}): { serviceType: string; codAmount: number; codMixed: boolean; codCashAmount: number } {
  const st = input.serviceType
  const main = num(input.codAmount)
  const cash = num(input.cashAmount)
  const mixed = !!input.mixed && COD_DOC_TYPES.includes(st) && cash > 0 && main > 0
  if (mixed) return { serviceType: st, codAmount: round2(main + cash), codMixed: true, codCashAmount: round2(cash) }
  return { serviceType: st, codAmount: round2(main), codMixed: false, codCashAmount: 0 }
}

/** Erreur de saisie RF mixte (texte FR) ou '' si OK. */
export function validateCodChoice(input: { serviceType: string; codAmount: any; cashAmount?: any; mixed?: boolean }): string {
  const st = input.serviceType
  if (!input.mixed) return ''
  if (!COD_DOC_TYPES.includes(st)) return 'Retour de fonds mixte : choisissez Espèces + un Chèque OU une Traite.'
  if (num(input.cashAmount) <= 0) return 'Retour de fonds mixte : saisissez le montant espèces (> 0).'
  if (num(input.codAmount) <= 0) return `Retour de fonds mixte : saisissez le montant ${COD_PART_LABEL[st].toLowerCase()} (> 0).`
  return ''
}

// ── Sélection du type de service dans un formulaire (création / édition) ──────
// Représentation : form.serviceType = type principal, form.codMixed = true si
// Espèces est cochée EN PLUS d'un chèque / d'une traite.
//   - form.codAmount     = montant du type principal (document si mixte)
//   - form.codCashAmount = montant espèces (mixte uniquement)
type CodFormKeys = { service?: string; amount?: string; cash?: string; mixed?: string }

/** Types cochés : ['especes','cheque'] pour un mixte, sinon [serviceType]. */
export function codSelectionOf(form: any, keys: CodFormKeys = {}): string[] {
  const k = { service: 'serviceType', mixed: 'codMixed', ...keys }
  const st = String(form?.[k.service] || '').split(',')[0].trim()
  if (form?.[k.mixed] === true && COD_DOC_TYPES.includes(st)) return ['especes', st]
  return st ? [st] : []
}

/**
 * Bascule d'un bouton de type de service :
 * - Simple : exclusif (efface tout retour de fonds) ;
 * - Espèces : s'ajoute / se retire d'un chèque ou d'une traite ;
 * - Chèque / Traite : exclusifs entre eux, combinables avec Espèces.
 */
export function toggleCodService<T extends Record<string, any>>(form: T, key: string, keys: CodFormKeys = {}): T {
  const k = { service: 'serviceType', amount: 'codAmount', cash: 'codCashAmount', mixed: 'codMixed', ...keys }
  const f: Record<string, any> = { ...form }
  const st = String(f[k.service] || '').split(',')[0].trim()
  const mixed = f[k.mixed] === true && COD_DOC_TYPES.includes(st)
  const set = (service: string, amount: any, isMixed: boolean, cash: any) => {
    f[k.service] = service; f[k.amount] = amount; f[k.mixed] = isMixed; f[k.cash] = isMixed ? cash : ''
    return f as T
  }
  if (key === 'simple') return set('simple', '', false, '')
  if (key === 'especes') {
    if (mixed) return set(st, f[k.amount], false, '')                    // retire Espèces du mixte
    if (COD_DOC_TYPES.includes(st)) return set(st, f[k.amount], true, '') // ajoute Espèces au document
    if (st === 'especes') return set('simple', '', false, '')            // décoche Espèces seul
    return set('especes', f[k.amount], false, '')
  }
  if (COD_DOC_TYPES.includes(key)) {
    if (st === key) {                                                      // décoche le document
      return mixed ? set('especes', f[k.cash], false, '') : set('simple', '', false, '')
    }
    if (COD_DOC_TYPES.includes(st)) return set(key, f[k.amount], mixed, f[k.cash]) // chèque ⇄ traite
    if (st === 'especes') return set(key, '', true, f[k.amount])          // espèces + document
    return set(key, f[k.amount], false, '')
  }
  return set(key, f[k.amount], false, '')
}

// ── Crayon « Modifier le RETOUR FOND » (montant seul, type inchangé) ──────────
/** Valeurs initiales du modal : value = total (mono-type) ou part document (mixte). */
export function codEditInitial(p: any): { value: any; cashValue: any; mixed: boolean } {
  if (isMixedCod(p)) return { value: codDocPartOf(p), cashValue: codCashPartOf(p), mixed: true }
  return { value: p?.codAmount || 0, cashValue: '', mixed: false }
}

/**
 * Montants à enregistrer depuis le modal : total + part espèces (mixte).
 * Mixte avec part espèces 0 ⇒ redevient un colis chèque/traite simple.
 */
export function codEditResult(modal: { value: any; cashValue?: any; mixed?: boolean }): { total: number; mixed: boolean; cash: number; error?: string } {
  const main = num(modal.value)
  if (!modal.mixed) return { total: parseFloat(String(modal.value ?? '')) || 0, mixed: false, cash: 0 }
  const cash = num(modal.cashValue)
  if (cash <= 0) return { total: round2(main), mixed: false, cash: 0 }
  if (main <= 0) return { total: 0, mixed: false, cash: 0, error: 'Montant chèque/traite à 0 : pour garder uniquement les espèces, changez le type de service en C/Espèces (modifier l’expédition).' }
  return { total: round2(main + cash), mixed: true, cash: round2(cash) }
}

/**
 * Montant d'un type pour un écran qui classait jusqu'ici les colis avec SA PROPRE règle
 * de type (ex. Caisse Agence : `codPaymentType || serviceType`). Colis mono-type :
 * résultat STRICTEMENT identique à l'ancien calcul (legacyType === type ? codAmount : 0).
 * Colis mixte : la part du type demandé.
 */
export function codSplitAmount(p: any, type: string, legacyType: string): number {
  if (isMixedCod(p)) return codAmountOfType(p, type)
  return legacyType === type ? (parseFloat(p?.codAmount) || 0) : 0
}
