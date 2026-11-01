// ── 🔑 Droit « modification totale » dans le jeton de connexion (01/11/2026, diagnostic de souplesse — lot C2) ──
// L'admin coche le droit dans la fiche employé (users/{uid}.permissions.fullParcelEdit). Les règles Firestore le lisent
// dans le jeton (request.auth.token.fullEdit) : un seul test très léger, au lieu de relire la fiche (limite des 1 000
// expressions du bloc des expéditions). Effet à la prochaine connexion de la personne, ou au renouvellement du jeton (≤ 1 h).
'use strict'

/** Recopie le droit dans les « claims » du compte si besoin ; les autres claims éventuels sont gardés. */
async function syncFullEditClaim(auth, uid, data) {
  const want = !!(data && data.permissions && data.permissions.fullParcelEdit === true)
  let user
  try { user = await auth.getUser(uid) } catch (e) { if (e.code === 'auth/user-not-found') return false; throw e }
  const claims = user.customClaims || {}
  if (!!claims.fullEdit === want) return false
  const next = { ...claims }
  if (want) next.fullEdit = true; else delete next.fullEdit
  await auth.setCustomUserClaims(uid, next)
  return true
}

module.exports = { syncFullEditClaim }
