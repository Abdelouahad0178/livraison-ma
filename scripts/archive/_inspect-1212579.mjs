// LECTURE SEULE : toutes les expéditions portant le N° EXP 1212579 (parcels + archives), qui / quand / comment.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const NIC = '1212579'
const ts = (v) => (v?.toDate ? v.toDate().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' }) : v)
const found = new Map()
for (const col of ['parcels', 'parcels_archive']) {
  for (const f of ['senderNic', 'nic', 'trackingId', 'sender.nic']) {
    for (const val of [NIC, Number(NIC)]) {
      const s = await db.collection(col).where(f, '==', val).get()
      s.docs.forEach(d => found.set(col + '/' + d.id, d.data()))
    }
  }
}
console.log('Trouvées :', found.size)
for (const [path, v] of found) {
  const keep = {}
  for (const [k, x] of Object.entries(v)) {
    if (k === 'history') continue
    if (/^(sender|receiver)$/.test(k)) { keep[k] = { name: x?.name, city: x?.city, nic: x?.nic, tel: x?.tel }; continue }
    if (/created|agent|by|source|portal|request|origin|destination|status|price|portType|codAmount|workDate|operationDate|clientName|clientId|nbColis|numberOfParcels|trackingId|Nic|nic|device|offline|pending|duplicate|copied|returnOf/i.test(k)) keep[k] = ts(x)
  }
  console.log('\n══', path)
  console.log(JSON.stringify(keep, null, 1))
  console.log('historique :', JSON.stringify((v.history || []).slice(0, 6).map(h => ({ t: h?.timestamp, s: h?.status, by: h?.by || h?.userName || h?.agentName || h?.user, note: h?.note || h?.comment })), null, 1))
}
process.exit(0)
