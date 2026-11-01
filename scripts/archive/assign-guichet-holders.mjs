// 🏬 Ports payés encaissés AU GUICHET, PAS ENCORE remis / reçus : attribués à la personne en gare de la ville
// (demande du 23/10/2026 : « les anciens doivent aussi passer chez ces personnes »).
// Ajoute SEULEMENT portGuichetHolderId / portGuichetHolderName (rien d'autre n'est modifié).
// Usage : node scripts/assign-guichet-holders.mjs            → simulation (aucune écriture)
//         node scripts/assign-guichet-holders.mjs --apply    → sauvegarde puis écriture
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
// Même table que src/config/guichetHolders.ts
const HOLDERS = {
  'Ait Melloul': { id: 'XC5YJs1l1bS4G0MDdb3TSB6RF932', name: 'rachida' },
  Agadir: { id: 'OVMkys7PVFfx8zLvltBoQ4PN35x2', name: 'ENGAREAGA6017' },
  Marrakech: { id: '7K2AN6bkS3NnJuRRUyrbBPsN5Jz2', name: 'HAMZA EN GARE' },
}
const MONEY_START = new Date('2026-10-05T08:00:00+01:00').getTime()
const ms = v => (v?.toMillis ? v.toMillis() : v ? Date.parse(v) || 0 : 0)
const num = v => Number.parseFloat(String(v ?? '').replace(',', '.')) || 0
const todo = [], byCity = {}
for (const [city, h] of Object.entries(HOLDERS)) {
  const s = await db.collection('parcels').where('originCity', '==', city).where('portType', '==', 'port_paye').where('portStatus', '==', 'collected').get()
  for (const d of s.docs) {
    const p = d.data()
    // Même règle que isRamasseGuichet (src/utils/agencyCaisseRules.ts) + pas encore remis au chef d'exploitation
    if (p.portPayeMethod || p.pickupDriverId || p.portGuichetHolderId || p.portPayeExpReceivedAt) continue
    if (p.status === 'En cours de ramassage' || p.status === 'Annulé' || num(p.price) <= 0) continue
    if (ms(p.createdAt) < MONEY_START) continue
    if (p.returnedAt || p.wasReturned || p.status === 'Retourné') continue
    todo.push({ id: d.id, city, holder: h, nic: p.senderNic || p.sender?.nic || '', price: num(p.price), before: { portGuichetHolderId: p.portGuichetHolderId ?? null, portGuichetHolderName: p.portGuichetHolderName ?? null } })
    byCity[city] = byCity[city] || { n: 0, dh: 0, holder: h.name }; byCity[city].n++; byCity[city].dh += num(p.price)
  }
}
console.log(APPLY ? 'APPLICATION' : 'SIMULATION', '— ports payés du guichet non remis :', todo.length)
console.log(JSON.stringify(byCity, null, 1))
if (APPLY && todo.length) {
  const backup = `scripts/assign-guichet-holders-backup-${Date.now()}.json`
  writeFileSync(backup, JSON.stringify(todo.map(t => ({ id: t.id, nic: t.nic, before: t.before })), null, 1))
  console.log('sauvegarde :', backup)
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    for (const t of todo.slice(i, i + 400)) b.update(db.collection('parcels').doc(t.id), { portGuichetHolderId: t.holder.id, portGuichetHolderName: t.holder.name })
    await b.commit()
  }
  console.log('✅ écrit :', todo.length)
}
process.exit(0)
