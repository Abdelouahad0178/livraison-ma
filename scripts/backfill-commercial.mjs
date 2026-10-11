/**
 * Rattrapage des totaux de la gestion commerciale (commercialClients / commercialAgencies / commercialDays)
 * à partir de TOUTES les expéditions (parcels + parcels_archive).
 *
 * Usage :
 *   node scripts/backfill-commercial.mjs           # simulation (aucune écriture) : affiche les totaux
 *   node scripts/backfill-commercial.mjs --apply   # écrit
 *
 * À lancer APRÈS le déploiement de la Cloud Function syncCommercialStats.
 * - Lit seulement les expéditions : n'écrit JAMAIS dans parcels ni parcels_archive.
 * - Pour chaque expédition, crée commercialContrib/{id} avec create() : si le document existe déjà,
 *   la Cloud Function l'a déjà comptée → ignorée ici (aucun double comptage, même en parallèle).
 * - Puis ajoute (increment) les contributions retenues aux totaux : une écriture par document de total.
 */
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { contributionOf, NUM_FIELDS } = require('../functions/commercial.js')

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
db.settings({ preferRest: true })
const { FieldValue } = admin.firestore

const seen = new Map() // id → contribution (parcels prioritaire sur l'archive)
for (const coll of ['parcels', 'parcels_archive']) {
  const snap = await db.collection(coll).select('createdAt', 'senderNameNorm', 'sender', 'senderName', 'clientName', 'originCity', 'createdByCity', 'status', 'price', 'portType', 'codAmount', 'nbColis').get()
  let n = 0
  snap.docs.forEach(d => { if (!seen.has(d.id)) { const c = contributionOf(d.data()); if (c) { seen.set(d.id, c); n++ } } })
  console.log(`${coll} : ${snap.size} lues, ${n} retenues`)
}

// 1) Marquer les contributions (create : ignore celles déjà comptées par la Cloud Function)
const kept = []
if (APPLY) {
  const bw = db.bulkWriter()
  let already = 0
  bw.onWriteError(err => { if (err.code === 6 /* ALREADY_EXISTS */) { already++; return false } return err.failedAttempts < 5 })
  const ts = FieldValue.serverTimestamp()
  for (const [id, c] of seen) {
    bw.create(db.collection('commercialContrib').doc(id), { targets: c.targets, values: c.values, clientName: c.meta.clientName, updatedAt: ts })
      .then(() => kept.push(c)).catch(() => {})
  }
  await bw.close()
  console.log(`contributions créées : ${kept.length} ; déjà comptées par la Cloud Function : ${already}`)
} else {
  kept.push(...seen.values())
}

// 2) Additionner par document de total
const totals = new Map()
const add = (path, c, kind) => {
  if (!totals.has(path)) {
    const t = { city: c.meta.city, month: c.meta.month, ...Object.fromEntries(NUM_FIELDS.map(k => [k, 0])) }
    if (kind === 'day') t.day = c.meta.day
    if (kind === 'client') { t.clientKey = c.meta.clientKey; t.clientName = c.meta.clientName }
    totals.set(path, t)
  }
  const t = totals.get(path)
  NUM_FIELDS.forEach(k => { t[k] += c.values[k] || 0 })
}
for (const c of kept) for (const kind of ['client', 'agency', 'day']) add(c.targets[kind], c, kind)

const agencies = [...totals.entries()].filter(([p]) => p.startsWith('commercialAgencies/')).sort()
agencies.forEach(([p, t]) => console.log(p.padEnd(42), `exp ${t.exp}`.padEnd(11), `CA ${Math.round(t.ca)} DH`.padEnd(16), `COD ${Math.round(t.cod)} DH`))
console.log(`documents de totaux : ${totals.size} (clients ${[...totals.keys()].filter(p => p.startsWith('commercialClients/')).length})`)

if (!APPLY) { console.log('\nSimulation — rien écrit. Relancer avec --apply.'); process.exit(0) }

// 3) Écrire (increment : s'ajoute à ce que la Cloud Function a déjà compté)
const bw2 = db.bulkWriter()
const ts = FieldValue.serverTimestamp()
for (const [path, t] of totals) {
  const u = { updatedAt: ts }
  for (const [k, v] of Object.entries(t)) u[k] = NUM_FIELDS.includes(k) ? FieldValue.increment(v) : v
  bw2.set(db.doc(path), u, { merge: true })
}
await bw2.close()
console.log('Terminé.')
process.exit(0)
