// Demande de l'admin (22/10/2026) : 1106355 — createdAt enregistré comme objet { seconds, nanoseconds } (pas une vraie date)
// → affiché en tête de toutes les listes triées par date. Remis en vraie date (MÊME instant : 31/07/2026 11:00 Maroc). Sauvegarde avant.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const ref = db.doc('parcels/yzVh9I9J5ilqm0vxDUBB')
const p = (await ref.get()).data()
if (p.senderNic !== '1106355') throw new Error('Expédition inattendue')
const c = p.createdAt
if (c instanceof admin.firestore.Timestamp) { console.log('Déjà une vraie date, rien à faire.'); process.exit(0) }
if (!c || typeof c.seconds !== 'number') throw new Error('Format inattendu — rien modifié')
writeFileSync('scripts/fix-1106355-createdAt-backup.json', JSON.stringify({ id: ref.id, createdAt: c }))
const ts = new admin.firestore.Timestamp(c.seconds, c.nanoseconds || 0)
await ref.update({ createdAt: ts })
const after = (await ref.get()).data().createdAt
console.log('createdAt corrigé :', after instanceof admin.firestore.Timestamp, after.toDate().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' }))
process.exit(0)
