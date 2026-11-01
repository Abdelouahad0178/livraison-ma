/**
 * Migration: corriger codPaymentType incohérent avec serviceType (ex: 'especes' par défaut
 * alors que le colis est "contre chèque"). Même logique que codPaymentTypeOf() dans
 * src/firebase/constants.ts.
 *
 * Usage:
 *   node scripts/migrate-codPaymentType.mjs --dry-run   # simulation
 *   node scripts/migrate-codPaymentType.mjs             # applique
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const DRY_RUN = process.argv.includes('--dry-run')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const ALIASES = {
  especes: 'especes', cod_especes: 'especes', cheque: 'cheque', cod_cheque: 'cheque',
  traite: 'traite', cod_traite: 'traite', retour_bl: 'bon_livraison', bon_livraison: 'bon_livraison',
}
const norm = raw => String(raw ?? '').toLowerCase().split(',').map(s => ALIASES[s.trim()]).filter(Boolean)
const typeOf = p => {
  const service = norm(p.serviceType)
  const collected = norm(p.codPaymentType)
  if (collected.length && (service.length === 0 || service.includes(collected[0]))) return collected[0]
  if (service.length) return service[0]
  return collected[0] || ''
}

console.log(DRY_RUN ? '🔍 SIMULATION — aucune écriture\n' : '🔄 Migration codPaymentType...\n')
const snap = await db.collection('parcels').where('codAmount', '>', 0).get()
console.log(`📦 ${snap.size} colis avec COD > 0`)

let batch = db.batch(), n = 0, updated = 0, ok = 0, unknown = 0, skipped = 0
const stats = {}
for (const doc of snap.docs) {
  const p = doc.data()
  const target = typeOf(p)
  if (!target) { unknown++; continue }
  if (p.codPaymentType === target) { ok++; continue }
  // Conflit où le stocké est cheque/traite (saisie réelle possible à l'encaissement) : on ne l'écrase pas
  const stored = norm(p.codPaymentType)[0]
  if (stored && stored !== 'especes' && norm(p.serviceType).length && !norm(p.serviceType).includes(stored) && String(p.codPaymentType).indexOf(',') === -1) { skipped++; continue }
  const k = `serviceType=${JSON.stringify(p.serviceType)} : ${JSON.stringify(p.codPaymentType)} -> ${target}`
  stats[k] = (stats[k] || 0) + 1
  updated++
  if (!DRY_RUN) {
    batch.update(doc.ref, { codPaymentType: target })
    if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0 }
  }
}
if (!DRY_RUN && n > 0) await batch.commit()

console.log(`\n✅ déjà corrects: ${ok} | conflits ignorés (saisie réelle possible): ${skipped} | sans type: ${unknown} | ${DRY_RUN ? 'à corriger' : 'corrigés'}: ${updated}`)
Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v} × ${k}`))
process.exit(0)
