// LECTURE SEULE : expéditions « Livré » créées jusqu'au 05/10/2026 inclus (avant le 06/10 00:00, heure Maroc),
// encore non archivées — réparties par type (sans COD / COD espèces / chèque / traite / mixte) et argent en attente.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const cutoff = admin.firestore.Timestamp.fromDate(new Date('2026-10-06T00:00:00+01:00'))
const s = await db.collection('parcels').where('createdAt', '<', cutoff)
  .select('isArchived', 'codAmount', 'serviceType', 'status', 'portType', 'portPayeMethod', 'portStatus', 'codStatus', 'createdAt', 'codParts').get()
const live = s.docs.filter(d => d.get('isArchived') !== true)
const livres = live.filter(d => d.get('status') === 'Livré')
const kind = d => !(Number(d.get('codAmount')) > 0) ? 'sans COD' : (Array.isArray(d.get('codParts')) && d.get('codParts').length > 1 ? 'COD mixte' : `COD ${d.get('serviceType') || '?'}`)
const moneyPending = d => (d.get('portType') === 'port_du' && !d.get('portPayeMethod') && !['collected', 'received'].includes(d.get('portStatus')))
  || (d.get('portType') === 'port_paye' && d.get('portStatus') === 'collected')
const count = (list, f) => list.reduce((m, d) => { const k = f(d) || '?'; m[k] = (m[k] || 0) + 1; return m }, {})
console.log(`Créées jusqu'au 05/10 inclus dans parcels : ${s.size} | non archivées : ${live.length} | dont Livré : ${livres.length}`)
console.log('Statuts des non archivées :', count(live, d => d.get('status')))
console.log('Livré par type :', count(livres, kind))
console.log('Livré sans COD avec port encore à encaisser :', livres.filter(d => kind(d) === 'sans COD' && moneyPending(d)).length)
console.log('Livré COD par état du COD :', count(livres.filter(d => kind(d) !== 'sans COD'), d => `${kind(d)} / ${d.get('codStatus') || '?'}`))
const MONEY_START = new Date('2026-10-05T08:00:00+01:00').getTime()
const sc = livres.filter(d => kind(d) === 'sans COD')
const after = sc.filter(d => d.get('createdAt').toMillis() >= MONEY_START)
console.log(`Livré sans COD créées APRÈS le début du circuit de l'argent (05/10 08:00) : ${after.length}`,
  count(after, d => `${d.get('portType')} / ${d.get('portStatus') || '-'}${moneyPending(d) ? ' ⚠️ à encaisser' : ''}`))
console.log('Livré sans COD AVANT 05/10 08:00 par port :', count(sc.filter(d => d.get('createdAt').toMillis() < MONEY_START), d => `${d.get('portType')} / ${d.get('portStatus') || '-'}`))
console.log('Livré sans COD par mois :', count(livres.filter(d => kind(d) === 'sans COD'), d => d.get('createdAt')?.toDate?.().toISOString().slice(0, 7)))
process.exit(0)
