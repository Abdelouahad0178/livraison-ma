// LECTURE SEULE : ports en compte par ville — parcels vs parcelsLite (nombre + total des prix + champs lus par
// l'onglet « Ports en compte »), avant de basculer l'onglet sur la version allégée. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const FIELDS = ['portType', 'portDeliveredBy', 'destinationCity', 'originCity', 'createdByCity', 'portEcheance', 'createdAt', 'workDate',
  'expeditionDate', 'portPaid', 'portPaidAt', 'sender', 'receiver', 'trackingId', 'clientName', 'price', 'status', 'isArchived']
const load = async (col) => {
  const [o, d] = await Promise.all([
    db.collection(col).where('portType', 'in', ['port_en_compte_expediteur', 'port_en_compte']).get(),
    db.collection(col).where('portType', 'in', ['port_en_compte_destinataire', 'port_en_compte']).get(),
  ])
  const m = new Map()
  ;[...o.docs, ...d.docs].forEach(x => m.set(x.id, x.data()))
  return m
}
const [full, lite] = await Promise.all([load('parcels'), load('parcelsLite')])
console.log(`parcels : ${full.size} ports en compte ; parcelsLite : ${lite.size}`)
let missing = 0, diff = 0
const ex = []
for (const [id, f] of full) {
  const l = lite.get(id)
  if (!l) { missing++; if (ex.length < 10) ex.push(`absent: ${f.trackingId || id}`); continue }
  for (const k of FIELDS) if (JSON.stringify(f[k] ?? null) !== JSON.stringify(l[k] ?? null)) { diff++; if (ex.length < 10) ex.push(`${f.trackingId || id} champ ${k}`); break }
}
const extra = [...lite.keys()].filter(id => !full.has(id)).length
console.log(`absents de parcelsLite : ${missing} ; champ différent : ${diff} ; en trop dans parcelsLite : ${extra}`)
ex.forEach(e => console.log('  ' + e))
const size = m => [...m.values()].reduce((s, v) => s + JSON.stringify(v).length, 0)
console.log(`taille ≈ parcels ${(size(full) / 1e6).toFixed(1)} Mo ; parcelsLite ${(size(lite) / 1e6).toFixed(1)} Mo`)
process.exit(0)
