/**
 * ↩️ Rattrapage des totaux de la gestion commerciale pour les expéditions RETOURNÉES (lot D, 01/11/2026).
 * Avant le correctif de functions/commercial.js, une expédition retournée était comptée chez l'AUTRE agence, avec le
 * destinataire comme client (l'échange expéditeur ⇄ destinataire du retour) ; « Retour en transit » / « Retour arrivé »
 * n'étaient pas comptés comme retours.
 *
 * Usage :
 *   node scripts/rattrapage-commercial-retours-2026-11-01.mjs           # simulation (aucune écriture)
 *   node scripts/rattrapage-commercial-retours-2026-11-01.mjs --apply   # sauvegarde puis corrige
 *
 * À lancer APRÈS le déploiement de syncCommercialStats corrigée. N'écrit JAMAIS dans parcels ni parcels_archive :
 * seulement commercialContrib et les totaux (commercialClients / commercialAgencies / commercialDays), via
 * syncCommercial (différence appliquée en transaction → rejouable sans double comptage).
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { contributionOf, syncCommercial, NUM_FIELDS } = require('../functions/commercial.js')

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
db.settings({ preferRest: true })
const { FieldValue } = admin.firestore

const RET = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const parcels = new Map()
for (const coll of ['parcels', 'parcels_archive']) {
  for (const q of [db.collection(coll).where('wasReturned', '==', true), db.collection(coll).where('status', 'in', RET)]) {
    for (const d of (await q.get()).docs) if (!parcels.has(d.id)) parcels.set(d.id, { coll, data: d.data() })
  }
}
console.log(`Expéditions retournées lues : ${parcels.size}`)

// Contributions déjà enregistrées → celles qui changent
const ids = [...parcels.keys()]
const stored = new Map()
for (let i = 0; i < ids.length; i += 300) {
  const refs = ids.slice(i, i + 300).map(id => db.collection('commercialContrib').doc(id))
  for (const s of await db.getAll(...refs)) stored.set(s.id, s.exists ? s.data() : null)
}
const todo = []
const moved = new Map()
for (const [id, { data }] of parcels) {
  const next = contributionOf(data)
  const old = stored.get(id)
  const same = old && next && ['client', 'agency', 'day'].every(k => old.targets?.[k] === next.targets[k])
    && NUM_FIELDS.every(k => (old.values?.[k] || 0) === (next.values[k] || 0)) && old.clientName === next.meta.clientName
  if (same || (!old && !next)) continue
  todo.push(id)
  const from = old?.targets?.agency?.split('_').slice(1).join('_') || '—'
  const to = next?.meta.city || '—'
  const k = `${from} → ${to}`
  const m = moved.get(k) || { n: 0, ca: 0 }; m.n++; m.ca += next?.values.ca || 0; moved.set(k, m)
}
console.log(`À corriger : ${todo.length}`)
;[...moved.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log(`  ${k} : ${v.n} exp., ${v.ca.toFixed(0)} DH`))

if (!APPLY) { console.log('\nSimulation : rien n\'a été écrit. Relancer avec --apply pour corriger.'); process.exit(0) }

// Sauvegarde : contributions + documents de totaux touchés (anciens et nouveaux)
const totalPaths = new Set()
for (const id of todo) {
  const old = stored.get(id); const next = contributionOf(parcels.get(id).data)
  for (const t of [old?.targets, next?.targets]) if (t) Object.values(t).forEach(p => totalPaths.add(p))
}
const backup = { at: new Date().toISOString(), contrib: {}, totals: {} }
todo.forEach(id => { backup.contrib[id] = stored.get(id) })
const paths = [...totalPaths]
for (let i = 0; i < paths.length; i += 300) {
  for (const s of await db.getAll(...paths.slice(i, i + 300).map(p => db.doc(p)))) backup.totals[s.ref.path] = s.exists ? s.data() : null
}
const file = `scripts/rattrapage-commercial-retours-backup-${Date.now()}.json`
writeFileSync(file, JSON.stringify(backup, null, 1))
console.log(`Sauvegarde : ${file} (${todo.length} contributions, ${paths.length} totaux)`)

let done = 0
for (const id of todo) {
  // Relecture à jour (l'expédition a pu changer depuis la lecture)
  const fresh = await db.collection(parcels.get(id).coll).doc(id).get()
  if (!fresh.exists) continue
  if (await syncCommercial(db, FieldValue, id, fresh.data())) done++
}
console.log(`Corrigées : ${done}`)
process.exit(0)
