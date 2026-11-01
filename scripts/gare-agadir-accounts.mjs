/**
 * Comptes « en gare » d'Agadir (demande du 26/10/2026) — AUCUNE expédition modifiée.
 *  1. ENGAREAGA6017 (OVMkys…) renommé « ENGAREAGA6017 ANCIEN » (anciennes expéditions livrées en gare) ;
 *  2. création de « ENGAREAGA6017 RAMASSAGE » (livreur, Agadir) : détenteur des ports payés saisis au guichet d'Agadir
 *     (src/config/guichetHolders.ts). Pas de mot de passe : les comptes livreur ne se connectent plus (23/10/2026).
 * Usage : node scripts/gare-agadir-accounts.mjs            (simulation)
 *         node scripts/gare-agadir-accounts.mjs --apply    (sauvegarde puis écriture)
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const OLD_ID = 'OVMkys7PVFfx8zLvltBoQ4PN35x2'
const NEW_NAME_OLD = 'ENGAREAGA6017 ANCIEN'
const NEW_ACCOUNT = { name: 'ENGAREAGA6017 RAMASSAGE', email: 'engareaga6017.ramassage@arelanc.local' }

const oldSnap = await db.doc(`users/${OLD_ID}`).get()
if (!oldSnap.exists) throw new Error('Compte ENGAREAGA6017 introuvable')
const old = oldSnap.data()
console.log(`1. ${old.name} → ${NEW_NAME_OLD}`)
const existing = await admin.auth().getUserByEmail(NEW_ACCOUNT.email).catch(() => null)
console.log(`2. ${NEW_ACCOUNT.name} (${NEW_ACCOUNT.email}) : ${existing ? 'existe déjà (' + existing.uid + ')' : 'à créer'}`)
if (!APPLY) { console.log('\nSimulation : relancer avec --apply'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(`scripts/users-engareaga6017-backup-${stamp}.json`, JSON.stringify({ id: OLD_ID, data: old }, null, 1))
await db.doc(`users/${OLD_ID}`).update({ name: NEW_NAME_OLD })
let uid = existing?.uid
if (!uid) uid = (await admin.auth().createUser({ email: NEW_ACCOUNT.email, displayName: NEW_ACCOUNT.name })).uid
await db.doc(`users/${uid}`).set({
  email: NEW_ACCOUNT.email, name: NEW_ACCOUNT.name, role: 'livreur', chauffeurType: 'livreur', city: 'Agadir',
  tel: old.tel || '', matricule: '', directorPermissions: [], blockedByChef: false,
  ...(old.sectorId ? { sectorId: old.sectorId } : {}),
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true })
console.log(`\n✅ Renommé ; compte créé : uid ${uid}`)
process.exit(0)
