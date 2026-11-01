// LECTURE SEULE : poids de l'ouverture de l'onglet « Ports en compte » avant (parcels, tout) / après (parcelsLite, mois).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const from = T.fromMillis(new Date(2026, 9, 1).getTime() - 2 * 864e5), to = T.fromMillis(new Date(2026, 9, 25, 23, 59).getTime() + 2 * 864e5)
const load = async (col, city, b) => { const qs = [db.collection(col).where('originCity', '==', city).where('portType', 'in', ['port_en_compte_expediteur', 'port_en_compte']),
  db.collection(col).where('destinationCity', '==', city).where('portType', 'in', ['port_en_compte_destinataire', 'port_en_compte'])]
  const s = await Promise.all(qs.map(q => (b ? q.where('createdAt', '>=', from).where('createdAt', '<=', to) : q).get()))
  const m = new Map(); s.forEach(x => x.docs.forEach(d => m.set(d.id, d.data()))); return [m.size, [...m.values()].reduce((a, v) => a + JSON.stringify(v).length, 0) / 1e6] }
for (const c of ['Agadir', 'Casablanca', 'Marrakech']) {
  const [a, b] = await Promise.all([load('parcels', c, false), load('parcelsLite', c, true)])
  console.log(`${c.padEnd(11)} avant ${a[0]} exp. / ${a[1].toFixed(1)} Mo  →  après ${b[0]} exp. / ${b[1].toFixed(2)} Mo`)
}
process.exit(0)
