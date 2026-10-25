// LECTURE SEULE : collectées entre le 05/10 et il y a 14 jours — combien déjà versées à l'admin, et forme du champ.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const city = process.argv[2] || 'Agadir'
const START = new Date(2026, 9, 5, 8), s14 = new Date(); s14.setDate(s14.getDate() - 13); s14.setHours(8, 0, 0, 0)
const SH = [['destinationCity', 'portCollectedAt'], ['destinationCity', 'codCollectedAt'], ['originCity', 'portPayeExpReceivedAt'], ['originCity', 'portReceivedAt']]
const m = new Map()
for (const [cf, df] of SH) for (const [a, z] of [[T.fromDate(START), T.fromDate(s14)], [START.toISOString(), s14.toISOString()]]) {
  const s = await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', a).where('createdAt', '<', T.now()).get()
  s.docs.forEach(d => { const v = d.data()[df]; const t = typeof v === 'string' ? Date.parse(v) : v?.toMillis?.(); if (t < s14.getTime()) m.set(d.id, d.data()) })
}
const c = { total: m.size, portAdminTrue: 0, portAdminFalse: 0, portAdminAbsent: 0, adminTrue: 0, ni: 0 }
for (const p of m.values()) {
  if (p.portAdminTransferred === true) c.portAdminTrue++; else if (p.portAdminTransferred === false) c.portAdminFalse++; else c.portAdminAbsent++
  if (p.adminTransferred === true) c.adminTrue++
  if (!p.portAdminTransferred && !p.adminTransferred) c.ni++
}
console.log(city, 'collectées entre 05/10 et', s14.toLocaleDateString('fr-FR'), ':', c)
process.exit(0)
