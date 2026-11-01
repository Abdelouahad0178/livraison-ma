// LECTURE SEULE : « En gare » d'une ville — carte de Caisse Agence (computeCaisseView, groupe GARE) vs carte Admin « En gare »
// (règles de AdminEnGareTab), sur les MÊMES données. Aucune écriture.  npx tsx scripts/_diag-en-gare-agadir.ts [Ville]
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { computeCaisseView, caisseCodAmountOfType, caisseDefaultOperationalDay, GARE_GROUP_ID } from '../src/utils/agencyCaisseRules'
import { isBilledByAgency } from '../src/utils/billingAgency'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const CITY = process.argv[2] || 'Agadir'
const conv = (o: any): any => {
  if (o instanceof admin.firestore.Timestamp) return { toDate: () => o.toDate(), toMillis: () => o.toMillis(), seconds: o.seconds, nanoseconds: o.nanoseconds }
  if (Array.isArray(o)) return o.map(conv)
  if (o && typeof o === 'object') { const r: any = {}; for (const k of Object.keys(o)) r[k] = conv(o[k]); return r }
  return o
}
const since = T.fromDate(new Date(Date.now() - 46 * 864e5))
const map = new Map<string, any>()
for (const f of ['originCity', 'destinationCity']) {
  const s = await db.collection('parcelsLite').where(f, '==', CITY).where('createdAt', '>=', since).orderBy('createdAt', 'desc').get()
  s.docs.forEach(d => map.set(d.id, conv({ id: d.id, ...d.data() })))
}
const all = [...map.values()]
const gp = await db.collection('parcelsLite').where('destinationCity', '==', CITY).where('status', '==', 'Arrivé en agence').where('isArchived', '==', false).get()
const garePending = gp.docs.map(d => conv({ id: d.id, ...d.data() })).filter((p: any) =>
  !p.isArchived && !p.pickupDriverId && !(p.returnedAt || p.wasReturned) && (!p.deliveryDriverId || p.deliveryDriverName === `En gare - ${CITY}`))
const dep = await db.collection('users').where('role', '==', 'livreur-gare').get()
const depotIds = new Set(dep.docs.filter(d => d.get('city') === CITY).map(d => d.id))
console.log(`${CITY} : ${all.length} expéditions chargées (46 j), garePending ${garePending.length}, comptes en gare ${depotIds.size}`)

const codPending = (p: any) => !p.codStatus || p.codStatus === 'pending'
const codOf = (list: any[]) => ['especes', 'cheque', 'traite'].map(t => list.reduce((s, p) => s + (codPending(p) ? caisseCodAmountOfType(p, t as any) : 0), 0))
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const statusCount = (list: any[]) => list.reduce((m: any, p: any) => { m[p.status] = (m[p.status] || 0) + 1; return m }, {})
for (const [label, preset, opDay] of [['Veille travaillée (défaut)', 'operational', caisseDefaultOperationalDay()], ["Aujourd'hui", 'today', null], ['Tout (45 j)', 'all', null]] as const) {
  const v: any = computeCaisseView({ city: CITY, allDisplayParcels: all, garePending, datePreset: preset, operationalDay: opDay as any, depotIds })
  const g = v.filteredDrivers.find((d: any) => d.id === GARE_GROUP_ID)
  const ps = g?.parcels || []
  const cod = codOf(ps)
  console.log(`\n[Caisse Agence] ${label} — carte « En gare » : ${ps.length} exp. | port dû à collecter ${g?.portsACollecterCount || 0} · ${fmt(g?.portsACollecterMontant || 0)} DH | COD non collecté esp ${fmt(cod[0])} chq ${fmt(cod[1])} tr ${fmt(cod[2])}`)
  console.log('   statuts :', JSON.stringify(statusCount(ps)))
  const fs: any = v.filteredStats
  console.log(`   carte « Ramassés (En gare) » : ${fs.ramassesGareCount} · ${fmt(fs.ramassesGareMontant)} DH | remis ${fs.ramassesRemisCount} · ${fmt(fs.ramassesRemisMontant)} DH | cartes : ${v.filteredDrivers.map((d: any) => `${d.name}=${d.portsPayesARecevoirCount}/${fmt(d.portsPayesARecevoirMontant)}`).filter((s: string) => !/=0\/0$/.test(s)).join(', ')}`)
  const ec = ps.filter((p: any) => String(p.portType || '').startsWith('port_en_compte'))
  const ecBy = ec.reduce((m: any, p: any) => { const k = `${p.portType} / ${isBilledByAgency(p, CITY) ? 'facturé par ' + CITY : 'facturé ailleurs'}`; m[k] = m[k] || [0, 0]; m[k][0]++; m[k][1] += Number(p.price) || 0; return m }, {})
  console.log(`   en compte : ${ec.length} · ${fmt(ec.reduce((s: number, p: any) => s + (Number(p.price) || 0), 0))} DH | ${JSON.stringify(ecBy)} | en-tête carte « dont en compte » : ${g ? g.parcels.length - g.portDuParcels.length - g.portsPayesParcels.length : 0}`)
  const pp = ps.filter((p: any) => p.portType === 'port_paye' || p.portPayeMethod)
  console.log(`   ports payés : carte « à recevoir » ${g?.portsPayesARecevoirCount || 0} · ${fmt(g?.portsPayesARecevoirMontant || 0)} DH | « reçus » ${g?.portsPayesRecusCount || 0} · ${fmt(g?.portsPayesRecusMontant || 0)} DH | tous ports payés de la carte ${pp.length} · ${fmt(pp.reduce((s: number, p: any) => s + (Number(p.price) || 0), 0))} DH`)
  console.log('   détail ports payés :', JSON.stringify(pp.reduce((m: any, p: any) => { const k = `${p.originCity === CITY ? 'départ ' + CITY : 'arrivée'} / ${p.portStatus || '-'} / ${p.portPayeMethod ? 'méthode ' + p.portPayeMethod : 'port_paye'}`; m[k] = (m[k] || 0) + 1; return m }, {})))
}

// Règles Admin « En gare » (stock Arrivé + En cours au compte en gare), sur parcelsLite toutes dates non archivées
const adm: any[] = []
for (const st of ['Arrivé en agence', 'En cours de livraison']) {
  const s = await db.collection('parcelsLite').where('destinationCity', '==', CITY).where('status', '==', st).where('isArchived', '==', false).get()
  s.docs.forEach(d => adm.push(conv({ id: d.id, ...d.data() })))
}
const isRet = (p: any) => !!(p.returnedAt || p.wasReturned) || /^Retour/.test(p.status || '')
const gare = adm.filter(p => !isRet(p) && !p.pickupDriverId).filter(p => p.status === 'Arrivé en agence' ||
  !p.deliveryDriverId || /^En gare/i.test(String(p.deliveryDriverName || '')) || depotIds.has(p.deliveryDriverId))
const toD = (v: any) => (v?.toDate ? v.toDate() : v ? new Date(v) : null)
const arrival = (p: any) => toD(p.destinationArrivedAt) || toD(p.chefPointedAt) || toD(p.deliveryControlledAt) || toD(p.createdAt)
const today0 = new Date(); today0.setHours(0, 0, 0, 0)
const portDu = (list: any[]) => list.filter(p => p.portType === 'port_du' && !p.portPayeMethod && (!p.portStatus || p.portStatus === 'pending'))
for (const [label, list] of [['Toutes dates', gare], ["Arrivées aujourd'hui", gare.filter(p => arrival(p) >= today0)]] as const) {
  const pd = portDu(list), cod = codOf(list)
  console.log(`\n[Admin] ${label} : ${list.length} exp. | port dû à collecter ${pd.length} · ${fmt(pd.reduce((s, p) => s + (Number(p.price) || 0), 0))} DH | COD esp ${fmt(cod[0])} chq ${fmt(cod[1])} tr ${fmt(cod[2])}`)
  console.log('   statuts :', JSON.stringify(statusCount(list)), '| créées avant le 16/09 :', list.filter(p => toD(p.createdAt) < new Date(Date.now() - 45 * 864e5)).length)
}
process.exit(0)
