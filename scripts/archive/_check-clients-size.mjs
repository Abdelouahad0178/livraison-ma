// LECTURE SEULE : poids des fiches clients par ville et par champ (saisie « Nouvelle expédition »).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const s = await admin.firestore().collection('clients').get()
const city = {}, field = {}
s.docs.forEach(d => { const v = d.data(); const n = JSON.stringify(v).length; const c = v.city || '?'; city[c] = city[c] || [0, 0]; city[c][0]++; city[c][1] += n
  for (const [k, x] of Object.entries(v)) field[k] = (field[k] || 0) + JSON.stringify(x ?? null).length + k.length })
console.log('total', s.size, 'fiches')
Object.entries(city).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).forEach(([c, [n, b]]) => console.log(c.padEnd(16), n, (b / 1e6).toFixed(2) + ' Mo'))
const tot = Object.values(field).reduce((a, b) => a + b, 0)
Object.entries(field).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, b]) => console.log('  ' + k.padEnd(24), (100 * b / tot).toFixed(1) + ' %'))
process.exit(0)
