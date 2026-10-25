// Demande de l'admin (20/10/2026) : la photo de Zinebe (compte encaisseur central zinebe@gmail.com) est reprise
// pour son compte chef d'exploitation (zinebechef@gmail.com). Même fichier (même adresse) ; sauvegarde avant.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const src = (await db.doc('users/2LcfdIbOmxczPVcz3rCg9wzz96J2').get()).data()
const ref = db.doc('users/N1gHn9JuBnOdUEM90vRhBfnl1xP2')
const cur = (await ref.get()).data()
if (src?.email !== 'zinebe@gmail.com' || cur?.email !== 'zinebechef@gmail.com' || !src.photoURL) throw new Error('Comptes inattendus')
writeFileSync('scripts/set-photo-zinebechef-backup.json', JSON.stringify({ id: ref.id, photoURL: cur.photoURL ?? null }, null, 2))
await ref.update({ photoURL: src.photoURL })
console.log('Photo reprise pour zinebechef@gmail.com (sauvegarde : scripts/set-photo-zinebechef-backup.json)')
process.exit(0)
