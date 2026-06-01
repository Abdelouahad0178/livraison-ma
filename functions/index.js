'use strict'

const { initializeApp }           = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { getStorage }              = require('firebase-admin/storage')
const { onDocumentWritten }       = require('firebase-functions/v2/firestore')
const { onSchedule }              = require('firebase-functions/v2/scheduler')
const { onCall, onRequest }       = require('firebase-functions/v2/https')
initializeApp()
const db = getFirestore()

// ── Backup automatique ─────────────────────────────────────────────────────
const BACKUP_API_KEY = process.env.BACKUP_API_KEY || ''

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
  const bucket = getStorage().bucket()
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
}, async (req, res) => {
  const key = req.query.key || req.headers['x-backup-key'] || ''
  if (!BACKUP_API_KEY || key !== BACKUP_API_KEY) {
    res.status(401).json({ error: 'Clé invalide' })
    return
  }

  const bucket = getStorage().bucket()
  const [allFiles] = await bucket.getFiles({ prefix: BACKUP_FOLDER + '/' })
  const sorted = allFiles
    .filter(f => f.name.startsWith(BACKUP_FOLDER + '/backup-bgexpress-'))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (sorted.length === 0) {
    res.status(404).json({ error: 'Aucun backup disponible' })
    return
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
    'En transit retour': 's_en_transit_retour',
  }
  return map[s] || ('s_' + (s || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
}

// ── Scheduled auto-archive ─────────────────────────────────────────────────
// Runs every day at 02:00 AM Casablanca time (UTC+1).
// Moves Livré/Retourné parcels older than 90 days to parcels_archive.
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
  const batch = db.batch()
  batch.set(db.doc('stats/global'), globalUpdate, { merge: true })
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
})

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
