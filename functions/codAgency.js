// ── 💰 Totaux de « COD par agence » (Admin) — 01/11/2026 ────────────────────────────────────────────────────────
// Même modèle que portAgency.js (Port par agence). Chaque expédition « contribue » aux totaux de SA journée (workDate)
// pour chaque agence concernée — même règle que l'onglet (shared/codAgencyContribution.js, compilé depuis
// src/utils/codAgencyContribution.ts, qui fournit aussi les différences à appliquer : codDayDeltas) :
//   codAgencyContrib/{parcelId}          : la dernière contribution appliquée (cityList : recherche des expéditions d'une agence)
//   codAgencyDays/{journée}_{ville}      : th|ph _ rcv|snd|all _ …, reste_…_n, byOrigin.{origine}.… (reçues par origine)
//   codAgencyDays/{journée}___toutes     : u_…, sets / setsO = expéditions par combinaison d'agences (distinctes exactes)
// Différence appliquée en transaction → idempotent (rejouable sans double comptage), sûr avec retry: true.
const { codAgencyContributionOf, codDayDeltas, COD_DAY_FIELDS, COD_UNION_FIELDS, COD_ALL_CITY } = require('./shared/codAgencyContribution')
const { agencyCities } = require('./portAgency')

const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

/** Contribution (ou null) d'une expédition, au format enregistré. */
const codAgencyOf = (p, cities) => (p ? codAgencyContributionOf(p, cities) : null)
const canon = c => (c ? JSON.stringify({
  day: c.day,
  origin: c.origin || null,
  cityList: c.cityList || null,
  union: COD_UNION_FIELDS.map(f => (c.union && c.union[f]) || 0),
  sets: Object.keys(c.sets || {}).sort().map(k => [k, c.sets[k]]),
  cities: Object.keys(c.cities).sort().map(k => [k, COD_DAY_FIELDS.map(f => r2(c.cities[k][f]))]),
}) : '')
const sameContribution = (a, b) => canon(a) === canon(b)
const dayPath = (day, city) => `codAgencyDays/${day}_${safeId(city)}`
// Contribution enregistrée avant la 2ᵉ étape (sans cityList) : ses compteurs imbriqués n'avaient jamais été ajoutés
const deltasOf = (c, sign) => codDayDeltas(c, sign).map(d => (c && !c.cityList ? { ...d, nested: [] } : d))

/** Différences regroupées par document de journée (une seule écriture par document). */
function groupDeltas(old, next) {
  const docs = new Map()
  for (const d of [...deltasOf(old, -1), ...deltasOf(next, 1)]) {
    const path = dayPath(d.day, d.city)
    const e = docs.get(path) || { city: d.city, day: d.day, nums: {}, nested: new Map() }
    for (const [k, n] of Object.entries(d.nums)) e.nums[k] = r2((e.nums[k] || 0) + n)
    for (const x of d.nested) {
      const key = JSON.stringify(x.path)
      e.nested.set(key, { path: x.path, n: r2(((e.nested.get(key) || {}).n || 0) + x.n) })
    }
    docs.set(path, e)
  }
  return docs
}

async function syncCodAgency(db, FieldValue, parcelId, data, cities) {
  const list = cities || await agencyCities(db)
  const next = codAgencyOf(data, list)
  const ref = db.collection('codAgencyContrib').doc(parcelId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const old = snap.exists ? snap.data() : null
    if (sameContribution(old, next)) return false
    const ts = FieldValue.serverTimestamp()
    for (const [path, e] of groupDeltas(old, next)) {
      const u = { city: e.city, day: e.day, updatedAt: ts }
      // increment(0) crée le champ à 0 s'il manque : chaque journée a toujours tous ses compteurs
      for (const [k, n] of Object.entries(e.nums)) u[k] = FieldValue.increment(n)
      for (const { path: p, n } of e.nested.values()) {
        if (!n) continue
        let o = u
        for (const k of p.slice(0, -1)) o = o[k] || (o[k] = {})
        o[p[p.length - 1]] = FieldValue.increment(n)
      }
      tx.set(db.doc(path), u, { merge: true })
    }
    if (next) tx.set(ref, { ...next, updatedAt: ts })
    else tx.delete(ref)
    return true
  })
}

module.exports = { codAgencyOf, syncCodAgency, sameContribution, codDayDeltas, COD_DAY_FIELDS, COD_UNION_FIELDS, COD_ALL_CITY }
