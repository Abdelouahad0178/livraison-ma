type Profile = { role?: string; realRole?: string; city?: string } | null | undefined
type Parcel = Record<string, any> | null | undefined

export const isRestrictedAgentPro = (profile: Profile) => (profile?.realRole || profile?.role) === 'agentpro'
const city = (value: unknown) => typeof value === 'string' && value ? value : ''
export const parcelCreationCity = (parcel: Parcel): string => city(parcel?.createdByCity)
  || city(parcel?.preReturn?.originCity) || city(parcel?.originCity) || city(parcel?.sender?.city)
export const parcelOriginCity = (parcel: Parcel): string => city(parcel?.originCity) || city(parcel?.sender?.city)
export const parcelDestinationCity = (parcel: Parcel): string => city(parcel?.destinationCity) || city(parcel?.receiver?.city)

export function agentProCanEditBon(profile: Profile, parcel: Parcel): boolean {
  return !isRestrictedAgentPro(profile) || (!!profile?.city && parcelCreationCity(parcel) === profile.city)
}
export function agentProCanDeliver(profile: Profile, parcel: Parcel): boolean {
  return !isRestrictedAgentPro(profile) || (!!profile?.city && parcelDestinationCity(parcel) === profile.city)
}
export function agentProCanTransport(profile: Profile, parcel: Parcel): boolean {
  return !isRestrictedAgentPro(profile) || (!!profile?.city && parcelOriginCity(parcel) === profile.city)
}
export function agentProReadOnly(profile: Profile, parcel: Parcel): boolean {
  return isRestrictedAgentPro(profile) && !agentProCanEditBon(profile, parcel)
    && !agentProCanDeliver(profile, parcel)
    && !(parcel?.wasReturned === true && agentProCanTransport(profile, parcel))
}
