// 💰 Demande de l'admin (24/10/2026) : les 42 ports dus encaissés les 06-07/10 par l'ancien compte SUPPRIMÉ
// « ABDELLAH ELKERDAOUI » (sGaOgPsM…), jamais reçus, passent au compte actuel « ABDELLAH EL KERDAOUI »
// (chef d'exploitation Ait Melloul). Seuls portCollectedBy / portCollectedById changent ; la DATE d'encaissement
// est conservée (pas de gonflement du solde du jour). Trace dans l'historique. Sauvegarde avant écriture.
// Sans « --apply » : essai à blanc.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const START = new Date(2026, 9, 5, 8).getTime()
const users = (await db.collection('users').get()).docs
const oldIds = users.map(d => d.id)
const target = users.find(d => d.data().role === 'chef_exploitation' && d.data().city === 'Ait Melloul' && /EL KERDAOUI/i.test(d.data().name || ''))
if (!target) throw new Error('Compte cible introuvable')
const T = { id: target.id, name: target.data().name }
const ms = v => v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null
const s = await db.collection('parcels').where('portCollectedBy', '==', 'ABDELLAH ELKERDAOUI').get()
const list = s.docs.filter(x => { const p = x.data()
  return String(p.portCollectedById || '').startsWith('sGaOgP') && !oldIds.includes(p.portCollectedById) && p.portType === 'port_du'
    && p.portStatus === 'collected' && ms(p.portCollectedAt) >= START && !p.portExpReceivedAt && !p.portChefReceivedAt })
const total = list.reduce((t, x) => t + (parseFloat(x.data().price) || 0), 0)
console.log(`${list.length} expéditions, ${total} DH → ${T.name} (${T.id.slice(0, 8)}…)`)
if (list.length !== 42 || total !== 1840) { console.log('⚠️ Nombre / total inattendu (attendu 42 / 1840) — ARRÊT'); process.exit(1) }
if (!APPLY) { console.log('ESSAI À BLANC — relancer avec --apply'); process.exit(0) }
const file = `scripts/reassign-portdu-collector-backup-${Date.now()}.json`
writeFileSync(file, JSON.stringify(list.map(x => ({ id: x.id, data: x.data() })), null, 1))
console.log('💾 Sauvegarde :', file)
const now = new Date().toISOString(), BY = 'Admin (demande du 24/10/2026)'
const batch = db.batch()
for (const x of list) {
  const p = x.data()
  batch.update(x.ref, {
    portCollectedBy: T.name, portCollectedById: T.id,
    history: admin.firestore.FieldValue.arrayUnion({ status: p.status, timestamp: now, by: BY,
      note: `💰 Port dû encaissé le ${new Date(ms(p.portCollectedAt)).toLocaleDateString('fr-FR')} par l'ancien compte supprimé « ${p.portCollectedBy} » : rattaché au compte actuel « ${T.name} » (date d'encaissement inchangée)` }),
    adminChanges: admin.firestore.FieldValue.arrayUnion({ field: 'Port dû encaissé par', oldValue: `${p.portCollectedBy} (compte supprimé)`, newValue: T.name, changedAt: now, changedBy: BY }),
    lastAdminEditAt: now, lastAdminEditBy: BY,
  })
}
await batch.commit()
console.log(`✅ ${list.length} expéditions rattachées à ${T.name}`)
process.exit(0)
