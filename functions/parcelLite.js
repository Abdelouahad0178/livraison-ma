'use strict'

// ── Version allégée des expéditions (collection parcelsLite) ─────────────────
// parcelsLite/{id} = copie de parcels/{id} SANS les champs lourds ou purement d'audit,
// jamais lus par les listes / filtres / totaux de l'onglet Expéditions (et des autres onglets
// de la page Agence qui partagent la même liste). Le document complet reste dans `parcels`
// (aucune perte) : il est relu à l'ouverture d'un colis (modification, historique, impression…).
//
// ⚠️ Liste d'EXCLUSION (et non de champs gardés) : tout nouveau champ ajouté aux colis est
// recopié automatiquement — rien ne peut « disparaître » d'une liste par oubli.
// Vérifié (grep) : aucun de ces champs n'est lu par AgentPage / agent/** / utils / components
// sur un élément de liste, sauf `history`, relu en base là où il sert (voir ensureFullParcel).
// Partagé par la Cloud Function syncParcelLite et scripts/backfill-parcels-lite.mjs.
const LITE_EXCLUDED_FIELDS = new Set([
  // Historique (le plus lourd) + journaux de modification
  'history', 'adminChanges',
  // Champs dénormalisés pour la recherche SERVEUR (la recherche « Tout » reste sur parcels)
  'senderNameLower', 'receiverNameLower', 'senderNameNorm', 'receiverNameNorm',
  // Audit / traçabilité non affichés dans les listes
  'chefPointedBy', 'chefPointedById', 'chefPointedSource',
  'aideAgentName', 'validatedById', 'customerMode', 'photoUrl', 'priceModifiedAt',
  'lastAdminEditAt', 'lastAdminEditBy', 'lastModifiedByUid',
  'requestedByClientId', 'requestedByClientName', 'requestedFromPortal', 'requestedAt',
  'clientPortalUid', 'clientPortalName', 'returnOf', 'returnOfTrackingId',
  'archivedAt', 'archivedBy', 'archivedByName', 'archivedReason',
  'controlled', 'controlledBy', 'controlledById', 'controlledAt',
  'deliveryControlled', 'deliveryControlledBy', 'deliveryControlledById', 'deliveryControlledAt',
  'signatureToken', 'signatureTokenCreatedAt', 'signatureMethod',
  'invoiceId', 'invoicedAt',
  'returnedByDriverId', 'returnedByDriverName', 'returnNote',
  'lostDeclarationId', 'foundBy', 'foundAt',
  'codRemiseCancelledBy', 'codRemiseCancelledById', 'codRemiseCancelledAt',
  'portEnCompteById', 'portEnCompteAt', 'portEnCompteClientId', 'portEnCompteBy',
  'codSenderPaidBy', 'codSenderPaidById', 'valeursEnvoiId', 'codCollectedById', 'codSentToSourceById',
  'codReceivedBySourceById', 'codReceivedBySourceBy', 'codReceivedValueNote',
  'codReceivedValueMatchesPointeur', 'codReceivedChequeNum', 'codReceivedChequeEcheance',
  'codReceivedChequeBanque', 'codType',
  'adminTransferAt', 'adminTransferById', 'adminTransferBy', 'adminTransferId',
  'portAdminTransferAt', 'portAdminTransferById', 'portAdminTransferBy', 'portAdminTransferId',
])

/** Projection allégée d'un document colis (objet data(), sans l'id). */
function projectParcelLite(data) {
  const out = {}
  for (const [k, v] of Object.entries(data || {})) {
    if (!LITE_EXCLUDED_FIELDS.has(k) && k !== 'liteUpdatedAt') out[k] = v
  }
  return out
}

// Forme canonique (clés triées, Timestamp/GeoPoint/DocumentReference normalisés) pour comparer
// deux projections sans écrire inutilement.
function canon(v) {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function' && 'nanoseconds' in v) return { __ts: `${v.seconds}.${v.nanoseconds}` }
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number') return { __geo: `${v.latitude},${v.longitude}` }
    if (typeof v.path === 'string' && v.firestore) return { __ref: v.path }
    if (v instanceof Date) return { __date: v.toISOString() }
    const o = {}
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k])
    return o
  }
  return v
}
const liteKey = (lite) => JSON.stringify(canon(lite))

module.exports = { LITE_EXCLUDED_FIELDS, projectParcelLite, liteKey }
