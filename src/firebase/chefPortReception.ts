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
import { arrayUnion, doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore'
import { isCodMoneyBeforeStart, isPortDuMoneyBeforeStart } from '../utils/moneyFlow'
import { db } from './db'
import { caisseEntryDoc, newCaisseEntryRef } from './caisse'
import { coherentCodPaymentType, resolveParcelCollection } from './cod'
import { codPaymentTypeOf } from './constants'
import { codCashPartOf, isMixedCod } from '../utils/codParts'
import { assertCanCollectHere, assertCollectAllowedStatus, markDeliveredAfterCollect, undoAutoDeliveryAfterUncollect } from './parcels'
import { bumpPresence } from '../services/presenceCounters'

export interface ChefActor { id: string; name: string; city: string }

const nicOf = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || p.id
const priceOf = (p: any) => Number.parseFloat(String(p.price ?? '').replace(',', '.')) || 0
const parcelRefOf = async (p: any) => doc(db, await resolveParcelCollection(p.id, !!p.isArchived), p.id)
const ENVOI_MSG = "elle arrivera par son envoi (onglet « Valeurs à valider »)"

// 🔗 PORT DÛ ⇄ COD ESPÈCES ENSEMBLE (demande de l'admin, 20/10/2026) — même règle que la page Chef d'exploitation
// (pages/exploitation/exploitationActions) : collecter / recevoir l'un fait aussi l'autre, puis « Livré » d'un coup.
// Concerné : port dû espèces (portType « port_du ») + COD 100 % espèces (ni chèque / traite, ni mixte). État RELU.
const linkedCashCod = (c: any) => !c?.isArchived && (Number.parseFloat(String(c?.codAmount ?? '')) || 0) > 0 && !isMixedCod(c)
  && (codPaymentTypeOf(c) || 'especes') === 'especes' && !c.wasReturned && !c.returnedAt && c.status !== 'Retourné'
const linkedPortDu = (c: any) => c?.portType === 'port_du' && !c.portPayeMethod
/** COD encore à collecter / recevoir par le chef d'agence (ni déjà reçu, ni chez le chef d'exploitation, ni d'avant le 05/10). */
const codOpenForChef = (c: any) => c.codStatus !== 'remis' && c.codStatus !== 'regle' && !isCodMoneyBeforeStart(c)
  && !(c.codStatus === 'collected' && c.codExpReceivedAt && c.codExpReceivedRole !== 'chef_agence')
const portOpenForChef = (c: any) => !c.portChefReceivedAt && !isPortDuMoneyBeforeStart(c)
  && !(c.portExpReceivedAt && c.portExpReceivedRole !== 'chef_agence')
const readParcel = async (p: any) => {
  const snap = await getDoc(await parcelRefOf(p))
  return snap.exists() ? { id: snap.id, isArchived: !!p.isArchived, ...snap.data() } as any : null
}
/** Champs renvoyés à l'écran (mise à jour immédiate) : sans l'ajout d'historique (valeur spéciale Firestore, pas un tableau). */
const withoutHistory = (o: Record<string, any>) => { const { history: _h, ...rest } = o || {}; void _h; return rest }
/** Collecte liée : une erreur n'annule pas la collecte principale (déjà faite) — elle est signalée (linkedError). */
async function runLinked(label: string, fn: () => Promise<Record<string, any>>): Promise<Record<string, any>> {
  try { return await fn() } catch (e: any) {
    console.warn('collecte liée', e)
    return { linkedError: `${label} lié(e) NON encaissé(e) : ${e?.message || e}` }
  }
}

/** 🔗 Annulation liée : la partie liée a-t-elle été reçue par MOI (chef d'agence) ? Peut-elle encore être annulée ? */
const codMineForChef = (c: any, by: ChefActor) => c.codStatus === 'remis' && c.codExpReceivedRole === 'chef_agence' && c.codChefReceivedById === by.id
const codLockReason = (c: any) => c.valeursEnvoiId ? "reçu par un envoi validé" : c.codSenderPaid ? "déjà réglé à l'expéditeur"
  : c.centralDeposited ? 'déjà versé au compte société' : c.codSentToSource ? "déjà envoyé à l'agence source" : ''
const portMineForChef = (c: any, by: ChefActor) => c.portExpReceivedRole === 'chef_agence' && c.portChefReceivedById === by.id

/** Port dû : collecté (si pas encore encaissé par le livreur) puis reçu par le chef d'agence → caisse. */
export async function chefReceivePortDu(p: any, by: ChefActor, linked = true): Promise<Record<string, any>> {
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
    // 🔒 Port dû : encaissé / reçu par l'agence de DESTINATION seulement (même règle que collectPortDu — diagnostic du
    // 24/10/2026, point 1.5 : 1113806D, 1073294D pour Casablanca reçus par le chef d'agence d'Ait Melloul)
    await assertCanCollectHere(cur, 'port dû')
    if (cur.portChefReceivedAt) throw new Error(`${nicOf(p)} : port dû déjà reçu par le chef d'agence${cur.portChefReceivedBy ? ` (${cur.portChefReceivedBy})` : ''}.`)
    if (cur.portExpReceivedAt && cur.portExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : port dû déjà reçu par le chef d'exploitation${cur.portExpReceivedBy ? ` (${cur.portExpReceivedBy})` : ''} — ${ENVOI_MSG}.`)
    }
    const notCollected = cur.portStatus !== 'collected' && cur.portStatus !== 'received'
    // Pas de collecte NI de réception sans livraison — même si le port était déjà « encaissé » (diagnostic du
    // 24/10/2026, point 1.4 : 1077852D « Initialisé », 1057734 « En transit » reçus le 15/10)
    assertCollectAllowedStatus(cur)
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
  let codFields: Record<string, any> = {}
  if (linked) {
    const cur = await readParcel(p)
    if (cur && linkedPortDu(cur) && linkedCashCod(cur) && codOpenForChef(cur)) codFields = await runLinked('COD espèces', () => chefReceiveCod(cur, by, false))
  }
  const delivered = linked ? await markDeliveredAfterCollect(p, by.name, Object.keys(codFields).length && !codFields.linkedError ? 'port dû + COD' : 'port dû') : null
  return {
    ...codFields,
    ...received, ...(out.withEntry ? { portCaisseEntryId: entryRef.id } : {}), ...(delivered || {}),
    // portCollectedAt : la carte « Collectes par jour » range le port à cette date (affichage immédiat)
    ...(out.notCollected ? { portStatus: 'collected', portCollectedBy: by.name, portCollectedById: by.id, portCollectedAt: now, portDuReceivedMethod: 'especes' } : {}),
  }
}

/** Annule une réception de port dû faite par MOI (chef d'agence) : entrée de caisse supprimée dans la même opération. */
export async function chefCancelPortDu(p: any, by: ChefActor, linked = true): Promise<Record<string, any>> {
  const ref = await parcelRefOf(p)
  // 🔗 COD espèces lié reçu par moi : annulé aussi — refus AVANT toute écriture s'il ne peut plus l'être
  const before = linked ? await readParcel(p) : null
  const codLinked = !!before && linkedPortDu(before) && linkedCashCod(before) && codMineForChef(before, by)
  if (codLinked && codLockReason(before)) throw new Error(`${nicOf(p)} : annulation impossible — le RETOUR FOND espèces lié est ${codLockReason(before)}.`)
  const reset = await runTransaction(db, async tx => {
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
  // ↩️ Livraison mise automatiquement par cette collecte : annulée aussi (statut + date de livraison)
  const undone = reset.portStatus === null ? await undoAutoDeliveryAfterUncollect(ref.id, by.name).catch(() => null) : null
  const codFields = codLinked ? await runLinked('Annulation du RETOUR FOND', () => chefCancelCod(before, by, false)) : {}
  return { ...reset, ...(undone || {}), ...codFields }
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
/**
 * ✂️ `splitCash` : collecte d'un COD chèque / traite PAS ENCORE collecté, payé en partie EN ESPÈCES par le destinataire →
 * le COD devient MIXTE (codMixed, codCashAmount = part espèces, total inchangé) ; seule la part espèces entre en caisse,
 * la part chèque / traite part chez l'encaisseur central.
 */
export async function chefReceiveCod(p: any, by: ChefActor, linked = true, splitCash?: number): Promise<Record<string, any>> {
  const ref = doc(db, 'parcels', p.id)
  const entryRef = newCaisseEntryRef()
  const now = new Date().toISOString()
  const out = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error(`${nicOf(p)} : expédition introuvable.`)
    const cur: any = snap.data()
    if (cur.codStatus === 'remis' || cur.codStatus === 'regle') throw new Error(`${nicOf(p)} : valeur déjà reçue par le chef d'agence.`)
    // 🔒 COD : agence de DESTINATION seulement (même règle que collectCod)
    await assertCanCollectHere(cur, 'valeur (COD)')
    if (cur.codStatus === 'collected' && cur.codExpReceivedAt && cur.codExpReceivedRole !== 'chef_agence') {
      throw new Error(`${nicOf(p)} : valeur déjà reçue par le chef d'exploitation — ${ENVOI_MSG}.`)
    }
    const notCollected = !cur.codStatus || cur.codStatus === 'pending'
    assertCollectAllowedStatus(cur) // pas de collecte NI de réception sans livraison (même si déjà « encaissé »)
    let split: Record<string, any> = {}
    if (splitCash !== undefined) {
      const total = Number.parseFloat(String(cur.codAmount ?? '')) || 0
      const c = Math.round(splitCash * 100) / 100
      const docType = String(cur.serviceType || '').toLowerCase()
      if (!notCollected || cur.codMixed === true || !['cheque', 'traite'].includes(docType)) throw new Error(`${nicOf(p)} : COD déjà collecté, déjà mixte ou pas un chèque / une traite.`)
      if (!(c > 0 && c < total)) throw new Error(`Part espèces invalide : entre 0 et ${total} DH (exclus).`)
      split = {
        codMixed: true, codCashAmount: c, codSplitDeclaredAt: now, codSplitDeclaredBy: by.name, codSplitDeclaredById: by.id,
        history: arrayUnion({ status: cur.status || '', timestamp: now,
          note: `RETOUR FOND collecté en ${docType === 'traite' ? 'traite' : 'chèque'} + espèces : ${docType === 'traite' ? 'traite' : 'chèque'} ${Math.round((total - c) * 100) / 100} DH + espèces ${c} DH (total ${total} DH) par ${by.name} (chef d'agence)` }),
      }
    }
    const curEff = { ...cur, ...split }
    const cash = codHasCash(curEff) ? codCashPartOf(curEff) : 0
    if (cash > 0) {
      tx.set(entryRef, caisseEntryDoc({
        type: 'entree', category: 'cod_agent', amount: cash,
        description: `RETOUR FOND espèces ${notCollected ? 'collecté' : 'reçu'} par le chef d'agence (en l'absence du chef d'exploitation) — ${nicOf(cur)} (${cur.receiver?.name || ''})`,
        reference: cur.trackingId || nicOf(cur),
        agentId: by.id, agentName: by.name, city: by.city, cashierId: by.id, cashierName: by.name,
      }))
    }
    const collected = notCollected
      ? { codPaymentType: coherentCodPaymentType(curEff, codPaymentTypeOf(curEff) || 'especes'), codCollectedAt: now, codCollectedBy: by.name, codCollectedById: by.id, ...split }
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
  let portFields: Record<string, any> = {}
  if (linked) {
    const cur = await readParcel(p)
    if (cur && linkedCashCod(cur) && linkedPortDu(cur) && portOpenForChef(cur)) portFields = await runLinked('Port dû', () => chefReceivePortDu(cur, by, false))
  }
  const delivered = linked ? await markDeliveredAfterCollect(p, by.name, Object.keys(portFields).length && !portFields.linkedError ? 'COD + port dû' : 'COD') : null
  return {
    ...portFields,
    ...out.fields, ...withoutHistory(out.collected), codStatus: 'remis', codRemisAt: now, codRemisBy: by.name, ...(delivered || {}),
  }
}

/**
 * Annule une réception de COD faite par MOI (chef d'agence) : remise annulée, entrée de caisse supprimée et, si c'est
 * moi qui l'avais collectée, collecte annulée — le tout en une seule opération. Refusé si la valeur a déjà quitté
 * l'agence (réglée à l'expéditeur, versée au compte société, envoyée à l'agence source).
 */
export async function chefCancelCod(p: any, by: ChefActor, linked = true): Promise<Record<string, any>> {
  const ref = doc(db, 'parcels', p.id)
  // 🔗 Port dû lié reçu par moi : annulé aussi — refus AVANT toute écriture s'il ne peut plus l'être
  const before = linked ? await readParcel(p) : null
  const portLinked = !!before && linkedCashCod(before) && linkedPortDu(before) && portMineForChef(before, by)
  if (portLinked && before.valeursEnvoiId && before.portChefReceivedById !== by.id) throw new Error(`${nicOf(p)} : annulation impossible — le port dû lié est reçu par un envoi validé.`)
  const restored = await runTransaction(db, async tx => {
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
      // ✂️ Collecte « chèque + espèces » annulée : le COD redevient un chèque / une traite simple (total inchangé)
      ...(mine && cur.codSplitDeclaredAt ? {
        codMixed: false, codCashAmount: 0, codSplitDeclaredAt: null, codSplitDeclaredBy: null, codSplitDeclaredById: null,
        history: arrayUnion({ status: cur.status || '', timestamp: new Date().toISOString(), note: `Collecte chèque + espèces annulée : RETOUR FOND redevenu ${String(cur.serviceType) === 'traite' ? 'traite' : 'chèque'} simple de ${cur.codAmount} DH par ${by.name}` }),
      } : {}),
    }
    if (cur.codCaisseEntryId) tx.delete(doc(db, 'caisseEntries', cur.codCaisseEntryId))
    tx.update(ref, restored)
    return restored
  })
  // ↩️ Livraison mise automatiquement par cette collecte : annulée aussi (statut + date de livraison)
  const undone = restored.codStatus === 'pending' ? await undoAutoDeliveryAfterUncollect(p.id, by.name).catch(() => null) : null
  const portFields = portLinked ? await runLinked('Annulation du port dû', () => chefCancelPortDu(before, by, false)) : {}
  return { ...withoutHistory(restored), ...(undone || {}), ...portFields }
}

/** 🔗 Après l'annulation d'un RETOUR FOND espèces (onglet COD) : son port dû lié, reçu par moi, est annulé aussi. */
export async function chefCancelLinkedPortDu(p: any, by: ChefActor): Promise<Record<string, any>> {
  const cur = await readParcel(p)
  if (!cur || !linkedCashCod(cur) || !linkedPortDu(cur) || !portMineForChef(cur, by)) return {}
  return runLinked('Annulation du port dû', () => chefCancelPortDu(cur, by, false))
}
