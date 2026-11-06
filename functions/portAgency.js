// ── 📮 Totaux de « Port par agence » (Admin) — 01/11/2026 ───────────────────────────────────────────────────────
// Chaque expédition « contribue » aux totaux de SA journée (workDate) pour chaque agence concernée — même règle que
// l'onglet (shared/portAgencyContribution.js, compilé depuis src/utils/portAgencyContribution.ts) :
//   portAgencyContrib/{parcelId}          : la dernière contribution appliquée (journée, agences, expédition distincte)
//   portAgencyDays/{journée}_{ville}      : th_… (Vue théorique), ph_… (Situation caisse), nbExp, nbUnique
//   portAgencyDays/{journée}___toutes     : nUnion = expéditions DISTINCTES de toutes les agences
// Chaque synchro applique seulement la DIFFÉRENCE (nouvelle − ancienne), en transaction → idempotent (rejouable sans
// double comptage), sûr avec retry: true et partagé avec le script de rattrapage (même modèle que versement.js).
const { portAgencyContributionOf, PORT_DAY_FIELDS, PORT_ALL_CITY } = require('./shared/portAgencyContribution')

const CODE_CITIES = ['Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Guelmim', 'Ait Melloul']
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

// Agences de l'onglet : réglage Admin › Agences (settings/agencies.cities), sinon la liste du code — relu toutes les 5 min
let citiesCache = { at: 0, list: null }
async function agencyCities(db) {
  if (citiesCache.list && Date.now() - citiesCache.at < 5 * 60 * 1000) return citiesCache.list
  const s = (await db.doc('settings/agencies').get()).data()
  const list = Array.isArray(s?.cities) && s.cities.filter(c => typeof c === 'string' && c.trim()).length
    ? s.cities.filter(c => typeof c === 'string' && c.trim()) : CODE_CITIES
  citiesCache = { at: Date.now(), list }
  return list
}

/** Contribution (ou null) d'une expédition, au format enregistré. */
const portAgencyOf = (p, cities) => (p ? portAgencyContributionOf(p, cities) : null)
const canon = c => (c ? JSON.stringify({ day: c.day, union: c.union, cities: Object.keys(c.cities).sort().map(k => [k, PORT_DAY_FIELDS.map(f => r2(c.cities[k][f]))]) }) : '')
const sameContribution = (a, b) => canon(a) === canon(b)
const dayPath = (day, city) => `portAgencyDays/${day}_${safeId(city)}`

/**
 * Applique (en transaction) la différence entre la contribution déjà enregistrée et `data`.
 * data = null → l'expédition ne compte plus (supprimée / sortie de la base active).
 */
async function syncPortAgency(db, FieldValue, parcelId, data, cities) {
  const list = cities || await agencyCities(db)
  const next = portAgencyOf(data, list)
  const ref = db.collection('portAgencyContrib').doc(parcelId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const old = snap.exists ? snap.data() : null
    if (sameContribution(old, next)) return false
    const ts = FieldValue.serverTimestamp()
    const deltas = new Map()
    const add = (c, sign) => {
      if (!c) return
      for (const [city, v] of Object.entries(c.cities)) {
        const path = dayPath(c.day, city)
        const d = deltas.get(path) || { city, day: c.day, values: {}, fields: PORT_DAY_FIELDS }
        for (const f of PORT_DAY_FIELDS) d.values[f] = r2((d.values[f] || 0) + sign * (Number(v[f]) || 0))
        deltas.set(path, d)
      }
      if (c.union) {
        const path = dayPath(c.day, PORT_ALL_CITY)
        const d = deltas.get(path) || { city: PORT_ALL_CITY, day: c.day, values: {}, fields: ['nUnion'] }
        d.values.nUnion = (d.values.nUnion || 0) + sign
        deltas.set(path, d)
      }
    }
    add(old, -1)
    add(next, 1)
    for (const [path, d] of deltas) {
      const u = { city: d.city, day: d.day, updatedAt: ts }
      // increment(0) crée le champ à 0 s'il manque : chaque journée a toujours tous ses compteurs
      d.fields.forEach(k => { u[k] = FieldValue.increment(d.values[k] || 0) })
      tx.set(db.doc(path), u, { merge: true })
    }
    if (next) tx.set(ref, { ...next, updatedAt: ts })
    else tx.delete(ref)
    return true
  })
}

module.exports = { portAgencyOf, syncPortAgency, agencyCities, sameContribution, PORT_DAY_FIELDS, PORT_ALL_CITY }
