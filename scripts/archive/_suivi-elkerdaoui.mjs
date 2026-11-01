// LECTURE SEULE : suivi détaillé des mouvements des comptes « Elkerdaoui » (chef d'agence, chef d'exploitation, agent pro)
// du 05/10/2026 à aujourd'hui → JSON (scratchpad). Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const OUT = process.argv[2]
const SINCE = new Date('2026-10-05T08:00:00+01:00').getTime()

const ACCOUNTS = [
  { uid: 'sB9GAnS6IQZWdb3O0rVa9XJMg4q2', email: 'elkerdaoui1@gmail.com', role: "Chef d'agence", city: 'Ait Melloul' },
  { uid: 'sGaOgPsMdiZ1se6V0a8NzFgNcD13', email: 'elkerdaoui2@gmail.com', role: "Chef d'agence", city: 'Agadir' },
  { uid: 'cvRsdyLS9xacqg0jXCVlR0O2W0f2', email: 'elkerdaouichef@gmail.com', role: "Chef d'exploitation", city: 'Ait Melloul' },
  { uid: 'JZYbUb4NhQgjIt9TAkECdrsx9tC3', email: 'elkerdaouipro@gmail.com', role: 'Agent pro', city: 'Agadir' },
]
const ms = v => { if (!v) return null; if (typeof v.toMillis === 'function') return v.toMillis(); if (v._seconds) return v._seconds * 1000; const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t }
const num = v => Number.parseFloat(String(v ?? '').replace(',', '.')) || 0
const nicOf = p => p.senderNic || p.sender?.nic || p.trackingId || ''

// Champs « fait par » sur les expéditions → nature du mouvement
const PARCEL_FIELDS = [
  ['agentId', 'creation', null],
  ['portCollectedById', 'port_collecte', 'portCollectedAt'],
  ['portExpReceivedById', 'port_recu_exp', 'portExpReceivedAt'],
  ['portChefReceivedById', 'port_recu_chef', 'portChefReceivedAt'],
  ['portPayeExpReceivedById', 'port_paye_recu_exp', 'portPayeExpReceivedAt'],
  ['portReceivedById', 'port_paye_recu_chef', 'portReceivedAt'],
  ['codCollectedById', 'cod_collecte', 'codCollectedAt'],
  ['codExpReceivedById', 'cod_recu_exp', 'codExpReceivedAt'],
  ['codChefReceivedById', 'cod_recu_chef', 'codChefReceivedAt'],
  ['codSplitDeclaredById', 'cod_mixte', 'codSplitDeclaredAt'],
  ['chefPointedById', 'pointage_arrivee', 'destinationArrivedAt'],
]
const out = { generatedAt: new Date().toISOString(), since: SINCE, accounts: [] }
for (const acc of ACCOUNTS) {
  const u = (await db.doc(`users/${acc.uid}`).get()).data() || {}
  const a = { ...acc, name: u.name || acc.email, moves: [], created: {}, envois: [], transfers: [], arrivages: [], caisse: [], delays: [], assigned: {}, presence: null }
  const seen = new Set()
  for (const col of ['parcels', 'parcels_archive']) {
    for (const [field, kind, atField] of PARCEL_FIELDS) {
      const snap = await db.collection(col).where(field, '==', acc.uid).get()
      for (const d of snap.docs) {
        const p = d.data()
        if (kind === 'creation') {
          const t = ms(p.createdAt); if (!t || t < SINCE) continue
          const day = new Date(t - 6 * 3600e3).toISOString().slice(0, 10)
          const c = a.created[day] || { n: 0, colis: 0, port: 0, cod: 0 }
          c.n++; c.colis += Math.max(1, parseInt(p.nbColis || 1, 10) || 1); c.port += num(p.price); c.cod += num(p.codAmount)
          a.created[day] = c
          continue
        }
        const t = ms(p[atField]); if (!t || t < SINCE) continue
        const key = `${d.id}|${kind}`; if (seen.has(key)) continue; seen.add(key)
        const isPort = kind.startsWith('port')
        a.moves.push({ t, kind, nic: nicOf(p), city: p.destinationCity || '', receiver: p.receiver?.name || '', driver: p.deliveryDriverName || '',
          amount: isPort ? num(p.price) : num(p.codAmount), cash: p.codMixed ? num(p.codCashAmount) : null,
          type: isPort ? (p.portType || '') : (p.codPaymentType || p.serviceType || ''), status: p.status || '', archived: col === 'parcels_archive' })
      }
    }
    // Assignations faites par ce compte (nom + ville de destination, deux chefs portent le même nom)
    const as = await db.collection(col).where('deliveryAssignedBy', '==', a.name).get()
    for (const d of as.docs) {
      const p = d.data(); const t = ms(p.deliveryAssignedAt); if (!t || t < SINCE) continue
      if (p.destinationCity && p.destinationCity !== acc.city) continue
      const day = new Date(t - 6 * 3600e3).toISOString().slice(0, 10)
      a.assigned[day] = (a.assigned[day] || 0) + 1
    }
  }
  const pick = async (col, field) => (await db.collection(col).where(field, '==', acc.uid).get()).docs.map(d => ({ id: d.id, ...d.data() }))
  for (const e of [...await pick('valeursEnvois', 'createdById'), ...await pick('valeursEnvois', 'validatedById')]) {
    const t = ms(e.createdAt); if (!t || t < SINCE) continue
    if (a.envois.some(x => x.id === e.id)) continue
    a.envois.push({ id: e.id, t, validatedAt: ms(e.validatedAt), status: e.status, by: e.createdByName, validatedBy: e.validatedByName || '', group: e.group || '', n: (e.items || []).length, total: e.totals?.total?.amount ?? (e.items || []).reduce((s, i) => s + num(i.amount), 0), role: e.createdById === acc.uid ? 'envoyé' : 'reçu / validé' })
  }
  for (const x of [...await pick('adminTransfers', 'fromId'), ...await pick('adminTransfers', 'confirmedById')]) {
    const t = ms(x.createdAt); if (!t || t < SINCE) continue
    if (a.transfers.some(y => y.id === x.id)) continue
    a.transfers.push({ id: x.id, t, amount: num(x.amount), status: x.status, confirmedAt: ms(x.confirmedAt), confirmedBy: x.confirmedBy || '', note: x.note || '', n: x.codParcelCount || 0 })
  }
  for (const r of await pick('arrivages', 'agentId')) {
    const t = ms(r.confirmedAt || r.createdAt); if (!t || t < SINCE) continue
    a.arrivages.push({ t, ref: r.arrivageRef || r.id, city: r.city, expected: r.expectedCount || 0, arrived: r.arrivedCount || 0, missing: r.missingCount || 0, boxes: r.totalArrivedBoxes || 0 })
  }
  const caisseSeen = new Set()
  for (const c of [...await pick('caisseEntries', 'agentId'), ...await pick('caisseEntries', 'cashierId')]) {
    const t = ms(c.createdAt); if (!t || t < SINCE || caisseSeen.has(c.id)) continue
    caisseSeen.add(c.id)
    a.caisse.push({ t, type: c.type, category: c.category, amount: num(c.amount), description: c.description || '', reference: c.reference || '' })
  }
  for (const dl of [...await pick('deliveryDelays', 'createdById'), ...await pick('deliveryDelays', 'resolvedById')]) {
    const t = ms(dl.createdAt); if (!t || t < SINCE || a.delays.some(x => x.id === dl.id)) continue
    a.delays.push({ id: dl.id, t, nic: dl.senderNic, driver: dl.driverName, reason: dl.reason, resolved: !!dl.resolvedAt })
  }
  const pres = await db.collection('presence').where('uid', '==', acc.uid).get()
  if (!pres.empty) { const p = pres.docs[0].data(); a.presence = { day: p.day, first: ms(p.firstSeenToday), last: ms(p.lastActivityAt || p.lastSeen), actions: p.actionsToday || 0, created: p.parcelsCreatedToday || 0, updated: p.parcelsUpdatedToday || 0, cod: p.codCollectedToday || 0, device: p.device || '', page: p.pageLabel || '' } }
  a.moves.sort((x, y) => x.t - y.t); a.envois.sort((x, y) => x.t - y.t); a.transfers.sort((x, y) => x.t - y.t); a.arrivages.sort((x, y) => x.t - y.t); a.caisse.sort((x, y) => x.t - y.t)
  out.accounts.push(a)
  console.log(acc.email, ':', a.moves.length, 'mouvements d\'argent / pointages,', Object.values(a.created).reduce((s, c) => s + c.n, 0), 'créées,', a.envois.length, 'envois,', a.transfers.length, 'versements admin,', a.arrivages.length, 'arrivages,', a.caisse.length, 'caisse')
}
writeFileSync(OUT, JSON.stringify(out))
process.exit(0)
