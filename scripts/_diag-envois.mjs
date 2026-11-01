// LECTURE SEULE : envois de valeurs chef d'exploitation → chef d'agence, par ville et statut.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const s = await db.collection('valeursEnvois').get()
const by = {}
for (const d of s.docs) {
  const e = d.data(); const k = `${e.city} / ${e.status} / ${e.group || 'ancien'}`
  by[k] = by[k] || { n: 0, amount: 0, items: 0, err: 0, last: '' }
  by[k].n++; by[k].amount += e.totals?.total?.amount || 0; by[k].items += (e.items || []).length; if ((e.validationErrors || []).length) by[k].err++
  const c = e.createdAt?.toDate?.().toISOString().slice(0, 16) || ''; if (c > by[k].last) by[k].last = c
}
console.log(`valeursEnvois : ${s.size}`)
for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k.padEnd(40)} ${String(v.n).padStart(4)} envois · ${Math.round(v.amount)} DH · ${v.items} valeurs · avec erreurs ${v.err} · dernier ${v.last}`)
const ag = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.city === 'Agadir').sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 12)
console.log('\nAgadir — 12 derniers envois :')
for (const e of ag) console.log(`  ${e.createdAt?.toDate?.().toISOString().slice(0, 16)} ${e.status.padEnd(8)} ${String(e.group || '-').padEnd(11)} ${Math.round(e.totals?.total?.amount || 0)} DH ${(e.items || []).length} val. par ${e.createdByName} ${e.periodLabel || ''} ${e.validatedByName ? '→ ' + e.validatedByName : ''} ${e.rejectReason ? 'REJET: ' + e.rejectReason : ''} ${(e.validationErrors || []).length ? 'ERREURS: ' + e.validationErrors.slice(0, 2).join(' | ') : ''}`)
process.exit(0)
