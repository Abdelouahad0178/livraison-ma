// LECTURE SEULE : COD EN ESPÈCES des expéditions créées en septembre 2026 (parcels + archives), par expéditeur → JSON.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const OUT = process.argv[2]
// Mois (AAAA-MM) : 2e argument, défaut 2026-09
const MONTH = process.argv[3] || '2026-09'
const [Y, M] = MONTH.split('-').map(Number)
const from = admin.firestore.Timestamp.fromDate(new Date(`${MONTH}-01T00:00:00+01:00`))
const to = admin.firestore.Timestamp.fromDate(new Date(`${M === 12 ? Y + 1 : Y}-${String(M === 12 ? 1 : M + 1).padStart(2, '0')}-01T00:00:00+01:00`))
const num = v => Number.parseFloat(String(v ?? '').replace(',', '.')) || 0
const DOC = ['cheque', 'traite', 'cod_cheque', 'cod_traite', 'retour_bl', 'bon_livraison', 'simple']
// Part ESPÈCES du COD (mixte : codCashAmount ; chèque / traite / Retour BL : 0)
const cashOf = p => {
  const total = num(p.codAmount); if (total <= 0) return 0
  if (p.codMixed === true) return Math.min(num(p.codCashAmount), total)
  const t = String(p.codPaymentType || p.serviceType || 'especes').toLowerCase().split(',')[0].trim()
  return DOC.includes(t) ? 0 : total
}
const ms = v => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() || 0 : 0)
const rows = []
for (const col of ['parcels', 'parcels_archive']) {
  const s = await db.collection(col).where('createdAt', '>=', from).where('createdAt', '<', to).get()
  for (const d of s.docs) {
    const p = d.data()
    const cash = cashOf(p); if (cash <= 0) continue
    const returned = !!(p.wasReturned || p.returnedAt) || ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé'].includes(p.status)
    const step = p.codSenderPaid ? 'Réglé à l\'expéditeur'
      : p.centralDeposited ? 'Versé au compte société'
      : p.codSentToSource ? 'Envoyé à l\'agence source'
      : p.codStatus === 'remis' || p.codStatus === 'regle' ? 'Reçu en caisse (agence)'
      : p.codStatus === 'collected' ? 'Encaissé (livreur / chef d\'exploitation)'
      : returned ? 'Retourné — non encaissé' : 'Pas encore encaissé'
    rows.push({
      id: d.id, archived: col === 'parcels_archive' || p.isArchived === true,
      nic: p.senderNic || p.sender?.nic || p.trackingId || '',
      sender: String(p.clientName || p.sender?.name || '—').trim(), senderTel: p.sender?.tel || '',
      origin: p.originCity || p.sender?.city || '', dest: p.destinationCity || p.receiver?.city || '', receiver: p.receiver?.name || '',
      created: ms(p.createdAt), status: p.status || '', cash, total: num(p.codAmount), mixed: p.codMixed === true,
      collectedAt: ms(p.codCollectedAt), step, paidSender: !!p.codSenderPaid,
    })
  }
}
writeFileSync(OUT, JSON.stringify({ generatedAt: Date.now(), month: MONTH, rows }))
const bySender = rows.reduce((m, r) => (m[r.sender] = (m[r.sender] || 0) + r.cash, m), {})
console.log(`expéditions COD espèces (${MONTH}) :`, rows.length, '| expéditeurs :', Object.keys(bySender).length, '| total :', Math.round(rows.reduce((t, r) => t + r.cash, 0)), 'DH')
console.log('étapes :', rows.reduce((m, r) => (m[r.step] = (m[r.step] || 0) + 1, m), {}))
process.exit(0)
