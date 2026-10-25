import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes = vi.hoisted(() => ({ transport: vi.fn().mockResolvedValue(undefined), single: vi.fn(), delivery: vi.fn() }))
vi.mock('../../firebase/config', () => ({ auth: {}, authSecondary: {}, db: {} }))
vi.mock('../../firebase/firestore', () => ({ assignDriversBulk: writes.transport, assignDriver: writes.single, assignDeliveryDriver: writes.delivery }))
vi.mock('../../firebase/parcels', () => ({}))
vi.mock('../../firebase/clients', () => ({}))
vi.mock('../../firebase/agentCodRequests', () => ({}))
vi.mock('../../firebase/bankDeposits', () => ({}))
vi.mock('../../firebase/portalAccounts', () => ({}))
vi.mock('../../firebase/delivery', () => ({}))
vi.mock('../../firebase/chefPortReception', () => ({}))
vi.mock('../../utils/printAgentTicket', () => ({}))
vi.mock('../../utils/printFeuilleDeCharge', () => ({}))
import { useAgentHandlers } from '../../pages/agent/hooks/useAgentHandlers'

const local = { id: 'local', status: 'Initialisé', createdByCity: 'Agadir', originCity: 'Agadir', destinationCity: 'Rabat' }
const incoming = { id: 'received', status: 'Arrivé en agence', createdByCity: 'Rabat', originCity: 'Rabat', destinationCity: 'Agadir' }
const foreign = { ...local, id: 'foreign', createdByCity: 'Rabat', originCity: 'Rabat' }
const state = (role: string) => ({
  profile: { role, city: 'Agadir' }, bulkLoadSelectedIds: ['local', 'received', 'foreign'],
  bulkLoadName: 'Transporteur', bulkLoadPhone: '',
  setBulkLoadError: vi.fn(), setBulkLoadBusy: vi.fn(), setBulkLoadSelectedIds: vi.fn(), setBulkLoadName: vi.fn(), setBulkLoadPhone: vi.fn(),
  bulkAssignSelectedIds: ['received'], bulkAssignDriverId: 'driver', setBulkAssignError: vi.fn(), setBulkAssignBusy: vi.fn(),
  transportModal: { parcel: incoming, chauffeurName: 'Transporteur', chauffeurPhone: '' }, setTransportModal: vi.fn(),
})
beforeEach(() => vi.clearAllMocks())

describe.each(['chef_agence', 'agentpro'])('%s assignment safeguards', role => {
  it('never sends received or foreign shipments to the transport write, even with a mixed stale selection', async () => {
    const s = { current: state(role) }
    await useAgentHandlers(s).handleBulkLoadTransport([local, incoming, foreign])
    expect(writes.transport).toHaveBeenCalledWith([{ parcelId: 'local', chauffeurName: 'Transporteur', chauffeurPhone: '' }])
  })
  it('refuses to load a received shipment individually', async () => {
    const s = { current: state(role) }
    await useAgentHandlers(s).handleAssignTransport()
    expect(writes.single).not.toHaveBeenCalled()
    expect(s.current.setTransportModal).toHaveBeenCalled()
  })
  it('rechecks current agency rights before assigning a destination driver', async () => {
    const s = { current: state(role) }
    const handlers = useAgentHandlers(s)
    s.current.profile.city = 'Casablanca'
    await handlers.handleBulkAssignDriver([incoming])
    expect(writes.delivery).not.toHaveBeenCalled()
    expect(s.current.setBulkAssignError).toHaveBeenLastCalledWith(expect.stringContaining('ne peut pas être assignée'))
    expect(s.current.setBulkAssignBusy).not.toHaveBeenCalled()
  })
})
