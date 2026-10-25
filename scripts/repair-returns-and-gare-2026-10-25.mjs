// 🔧 Réparations demandées par l'admin (25/10/2026), diagnostic du 24/10 :
// 2.3 retours jamais inversés (statut de retour sans returnToCity / returnedAt / wasReturned) → même inversion que
//     markParcelAsReturned (expéditeur ⇄ destinataire, villes, ville de retour, livreur retiré, preReturn). Le STATUT
//     actuel est gardé. COD : remis à 0 (comme un vrai retour) SAUF s'il est déjà encaissé. Ignorés : retours ayant
//     déjà une expédition retour créée à part (returnOf).
// 2.1 livreur d'une autre ville que la destination : compte « En gare » (livreur-gare) → « En gare » de la ville de
//     destination (tous statuts) ; vrai livreur d'une autre ville → assignation retirée SEULEMENT si non livrée
//     (« En cours de livraison » → « Arrivé en agence ») ; livrées par un vrai livreur : inchangées.
// Sauvegarde complète avant écriture. Sans « --apply » : essai à blanc.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), FV = admin.firestore.FieldValue
const APPLY = process.argv.includes('--apply')
const BY = 'Admin (réparation du 25/10/2026)'
const now = new Date().toISOString()
const users = new Map((await db.collection('users').get()).docs.map(d => [d.id, d.data()]))
const gareOf = city => { for (const [id, u] of users) if (u.role === 'livreur-gare' && u.city === city) return id; return null }
const nic = p => p.senderNic || p.trackingId
const RET = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const keep = v => (v === undefined ? null : v)
const DELIVERY = ['deliveryDriverId', 'deliveryDriverName', 'deliverySectorId', 'deliverySectorCode', 'deliverySectorName', 'deliveryVehicleId', 'deliveryVehicleLabel', 'deliveryAssignedAt', 'deliveryAssignedBy']
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ops = [], backup = []

// ── 2.3
const rets = (await db.collection('parcels').where('status', 'in', RET).get()).docs.filter(x => { const p = x.data(); return !p.returnToCity && !p.returnedAt && !p.wasReturned })
let skippedLinked = 0
for (const x of rets) {
  const p = x.data()
  const linked = await db.collection('parcels').where('returnOf', '==', x.id).limit(1).get()
  if (!linked.empty) { skippedLinked++; console.log(`2.3 ignorée (expédition retour existe : ${nic(linked.docs[0].data())}) : ${nic(p)}`); continue }
  const codCashed = (+p.codAmount || 0) > 0 && p.codStatus && p.codStatus !== 'pending'
  // Date du retour : 1re ligne « Retourné » de l'historique, sinon maintenant
  const hRet = (p.history || []).find(h => h && h.status === 'Retourné' && h.timestamp)
  const returnedAt = hRet ? (typeof hRet.timestamp === 'string' ? hRet.timestamp : (hRet.timestamp.toDate ? hRet.timestamp.toDate().toISOString() : now)) : now
  const preReturn = {
    status: keep(p.status), sender: keep(p.sender), receiver: keep(p.receiver), originCity: keep(p.originCity), destinationCity: keep(p.destinationCity),
    returnToCity: keep(p.returnToCity), codAmount: keep(p.codAmount), codMixed: keep(p.codMixed), codCashAmount: keep(p.codCashAmount), arrivedNbColis: keep(p.arrivedNbColis),
    ...Object.fromEntries(DELIVERY.map(k => [k, keep(p[k])])),
  }
  const upd = {
    preReturn, sender: p.receiver || {}, receiver: p.sender || {},
    senderNameNorm: norm(p.receiver && p.receiver.name), receiverNameNorm: norm(p.sender && p.sender.name),
    originCity: p.destinationCity || '', destinationCity: p.originCity || '', returnToCity: p.originCity || '',
    ...(codCashed ? {} : { codAmount: 0 }),
    returnedAt, wasReturned: true,
    returnedByDriverId: p.deliveryDriverId || null, returnedByDriverName: p.deliveryDriverName || '',
    arrivedNbColis: FV.delete(),
    ...Object.fromEntries(DELIVERY.map(k => [k, FV.delete()])),
    history: FV.arrayUnion({ status: p.status, timestamp: now, by: BY, note: `↩️ Retour complété (réparation) : expéditeur ⇄ destinataire et villes inversés (${p.originCity} → ${p.destinationCity} devient ${p.destinationCity} → ${p.originCity})${codCashed ? ' — COD déjà encaissé conservé' : ''}` }),
    lastAdminEditAt: now, lastAdminEditBy: BY,
  }
  const codNote = codCashed ? ' (COD encaissé gardé)' : (+p.codAmount || 0) > 0 ? ` (COD ${p.codAmount} → 0, gardé dans preReturn)` : ''
  ops.push({ ref: x.ref, upd, label: `2.3 ${nic(p)} ${p.status} : ${p.originCity}→${p.destinationCity} ⇒ ${p.destinationCity}→${p.originCity}${codNote}` })
  backup.push({ id: x.id, data: p })
}

// ── 2.1
const withDriver = (await db.collection('parcels').where('deliveryDriverId', '!=', null).get()).docs
const keptDelivered = []
for (const x of withDriver) {
  const p = x.data()
  if (RET.includes(p.status)) continue
  const u = users.get(p.deliveryDriverId); if (!u) continue
  const dest = p.destinationCity || ''
  const isGareAcc = u.role === 'livreur-gare'
  const c = u.city || ''
  const pair = [c, dest].sort().join('|') === 'Agadir|Ait Melloul'
  const nameCity = /^En gare - /i.test(p.deliveryDriverName || '') ? p.deliveryDriverName.replace(/^En gare - /i, '') : null
  const wrong = (c && dest && c !== dest && !(pair && !isGareAcc)) || (isGareAcc && nameCity && nameCity !== dest)
  if (!wrong) continue
  if (isGareAcc) {
    const g = gareOf(dest)
    if (!g) { console.log(`2.1 pas de compte « En gare » à ${dest} : ${nic(p)} inchangée`); continue }
    ops.push({ ref: x.ref, label: `2.1 ${nic(p)} ${p.status} → ${dest} : « ${p.deliveryDriverName} » ⇒ « En gare - ${dest} »`, upd: {
      deliveryDriverId: g, deliveryDriverName: `En gare - ${dest}`,
      history: FV.arrayUnion({ status: p.status, timestamp: now, by: BY, note: `🚉 Livreur corrigé (réparation) : « ${p.deliveryDriverName} » (${c}) remplacé par « En gare - ${dest} » (ville de destination)` }),
      lastAdminEditAt: now, lastAdminEditBy: BY } })
    backup.push({ id: x.id, data: p })
  } else if (p.status !== 'Livré') {
    ops.push({ ref: x.ref, label: `2.1 ${nic(p)} ${p.status} → ${dest} : assignation à ${p.deliveryDriverName} (${c}) retirée${p.status === 'En cours de livraison' ? ', statut → Arrivé en agence' : ''}`, upd: {
      ...Object.fromEntries(DELIVERY.map(k => [k, null])),
      ...(p.status === 'En cours de livraison' ? { status: 'Arrivé en agence' } : {}),
      history: FV.arrayUnion({ status: p.status === 'En cours de livraison' ? 'Arrivé en agence' : p.status, timestamp: now, by: BY, note: `🚚 Assignation retirée (réparation) : ${p.deliveryDriverName} est un livreur de ${c}, l'expédition va à ${dest}` }),
      lastAdminEditAt: now, lastAdminEditBy: BY } })
    backup.push({ id: x.id, data: p })
  } else keptDelivered.push(`${nic(p)} (${p.deliveryDriverName}, ${c} → ${dest})`)
}
ops.forEach(o => console.log((APPLY ? '✅ ' : '🔎 ') + o.label))
console.log(`\n2.3 : ${ops.filter(o => o.label.startsWith('2.3')).length} retours inversés, ${skippedLinked} ignorés (expédition retour séparée)`)
console.log(`2.1 : ${ops.filter(o => o.label.startsWith('2.1')).length} corrigées ; livrées par un vrai livreur d'une autre ville, INCHANGÉES : ${keptDelivered.length} → ${keptDelivered.join(' ; ')}`)
if (!APPLY) { console.log('ESSAI À BLANC — relancer avec --apply'); process.exit(0) }
const file = `scripts/repair-returns-and-gare-backup-${Date.now()}.json`
writeFileSync(file, JSON.stringify(backup, null, 1))
console.log('💾 Sauvegarde :', file)
for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach(o => b.update(o.ref, o.upd)); await b.commit() }
console.log(`TERMINÉ : ${ops.length} expéditions mises à jour`)
process.exit(0)
