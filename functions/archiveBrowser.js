'use strict'

// Only the fields displayed or searched by the archive browser are cached.
// Full parcel documents are always read again before restoring an archive.
const FIELDS = [
  'trackingId', 'senderNic', 'nic', 'sender.name', 'sender.nic', 'sender.tel',
  'receiver.name', 'receiver.tel', 'originCity', 'destinationCity', 'status',
  'codAmount', 'createdAt', 'workDate', 'archivedAt', '_archivedAt',
]
const CACHE_MS = 5 * 60 * 1000
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
})
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function timestampMillis(value) {
  if (value == null || value === '') return null
  let ms
  if (typeof value.toMillis === 'function') ms = value.toMillis()
  else if (typeof value.toDate === 'function') ms = value.toDate().getTime()
  else if (typeof value === 'object' && (value.seconds !== undefined || value._seconds !== undefined)) {
    ms = Number(value.seconds ?? value._seconds) * 1000
  } else ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function dayOf(value) {
  const ms = timestampMillis(value)
  if (ms === null) return ''
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function toArchiveRow(id, data, source) {
  const archivedMs = timestampMillis(data.archivedAt) ?? timestampMillis(data._archivedAt)
  return {
    id, archiveSource: source,
    trackingId: String(data.trackingId || ''),
    senderNic: String(data.senderNic || data.nic || data.sender?.nic || ''),
    sender: { name: String(data.sender?.name || ''), tel: String(data.sender?.tel || '') },
    receiver: { name: String(data.receiver?.name || ''), tel: String(data.receiver?.tel || '') },
    originCity: String(data.originCity || ''), destinationCity: String(data.destinationCity || ''),
    status: String(data.status || ''), codAmount: Number(data.codAmount) || 0,
    shipmentDay: /^\d{4}-\d{2}-\d{2}$/.test(data.workDate || '') ? data.workDate : dayOf(data.createdAt),
    archiveDay: archivedMs === null ? '' : dayOf(archivedMs),
    archivedAt: archivedMs === null ? null : new Date(archivedMs).toISOString(),
  }
}

function searchMatches(row, search) {
  const fields = [row.id, row.trackingId, row.senderNic, row.sender.name, row.sender.tel,
    row.receiver.name, row.receiver.tel, row.originCity, row.destinationCity]
  if (/^\d+$/.test(search)) {
    return fields.some(value => (String(value).replace(/[\s.\-/]/g, '').match(/\d+/g) || []).some(number => number.startsWith(search)))
  }
  const text = normalize(fields.join(' '))
  return search.split(' ').every(term => text.includes(term))
}

function filterArchiveRows(rows, filters) {
  const search = normalize(filters.search)
  const dateField = filters.dateField === 'archivedAt' ? 'archiveDay' : 'shipmentDay'
  return rows.filter(row => {
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false
    if (filters.city && filters.city !== 'all' && ![row.originCity, row.destinationCity].includes(filters.city)) return false
    const day = row[dateField]
    if ((filters.dateFrom || filters.dateTo) && !day) return false
    if (filters.dateFrom && day < filters.dateFrom) return false
    if (filters.dateTo && day > filters.dateTo) return false
    return !search || searchMatches(row, search)
  })
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function createArchiveBrowser(db, HttpsError) {
  let cached = null
  let loading = null
  async function loadIndex(refresh) {
    if (loading) return loading
    if (!refresh && cached && Date.now() - cached.loadedAt < CACHE_MS) return cached
    loading = (async () => {
      const [main, separate] = await Promise.all([
        db.collection('parcels').where('isArchived', '==', true).select(...FIELDS).get(),
        db.collection('parcels_archive').select(...FIELDS).get(),
      ])
      const byId = new Map()
      for (const doc of separate.docs) byId.set(doc.id, toArchiveRow(doc.id, doc.data(), 'parcels_archive'))
      for (const doc of main.docs) byId.set(doc.id, toArchiveRow(doc.id, doc.data(), 'parcels'))
      const rows = [...byId.values()].sort((a, b) =>
        (b.archivedAt || '').localeCompare(a.archivedAt || '') || b.shipmentDay.localeCompare(a.shipmentDay) || a.id.localeCompare(b.id))
      cached = {
        rows, loadedAt: Date.now(),
        cities: [...new Set(rows.flatMap(row => [row.originCity, row.destinationCity]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
        statuses: [...new Set(rows.map(row => row.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
      }
      return cached
    })()
    try { return await loading } finally { loading = null }
  }

  return async request => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const user = await db.collection('users').doc(request.auth.uid).get()
    if (!user.exists || user.data().role !== 'admin') throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs.')
    const input = request.data || {}
    for (const field of ['search', 'status', 'city', 'dateField', 'dateFrom', 'dateTo']) {
      if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 200)) {
        throw new HttpsError('invalid-argument', 'Filtre invalide.')
      }
    }
    for (const field of ['dateFrom', 'dateTo']) {
      if (input[field] && !validDay(input[field])) throw new HttpsError('invalid-argument', 'Date invalide.')
    }
    if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
      throw new HttpsError('invalid-argument', 'La date de début doit précéder la date de fin.')
    }
    if (input.dateField && !['createdAt', 'archivedAt'].includes(input.dateField)) throw new HttpsError('invalid-argument', 'Type de date invalide.')
    if (input.pageSize !== undefined && ![25, 50, 100].includes(input.pageSize)) throw new HttpsError('invalid-argument', 'Taille de page invalide.')
    if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 0)) throw new HttpsError('invalid-argument', 'Page invalide.')
    const index = await loadIndex(input.refresh === true)
    const matches = filterArchiveRows(index.rows, input)
    const pageSize = input.pageSize || 50
    const page = Math.min(input.page || 0, Math.max(0, Math.ceil(matches.length / pageSize) - 1))
    return {
      parcels: matches.slice(page * pageSize, (page + 1) * pageSize),
      total: matches.length, totalArchived: index.rows.length,
      page, pageSize, cities: index.cities, statuses: index.statuses,
      updatedAt: new Date(index.loadedAt).toISOString(),
    }
  }
}

module.exports = { createArchiveBrowser, toArchiveRow, filterArchiveRows, timestampMillis }
