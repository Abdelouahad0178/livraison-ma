import { parcelDestinationCity, parcelOriginCity } from './agentProAccess'

type Profile = { role?: string; realRole?: string; city?: string } | null | undefined
type Parcel = Record<string, any> | null | undefined
const departureStatuses = ['Initialisé', 'En cours de ramassage', 'En transit']
const arrivalStatuses = ['Arrivé en agence', 'En cours de livraison', 'En livraison', 'Livré', 'Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']

export const isRestrictedDeliveryAgency = (profile: Profile) => ['chef_agence', 'agentpro'].includes(profile?.realRole || profile?.role || '')

export function agencyCanDeliver(profile: Profile, parcel: Parcel): boolean {
  return !isRestrictedDeliveryAgency(profile) || (!!profile?.city && parcelDestinationCity(parcel) === profile.city)
}

export function agencyCanTransport(profile: Profile, parcel: Parcel): boolean {
  return !isRestrictedDeliveryAgency(profile) || (!!profile?.city && parcelOriginCity(parcel) === profile.city)
}

export function parcelHasArrivedAtDestination(parcel: Parcel): boolean {
  return !!(parcel?.destinationArrivedAt || parcel?.chefPointedAt || parcel?.deliveredAt)
    || arrivalStatuses.includes(parcel?.status)
}

// The departure agency keeps transport actions until handover; delivery belongs to the destination.
export function deliveryStatusChangeBlock(profile: Profile, parcel: Parcel, nextStatus: string): string | null {
  if (!isRestrictedDeliveryAgency(profile) || nextStatus === parcel?.status || agencyCanDeliver(profile, parcel)) return null
  if (agencyCanTransport(profile, parcel)) {
    if (parcel?.wasReturned === true && nextStatus === 'Retour en transit') return null
    if (!parcelHasArrivedAtDestination(parcel) && departureStatuses.includes(parcel?.status)
      && departureStatuses.includes(nextStatus)) return null
  }
  return `Statut de livraison réservé à l'agence de ${parcelDestinationCity(parcel) || 'destination'}.`
}
