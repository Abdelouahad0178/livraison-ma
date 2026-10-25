'use strict'

function canRealign(data) {
  const status = String(data.status || '')
  const portCashed = ['port_du', 'port_du_cheque'].includes(data.portType) && ['collected', 'received'].includes(data.portStatus)
  const codCashed = Number(data.codAmount) > 0 && data.codStatus && data.codStatus !== 'pending'
  return status !== 'Livré' && !/Retour|Retourn/.test(status) && !portCashed && !codCashed
}

function planAssignmentReset(parcel, driver, gare, now) {
  if (!canRealign(parcel) || !parcel.destinationCity || !parcel.deliveryDriverId) return null
  const isGare = driver?.role === 'livreur-gare' || /^En gare/i.test(parcel.deliveryDriverName || '')
  const driverCity = driver?.city || (isGare ? String(parcel.deliveryDriverName || '').replace(/^En gare - /i, '') : '')
  const sharedPair = [driverCity, parcel.destinationCity].sort().join('|') === 'Agadir|Ait Melloul'
  if (driverCity === parcel.destinationCity || (!isGare && sharedPair)) return null
  const patch = {
    deliveryDriverId: isGare && gare ? gare.id : null,
    deliveryDriverName: isGare && gare ? `En gare - ${parcel.destinationCity}` : null,
    deliverySectorId: null, deliverySectorCode: null, deliverySectorName: null,
    deliveryVehicleId: null, deliveryVehicleLabel: null,
    deliveryAssignedAt: isGare && gare ? now : null,
    deliveryAssignedBy: isGare && gare ? 'Changement de destination' : null,
  }
  if (parcel.status === 'En cours de livraison' && !(isGare && gare)) patch.status = 'Arrivé en agence'
  return patch
}

function createDestinationAssignmentHandler(db, FieldValue) {
  return async event => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after || !after.destinationCity || before.destinationCity === after.destinationCity
      || !after.deliveryDriverId || !canRealign(after)) return
    const driver = (await db.doc(`users/${after.deliveryDriverId}`).get()).data() || {}
    const gareSnapshot = await db.collection('users').where('role', '==', 'livreur-gare').where('city', '==', after.destinationCity).limit(1).get()
    const gare = gareSnapshot.empty ? null : { id: gareSnapshot.docs[0].id }
    await db.runTransaction(async transaction => {
      const current = (await transaction.get(event.data.after.ref)).data()
      // A newer routing/driver choice by the destination must take precedence.
      if (!current || current.destinationCity !== after.destinationCity || current.deliveryDriverId !== after.deliveryDriverId) return
      const now = new Date().toISOString()
      const patch = planAssignmentReset(current, driver, gare, now)
      if (!patch) return
      transaction.update(event.data.after.ref, {
        ...patch,
        history: FieldValue.arrayUnion({ status: patch.status || current.status, timestamp: now,
          note: 'Destination corrigée : affectation confiée à la nouvelle agence de destination.' }),
      })
    })
  }
}
module.exports = { createDestinationAssignmentHandler, planAssignmentReset }
