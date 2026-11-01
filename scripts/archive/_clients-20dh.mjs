// LECTURE SEULE : clients d'Agadir / Ait Melloul et leur prix par colis (price / nbColis) — qui paie le port :
// port payé / en compte expéditeur → l'expéditeur (agence d'origine) ; port dû / en compte destinataire → le destinataire.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const CITIES = ['Agadir', 'Ait Melloul']
const since = new Date(process.argv[2] || '2026-07-20T00:00:00')
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const payers = new Map()
let total = 0
for (const col of ['parcels', 'parcels_archive']) {
  let last = null
  for (;;) {
    let q = db.collection(col).where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since)).orderBy('createdAt').limit(3000)
      .select('sender', 'receiver', 'originCity', 'destinationCity', 'price', 'nbColis', 'numberOfParcels', 'portType', 'clientName', 'clientId', 'receiverClientId', 'status', 'createdAt')
    if (last) q = q.startAfter(last)
    const s = await q.get()
    if (s.empty) break
    last = s.docs[s.docs.length - 1]
    for (const d of s.docs) {
      const p = d.data()
      const t = String(p.portType || '')
      const destPays = t === 'port_du' || t === 'port_du_cheque' || t === 'port_en_compte_destinataire'
      const city = destPays ? (p.destinationCity || p.receiver?.city) : (p.originCity || p.sender?.city)
      if (!CITIES.includes(city)) continue
      const name = destPays ? p.receiver?.name : (p.clientName || p.sender?.name)
      const tel = destPays ? p.receiver?.tel : p.sender?.tel
      const k = norm(name)
      if (!k) continue
      const price = Number(p.price) || 0
      const n = Math.max(1, parseInt(p.nbColis ?? p.numberOfParcels ?? 1, 10) || 1)
      if (price <= 0) continue
      total++
      const key = `${city}|${k}`
      const c = payers.get(key) || { city, name: String(name).trim(), tel: '', exps: 0, colis: 0, montant: 0, at20: 0, colis20: 0, roles: new Set(), types: {}, last: 0 }
      c.exps++; c.colis += n; c.montant += price
      if (Math.abs(price / n - 20) < 0.01) { c.at20++; c.colis20 += n }
      if (tel && !c.tel) c.tel = String(tel)
      c.roles.add(destPays ? 'destinataire' : 'expéditeur')
      c.types[t] = (c.types[t] || 0) + 1
      const ms = p.createdAt?.toMillis?.() || 0
      if (ms > c.last) c.last = ms
      payers.set(key, c)
    }
  }
}
const list = [...payers.values()].map(c => ({ ...c, roles: [...c.roles].join(' + '), share: c.at20 / c.exps }))
const dist = [1, 0.8, 0.5].map(th => `≥${th * 100}% à 20 DH : ${list.filter(c => c.at20 > 0 && c.share >= th).length} clients`)
console.log(`Depuis ${since.toISOString().slice(0, 10)} : ${total} expéditions payées à Agadir / Ait Melloul, ${list.length} clients payeurs`)
console.log(dist.join('\n'))
console.log('au moins une à 20 DH :', list.filter(c => c.at20 > 0).length)
writeFileSync(process.env.OUT || 'C:/Users/chaab/AppData/Local/Temp/claude/c--Users-chaab-Desktop-livraison-ma/cb972437-2d37-4767-a2a7-180d4aee4dd6/scratchpad/clients20.json', JSON.stringify(list))
process.exit(0)
