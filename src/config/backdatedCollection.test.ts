import { describe, it, expect } from 'vitest'
import { backdatedCollectionAt, isBackdatedCollectionActive, BACKDATED_COLLECTION } from './backdatedCollection'
import { getOperationalDayString } from './operationalDay'

const UID = BACKDATED_COLLECTION.uid
const p07 = { workDate: '2026-10-07' }

describe('opération exceptionnelle du 28/10/2026 (encaissements datés du 07/10)', () => {
  it('active le 28/10 pour ce compte et les expéditions du 07/10 → daté du 07/10', () => {
    const now = new Date(2026, 9, 28, 15, 0)
    expect(isBackdatedCollectionActive(UID, now)).toBe(true)
    const at = backdatedCollectionAt(p07, UID, now)!
    expect(getOperationalDayString(new Date(at))).toBe('2026-10-07')
  })
  it('nuit du 28 au 29 avant 06:00 : encore la journée du 28/10', () => {
    expect(isBackdatedCollectionActive(UID, new Date(2026, 9, 29, 3, 0))).toBe(true)
  })
  it('annulée automatiquement après le 28/10 (et avant)', () => {
    expect(isBackdatedCollectionActive(UID, new Date(2026, 9, 29, 9, 0))).toBe(false)
    expect(isBackdatedCollectionActive(UID, new Date(2026, 9, 27, 15, 0))).toBe(false)
    expect(backdatedCollectionAt(p07, UID, new Date(2026, 9, 30, 10, 0))).toBeNull()
  })
  it('autre compte ou autre jour d\'expédition : date du jour (rien ne change)', () => {
    const now = new Date(2026, 9, 28, 15, 0)
    expect(backdatedCollectionAt(p07, 'autreCompte', now)).toBeNull()
    expect(backdatedCollectionAt({ workDate: '2026-10-08' }, UID, now)).toBeNull()
  })
})
