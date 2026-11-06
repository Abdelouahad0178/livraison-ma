/**
 * 🧳 Archivage des expéditions de PASSAGERS à 15 jours (au lieu de 30) — 04/11/2026.
 * Règle : functions/shared/passagerArchive.js (compilé depuis src/utils/passagerArchive.ts, testé).
 *
 * Appelé par runWeeklyArchiving (chaque jour à 2 h depuis le 04/11/2026, functions/index.js) et par
 * scripts/archive-passagers-15j.mjs (essai sans écriture / application avec sauvegarde).
 * Ne lit que les expéditions créées entre 31 et 15 jours : au-delà de 30 jours, l'archivage automatique
 * « Livré sans COD » les archive de toute façon.
 */
const {
  isPassagerArchiveCandidate, isPassagerParcel, passagerArchiveCutoffMs, passagerNamesOf, passagerArchiveFields,
} = require('./shared/passagerArchive')

const SCAN_FROM_DAYS = 31
const PAGE = 2000
const FIELDS = ['status', 'isArchived', 'archivedAt', 'archivedBy', 'codAmount', 'codMixed', 'serviceType', 'portType',
  'portStatus', 'senderNameNorm', 'receiverNameNorm', 'createdAt', 'senderNic', 'originCity', 'destinationCity']

/** Expéditions de passagers à archiver maintenant (lecture seule). */
async function findPassagerArchives(db, { now = Date.now() } = {}) {
  const from = new Date(now - SCAN_FROM_DAYS * 86400000)
  const to = new Date(passagerArchiveCutoffMs(now))
  const candidates = []
  let last = null
  for (;;) {
    let q = db.collection('parcels').where('createdAt', '>=', from).where('createdAt', '<', to)
      .orderBy('createdAt').select(...FIELDS).limit(PAGE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    last = snap.docs[snap.docs.length - 1]
    for (const d of snap.docs) {
      const x = d.data()
      if (isPassagerArchiveCandidate(x)) candidates.push({ id: d.id, updateTime: d.updateTime, ...x })
    }
    if (snap.size < PAGE) break
  }

  // Nombre d'apparitions de chaque nom dans TOUTE la base (expéditeur + destinataire), par comptage serveur
  const names = [...new Set(candidates.flatMap(passagerNamesOf))]
  const seen = new Map()
  const countOf = async (field, name) => (await db.collection('parcels').where(field, '==', name).count().get()).data().count
  for (let i = 0; i < names.length; i += 20) {
    await Promise.all(names.slice(i, i + 20).map(async name => {
      const [asSender, asReceiver] = await Promise.all([countOf('senderNameNorm', name), countOf('receiverNameNorm', name)])
      seen.set(name, asSender + asReceiver)
    }))
  }
  const found = candidates.filter(p => isPassagerParcel(p, name => seen.get(name) || 0))
  return { scannedCandidates: candidates.length, names: names.length, found, seen }
}

/**
 * Archive les expéditions trouvées. Écriture conditionnelle (lastUpdateTime) : une expédition modifiée entre la
 * lecture et l'écriture est laissée telle quelle (elle sera revue au passage suivant).
 */
async function writePassagerArchives(db, found, { now = Date.now() } = {}) {
  const fields = passagerArchiveFields(now)
  let archived = 0
  let skipped = 0
  const bw = db.bulkWriter()
  bw.onWriteError(err => {
    if (err.code !== 9 /* FAILED_PRECONDITION */ && err.failedAttempts < 3) return true
    skipped++
    return false
  })
  for (const p of found) {
    const opts = p.updateTime ? { lastUpdateTime: p.updateTime } : undefined
    bw.update(db.collection('parcels').doc(p.id), fields, opts).then(() => { archived++ }).catch(() => {})
  }
  await bw.close()
  return { archived, skipped }
}

async function archivePassagers(db, { now = Date.now() } = {}) {
  const r = await findPassagerArchives(db, { now })
  const w = await writePassagerArchives(db, r.found, { now })
  return { found: r.found.length, ...w }
}

module.exports = { findPassagerArchives, writePassagerArchives, archivePassagers }
