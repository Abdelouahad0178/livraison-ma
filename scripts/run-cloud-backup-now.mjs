/**
 * ☁️ Lance à la main la sauvegarde cloud (même code que la fonction du dimanche : functions/cloudBackup.js), puis relit le fichier
 * envoyé et vérifie qu'il est complet. Lit la base, n'écrit que dans Storage (auto-backups/). — 06/11/2026.
 *
 * Usage, avec la limite de mémoire du serveur :  node --max-old-space-size=800 scripts/run-cloud-backup-now.mjs
 */
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const fnRequire = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, cert } = fnRequire('firebase-admin/app')
const { getFirestore } = fnRequire('firebase-admin/firestore')
const { getStorage } = fnRequire('firebase-admin/storage')
const { runCloudBackup } = fnRequire('./cloudBackup.js')

initializeApp({ credential: cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = getFirestore()
const bucket = getStorage().bucket('arelanc.firebasestorage.app')

if (!process.argv.includes('--relire')) {
  let peak = 0
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed) }, 500)
  const r = await runCloudBackup(db, bucket, { log: () => {} })
  clearInterval(sample)
  console.log(`Sauvegarde : ${r.documents} documents, ${Math.round(r.chars / 1048576)} Mo avant compression, ${r.seconds} s`)
  console.log(`Mémoire au plus haut : ${Math.round(peak / 1048576)} Mo (le serveur plantait vers 800 Mo)`)
  console.log('Collections en erreur :', JSON.stringify(r.errors))
  console.log('Anciens fichiers retirés :', r.deleted)
  process.exit(0)
}

// --relire (à lancer SANS limite de mémoire) : relecture du dernier fichier réellement présent dans Storage
const [all] = await bucket.getFiles({ prefix: 'auto-backups/backup-bgexpress-' })
const file = all.sort((a, b) => a.name.localeCompare(b.name))[all.length - 1]
const [meta] = await file.getMetadata()
console.log(`Fichier : ${file.name} — ${Math.round(Number(meta.size) / 1048576)} Mo compressé (${meta.contentEncoding}) — documents notés : ${meta.metadata?.documents}, erreurs : ${meta.metadata?.errors}`)
const [content] = await file.download()
const o = JSON.parse(content.toString('utf8'))
const reels = Object.values(o.collections).reduce((s, d) => s + d.length, 0)
console.log(`Relecture : format ${o.schema} | ${Object.keys(o.collections).length} collections | ${reels} documents | conforme : ${String(reels) === meta.metadata?.documents && Object.entries(o.counts).every(([n, c]) => o.collections[n].length === c)}`)
console.log('Erreurs dans le fichier :', JSON.stringify(o.errors))
console.log(`Fichiers gardés : ${all.length}, ${Math.round(all.reduce((s, f) => s + Number(f.metadata.size), 0) / 1048576)} Mo au total`)
process.exit(0)
