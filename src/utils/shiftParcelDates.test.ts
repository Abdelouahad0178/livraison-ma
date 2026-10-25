import { describe, expect, it } from 'vitest'
import { daysBetween, shiftParcelDates } from './shiftParcelDates'

// Faux Timestamp Firestore
const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms })

describe('shiftParcelDates', () => {
  const created = Date.parse('2026-10-20T10:30:00.000Z')
  const parcel = {
    id: 'x',
    trackingId: 'LMA-1',
    senderNic: '2026-10-20', // pas un champ date : jamais touché
    createdAt: ts(created),
    workDate: '2026-10-20',
    codCollectedAt: '2026-10-21T15:00:00.000Z',
    codCollectedBy: 'Ali',
    price: 25,
    history: [
      { status: 'Initialisé', timestamp: '2026-10-20T10:30:00.000Z', note: 'ok' },
      { status: 'Livré', timestamp: '2026-10-21T14:00:00.000Z' },
    ],
    preReturn: { deliveryAssignedAt: '2026-10-21T09:00:00.000Z', status: 'Arrivé en agence' },
    adminChanges: [{ field: 'x', changedAt: '2026-10-20T11:00:00.000Z' }],
    updatedAt: ts(created),
  }

  it('décale toutes les dates du même nombre de jours, heure gardée', () => {
    const { patch, count } = shiftParcelDates(parcel, -3, ts)
    expect(patch.createdAt.toMillis()).toBe(created - 3 * 86400000)
    expect(patch.workDate).toBe('2026-10-17')
    expect(patch.codCollectedAt).toBe('2026-10-18T15:00:00.000Z')
    expect(patch.history[0].timestamp).toBe('2026-10-17T10:30:00.000Z')
    expect(patch.history[1].timestamp).toBe('2026-10-18T14:00:00.000Z')
    expect(patch.history[0].note).toBe('ok')
    expect(patch.preReturn.deliveryAssignedAt).toBe('2026-10-18T09:00:00.000Z')
    expect(count).toBe(6)
  })

  it('ne touche ni aux traces de modification ni aux champs non-dates', () => {
    const { patch } = shiftParcelDates(parcel, 5, ts)
    expect(patch).not.toHaveProperty('adminChanges')
    expect(patch).not.toHaveProperty('updatedAt')
    expect(patch).not.toHaveProperty('senderNic')
    expect(patch).not.toHaveProperty('price')
    expect(patch).not.toHaveProperty('codCollectedBy')
    expect(patch).not.toHaveProperty('id')
  })

  it('0 jour : rien à écrire', () => {
    expect(shiftParcelDates(parcel, 0, ts)).toEqual({ patch: {}, count: 0 })
  })

  it('daysBetween compte les jours calendaires (fin de mois comprise)', () => {
    expect(daysBetween('2026-10-20', '2026-10-17')).toBe(-3)
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2)
  })
})
