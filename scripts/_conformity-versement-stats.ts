// LECTURE SEULE : conformité de la copie allégée des versements avec le calcul de la page du chef d'agence.
// Pour chaque ville : « Collectes par jour » de computeCaisseView (ensemble des collectes depuis le 05/10, comme la page)
// vs somme des contributions (versementContributionOf — règle du serveur) sur les MÊMES expéditions, puis sur toutes les
// expéditions encaissées (ce que lira le serveur). Aucune écriture.   npx tsx scripts/_conformity-versement-stats.ts
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { computeCaisseView, caisseDefaultOperationalDay } from '../src/utils/agencyCaisseRules'
import { versementContributionOf } from '../src/utils/versementContribution'
import { RECENT_SHAPES, RECENT_FORMS, matchesRecentCollected } from '../src/utils/recentCollected'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const conv = (o: any): any => {
  if (o instanceof admin.firestore.Timestamp) return { toDate: () => o.toDate(), toMillis: () => o.toMillis(), seconds: o.seconds, nanoseconds: o.nanoseconds }
  if (Array.isArray(o)) return o.map(conv)
  if (o && typeof o === 'object') { const r: any = {}; for (const k of Object.keys(o)) r[k] = conv(o[k]); return r }
  return o
}
const SINCE = new Date('2026-10-05T08:00:00+01:00').getTime()
const FAR = T.fromMillis(Date.parse('2100-01-01T00:00:00Z'))
const r2 = (n: number) => Math.round(n * 100) / 100
const holdersSnap = await db.collection('users').where('role', 'in', ['chef_agence', 'agentpro']).get()
const holders = new Map<string, Set<string>>()
holdersSnap.docs.forEach(d => { const c = d.get('city'); if (!c) return; if (!holders.has(c)) holders.set(c, new Set()); holders.get(c)!.add(d.id) })
const holdersOf = (c: string) => holders.get(c) || new Set<string>()

// Toutes les expéditions encaissées (ce que lit le serveur) — version allégée parcelsLite
const allCollected = (await db.collection('parcelsLite').where('portStatus', 'in', ['collected', 'received']).get()).docs.map(d => conv({ id: d.id, ...d.data() }))
let allOk = true
for (const city of ['Agadir', 'Ait Melloul', 'Casablanca', 'Marrakech']) {
  const recent = new Map<string, any>()
  for (const [cf, df] of RECENT_SHAPES) for (const f of RECENT_FORMS) {
    const s = await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', f === 'ts' ? T.fromMillis(SINCE) : new Date(SINCE).toISOString()).where('createdAt', '<', FAR).get()
    s.docs.forEach(d => recent.set(d.id, conv({ id: d.id, ...d.data() })))
  }
  const set = [...recent.values()].filter(p => matchesRecentCollected(p, city, SINCE))
  const v: any = computeCaisseView({ city, allDisplayParcels: [], garePending: [], recentCollected: set, datePreset: 'operational', operationalDay: caisseDefaultOperationalDay(), agencyHolderIds: holdersOf(city) })
  const page = new Map<string, any>((v.collectesParJour as [string, any][]).map(([k, d]) => [k, { aVerser: r2(d.aVerser || 0), nonRecu: r2(d.nonRecu || 0), verse: r2(d.verse || 0) }]))
  const sumBy = (list: any[]) => {
    const m = new Map<string, any>()
    for (const p of list) {
      const c = versementContributionOf(p, holdersOf)
      if (!c || c.city !== city) continue
      const d = m.get(c.dayKey) || { aVerser: 0, nonRecu: 0, verse: 0 }
      d[c.bucket] = r2(d[c.bucket] + c.amount); m.set(c.dayKey, d)
    }
    return m
  }
  const same = sumBy(set), server = sumBy(allCollected)
  const diff = (a: Map<string, any>, b: Map<string, any>) => {
    const out: string[] = []
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k) || { aVerser: 0, nonRecu: 0, verse: 0 }, y = b.get(k) || { aVerser: 0, nonRecu: 0, verse: 0 }
      for (const f of ['aVerser', 'nonRecu', 'verse']) if (Math.abs(x[f] - y[f]) > 0.009) out.push(`${k} ${f} : page ${x[f]} / copie ${y[f]}`)
    }
    return out
  }
  const tot = (m: Map<string, any>) => [...m.values()].reduce((s, d) => ({ aVerser: r2(s.aVerser + d.aVerser), nonRecu: r2(s.nonRecu + d.nonRecu), verse: r2(s.verse + d.verse) }), { aVerser: 0, nonRecu: 0, verse: 0 })
  const d1 = diff(page, same), d2 = diff(page, server)
  allOk &&= d1.length === 0
  console.log(`\n${city} — page : ${JSON.stringify(tot(page))}`)
  console.log(`   règle partagée, mêmes expéditions : ${d1.length ? `❌ ${d1.length} écart(s) : ${d1.slice(0, 5).join(' | ')}` : '✅ identique'}`)
  console.log(`   copie du serveur (toutes les expéditions encaissées) : ${JSON.stringify(tot(server))} ${d2.length ? `— ${d2.length} journée(s) différente(s) : ${d2.slice(0, 6).join(' | ')}` : '— ✅ identique'}`)
}
console.log(allOk ? '\nRÈGLE CONFORME' : '\nRÈGLE NON CONFORME')
process.exit(0)
