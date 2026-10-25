/** Archive (isArchived=true, même marquage que l'archivage automatique) les expéditions SIMPLES / SANS COD
 *  créées avant le 20/10/2026 00:00 (heure Maroc). Demande de l'admin du 22/10/2026.
 *  Sans --apply : comptage seulement (aucune écriture). Avec --apply : sauvegarde des ids puis archivage.
 *  Options : --only-livres (seulement « Livré »), --skip-money (laisse de côté les ports encore à encaisser).
 *  Retour arrière : désarchiver les ids de la sauvegarde encore marqués archivedBy = TAG. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
const ONLY_LIVRES = process.argv.includes('--only-livres')
const SKIP_MONEY = process.argv.includes('--skip-money')
// --before=AAAA-MM-JJ : date limite de création (exclue), heure Maroc — défaut 2026-10-20
const BEFORE = (process.argv.find(a => a.startsWith('--before=')) || '--before=2026-10-20').slice(9)
const TAG = BEFORE === '2026-10-20' ? 'admin-manual-simples-sans-cod-2026-10-20' : `admin-manual-simples-sans-cod-${BEFORE}`
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const cutoff = admin.firestore.Timestamp.fromDate(new Date(`${BEFORE}T00:00:00+01:00`))
const s = await db.collection('parcels').where('createdAt', '<', cutoff)
  .select('isArchived', 'codAmount', 'serviceType', 'status', 'portType', 'portPayeMethod', 'portStatus', 'createdAt', 'destinationCity', 'originCity').get()

const sansCod = s.docs.filter(d => !(Number(d.get('codAmount')) > 0))
const notArchived = sansCod.filter(d => d.get('isArchived') !== true)
// Argent encore à encaisser (port dû pas collecté, port payé à ramasser pas reçu par le chef d'agence)
const moneyPending = d => (d.get('portType') === 'port_du' && !d.get('portPayeMethod') && !['collected', 'received'].includes(d.get('portStatus')))
  || (d.get('portType') === 'port_paye' && d.get('portStatus') === 'collected')
let todo = notArchived
if (ONLY_LIVRES) todo = todo.filter(d => d.get('status') === 'Livré')
if (SKIP_MONEY) todo = todo.filter(d => !moneyPending(d))

const count = (list, f) => list.reduce((m, d) => { const k = f(d) || '?'; m[k] = (m[k] || 0) + 1; return m }, {})
console.log(`Créées avant le ${BEFORE.split('-').reverse().join('/')} (encore dans parcels) : ${s.size} | dont SANS COD : ${sansCod.length} | déjà archivées : ${sansCod.length - notArchived.length} | non archivées : ${notArchived.length}`)
console.log('  type de service (non archivées) :', count(notArchived, d => d.get('serviceType')))
console.log('  statut (non archivées) :', count(notArchived, d => d.get('status')))
console.log('  dont argent de port encore à encaisser :', notArchived.filter(moneyPending).length, count(notArchived.filter(moneyPending), d => `${d.get('portType')} / ${d.get('status')}`))
console.log(`À archiver${ONLY_LIVRES ? ' (Livré seulement)' : ''}${SKIP_MONEY ? ' (ports à encaisser exclus)' : ''} : ${todo.length}`)
console.log('  par mois de création :', count(todo, d => d.get('createdAt')?.toDate?.().toISOString().slice(0, 7)))
console.log('  par ville de destination :', count(todo, d => d.get('destinationCity')))
if (APPLY && todo.length) {
  const file = `scripts/archive-simples-sans-cod-before-${BEFORE}${ONLY_LIVRES ? '-livres' : ''}${SKIP_MONEY ? '-skipmoney' : ''}-backup.json`
  writeFileSync(file, JSON.stringify(todo.map(d => ({ id: d.id, status: d.get('status') }))))
  const now = new Date().toISOString()
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(d => b.update(d.ref, { isArchived: true, archivedAt: now, archivedBy: TAG }))
    await b.commit()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('archivées :', todo.length, '— sauvegarde :', file)
}
process.exit(0)
