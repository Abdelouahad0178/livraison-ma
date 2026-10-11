import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, limit,
} from 'firebase/firestore'
import { db } from './db'
import { caisseEntryDoc } from './caisse'

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

/** Expédition de l'envoi (parcels, sinon parcels_archive), relue au moment de la validation. */
async function readEnvoiParcel(parcelId: string): Promise<{ ref: any; data: any } | null> {
  const live = await getDoc(doc(db, 'parcels', parcelId))
  if (live.exists()) return { ref: live.ref, data: live.data() }
  const arch = await getDoc(doc(db, 'parcels_archive', parcelId))
  return arch.exists() ? { ref: arch.ref, data: arch.data() } : null
}

/**
 * Ports (dus ou payés) de l'envoi : relit chaque expédition et écarte celles DÉJÀ reçues directement par le chef
 * d'agence en dehors de cet envoi (Caisse Agence) — leur argent est déjà en caisse : les recompter dans l'entrée
 * globale de l'envoi le ferait entrer deux fois. Une écriture de caisse globale à IDENTIFIANT FIXE
 * (envoi_<id>_<suffixe>) : une validation relancée ou faite deux fois la réécrit au lieu d'en créer une autre.
 */
async function validatePorts(
  envoi: Envoi, items: EnvoiItem[], errors: string[], caisseEntryIds: string[],
  opts: {
    suffix: 'port' | 'pp'; legacyPrefix: string; label: string; category: string; countInCaisse: (it: EnvoiItem) => boolean
    receivedElsewhere: (p: any) => boolean; alreadyMarked: (p: any) => boolean; fields: Record<string, unknown>
    by: { id: string; name: string; city: string }
  },
) {
  const toMark: { it: EnvoiItem; ref: any }[] = []
  let total = 0, n = 0
  for (const it of items) {
    try {
      const r = await readEnvoiParcel(it.parcelId)
      if (!r) { errors.push(`${it.nic} : colis introuvable`); continue }
      if (opts.receivedElsewhere(r.data)) continue // déjà en caisse par une réception directe du chef d'agence
      if (opts.countInCaisse(it)) { total += it.amount; n++ }
      if (!opts.alreadyMarked(r.data)) toMark.push({ it, ref: r.ref })
    } catch (e: any) {
      errors.push(`${it.nic} : ${e?.message || e}`)
    }
  }
  // Ancien envoi déjà partiellement validé avant ce correctif (entrée à identifiant aléatoire) : ne pas la recréer
  const legacy = (envoi.caisseEntryIds || []).some(id => id.startsWith(opts.legacyPrefix) && !id.includes(`envoi_${envoi.id}_`))
  if (total > 0 && !legacy) {
    const entryId = `envoi_${envoi.id}_${opts.suffix}`
    try {
      await setDoc(doc(db, 'caisseEntries', entryId), caisseEntryDoc({
        type: 'entree', category: opts.category, amount: total,
        description: `${opts.label} validés (envoi chef d'exploitation ${envoi.createdByName}) — ${n} expédition(s)`,
        reference: envoi.id,
        agentId: opts.by.id, agentName: opts.by.name, city: opts.by.city, cashierId: opts.by.id, cashierName: opts.by.name,
      }))
      const tag = `${opts.legacyPrefix}${entryId}`
      if (!caisseEntryIds.includes(tag)) caisseEntryIds.push(tag)
    } catch (e: any) {
      errors.push(`${opts.label} : ${e?.message || e}`)
      return // pas de marquage sans écriture de caisse : tout sera repris au prochain essai
    }
  }
  for (const { it, ref } of toMark) {
    try { await updateDoc(ref, opts.fields as any) } catch (e: any) { errors.push(`${it.nic} : ${e?.message || e}`) }
  }
}

/**
 * ✅ Validation par le chef d'agence : réception des COD (remise + écriture en caisse de la part espèces) et
 * écriture en caisse des ports dus espèces et des ports payés ramassés de l'envoi.
 * 🔒 Fiable et rejouable : statut de l'envoi relu (un envoi déjà traité est refusé) ; chaque COD est UNE transaction
 * par expédition (remise + entrée de caisse ensemble, parts d'un COD mixte comprises) ; entrées de caisse à
 * identifiant fixe → aucun doublon en cas de nouvel essai, de double clic ou de validation sur deux appareils.
 * L'envoi n'est marqué « validé » que si tout est passé, sinon il reste « envoyé » avec la liste des erreurs.
 */
export async function validateEnvoi(envoi: Envoi, by: { id: string; name: string; city: string }) {
  const envoiSnap = await getDoc(doc(db, 'valeursEnvois', envoi.id))
  const status = envoiSnap.exists() ? (envoiSnap.data() as any).status : null
  if (status !== 'envoye') throw new Error(`Envoi déjà traité (statut : ${status || 'introuvable'}). Actualisez la page.`)
  const errors: string[] = []
  const caisseEntryIds: string[] = [...(envoi.caisseEntryIds || [])]
  const now = new Date().toISOString()

  // 1) COD : une transaction par expédition (toutes ses parts : espèces + chèque/traite d'un COD mixte)
  const codByParcel = new Map<string, EnvoiItem[]>()
  envoi.items.filter(i => i.kind === 'cod').forEach(i => codByParcel.set(i.parcelId, [...(codByParcel.get(i.parcelId) || []), i]))
  for (const [parcelId, its] of codByParcel) {
    try {
      const entryId = await runTransaction(db, async tx => {
        const ref = doc(db, 'parcels', parcelId)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('colis introuvable')
        const p: any = snap.data()
        if (p.codStatus === 'remis' || p.codStatus === 'regle') return null // déjà reçu (ré-essai, ou reçu directement)
        const cash = its.filter(i => i.type === 'especes').reduce((s, i) => s + i.amount, 0)
        let eid: string | null = p.codCaisseEntryId || null
        const created = cash > 0 && !eid
        if (created) {
          eid = `envoi_${envoi.id}_cod_${parcelId}`
          tx.set(doc(db, 'caisseEntries', eid), caisseEntryDoc({
            type: 'entree', category: 'cod_agent', amount: cash,
            description: `RETOUR FOND espèces validé (envoi chef d'exploitation ${envoi.createdByName}) — ${p.trackingId || its[0].nic} (${p.receiver?.name || ''})`,
            reference: p.trackingId || its[0].nic,
            agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
          }))
        }
        tx.update(ref, {
          codStatus: 'remis', codRemisAt: now, codRemisBy: by.name,
          codReceivedByChef: true, codReceivedByChefAt: now, codReceivedByChefBy: by.name,
          codChefReceivedAt: now, codChefReceivedBy: by.name, codChefReceivedById: by.id,
          codStatusBeforeRemise: p.codStatus || 'pending',
          valeursEnvoiId: envoi.id,
          ...(eid ? { codCaisseEntryId: eid } : {}),
        })
        return created ? eid : null
      })
      if (entryId && !caisseEntryIds.includes(entryId)) caisseEntryIds.push(entryId)
    } catch (e: any) {
      errors.push(`${its[0].nic} : ${e?.message || e}`)
    }
  }

  // 2) Ports dus : seuls les ESPÈCES entrent en caisse (un port dû chèque suit le circuit des chèques) ;
  //    chaque port dû de l'envoi (espèces et chèque) passe « reçu par le chef d'agence »
  await validatePorts(envoi, envoi.items.filter(i => i.kind === 'port_du'), errors, caisseEntryIds, {
    suffix: 'port', legacyPrefix: 'port:', label: 'Ports dus espèces', category: 'port_du', by,
    countInCaisse: it => (it.type || 'especes') === 'especes',
    receivedElsewhere: p => !!p.portChefReceivedAt && p.valeursEnvoiId !== envoi.id,
    alreadyMarked: p => !!p.portChefReceivedAt,
    fields: { portChefReceivedAt: now, portChefReceivedBy: by.name, portChefReceivedById: by.id, valeursEnvoiId: envoi.id },
  })

  // 3) Ports payés ramassés au guichet : écriture de caisse globale, puis chaque expédition passe « reçu »
  await validatePorts(envoi, envoi.items.filter(i => i.kind === 'port_paye'), errors, caisseEntryIds, {
    suffix: 'pp', legacyPrefix: 'pp:', label: 'Ports payés à ramasser', category: 'port_paye', by,
    countInCaisse: () => true,
    receivedElsewhere: p => p.portStatus === 'received' && p.valeursEnvoiId !== envoi.id,
    alreadyMarked: p => p.portStatus === 'received',
    fields: { portStatus: 'received', portReceivedBy: by.name, portReceivedById: by.id, portReceivedAt: now, valeursEnvoiId: envoi.id },
  })

  if (errors.length > 0) {
    await updateDoc(doc(db, 'valeursEnvois', envoi.id), { validationErrors: errors, caisseEntryIds })
    throw new Error(`${errors.length} valeur(s) en erreur : ${errors.slice(0, 5).join(' | ')}`)
  }
  await updateDoc(doc(db, 'valeursEnvois', envoi.id), {
    status: 'valide', validatedById: by.id, validatedByName: by.name, validatedAt: serverTimestamp(),
    caisseEntryIds, validationErrors: [],
  })
}
