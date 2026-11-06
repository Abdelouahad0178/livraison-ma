/**
 * 📦 Lots d'envoi des valeurs : chaque bordereau imprimé est enregistré comme un LOT. Une expédition entre dans un
 * seul lot (fiche valeursLotItems/{id de l'expédition}, jamais modifiable) → jamais envoyée deux fois. La fiche est
 * libérée par l'annulation du lot, ou par le retrait de l'expédition (removeFromValeursLot, tracé dans `removed`) ;
 * une expédition peut être ajoutée à un lot en attente (addToValeursLot, tracé dans `added`).
 * Les expéditions elles-mêmes ne sont pas modifiées.
 */
import { collection, doc, onSnapshot, orderBy, query, runTransaction, where, writeBatch } from 'firebase/firestore'
import { db } from './db'

export interface LotRow {
  id: string; nic: string; pointCity: string; toCity: string
  amounts: { especes: number; cheque: number; traite: number }; total: number; docs: string[]
  /** Champs de l'expédition nécessaires à la réimpression */
  p: { id: string; createdAt: string; sender: { name: string }; receiver: { name: string }; codDocuments: any[]; controlledBy: string; controlledAt: string }
}
/** ➖ Trace d'une expédition retirée du lot après sa création (qui, quand, quoi, et l'état du lot à ce moment). */
export interface LotRemoval {
  id: string; nic: string; total: number; amounts: { especes: number; cheque: number; traite: number }; docs: string[]
  by: string; byId: string; at: string; reason: string; lotStatus: ValeursLot['status']
}
/** ➕ Trace d'expéditions ajoutées au lot après sa création (qui, quand, lesquelles). */
export interface LotAddition {
  ids: string[]; nics: string[]; total: number; by: string; byId: string; at: string
}
export interface ValeursLot {
  id: string; number: string; fromCity: string; toCity: string; periodText: string
  parcelIds: string[]; nics: string[]; rows: LotRow[]
  totals: { especes: number; cheque: number; traite: number; total: number }
  cheques: number; traites: number
  createdAt: string; createdBy: string; createdById: string
  /** cree = envoyé, en attente de réception ; recu / recu_partiel = réceptionné par la ville destinataire */
  status: 'cree' | 'annule' | 'recu' | 'recu_partiel'; cancelledAt?: string; cancelledBy?: string
  receivedAt?: string; receivedBy?: string; receivedById?: string; receivedIds?: string[]; missingIds?: string[]; receiveNote?: string
  removed?: LotRemoval[]
  added?: LotAddition[]
}

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
/** Lignes d'un lot qui correspondent à la recherche (N° EXP, expéditeur, destinataire, chèque / traite). */
export function lotRowsMatching(lot: ValeursLot, q: string): LotRow[] {
  const n = norm(q)
  if (!n) return lot.rows || []
  return (lot.rows || []).filter(r => [r.nic, r.p?.sender?.name, r.p?.receiver?.name, ...(r.docs || [])].some(v => norm(v).includes(n)))
}
/** Le lot correspond-il à la recherche (son numéro, ou au moins une de ses lignes) ? */
export function lotMatches(lot: ValeursLot, q: string): boolean {
  const n = norm(q)
  if (!n) return true
  return norm(lot.number).includes(n) || norm(lot.createdBy).includes(n) || norm(lot.receivedBy).includes(n) || lotRowsMatching(lot, q).length > 0
}
/** Types de valeur présents dans un lot. */
export const lotHasType = (lot: ValeursLot, type: 'especes' | 'cheque' | 'traite') => (lot.totals?.[type] || 0) > 0

export const LOT_STATUS_LABEL: Record<string, string> = {
  cree: '📤 Envoyé — en attente de réception', recu: '✅ Reçu', recu_partiel: '⚠️ Reçu partiellement', annule: '✖ Annulé',
}

/**
 * 📥 Réception d'un lot par la ville destinataire : le lot passe « reçu » (ou « reçu partiellement » avec la liste des
 * valeurs manquantes), puis l'arrivée de chaque valeur reçue est confirmée sur l'expédition (même champ que le bouton
 * « Confirmer arrivée » : deliveryControlled*), sauf si elle est déjà confirmée.
 */
export async function receiveValeursLot(lot: ValeursLot, receivedIds: string[], note: string, by: string, byId: string) {
  let received: string[] = []
  let missing: string[] = []
  const now = new Date().toISOString()
  await runTransaction(db, async tx => {
    const ref = doc(db, 'valeursLots', lot.id)
    const s = await tx.get(ref)
    if (!s.exists()) throw new Error('Lot introuvable.')
    const cur: any = s.data()
    if (cur.status !== 'cree') throw new Error(`Ce lot n'est plus en attente (${LOT_STATUS_LABEL[cur.status] || cur.status}).`)
    // Liste du lot relue ici : une expédition retirée par l'expéditeur pendant la réception n'y est plus
    const ids: string[] = Array.isArray(cur.parcelIds) ? cur.parcelIds : lot.parcelIds
    received = ids.filter(id => receivedIds.includes(id))
    missing = ids.filter(id => !receivedIds.includes(id))
    tx.update(ref, {
      status: missing.length ? 'recu_partiel' : 'recu', receivedAt: now, receivedBy: by, receivedById: byId,
      receivedIds: received, missingIds: missing, receiveNote: note || '',
    })
  })
  return { received, missing, receivedAt: now }
}

const iso = (v: any): string => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : '' }
/** Copie « figée » d'une ligne (sans undefined, dates en texte) pour l'enregistrement. */
export function freezeRow(r: any): LotRow {
  const p = r.p || {}
  return JSON.parse(JSON.stringify({
    id: r.id, nic: r.nic, pointCity: r.pointCity, toCity: r.toCity, amounts: r.amounts, total: r.total, docs: r.docs || [],
    p: {
      id: r.id, createdAt: iso(p.createdAt), sender: { name: p.sender?.name || p.senderName || '' }, receiver: { name: p.receiver?.name || p.receiverName || '' },
      codDocuments: Array.isArray(p.codDocuments) ? p.codDocuments : [], controlledBy: p.controlledBy || '', controlledAt: iso(p.controlledAt),
    },
  }))
}

/** Lots créés depuis `since` (temps réel). */
export function subscribeValeursLots(since: Date, cb: (lots: ValeursLot[]) => void, onError?: (e: any) => void) {
  return onSnapshot(query(collection(db, 'valeursLots'), where('createdAt', '>=', since.toISOString()), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), onError)
}

/**
 * Crée le lot en UNE transaction : refusée si une seule expédition est déjà dans un autre lot (message avec ses N° EXP).
 */
export async function createValeursLot(lot: Omit<ValeursLot, 'id' | 'status' | 'createdAt'>): Promise<ValeursLot> {
  if (!lot.parcelIds.length) throw new Error('Aucune expédition dans le lot.')
  if (lot.parcelIds.length > 240) throw new Error('240 expéditions au plus par lot : faites plusieurs lots.')
  const lotRef = doc(collection(db, 'valeursLots'))
  const createdAt = new Date().toISOString()
  await runTransaction(db, async tx => {
    const items = await Promise.all(lot.parcelIds.map(id => tx.get(doc(db, 'valeursLotItems', id))))
    const taken = items.filter(s => s.exists())
    if (taken.length) {
      const list = taken.map(s => { const d: any = s.data(); return `${lot.nics[lot.parcelIds.indexOf(s.id)] || s.id} (lot ${d.lotNumber})` })
      throw new Error(`Déjà envoyée(s) dans un autre lot : ${list.join(', ')}. Actualisez la liste.`)
    }
    tx.set(lotRef, { ...lot, status: 'cree', createdAt })
    lot.parcelIds.forEach((id, i) => tx.set(doc(db, 'valeursLotItems', id), {
      lotId: lotRef.id, lotNumber: lot.number, nic: lot.nics[i] || '', toCity: lot.toCity, createdAt, createdById: lot.createdById,
    }))
  })
  return { ...lot, id: lotRef.id, status: 'cree', createdAt }
}

/**
 * ➖ Retire UNE expédition d'un lot (son auteur, même après réception — demande du 03/11/2026), en une transaction :
 * le lot est relu, `patchOf` calcule le nouveau contenu à partir de cette version (lotRemovalPatch : totaux,
 * chèques / traites, trace dans `removed`), et la fiche valeursLotItems est libérée → l'expédition redevient
 * proposée pour un autre lot. La fiche n'est supprimée que si elle appartient bien à CE lot.
 */
export async function removeFromValeursLot(lotId: string, parcelId: string, patchOf: (cur: ValeursLot) => Record<string, any>) {
  await runTransaction(db, async tx => {
    const ref = doc(db, 'valeursLots', lotId)
    const itemRef = doc(db, 'valeursLotItems', parcelId)
    const [s, item] = await Promise.all([tx.get(ref), tx.get(itemRef)])
    if (!s.exists()) throw new Error('Lot introuvable.')
    tx.update(ref, patchOf({ id: s.id, ...(s.data() as any) }))
    if (item.exists() && (item.data() as any).lotId === lotId) tx.delete(itemRef)
  })
}

/**
 * ➕ Ajoute des expéditions à un lot EN ATTENTE (demande du 03/11/2026), en une transaction : le lot est relu,
 * `patchOf` calcule le nouveau contenu (lotAdditionPatch : totaux, chèques / traites, trace dans `added`), et une
 * fiche valeursLotItems est créée pour chaque ajoutée → refus si une seule est déjà dans un lot.
 * Renvoie le lot tel qu'enregistré (pour réimprimer le bordereau tout de suite).
 */
export async function addToValeursLot(lotId: string, rows: LotRow[], patchOf: (cur: ValeursLot) => Record<string, any>, byId: string): Promise<ValeursLot> {
  let saved: ValeursLot | null = null
  await runTransaction(db, async tx => {
    const ref = doc(db, 'valeursLots', lotId)
    const [s, ...items] = await Promise.all([tx.get(ref), ...rows.map(r => tx.get(doc(db, 'valeursLotItems', r.id)))])
    if (!s.exists()) throw new Error('Lot introuvable.')
    const taken = items.filter(x => x.exists())
    if (taken.length) throw new Error(`Déjà dans un lot : ${taken.map(x => `${rows.find(r => r.id === x.id)?.nic || x.id} (lot ${(x.data() as any).lotNumber})`).join(', ')}. Actualisez la liste.`)
    const cur: ValeursLot = { id: s.id, ...(s.data() as any) }
    const patch = patchOf(cur)
    tx.update(ref, patch)
    const at = new Date().toISOString()
    rows.forEach(r => tx.set(doc(db, 'valeursLotItems', r.id), { lotId, lotNumber: cur.number, nic: r.nic || '', toCity: cur.toCity, createdAt: at, createdById: byId }))
    saved = { ...cur, ...patch }
  })
  return saved!
}

/** Annule un lot : ses expéditions redeviennent disponibles pour un autre lot. */
export async function cancelValeursLot(lot: ValeursLot, by: string, byId: string) {
  const batch = writeBatch(db)
  lot.parcelIds.forEach(id => batch.delete(doc(db, 'valeursLotItems', id)))
  batch.update(doc(db, 'valeursLots', lot.id), { status: 'annule', cancelledAt: new Date().toISOString(), cancelledBy: by, cancelledById: byId })
  await batch.commit()
}
