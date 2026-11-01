/**
 * Lot C2 (01/11/2026) — reprend dans les fiches utilisateurs (users/{uid}.permissions) les droits qui étaient écrits dans
 * le code, pour que PERSONNE ne perde ni ne gagne un droit au passage :
 *  - « modification totale » : l'uid de zahra (utils/agentProAccess.ts, firestore.rules) ;
 *  - cartes « Livraison du jour » : 7 e-mails (config/livraisonStatsAccess.ts) ;
 *  - « Comptes clients » : noura@gmail.com (config/clientAccountsAccess.ts).
 * Sauvegarde des fiches touchées AVANT. Pose aussi tout de suite le claim `fullEdit` du jeton (comme le fera la Cloud
 * Function syncUserClaims pour les changements suivants).
 *   node scripts/migrer-droits-individuels-2026-11-01.mjs           # simulation
 *   node scripts/migrer-droits-individuels-2026-11-01.mjs --apply
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const FULL_EDIT_UIDS = ['OyaKKswnpseVgqtmMzdEB8RXjt92']
const STATS = {
  'noura@gmail.com': ['Agadir', 'Ait Melloul'], 'noura2@gmail.com': ['Ait Melloul'], 'bouzndag@gmail.com': ['Marrakech'],
  'said@gmail.com': ['Casablanca'], 'zinebechef@gmail.com': ['Agadir'], 'elkerdaouichef@gmail.com': ['Ait Melloul'], 'madanichef@gmail.com': ['Marrakech'],
}
const CLIENT_ACCOUNTS = ['noura@gmail.com']

const users = (await db.collection('users').get()).docs
const byEmail = new Map(users.map(d => [String(d.get('email') || '').trim().toLowerCase(), d]))
const plan = new Map() // uid → permissions à fusionner
const add = (d, p) => plan.set(d.id, { doc: d, perms: { ...(plan.get(d.id)?.perms || {}), ...p } })
for (const uid of FULL_EDIT_UIDS) { const d = users.find(x => x.id === uid); if (d) add(d, { fullParcelEdit: true }); else console.log('⚠️ compte introuvable :', uid) }
for (const [email, cities] of Object.entries(STATS)) { const d = byEmail.get(email); if (d) add(d, { livraisonStatsCities: cities }); else console.log('⚠️ compte introuvable :', email) }
for (const email of CLIENT_ACCOUNTS) { const d = byEmail.get(email); if (d) add(d, { clientAccounts: true }); else console.log('⚠️ compte introuvable :', email) }

for (const { doc: d, perms } of plan.values()) console.log(`  ${String(d.get('name') || d.id).padEnd(26)} ${String(d.get('role')).padEnd(18)} ${JSON.stringify(perms)}`)
console.log(`${plan.size} fiche(s) à compléter`)
if (!APPLY) { console.log('Simulation : rien n\'est écrit (ajouter --apply).'); process.exit(0) }

const BACKUP = `scripts/migrer-droits-backup-${Date.now()}.json`
writeFileSync(BACKUP, JSON.stringify([...plan.values()].map(({ doc: d }) => ({ id: d.id, permissions: d.get('permissions') ?? null }))))
console.log('Sauvegarde :', BACKUP)
for (const [uid, { doc: d, perms }] of plan) {
  const cur = d.get('permissions') && typeof d.get('permissions') === 'object' ? d.get('permissions') : {}
  await d.ref.update({ permissions: { ...cur, ...perms } })
  if (perms.fullParcelEdit) {
    const u = await admin.auth().getUser(uid)
    await admin.auth().setCustomUserClaims(uid, { ...(u.customClaims || {}), fullEdit: true })
    console.log(`  🔑 jeton : fullEdit posé pour ${d.get('name') || uid}`)
  }
}
console.log('✅ Droits repris dans les fiches.')
process.exit(0)
