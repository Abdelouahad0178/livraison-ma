/**
 * 🧳 Archivage des expéditions de PASSAGERS à 15 jours (au lieu de 30) — 04/11/2026.
 *
 * Usage :
 *   node scripts/archive-passagers-15j.mjs           # essai : liste ce qui serait archivé, AUCUNE écriture
 *   node scripts/archive-passagers-15j.mjs --apply   # sauvegarde d'abord (scripts/archive-passagers-backup-*.json), puis archive
 *
 * Même règle et même code que l'archivage automatique (functions/archivePassagers.js →
 * functions/shared/passagerArchive.js, compilé depuis src/utils/passagerArchive.ts).
 * Champs écrits sur chaque expédition : isArchived: true, archivedAt, archivedBy: 'auto-system-passager-15j'.
 * Annuler : remettre isArchived: false et supprimer archivedAt / archivedBy des expéditions de la sauvegarde
 * (ou bouton « Désarchiver » de la page Admin, expédition par expédition).
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { findPassagerArchives, writePassagerArchives } = require('../functions/archivePassagers.js')

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const now = Date.now()
const { scannedCandidates, names, found, seen } = await findPassagerArchives(db, { now })
const day = ms => new Date(ms).toISOString().slice(0, 10)
const rows = found.map(p => ({
  id: p.id, nic: p.senderNic || '', createdAt: p.createdAt?.toDate?.().toISOString() || '',
  from: p.originCity || '', to: p.destinationCity || '', sender: p.senderNameNorm, receiver: p.receiverNameNorm,
  senderSeen: seen.get(String(p.senderNameNorm)), receiverSeen: seen.get(String(p.receiverNameNorm)),
  portType: p.portType, portStatus: p.portStatus,
  before: { isArchived: p.isArchived ?? null, archivedAt: p.archivedAt ?? null, archivedBy: p.archivedBy ?? null },
}))
console.log(`Livrées, simples, port réglé, hors compte, créées entre ${day(now - 31 * 864e5)} et ${day(now - 15 * 864e5)} : ${scannedCandidates}`)
console.log(`Noms comptés : ${names} — expéditions de passagers à archiver : ${found.length}`)
rows.slice(0, 15).forEach(r => console.log(`  ${r.nic}  ${r.from} → ${r.to}  ${r.sender} (${r.senderSeen}) → ${r.receiver} (${r.receiverSeen})  ${r.portType}/${r.portStatus}`))
writeFileSync(new URL('./archive-passagers-liste.json', import.meta.url), JSON.stringify(rows, null, 2))

if (!APPLY) {
  console.log('\nEssai seulement : rien n\'a été écrit. Liste : scripts/archive-passagers-liste.json')
  process.exit(0)
}

const backup = new URL(`./archive-passagers-backup-${new Date(now).toISOString().slice(0, 19).replace(/:/g, '-')}.json`, import.meta.url)
writeFileSync(backup, JSON.stringify({ at: new Date(now).toISOString(), rule: 'passagers 15 j', rows }, null, 2))
console.log(`\nSauvegarde : ${backup.pathname}`)
const r = await writePassagerArchives(db, found, { now })
console.log(`Archivées : ${r.archived} — laissées (modifiées entre-temps ou erreur) : ${r.skipped}`)
process.exit(0)
