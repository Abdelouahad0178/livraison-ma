// Marque « validation commencée » les 2 envois d'Agadir dont la validation s'est arrêtée le 30/10/2026 vers 13:32
// (AKHERRAZE NOURA) : 53/58 COD et 240/537 ports déjà reçus. Ne touche QUE ces 2 envois (aucune expédition).
// Sauvegarde avant ; sans --apply : affichage seulement.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const IDS = ['NBB16YGwWCfL85lUIAbH', 'mUr1Yta0wO6XdMWg5LUs']
const APPLY = process.argv.includes('--apply')
const backup = []
for (const id of IDS) {
  const s = await db.collection('valeursEnvois').doc(id).get()
  const e = s.data()
  backup.push({ id, status: e.status, validationStartedAt: e.validationStartedAt ?? null, validationStartedBy: e.validationStartedBy ?? null })
  console.log(id, e.status, e.group, Math.round(e.totals.total.amount), 'DH', e.validationStartedAt ? 'déjà marqué' : 'à marquer')
}
if (APPLY) {
  const file = `scripts/envois-interrompus-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify(backup, null, 1))
  for (const b of backup) {
    if (b.status !== 'envoye' || b.validationStartedAt) continue
    await db.collection('valeursEnvois').doc(b.id).update({
      validationStartedAt: admin.firestore.Timestamp.fromDate(new Date('2026-10-30T13:32:00+01:00')),
      validationStartedBy: 'AKHERRAZE NOURA',
    })
  }
  console.log('marqués — sauvegarde :', file)
}
process.exit(0)
