// LECTURE SEULE : « Collectes par jour » d'une agence (même calcul que Caisse Agence) — par journée : collecté, déjà versé,
// à verser (dans la caisse du chef d'agence), pas encore reçu (chez le chef d'exploitation / livreurs).  npx tsx scripts/_diag-a-verser.ts Agadir
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { computeCaisseView, caisseDefaultOperationalDay } from '../src/utils/agencyCaisseRules'
import { RECENT_SHAPES, RECENT_FORMS, matchesRecentCollected } from '../src/utils/recentCollected'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const CITY = process.argv[2] || 'Agadir'
const conv = (o: any): any => {
  if (o instanceof admin.firestore.Timestamp) return { toDate: () => o.toDate(), toMillis: () => o.toMillis(), seconds: o.seconds, nanoseconds: o.nanoseconds }
  if (Array.isArray(o)) return o.map(conv)
  if (o && typeof o === 'object') { const r: any = {}; for (const k of Object.keys(o)) r[k] = conv(o[k]); return r }
  return o
}
const SINCE = new Date(2026, 9, 5, 8).getTime()
const FAR = T.fromMillis(Date.parse('2100-01-01T00:00:00Z'))
const recent = new Map<string, any>()
for (const [cf, df] of RECENT_SHAPES) for (const f of RECENT_FORMS) {
  const s = await db.collection('parcelsLite').where(cf, '==', CITY).where(df, '>=', f === 'ts' ? T.fromMillis(SINCE) : new Date(SINCE).toISOString()).where('createdAt', '<', FAR).get()
  s.docs.forEach(d => recent.set(d.id, conv({ id: d.id, ...d.data() })))
}
const recentCollected = [...recent.values()].filter(p => matchesRecentCollected(p, CITY, SINCE))
const holders = await db.collection('users').where('city', '==', CITY).where('role', 'in', ['chef_agence', 'agentpro']).get()
const agencyHolderIds = new Set(holders.docs.map(d => d.id))
const v: any = computeCaisseView({ city: CITY, allDisplayParcels: [], garePending: [], recentCollected, datePreset: 'operational', operationalDay: caisseDefaultOperationalDay(), agencyHolderIds })
const f = (n: number) => Math.round(n).toLocaleString('fr-FR').padStart(9)
let t = { m: 0, v: 0, a: 0, n: 0 }
console.log(`${CITY} — journée de collecte | collecté | déjà versé | À VERSER (chez le chef) | pas encore reçu`)
for (const [k, d] of [...v.collectesParJour].reverse()) {
  t.m += d.montant; t.v += d.verse || 0; t.a += d.aVerser || 0; t.n += d.nonRecu || 0
  console.log(`  ${k} | ${f(d.montant)} | ${f(d.verse || 0)} | ${f(d.aVerser || 0)} | ${f(d.nonRecu || 0)}`)
}
console.log(`  TOTAL      | ${f(t.m)} | ${f(t.v)} | ${f(t.a)} | ${f(t.n)}`)
// Pourquoi « pas encore reçu » : ports dus collectés non reçus par le chef — qui les détient ?
const nr = recentCollected.filter((p: any) => p.portType === 'port_du' && !p.portPayeMethod && p.destinationCity === CITY && ['collected', 'received'].includes(p.portStatus)
  && !(p.portAdminTransferred || p.adminTransferred) && !(p.portChefReceivedAt || p.portStatus === 'received' || agencyHolderIds.has(p.portCollectedById)))
const by: Record<string, [number, number]> = {}
for (const p of nr) { const k = p.portExpReceivedAt ? `reçu par le chef d'exploitation (${p.portExpReceivedBy || '?'}), pas encore remis au chef d'agence` : `chez le livreur / encaisseur : ${p.portCollectedBy || '?'}`; by[k] = by[k] || [0, 0]; by[k][0]++; by[k][1] += Number(p.price) || 0 }
console.log('\nPas encore reçu par le chef d\'agence — détenteurs :')
for (const [k, [n, m]] of Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 12)) console.log(`  ${k} : ${n} exp. · ${Math.round(m)} DH`)
process.exit(0)
