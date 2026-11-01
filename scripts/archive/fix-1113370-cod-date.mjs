// Demande de l'admin (20/10/2026) : 1113370 — COD espèces 1 228,05 DH « collecté » par une modification admin du
// 19/10 14:47 SANS date ni auteur de collecte → date et auteur complétés (livreur hassan smaili6009). Sauvegarde avant.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const s = await db.collection('parcels').where('senderNic', '==', '1113370').get()
if (s.size !== 1) throw new Error('Expédition introuvable ou en double')
const ref = s.docs[0].ref, p = s.docs[0].data()
if (p.codStatus !== 'collected' || p.codCollectedAt || Number(p.codAmount) !== 1228.05) throw new Error('État inattendu — rien modifié')
writeFileSync('scripts/fix-1113370-cod-date-backup.json', JSON.stringify({ id: ref.id, codCollectedAt: p.codCollectedAt ?? null, codCollectedBy: p.codCollectedBy ?? null, codCollectedById: p.codCollectedById ?? null }, null, 2))
await ref.update({
  codCollectedAt: '2026-10-19T14:47:46.120Z',
  codCollectedBy: 'hassan smaili6009',
  codCollectedById: 'nS2g24NRdKWI0aO6mCG4zTa2zis2',
  history: admin.firestore.FieldValue.arrayUnion({ status: 'Livré', timestamp: new Date().toISOString(), note: 'Correction admin : date et auteur de collecte du COD complétés (19/10/2026 14:47, hassan smaili6009) — collecte enregistrée sans date par une modification admin' }),
})
console.log('OK', ref.id)
process.exit(0)
