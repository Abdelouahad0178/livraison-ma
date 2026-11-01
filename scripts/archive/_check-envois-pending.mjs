// LECTURE SEULE : contrôle des envois « envoyé » (en attente) d'une ville — chaque valeur comparée à son expédition.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const CITY = process.argv[2] || 'Agadir'
const MONEY_START = new Date('2026-10-05T08:00:00+01:00').getTime()
const s = await db.collection('valeursEnvois').where('city', '==', CITY).where('status', '==', 'envoye').get()
for (const d of s.docs) {
  const e = d.data()
  const ids = [...new Set(e.items.map(i => i.parcelId))]
  const docs = new Map()
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map(id => db.collection('parcels').doc(id))
    const snaps = await db.getAll(...refs)
    snaps.forEach(x => docs.set(x.id, x.exists ? x.data() : null))
  }
  const issues = {}
  const add = (k, it) => { issues[k] = issues[k] || { n: 0, m: 0, ex: [] }; issues[k].n++; issues[k].m += it.amount; if (issues[k].ex.length < 5) issues[k].ex.push(it.nic) }
  const seen = new Set()
  for (const it of e.items) {
    const p = docs.get(it.parcelId)
    const key = `${it.parcelId}|${it.kind}|${it.type}`
    if (seen.has(key)) add('doublon dans l\'envoi', it); seen.add(key)
    if (!p) { add('expédition introuvable (archivée ?)', it); continue }
    if (it.kind === 'port_du') {
      if (Number(p.price) !== it.amount) add(`montant ≠ prix de l'expédition`, it)
      if (p.portChefReceivedAt) add('port dû DÉJÀ reçu par le chef d\'agence', it)
      if (p.portAdminTransferred) add('port dû déjà versé à l\'admin', it)
      if (!['collected', 'received'].includes(p.portStatus)) add(`port dû pas encaissé (statut ${p.portStatus || '-'})`, it)
      const t = p.portCollectedAt?.toMillis?.() ?? Date.parse(p.portCollectedAt || '')
      if (t && t < MONEY_START) add('encaissé avant le 05/10 08:00 (hors circuit)', it)
      if (!p.portExpReceivedAt) add('pas reçu par le chef d\'exploitation', it)
    } else if (it.kind === 'port_paye') {
      if (p.portStatus === 'received') add('port payé DÉJÀ reçu par le chef d\'agence', it)
      if (Number(p.price) !== it.amount) add(`montant ≠ prix de l'expédition`, it)
    } else if (it.kind === 'cod') {
      if (['remis', 'regle'].includes(p.codStatus)) add('COD DÉJÀ remis au chef d\'agence', it)
      if (p.codStatus !== 'collected') add(`COD statut ${p.codStatus || '-'}`, it)
    }
  }
  const byKind = e.items.reduce((m, i) => { const k = `${i.kind}/${i.type}`; m[k] = m[k] || [0, 0]; m[k][0]++; m[k][1] += i.amount; return m }, {})
  console.log(`\n== Envoi ${d.id} · ${e.group} · ${e.periodLabel} · ${Math.round(e.totals.total.amount)} DH · ${e.items.length} valeurs · ${ids.length} expéditions`)
  console.log('   contenu :', JSON.stringify(byKind))
  if (!Object.keys(issues).length) console.log('   ✓ aucune anomalie')
  for (const [k, v] of Object.entries(issues)) console.log(`   ⚠️ ${k} : ${v.n} · ${Math.round(v.m)} DH  ex. ${v.ex.join(', ')}`)
}
process.exit(0)
