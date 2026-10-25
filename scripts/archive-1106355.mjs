// Demande de l'admin (22/10/2026) : archiver 1106355 (Livré, sans COD, port payé). Sauvegarde avant.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const ref = db.doc('parcels/yzVh9I9J5ilqm0vxDUBB')
const p = (await ref.get()).data()
if (p.senderNic !== '1106355') throw new Error('Expédition inattendue')
console.log('createdAt :', JSON.stringify(p.createdAt), '| workDate :', p.workDate, '| historique[0] :', p.history?.[0]?.timestamp)
writeFileSync('scripts/archive-1106355-backup.json', JSON.stringify({ id: ref.id, isArchived: p.isArchived ?? null, archivedAt: p.archivedAt ?? null, archivedBy: p.archivedBy ?? null }))
await ref.update({ isArchived: true, archivedAt: new Date().toISOString(), archivedBy: 'admin-manual-1106355' })
console.log('archivée')
process.exit(0)
