import { doc, runTransaction } from 'firebase/firestore'
import { db } from './config'

/**
 * 👑 Correction de statut par l'ADMIN : l'expédition ne sera plus « Livré » → l'argent encaissé à la livraison est remis à
 * zéro PROPREMENT, en UNE opération (01/11/2026, diagnostic de souplesse, lot B2 — modèle chefCancelPortDu / chefCancelCod) :
 * collecte + réceptions (chef d'exploitation, chef d'agence) + ligne de caisse liée.
 * Avant : seuls portStatus / portCollected* (et codStatus / codCollected*) étaient remis ; les traces de réception restaient
 * (cas 1088479D) et faussaient les versements.
 * REFUS (rien n'est écrit) si cet argent est déjà dans un versement au chef d'agence ou à l'admin : l'annuler d'abord.
 * Mêmes conditions de déclenchement qu'avant (port « collected » ; COD « collected » non envoyé / non réglé).
 */
export async function adminResetDeliveryMoney(parcelId: string): Promise<Record<string, any>> {
  const ref = doc(db, 'parcels', parcelId)
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Expédition introuvable.')
    const p: any = snap.data()
    const nic = p.senderNic || p.trackingId || parcelId
    const reset: Record<string, any> = {}

    if (p.portStatus === 'collected') {
      if (p.portAdminTransferred) throw new Error(`${nic} : le port est déjà versé à l'admin — annulez d'abord ce versement.`)
      if (p.valeursEnvoiId && (p.portChefReceivedAt || p.portExpReceivedAt)) throw new Error(`${nic} : le port est dans un versement au chef d'agence — annulez-le d'abord.`)
      Object.assign(reset, {
        portStatus: 'pending', portCollectedBy: null, portCollectedById: null, portCollectedAt: null, portDuReceivedMethod: null,
        portExpReceivedAt: null, portExpReceivedBy: null, portExpReceivedById: null, portExpReceivedRole: null,
        portChefReceivedAt: null, portChefReceivedBy: null, portChefReceivedById: null, portCaisseEntryId: null,
      })
      if (p.portCaisseEntryId) tx.delete(doc(db, 'caisseEntries', p.portCaisseEntryId))
    }
    if (p.signatureConfirmedAt) Object.assign(reset, { signatureConfirmedAt: null, signatureToken: null })
    if (p.codStatus === 'collected' && !p.codSentToSource && !p.codSenderPaid) {
      Object.assign(reset, {
        codStatus: 'pending', codCollectedAt: null, codCollectedBy: null, codCollectedById: null,
        codExpReceivedAt: null, codExpReceivedBy: null, codExpReceivedById: null, codExpReceivedRole: null,
      })
    }
    if (Object.keys(reset).length) tx.update(ref, reset)
    return reset
  })
}
