'use strict'

const { initializeApp }           = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { getStorage }              = require('firebase-admin/storage')
const { onDocumentWritten }       = require('firebase-functions/v2/firestore')
const { onSchedule }              = require('firebase-functions/v2/scheduler')
const { onCall, onRequest }       = require('firebase-functions/v2/https')
initializeApp({
  storageBucket: 'arelanc.firebasestorage.app'
})
const db = getFirestore()

// ── Backup automatique ─────────────────────────────────────────────────────
const BACKUP_API_KEY = '5hYgTzDPr7NvO9b6ecqJkZG1jWw28naiVMUsAXpS'

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
}, async (req, res) => {
  const key = req.query.key || req.headers['x-backup-key'] || ''

  if (!BACKUP_API_KEY || key !== BACKUP_API_KEY) {
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

// ── 🤖 IA Vocal - Extraction de données d'expédition ──────────────────────────
// Fonction sécurisée pour l'agent IA vocal
// La clé API Claude est stockée dans Firebase Config, pas dans le code !

const { defineString } = require('firebase-functions/params')
const Anthropic = require('@anthropic-ai/sdk').default

// Configuration sécurisée - la clé est en variable d'environnement
const CLAUDE_API_KEY = defineString('CLAUDE_API_KEY')

/**
 * 🤖 Extraction de données d'expédition via Claude AI
 * Appelable depuis le client - nécessite authentification
 */
exports.extractParcelData = onCall({
  cors: ['https://arelanc.web.app', 'http://localhost:5173'],
  timeoutSeconds: 60,
  region: 'europe-west1',
}, async (request) => {
  // 🔒 Vérifier authentification
  if (!request.auth) {
    throw new Error('🔒 Authentification requise')
  }

  const { transcript } = request.data

  // Validation
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('❌ Transcription invalide')
  }

  if (transcript.length > 2000) {
    throw new Error('❌ Texte trop long (max 2000 caractères)')
  }

  try {
    // 🤖 Appeler Claude AI avec clé sécurisée
    const anthropic = new Anthropic({
      apiKey: CLAUDE_API_KEY.value(),
    })

    console.log('🤖 Appel Claude AI pour utilisateur:', request.auth.uid)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `🚨 CRITIQUE: Tu DOIS comprendre et traiter l'ARABE et la DARIJA MAROCAINE ! 🚨

Tu es un expert en extraction de données d'expédition au Maroc.

═══ RÈGLE ABSOLUE ═══
L'utilisateur parle en :
1. DARIJA MAROCAINE (dialecte) - Exemple: "3andi colis mn Mohamed"
2. ARABE LITTÉRAL - Exemple: "عندي طرد من أحمد"
3. FRANÇAIS mélangé
4. TOUT MÉLANGÉ - Exemple: "عندي colis من Mohamed"

⚠️ SI TU VOIS DES CARACTÈRES ARABES (ع، غ، خ، etc.) = C'EST DE L'ARABE/DARIJA !
⚠️ SI TU VOIS "3", "7", "9" dans les mots = C'EST DE LA DARIJA TRANSLITTÉRÉE !

TU DOIS EXTRAIRE LES DONNÉES MÊME SI C'EST EN ARABE PUR !

═══ TRADUCTION ARABE ➜ FRANÇAIS (MEMORISE!) ═══
عندي / 3andi = J'AI
من / mn / men = DE (provenance)
ل / إلى / l / ila = À (destination)
غادي / ghadi = VA À / ALLER
ديال / dyal = DE (possession)
في / f / fi = DANS / À
رقم / rqam = NUMÉRO
تليفون / telephone = TÉLÉPHONE
وزن / wazn = POIDS
كيلو / kilo = KILOGRAMME
طرد / colis = COLIS
يخلص / ykhales = IL PAIE
خلصتو / khalsatou = PAYÉ
فلوس / flous = ARGENT
درهم / dirham = DIRHAM (monnaie)
اسمه / سميتو / smitou = IL S'APPELLE
ساكن / saken = IL HABITE
زنقة / zanqa = RUE
حي / hay = QUARTIER
عنوان / 3nwan = ADRESSE

═══ VILLES EN ARABE ═══
الدار البيضاء = Casablanca
الرباط = Rabat
مراكش = Marrakech
فاس = Fès
طنجة = Tanger
أكادير = Agadir
مكناس = Meknès
وجدة = Oujda

═══ VOCABULAIRE DARIJA ESSENTIEL ═══
POSSESSION & AVOIR:
- "3andi" / "عندي" / "andi" = j'ai
- "3andou" / "عندو" = il a
- "dyal" / "ديال" / "dial" = de (possession)

DIRECTION & DESTINATION:
- "mn" / "men" / "من" = de (provenance)
- "l" / "lel" / "ل" / "ila" = à (destination)
- "ghadi" / "غادي" / "gadi" = va à / aller à
- "f" / "fi" / "في" = dans / à (localisation)

PERSONNES & TITRES:
- "smitou" / "سميتو" = il s'appelle (masculin)
- "smitha" / "سميتها" = elle s'appelle (féminin)
- "smiya" / "اسمه" = son nom est
- "rajel" / "راجل" = homme / monsieur
- "mra" / "مرا" = femme / madame
- "ssi" / "سي" = monsieur (titre respect)
- "lalla" / "لالة" = madame (titre respect)
- "khti" / "ختي" = ma sœur (familier femme)
- "khouya" / "خويا" = mon frère (familier homme)
- "3ammi" / "عمي" = oncle / monsieur (respect)
- "khali" / "خالي" = oncle maternel

COLIS & POIDS:
- "colis" / "colit" / "الطرد" / "trd" = colis
- "wazn" / "الوزن" / "le poids" = poids
- "kilo" / "كيلو" = kilogramme
- "tqil" / "ثقيل" = lourd

PAIEMENT:
- "khalsatou" / "خلصتو" / "khalas" = payé / payer
- "makhlouss" / "مخلوص" = déjà payé
- "ykhales" / "يخلص" = il paie / va payer
- "flous" / "فلوس" / "flouss" = argent
- "cash" / "كاش" = espèces
- "dirham" / "درهم" = dirham (monnaie marocaine)

ADRESSE & LOCALISATION:
- "saken" / "ساكن" / "kay sken" / "sakin" = il habite
- "3nwan" / "عنوان" / "3inwan" / "adresse" = adresse
- "zanqa" / "زنقة" / "zenqa" = rue
- "derb" / "درب" = ruelle / impasse
- "hay" / "حي" / "7ay" = quartier
- "rqam" / "رقم" / "numero" = numéro
- "3mara" / "عمارة" / "3imara" = immeuble
- "taba9" / "طابق" / "etage" = étage
- "bab" / "باب" / "porte" = porte
- "9rib" / "قريب" / "grib" / "7da" = près de

TÉLÉPHONE:
- "telephone" / "تيليفون" / "tiliphone" = téléphone
- "numero" / "رقم" / "rqam" = numéro
- "portable" / "بورطابل" = mobile
- "06" / "07" / "05" = préfixes téléphone marocain
- "talifon dyalo" / "تليفون ديالو" = son téléphone

N° EXPÉDITEUR:
- "numero expediteur" / "رقم المرسل" = numéro expéditeur
- "N EXP" / "numero client" = N° client
- "code client" / "كود الكليان" = code client
- "rqam dyal l3amilة" / "رقم ديال العميل" = numéro du client
- "numero dyalo" = son numéro

NATURE DU COLIS:
- "fih" / "فيه" / "contenu" = il contient
- "chnya" / "شنية" / "ch7al" = quoi / combien
- "vetements" / "حوايج" / "7wayej" = vêtements
- "parfum" / "عطر" / "3atr" = parfum
- "chaussures" / "صباط" / "sabbat" = chaussures
- "documents" / "وراق" / "wra9" / "papiers" = documents
- "electronique" / "إلكترونيك" = électronique
- "alimentaire" / "ماكلة" / "makla" = nourriture

PORT DÛ:
- "port du" / "بور ديو" = port dû
- "destinataire ykhales" / "المرسل إليه يخلص" = destinataire paie
- "li ywaslo ykhales" / "اللي يوصلو يخلص" = celui qui reçoit paie
- "machi makhlouss" / "ماشي مخلوص" = pas payé
- "ba9i makhalassh" / "باقي ماخلصش" = pas encore payé
- "khalouh 3lih" / "خلوه عليه" = laissez-le lui (à payer)

RETOUR DE FOND (COD):
- "retour fond" / "ريتور فون" = retour de fond
- "cod" / "كود" / "COD" = contre remboursement
- "contre especes" / "كونتر إسبيس" / "konter espece" = contre espèces
- "flous" / "فلوس" / "flouss" / "cash" = argent
- "yjib" / "يجيب" / "yjib m3ah" = il ramène avec lui
- "yred" / "يرد" / "yredd" = il rend / retourne
- "3andou" / "عندو" / "يعطيه" = il donne
- "montant" / "مونتان" / "mablagh" = montant
- "l9ad" / "القاد" / "la9ad" = montant exact
- "bzaf" / "بزاف" = beaucoup
- "chwiya" / "شوية" = un peu

NOMBRES & QUANTITÉS:
- "wa7ed" / "واحد" / "wa7d" = un / 1
- "jouj" / "جوج" / "zouj" = deux / 2
- "tlata" / "تلاتة" = trois / 3
- "reb3a" / "ربعة" = quatre / 4
- "khamsa" / "خمسة" = cinq / 5
- "setta" / "ستة" = six / 6
- "seb3a" / "سبعة" = sept / 7
- "tmanya" / "تمنية" = huit / 8
- "tes3oud" / "تسعود" = neuf / 9
- "3achra" / "عشرة" = dix / 10
- "miya" / "مية" / "mya" = cent / 100
- "alf" / "ألف" = mille / 1000

URGENCE & IMPORTANCE:
- "mzarreb" / "مزربة" / "mezrab" = urgent
- "sari3" / "سريع" / "sari" = rapide / vite
- "deghdegha" / "دغدغة" = immédiat / tout de suite
- "daba" / "دابا" / "daba daba" = maintenant / tout de suite
- "mohim" / "مهم" / "muhim" = important
- "fragile" / "frajiل" / "khayef" = fragile
- "khass" / "خاص" / "khassni" = il faut / je dois
- "darouri" / "ضروري" = nécessaire
- "3ajel" / "عاجل" = pressé / urgent

TEMPS & DATES:
- "lyoum" / "اليوم" / "l7al" = aujourd'hui
- "ghedda" / "غدا" / "ghedwa" = demain
- "lbar7" / "البارح" / "lbare7" = hier
- "dak saa" / "داك الساعة" = à cette heure
- "nhar" / "نهار" = jour
- "sbah" / "صباح" = matin
- "3chiya" / "عشية" = soir
- "lil" / "الليل" = nuit
- "had semana" / "هاد السيمانة" = cette semaine

ACTIONS & VERBES:
- "dir" / "دير" / "deer" = faire
- "khed" / "خد" / "akhod" = prendre
- "3ti" / "عطي" / "a3ti" = donner
- "jib" / "جيب" / "ajib" = apporter / ramener
- "sir" / "سير" / "msir" = aller / partir
- "ja" / "جا" / "jay" = venir
- "wsel" / "وصل" / "wasel" = arriver
- "seft" / "صفط" / "seftet" = envoyer
- "tsel" / "تصل" = recevoir / arriver
- "shel" / "شحل" / "sha7el" = charger / porter

ÉTAT & DESCRIPTION:
- "mezyan" / "مزيان" / "mzyan" = bien / bon
- "khayeb" / "خايب" / "khayb" = mauvais
- "jdid" / "جديد" = nouveau / neuf
- "9dim" / "قديم" / "gdim" = ancien / vieux
- "kbir" / "كبير" / "kebir" = grand
- "sghir" / "صغير" / "seghir" = petit
- "tqil" / "ثقيل" / "te9il" = lourd
- "khfif" / "خفيف" / "khfef" = léger
- "skhoun" / "سخون" = chaud
- "bared" / "بارد" / "bard" = froid

═══ EXEMPLES COMPLETS EN DARIJA ═══

EXEMPLE 1:
"3andi colis mn Mohamed numero 4525672 dyal Casablanca telephone 0612345678 ghadi l Rabat l Fatima f hay nahda rue 12 telephone 0698765432 wazn 2 kilo port paye 50 dirham"

→ Extraction:
- Expéditeur: Mohamed, N°4525672, Casa, 0612345678
- Destinataire: Fatima, Rabat, hay nahda rue 12, 0698765432
- Poids: 2kg, port payé, 50 DH
- Type: simple

EXEMPLE 2:
"عندي طرد من أحمد ديال طنجة 0623456789 غادي ل مراكش ل خديجة في حي المسيرة زنقة 25 رقم تيليفون 0687654321 وزن 3 كيلو كونتر اسبيس 200 درهم"

→ Extraction:
- Expéditeur: Ahmed, Tanger, 0623456789
- Destinataire: Khadija, Marrakech, hay massira zanqa 25, 0687654321
- Poids: 3kg, contre espèces 200 DH
- Type: especes, codAmount: 200

EXEMPLE 3:
"3andi bon mn Youssef smitou numero client 8956234 men Fes telephone 0645678901 ghadi ila Agadir destinataire smitou Hassan f derb sultanي numero 15 telephone 0656789012 tqil 5 kilo contre cheque 500 dirham port du"

→ Extraction:
- Expéditeur: Youssef, N°8956234, Fès, 0645678901
- Destinataire: Hassan, Agadir, derb sultan numero 15, 0656789012
- Poids: 5kg, contre chèque 500 DH, port dû
- Type: cheque, codAmount: 500

EXEMPLE 4 (Avec nature et adresse complète):
"3andi colis rqam dyal l3amila 7845123 mn Amina dyal Rabat talifon dyalha 0623456789 fih 7wayej ghadi l Meknes l Zineb sakin f hay riad 3mara 12 taba9 3 bab 5 numero dyalha 0687654321 wazn 4 kilo destinataire ykhales port 60 dirham yjib m3ah 300 dirham"

→ Extraction:
- Expéditeur: Amina, N°7845123, Rabat, 0623456789
- Destinataire: Zineb, Meknès, hay riad immeuble 12 étage 3 porte 5, 0687654321
- Nature: Vêtements
- Poids: 4kg, port dû 60 DH, retour fond 300 DH
- Type: especes, codAmount: 300

EXEMPLE 5 (🔴 TOUT EN ARABE - MEMORISE CE FORMAT!):
"عندي كوليت من سعيد رقم ديال العميل 9632587 من الدار البيضاء تليفون ديالو 0612349876 فيه صباط و عطر غادي ل طنجة ل نادية ساكن في حي المسيرة زنقة 8 قريب البنك رقم ديالها 0698761234 وزن 2 كيلو باقي ماخلصش يخلص 40 درهم و يجيب معاه 150 درهم فلوس"

TRADUCTION MOT À MOT:
عندي (j'ai) كوليت (colis) من (de) سعيد (Said) رقم ديال العميل (numero client) 9632587 من (de) الدار البيضاء (Casablanca) تليفون ديالو (son telephone) 0612349876 فيه (contient) صباط (chaussures) و (et) عطر (parfum) غادي (va) ل (à) طنجة (Tanger) ل (à) نادية (Nadia) ساكن (habite) في (dans) حي المسيرة (hay massira) زنقة (rue) 8 قريب (près) البنك (banque) رقم ديالها (son numero) 0698761234 وزن (poids) 2 كيلو (kilo) باقي ماخلصش (pas encore payé) يخلص (il paie) 40 درهم (dirham) و (et) يجيب معاه (ramène avec lui) 150 درهم فلوس (dirham argent)

→ Extraction JSON:
{
  "confidence": 0.9,
  "data": {
    "senderName": "Saïd",
    "senderNic": "9632587",
    "senderCity": "Casablanca",
    "senderTel": "0612349876",
    "receiverName": "Nadia",
    "receiverCity": "Tanger",
    "receiverAddress": "hay massira zanqa 8 près de la banque",
    "receiverTel": "0698761234",
    "weight": 2,
    "parcelContent": "Chaussures et parfum",
    "portType": "port_du",
    "portPrice": 40,
    "serviceType": "especes",
    "codAmount": 150
  }
}

EXEMPLE 6 (🔴 ARABE SIMPLE):
"عندي طرد من أحمد 0612345678 غادي ل فاطمة في الرباط 0698765432"

TRADUCTION: J'ai colis de Ahmed 0612345678 va à Fatima dans Rabat 0698765432

→ Extraction JSON:
{
  "confidence": 0.85,
  "data": {
    "senderName": "Ahmed",
    "senderTel": "0612345678",
    "receiverName": "Fatima",
    "receiverCity": "Rabat",
    "receiverTel": "0698765432"
  }
}

═══ RÈGLES D'EXTRACTION ═══
1. TÉLÉPHONES: 06, 07, 05 + 8 chiffres = téléphone marocain
2. ORDRE: Premier nom mentionné = généralement expéditeur
3. MOTS-CLÉS DESTINATAIRE: "ghadi l", "ila", "pour", "l" (suivi d'un nom)
4. N° EXPÉDITEUR: "numero expediteur", "N EXP", "numero client", ou nombre 6-8 chiffres
5. PORT PAYÉ: "port paye", "khalsatou", "makhlouss" → portType: "port_paye"
6. PORT DÛ: "port du", "ykhales", "destinataire khales" → portType: "port_du"
7. TYPE SERVICE:
   - "contre especes" / "especes" / "cash" / "كاش" / "فلوس" → "especes"
   - "contre cheque" / "cheque" / "شيك" → "cheque"
   - "contre traite" / "traite" → "traite"
   - "retour BL" / "bon livraison" → "retour_bl"
   - Si COD > 0 mais pas de type → "especes"
   - Sinon → "simple"
8. RETOUR FOND (COD): "retour fond", "cash", "flous", "contre especes" + montant
9. ADRESSE: Tout après "f" / "fi" / "hay" / "rue" / "zanqa" / "derb" jusqu'au prochain élément
10. CONFIDENCE: >0.8 si clair, 0.5-0.7 si partiel, <0.5 si ambigu

Retourne UNIQUEMENT un JSON valide avec cette structure exacte.`,
      messages: [{
        role: 'user',
        content: `Extrait les données de cette phrase : "${transcript}"

IMPORTANT: Retourne UNIQUEMENT le JSON, sans texte avant ou après, sans explication.

Structure JSON attendue:
{
  "confidence": 0.85,
  "data": {
    "senderName": "...",
    "senderNic": "12345678",
    "senderTel": "06xxxxxxxx",
    "senderCity": "...",
    "senderAddress": "...",
    "receiverName": "...",
    "receiverTel": "07xxxxxxxx",
    "receiverCity": "...",
    "receiverAddress": "...",
    "weight": 3,
    "nbColis": 1,
    "serviceType": "simple",
    "portType": "port_paye",
    "portPrice": 80,
    "codAmount": 0
  },
  "needsConfirmation": []
}

ATTENTION:
- senderNic: N° expéditeur (6-8 chiffres)
- serviceType: "simple" | "especes" | "cheque" | "traite" | "retour_bl"
- receiverAddress: TOUJOURS extraire l'adresse complète du destinataire (rue, quartier, etc.)
- senderAddress: adresse de l'expéditeur si mentionnée`
      }]
    })

    // Parser JSON de la réponse de manière robuste
    const content = message.content[0].text || '{}'

    // Nettoyer les balises markdown
    let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Extraire uniquement le JSON (du premier { au dernier })
    const firstBrace = cleanContent.indexOf('{')
    const lastBrace = cleanContent.lastIndexOf('}')

    if (firstBrace === -1 || lastBrace === -1 || firstBrace > lastBrace) {
      throw new Error('Pas de JSON valide dans la réponse')
    }

    const jsonOnly = cleanContent.substring(firstBrace, lastBrace + 1)
    const result = JSON.parse(jsonOnly)

    console.log('✅ Extraction réussie - tokens:', message.usage.input_tokens, '+', message.usage.output_tokens)

    return {
      success: true,
      result: result,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      }
    }

  } catch (error) {
    console.error('❌ Erreur Claude API:', error.message)

    if (error.status === 401) {
      throw new Error('🔑 Clé API invalide - Contactez admin')
    }
    if (error.status === 429) {
      throw new Error('⏱️ Trop de requêtes - Réessayez')
    }

    throw new Error(`❌ Erreur IA: ${error.message}`)
  }
})

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
// S'exécute chaque jour à 2h du matin
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
