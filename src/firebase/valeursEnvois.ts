import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, limit,
} from 'firebase/firestore'
import { db } from './db'
import { createCaisseEntry } from './caisse'
import { remitCod } from './cod'

/**
 * 📤 Envoi de valeurs / espèces : le chef d'exploitation remet au chef d'agence ce qu'il a REÇU des
 * livreurs et de « En gare - ville » (ports dus + COD espèces / chèques / traites + ports payés ramassés
 * au guichet). Le chef d'agence CONTRÔLE puis VALIDE (ou rejette avec motif). Seule la validation écrit
 * en caisse agence — circuit unique livreur → chef d'exploitation → chef d'agence.
 *
 * Collection `valeursEnvois` — statuts : 'envoye' → 'valide' | 'rejete' | 'annule'.
 */
export type ValeurKind = 'port_du' | 'cod' | 'port_paye'
export const VALEUR_KIND_LABEL: Record<ValeurKind, string> = { port_du: 'Port dû', cod: 'COD', port_paye: 'Port payé à ramasser' }
export type ValeurType = 'especes' | 'cheque' | 'traite'

export interface EnvoiItem {
  parcelId: string
  nic: string
  kind: ValeurKind
  type: ValeurType
  amount: number
}

export interface Envoi {
  id: string
  city: string
  status: 'envoye' | 'valide' | 'rejete' | 'annule'
  createdById: string
  createdByName: string
  createdAt?: any
  note?: string
  items: EnvoiItem[]
  totals: Record<ValeurType | 'total', { n: number; amount: number }>
  validatedById?: string
  validatedByName?: string
  validatedAt?: any
  rejectReason?: string
  caisseEntryIds?: string[]
  validationErrors?: string[]
}

export const computeTotals = (items: EnvoiItem[]) => {
  const t: Envoi['totals'] = { especes: { n: 0, amount: 0 }, cheque: { n: 0, amount: 0 }, traite: { n: 0, amount: 0 }, total: { n: 0, amount: 0 } }
  items.forEach(i => {
    t[i.type].n++; t[i.type].amount += i.amount
    t.total.n++; t.total.amount += i.amount
  })
  return t
}

/** Envois récents de la ville (300 derniers). */
export function subscribeEnvois(city: string, cb: (list: Envoi[]) => void, onError: (e: any) => void = () => {}) {
  const q = query(collection(db, 'valeursEnvois'), where('city', '==', city), orderBy('createdAt', 'desc'), limit(300))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Envoi))), onError)
}

export async function createEnvoi(p: { city: string; byId: string; byName: string; items: EnvoiItem[]; note?: string }) {
  if (p.items.length === 0) throw new Error('Aucune valeur à envoyer.')
  const ref = await addDoc(collection(db, 'valeursEnvois'), {
    city: p.city,
    status: 'envoye',
    createdById: p.byId,
    createdByName: p.byName,
    createdAt: serverTimestamp(),
    note: p.note || '',
    items: p.items,
    totals: computeTotals(p.items),
  })
  return ref.id
}

export async function cancelEnvoi(id: string) {
  await updateDoc(doc(db, 'valeursEnvois', id), { status: 'annule' })
}

export async function rejectEnvoi(id: string, reason: string, by: { id: string; name: string }) {
  if (!reason.trim()) throw new Error('Le motif du rejet est obligatoire.')
  await updateDoc(doc(db, 'valeursEnvois', id), {
    status: 'rejete', rejectReason: reason.trim(), validatedById: by.id, validatedByName: by.name, validatedAt: serverTimestamp(),
  })
}

/** Écrit `fields` sur chaque expédition de l'envoi (parcels, sinon parcels_archive) — sautée si déjà faite. */
async function markEach(items: EnvoiItem[], errors: string[], done: (p: any) => boolean, fields: Record<string, unknown>) {
  for (const it of items) {
    try {
      const snap = await getDoc(doc(db, 'parcels', it.parcelId))
      if (snap.exists() && done(snap.data())) continue // ré-essai
      await updateDoc(doc(db, snap.exists() ? 'parcels' : 'parcels_archive', it.parcelId), fields)
    } catch (e: any) {
      errors.push(`${it.nic} : ${e?.message || e}`)
    }
  }
}

/**
 * ✅ Validation par le chef d'agence : réception des COD (comme CodTab.handleReceptionCod : remise du
 * COD, écriture en caisse pour les espèces si pas déjà faite) + écriture en caisse des ports dus
 * espèces de l'envoi. Les erreurs par valeur sont collectées ; l'envoi n'est marqué « validé » que si
 * tout est passé, sinon il reste « envoyé » avec la liste des erreurs (ré-essai possible, idempotent).
 */
export async function validateEnvoi(envoi: Envoi, by: { id: string; name: string; city: string }) {
  const errors: string[] = []
  const caisseEntryIds: string[] = [...(envoi.caisseEntryIds || [])]
  const now = new Date().toISOString()

  // 1) COD : remise chez le chef d'agence
  // Espèces d'abord : pour un RF mixte (2 lignes pour le même colis), l'entrée de caisse
  // espèces doit être créée AVANT que la remise ne passe le colis en 'remis'.
  const codItems = envoi.items.filter(i => i.kind === 'cod')
    .sort((a, b) => (a.type === 'especes' ? 0 : 1) - (b.type === 'especes' ? 0 : 1))
  for (const it of codItems) {
    try {
      const snap = await getDoc(doc(db, 'parcels', it.parcelId))
      if (!snap.exists()) { errors.push(`${it.nic} : colis introuvable`); continue }
      const p: any = snap.data()
      if (p.codStatus === 'remis' || p.codStatus === 'regle') continue // déjà reçu (ré-essai)
      let codCaisseEntryId = p.codCaisseEntryId || null
      if (it.type === 'especes' && !codCaisseEntryId) {
        codCaisseEntryId = await createCaisseEntry({
          type: 'entree', category: 'cod_agent', amount: it.amount,
          description: `RETOUR FOND espèces validé (envoi chef d'exploitation ${envoi.createdByName}) — ${p.trackingId || it.nic} (${p.receiver?.name || ''})`,
          reference: p.trackingId || it.nic,
          agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
        })
        caisseEntryIds.push(codCaisseEntryId)
      }
      await remitCod(it.parcelId, by.name, {
        codReceivedByChef: true, codReceivedByChefAt: now, codReceivedByChefBy: by.name,
        codChefReceivedAt: now, codChefReceivedBy: by.name, codChefReceivedById: by.id,
        codStatusBeforeRemise: p.codStatus || 'pending',
        valeursEnvoiId: envoi.id,
        ...(codCaisseEntryId ? { codCaisseEntryId } : {}),
      })
    } catch (e: any) {
      errors.push(`${it.nic} : ${e?.message || e}`)
    }
  }

  // 2) Ports dus (espèces) : une écriture de caisse globale, une seule fois
  // Seuls les ports dus ESPÈCES entrent en caisse (un port dû chèque suit le circuit des chèques)
  const ports = envoi.items.filter(i => i.kind === 'port_du' && (i.type || 'especes') === 'especes')
  const portTotal = ports.reduce((s, i) => s + i.amount, 0)
  if (ports.length > 0 && portTotal > 0 && !(envoi.caisseEntryIds || []).some(id => id.startsWith('port:'))) {
    try {
      const id = await createCaisseEntry({
        type: 'entree', category: 'port_du', amount: portTotal,
        description: `Ports dus espèces validés (envoi chef d'exploitation ${envoi.createdByName}) — ${ports.length} expédition(s)`,
        reference: envoi.id,
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      })
      caisseEntryIds.push(`port:${id}`)
    } catch (e: any) {
      errors.push(`Ports dus : ${e?.message || e}`)
    }
  }
  // Chaque port dû de l'envoi (espèces et chèque) : reçu par le chef d'agence
  await markEach(envoi.items.filter(i => i.kind === 'port_du'), errors, p => !!p.portChefReceivedAt,
    { portChefReceivedAt: now, portChefReceivedBy: by.name, portChefReceivedById: by.id, valeursEnvoiId: envoi.id })

  // 3) Ports payés ramassés au guichet : une écriture de caisse globale (ils ne sont plus écrits en
  // caisse à la création), puis chaque expédition passe « reçu » par le chef d'agence
  const pps = envoi.items.filter(i => i.kind === 'port_paye')
  const ppTotal = pps.reduce((s, i) => s + i.amount, 0)
  if (pps.length > 0 && ppTotal > 0 && !(envoi.caisseEntryIds || []).some(id => id.startsWith('pp:'))) {
    try {
      const id = await createCaisseEntry({
        type: 'entree', category: 'port_paye', amount: ppTotal,
        description: `Ports payés à ramasser validés (envoi chef d'exploitation ${envoi.createdByName}) — ${pps.length} expédition(s)`,
        reference: envoi.id,
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      })
      caisseEntryIds.push(`pp:${id}`)
    } catch (e: any) {
      errors.push(`Ports payés : ${e?.message || e}`)
    }
  }
  await markEach(pps, errors, p => p.portStatus === 'received',
    { portStatus: 'received', portReceivedBy: by.name, portReceivedById: by.id, portReceivedAt: now, valeursEnvoiId: envoi.id })

  if (errors.length > 0) {
    await updateDoc(doc(db, 'valeursEnvois', envoi.id), { validationErrors: errors, caisseEntryIds })
    throw new Error(`${errors.length} valeur(s) en erreur : ${errors.slice(0, 5).join(' | ')}`)
  }
  await updateDoc(doc(db, 'valeursEnvois', envoi.id), {
    status: 'valide', validatedById: by.id, validatedByName: by.name, validatedAt: serverTimestamp(),
    caisseEntryIds, validationErrors: [],
  })
}
