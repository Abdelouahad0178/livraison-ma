/**
 * Annulation du 27/10/2026 (demande utilisateur) — AUCUNE expédition modifiée (aucune ne référence RAMASSAGE, vérifié) :
 *  1. « ENGAREAGA6017 ANCIEN » (OVMkys…) redevient « ENGAREAGA6017 » ;
 *  2. « ENGAREAGA6017 RAMASSAGE » (9pctt…) supprimé définitivement (compte de connexion + fiche users).
 * Usage : node scripts/gare-agadir-revert.mjs            (simulation)
 *         node scripts/gare-agadir-revert.mjs --apply    (sauvegarde puis écriture)
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const OLD_ID = 'OVMkys7PVFfx8zLvltBoQ4PN35x2'
const RAM_ID = '9pcttQ2dlCXILnznKoAFPfVXx822'

const old = (await db.doc(`users/${OLD_ID}`).get()).data()
const ram = (await db.doc(`users/${RAM_ID}`).get()).data() || null
const refs = await Promise.all(['portGuichetHolderId', 'deliveryDriverId', 'pickupDriverId', 'portCollectedById']
  .map(f => db.collection('parcels').where(f, '==', RAM_ID).count().get().then(s => s.data().count)))
console.log(`1. ${old?.name} → ENGAREAGA6017`)
console.log(`2. suppression de ${ram?.name || '(fiche absente)'} — expéditions qui le référencent : ${refs.reduce((a, b) => a + b, 0)}`)
if (refs.some(n => n > 0)) throw new Error('Des expéditions référencent encore RAMASSAGE : arrêt.')
if (!APPLY) { console.log('\nSimulation : relancer avec --apply'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(`scripts/users-gare-revert-backup-${stamp}.json`, JSON.stringify({ [OLD_ID]: old, [RAM_ID]: ram }, null, 1))
await db.doc(`users/${OLD_ID}`).update({ name: 'ENGAREAGA6017' })
await db.doc(`users/${RAM_ID}`).delete()
await admin.auth().deleteUser(RAM_ID).catch(e => console.warn('Compte de connexion :', e.message))
console.log('\n✅ ENGAREAGA6017 rétabli ; RAMASSAGE supprimé')
process.exit(0)
