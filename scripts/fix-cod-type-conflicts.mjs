/**
 * Corrige les colis dont le type de retour de fonds est incohérent :
 *   - serviceType multiple ('traite,cheque')        → premier type valide
 *   - codPaymentType ≠ serviceType (espèces/chèque/traite), ou vide alors que codAmount > 0
 *     → codPaymentType = type du serviceType (serviceType fait foi) ; codStatus null → 'pending'
 *   - serviceType 'simple' / 'retour_bl' avec codAmount > 0 → REVUE MANUELLE (jamais corrigé
 *     automatiquement, sauf option --simple-cod=especes|zero)
 *
 * Par défaut : SIMULATION (aucune écriture). Seuls les COD non encore encaissés sont corrigés
 * (codStatus null/pending et pas de codCollectedAt), sauf --include-collected.
 *
 * Usage :
 *   node scripts/fix-cod-type-conflicts.mjs                     # simulation (liste + corrections proposées)
 *   node scripts/fix-cod-type-conflicts.mjs --apply             # écrit + sauvegarde JSON
 *   options : --include-collected   --simple-cod=especes|zero
 * Restauration : la sauvegarde scripts/fix-cod-type-conflicts-backup-<date>.json contient
 * les anciennes valeurs (champs modifiés uniquement) de chaque colis.
 */
import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const INCLUDE_COLLECTED = process.argv.includes('--include-collected')
const SIMPLE_COD = (process.argv.find(a => a.startsWith('--simple-cod=')) || '').split('=')[1] || ''

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()

const VALID = ['simple', 'especes', 'cheque', 'traite', 'retour_bl', 'retourne', 'oc']
const NON_COD = ['simple', 'retour_bl']
const CPT = { especes: 'especes', cheque: 'cheque', traite: 'traite', retour_bl: 'bon_livraison' }
const normService = raw => {
  const s = String(raw ?? '').trim()
  if (!s.includes(',')) return s
  const parts = s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  return parts.find(x => VALID.includes(x)) || parts[0] || ''
}

const snap = await db.collection('parcels')
  .select('trackingId', 'sender', 'serviceType', 'codPaymentType', 'codAmount', 'codStatus', 'codCollectedAt', 'status', 'originCity', 'destinationCity')
  .get()

const plans = [], manual = [], skipped = []
for (const d of snap.docs) {
  const p = d.data()
  const amt = parseFloat(p.codAmount) || 0
  const rawSt = String(p.serviceType ?? '')
  const st = normService(rawSt)
  const collected = !!p.codCollectedAt || ['collected', 'remis', 'regle'].includes(p.codStatus)
  const row = {
    id: d.id, trackingId: p.trackingId || '', nic: p.sender?.nic || '', serviceType: p.serviceType ?? null,
    codPaymentType: p.codPaymentType ?? null, codAmount: amt, codStatus: p.codStatus ?? null,
    status: p.status || '', originCity: p.originCity || '', destinationCity: p.destinationCity || '',
  }
  const patch = {}
  if (st !== rawSt) patch.serviceType = st

  if (amt > 0 && NON_COD.includes(st)) {
    const fix = SIMPLE_COD === 'especes' ? { serviceType: 'especes', codPaymentType: 'especes', ...(p.codStatus ? {} : { codStatus: 'pending' }) }
      : SIMPLE_COD === 'zero' ? { codAmount: 0, codPaymentType: null, ...(p.codStatus === 'pending' ? { codStatus: null } : {}) }
      : null
    if (!fix || (collected && !INCLUDE_COLLECTED)) {
      manual.push({ ...row, proposal: `REVUE MANUELLE : service "${st}" avec RF ${amt} DH → soit serviceType 'especes' (--simple-cod=especes), soit codAmount 0 (--simple-cod=zero)${collected ? ' [déjà encaissé]' : ''}` })
      continue
    }
    Object.assign(patch, fix)
  } else if (amt > 0) {
    const expected = CPT[st]
    if (expected && p.codPaymentType !== expected) {
      if (collected && !INCLUDE_COLLECTED) { skipped.push({ ...row, proposal: `codPaymentType → ${expected} [déjà encaissé : --include-collected]` }); continue }
      patch.codPaymentType = expected
      if (!p.codStatus) patch.codStatus = 'pending'
    }
  }
  if (Object.keys(patch).length === 0) continue
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, k in p ? p[k] : null]))
  plans.push({ ...row, before, patch, ref: d.ref })
}

const fmt = r => `${r.trackingId.padEnd(20)} NIC ${String(r.nic).padEnd(9)} ${String(r.serviceType).padEnd(14)} cpt=${String(r.codPaymentType).padEnd(8)} RF=${String(r.codAmount).padEnd(9)} codStatus=${String(r.codStatus).padEnd(8)} ${r.status.padEnd(22)} ${r.originCity}→${r.destinationCity}`
console.log(`\n${snap.size} colis analysés — ${plans.length} correction(s), ${manual.length} revue(s) manuelle(s), ${skipped.length} ignoré(s) (déjà encaissés)\n`)
for (const r of plans) console.log(fmt(r), '\n   →', JSON.stringify(r.patch))
if (manual.length) { console.log('\n--- Revue manuelle ---'); for (const r of manual) console.log(fmt(r), '\n   →', r.proposal) }
if (skipped.length) { console.log('\n--- Ignorés (déjà encaissés) ---'); for (const r of skipped) console.log(fmt(r), '\n   →', r.proposal) }

if (!APPLY) { console.log('\nSIMULATION : aucune écriture. Relancer avec --apply pour corriger.'); process.exit(0) }
if (plans.length === 0) { console.log('\nRien à corriger.'); process.exit(0) }

const backupFile = `scripts/fix-cod-type-conflicts-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(backupFile, JSON.stringify(plans.map(({ ref, ...r }) => r), null, 1))
console.log(`\nSauvegarde : ${backupFile}`)
let batch = db.batch(), n = 0
const now = new Date().toISOString()
for (const r of plans) {
  batch.update(r.ref, { ...r.patch, codTypeFixedAt: now, codTypeFixedFrom: r.before })
  if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0 }
}
if (n) await batch.commit()
console.log(`${plans.length} colis corrigés.`)
process.exit(0)
