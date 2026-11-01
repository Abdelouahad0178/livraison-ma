// ── 📤 Copie allégée « argent détenu par le chef d'exploitation » (bloc Versements au chef d'agence) — 30/10/2026 ──
// envoiContrib/{parcelId} = { items: valeurs à envoyer au chef d'agence (règle partagée shared/exploitationEnvoi.js,
// compilée depuis src/utils/exploitationEnvoi.ts), holders: comptes qui les détiennent } — supprimé quand il n'y a plus
// rien. Modèle de syncParcelLite : rien si les valeurs n'ont pas changé, sinon relecture du colis et remplacement complet
// (idempotent → retry sûr, rejouable par le script de rattrapage).
const { envoiItemsOf } = require('./shared/exploitationEnvoi')

/** Contenu de la copie (null = rien à envoyer). */
function envoiContribOf(id, p) {
  if (!p) return null
  const items = envoiItemsOf({ ...p, id })
  if (!items.length) return null
  return { items, holders: [...new Set(items.flatMap(i => i.holders))] }
}
const envoiKey = c => JSON.stringify(c)

// ── 💰 Totaux par compte détenteur (31/10/2026) : envoiHolders/{uid} = reste à verser par type de versement, pour le
// bloc « Versements au chef d'agence » FERMÉ (1 document au lieu de 2 400 à 2 900 valeurs à chaque ouverture de la page).
// Même découpage que EnvoiValeursPanel : Ports (dus + payés ramassés), COD espèces, COD chèques / traites (une expédition
// avec un chèque / une traite y va EN ENTIER ; cod_docs_cash = sa part espèces). Tenus par DIFFÉRENCE (nouveau − ancien)
// dans la même transaction que envoiContrib → rejouable sans double comptage.
const HOLDER_GROUPS = ['ports', 'cod_especes', 'cod_docs', 'cod_docs_cash']
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
function holderTotalsOf(c) {
  const out = {}
  if (!c || !Array.isArray(c.items)) return out
  const docCod = c.items.some(i => i.kind === 'cod' && i.type !== 'especes')
  for (const i of c.items) {
    const g = i.kind !== 'cod' ? 'ports' : docCod ? 'cod_docs' : 'cod_especes'
    for (const h of i.holders || []) {
      const t = out[h] = out[h] || {}
      t[g] = r2((t[g] || 0) + i.amount)
      if (g === 'cod_docs' && i.type === 'especes') t.cod_docs_cash = r2((t.cod_docs_cash || 0) + i.amount)
    }
  }
  return out
}

async function syncEnvoi(db, FieldValue, id, data) {
  const ref = db.collection('envoiContrib').doc(id)
  const next = envoiContribOf(id, data)
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const old = snap.exists ? { items: snap.get('items') || [], holders: snap.get('holders') || [] } : null
    const a = holderTotalsOf(old), b = holderTotalsOf(next)
    for (const h of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const u = {}
      for (const g of HOLDER_GROUPS) { const d = r2((b[h]?.[g] || 0) - (a[h]?.[g] || 0)); if (d) u[g] = FieldValue.increment(d) }
      if (Object.keys(u).length) tx.set(db.collection('envoiHolders').doc(h), { ...u, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    if (next) tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() })
    else if (snap.exists) tx.delete(ref)
  })
}

module.exports = { envoiContribOf, envoiKey, syncEnvoi, holderTotalsOf, HOLDER_GROUPS }
