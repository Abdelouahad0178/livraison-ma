/**
 * Ajoute aux totaux commerciaux les compteurs apparus après le rattrapage (portCompteExp, portCompteDest).
 *
 * Usage :
 *   node scripts/migrate-commercial-fields.mjs           # simulation
 *   node scripts/migrate-commercial-fields.mjs --apply
 *
 * À lancer APRÈS le déploiement de syncCommercialStats avec les nouveaux champs.
 * Invariant conservé : chaque total = somme des contributions (commercialContrib).
 * - Pour chaque contribution sans les nouveaux champs : mise à jour AVEC précondition (date de dernière
 *   modification lue) → si la Cloud Function l'a modifiée entre-temps, elle a déjà ajouté ces champs → ignorée.
 * - Puis ajoute (increment) les valeurs retenues aux totaux, aux cibles de la contribution.
 * N'écrit jamais dans parcels / parcels_archive.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { contributionOf } = require('../functions/commercial.js')
const NEW_FIELDS = ['portCompteExp', 'portCompteDest']

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
db.settings({ preferRest: true })
const { FieldValue } = admin.firestore

const parcels = new Map()
for (const coll of ['parcels', 'parcels_archive']) {
  const snap = await db.collection(coll).select('createdAt', 'senderNameNorm', 'sender', 'senderName', 'clientName', 'originCity', 'createdByCity', 'status', 'price', 'portType', 'codAmount', 'nbColis').get()
  snap.docs.forEach(d => { if (!parcels.has(d.id)) parcels.set(d.id, d.data()) })
}
const contribs = (await db.collection('commercialContrib').get()).docs.filter(d => NEW_FIELDS.some(k => d.data().values?.[k] === undefined))
console.log(`expéditions : ${parcels.size} ; contributions à compléter : ${contribs.length}`)

const todo = []
for (const d of contribs) {
  const c = contributionOf(parcels.get(d.id))
  const add = Object.fromEntries(NEW_FIELDS.map(k => [k, c?.values[k] || 0]))
  todo.push({ d, add })
}
const sum = Object.fromEntries(NEW_FIELDS.map(k => [k, todo.reduce((s, t) => s + t.add[k], 0)]))
console.log('à ajouter :', sum)
if (!APPLY) { console.log('Simulation — rien écrit. Relancer avec --apply.'); process.exit(0) }

const kept = []
let skipped = 0
const bw = db.bulkWriter()
bw.onWriteError(err => { if (err.code === 9 /* FAILED_PRECONDITION */) { skipped++; return false } return err.failedAttempts < 5 })
for (const t of todo) {
  const values = { ...t.d.data().values, ...t.add }
  bw.update(t.d.ref, { values }, { lastUpdateTime: t.d.updateTime }).then(() => kept.push(t)).catch(() => {})
}
await bw.close()
console.log(`contributions complétées : ${kept.length} ; déjà traitées par la Cloud Function : ${skipped}`)

const totals = new Map()
for (const t of kept) {
  for (const path of Object.values(t.d.data().targets)) {
    const x = totals.get(path) || Object.fromEntries(NEW_FIELDS.map(k => [k, 0]))
    NEW_FIELDS.forEach(k => { x[k] += t.add[k] })
    totals.set(path, x)
  }
}
const bw2 = db.bulkWriter()
for (const [path, x] of totals) bw2.set(db.doc(path), Object.fromEntries(NEW_FIELDS.map(k => [k, FieldValue.increment(x[k])])), { merge: true })
await bw2.close()
console.log(`totaux mis à jour : ${totals.size}. Terminé.`)
process.exit(0)
