import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const { publicTrackingHistory, publicTrackingParcel } = createRequire(import.meta.url)('../../functions/publicTracking.js')
const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })
const noon = '2026-10-24T12:00:00.000Z'
const recorded = '2026-10-24T14:56:12.685Z'
const legacy = () => ({ createdAt: timestamp(noon), workDate: '2026-10-24', history: [{ status: 'Initialisé', timestamp: noon }] })

describe('public tracking creation time', () => {
  it('recovers the reported shipment from Firestore creation metadata without changing stored data', () => {
    const parcel = legacy()
    expect(publicTrackingHistory(parcel, timestamp(recorded))).toEqual([{ status: 'Initialisé', timestamp: recorded }])
    expect(parcel.history[0].timestamp).toBe(noon)
  })
  it('also recognizes noon recorded on a Moroccan computer', () => {
    const value = '2026-10-24T11:00:00.000Z'
    expect(publicTrackingHistory({ createdAt: timestamp(value), history: [{ status: 'En transit', timestamp: value }] }, timestamp(recorded))[0].timestamp).toBe(recorded)
  })
  it('preserves real initial timestamps and subsequent events', () => {
    const parcel = legacy()
    parcel.history.push({ status: 'En transit', timestamp: '2026-10-24T17:20:35.000Z' })
    expect(publicTrackingHistory(parcel, timestamp(recorded))[1]).toEqual(parcel.history[1])
    parcel.history[0].timestamp = '2026-10-24T14:56:12.000Z'
    expect(publicTrackingHistory(parcel, timestamp(recorded))[0].timestamp).toBe(parcel.history[0].timestamp)
  })
  it('does not confuse a restoration or import time with the original creation', () => {
    const parcel = legacy()
    expect(publicTrackingHistory(parcel, timestamp('2026-10-25T15:00:00Z'))[0]).toMatchObject({ timestamp: noon, timeKnown: false })
    parcel.history.push({ status: 'En transit', timestamp: '2026-10-24T13:00:00Z' })
    expect(publicTrackingHistory(parcel, timestamp(recorded))[0]).toMatchObject({ timestamp: noon, timeKnown: false })
  })
  it('preserves a deliberately moved operational date and handles missing metadata', () => {
    expect(publicTrackingHistory({ ...legacy(), dateChangeLog: [{ from: '2026-10-23', to: '2026-10-24' }] }, timestamp(recorded))[0].timeKnown).toBe(false)
    expect(publicTrackingHistory(legacy(), null)[0].timeKnown).toBe(false)
  })
  it('returns only public fields, including for malformed history dates', () => {
    const p = { ...legacy(), sender: { name: 'Sender', tel: 'private', nic: 'private', address: 'private' }, receiver: { name: 'Receiver', tel: 'private' }, signatureToken: 'secret', agentId: 'private' }
    p.history.push({ status: 'Livré', timestamp: 'bad-date', note: 'private', by: 'private' } as any)
    const result = publicTrackingParcel({ id: 'parcel', data: () => p, createTime: timestamp(recorded) })
    expect(Object.keys(result).sort()).toEqual(['id', 'trackingId', 'status', 'codAmount', 'price', 'weight', 'signatureConfirmedAt', 'sender', 'receiver', 'history'].sort())
    expect(result.sender).toEqual({ name: 'Sender', city: '' })
    expect(result.receiver).toEqual({ name: 'Receiver', city: '' })
    expect(result.history[1]).toEqual({ status: 'Livré', timestamp: null })
    expect(publicTrackingHistory({ history: null }, null)).toEqual([])
  })
})
