import { agencyCanTransport, agencyCanDeliver, isRestrictedDeliveryAgency, parcelHasArrivedAtDestination } from './agencyDeliveryAccess'
import { parcelCreationCity, parcelOriginCity, parcelDestinationCity } from './agentProAccess'

type Profile = { role?: string; realRole?: string; city?: string; name?: string } | null | undefined
type Parcel = Record<string, any>

export type AgencyAssignmentMode = 'pickup' | 'delivery'

export function canBulkAssignPickup(profile: Profile, parcel: Parcel | null | undefined): boolean {
  return ['chef_agence', 'agentpro'].includes(profile?.role || '') && canBulkLoadTransport(profile, parcel)
}

export function pickupAssignmentUpdates(profile: Profile, parcel: Parcel, driver: Parcel, now = new Date()) {
  if (!canBulkAssignPickup(profile, parcel) || !profile?.city || driver.city !== profile.city) {
    throw new Error('Ramassage réservé aux expéditions initialisées de votre agence et à ses livreurs.')
  }
  return {
    pickupDriverId: driver.id,
    pickupDriverName: driver.name,
    pickupAssignedAt: now,
    pickupAssignedBy: profile?.name || '',
    status: 'En cours de ramassage',
    ...(parcel.portType === 'port_paye' && !parcel.portPayeMethod ? { portStatus: 'collected' } : {}),
  }
}

/** Départ normal : uniquement les nouvelles saisies de l'agence, avant leur arrivée à destination. */
export function canBulkLoadTransport(profile: Profile, parcel: Parcel | null | undefined): boolean {
  if (!parcel) return false
  if (!['chef_agence', 'agentpro', 'admin'].includes(profile?.role || '')) return false
  if (parcel.status !== 'Initialisé' || parcel.isArchived || parcel.wasReturned || parcel.returnedAt
    || parcelHasArrivedAtDestination(parcel)) return false
  return agencyCanTransport(profile, parcel) && (!isRestrictedDeliveryAgency(profile)
    || (!!profile?.city && parcelCreationCity(parcel) === profile.city))
}

/** Livraison : l'agence de destination garde ses colis reçus et ses propres saisies locales. */
export function canBulkAssignDelivery(profile: Profile, parcel: Parcel | null | undefined): boolean {
  if (!parcel) return false
  if (!['chef_agence', 'agentpro'].includes(profile?.role || '') || !profile?.city) return false
  if (!agencyCanDeliver(profile, parcel) || parcelDestinationCity(parcel) !== profile.city) return false
  if (parcel.isArchived || parcel.deliveredAt || parcel.returnedAt || parcel.status === 'Livré') return false
  if (parcel.status === 'Initialisé') {
    return parcelCreationCity(parcel) === profile.city && parcelOriginCity(parcel) === profile.city
  }
  return ['En cours de ramassage', 'En transit', 'Arrivé en agence', 'En cours de livraison', 'En livraison'].includes(parcel.status)
}

export function deliverySelectionGroups<T extends Parcel>(parcels: T[]) {
  return [
    { key: 'initialised', label: 'les initialisées', parcels: parcels.filter(p => p.status === 'Initialisé') },
    { key: 'other', label: 'les autres statuts', parcels: parcels.filter(p => p.status !== 'Initialisé') },
  ]
}
