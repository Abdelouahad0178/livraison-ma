/** Aligne codPaymentType sur serviceType (valeur saisie à la création / modifiée par un agent)
 *  pour les colis en conflit. Sauvegarde les anciennes valeurs dans scripts/codPaymentType-backup.json.
 *  Usage: node scripts/migrate-codPaymentType-conflicts.mjs [--dry-run] */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'
const DRY = process.argv.includes('--dry-run')
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json','utf8'))) })
const db = admin.firestore()
const A={especes:'especes',cod_especes:'especes',cheque:'cheque',cod_cheque:'cheque',traite:'traite',cod_traite:'traite',retour_bl:'bon_livraison',bon_livraison:'bon_livraison'}
const norm=r=>String(r??'').toLowerCase().split(',').map(s=>A[s.trim()]).filter(Boolean)
const snap = await db.collection('parcels').where('codAmount','>',0).get()
const backup=[]; let batch=db.batch(), n=0
for (const d of snap.docs){ const p=d.data(); const s=norm(p.serviceType)[0]; if(!s) continue
  if(p.codPaymentType===s) continue
  backup.push({id:d.id,old:p.codPaymentType??null,new:s,serviceType:p.serviceType})
  if(!DRY){ batch.update(d.ref,{codPaymentType:s}); if(++n>=400){await batch.commit();batch=db.batch();n=0} } }
if(!DRY){ if(n) await batch.commit(); writeFileSync('scripts/codPaymentType-backup.json',JSON.stringify(backup,null,1)) }
console.log(DRY?'simulation':'corrigés', backup.length)
const c={}; backup.forEach(b=>{const k=`${b.serviceType}: ${b.old} -> ${b.new}`;c[k]=(c[k]||0)+1}); console.log(c)
process.exit(0)
