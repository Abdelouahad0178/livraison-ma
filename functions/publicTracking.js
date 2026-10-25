// Projection publique : aucune note interne, coordonnée privée ou identité d'agent.
function isoOf(value) {
  if (value == null || value === '') return null
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayOf = iso => dayFormatter.format(new Date(iso))

function publicTrackingHistory(parcel, createTime) {
  const history = (Array.isArray(parcel.history) ? parcel.history : [])
    .map(h => ({ status: h?.status || '', timestamp: isoOf(h?.timestamp) }))
  const first = history[0]
  const createdAt = isoOf(parcel.createdAt)
  // Anciennes saisies : createdAt ET l'événement initial étaient forcés à midi local
  // (11 h ou 12 h UTC selon le fuseau du poste). Ne toucher à aucun événement suivant.
  const legacyNoon = first?.timestamp && first.timestamp === createdAt
    && /T(?:11|12):00:00\.000Z$/.test(first.timestamp)
  if (!legacyNoon) return history

  const recordedAt = isoOf(createTime)
  const laterEvents = history.slice(1).map(h => h.timestamp).filter(Boolean)
  const canRecover = recordedAt && dayOf(recordedAt) === dayOf(first.timestamp)
    && !(Array.isArray(parcel.dateChangeLog) && parcel.dateChangeLog.length)
    && laterEvents.every(timestamp => timestamp >= recordedAt)
  // createTime est la métadonnée Firestore, pas updateTime (qui change à chaque modification).
  // Un ancien document réimporté ou une date déplacée peut avoir perdu son heure : ne pas l'inventer.
  if (canRecover) first.timestamp = recordedAt
  else first.timeKnown = false
  return history
}

function publicTrackingParcel(snapshot) {
  const p = snapshot.data()
  return {
    id: snapshot.id,
    trackingId: p.trackingId || '',
    status: p.status || '',
    codAmount: p.codAmount || 0,
    price: p.price || 0,
    weight: p.weight || null,
    signatureConfirmedAt: isoOf(p.signatureConfirmedAt),
    sender: { name: p.sender?.name || '', city: p.sender?.city || p.originCity || '' },
    receiver: { name: p.receiver?.name || '', city: p.receiver?.city || p.destinationCity || '' },
    history: publicTrackingHistory(p, snapshot.createTime),
  }
}

module.exports = { publicTrackingHistory, publicTrackingParcel }
