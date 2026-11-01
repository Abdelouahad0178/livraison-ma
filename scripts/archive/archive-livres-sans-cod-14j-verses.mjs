/** Option 1 de l'admin (22/10/2026) : archiver les expéditions LIVRÉES, SANS COD, PORT RÉGLÉ, créées il y a plus de 14 jours,
 *  dont l'argent du port a FINI son circuit (rien encore « à verser ») :
 *   - aucun argent liquide (port en compte, prix 0) ;
 *   - argent d'avant le 05/10/2026 08:00 (hors vrai calcul) ;
 *   - port versé à l'admin (portAdminTransferred / adminTransferred).
 *  Les ports encaissés mais pas encore versés à l'admin sont EXCLUS (ils resteraient sinon invisibles dans « à verser »).
 *  Sans --apply : comptage seulement. Avec --apply : sauvegarde des ids puis archivage (même marquage que l'archivage auto). */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
// --include-a-verser : demande de l'admin (22/10/2026) — archiver AUSSI les ports encaissés pas encore versés à l'admin
const INCLUDE_A_VERSER = process.argv.includes('--include-a-verser')
const TAG = 'admin-manual-livres-sans-cod-14j-2026-10-22'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const MONEY_START = new Date('2026-10-05T08:00:00+01:00').getTime()
const cutoff = Date.now() - 14 * 86400000
const ms = v => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() || 0 : 0)
const s = await db.collection('parcels').where('status', '==', 'Livré').where('isArchived', '==', false).get()
const groups = { aucunArgent: [], avantDebut: [], verseAdmin: [], aVerser: [] }
let considered = 0
for (const d of s.docs) {
  const p = d.data()
  if (Number(p.codAmount) > 0) continue
  const t = ms(p.createdAt); if (!t || t >= cutoff) continue
  const t2 = String(p.portType || '')
  const portPending = (t2 === 'port_du' && !p.portPayeMethod && !['collected', 'received'].includes(p.portStatus)) || (t2 === 'port_paye' && p.portStatus === 'collected')
  if (portPending) continue
  considered++
  const price = Number(p.price) || 0
  if (price <= 0 || t2.startsWith('port_en_compte')) groups.aucunArgent.push(d)
  else if ((t2 === 'port_du' ? ms(p.portCollectedAt) || t : t) < MONEY_START) groups.avantDebut.push(d)
  else if (p.portAdminTransferred || p.adminTransferred) groups.verseAdmin.push(d)
  else groups.aVerser.push(d)
}
const todo = [...groups.aucunArgent, ...groups.avantDebut, ...groups.verseAdmin, ...(INCLUDE_A_VERSER ? groups.aVerser : [])]
const byCity = l => l.reduce((m, d) => { const c = d.get('destinationCity') || '?'; m[c] = (m[c] || 0) + 1; return m }, {})
const byType = l => l.reduce((m, d) => { const c = d.get('portType') || '?'; m[c] = (m[c] || 0) + 1; return m }, {})
console.log(`Livrées non archivées : ${s.size} | sans COD, port réglé, + de 14 jours : ${considered}`)
console.log(`  aucun argent liquide (en compte / prix 0) : ${groups.aucunArgent.length}`, byType(groups.aucunArgent))
console.log(`  argent d'avant le 05/10 (hors calcul)      : ${groups.avantDebut.length}`, byType(groups.avantDebut))
console.log(`  port versé à l'admin                       : ${groups.verseAdmin.length}`)
console.log(`  EXCLUES — port encaissé pas encore versé    : ${groups.aVerser.length}`, byType(groups.aVerser))
console.log(`À archiver : ${todo.length}`, byCity(todo))
if (APPLY && todo.length) {
  writeFileSync(`scripts/archive-livres-sans-cod-14j${INCLUDE_A_VERSER ? '-tous' : '-verses'}-backup.json`, JSON.stringify(todo.map(d => ({ id: d.id, aVerser: groups.aVerser.includes(d) }))))
  const now = new Date().toISOString()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(d => b.update(d.ref, { isArchived: true, archivedAt: now, archivedBy: TAG }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('archivées :', todo.length)
}
process.exit(0)
