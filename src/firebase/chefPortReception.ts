/**
 * 🏢 Chef d'agence EN REMPLACEMENT du chef d'exploitation (absent) : il collecte / reçoit lui-même les
 * ports (port dû, port payé ramassé au guichet) et les COD depuis Caisse Agence / l'onglet COD.
 *
 * Circuit normal : livreur → chef d'exploitation (reçoit) → chef d'agence (valide l'envoi, écrit la caisse).
 * Ici le chef d'agence fait l'étape 2 ET l'étape 3 : la réception est marquée à SON nom avec le rôle
 * « chef_agence » (champs …ExpReceivedRole) et écrit directement en caisse agence (une entrée par expédition,
 * annulable par lui). La Collecte du soir l'affiche « reçu chef d'agence » et ne l'envoie jamais.
 *
 * 🔒 Fiabilité de l'argent : chaque réception / annulation est UNE transaction Firestore — l'expédition est RELUE
 * (jamais l'état d'un écran pas à jour) et l'entrée de caisse est écrite / supprimée DANS la même opération :
 * - jamais d'argent en caisse sans réception enregistrée, ni de réception sans argent en caisse ;
 * - une réception déjà faite (par moi, ou par le chef d'exploitation qui l'a mise dans son envoi) est REFUSÉE,
 *   sinon le même argent entrait deux fois en caisse (ici, puis à la validation de l'envoi).
 */
import { doc, runTransaction, Timestamp } from 'firebase/firestore'
import { db } from './db'
import { caisseEntryDoc, newCaisseEntryRef } from './caisse'
import { coherentCodPaymentType, resolveParcelCollection } from './cod'
import { codPaymentTypeOf } from './constants'
import { codCashPartOf, isMixedCod } from '../utils/codParts'
import { markDeliveredAfterCollect } from './parcels'
import { bumpPresence } from '../services/presenceCounters'

export interface ChefActor { id: string; name: string; city: string }

const nicOf = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || p.id
const priceOf = (p: any) => Number.parseFloat(String(p.price ?? '').replace(',', '.')) || 0
const parcelRefOf = async (p: any) => doc(db, await resolveParcelCollection(p.id, !!p.isArchived), p.id)
const ENVOI_MSG = "elle arrivera par son envoi (onglet « Valeurs à valider »)"

/** Port dû : collecté (si pas encore encaissé par le livreur) puis reçu par le chef d'agence → caisse. */
export async function chefReceivePortDu(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = await parcelRefOf(p)
  const entryRef = newCaisseEntryRef()
  const now = new Date().toISOString()
  const received = {
    portExpReceivedAt: now, portExpReceivedBy: by.name, portExpReceivedById: by.id, portExpReceivedRole: 'chef_agence',
    portChefReceivedAt: now, portChefReceivedBy: by.name, portChefReceivedById: by.id,
  }
  const out = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.portType !== 'port_du' || cur.portPayeMethod) throw new Error(`${nicOf(p)} : pas un port dû.`)
    if (cur.portChefReceivedAt) throw new Error(`${nicOf(p)} : port dû déjà reçu par le chef d'agence${cur.portChefReceivedBy ? ` (${cur.portChefReceivedBy})` : ''}.`)
    if (cur.portExpReceivedAt && cur.portExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : port dû déjà reçu par le chef d'exploitation${cur.portExpReceivedBy ? ` (${cur.portExpReceivedBy})` : ''} — ${ENVOI_MSG}.`)
    }
    const notCollected = cur.portStatus !== 'collected' && cur.portStatus !== 'received'
    // Espèces en caisse (un port dû payé par chèque suit le circuit des chèques)
    const withEntry = (notCollected || cur.portDuReceivedMethod !== 'cheque') && priceOf(cur) > 0
    if (withEntry) {
      tx.set(entryRef, caisseEntryDoc({
        type: 'entree', category: 'port_du', amount: priceOf(cur),
        description: `Port dû reçu par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(cur)} (${cur.receiver?.name || ''})`,
        reference: cur.trackingId || nicOf(cur),
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      }))
    }
    tx.update(ref, {
      ...(notCollected ? { portStatus: 'collected', portCollectedBy: by.name, portCollectedById: by.id, portCollectedAt: Timestamp.now(), portDuReceivedMethod: 'especes' } : {}),
      ...received,
      ...(withEntry ? { portCaisseEntryId: entryRef.id } : {}),
    })
    return { notCollected, withEntry }
  })
  const delivered = await markDeliveredAfterCollect(p, by.name, 'port dû')
  return {
    ...received, ...(out.withEntry ? { portCaisseEntryId: entryRef.id } : {}), ...(delivered || {}),
    // portCollectedAt : la carte « Collectes par jour » range le port à cette date (affichage immédiat)
    ...(out.notCollected ? { portStatus: 'collected', portCollectedBy: by.name, portCollectedById: by.id, portCollectedAt: now, portDuReceivedMethod: 'especes' } : {}),
  }
}

/** Annule une réception de port dû faite par MOI (chef d'agence) : entrée de caisse supprimée dans la même opération. */
export async function chefCancelPortDu(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = await parcelRefOf(p)
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.portChefReceivedById !== by.id || cur.portExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : réception faite par quelqu'un d'autre, annulation impossible ici.`)
    }
    const reset: Record<string, any> = {
      portExpReceivedAt: null, portExpReceivedBy: null, portExpReceivedById: null, portExpReceivedRole: null,
      portChefReceivedAt: null, portChefReceivedBy: null, portChefReceivedById: null, portCaisseEntryId: null,
    }
    // Collecté par moi au guichet de la caisse : la collecte est annulée aussi (redevient à collecter)
    if (cur.portCollectedById === by.id) Object.assign(reset, { portStatus: null, portCollectedBy: null, portCollectedById: null, portCollectedAt: null, portDuReceivedMethod: null })
    if (cur.portCaisseEntryId) tx.delete(doc(db, 'caisseEntries', cur.portCaisseEntryId))
    tx.update(ref, reset)
    return reset
  })
}

/** Port payé ramassé au guichet : reçu par le chef d'agence → caisse (port payé « reçu »). */
export async function chefReceivePortPaye(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = await parcelRefOf(p)
  const entryRef = newCaisseEntryRef()
  const now = new Date().toISOString()
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.portType !== 'port_paye' || cur.portPayeMethod) throw new Error(`${nicOf(p)} : pas un port payé.`)
    if (cur.portStatus === 'received') throw new Error(`${nicOf(p)} : port payé déjà reçu.`)
    if (cur.portPayeExpReceivedAt && cur.portPayeExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : port payé déjà remis au chef d'exploitation${cur.portPayeExpReceivedBy ? ` (${cur.portPayeExpReceivedBy})` : ''} — ${ENVOI_MSG}.`)
    }
    const withEntry = priceOf(cur) > 0
    if (withEntry) {
      tx.set(entryRef, caisseEntryDoc({
        type: 'entree', category: 'port_paye', amount: priceOf(cur),
        description: `Port payé ramassé reçu par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(cur)} → ${cur.destinationCity || ''}`,
        reference: cur.trackingId || nicOf(cur),
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      }))
    }
    const fields = {
      portPayeExpReceivedAt: now, portPayeExpReceivedBy: by.name, portPayeExpReceivedById: by.id, portPayeExpReceivedRole: 'chef_agence',
      portStatus: 'received', portReceivedBy: by.name, portReceivedById: by.id, portReceivedAt: now,
      ...(withEntry ? { portCaisseEntryId: entryRef.id } : {}),
    }
    tx.update(ref, fields)
    return fields
  })
}

/** Annule une réception de port payé faite par MOI (chef d'agence) : entrée de caisse supprimée dans la même opération. */
export async function chefCancelPortPaye(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = await parcelRefOf(p)
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.portReceivedById !== by.id || cur.portPayeExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : réception faite par quelqu'un d'autre, annulation impossible ici.`)
    }
    const reset = {
      portPayeExpReceivedAt: null, portPayeExpReceivedBy: null, portPayeExpReceivedById: null, portPayeExpReceivedRole: null,
      portStatus: 'collected', portReceivedBy: null, portReceivedById: null, portReceivedAt: null, portCaisseEntryId: null,
    }
    if (cur.portCaisseEntryId) tx.delete(doc(db, 'caisseEntries', cur.portCaisseEntryId))
    tx.update(ref, reset)
    return reset
  })
}

// ── COD (RETOUR FOND) ────────────────────────────────────────────────────────

/** Le RETOUR FOND comporte-t-il une part espèces (espèces seules, ou mixte) ? — comme l'onglet COD. */
const codHasCash = (p: any) => {
  const pt = codPaymentTypeOf(p) || 'especes'
  return !['cheque', 'traite', 'bon_livraison', 'retour_bl'].includes(pt) || isMixedCod(p)
}

/**
 * COD : collecté (si pas encore encaissé par le livreur) puis reçu par le chef d'agence → caisse (part espèces).
 * Même enregistrement que la réception de l'onglet COD (codStatus « remis », rôle « chef_agence ») ; la collecte
 * pose codCollectedAt → la valeur apparaît dans « Valeurs (COD) collectées par jour » au jour de la collecte.
 * Utilisée par Caisse Agence, l'onglet COD (« Encaisser ») et l'onglet Livreurs.
 */
export async function chefReceiveCod(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = doc(db, 'parcels', p.id)
  const entryRef = newCaisseEntryRef()
  const now = new Date().toISOString()
  const out = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.codStatus === 'remis' || cur.codStatus === 'regle') throw new Error(`${nicOf(p)} : valeur déjà reçue par le chef d'agence.`)
    if (cur.codStatus === 'collected' && cur.codExpReceivedAt && cur.codExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : valeur déjà reçue par le chef d'exploitation — ${ENVOI_MSG}.`)
    }
    const notCollected = !cur.codStatus || cur.codStatus === 'pending'
    const cash = codHasCash(cur) ? codCashPartOf(cur) : 0
    if (cash > 0) {
      tx.set(entryRef, caisseEntryDoc({
        type: 'entree', category: 'cod_agent', amount: cash,
        description: `RETOUR FOND espèces ${notCollected ? 'collecté' : 'reçu'} par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(cur)} (${cur.receiver?.name || ''})`,
        reference: cur.trackingId || nicOf(cur),
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      }))
    }
    const collected = notCollected
      ? { codPaymentType: coherentCodPaymentType(cur, codPaymentTypeOf(cur) || 'especes'), codCollectedAt: now, codCollectedBy: by.name, codCollectedById: by.id }
      : {}
    const fields = {
      codReceivedByChef: true, codReceivedByChefAt: now, codReceivedByChefBy: by.name,
      codChefReceivedAt: now, codChefReceivedBy: by.name, codChefReceivedById: by.id,
      codStatusBeforeRemise: 'collected',
      ...(cash > 0 ? { codCaisseEntryId: entryRef.id } : {}),
      codExpReceivedAt: now, codExpReceivedBy: by.name, codExpReceivedById: by.id, codExpReceivedRole: 'chef_agence',
    }
    tx.update(ref, { ...collected, codStatus: 'remis', codRemisAt: now, codRemisBy: by.name, ...fields })
    return { fields, collected, notCollected }
  })
  if (out.notCollected) bumpPresence('cod')
  const delivered = await markDeliveredAfterCollect(p, by.name, 'COD')
  return {
    ...out.fields, ...out.collected, codStatus: 'remis', codRemisAt: now, codRemisBy: by.name, ...(delivered || {}),
  }
}

/**
 * Annule une réception de COD faite par MOI (chef d'agence) : remise annulée, entrée de caisse supprimée et, si c'est
 * moi qui l'avais collectée, collecte annulée — le tout en une seule opération. Refusé si la valeur a déjà quitté
 * l'agence (réglée à l'expéditeur, versée au compte société, envoyée à l'agence source).
 */
export async function chefCancelCod(p: any, by: ChefActor): Promise<Record<string, any>> {
  const ref = doc(db, 'parcels', p.id)
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.codExpReceivedRole !== 'chef_agence' || cur.codChefReceivedById !== by.id) {
      throw new Error(`${nicOf(p)} : réception faite par quelqu'un d'autre, annulation impossible ici.`)
    }
    if (cur.codStatus !== 'remis') throw new Error("Ce RETOUR FOND n'est pas encaissé.")
    if (cur.codSenderPaid) throw new Error("Déjà réglé à l'expéditeur — annulation impossible.")
    if (cur.centralDeposited) throw new Error('Déjà versé au compte société — annulation impossible.')
    if (cur.codSentToSource) throw new Error("Déjà envoyé à l'agence source — annulation impossible.")
    const mine = cur.codCollectedById === by.id
    const restored: Record<string, any> = {
      codStatus: mine ? 'pending' : (cur.codStatusBeforeRemise || 'collected'),
      codRemisAt: null, codRemisBy: null,
      codReceivedByChef: false, codReceivedByChefAt: null, codReceivedByChefBy: null,
      codChefReceivedAt: null, codChefReceivedBy: null, codChefReceivedById: null,
      codCaisseEntryId: null,
      codRemiseCancelledAt: new Date().toISOString(), codRemiseCancelledBy: by.name, codRemiseCancelledById: by.id,
      codExpReceivedAt: null, codExpReceivedBy: null, codExpReceivedById: null, codExpReceivedRole: null,
      // Collectée par moi depuis la caisse : la collecte est annulée aussi (redevient à collecter)
      ...(mine ? { codCollectedAt: null, codCollectedBy: null, codCollectedById: null } : {}),
    }
    if (cur.codCaisseEntryId) tx.delete(doc(db, 'caisseEntries', cur.codCaisseEntryId))
    tx.update(ref, restored)
    return restored
  })
}
