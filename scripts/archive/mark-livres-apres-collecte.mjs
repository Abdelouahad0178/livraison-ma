/**
 * 📦 Rattrapage : expéditions encore « En cours de livraison » dont le port dû ou le COD a DÉJÀ été collecté
 * depuis le 01/10/2026 → « Livré » (même règle que markDeliveredAfterCollect, appliquée désormais à chaque collecte).
 *
 *   node scripts/mark-livres-apres-collecte.mjs           # essai à blanc (liste, aucune écriture)
 *   node scripts/mark-livres-apres-collecte.mjs --apply   # sauvegarde puis écriture
 *
 * - deliveredAt = date de la (première) collecte (meilleure estimation de la livraison réelle).
 * - Ligne d'historique ajoutée (arrayUnion), rien d'autre n'est modifié.
 * - Sauvegarde de l'état avant écriture : scripts/mark-livres-apres-collecte-backup.json.
 * - Statut relu dans une transaction : rien n'est fait si l'expédition n'est plus « En cours de livraison ».
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const SINCE = new Date(2026, 9, 1, 0, 0, 0) // 01/10/2026

const toDate = v => !v ? null : typeof v === 'string' ? new Date(v) : v.toDate ? v.toDate() : null
const isPortDu = p => p.portType === 'port_du' && !p.portPayeMethod
const collectedAt = p => {
  const dates = []
  if (p.codStatus && p.codStatus !== 'pending') dates.push(toDate(p.codCollectedAt) || toDate(p.codRemisAt))
  if (isPortDu(p) && ['collected', 'received'].includes(p.portStatus)) dates.push(toDate(p.portCollectedAt) || toDate(p.portReceivedAt))
  const ok = dates.filter(d => d && !isNaN(d.getTime()))
  return ok.length ? new Date(Math.min(...ok.map(d => d.getTime()))) : null
}

const snap = await db.collection('parcels').where('status', '==', 'En cours de livraison').get()
const targets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  .map(p => ({ p, at: collectedAt(p) }))
  .filter(({ at }) => at && at >= SINCE)

console.log(`${snap.size} « En cours de livraison » — ${targets.length} avec port dû / COD collecté depuis le 01/10/2026`)
const byCity = {}
targets.forEach(({ p }) => { byCity[p.destinationCity] = (byCity[p.destinationCity] || 0) + 1 })
console.log('par ville :', byCity)

if (!APPLY) {
  targets.slice(0, 15).forEach(({ p, at }) => console.log(`  ${p.senderNic} | ${p.destinationCity} | ${p.deliveryDriverName} | collecté le ${at.toISOString().slice(0, 16)}`))
  console.log('\nEssai à blanc : rien n\'a été écrit. Relancer avec --apply.')
  process.exit(0)
}

const backup = targets.map(({ p }) => ({ id: p.id, senderNic: p.senderNic, status: p.status, deliveredAt: p.deliveredAt ?? null, historyLength: (p.history || []).length }))
writeFileSync(new URL('./mark-livres-apres-collecte-backup.json', import.meta.url), JSON.stringify(backup, null, 2))
console.log(`Sauvegarde : ${backup.length} expéditions → scripts/mark-livres-apres-collecte-backup.json`)

let done = 0, skipped = 0
const now = new Date().toISOString()
for (const { p, at } of targets) {
  const ref = db.collection('parcels').doc(p.id)
  const ok = await db.runTransaction(async tx => {
    const cur = await tx.get(ref)
    if (!cur.exists || cur.data().status !== 'En cours de livraison') return false
    const by = p.codCollectedBy || p.portCollectedBy || ''
    tx.update(ref, {
      status: 'Livré',
      deliveredAt: at.toISOString(),
      history: admin.firestore.FieldValue.arrayUnion({
        status: 'Livré',
        timestamp: now,
        note: `Marqué livré automatiquement (rattrapage) : port dû / COD déjà collecté le ${at.toLocaleDateString('fr-FR')}${by ? ` par ${by}` : ''}${p.deliveryDriverName ? ` — ${p.deliveryDriverName}` : ''}`,
      }),
    })
    return true
  })
  ok ? done++ : skipped++
}
console.log(`Terminé : ${done} passées à « Livré », ${skipped} ignorées (statut changé entre-temps).`)
process.exit(0)
