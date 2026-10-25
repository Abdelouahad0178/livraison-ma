// Demande de l'admin (20/10/2026) : 1212579 saisie en double le 19/10 par ABDELLAH ELKERDAOUI (Ait Melloul).
// On garde la 1re saisie (port payé, 60 DH encaissés, hkfGDRs32pJQPbYmIqOb) et on SUPPRIME le doublon
// « en compte destinataire » (PuhSAvdXBgswzROyl0zX). Sauvegarde complète avant suppression.
// La fiche d'arrivage ARR-20261020-Y2AF (historique) n'est pas modifiée.
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const ref = db.doc('parcels/PuhSAvdXBgswzROyl0zX')
const snap = await ref.get()
if (!snap.exists) { console.log('Déjà supprimée.'); process.exit(0) }
const p = snap.data()
if (p.senderNic !== '1212579' || p.portType !== 'port_en_compte_destinataire' || p.trackingId !== 'LMA-456NPEECW-QTYJ') throw new Error('Expédition inattendue')
const keep = await db.doc('parcels/hkfGDRs32pJQPbYmIqOb').get()
if (!keep.exists || keep.data().portType !== 'port_paye') throw new Error("L'expédition à garder est introuvable")
writeFileSync('scripts/delete-1212579-doublon-backup.json', JSON.stringify({ id: ref.id, createTime: snap.createTime.toDate().toISOString(), data: p }, (k, v) => (v && v._seconds !== undefined ? { _ts: v._seconds, _ns: v._nanoseconds } : v), 2))
await ref.delete()
console.log('Supprimée :', ref.id, p.trackingId, '— sauvegarde : scripts/delete-1212579-doublon-backup.json')
process.exit(0)
