// ── Totaux de la gestion commerciale (bgexpress.web.app) ────────────────────
// Chaque expédition « contribue » à 3 petits documents de totaux :
//   commercialClients/{mois}_{ville}_{client}   (client = expéditeur, ville = agence d'origine)
//   commercialAgencies/{mois}_{ville}
//   commercialDays/{jour}_{ville}
// La dernière contribution appliquée est gardée dans commercialContrib/{parcelId} : chaque synchro
// applique seulement la DIFFÉRENCE (nouvelle − ancienne), en transaction → idempotent (rejouable
// sans double comptage), sûr avec retry: true et partagé avec le script de rattrapage.
// L'archivage (parcels → parcels_archive) et la désarchivage ne changent rien aux totaux.
const crypto = require('crypto')

// portCompteExp / portCompteDest : part « en compte » à facturer à l'expéditeur / au destinataire (portCompte = total)
const NUM_FIELDS = ['exp', 'colis', 'ca', 'portDu', 'portPaye', 'portCompte', 'portCompteExp', 'portCompteDest', 'cod', 'codExp', 'livres', 'retours', 'annules']

const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function toDate(v) {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Jour au Maroc (AAAA-MM-JJ). */
function dayOf(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

const shortHash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
const safeId = s => String(s).replace(/[\/\s]+/g, '-')

/** Contribution d'une expédition, ou null si elle ne compte pas (sans date / sans client). */
function contributionOf(p) {
  if (!p) return null
  const date = toDate(p.createdAt)
  const clientKey = p.senderNameNorm || norm(p.sender?.name || p.senderName || p.clientName)
  if (!date || !clientKey) return null
  const day = dayOf(date)
  const month = day.slice(0, 7)
  const city = p.originCity || p.sender?.city || p.createdByCity || 'Inconnue'
  const status = p.status || ''
  const annule = status === 'Annulé'
  const price = annule ? 0 : num(p.price)
  const portType = String(p.portType || '')
  const cod = annule ? 0 : num(p.codAmount)
  const values = {
    exp: 1,
    colis: Math.max(1, parseInt(p.nbColis, 10) || 1),
    ca: price,
    portDu: portType.startsWith('port_du') ? price : 0,
    portPaye: portType === 'port_paye' ? price : 0,
    portCompte: portType.startsWith('port_en_compte') ? price : 0,
    portCompteExp: portType === 'port_en_compte' || portType === 'port_en_compte_expediteur' ? price : 0,
    portCompteDest: portType === 'port_en_compte_destinataire' ? price : 0,
    cod,
    codExp: cod > 0 ? 1 : 0,
    livres: status === 'Livré' ? 1 : 0,
    retours: status === 'Retourné' || status === 'Retour finalisé' ? 1 : 0,
    annules: annule ? 1 : 0,
  }
  const clientName = String(p.sender?.name || p.senderName || p.clientName || clientKey).trim()
  return {
    values,
    meta: { month, day, city, clientKey, clientName },
    targets: {
      client: `commercialClients/${month}_${safeId(city)}_${shortHash(clientKey)}`,
      agency: `commercialAgencies/${month}_${safeId(city)}`,
      day: `commercialDays/${day}_${safeId(city)}`,
    },
  }
}

const zero = () => Object.fromEntries(NUM_FIELDS.map(k => [k, 0]))

/**
 * Applique (en transaction) la différence entre la contribution déjà enregistrée et `data`.
 * data = null → l'expédition ne compte plus (supprimée).
 */
async function syncCommercial(db, FieldValue, parcelId, data) {
  const contribRef = db.collection('commercialContrib').doc(parcelId)
  return db.runTransaction(async tx => {
    const oldSnap = await tx.get(contribRef)
    const old = oldSnap.exists ? oldSnap.data() : null
    const next = contributionOf(data)
    const oldTargets = old?.targets || null
    const oldValues = old?.values || zero()
    const newValues = next?.values || zero()
    const sameTargets = !!oldTargets && !!next && ['client', 'agency', 'day'].every(k => oldTargets[k] === next.targets[k])
    if (sameTargets && NUM_FIELDS.every(k => (oldValues[k] || 0) === (newValues[k] || 0)) && old.clientName === next.meta.clientName) return false
    if (!old && !next) return false

    const ts = FieldValue.serverTimestamp()
    const writeDelta = (path, sign, values, meta, kind) => {
      const u = { updatedAt: ts }
      // increment(0) crée le champ à 0 s'il manque : chaque total a toujours tous ses compteurs
      NUM_FIELDS.forEach(k => { u[k] = FieldValue.increment((values[k] || 0) * sign) })
      if (meta) {
        u.city = meta.city
        if (kind === 'day') u.day = meta.day
        u.month = meta.month
        if (kind === 'client') { u.clientKey = meta.clientKey; u.clientName = meta.clientName }
      }
      tx.set(db.doc(path), u, { merge: true })
    }
    if (sameTargets) {
      const diff = Object.fromEntries(NUM_FIELDS.map(k => [k, (newValues[k] || 0) - (oldValues[k] || 0)]))
      for (const kind of ['client', 'agency', 'day']) writeDelta(next.targets[kind], 1, diff, next.meta, kind)
    } else {
      if (oldTargets) for (const kind of ['client', 'agency', 'day']) writeDelta(oldTargets[kind], -1, oldValues, null, kind)
      if (next) for (const kind of ['client', 'agency', 'day']) writeDelta(next.targets[kind], 1, newValues, next.meta, kind)
    }
    if (next) tx.set(contribRef, { targets: next.targets, values: newValues, clientName: next.meta.clientName, updatedAt: ts })
    else tx.delete(contribRef)
    return true
  })
}

module.exports = { contributionOf, syncCommercial, NUM_FIELDS }
