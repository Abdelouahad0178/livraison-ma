// ── 💼 Copie allégée des versements (Admin › Versements) — 30/10/2026 ────────────────────────────────────────
// Chaque expédition dont le port a été encaissé « contribue » aux Collectes par jour de son agence (même règle que les
// pages : shared/versementContribution.js, compilé depuis src/utils/versementContribution.ts) :
//   versementContrib/{parcelId}       : la dernière contribution appliquée (ville, journée, nature, où est l'argent, montant)
//   versementDays/{journée}_{ville}   : totaux de la journée — aVerser (dans la caisse du chef d'agence), nonRecu (pas
//                                       encore reçu : chef d'exploitation / livreurs), verse (déjà versé à l'admin) + nombres
// Chaque synchro applique seulement la DIFFÉRENCE (nouvelle − ancienne), en transaction → idempotent (rejouable sans
// double comptage), sûr avec retry: true et partagé avec le script de rattrapage (même modèle que commercial.js).
// L'Admin lit quelques dizaines de petits documents au lieu de milliers d'expéditions.
const { versementContributionOf } = require('./shared/versementContribution')

const BUCKETS = ['aVerser', 'nonRecu', 'verse']
const KINDS = ['portDu', 'portPaye']
// Compteurs d'une journée : montant et nombre par « où est l'argent », puis répartis par nature (port dû / port payé
// ramassé au guichet), ex. nonRecu_portPaye = ports payés encaissés au guichet, pas encore remis
const DAY_FIELDS = BUCKETS.flatMap(b => [b, `n_${b}`, ...KINDS.map(k => `${b}_${k}`)])
/** Champs d'une journée touchés par une contribution (montants, et nombre pour n_…). */
const dayFieldsOf = c => [c.bucket, `n_${c.bucket}`, `${c.bucket}_${c.kind}`]
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

// Comptes chef d'agence / agent pro par ville (argent « dans la caisse » du chef d'agence) — relus toutes les 5 minutes
let holdersCache = { at: 0, map: null }
async function holdersByCity(db) {
  if (holdersCache.map && Date.now() - holdersCache.at < 5 * 60 * 1000) return holdersCache.map
  const snap = await db.collection('users').where('role', 'in', ['chef_agence', 'agentpro']).get()
  const map = new Map()
  snap.docs.forEach(d => {
    const city = d.get('city')
    if (!city) return
    if (!map.has(city)) map.set(city, new Set())
    map.get(city).add(d.id)
  })
  holdersCache = { at: Date.now(), map }
  return map
}

/** Contribution (ou null) d'une expédition, au format enregistré. */
function versementOf(p, holders) {
  if (!p) return null
  const c = versementContributionOf(p, city => holders.get(city) || new Set())
  if (!c) return null
  return {
    city: c.city, day: c.dayKey, kind: c.kind, bucket: c.bucket, amount: r2(c.amount),
    nic: String(p.senderNic || p.sender?.nic || p.trackingId || ''),
  }
}
const sameContribution = (a, b) => (!a && !b) || (!!a && !!b && a.city === b.city && a.day === b.day && a.kind === b.kind
  && a.bucket === b.bucket && r2(a.amount) === r2(b.amount))
const dayPath = c => `versementDays/${c.day}_${safeId(c.city)}`

/**
 * Applique (en transaction) la différence entre la contribution déjà enregistrée et `data`.
 * data = null → l'expédition ne compte plus (supprimée / sortie de la base active).
 */
async function syncVersement(db, FieldValue, parcelId, data, holders) {
  const h = holders || await holdersByCity(db)
  const next = versementOf(data, h)
  const ref = db.collection('versementContrib').doc(parcelId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const old = snap.exists ? snap.data() : null
    if (sameContribution(old, next) && (!next || old.nic === next.nic)) return false
    const ts = FieldValue.serverTimestamp()
    // Différences par document de journée (une seule écriture par document)
    const deltas = new Map()
    const add = (c, sign) => {
      if (!c) return
      const path = dayPath(c)
      const d = deltas.get(path) || { city: c.city, day: c.day, values: {} }
      for (const k of dayFieldsOf(c)) d.values[k] = r2((d.values[k] || 0) + sign * (k.startsWith('n_') ? 1 : r2(c.amount)))
      deltas.set(path, d)
    }
    add(old, -1)
    add(next, 1)
    for (const [path, d] of deltas) {
      const u = { city: d.city, day: d.day, updatedAt: ts }
      // increment(0) crée le champ à 0 s'il manque : chaque journée a toujours tous ses compteurs
      DAY_FIELDS.forEach(k => { u[k] = FieldValue.increment(d.values[k] || 0) })
      tx.set(db.doc(path), u, { merge: true })
    }
    if (next) tx.set(ref, { ...next, updatedAt: ts })
    else tx.delete(ref)
    return true
  })
}

module.exports = { versementOf, syncVersement, holdersByCity, sameContribution, BUCKETS, DAY_FIELDS, dayFieldsOf }
