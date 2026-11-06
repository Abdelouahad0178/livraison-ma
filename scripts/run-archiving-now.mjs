/**
 * 🗄️ Lancer MAINTENANT, à la main, l'archivage automatique quotidien (même code que la fonction de 2 h :
 * functions/weeklyArchiving.js) — 04/11/2026.
 *
 * Usage :
 *   node scripts/run-archiving-now.mjs           # essai : compte ce qui serait archivé, AUCUNE écriture
 *   node scripts/run-archiving-now.mjs --apply   # essai + sauvegarde (scripts/archivage-auto-backup-*.json), puis archivage
 *
 * Utilise le firebase-admin des Cloud Functions (functions/node_modules) : mêmes Timestamp / FieldValue que le serveur.
 * Annuler : remettre isArchived: false et supprimer archivedAt / archivedBy des expéditions de la sauvegarde.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'

const fnRequire = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, cert } = fnRequire('firebase-admin/app')
const { getFirestore } = fnRequire('firebase-admin/firestore')
const { runWeeklyArchiving } = fnRequire('./weeklyArchiving.js')

const APPLY = process.argv.includes('--apply')
initializeApp({ credential: cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = getFirestore()

const dry = await runWeeklyArchiving(db, { apply: false })
const tally = dry.planned.reduce((m, p) => (m[p.rule] = (m[p.rule] || 0) + 1, m), {})
console.log('\nEssai :', dry.planned.length, 'à archiver', tally, dry.timedOut ? '(⚠️ temps épuisé : liste incomplète)' : '')
const byStatus = dry.planned.reduce((m, p) => (m[p.status] = (m[p.status] || 0) + 1, m), {})
console.log('par statut :', byStatus)
const withCod = dry.planned.filter(p => p.codAmount > 0)
console.log('dont avec COD :', withCod.length, withCod.slice(0, 10).map(p => `${p.nic} ${p.status} ${p.codAmount} DH`))
const day = new Date().toISOString().slice(0, 10)
writeFileSync(new URL('./archivage-auto-liste.json', import.meta.url), JSON.stringify(dry.planned, null, 2))

if (!APPLY) {
  console.log('\nEssai seulement : rien n\'a été écrit. Liste : scripts/archivage-auto-liste.json')
  process.exit(0)
}

// Sauvegarde : état d'archivage AVANT, relu pour chaque expédition prévue
const before = []
for (let i = 0; i < dry.planned.length; i += 300) {
  const snaps = await db.getAll(...dry.planned.slice(i, i + 300).map(p => db.collection('parcels').doc(p.id)))
  snaps.forEach(s => { const x = s.data() || {}; before.push({ id: s.id, nic: x.senderNic || '', isArchived: x.isArchived ?? null, archivedAt: x.archivedAt ?? null, archivedBy: x.archivedBy ?? null }) })
}
const backup = new URL(`./archivage-auto-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`, import.meta.url)  // un fichier par passage : jamais écrasé
writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), planned: dry.planned, before }, null, 2))
console.log('Sauvegarde :', backup.pathname)

const r = await runWeeklyArchiving(db, { apply: true })
console.log('\nArchivage fait :', r)
process.exit(0)
