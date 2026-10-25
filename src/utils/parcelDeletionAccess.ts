import { parcelCreationCity } from './agentProAccess'

type Profile = { role?: string; realRole?: string; city?: string } | null | undefined
type Parcel = Record<string, any> | null | undefined

export function isAgencyDeletionRestricted(profile: Profile): boolean {
  return ['agentpro', 'chef_agence'].includes(profile?.realRole || profile?.role || '')
}

// Deletion follows the original creation agency, including when a return swaps cities.
// Delivery responsibility and permission to edit a bon do not grant deletion rights.
export function agencyCanDeleteParcel(profile: Profile, parcel: Parcel): boolean {
  if (!parcel) return false
  if (!isAgencyDeletionRestricted(profile)) return true
  return !!profile?.city && parcelCreationCity(parcel) === profile.city
    && !parcel.shipmentLoadedAt
    && !['Livré', 'LivrÃ©', 'Retourné', 'Retour en transit'].includes(parcel.status)
}
