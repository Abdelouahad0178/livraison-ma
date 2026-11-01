// ✅ Demande de l'admin (25/10/2026), diagnostic du 24/10 point 1.4 : expéditions dont l'argent (port dû / COD) est
// encaissé mais restées non livrées — confirmées LIVRÉES par l'admin. Statut « Livré » ; date de livraison = date
// d'ENCAISSEMENT (la plus ancienne des deux), pour ne pas changer les journées / soldes ; livreur, montants et
// encaissements inchangés. Trace dans l'historique. Sauvegarde avant écriture. Sans « --apply » : essai à blanc.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), FV = admin.firestore.FieldValue
const APPLY = process.argv.includes('--apply')
const BY = 'Admin (réparation du 25/10/2026)'
const NICS = ['1094461', '1077349', '1096130', '1061611', '1212936', '1212625', '1057734', '1077852D', '1097721', '1090665', '1086850', '1096131']
const ms = v => v == null ? null : v.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null
const fr = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ops = [], backup = []
for (const nic of NICS) {
  const s = await db.collection('parcels').where('senderNic', '==', nic).get()
  if (s.size !== 1) { console.log(`${nic} : ${s.size} expédition(s) — ignorée`); continue }
  const x = s.docs[0], p = x.data()
  if (p.status === 'Livré') { console.log(`${nic} : déjà Livré`); continue }
  const t = [ms(p.portCollectedAt), ms(p.codCollectedAt)].filter(Boolean).sort((a, b) => a - b)[0]
  if (!t) { console.log(`${nic} : aucune date d'encaissement — ignorée`); continue }
  const when = new Date(t).toISOString()
  const by = p.deliveryDriverName || p.portCollectedBy || p.codCollectedBy || 'Agence'
  ops.push({ ref: x.ref, label: `${nic} | ${p.originCity}→${p.destinationCity} | ${p.status} → Livré le ${fr(t)} (livreur ${p.deliveryDriverName || '—'})`, upd: {
    status: 'Livré', deliveredAt: when, deliveredBy: by,
    history: FV.arrayUnion({ status: 'Livré', timestamp: new Date().toISOString(), by: BY, note: `✅ Livraison confirmée par l'admin (réparation) : argent encaissé le ${fr(t)}, expédition restée « ${p.status} » — livrée à cette date` }),
    lastAdminEditAt: new Date().toISOString(), lastAdminEditBy: BY,
  } })
  backup.push({ id: x.id, data: p })
}
ops.forEach(o => console.log((APPLY ? '✅ ' : '🔎 ') + o.label))
if (!APPLY) { console.log(`ESSAI À BLANC (${ops.length}) — relancer avec --apply`); process.exit(0) }
const file = `scripts/mark-delivered-1-4-backup-${Date.now()}.json`
writeFileSync(file, JSON.stringify(backup, null, 1))
console.log('💾 Sauvegarde :', file)
const b = db.batch(); ops.forEach(o => b.update(o.ref, o.upd)); await b.commit()
console.log(`TERMINÉ : ${ops.length} expéditions passées « Livré »`)
process.exit(0)
