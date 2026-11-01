// LECTURE SEULE : expéditions comptées « pas encore reçu » par la copie du serveur mais absentes de l'ensemble lu par la page
// du chef d'agence (collectes depuis le 05/10). Classement par nature / détenteur.   npx tsx scripts/_diag-nonrecu-diff.ts
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { versementContributionOf } from '../src/utils/versementContribution'
import { matchesRecentCollected } from '../src/utils/recentCollected'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const conv = (o: any): any => {
  if (o instanceof admin.firestore.Timestamp) return { toDate: () => o.toDate(), toMillis: () => o.toMillis(), seconds: o.seconds, nanoseconds: o.nanoseconds }
  if (Array.isArray(o)) return o.map(conv)
  if (o && typeof o === 'object') { const r: any = {}; for (const k of Object.keys(o)) r[k] = conv(o[k]); return r }
  return o
}
const SINCE = new Date('2026-10-05T08:00:00+01:00').getTime()
const hs = await db.collection('users').where('role', 'in', ['chef_agence', 'agentpro']).get()
const holders = new Map<string, Set<string>>()
hs.docs.forEach(d => { const c = d.get('city'); if (!c) return; if (!holders.has(c)) holders.set(c, new Set()); holders.get(c)!.add(d.id) })
const all = (await db.collection('parcelsLite').where('portStatus', 'in', ['collected', 'received']).get()).docs.map(d => conv({ id: d.id, ...d.data() }))
const by: Record<string, { n: number; m: number; ex: string[] }> = {}
for (const p of all) {
  const c = versementContributionOf(p, x => holders.get(x) || new Set())
  if (!c || c.bucket !== 'nonRecu') continue
  if (matchesRecentCollected(p, c.city, SINCE)) continue
  const k = `${c.city} · ${c.kind === 'portPaye' ? `port payé ramassé au guichet (${p.portGuichetHolderName || 'En gare'}), statut ${p.portStatus}, remis exploitation : ${p.portPayeExpReceivedAt ? 'oui' : 'non'}` : `port dû, encaissé le ${p.portCollectedAt ? 'oui' : 'NON (reçu seulement)'}`}`
  by[k] = by[k] || { n: 0, m: 0, ex: [] }; by[k].n++; by[k].m += c.amount; if (by[k].ex.length < 3) by[k].ex.push(p.senderNic || p.trackingId)
}
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].m - a[1].m)) console.log(`${k} : ${v.n} exp. · ${Math.round(v.m)} DH  ex. ${v.ex.join(', ')}`)
process.exit(0)
