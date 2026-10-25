'use strict'

// 🧾 Copie « facturier » des expéditions (collection parcelsFacturier) : SEULS les champs lus par la page
// Facturier (tableau, recherche, filtres, totaux, Excel, création / impression de facture) — ≈ 0,5 Ko au lieu
// de ≈ 2 Ko (parcelsLite) ou ≈ 3 Ko (parcels). Projection par INCLUSION : un nouveau champ affiché par le
// Facturier doit être ajouté ici (puis rattrapage : scripts/backfill-parcels-facturier.mjs).
// Écrite uniquement par la Cloud Function syncParcelFacturier ; les écritures client visent toujours parcels.
const FACTURIER_FIELDS = [
  'portType', 'originCity', 'destinationCity', 'recipientCity', 'trackingId', 'clientName', 'clientId', 'status',
  'price', 'numberOfParcels', 'nbColis', 'isArchived', 'invoiced', 'createdAt', 'workDate',
  'codAmount', 'codMixed', 'codCashAmount', 'serviceType', 'codPaymentType',
]
const PARTY_FIELDS = ['name', 'city', 'nic', 'tel'] // sender.* / receiver.*

/** Projection facturier d'un document colis (objet data(), sans l'id). */
function projectParcelFacturier(data) {
  const v = data || {}
  const out = {}
  for (const k of FACTURIER_FIELDS) if (v[k] !== undefined) out[k] = v[k]
  for (const party of ['sender', 'receiver']) {
    const src = v[party]
    if (src && typeof src === 'object') {
      const o = {}
      for (const k of PARTY_FIELDS) if (src[k] !== undefined) o[k] = src[k]
      out[party] = o
    }
  }
  return out
}

module.exports = { FACTURIER_FIELDS, PARTY_FIELDS, projectParcelFacturier }
