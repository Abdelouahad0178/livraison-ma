import { useEffect, useMemo, useState } from 'react'
import { canBulkAssignPickup, canBulkAssignDelivery, type AgencyAssignmentMode } from '../../../utils/parcelBulkSelection'

export function useAgencyBulkAssignment({ profile, parcels, pickupIds, deliveryIds, setPickupIds, setDeliveryIds, setTransportIds }: {
  profile: { role?: string; realRole?: string; city?: string } | null
  parcels: Record<string, any>[]
  pickupIds: Set<string>
  deliveryIds: string[]
  setPickupIds: (ids: Set<string>) => void
  setDeliveryIds: (ids: string[]) => void
  setTransportIds: (ids: string[]) => void
}) {
  const [mode, updateMode] = useState<AgencyAssignmentMode>('pickup')
  const clear = () => { setPickupIds(new Set()); setDeliveryIds([]); setTransportIds([]) }
  useEffect(() => {
    updateMode('pickup')
    clear()
    // Une sélection ne se transporte pas d'un compte ou d'une ville à l'autre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, profile?.realRole, profile?.city])
  const eligible = useMemo(() => parcels.filter(p => mode === 'pickup'
    ? canBulkAssignPickup(profile, p) : canBulkAssignDelivery(profile, p)),
  [parcels, mode, profile?.role, profile?.realRole, profile?.city])
  const eligibleIds = useMemo(() => new Set<string>(eligible.map(p => p.id)), [eligible])
  const ids = useMemo(() => (mode === 'pickup' ? [...pickupIds] : deliveryIds).filter(id => eligibleIds.has(id)),
    [mode, pickupIds, deliveryIds, eligibleIds])
  const selected = useMemo(() => new Set(ids), [ids])
  return {
    mode, parcels: eligible, ids, selected,
    setMode: (next: AgencyAssignmentMode) => { clear(); updateMode(next) },
    select: (next: string[]) => {
      clear()
      const valid = next.filter(id => eligibleIds.has(id))
      if (mode === 'pickup') setPickupIds(new Set(valid))
      else setDeliveryIds(valid)
    },
  }
}
