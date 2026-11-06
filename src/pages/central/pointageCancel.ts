// ↩️ Annulation d'un pointage (1er contrôle) ET de tout ce qui en découle — logique PURE (testée à part) :
//  • l'expédition est dé-pointée (seulement si c'est MOI qui l'ai pointée : un pointage appartient à son auteur) ;
//  • chèque / traite simple : ses données (codDocuments) sont effacées, à ressaisir au prochain pointage ;
//  • 🔗 chèque GROUPÉ : chaque expédition du groupe que J'AI pointée est dé-pointée, et le groupe est dissous
//    (codDocuments → [] sur TOUTES ses expéditions)… sauf si une expédition du groupe est pointée par un AUTRE
//    utilisateur : on ne touche pas à son travail, le chèque groupé est alors gardé tel quel (toutes les
//    expéditions gardent les mêmes données → groupe cohérent) et seuls MES pointages sont annulés ;
//  • arrivée déjà confirmée (deliveryControlled) sur l'expédition ou une expédition de son groupe : RIEN n'est
//    annulé pour cette expédition — l'agence de destination doit d'abord annuler SA confirmation d'arrivée.
// Les états passés ici doivent être RELUS en base (getDoc) : les expéditions d'un groupe ne sont pas forcément
// chargées dans la page.

export interface CancelBlock { id: string; nic: string; by: string }

export interface PointageCancelPlan {
  /** Expéditions à dé-pointer (pointées par moi) */
  unpoint: string[]
  /** Expéditions dont les données de chèque / traite sont effacées (codDocuments → []) */
  clearDocs: string[]
  /** Arrivée déjà confirmée : rien n'est annulé pour l'expédition demandée (ni son groupe) */
  arrivalBlocked: CancelBlock[]
  /** Pointées par un autre utilisateur : laissées telles quelles */
  othersPointed: CancelBlock[]
  /** Expéditions demandées qui n'étaient pas pointées (rien à annuler) */
  notPointed: string[]
  /** Chèques groupés dissous / gardés (pointage d'un autre utilisateur dans le groupe) */
  groupsDissolved: number
  groupsKept: number
}

const nicOf = (p: any) => String(p?.senderNic || p?.sender?.nic || p?.trackingId || p?.id || '')
const docsOf = (p: any): any[] => (Array.isArray(p?.codDocuments) ? p.codDocuments : [])
/** Chèque groupé enregistré sur l'expédition (un seul chèque pour plusieurs expéditions) */
const groupOf = (p: any): any | null => docsOf(p).find(d => (d?.groupIds || []).length > 1) || null
/** L'expédition fait-elle encore partie de CE groupe (ses données le référencent toujours) ? */
const inGroup = (p: any, groupId: string) => !!p && docsOf(p).some(d => d?.groupId === groupId)

/**
 * @param targets  expéditions dont on demande l'annulation (état FRAIS)
 * @param byId     état FRAIS de toutes les expéditions connues, y compris les membres des groupes (absent = introuvable)
 * @param myUid    utilisateur courant
 */
export function planPointageCancel(targets: any[], byId: Map<string, any>, myUid: string): PointageCancelPlan {
  const unpoint = new Set<string>()
  const clearDocs = new Set<string>()
  const arrivalBlocked = new Map<string, CancelBlock>()
  const othersPointed = new Map<string, CancelBlock>()
  const notPointed: string[] = []
  const seenGroups = new Set<string>()
  let groupsDissolved = 0
  let groupsKept = 0
  const block = (p: any, by: string): CancelBlock => ({ id: p.id, nic: nicOf(p), by: by || '—' })

  for (const t0 of targets) {
    const t = (t0 && byId.get(t0.id)) || t0
    if (!t?.id) continue
    if (!t.controlled) { notPointed.push(t.id); continue }
    if (t.controlledById !== myUid) { othersPointed.set(t.id, block(t, t.controlledBy)); continue }
    if (unpoint.has(t.id)) continue // déjà traitée avec son groupe

    const g = groupOf(t)
    // Unité d'annulation : l'expédition seule, ou toutes les expéditions de son chèque groupé encore liées au groupe
    const unit: any[] = [t]
    if (g?.groupId) {
      for (const id of g.groupIds || []) {
        if (id === t.id) continue
        const m = byId.get(id)
        if (inGroup(m, g.groupId)) unit.push(m)
      }
    }
    // Arrivée confirmée par l'agence de destination : on n'annule RIEN de l'unité
    const arrived = unit.filter(m => m.deliveryControlled)
    if (arrived.length) { arrived.forEach(m => arrivalBlocked.set(m.id, block(m, m.deliveryControlledBy))); continue }

    const others = unit.filter(m => m.controlled && m.controlledById !== myUid)
    others.forEach(m => othersPointed.set(m.id, block(m, m.controlledBy)))
    unit.filter(m => m.controlled && m.controlledById === myUid).forEach(m => unpoint.add(m.id))

    if (g?.groupId) {
      if (seenGroups.has(g.groupId)) continue
      seenGroups.add(g.groupId)
      if (others.length) { groupsKept += 1; continue } // groupe gardé intact : pas de chèque à moitié effacé
      groupsDissolved += 1
      unit.forEach(m => clearDocs.add(m.id))
    } else if (docsOf(t).length) {
      clearDocs.add(t.id)
    }
  }

  return {
    unpoint: [...unpoint],
    clearDocs: [...clearDocs],
    arrivalBlocked: [...arrivalBlocked.values()],
    othersPointed: [...othersPointed.values()].filter(b => !unpoint.has(b.id)),
    notPointed,
    groupsDissolved,
    groupsKept,
  }
}

/** Identifiants des membres de groupe à relire en base avant de planifier (ceux pas encore relus). */
export function groupMemberIdsToFetch(fresh: any[], known: Set<string>): string[] {
  const out = new Set<string>()
  fresh.forEach(p => (groupOf(p)?.groupIds || []).forEach((id: string) => { if (id && !known.has(id)) out.add(id) }))
  return [...out]
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔗 Enregistrement d'un chèque groupé — calcul des écritures (logique pure)
// ─────────────────────────────────────────────────────────────────────────────
export interface GroupChequeInput {
  type: 'cheque' | 'traite'; numero: string; banque: string; montant: number; echeance: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Répartit `amount` au prorata de `weights` (montant attendu de chaque expédition), arrondi au centime : la somme des
 * parts est EXACTEMENT `amount` (l'écart d'arrondi va sur la plus grosse part). Poids tous nuls → parts égales.
 */
export function splitProRata(amount: number, weights: number[]): number[] {
  const n = weights.length
  if (!n) return []
  const w = weights.map(x => (x > 0 ? x : 0))
  const tot = w.reduce((s, x) => s + x, 0)
  const out = w.map(x => r2(tot > 0 ? (amount * x) / tot : amount / n))
  const gap = r2(amount - out.reduce((s, x) => s + x, 0))
  if (gap) { const i = out.indexOf(Math.max(...out)); out[i] = r2(out[i] + gap) }
  return out
}

/** Expéditions d'une opération : celle en cours d'abord, sans doublon (même ordre partout : écritures, parts, impression). */
export function operationMembers(current: any, members: any[]): any[] {
  const seen = new Set<string>()
  return [current, ...members.filter(m => m.id !== current.id)].filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)))
}

/**
 * 🔗 Parts de chaque expédition d'une opération « plusieurs chèques / traites → plusieurs expéditions » (+ reste en
 * espèces) : chaque chèque, puis les espèces, sont répartis au prorata du montant attendu de chaque expédition.
 */
export function groupOperationShares(list: any[], partOf: (p: any) => number, chequeAmounts: number[], cash: number) {
  const weights = list.map(partOf)
  const perCheque = chequeAmounts.map(a => splitProRata(Number(a) || 0, weights))
  const cashParts = splitProRata(Number(cash) || 0, weights)
  return list.map((m, i) => ({ id: m.id, nic: nicOf(m), expected: r2(weights[i]), cheque: r2(perCheque.reduce((s, sh) => s + sh[i], 0)), cash: cashParts[i] }))
}

/** Chèques / traites GROUPÉS de l'expédition (une opération peut en compter plusieurs). */
const groupDocsOf = (p: any): any[] => docsOf(p).filter(d => (d?.groupIds || []).length > 1)

/**
 * Données à écrire sur chaque expédition quand on enregistre une opération groupée (ou quand on en sort une expédition).
 * 🔗 (03/11/2026) PLUSIEURS chèques / traites pour plusieurs expéditions : chaque expédition reçoit TOUS les chèques de
 * l'opération, chacun avec son groupId (1er = groupId de l'opération, suivants « …~k »), les mêmes groupIds / groupNics,
 * groupTotal = montant du chèque, montant = PART de l'expédition dans ce chèque (prorata de son montant attendu).
 * @param current  expédition en cours (état FRAIS)
 * @param members  expéditions couvertes, celle en cours comprise (état FRAIS) — vide/1 = pas de groupe
 * @param byId     état FRAIS des anciens membres du groupe (pour retirer / réduire proprement)
 * @param partOf   part de COD document d'une expédition (docAmountOf)
 */
export function planGroupChequeWrites(
  current: any, docs: GroupChequeInput[], members: any[] | undefined, byId: Map<string, any>,
  partOf: (p: any) => number, newGroupId: () => string,
): Record<string, any[]> {
  const writes: Record<string, any[]> = {}
  const prev = groupOf(current)
  const prevDocs = groupDocsOf(current)
  const prevRest = prev?.groupId
    ? (prev.groupIds || []).filter((id: string) => id !== current.id && inGroup(byId.get(id), prev.groupId))
    : []

  if (members && members.length > 1) {
    const base = prev?.groupId || newGroupId()
    const list = operationMembers(current, members)
    const groupIds = list.map(m => m.id)
    const groupNics = list.map(nicOf)
    const weights = list.map(partOf)
    const perCheque = docs.map((c, k) => ({ c, groupId: k === 0 ? base : `${base}~${k}`, shares: splitProRata(Number(c.montant) || 0, weights) }))
    list.forEach((m, i) => {
      writes[m.id] = perCheque.map(({ c, groupId, shares }) => ({ ...c, montant: shares[i], groupId, groupIds, groupNics, groupTotal: r2(Number(c.montant) || 0) }))
    })
    // Expéditions retirées du groupe : leurs chèques ne sont plus les leurs → données à ressaisir
    prevRest.filter((id: string) => !groupIds.includes(id)).forEach((id: string) => { writes[id] = [] })
    return writes
  }

  writes[current.id] = docs
  // Expédition sortie d'un groupe : les autres gardent les chèques, sans elle (chaque total diminué de sa part)
  if (prev && prevRest.length) {
    const restNics = prevRest.map((id: string) => nicOf(byId.get(id)))
    prevRest.forEach((id: string) => {
      const o = byId.get(id)
      writes[id] = prevDocs.map(pd => {
        const total = r2((Number(pd.groupTotal) || 0) - (Number(pd.montant) || 0))
        const base = docsOf(o).find(d => d?.groupId === pd.groupId)
        const single = { type: pd.type, numero: pd.numero, banque: pd.banque, echeance: pd.echeance || '' }
        return prevRest.length > 1
          ? { ...single, montant: r2(Number(base?.montant) || partOf(o)), groupId: pd.groupId, groupIds: prevRest, groupNics: restNics, groupTotal: total }
          : { ...single, montant: total }
      })
    })
  }
  return writes
}
