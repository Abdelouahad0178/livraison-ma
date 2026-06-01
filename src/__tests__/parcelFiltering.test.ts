import { describe, it, expect } from 'vitest'

function filterParcels(
  parcels: Array<{ trackingId?: string; status?: string; sender?: { name?: string }; receiver?: { name?: string; city?: string; tel?: string } }>,
  query: string,
  statusFilter: string
) {
  let list = parcels
  if (statusFilter !== 'all') {
    list = list.filter(p => p.status === statusFilter)
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase()
    list = list.filter(p =>
      (p.trackingId || '').toLowerCase().includes(q) ||
      (p.sender?.name || '').toLowerCase().includes(q) ||
      (p.receiver?.name || '').toLowerCase().includes(q) ||
      (p.receiver?.city || '').toLowerCase().includes(q) ||
      (p.receiver?.tel || '').includes(q)
    )
  }
  return list
}

describe('Parcel filtering', () => {
  const parcels = [
    { trackingId: 'BG001', status: 'Livré',    sender: { name: 'Hassan' }, receiver: { name: 'Sara',  city: 'Casablanca', tel: '0601000001' } },
    { trackingId: 'BG002', status: 'En transit', sender: { name: 'Omar' },   receiver: { name: 'Nadia', city: 'Rabat',       tel: '0601000002' } },
    { trackingId: 'BG003', status: 'Retourné', sender: { name: 'Karim' }, receiver: { name: 'Leila', city: 'Agadir',      tel: '0601000003' } },
  ]

  it('returns all parcels with no filter', () => {
    expect(filterParcels(parcels, '', 'all')).toHaveLength(3)
  })

  it('filters by status', () => {
    const result = filterParcels(parcels, '', 'Livré')
    expect(result).toHaveLength(1)
    expect(result[0].trackingId).toBe('BG001')
  })

  it('searches by tracking ID', () => {
    expect(filterParcels(parcels, 'BG002', 'all')).toHaveLength(1)
  })

  it('searches by sender name', () => {
    expect(filterParcels(parcels, 'Hassan', 'all')).toHaveLength(1)
  })

  it('searches by receiver city (case-insensitive)', () => {
    expect(filterParcels(parcels, 'casablanca', 'all')).toHaveLength(1)
  })

  it('searches by phone number', () => {
    expect(filterParcels(parcels, '0601000003', 'all')).toHaveLength(1)
  })

  it('combines status filter and search', () => {
    expect(filterParcels(parcels, 'Rabat', 'En transit')).toHaveLength(1)
    expect(filterParcels(parcels, 'Rabat', 'Livré')).toHaveLength(0)
  })

  it('returns empty on no match', () => {
    expect(filterParcels(parcels, 'XXXNOTFOUND', 'all')).toHaveLength(0)
  })
})
