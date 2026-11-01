/**
 * 🩺 CONTRÔLE QUOTIDIEN DE LA SANTÉ DES DONNÉES (01/11/2026, diagnostic de souplesse — lot A3).
 * Chaque matin à 5 h (et sur demande, Admin › Rapports du Contrôleur) : LECTURE SEULE des expéditions actives.
 *  1. Incohérences laissées par une correction (date de livraison restée, « COD versé » sans encaissement…) : nombre + exemples.
 *  2. Copies tenues par les Cloud Functions comparées à l'original sur les expéditions les plus récentes
 *     (parcelsLite, versementContrib, envoiContrib) et totaux recalculés (versementDays, envoiHolders).
 * Écrit SEULEMENT le rapport : healthChecks/{journée} et healthChecks/latest. Aucune expédition n'est modifiée.
 */
'use strict'

const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { projectParcelLite, liteKey } = require('./parcelLite')
const { versementOf, holdersByCity, sameContribution, BUCKETS } = require('./versement')
const { envoiContribOf, envoiKey, holderTotalsOf, HOLDER_GROUPS } = require('./envoiContrib')

const RETURN_STATUSES = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const MAX_EXAMPLES = 15
const SAMPLE = 200 // expéditions les plus récentes comparées à leurs copies
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
const notCollected = s => !s || s === 'pending'

/** Incohérences : clé → libellé (affiché tel quel dans la page Admin) + test. */
const RULES = {
  livraison_restee: {
    label: 'Date de livraison restée alors que l\'expédition n\'est plus « Livré » (bloque l\'assignation en lot)',
    test: p => !!p.deliveredAt && p.status !== 'Livré' && !RETURN_STATUSES.includes(p.status),
  },
  livre_sans_date: { label: '« Livré » sans date de livraison', test: p => p.status === 'Livré' && !p.deliveredAt },
  cod_verse_sans_encaissement: {
    label: 'Marquée « COD versé à l\'admin » alors que le COD n\'est pas encaissé (le versement COD sera refusé)',
    test: p => !!p.adminTransferred && Number(p.codAmount) > 0 && notCollected(p.codStatus),
  },
  cod_encaisse_sans_date: {
    label: 'COD encaissé sans date d\'encaissement',
    test: p => Number(p.codAmount) > 0 && ['collected', 'remis', 'regle'].includes(p.codStatus) && !p.codCollectedAt,
  },
  en_compte_encaisse: {
    label: 'Port « en compte » marqué encaissé',
    test: p => String(p.portType || '').startsWith('port_en_compte') && ['collected', 'received'].includes(p.portStatus),
  },
  port_non_encaisse_avec_reception: {
    label: 'Port « non encaissé » avec des traces de réception (chef d\'exploitation / chef d\'agence)',
    test: p => notCollected(p.portStatus) && !!(p.portExpReceivedAt || p.portChefReceivedAt),
  },
  cod_non_encaisse_avec_reception: {
    label: 'COD « non encaissé » avec une trace de réception par le chef d\'exploitation',
    test: p => Number(p.codAmount) > 0 && notCollected(p.codStatus) && !!p.codExpReceivedAt,
  },
}
const FIELDS = ['senderNic', 'trackingId', 'status', 'deliveredAt', 'adminTransferred', 'codAmount', 'codStatus', 'codCollectedAt',
  'portType', 'portStatus', 'portExpReceivedAt', 'portChefReceivedAt', 'codExpReceivedAt']

async function runHealthCheck(db, { save = true } = {}) {
  const t0 = Date.now()
  const nicOf = p => p.senderNic || p.trackingId || '?'

  // 1. Incohérences (expéditions actives)
  const active = await db.collection('parcels').where('isArchived', '==', false).select(...FIELDS).get()
  const rules = {}
  for (const [k, r] of Object.entries(RULES)) rules[k] = { label: r.label, count: 0, examples: [] }
  active.docs.forEach(d => {
    const p = d.data()
    for (const [k, r] of Object.entries(RULES)) if (r.test(p)) {
      rules[k].count++
      if (rules[k].examples.length < MAX_EXAMPLES) rules[k].examples.push(nicOf(p))
    }
  })

  // 2. Copies : les SAMPLE expéditions les plus récentes, complètes, comparées à leurs copies
  const recent = await db.collection('parcels').orderBy('createdAt', 'desc').limit(SAMPLE).get()
  const holders = await holdersByCity(db)
  const refs = col => recent.docs.map(d => db.collection(col).doc(d.id))
  const [lites, vcs, ecs] = await Promise.all([db.getAll(...refs('parcelsLite')), db.getAll(...refs('versementContrib')), db.getAll(...refs('envoiContrib'))])
  const copies = { lite: { checked: 0, diff: 0, examples: [] }, versement: { checked: 0, diff: 0, examples: [] }, envoi: { checked: 0, diff: 0, examples: [] } }
  const mark = (c, p) => { c.diff++; if (c.examples.length < MAX_EXAMPLES) c.examples.push(nicOf(p)) }
  recent.docs.forEach((d, i) => {
    const p = d.data()
    copies.lite.checked++
    const l = lites[i].exists ? { ...lites[i].data() } : null
    if (l) delete l.liteUpdatedAt
    if (!l || liteKey(l) !== liteKey(projectParcelLite(p))) mark(copies.lite, p)
    copies.versement.checked++
    const want = versementOf(p, holders), have = vcs[i].exists ? vcs[i].data() : null
    if (!sameContribution(want, have)) mark(copies.versement, p)
    copies.envoi.checked++
    const we = envoiContribOf(d.id, p), he = ecs[i].exists ? { items: ecs[i].get('items'), holders: ecs[i].get('holders') } : null
    if (envoiKey(we) !== envoiKey(he)) mark(copies.envoi, p)
  })

  // 3. Totaux recalculés depuis les contributions
  const aggregates = { versementDays: { checked: 0, diff: 0, examples: [] }, envoiHolders: { checked: 0, diff: 0, examples: [] } }
  const [vcAll, vdAll, ecAll, ehAll] = await Promise.all([db.collection('versementContrib').get(), db.collection('versementDays').get(),
    db.collection('envoiContrib').get(), db.collection('envoiHolders').get()])
  const dayWant = {}
  vcAll.docs.forEach(d => { const c = d.data(); const k = `${c.day}_${String(c.city).replace(/[/\s]+/g, '-')}`; const w = dayWant[k] = dayWant[k] || {}; w[c.bucket] = r2((w[c.bucket] || 0) + c.amount) })
  vdAll.docs.forEach(d => {
    aggregates.versementDays.checked++
    const x = d.data(), w = dayWant[d.id] || {}
    if (BUCKETS.some(b => r2(x[b]) !== r2(w[b]))) { aggregates.versementDays.diff++; if (aggregates.versementDays.examples.length < MAX_EXAMPLES) aggregates.versementDays.examples.push(d.id) }
  })
  const holdWant = {}
  ecAll.docs.forEach(d => { for (const [h, t] of Object.entries(holderTotalsOf(d.data()))) { const w = holdWant[h] = holdWant[h] || {}; for (const g of HOLDER_GROUPS) if (t[g]) w[g] = r2((w[g] || 0) + t[g]) } })
  const holderIds = new Set([...Object.keys(holdWant), ...ehAll.docs.map(d => d.id)])
  const ehMap = new Map(ehAll.docs.map(d => [d.id, d.data()]))
  holderIds.forEach(h => {
    aggregates.envoiHolders.checked++
    if (HOLDER_GROUPS.some(g => r2(holdWant[h]?.[g]) !== r2(ehMap.get(h)?.[g]))) { aggregates.envoiHolders.diff++; if (aggregates.envoiHolders.examples.length < MAX_EXAMPLES) aggregates.envoiHolders.examples.push(h) }
  })

  const now = new Date()
  const day = new Date(now.getTime() + 3600e3).toISOString().slice(0, 10) // journée, heure du Maroc
  const report = { at: now.toISOString(), day, durationMs: Date.now() - t0, scanned: active.size, sample: recent.size, rules, copies, aggregates,
    problems: Object.values(rules).reduce((s, r) => s + r.count, 0) + Object.values(copies).reduce((s, c) => s + c.diff, 0) + Object.values(aggregates).reduce((s, c) => s + c.diff, 0) }
  if (save) await Promise.all([db.collection('healthChecks').doc(day).set(report), db.collection('healthChecks').doc('latest').set(report)])
  return report
}

exports.scheduledHealthCheck = onSchedule({ schedule: '0 5 * * *', timeZone: 'Africa/Casablanca', memory: '1GiB', timeoutSeconds: 540 },
  async () => { const r = await runHealthCheck(admin.firestore()); console.log(`🩺 Contrôle : ${r.problems} point(s) à voir sur ${r.scanned} expéditions actives`) })

exports.runHealthCheckNow = onCall({ region: 'europe-west1', memory: '1GiB', timeoutSeconds: 540, maxInstances: 1,
  cors: ['https://arelanc.web.app', 'http://localhost:5173'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const db = admin.firestore()
  const me = await db.collection('users').doc(request.auth.uid).get()
  if (!me.exists || me.data().role !== 'admin') throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.')
  const r = await runHealthCheck(db)
  return { problems: r.problems, scanned: r.scanned }
})

exports.runHealthCheck = runHealthCheck
exports.HEALTH_RULES = RULES
