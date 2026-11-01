/** Archive (isArchived=true, même marquage que les archivages précédents) les expéditions « Livré » SANS COD créées
 *  jusqu'au 05/10/2026 inclus (avant le 06/10 00:00, heure Maroc). Demande de l'admin du 30/10/2026.
 *  Gardées actives : celles créées le 05/10 à partir de 08:00 (circuit de l'argent) dont le port est encore à encaisser
 *  (port dû non collecté, port payé collecté mais pas reçu par le chef d'agence).
 *  Sans --apply : comptage seulement. Avec --apply : sauvegarde (id + anciennes valeurs) puis archivage.
 *  Retour arrière : remettre les valeurs de la sauvegarde sur les ids encore marqués archivedBy = TAG. */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
const TAG = 'admin-manual-livres-sans-cod-jusqu-2026-10-05'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const cutoff = admin.firestore.Timestamp.fromDate(new Date('2026-10-06T00:00:00+01:00'))
const MONEY_START = new Date('2026-10-05T08:00:00+01:00').getTime()
const s = await db.collection('parcels').where('createdAt', '<', cutoff)
  .select('isArchived', 'archivedAt', 'archivedBy', 'codAmount', 'status', 'portType', 'portPayeMethod', 'portStatus', 'createdAt', 'destinationCity').get()
const moneyPending = d => (d.get('portType') === 'port_du' && !d.get('portPayeMethod') && !['collected', 'received'].includes(d.get('portStatus')))
  || (d.get('portType') === 'port_paye' && d.get('portStatus') === 'collected')
const base = s.docs.filter(d => d.get('isArchived') !== true && d.get('status') === 'Livré' && !(Number(d.get('codAmount')) > 0))
const kept = base.filter(d => d.get('createdAt').toMillis() >= MONEY_START && moneyPending(d))
const todo = base.filter(d => !kept.includes(d))
const count = (list, f) => list.reduce((m, d) => { const k = f(d) || '?'; m[k] = (m[k] || 0) + 1; return m }, {})
console.log(`Livré sans COD non archivées (jusqu'au 05/10 inclus) : ${base.length} | gardées actives (05/10 ≥ 08:00, port à encaisser) : ${kept.length}`)
console.log(`À archiver : ${todo.length}`)
console.log('  par jour de création (octobre) :', count(todo.filter(d => d.get('createdAt').toDate().toISOString() >= '2026-10'), d => d.get('createdAt').toDate().toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' })))
console.log('  par mois :', count(todo, d => d.get('createdAt').toDate().toISOString().slice(0, 7)))
console.log('  par ville de destination :', count(todo, d => d.get('destinationCity')))
if (APPLY && todo.length) {
  const file = `scripts/archive-livres-sans-cod-jusqu-2026-10-05-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify(todo.map(d => ({ id: d.id, isArchived: d.get('isArchived') ?? null, archivedAt: d.get('archivedAt') ?? null, archivedBy: d.get('archivedBy') ?? null }))))
  console.log('sauvegarde :', file)
  const now = new Date().toISOString()
  let done = 0
  for (let i = 0; i < todo.length; i += 400) {
    const b = db.batch()
    todo.slice(i, i + 400).forEach(d => b.update(d.ref, { isArchived: true, archivedAt: now, archivedBy: TAG }))
    await b.commit()
    done += Math.min(400, todo.length - i)
    await new Promise(r => setTimeout(r, 500))
  }
  console.log('archivées :', done)
}
process.exit(0)
