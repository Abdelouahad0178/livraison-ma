'use strict'

const { initializeApp }           = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { getStorage }              = require('firebase-admin/storage')
const { onDocumentWritten }       = require('firebase-functions/v2/firestore')
const { onSchedule }              = require('firebase-functions/v2/scheduler')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
initializeApp({
  storageBucket: 'arelanc.firebasestorage.app'
})
const db = getFirestore()
const { createArchiveBrowser } = require('./archiveBrowser')
exports.browseAdminArchives = onCall(
  { maxInstances: 1, memory: '512MiB', timeoutSeconds: 120 },
  createArchiveBrowser(db, HttpsError)
)
exports.alignParcelDestination = onDocumentWritten(
  { document: 'parcels/{parcelId}', retry: true, maxInstances: 5 },
  require('./destinationAssignment').createDestinationAssignmentHandler(db, FieldValue)
)

// ── Backup automatique ─────────────────────────────────────────────────────
// 🔒 Clé de sauvegarde : secret Firebase (Secret Manager), jamais écrite dans le code.
// Lire : firebase functions:secrets:access BACKUP_API_KEY
const { defineSecret } = require('firebase-functions/params')
const BACKUP_API_KEY = defineSecret('BACKUP_API_KEY')
const { timingSafeEqual } = require('crypto')
const sameKey = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

const BACKUP_COLLECTIONS = [
  'settings', 'parcels', 'users', 'clients', 'payments',
  'caisseEntries', 'agentRemises', 'caissierRemarks', 'caisseClotures',
  'caissierTransactions', 'caissierRequests', 'agentCashRecoveryRequests',
  'agentCodRequests', 'agencyCashes', 'vehicles', 'directorLogs',
  'cities', 'clientMessages', 'clientPortals', 'reglements',
  'reglementsRapports', 'bankDeposits', 'centralCodDeposits', 'centralSupplierPayments',
]
const MAX_BACKUPS     = 10
const BACKUP_FOLDER   = 'auto-backups'

function serializeForBackup(value) {
  if (value && value.constructor && value.constructor.name === 'Timestamp') {
    return { __type: 'timestamp', value: value.toDate().toISOString() }
  }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
  if (Array.isArray(value)) return value.map(serializeForBackup)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeForBackup(v)])
    )
  }
  return value
}

async function runWeeklyBackup() {
  const bucket = getStorage().bucket('arelanc.firebasestorage.app')
  const collections = {}
  const counts = {}

  for (const name of BACKUP_COLLECTIONS) {
    try {
      const snap = await db.collection(name).get()
      collections[name] = snap.docs.map(d => ({ id: d.id, data: serializeForBackup(d.data()) }))
      counts[name] = snap.size
      console.log(`[backup] ${name}: ${snap.size} docs`)
    } catch (err) {
      console.warn(`[backup] ${name} ignoré:`, err.message)
      collections[name] = []
      counts[name] = 0
    }
  }

  const backup = {
    app: 'BG Express',
    schema: 'firestore-backup-v1',
    exportedAt: new Date().toISOString(),
    collections,
    counts,
  }

  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${BACKUP_FOLDER}/backup-bgexpress-${ts}.json`
  const content  = JSON.stringify(backup)

  await bucket.file(filename).save(content, {
    contentType: 'application/json',
    metadata: { exportedAt: backup.exportedAt },
  })
  console.log(`[backup] Sauvegardé : ${filename} (${(content.length / 1024).toFixed(0)} Ko)`)

  // Rotation : garder seulement les MAX_BACKUPS derniers
  const [allFiles] = await bucket.getFiles({ prefix: BACKUP_FOLDER + '/' })
  const sorted = allFiles
    .filter(f => f.name.startsWith(BACKUP_FOLDER + '/backup-bgexpress-'))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (sorted.length > MAX_BACKUPS) {
    const toDelete = sorted.slice(0, sorted.length - MAX_BACKUPS)
    await Promise.all(toDelete.map(f => f.delete()))
    console.log(`[backup] Supprimé ${toDelete.length} ancien(s) backup(s)`)
  }
}

// Sauvegarde automatique chaque dimanche à 03h00 (heure Casablanca)
exports.scheduledWeeklyBackup = onSchedule({
  schedule:       '0 3 * * 0',
  timeZone:       'Africa/Casablanca',
  memory:         '1GiB',
  timeoutSeconds: 540,
}, async () => {
  await runWeeklyBackup()
})

// Endpoint sécurisé pour que le PC serveur télécharge le dernier backup
exports.downloadBackup = onRequest({
  memory:         '1GiB',
  timeoutSeconds: 300,
  maxInstances:   1,
  secrets:        [BACKUP_API_KEY],
}, async (req, res) => {
  // Clé uniquement dans l'en-tête x-backup-key (plus dans l'adresse : elle apparaissait dans les journaux)
  const key = req.headers['x-backup-key'] || ''
  const expected = BACKUP_API_KEY.value()

  if (!expected || !key || !sameKey(key, expected)) {
    console.log('[downloadBackup] Authentification échouée')
    res.status(401).json({ error: 'Clé invalide' })
    return
  }

  const bucket = getStorage().bucket('arelanc.firebasestorage.app')
  const [allFiles] = await bucket.getFiles({ prefix: BACKUP_FOLDER + '/' })
  const sorted = allFiles
    .filter(f => f.name.startsWith(BACKUP_FOLDER + '/backup-bgexpress-'))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (sorted.length === 0) {
    // Créer un backup maintenant
    console.log('[downloadBackup] Aucun backup - création en cours...')
    await runWeeklyBackup()
    // Recharger la liste
    const [newFiles] = await getStorage().bucket('arelanc.firebasestorage.app').getFiles({ prefix: BACKUP_FOLDER + '/' })
    const newSorted = newFiles
      .filter(f => f.name.startsWith(BACKUP_FOLDER + '/backup-bgexpress-'))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (newSorted.length === 0) {
      res.status(500).json({ error: 'Impossible de créer un backup' })
      return
    }
    sorted.push(...newSorted)
  }

  const latest = sorted[sorted.length - 1]
  const [content] = await latest.download()
  const shortName = latest.name.split('/').pop()

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="${shortName}"`)
  res.send(content)
})

// ── Helpers ────────────────────────────────────────────────────────────────
const inc = n => FieldValue.increment(n)

/** Firestore Timestamp → 'YYYY-MM-DD' */
function toDateStr(ts) {
  if (!ts) return null
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toISOString().slice(0, 10)
}

/** French status → safe flat field key used in stats/global */
function statusKey(s) {
  const map = {
    'Collecté':          's_collecte',
    'En transit':        's_en_transit',
    'Arrivé en agence':  's_arrive',
    'En livraison':      's_en_livraison',
    'Livré':             's_livre',
    'Retourné':          's_retourne',
    'Annulé':            's_annule',
    'Retour en transit': 's_en_transit_retour',
  }
  return map[s] || ('s_' + (s || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
}

// ── Scheduled auto-archive ─────────────────────────────────────────────────
// ⛔ DÉSACTIVÉ TEMPORAIREMENT - Archivage manuel uniquement
// Runs every day at 02:00 AM Casablanca time (UTC+1).
// Moves Livré/Retourné parcels older than 90 days to parcels_archive.
/* ARCHIVAGE AUTOMATIQUE DÉSACTIVÉ
exports.scheduledArchive = onSchedule({
  schedule:  '0 2 * * *',
  timeZone:  'Africa/Casablanca',
  memory:    '512MiB',
  timeoutSeconds: 540,
}, async () => {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 3600 * 1000))

  const [livresSnap, retoursSnap] = await Promise.all([
    db.collection('parcels').where('status', '==', 'Livré').where('createdAt', '<', cutoff).get(),
    db.collection('parcels').where('status', '==', 'Retourné').where('createdAt', '<', cutoff).get(),
  ])

  const seen = new Set()
  const docs = []
  for (const d of [...livresSnap.docs, ...retoursSnap.docs]) {
    if (!seen.has(d.id)) { seen.add(d.id); docs.push(d) }
  }

  if (docs.length === 0) {
    console.log('[scheduledArchive] Nothing to archive.')
    return
  }

  const BATCH_SIZE = 450
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    chunk.forEach(d => {
      batch.set(db.collection('parcels_archive').doc(d.id), {
        ...d.data(),
        _archivedAt:   FieldValue.serverTimestamp(),
        _archivedFrom: 'scheduled',
      })
      batch.delete(db.collection('parcels').doc(d.id))
    })
    await batch.commit()
  }
  console.log(`[scheduledArchive] Archived ${docs.length} parcels.`)
})
*/ // FIN ARCHIVAGE AUTOMATIQUE DÉSACTIVÉ

// ── Stats maintenance on every parcel write ────────────────────────────────
// Maintains:
//   stats/global                     → totals + per-status counters
//   stats/global/agencies/{city}     → per-city counters
//   stats/global/daily/{YYYY-MM-DD}  → daily created/livrés/revenue
//   stats/global/agents/{agentId}    → per-agent created/livrés
//   stats/global/drivers/{driverId}  → per-driver deliveries/livrés
exports.onParcelWrite = onDocumentWritten('parcels/{parcelId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null
  const after  = event.data.after.exists  ? event.data.after.data()  : null

  const globalUpdate = { updatedAt: FieldValue.serverTimestamp() }
  const cityMap   = {}
  const dayMap    = {}
  const agentMap  = {}
  const driverMap = {}

  const applyCity = (city, u) => {
    if (!city) return
    cityMap[city] = { ...(cityMap[city] || {}), ...u }
  }
  const applyDay = (ts, u) => {
    const k = toDateStr(ts)
    if (!k) return
    dayMap[k] = { date: k, ...(dayMap[k] || {}), ...u }
  }
  const applyAgent = (id, u) => {
    if (!id) return
    agentMap[id] = { ...(agentMap[id] || {}), ...u }
  }
  const applyDriver = (id, u) => {
    if (!id) return
    driverMap[id] = { ...(driverMap[id] || {}), ...u }
  }

  if (!before && after) {
    // ── CREATE ──────────────────────────────────────────────────────────
    const city = after.destinationCity || after.receiver?.city
    const status = after.status || 'Collecté'

    globalUpdate.total          = inc(1)
    globalUpdate[statusKey(status)] = inc(1)
    if (status === 'Livré')    globalUpdate.livres  = inc(1)
    if (status === 'Retourné') globalUpdate.retours = inc(1)
    if (after.price > 0)       globalUpdate.revenue  = inc(after.price)
    if (after.codAmount > 0)   globalUpdate.codTotal = inc(after.codAmount)

    applyCity(city, {
      city,
      total:   inc(1),
      ...(status === 'Livré'    ? { livres:   inc(1) } : {}),
      ...(status === 'Retourné' ? { retours:  inc(1) } : {}),
      ...(after.price > 0      ? { revenue:  inc(after.price)     } : {}),
      ...(after.codAmount > 0  ? { cod:      inc(after.codAmount) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    applyDay(after.createdAt, {
      created: inc(1),
      ...(status === 'Livré'    ? { livres:   inc(1) } : {}),
      ...(status === 'Retourné' ? { retours:  inc(1) } : {}),
      ...(after.price > 0      ? { revenue:  inc(after.price) }    : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    applyAgent(after.agentId, {
      created: inc(1),
      ...(status === 'Livré' ? { livres: inc(1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (after.deliveryDriverId) {
      applyDriver(after.deliveryDriverId, {
        deliveries: inc(1),
        ...(status === 'Livré' ? { livres: inc(1) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

  } else if (before && !after) {
    // ── DELETE ──────────────────────────────────────────────────────────
    const city   = before.destinationCity || before.receiver?.city
    const status = before.status || 'Collecté'

    globalUpdate.total              = inc(-1)
    globalUpdate[statusKey(status)] = inc(-1)
    if (status === 'Livré')    globalUpdate.livres  = inc(-1)
    if (status === 'Retourné') globalUpdate.retours = inc(-1)
    if (before.price > 0)      globalUpdate.revenue  = inc(-before.price)
    if (before.codAmount > 0)  globalUpdate.codTotal = inc(-before.codAmount)

    applyCity(city, {
      total:   inc(-1),
      ...(status === 'Livré'    ? { livres:   inc(-1) } : {}),
      ...(status === 'Retourné' ? { retours:  inc(-1) } : {}),
      ...(before.price > 0     ? { revenue:  inc(-before.price)     } : {}),
      ...(before.codAmount > 0 ? { cod:      inc(-before.codAmount) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    applyDay(before.createdAt, {
      created: inc(-1),
      ...(status === 'Livré'    ? { livres:   inc(-1) } : {}),
      ...(status === 'Retourné' ? { retours:  inc(-1) } : {}),
      ...(before.price > 0     ? { revenue:  inc(-before.price) }    : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    applyAgent(before.agentId, {
      created: inc(-1),
      ...(status === 'Livré' ? { livres: inc(-1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })

  } else if (before && after) {
    // 🗄️ Seul changement = isArchived absent → false (backfill / filet de sécurité ci-dessous) :
    // aucun compteur concerné → aucune écriture (évite de solliciter stats/global en rafale).
    if (before.isArchived === undefined && after.isArchived === false) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)])
      keys.delete('isArchived')
      const same = [...keys].every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]))
      if (same) return
    }
    // ── UPDATE — only react to meaningful changes ─────────────────────
    const sBefore = before.status || ''
    const sAfter  = after.status  || ''
    const city    = after.destinationCity || after.receiver?.city
                 || before.destinationCity || before.receiver?.city
    const createdAt = after.createdAt || before.createdAt

    if (sBefore !== sAfter) {
      globalUpdate[statusKey(sBefore)] = inc(-1)
      globalUpdate[statusKey(sAfter)]  = inc(1)

      if (sBefore === 'Livré'    && sAfter !== 'Livré')    globalUpdate.livres  = inc(-1)
      if (sAfter  === 'Livré'    && sBefore !== 'Livré')   globalUpdate.livres  = inc(1)
      if (sBefore === 'Retourné' && sAfter !== 'Retourné') globalUpdate.retours = inc(-1)
      if (sAfter  === 'Retourné' && sBefore !== 'Retourné') globalUpdate.retours = inc(1)

      const cityU = { updatedAt: FieldValue.serverTimestamp() }
      if (sBefore === 'Livré'    && sAfter !== 'Livré')    cityU.livres  = inc(-1)
      if (sAfter  === 'Livré'    && sBefore !== 'Livré')   cityU.livres  = inc(1)
      if (sBefore === 'Retourné' && sAfter !== 'Retourné') cityU.retours = inc(-1)
      if (sAfter  === 'Retourné' && sBefore !== 'Retourné') cityU.retours = inc(1)
      if (Object.keys(cityU).length > 1) applyCity(city, cityU)

      const dayU = { updatedAt: FieldValue.serverTimestamp() }
      if (sBefore === 'Livré'    && sAfter !== 'Livré')    dayU.livres  = inc(-1)
      if (sAfter  === 'Livré'    && sBefore !== 'Livré')   dayU.livres  = inc(1)
      if (sBefore === 'Retourné' && sAfter !== 'Retourné') dayU.retours = inc(-1)
      if (sAfter  === 'Retourné' && sBefore !== 'Retourné') dayU.retours = inc(1)
      if (Object.keys(dayU).length > 1) applyDay(createdAt, dayU)

      const agentU = { updatedAt: FieldValue.serverTimestamp() }
      if (sBefore === 'Livré' && sAfter !== 'Livré')  agentU.livres = inc(-1)
      if (sAfter  === 'Livré' && sBefore !== 'Livré') agentU.livres = inc(1)
      if (Object.keys(agentU).length > 1) applyAgent(after.agentId || before.agentId, agentU)

      const drvU = { updatedAt: FieldValue.serverTimestamp() }
      if (sBefore === 'Livré' && sAfter !== 'Livré')  drvU.livres = inc(-1)
      if (sAfter  === 'Livré' && sBefore !== 'Livré') drvU.livres = inc(1)
      if (Object.keys(drvU).length > 1) applyDriver(after.deliveryDriverId || before.deliveryDriverId, drvU)
    }

    // New delivery driver assigned for the first time
    if (!before.deliveryDriverId && after.deliveryDriverId) {
      applyDriver(after.deliveryDriverId, {
        deliveries: inc(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }

  // ── Commit all updates in a single batch ──────────────────────────────
  // ⚡ (21/10/2026) stats/global n'est écrit QUE si un compteur change (avant : à CHAQUE écriture d'expédition, rien
  // que pour updatedAt → document unique saturé lors des lots, ~37 écritures / seconde, et page Admin réveillée).
  // Aucune écriture du tout si aucun compteur ne change. Les valeurs des compteurs restent identiques.
  const hasGlobal = Object.keys(globalUpdate).some(k => k !== 'updatedAt')
  if (!hasGlobal && !Object.keys(cityMap).length && !Object.keys(dayMap).length && !Object.keys(agentMap).length && !Object.keys(driverMap).length) return
  const batch = db.batch()
  if (hasGlobal) batch.set(db.doc('stats/global'), globalUpdate, { merge: true })
  for (const [city, u] of Object.entries(cityMap)) {
    batch.set(db.doc(`stats/global/agencies/${city}`), u, { merge: true })
  }
  for (const [day, u] of Object.entries(dayMap)) {
    batch.set(db.doc(`stats/global/daily/${day}`), u, { merge: true })
  }
  for (const [agentId, u] of Object.entries(agentMap)) {
    batch.set(db.doc(`stats/global/agents/${agentId}`), u, { merge: true })
  }
  for (const [driverId, u] of Object.entries(driverMap)) {
    batch.set(db.doc(`stats/global/drivers/${driverId}`), u, { merge: true })
  }
  await batch.commit()
  // 🗄️ Filet de sécurité : tout colis créé sans isArchived (ancienne version de l'appli encore en
  // cache, script…) reçoit isArchived:false, sinon il n'apparaîtrait pas dans la liste « En gare »
  // (requête serveur isArchived == false). L'événement de mise à jour qui en résulte est ignoré ci-dessus.
  if (!before && after && after.isArchived === undefined) {
    await event.data.after.ref.update({ isArchived: false })
      .catch(err => console.warn('isArchived:false non posé', event.params.parcelId, err.message))
  }
})

// ── Version allégée des expéditions : parcels/{id} → parcelsLite/{id} ───────
// Miroir sans les champs lourds (historique, audit…) lu par les listes de l'onglet Expéditions.
// - Suppression du colis → suppression du miroir.
// - Écriture ignorée si la projection allégée n'a pas changé (ex. ajout d'une ligne d'historique).
// - Sinon on RELIT le colis (et non l'instantané de l'événement) : les événements peuvent arriver
//   dans le désordre ; relire garantit que la dernière exécution écrit l'état le plus récent.
// Idempotent (set complet, pas de merge) : rejouer un événement réécrit la même projection.
const { projectParcelLite, liteKey } = require('./parcelLite')
// retry: true — la fonction relit toujours le colis à jour (idempotente) : un échec ponctuel ne doit plus
// laisser une copie allégée en retard (les pages de caisse lisent parcelsLite pour les journées passées).
exports.syncParcelLite = onDocumentWritten({ document: 'parcels/{parcelId}', retry: true }, async (event) => {
  const id = event.params.parcelId
  const liteRef = db.collection('parcelsLite').doc(id)
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after  = event.data?.after?.exists  ? event.data.after.data()  : null
  if (before && after && liteKey(projectParcelLite(before)) === liteKey(projectParcelLite(after))) return
  const fresh = await db.collection('parcels').doc(id).get()
  if (!fresh.exists) {
    await liteRef.delete()
    return
  }
  await liteRef.set({ ...projectParcelLite(fresh.data()), liteUpdatedAt: FieldValue.serverTimestamp() })
})

// ── 🧾 Copie « facturier » (parcelsFacturier) — voir functions/parcelFacturier.js ──
// Même modèle que syncParcelLite : rien à faire si les champs du Facturier n'ont pas changé ; sinon relecture
// du colis à jour (idempotent → retry sûr) et remplacement complet de la copie.
const { projectParcelFacturier } = require('./parcelFacturier')
exports.syncParcelFacturier = onDocumentWritten({ document: 'parcels/{parcelId}', retry: true }, async (event) => {
  const id = event.params.parcelId
  const ref = db.collection('parcelsFacturier').doc(id)
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after  = event.data?.after?.exists  ? event.data.after.data()  : null
  if (before && after && liteKey(projectParcelFacturier(before)) === liteKey(projectParcelFacturier(after))) return
  const fresh = await db.collection('parcels').doc(id).get()
  if (!fresh.exists) {
    await ref.delete()
    return
  }
  await ref.set({ ...projectParcelFacturier(fresh.data()), facturierUpdatedAt: FieldValue.serverTimestamp() })
})

// ── Totaux de la gestion commerciale (bgexpress.web.app) — voir functions/commercial.js ──
// Relit le colis à jour puis applique la différence en transaction (idempotent → retry sûr).
// Suppression causée par l'ARCHIVAGE (copie présente dans parcels_archive) : totaux inchangés.
const { syncCommercial, contributionOf } = require('./commercial')
exports.syncCommercialStats = onDocumentWritten({ document: 'parcels/{parcelId}', retry: true }, async (event) => {
  const id = event.params.parcelId
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after  = event.data?.after?.exists  ? event.data.after.data()  : null
  if (before && after && JSON.stringify(contributionOf(before)) === JSON.stringify(contributionOf(after))) return
  const fresh = await db.collection('parcels').doc(id).get()
  if (!fresh.exists) {
    const archived = await db.collection('parcels_archive').doc(id).get()
    if (archived.exists) return
    await syncCommercial(db, FieldValue, id, null)
    return
  }
  await syncCommercial(db, FieldValue, id, fresh.data())
})

// ── 🤖 Rapport du Contrôleur (Admin › 🤖 Rapports, à la demande, admin seulement) — voir functions/controlReport.js ──
exports.generateControlReport = require('./controlReport').generateControlReport

// ── Rebuild all stats from existing parcels (callable — admin only) ────────
// Call once after first deploy to bootstrap stats from historical data.
exports.rebuildStats = onCall({
  memory: '1GiB',
  timeoutSeconds: 540,
}, async (request) => {
  if (!request.auth) {
    throw new Error('Unauthenticated')
  }

  // Verify admin role
  const userSnap = await db.doc(`users/${request.auth.uid}`).get()
  if (!userSnap.exists || userSnap.data().role !== 'admin') {
    throw new Error('Forbidden')
  }

  const globalData  = { total: 0, livres: 0, retours: 0, revenue: 0, codTotal: 0 }
  const cityData    = {}
  const dayData     = {}
  const agentData   = {}

  let cursor = null
  const PAGE = 500
  let processed = 0

  // Paginate through all parcels
  while (true) {
    let q = db.collection('parcels').orderBy('createdAt', 'desc').limit(PAGE)
    if (cursor) q = q.startAfter(cursor)
    const snap = await q.get()
    if (snap.empty) break

    for (const d of snap.docs) {
      const p = d.data()
      const status = p.status || 'Collecté'
      const city   = p.destinationCity || p.receiver?.city
      const sk     = statusKey(status)

      // Global
      globalData.total++
      globalData[sk] = (globalData[sk] || 0) + 1
      if (status === 'Livré')    globalData.livres++
      if (status === 'Retourné') globalData.retours++
      if (p.price > 0)      globalData.revenue   = (globalData.revenue   || 0) + p.price
      if (p.codAmount > 0)  globalData.codTotal  = (globalData.codTotal  || 0) + p.codAmount

      // City
      if (city) {
        if (!cityData[city]) {
          cityData[city] = { city, total: 0, livres: 0, retours: 0, enCours: 0, revenue: 0, cod: 0 }
        }
        cityData[city].total++
        if (status === 'Livré')    cityData[city].livres++
        if (status === 'Retourné') cityData[city].retours++
        if (!['Livré','Retourné'].includes(status)) cityData[city].enCours++
        if (p.price > 0)      cityData[city].revenue += p.price
        if (p.codAmount > 0)  cityData[city].cod     += p.codAmount
      }

      // Daily
      const dk = toDateStr(p.createdAt)
      if (dk) {
        if (!dayData[dk]) dayData[dk] = { date: dk, created: 0, livres: 0, retours: 0, revenue: 0 }
        dayData[dk].created++
        if (status === 'Livré')    dayData[dk].livres++
        if (status === 'Retourné') dayData[dk].retours++
        if (p.price > 0) dayData[dk].revenue += p.price
      }

      // Agent
      if (p.agentId) {
        if (!agentData[p.agentId]) agentData[p.agentId] = { created: 0, livres: 0 }
        agentData[p.agentId].created++
        if (status === 'Livré') agentData[p.agentId].livres++
      }
    }

    processed += snap.docs.length
    cursor = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < PAGE) break
  }

  // Write rebuilt stats in chunks
  const ts = FieldValue.serverTimestamp()
  const allWrites = [
    [db.doc('stats/global'), { ...globalData, updatedAt: ts }],
    ...Object.entries(cityData).map(([city, u]) => [db.doc(`stats/global/agencies/${city}`), { ...u, updatedAt: ts }]),
    ...Object.entries(dayData).map(([day,  u]) => [db.doc(`stats/global/daily/${day}`),      { ...u, updatedAt: ts }]),
    ...Object.entries(agentData).map(([id, u]) => [db.doc(`stats/global/agents/${id}`),      { ...u, updatedAt: ts }]),
  ]

  const CHUNK = 400
  for (let i = 0; i < allWrites.length; i += CHUNK) {
    const batch = db.batch()
    allWrites.slice(i, i + CHUNK).forEach(([ref, data]) => batch.set(ref, data))
    await batch.commit()
  }

  console.log(`[rebuildStats] Done. Processed ${processed} parcels, wrote ${allWrites.length} stat docs.`)
  return { success: true, processed, statDocs: allWrites.length }
})

// 🤖 IA de saisie (extractParcelData) : supprimée le 18/10/2026 à la demande de l'admin (le Contrôleur IA,
// functions/controlReport.js, garde sa propre configuration).

// ── Vider la base de données (sauf users) ─────────────────────────────────
exports.clearDatabase = onCall({ maxInstances: 1 }, async (request) => {
  // Vérifier que l'utilisateur est admin
  if (!request.auth || !request.auth.uid) {
    throw new Error('Non authentifié')
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée - Admin uniquement')
  }

  const collectionsToDelete = [
    'parcels', 'parcels_archive', 'clients', 'deliverySignatures', 'lostParcels', 'portalAccounts',
    'vehicles', 'sectors', 'tariffs', 'agencies', 'cod_requests', 'cod_reglements',
    'caisse_transactions', 'caisse_admin_transactions', 'port_du_transactions',
    'central_collector_transactions', 'notes', 'agent_notes', 'expeditions',
    'backup_parcels', 'backup_clients', 'backup_users', 'activity_logs',
    'director_logs', 'operation_locks', 'modification_requests', 'client_messages',
    'caisse_clotures', 'caissier_remarks', 'central_cash', 'bank_deposits'
  ]

  const results = {}
  let totalDeleted = 0

  for (const collectionName of collectionsToDelete) {
    try {
      const collectionRef = db.collection(collectionName)
      let deletedCount = 0
      const batchSize = 500

      let hasMore = true
      while (hasMore) {
        const snapshot = await collectionRef.limit(batchSize).get()

        if (snapshot.size === 0) {
          hasMore = false
          break
        }

        const batch = db.batch()
        snapshot.docs.forEach(doc => batch.delete(doc.ref))
        await batch.commit()

        deletedCount += snapshot.size
        hasMore = snapshot.size === batchSize
      }

      results[collectionName] = deletedCount
      totalDeleted += deletedCount
      console.log(`✅ ${collectionName}: ${deletedCount} documents supprimés`)
    } catch (error) {
      results[collectionName] = { error: error.message }
      console.error(`❌ Erreur ${collectionName}:`, error.message)
    }
  }

  console.log(`✅ Total: ${totalDeleted} documents supprimés`)
  return { success: true, totalDeleted, results }
})

// ── Supprimer tous les arrivages ─────────────────────────────────────────
exports.deleteAllArrivages = onCall({ maxInstances: 1 }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new Error('Non authentifié')
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée - Admin uniquement')
  }

  try {
    const collectionRef = db.collection('arrivages')
    let deletedCount = 0
    const batchSize = 500

    let hasMore = true
    while (hasMore) {
      const snapshot = await collectionRef.limit(batchSize).get()

      if (snapshot.size === 0) {
        hasMore = false
        break
      }

      const batch = db.batch()
      snapshot.docs.forEach(doc => batch.delete(doc.ref))
      await batch.commit()

      deletedCount += snapshot.size
      hasMore = snapshot.size === batchSize
    }

    console.log(`✅ arrivages: ${deletedCount} documents supprimés`)
    return { success: true, deletedCount }
  } catch (error) {
    console.error('❌ Erreur:', error)
    throw new Error(`Erreur lors de la suppression: ${error.message}`)
  }
})

// ── Générer des données de test ───────────────────────────────────────────
exports.generateTestData = onCall({ maxInstances: 1, timeoutSeconds: 540 }, async (request) => {
  const count = request.data?.count || 1000
  const batchSize = 500

  if (!request.auth || !request.auth.uid) {
    throw new Error('Non authentifié')
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée - Admin uniquement')
  }

  const cities = ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan']
  const statuses = ['Initialisé', 'En transit', 'Arrivé en agence', 'En cours de livraison', 'Livré', 'Retourné', 'Retour en transit', 'Retour arrivé']
  const serviceTypes = ['simple', 'especes', 'cheque', 'traite', 'retour_bl']
  const portTypes = ['port_paye', 'port_du']

  const firstNames = ['Ahmed', 'Mohammed', 'Fatima', 'Khadija', 'Hassan', 'Youssef', 'Aicha', 'Omar', 'Salma', 'Karim', 'Laila', 'Rachid', 'Nadia', 'Samir', 'Zineb']
  const lastNames = ['Alami', 'Benali', 'El Amrani', 'Benjelloun', 'Cherkaoui', 'El Fassi', 'Idrissi', 'Tahiri', 'Ziani', 'Khalil']

  const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const getRandomPhone = () => `06${Math.floor(10000000 + Math.random() * 90000000)}`
  const getRandomAddress = (city) => `${Math.floor(1 + Math.random() * 999)} Rue ${getRandomItem(['Mohamed V', 'Hassan II', 'de la Liberté', 'Principale', 'du Commerce'])}, ${city}`
  const getRandomDate = (daysAgo) => {
    const date = new Date()
    date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo))
    date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0)
    return Timestamp.fromDate(date)
  }

  let created = 0
  const startTime = Date.now()

  try {
    for (let i = 0; i < count; i += batchSize) {
      const batch = db.batch()
      const currentBatchSize = Math.min(batchSize, count - i)

      for (let j = 0; j < currentBatchSize; j++) {
        const trackingId = `BG${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`
        const originCity = getRandomItem(cities)
        let destinationCity = getRandomItem(cities)
        while (destinationCity === originCity) destinationCity = getRandomItem(cities)

        const serviceType = getRandomItem(serviceTypes)
        const portType = getRandomItem(portTypes)
        const status = getRandomItem(statuses)
        const weight = Math.floor(1 + Math.random() * 50)
        const nbColis = Math.floor(1 + Math.random() * 5)
        const codAmount = serviceType === 'especes' ? Math.floor(100 + Math.random() * 5000) : 0
        const portPrice = Math.floor(30 + Math.random() * 200)
        const price = Math.floor(50 + Math.random() * 500)

        const createdAt = getRandomDate(90)

        const parcelData = {
          trackingId,
          status,
          originCity,
          destinationCity,
          sender: {
            name: `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`,
            tel: getRandomPhone(),
            city: originCity,
            address: getRandomAddress(originCity)
          },
          receiver: {
            name: `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`,
            tel: getRandomPhone(),
            city: destinationCity,
            address: getRandomAddress(destinationCity)
          },
          weight,
          nbColis,
          serviceType,
          portType,
          portPrice,
          portStatus: portType === 'port_paye' ? 'collected' : 'pending',
          price,
          codAmount,
          codStatus: codAmount > 0 ? (status === 'Livré' ? 'collected' : 'pending') : null,
          natureOfGoods: getRandomItem(['Documents', 'Vêtements', 'Électronique', 'Colis divers', 'Pièces auto']),
          createdAt,
          agentId: request.auth.uid,
          agentName: userDoc.data().name || 'Admin',
          agentRole: 'admin',
          customerMode: 'particulier',
          history: [{
            status: 'Initialisé',
            timestamp: createdAt.toDate().toISOString(),
            note: 'Colis créé - Données de test'
          }]
        }

        // Ajouter des détails selon le statut
        if (['En transit', 'Arrivé en agence', 'En cours de livraison', 'Livré', 'Retourné'].includes(status)) {
          parcelData.chauffeurName = `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`
          parcelData.chauffeurPhone = getRandomPhone()
          parcelData.shipmentLoadedAt = getRandomDate(80).toDate().toISOString()
        }

        if (['Arrivé en agence', 'En cours de livraison', 'Livré', 'Retourné'].includes(status)) {
          parcelData.visibleInDestinationAgency = true
          parcelData.destinationArrivedAt = getRandomDate(70).toDate().toISOString()
        }

        if (['En cours de livraison', 'Livré'].includes(status)) {
          parcelData.deliveryDriverId = 'test-driver-' + Math.floor(Math.random() * 5)
          parcelData.deliveryDriverName = `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`
        }

        if (status === 'Livré') {
          parcelData.deliveredAt = getRandomDate(60).toDate().toISOString()
          if (codAmount > 0) {
            parcelData.codStatus = 'collected'
            parcelData.codPaymentType = getRandomItem(['especes', 'cheque'])
          }
        }

        if (status === 'Retourné' || status.includes('Retour')) {
          parcelData.returnReason = getRandomItem(['Refus client', 'Adresse introuvable', 'Client absent', 'Numéro erroné'])
          parcelData.returnedAt = getRandomDate(50).toDate().toISOString()
        }

        const docRef = db.collection('parcels').doc()
        batch.set(docRef, parcelData)
      }

      await batch.commit()
      created += currentBatchSize
      console.log(`✅ ${created}/${count} colis créés...`)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`✅ Génération terminée: ${created} colis en ${duration}s`)

    return {
      success: true,
      created,
      duration: `${duration}s`
    }
  } catch (error) {
    console.error('❌ Erreur génération:', error)
    throw new Error(`Erreur après ${created} colis: ${error.message}`)
  }
})

// ── Archivage automatique des vieux colis ────────────────────────────────
// ⛔ DÉSACTIVÉ TEMPORAIREMENT - Archivage manuel uniquement
// S'exécute chaque jour à 2h du matin
/* ARCHIVAGE AUTOMATIQUE DÉSACTIVÉ
exports.autoArchiveOldParcels = onSchedule({
  schedule: '0 2 * * *', // Tous les jours à 2h00 (heure UTC)
  timeZone: 'Africa/Casablanca',
  timeoutSeconds: 540,
  memory: '512MiB'
}, async (event) => {
  const DAYS_BEFORE_ARCHIVE = 7 // Archive les colis de plus de 7 jours
  const BATCH_SIZE = 500

  console.log('🗄️  Début archivage automatique...')

  try {
    // Calculer la date limite (7 jours avant aujourd'hui)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_ARCHIVE)
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate)

    console.log(`📅 Archive les colis créés avant: ${cutoffDate.toISOString()}`)

    // Statuts finaux qui peuvent être archivés
    const archivableStatuses = ['Livré', 'Retourné', 'Retour finalisé']

    let totalArchived = 0
    let hasMore = true

    while (hasMore) {
      // Récupérer un batch de vieux colis avec statut final
      const snapshot = await db.collection('parcels')
        .where('createdAt', '<', cutoffTimestamp)
        .where('status', 'in', archivableStatuses)
        .limit(BATCH_SIZE)
        .get()

      if (snapshot.empty) {
        hasMore = false
        break
      }

      const batch = db.batch()
      const archiveBatch = db.batch()

      snapshot.docs.forEach(doc => {
        const data = doc.data()

        // Copier vers parcels_archive
        const archiveRef = db.collection('parcels_archive').doc(doc.id)
        archiveBatch.set(archiveRef, {
          ...data,
          archivedAt: FieldValue.serverTimestamp(),
          archivedReason: 'auto_archive_90days'
        })

        // Supprimer de parcels
        batch.delete(doc.ref)
      })

      // Exécuter les deux batches
      await archiveBatch.commit()
      await batch.commit()

      totalArchived += snapshot.size
      console.log(`✅ ${totalArchived} colis archivés...`)

      // Pause pour éviter throttling
      if (snapshot.size === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`✅ Archivage terminé: ${totalArchived} colis archivés`)

    // Log l'événement dans director_logs
    await db.collection('director_logs').add({
      type: 'auto_archive',
      action: 'Archive automatique quotidienne',
      details: {
        totalArchived,
        cutoffDate: cutoffDate.toISOString(),
        daysBeforeArchive: DAYS_BEFORE_ARCHIVE
      },
      timestamp: FieldValue.serverTimestamp(),
      automated: true
    })

    return { success: true, totalArchived }
  } catch (error) {
    console.error('❌ Erreur archivage automatique:', error)

    // Log l'erreur
    await db.collection('director_logs').add({
      type: 'auto_archive_error',
      action: 'Erreur archivage automatique',
      error: error.message,
      timestamp: FieldValue.serverTimestamp(),
      automated: true
    })

    throw error
  }
})
*/ // FIN ARCHIVAGE AUTOMATIQUE DÉSACTIVÉ

// ── Fonction callable pour archivage manuel ──────────────────────────────
exports.manualArchive = onCall({ maxInstances: 1, timeoutSeconds: 540 }, async (request) => {
  const { olderThanDays = 90, statuses = ['Livré', 'Retourné', 'Retour finalisé'], city = null } = request.data || {}

  if (!request.auth || !request.auth.uid) {
    throw new Error('Non authentifié')
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée - Admin uniquement')
  }

  console.log(`🗄️  Archivage manuel: colis > ${olderThanDays} jours, ville: ${city || 'Toutes'}`)

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate)

  let totalArchived = 0
  const BATCH_SIZE = 500
  let hasMore = true

  while (hasMore) {
    const snapshot = await db.collection('parcels')
      .where('createdAt', '<', cutoffTimestamp)
      .where('status', 'in', statuses)
      .limit(BATCH_SIZE)
      .get()

    if (snapshot.empty) {
      hasMore = false
      break
    }

    const batch = db.batch()
    const archiveBatch = db.batch()

    // Filtrer par ville si spécifiée
    const docsToArchive = city
      ? snapshot.docs.filter(doc => {
          const data = doc.data()
          return data.originCity === city || data.destinationCity === city
        })
      : snapshot.docs

    if (docsToArchive.length === 0 && snapshot.size === BATCH_SIZE) {
      // Si aucun doc ne correspond au filtre ville mais qu'on a un batch plein, continuer
      continue
    }

    docsToArchive.forEach(doc => {
      const archiveRef = db.collection('parcels_archive').doc(doc.id)
      archiveBatch.set(archiveRef, {
        ...doc.data(),
        archivedAt: FieldValue.serverTimestamp(),
        archivedReason: 'manual_archive',
        archivedBy: request.auth.uid,
        archivedByName: userDoc.data().name || 'Admin'
      })
      batch.delete(doc.ref)
    })

    if (docsToArchive.length > 0) {
      await archiveBatch.commit()
      await batch.commit()
      totalArchived += docsToArchive.length
      console.log(`✅ ${totalArchived} colis archivés...`)
    }

    // Si on n'a pas un batch plein, on a fini
    if (snapshot.size < BATCH_SIZE) {
      hasMore = false
    }
  }

  // Log l'action
  await db.collection('director_logs').add({
    type: 'manual_archive',
    action: `Archivage manuel par ${userDoc.data().name}`,
    details: { totalArchived, olderThanDays, statuses },
    userId: request.auth.uid,
    userName: userDoc.data().name,
    timestamp: FieldValue.serverTimestamp()
  })

  return { success: true, totalArchived, cutoffDate: cutoffDate.toISOString() }
})

// ── Supprimer les archives ────────────────────────────────────────────────
exports.deleteArchive = onCall({ maxInstances: 1, timeoutSeconds: 540 }, async (request) => {
  const { olderThanDays = null, deleteAll = false } = request.data || {}

  if (!request.auth || !request.auth.uid) {
    throw new Error('Non authentifié')
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée - Admin uniquement')
  }

  console.log(`🗑️  Suppression archives: ${deleteAll ? 'TOUT' : `> ${olderThanDays} jours`}`)

  let totalDeleted = 0
  const BATCH_SIZE = 500
  let hasMore = true

  try {
    while (hasMore) {
      let query = db.collection('parcels_archive').limit(BATCH_SIZE)

      // Filtrer par date si spécifié
      if (!deleteAll && olderThanDays) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
        const cutoffTimestamp = Timestamp.fromDate(cutoffDate)
        query = query.where('archivedAt', '<', cutoffTimestamp)
      }

      const snapshot = await query.get()

      if (snapshot.empty) {
        hasMore = false
        break
      }

      const batch = db.batch()
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref)
      })

      await batch.commit()
      totalDeleted += snapshot.size
      console.log(`🗑️  ${totalDeleted} archives supprimées...`)

      // Si on n'a pas un batch plein, on a fini
      if (snapshot.size < BATCH_SIZE) {
        hasMore = false
      }

      // Pause pour éviter throttling
      if (snapshot.size === BATCH_SIZE && hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Log l'action
    await db.collection('director_logs').add({
      type: 'delete_archive',
      action: `Suppression archives par ${userDoc.data().name}`,
      details: { totalDeleted, deleteAll, olderThanDays },
      userId: request.auth.uid,
      userName: userDoc.data().name,
      timestamp: FieldValue.serverTimestamp()
    })

    console.log(`✅ Suppression terminée: ${totalDeleted} archives supprimées`)
    return { success: true, totalDeleted }
  } catch (error) {
    console.error('❌ Erreur suppression:', error)
    throw new Error(`Erreur lors de la suppression: ${error.message}`)
  }
})

// ── Archivage automatique hebdomadaire ────────────────────────────────────────

/**
 * Marque les vieux colis comme archivés (soft delete)
 * Politique AGGRESSIVE: 30 jours pour Livré, Retourné, Annulé
 */
async function runWeeklyArchiving() {
  console.log('🗄️  Démarrage archivage automatique...')

  const DAYS_THRESHOLD = 30       // Livrés SANS COD : archivés après 30 jours
  const DAYS_FORCE = 45           // Tous les autres (même avec COD) : archivés après 45 jours
  const BATCH_SIZE = 500  // = limite d'un WriteBatch Firestore
  // Borne de temps (au lieu d'un nombre fixe d'itérations) : la fonction dispose de 540s.
  // L'ancien plafond de 200×100 colis était épuisé par des colis déjà archivés / non archivables
  // (COD non réglé) avant d'atteindre les colis à archiver.
  const TIME_BUDGET_MS = 480000
  const startedAt = Date.now()
  let timedOut = false

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_THRESHOLD)
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate)
  const forceCutoffMs = Date.now() - DAYS_FORCE * 86400000

  let totalArchived = 0
  let totalProcessed = 0
  let lastDoc = null
  let iterations = 0

  console.log(`📦 Archivage de TOUS les colis de +${DAYS_THRESHOLD} jours (livrés sans COD) et de +${DAYS_FORCE} jours (tous statuts, COD inclus)...`)

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break }
    iterations++

    // 🔄 Pagination correcte avec startAfter
    let query = db.collection('parcels')
      .where('createdAt', '<', cutoffTimestamp)
      .orderBy('createdAt')
      .limit(BATCH_SIZE)

    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const snapshot = await query.get()

    // ✅ Vraiment fini quand plus aucun doc
    if (snapshot.empty) {
      console.log('✅ Tous les colis de +30j ont été parcourus')
      break
    }

    totalProcessed += snapshot.size
    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    // Filtrer déjà archivés et COD non payé
    const batch = db.batch()
    let batchCount = 0

    snapshot.docs.forEach(doc => {
      const data = doc.data()

      // Skip si déjà archivé
      if (data.isArchived) {
        return
      }

      // Règles : +45 jours = archivé quoi qu'il arrive (COD inclus) ;
      // entre 30 et 45 jours = seulement les expéditions LIVRÉES et SIMPLES (sans COD)
      const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0
      const older45 = createdMs > 0 && createdMs < forceCutoffMs
      const livreSansCod = data.status === 'Livré' && !(Number(data.codAmount) > 0)
      if (!older45 && !livreSansCod) return

      // Marquer comme archivé
      batch.update(doc.ref, {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: 'auto-system'
      })
      batchCount++
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

  console.log(`🎉 Archivage terminé: ${totalArchived} archivés sur ${totalProcessed} colis parcourus`)

  // Log dans director_logs
  await db.collection('director_logs').add({
    type: 'auto_archiving',
    action: 'Archivage automatique hebdomadaire',
    details: { totalArchived, totalProcessed, daysThreshold: DAYS_THRESHOLD, allStatuses: true },
    userId: 'system',
    userName: 'Système automatique',
    timestamp: FieldValue.serverTimestamp()
  })

  return { success: true, totalArchived, totalProcessed }
}

// Archivage automatique tous les 3 jours à 02h00 (heure Casablanca)
exports.scheduledWeeklyArchiving = onSchedule({
  schedule:       '0 2 */3 * *',  // Tous les 3 jours à 2h00
  timeZone:       'Africa/Casablanca',
  memory:         '512MiB',
  timeoutSeconds: 540,
}, async () => {
  await runWeeklyArchiving()
})

// Bouton manuel d'archivage dans AdminArchivageTab
exports.manualArchiving = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  // Vérifier authentification
  if (!request.auth) {
    throw new Error('Non authentifié')
  }

  // Vérifier que c'est un admin
  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new Error('Permission refusée: admin requis')
  }

  console.log(`🗄️  Archivage manuel déclenché par ${userDoc.data().name}`)

  try {
    const result = await runWeeklyArchiving()
    return result
  } catch (error) {
    console.error('❌ Erreur archivage manuel:', error)
    throw new Error(`Erreur lors de l'archivage: ${error.message}`)
  }
})

// ── Mise à jour automatique journée opérationnelle ──────────────────────────
/**
 * ⏰ Fonction qui s'exécute automatiquement chaque jour à 6h01 (heure Casablanca)
 * pour mettre à jour la journée opérationnelle dans Firestore.
 *
 * Fonctionne même si personne n'ouvre l'application.
 */

function getCurrentOperationalDayString() {
  // ⏰ Obtenir l'heure actuelle au Maroc (Africa/Casablanca)
  const nowUtc = new Date()
  const casablancaTime = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))

  const hour = casablancaTime.getHours()
  const minute = casablancaTime.getMinutes()

  // Configuration : la journée change à 6h01
  const START_HOUR = 6
  const START_MINUTE = 1
  const END_HOUR = 6
  const END_MINUTE = 1

  // Convertir en minutes depuis minuit
  const currentMinutes = hour * 60 + minute
  const endMinutes = END_HOUR * 60 + END_MINUTE

  // Si avant 6h01, on est encore dans la journée d'hier
  const operationalDate = new Date(casablancaTime)
  if (currentMinutes < endMinutes) {
    operationalDate.setDate(operationalDate.getDate() - 1)
  }

  // Retourner au format YYYY-MM-DD
  const year = operationalDate.getFullYear()
  const month = String(operationalDate.getMonth() + 1).padStart(2, '0')
  const day = String(operationalDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

exports.updateOperationalDay = onSchedule({
  schedule: '1 6 * * *',           // Chaque jour à 6h01
  timeZone: 'Africa/Casablanca',   // Fuseau horaire Maroc
  retryCount: 3,                   // Réessayer 3 fois en cas d'échec
  memory: '256MiB',
  timeoutSeconds: 60,
}, async (event) => {
  try {
    const dayString = getCurrentOperationalDayString()

    console.log(`⏰ [${new Date().toISOString()}] Mise à jour automatique journée opérationnelle: ${dayString}`)

    // Mettre à jour dans Firestore
    await db.collection('settings').doc('operationalDay').set({
      currentDay: dayString,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'auto-scheduler',
      lastScheduledUpdate: new Date().toISOString(),
    }, { merge: true })

    console.log(`✅ Journée opérationnelle mise à jour avec succès: ${dayString}`)

    return { success: true, operationalDay: dayString }
  } catch (error) {
    console.error('❌ Erreur mise à jour journée opérationnelle:', error)
    throw error
  }
})

// Fonction manuelle pour forcer la mise à jour immédiate (callable depuis l'app)
exports.forceUpdateOperationalDay = onCall(async (request) => {
  // 🔒 Admin connecté seulement (avant : appelable sans compte)
  {
    const { HttpsError } = require('firebase-functions/v2/https')
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const u = await db.collection('users').doc(request.auth.uid).get()
    if (!u.exists || u.data().role !== 'admin') throw new HttpsError('permission-denied', "Réservé à l'admin.")
  }
  try {
    const dayString = getCurrentOperationalDayString()

    console.log(`🔧 [${new Date().toISOString()}] Mise à jour MANUELLE journée opérationnelle: ${dayString}`)

    // Mettre à jour dans Firestore
    await db.collection('settings').doc('operationalDay').set({
      currentDay: dayString,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth ? `user-${request.auth.uid}` : 'anonymous',
      lastManualUpdate: new Date().toISOString(),
    }, { merge: true })

    console.log(`✅ Journée opérationnelle mise à jour manuellement: ${dayString}`)

    return {
      success: true,
      operationalDay: dayString,
      timestamp: new Date().toISOString(),
      message: `Journée mise à jour: ${dayString}`
    }
  } catch (error) {
    console.error('❌ Erreur mise à jour manuelle journée opérationnelle:', error)
    throw new Error(`Erreur: ${error.message}`)
  }
})

// ── 🔑 Changement du mot de passe d'un utilisateur par l'ADMIN ──────────────
// Les mots de passe ne sont jamais lisibles (Firebase Auth les chiffre) : l'Admin en définit un
// nouveau, affiché une seule fois dans l'interface pour être transmis. Rien n'est stocké en clair.
exports.adminSetUserPassword = onCall({ maxInstances: 5 }, async (request) => {
  const { HttpsError } = require('firebase-functions/v2/https')
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Non authentifié')
  const caller = await db.collection('users').doc(request.auth.uid).get()
  if (!caller.exists || caller.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Réservé à l\'Admin')
  }
  const uid = String(request.data?.uid || '')
  const password = String(request.data?.password || '')
  if (!uid) throw new HttpsError('invalid-argument', 'Utilisateur manquant')
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Le mot de passe doit contenir au moins 6 caractères')
  const { getAuth } = require('firebase-admin/auth')
  try {
    await getAuth().updateUser(uid, { password })
  } catch (err) {
    if (err?.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Ce compte n\'a pas d\'accès de connexion (employé sans compte)')
    throw new HttpsError('internal', err?.message || 'Erreur de mise à jour')
  }
  const target = await db.collection('users').doc(uid).get()
  await db.collection('director_logs').add({
    type: 'admin_password_reset',
    action: 'Mot de passe redéfini par l\'Admin',
    details: { targetUid: uid, targetName: target.data()?.name || '', targetEmail: target.data()?.email || '' },
    userId: request.auth.uid,
    userName: caller.data().name || 'Admin',
    timestamp: FieldValue.serverTimestamp(),
  })
  return { ok: true }
})

// ── Pages PUBLIQUES (sans compte) : suivi d'un colis et signature de livraison ──────────
// 🔒 Les règles Firestore ne laissent plus lire les expéditions sans compte (avant : `allow get: if true` + liste
// « limit <= 1 » → n'importe qui pouvait aspirer toute la collection : noms, téléphones, CIN, adresses, COD).
// Ces deux fonctions renvoient UNIQUEMENT ce que les pages publiques affichent.
const isoOf = v => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : (v || null)

/** Suivi public : statut, villes, noms, montants affichés et historique (statut + date, sans les notes internes). */
exports.publicTrackParcel = onCall({ cors: true }, async (request) => {
  const { HttpsError } = require('firebase-functions/v2/https')
  const trackingId = String(request.data?.trackingId || '').trim()
  if (!trackingId || trackingId.length > 40) throw new HttpsError('invalid-argument', 'Numéro de suivi invalide.')
  const snap = await db.collection('parcels').where('trackingId', '==', trackingId).limit(1).get()
  if (snap.empty) return { found: false }
  const d = snap.docs[0]
  const { publicTrackingParcel } = require('./publicTracking')
  return {
    found: true,
    parcel: publicTrackingParcel(d),
  }
})

/** Page de signature : vérifie le jeton CÔTÉ SERVEUR et renvoie seulement ce que la page affiche. */
exports.getSignatureParcel = onCall({ cors: true }, async (request) => {
  const { HttpsError } = require('firebase-functions/v2/https')
  const parcelId = String(request.data?.parcelId || '')
  const token = String(request.data?.token || '')
  if (!parcelId || !token || parcelId.length > 100 || token.length > 200) throw new HttpsError('invalid-argument', 'Lien invalide.')
  const snap = await db.collection('parcels').doc(parcelId).get()
  if (!snap.exists) return { valid: false }
  const p = snap.data()
  const isReturn = !!p.returnSignatureToken && p.returnSignatureToken === token
  const isNormal = !!p.signatureToken && p.signatureToken === token
  if (!isReturn && !isNormal) return { valid: false }
  if (p.status === 'Livré' || p.status === 'Retour finalisé') return { valid: true, alreadyDelivered: true }
  return {
    valid: true,
    isReturn,
    parcel: {
      id: snap.id,
      trackingId: p.trackingId || '',
      status: p.status || '',
      createdAt: isoOf(p.createdAt),
      originCity: p.originCity || '',
      destinationCity: p.destinationCity || '',
      nbColis: p.nbColis || null,
      arrivedNbColis: p.arrivedNbColis || null,
      weight: p.weight || null,
      codAmount: p.codAmount || 0,
      sender: { name: p.sender?.name || '' },
      receiver: { name: p.receiver?.name || '', tel: p.receiver?.tel || '', address: p.receiver?.address || '' },
    },
  }
})
