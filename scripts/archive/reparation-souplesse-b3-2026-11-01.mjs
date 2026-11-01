/**
 * Diagnostic de souplesse, lot B3 — réparations de données acceptées par l'utilisateur le 01/11/2026 :
 *  A. Expéditions actives qui ne sont plus « Livré » (hors circuit retour) mais gardent une date de livraison : la date est
 *     retirée (le statut ne change pas). Elles bloquaient l'assignation en lot (cas 1248627).
 *  B. Expéditions marquées « COD versé à l'admin » alors que le COD n'est pas encaissé (bug du 24/10 : un versement de PORTS
 *     posait aussi la marque COD) : la marque COD est retirée ; la marque « port versé » (juste) reste.
 * Sauvegarde complète AVANT ; chaque expédition est relue dans une transaction et n'est modifiée que si elle est encore
 * dans l'état constaté ; une ligne d'historique est ajoutée.
 *   node scripts/reparation-souplesse-b3-2026-11-01.mjs           # simulation
 *   node scripts/reparation-souplesse-b3-2026-11-01.mjs --apply   # réparation
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const { FieldValue } = admin.firestore
const RETURN = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const isA = p => !!p.deliveredAt && p.status !== 'Livré' && !RETURN.includes(p.status)
const isB = p => !!p.adminTransferred && Number(p.codAmount) > 0 && (!p.codStatus || p.codStatus === 'pending')
  && !!p.adminTransferId && p.adminTransferId === p.portAdminTransferId && !!p.portAdminTransferred
const COD_MARKS = ['adminTransferred', 'adminTransferId', 'adminTransferAt', 'adminTransferBy', 'adminTransferById']

const snap = await db.collection('parcels').where('isArchived', '==', false).get()
const targets = snap.docs.filter(d => isA(d.data()) || isB(d.data()))
const nA = targets.filter(d => isA(d.data())).length, nB = targets.filter(d => isB(d.data())).length
console.log(`À réparer : A (date de livraison) ${nA} · B (fausse marque COD versé) ${nB}`)
if (!APPLY) { console.log('Simulation : rien n\'est écrit (ajouter --apply).'); process.exit(0) }

const ser = v => v?.toDate ? { __ts: v.toDate().toISOString() } : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)])) : v
const BACKUP = `scripts/reparation-souplesse-b3-backup-${Date.now()}.json`
writeFileSync(BACKUP, JSON.stringify(targets.map(d => ({ id: d.id, data: ser(d.data()) }))))
console.log('Sauvegarde :', BACKUP)

let doneA = 0, doneB = 0, skipped = 0
let next = 0
const worker = async () => {
  while (next < targets.length) {
    const ref = targets[next++].ref
    await db.runTransaction(async tx => {
      const p = (await tx.get(ref)).data()
      const u = {}, notes = []
      if (isA(p)) { u.deliveredAt = FieldValue.delete(); notes.push('date de livraison retirée (expédition plus « Livré »)'); doneA++ }
      if (isB(p)) { COD_MARKS.forEach(k => { u[k] = FieldValue.delete() }); notes.push('fausse marque « COD versé à l\'admin » retirée (bug du 24/10 ; le port reste versé)'); doneB++ }
      if (!notes.length) { skipped++; return }
      u.history = FieldValue.arrayUnion({ status: p.status, timestamp: new Date().toISOString(), updatedBy: 'admin',
        note: `Réparation (diagnostic du 01/11/2026) : ${notes.join(' ; ')}` })
      tx.update(ref, u)
    })
  }
}
await Promise.all(Array.from({ length: 10 }, worker))
console.log(`✅ Réparé : A ${doneA} · B ${doneB} · déjà changées entre-temps (non touchées) : ${skipped}`)
process.exit(0)
