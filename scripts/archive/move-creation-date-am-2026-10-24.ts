// 📅 Demande du 24/10/2026 (admin) : 9 expéditions d'Ait Melloul (saisies par ABDELLAH ELKERDAOUI) passées au 24/10/2026.
// Option choisie : DATE DE CRÉATION SEULE — createdAt (même heure) + workDate ; entrées d'historique et encaissement du port
// payé au guichet faits AU MOMENT DE LA CRÉATION (à ±10 min) suivent ; chargement / arrivée / livraison INCHANGÉS.
// Sauvegarde complète avant écriture. Sans « --apply » : essai à blanc (aucune écriture).
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
import { daysBetween } from '../src/utils/shiftParcelDates'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const APPLY = process.argv.includes('--apply')
const NEW_DAY = '2026-10-24'
const NICS = ['1225005', '1225004', '1225003', '1065671', '1065672', '1059199', '1225408', '1225006', '1092253']
const BY = 'Admin (demande du 24/10/2026)'
const NEAR = 10 * 60 * 1000
const ms = (v: any) => v?.toMillis ? v.toMillis() : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : null
const shiftSame = (v: any, d: number) => v?.toMillis ? T.fromMillis(v.toMillis() + d * 864e5) : new Date(Date.parse(v) + d * 864e5).toISOString()
const fmt = (t: number) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
const fr = (d: string) => d.split('-').reverse().join('/')

const docs: { ref: FirebaseFirestore.DocumentReference; data: any; nic: string }[] = []
for (const nic of NICS) {
  const s = await db.collection('parcels').where('senderNic', '==', nic).get()
  if (s.size !== 1) throw new Error(`${nic} : ${s.size} expédition(s) trouvée(s) — arrêt`)
  const data = s.docs[0].data()
  if (data.originCity !== 'Ait Melloul') throw new Error(`${nic} : ville d'origine ${data.originCity} — arrêt`)
  docs.push({ ref: s.docs[0].ref, data, nic })
}
if (APPLY) {
  const file = `scripts/move-creation-date-am-backup-${Date.now()}.json`
  writeFileSync(file, JSON.stringify(docs.map(d => ({ id: d.ref.id, nic: d.nic, data: d.data })), null, 1))
  console.log('💾 Sauvegarde :', file)
}
for (const { ref, nic } of docs) {
  const r = await db.runTransaction(async tx => {
    const p: any = (await tx.get(ref)).data()
    const created = ms(p.createdAt)!
    const oldDay = p.workDate
    const days = daysBetween(oldDay, NEW_DAY)
    if (!days) return `${nic} : déjà au ${fr(NEW_DAY)}`
    const patch: any = { createdAt: shiftSame(p.createdAt, days), workDate: NEW_DAY }
    const moved: string[] = ['createdAt', 'workDate']
    // Historique : seulement les entrées faites au moment de la création
    const history = (p.history || []).map((h: any, i: number) => {
      const t = ms(h?.timestamp)
      if (t !== null && Math.abs(t - created) <= NEAR) { moved.push(`history[${i}] ${h.status || ''}`); return { ...h, timestamp: shiftSame(h.timestamp, days) } }
      return h
    })
    // Port payé encaissé au guichet à la création
    if (p.portType === 'port_paye' && p.portCollectedAt && Math.abs(ms(p.portCollectedAt)! - created) <= NEAR) { patch.portCollectedAt = shiftSame(p.portCollectedAt, days); moved.push('portCollectedAt') }
    const now = new Date().toISOString()
    patch.history = [...history, { status: p.status, timestamp: now, by: BY, note: `📅 Date de création modifiée : ${fr(oldDay)} → ${fr(NEW_DAY)} (chargement, arrivée et livraison inchangés)` }]
    patch.dateChangeLog = [...(Array.isArray(p.dateChangeLog) ? p.dateChangeLog : []), { at: now, by: BY, from: oldDay, to: NEW_DAY, days, shifted: moved.length, mode: 'creation_only' }]
    patch.adminChanges = [...(Array.isArray(p.adminChanges) ? p.adminChanges : []), { field: "Date de l'expédition", oldValue: fr(oldDay), newValue: fr(NEW_DAY), changedAt: now, changedBy: BY }]
    patch.lastAdminEditAt = now
    patch.lastAdminEditBy = BY
    const kept = ['shipmentLoadedAt', 'destinationArrivedAt', 'deliveredAt'].filter(k => p[k]).map(k => `${k} ${fmt(ms(p[k])!)}`)
    if (APPLY) tx.update(ref, patch)
    return `${nic} : ${fr(oldDay)} ${fmt(created).slice(11)} → ${fr(NEW_DAY)} ${fmt(ms(patch.createdAt)!).slice(11)} (${days > 0 ? '+' : ''}${days} j) | décalés : ${moved.join(', ')} | inchangés : ${kept.join(', ') || '—'}`
  })
  console.log((APPLY ? '✅ ' : '🔎 ') + r)
}
console.log(APPLY ? 'TERMINÉ' : 'ESSAI À BLANC (aucune écriture). Relancer avec --apply pour appliquer.')
process.exit(0)
