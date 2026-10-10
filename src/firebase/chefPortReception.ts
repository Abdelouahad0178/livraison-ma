/**
 * 🏢 Chef d'agence EN REMPLACEMENT du chef d'exploitation (absent) : il collecte / reçoit lui-même les
 * ports (port dû, port payé ramassé au guichet) depuis Caisse Agence.
 *
 * Circuit normal : livreur → chef d'exploitation (reçoit) → chef d'agence (valide l'envoi, écrit la caisse).
 * Ici le chef d'agence fait l'étape 2 ET l'étape 3 : la réception est marquée à SON nom avec le rôle
 * « chef_agence » (champs …ExpReceivedRole) et écrit directement en caisse agence (une entrée par expédition,
 * annulable par lui). La Collecte du soir l'affiche « reçu chef d'agence » et ne l'envoie jamais.
 */
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './db'
import { createCaisseEntry, deleteCaisseEntry } from './caisse'
import { collectPortDu, resolveParcelCollection } from './cod'

export interface ChefActor { id: string; name: string; city: string }

const nicOf = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || p.id
const priceOf = (p: any) => Number.parseFloat(String(p.price ?? '').replace(',', '.')) || 0
const refOf = async (p: any) => doc(db, await resolveParcelCollection(p.id, !!p.isArchived), p.id)

/** Port dû : collecté (si pas encore encaissé par le livreur) puis reçu par le chef d'agence → caisse. */
export async function chefReceivePortDu(p: any, by: ChefActor): Promise<Record<string, any>> {
  if (p.portType !== 'port_du' || p.portPayeMethod) throw new Error(`${nicOf(p)} : pas un port dû.`)
  if (p.portChefReceivedAt) throw new Error(`${nicOf(p)} : port dû déjà reçu par le chef d'agence.`)
  const now = new Date().toISOString()
  const received = {
    portExpReceivedAt: now, portExpReceivedBy: by.name, portExpReceivedById: by.id, portExpReceivedRole: 'chef_agence',
    portChefReceivedAt: now, portChefReceivedBy: by.name, portChefReceivedById: by.id,
  }
  const notCollected = p.portStatus !== 'collected' && p.portStatus !== 'received'
  if (notCollected) await collectPortDu(p.id, by.name, by.id, !!p.isArchived, received)
  else await updateDoc(await refOf(p), received)
  // Espèces en caisse (un port dû payé par chèque suit le circuit des chèques)
  let entryId: string | null = null
  if ((notCollected || p.portDuReceivedMethod !== 'cheque') && priceOf(p) > 0) {
    entryId = await createCaisseEntry({
      type: 'entree', category: 'port_du', amount: priceOf(p),
      description: `Port dû reçu par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(p)} (${p.receiver?.name || ''})`,
      reference: p.trackingId || nicOf(p),
      agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
    })
    await updateDoc(await refOf(p), { portCaisseEntryId: entryId })
  }
  return {
    ...received, ...(entryId ? { portCaisseEntryId: entryId } : {}),
    // portCollectedAt : la carte « Collectes par jour » range le port à cette date (affichage immédiat)
    ...(notCollected ? { portStatus: 'collected', portCollectedBy: by.name, portCollectedById: by.id, portCollectedAt: now, portDuReceivedMethod: 'especes' } : {}),
  }
}

/** Annule une réception de port dû faite par MOI (chef d'agence) : entrée de caisse supprimée. */
export async function chefCancelPortDu(p: any, by: ChefActor): Promise<Record<string, any>> {
  if (p.portChefReceivedById !== by.id || p.portExpReceivedRole !== 'chef_agence') {
    throw new Error(`${nicOf(p)} : réception faite par quelqu'un d'autre, annulation impossible ici.`)
  }
  if (p.portCaisseEntryId) await deleteCaisseEntry(p.portCaisseEntryId)
  const reset: Record<string, any> = {
    portExpReceivedAt: null, portExpReceivedBy: null, portExpReceivedById: null, portExpReceivedRole: null,
    portChefReceivedAt: null, portChefReceivedBy: null, portChefReceivedById: null, portCaisseEntryId: null,
  }
  // Collecté par moi au guichet de la caisse : la collecte est annulée aussi (redevient à collecter)
  if (p.portCollectedById === by.id) Object.assign(reset, { portStatus: null, portCollectedBy: null, portCollectedById: null, portCollectedAt: null, portDuReceivedMethod: null })
  await updateDoc(await refOf(p), reset)
  return reset
}

/** Port payé ramassé au guichet : reçu par le chef d'agence → caisse (port payé « reçu »). */
export async function chefReceivePortPaye(p: any, by: ChefActor): Promise<Record<string, any>> {
  if (p.portType !== 'port_paye' || p.portPayeMethod) throw new Error(`${nicOf(p)} : pas un port payé.`)
  if (p.portStatus === 'received') throw new Error(`${nicOf(p)} : port payé déjà reçu.`)
  const now = new Date().toISOString()
  const entryId = priceOf(p) > 0 ? await createCaisseEntry({
    type: 'entree', category: 'port_paye', amount: priceOf(p),
    description: `Port payé ramassé reçu par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(p)} → ${p.destinationCity || ''}`,
    reference: p.trackingId || nicOf(p),
    agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
  }) : null
  const fields = {
    portPayeExpReceivedAt: now, portPayeExpReceivedBy: by.name, portPayeExpReceivedById: by.id, portPayeExpReceivedRole: 'chef_agence',
    portStatus: 'received', portReceivedBy: by.name, portReceivedById: by.id, portReceivedAt: now,
    ...(entryId ? { portCaisseEntryId: entryId } : {}),
  }
  await updateDoc(await refOf(p), fields)
  return fields
}

/** Annule une réception de port payé faite par MOI (chef d'agence) : entrée de caisse supprimée. */
export async function chefCancelPortPaye(p: any, by: ChefActor): Promise<Record<string, any>> {
  if (p.portReceivedById !== by.id || p.portPayeExpReceivedRole !== 'chef_agence') {
    throw new Error(`${nicOf(p)} : réception faite par quelqu'un d'autre, annulation impossible ici.`)
  }
  if (p.portCaisseEntryId) await deleteCaisseEntry(p.portCaisseEntryId)
  const reset = {
    portPayeExpReceivedAt: null, portPayeExpReceivedBy: null, portPayeExpReceivedById: null, portPayeExpReceivedRole: null,
    portStatus: 'collected', portReceivedBy: null, portReceivedById: null, portReceivedAt: null, portCaisseEntryId: null,
  }
  await updateDoc(await refOf(p), reset)
  return reset
}
