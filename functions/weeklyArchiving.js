/**
 * 🗄️ Archivage automatique (marque isArchived — l'expédition reste dans 'parcels').
 * Chaque jour à 2 h (scheduledWeeklyArchiving) + bouton Admin › Archivage (manualArchiving), functions/index.js.
 * scripts/run-archiving-now.mjs lance EXACTEMENT le même archivage à la main (essai sans écriture : apply: false).
 *
 * Règles « ranger, mais jamais cacher ni bloquer » (05/11/2026, src/utils/archiveRule.ts → functions/shared/archiveRule.js) :
 *   • passagers → 15 jours (functions/archivePassagers.js) ;
 *   • créées depuis le 05/10/2026 → 30 jours, SEULEMENT terminées ET réglées (port + COD) — une expédition non livrée
 *     ou avec de l'argent en attente n'est JAMAIS rangée (avant : tout après 45 jours) ;
 *   • période d'essai (avant le 05/10/2026) → ancienne règle : livrées sans COD 30 jours, le reste 45 jours (réglage).
 * En plus : liste « Anciennes à régler » (archiveWatch/oldUnsettled) — non rangées, créées depuis le 05/10, plus vieilles
 * que la fenêtre des listes (settings/agencies.delays.activeDays, 45 à 90) et pas réglées.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { archivePassagers, findPassagerArchives } = require('./archivePassagers')
const { shouldArchiveNow, isOldUnsettled, oldUnsettledItem, isTrialPeriodParcel, SETTLED_ARCHIVE_DAYS, ARCHIVED_BY_AUTO } = require('./shared/archiveRule')

/** Plafond par ville dans le document de la liste (taille du document < 1 Mo) ; le total reste exact. */
const WATCH_MAX_PER_CITY = 600

async function runWeeklyArchiving(db, { apply = true } = {}) {
  console.log(`🗄️  Démarrage archivage automatique...${apply ? '' : ' (ESSAI : aucune écriture)'}`)

  // Fenêtre des listes (« Tout ») = ancienne limite « tout après N jours » de la période d'essai — réglable par l'admin
  // (settings/agencies.delays.activeDays ; 45 à 90, jamais moins : src/config/siteDelays.ts)
  const setDays = Math.round(Number((await db.doc('settings/agencies').get()).data()?.delays?.activeDays))
  const WINDOW_DAYS = Number.isFinite(setDays) ? Math.min(90, Math.max(45, setDays)) : 45
  const BATCH_SIZE = 500  // = limite d'un WriteBatch Firestore
  // Borne de temps : la fonction dispose de 540 s.
  const TIME_BUDGET_MS = 480000
  const startedAt = Date.now()
  const now = Date.now()
  let timedOut = false

  // Rien ne se range avant 30 jours (hors passagers) : seules les expéditions plus vieilles sont parcourues
  const cutoffTimestamp = Timestamp.fromDate(new Date(now - SETTLED_ARCHIVE_DAYS * 86400000))

  let totalArchived = 0
  let totalProcessed = 0
  let lastDoc = null
  let iterations = 0
  const planned = []  // essai : ce qui serait archivé
  const watch = {}    // « Anciennes à régler » par ville
  let watchTotal = 0

  // 🧳 Passagers (ni clients, ni port en compte) : livrés, simples, port déjà payé / encaissé → archivés à 15 jours
  // (04/11/2026, functions/archivePassagers.js). Passe en premier (rapide) ; une erreur ne bloque pas la suite.
  let passagers = { found: 0, archived: 0, skipped: 0 }
  try {
    if (apply) {
      passagers = await archivePassagers(db)
      console.log(`🧳 Passagers archivés à 15 jours : ${passagers.archived} / ${passagers.found} (laissés : ${passagers.skipped})`)
    } else {
      const r = await findPassagerArchives(db)
      r.found.forEach(p => planned.push({ id: p.id, rule: 'passager-15j', nic: p.senderNic || '', status: p.status }))
      passagers = { found: r.found.length, archived: 0, skipped: 0 }
    }
  } catch (e) {
    console.error('❌ Archivage des passagers à 15 jours :', e)
  }

  console.log(`📦 Archivage des expéditions terminées et réglées de +${SETTLED_ARCHIVE_DAYS} jours (période d'essai : ancienne règle, ${WINDOW_DAYS} jours)...`)

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break }
    iterations++

    let query = db.collection('parcels')
      .where('createdAt', '<', cutoffTimestamp)
      .orderBy('createdAt')
      .limit(BATCH_SIZE)
    if (lastDoc) query = query.startAfter(lastDoc)

    const snapshot = await query.get()
    if (snapshot.empty) {
      console.log(`✅ Tous les colis de +${SETTLED_ARCHIVE_DAYS} j ont été parcourus`)
      break
    }

    totalProcessed += snapshot.size
    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    const batch = db.batch()
    let batchCount = 0

    snapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.isArchived) return

      if (shouldArchiveNow(data, now, WINDOW_DAYS)) {
        if (!apply) {
          planned.push({ id: doc.id, rule: isTrialPeriodParcel(data) ? `essai-${WINDOW_DAYS}j` : `regle-${SETTLED_ARCHIVE_DAYS}j`, nic: data.senderNic || '',
            status: data.status || '', codAmount: Number(data.codAmount) || 0, createdAt: data.createdAt?.toDate?.().toISOString() || '' })
          return
        }
        batch.update(doc.ref, { isArchived: true, archivedAt: new Date().toISOString(), archivedBy: ARCHIVED_BY_AUTO })
        batchCount++
        return
      }

      // 🗂️ Ancienne à régler : plus dans les listes du jour (fenêtre dépassée), pas rangée, argent ou livraison en attente
      if (isOldUnsettled(data, now, WINDOW_DAYS)) {
        const item = oldUnsettledItem(doc.id, data)
        const key = item.city || '—'
        const w = (watch[key] ||= { count: 0, port: 0, cod: 0, items: [] })
        w.count++; w.port += item.port; w.cod += item.cod; watchTotal++
        if (w.items.length < WATCH_MAX_PER_CITY) w.items.push(item)
      }
    })

    if (batchCount > 0) {
      await batch.commit()
      totalArchived += batchCount
      console.log(`✅ Batch ${iterations}: ${batchCount} archivés (Total: ${totalArchived} / ${totalProcessed} parcourus)`)
    }
  }

  if (timedOut) {
    console.log(`⚠️ Budget de temps épuisé après ${iterations} itérations — le reste sera traité au prochain passage`)
  }

  // Liste triée : les plus anciennes d'abord
  for (const w of Object.values(watch)) w.items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const watchDoc = { at: new Date().toISOString(), windowDays: WINDOW_DAYS, total: watchTotal, complete: !timedOut, cities: watch }

  if (!apply) {
    console.log(`🔎 Essai terminé : ${planned.length} seraient archivés (${totalProcessed} colis de +${SETTLED_ARCHIVE_DAYS} j parcourus) ; anciennes à régler : ${watchTotal}`)
    return { success: true, dryRun: true, planned, totalProcessed, timedOut, windowDays: WINDOW_DAYS, watch: watchDoc }
  }

  // Liste écrite seulement si le parcours est complet (sinon la liste de la veille est gardée)
  if (!timedOut) await db.doc('archiveWatch/oldUnsettled').set(watchDoc)

  console.log(`🎉 Archivage terminé: ${totalArchived} archivés sur ${totalProcessed} colis parcourus ; anciennes à régler : ${watchTotal}`)

  await db.collection('director_logs').add({
    type: 'auto_archiving',
    action: 'Archivage automatique (terminées et réglées)',
    details: { totalArchived, totalProcessed, daysThreshold: SETTLED_ARCHIVE_DAYS, windowDays: WINDOW_DAYS, settledOnly: true, passagers15j: passagers.archived, anciennesARegler: watchTotal },
    userId: 'system',
    userName: 'Système automatique',
    timestamp: FieldValue.serverTimestamp()
  })

  return { success: true, totalArchived: totalArchived + passagers.archived, totalProcessed, passagersArchived: passagers.archived, timedOut, anciennesARegler: watchTotal }
}

module.exports = { runWeeklyArchiving }
