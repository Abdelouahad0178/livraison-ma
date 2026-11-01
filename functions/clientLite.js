// Version allégée des fiches clients (clients/{id} → clientsLite/{id}), lue par la saisie « Nouvelle expédition »
// (subscribeClientsByCity). Projection par EXCLUSION : tout nouveau champ reste recopié.
// Champs exclus = écrits à chaque expédition créée mais JAMAIS lus par les pages (≈ 29 % du poids) ; les exclure
// évite aussi de renvoyer la fiche du destinataire à tous les postes ouverts à chaque nouvelle expédition.
const CLIENT_LITE_EXCLUDED_FIELDS = new Set([
  'lastReceiverSeenAt', 'lastReceiverParcelId', 'lastReceiverTrackingId', 'autoCreatedFrom',
])

/** Projection allégée d'une fiche client (objet data(), sans l'id). */
function projectClientLite(data) {
  const out = {}
  for (const [k, v] of Object.entries(data || {})) {
    if (!CLIENT_LITE_EXCLUDED_FIELDS.has(k) && k !== 'liteUpdatedAt') out[k] = v
  }
  return out
}

module.exports = { CLIENT_LITE_EXCLUDED_FIELDS, projectClientLite }
