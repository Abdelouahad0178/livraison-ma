// LECTURE SEULE : base de calcul de la carte « En gare » (Caisse Agence) vs onglet Admin › En gare.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const dep = new Set((await db.collection('users').where('role', '==', 'livreur-gare').get()).docs.map(d => d.id))
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const out = {}
for (const st of ['Arrivé en agence', 'En cours de livraison', 'Livré']) {
  const s = await db.collection('parcelsLite').where('status', '==', st).where('isArchived', '==', false).get()
  const l = s.docs.map(d => d.data()).filter(p => !p.pickupDriverId && !(p.returnedAt || p.wasReturned))
  const gare = l.filter(p => !p.deliveryDriverId || /^En gare/i.test(p.deliveryDriverName || '') || dep.has(p.deliveryDriverId))
  const portDu = gare.filter(p => p.portType === 'port_du' && !p.portPayeMethod && (!p.portStatus || p.portStatus === 'pending'))
  const cod = gare.filter(p => num(p.codAmount) > 0 && (!p.codStatus || p.codStatus === 'pending'))
  out[st] = { nonArchivees: s.size, enGare: gare.length, ancienLivreur: l.length - gare.length, portDuNb: portDu.length, portDuDH: portDu.reduce((a, p) => a + num(p.price), 0), codNb: cod.length, codDH: Math.round(cod.reduce((a, p) => a + num(p.codAmount), 0)) }
}
console.table(out)
process.exit(0)
