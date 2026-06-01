import { describe, it, expect } from 'vitest'

// Replicate the salary calculation logic from AdminEmployeesTab
const currentSalaryMonth = () => new Date().toISOString().slice(0, 7)

function calcSalaryStats(
  employee: { id: string; name: string; salaire?: string },
  caisseEntries: Array<{ category: string; salaryMonth: string; staffId?: string; staffName?: string; amount?: string | number }>,
  month: string
) {
  const salaryBase = parseFloat(employee.salaire || '0') || 0
  const salaryPaid = caisseEntries
    .filter(e => e.category === 'salaire' && e.salaryMonth === month
      && (e.staffId === employee.id || (!e.staffId && e.staffName === employee.name)))
    .reduce((sum, e) => sum + (parseFloat(String(e.amount || 0)) || 0), 0)
  const salaryAdvance = caisseEntries
    .filter(e => e.category === 'avance' && e.salaryMonth === month
      && (e.staffId === employee.id || (!e.staffId && e.staffName === employee.name)))
    .reduce((sum, e) => sum + (parseFloat(String(e.amount || 0)) || 0), 0)
  const remaining = Math.max(0, salaryBase - salaryPaid)
  return { salaryBase, salaryPaid, salaryAdvance, remaining }
}

describe('Salary calculations', () => {
  const month = '2025-01'
  const emp = { id: 'emp1', name: 'Hassan', salaire: '5000' }

  it('returns full salary as remaining when nothing paid', () => {
    const result = calcSalaryStats(emp, [], month)
    expect(result.remaining).toBe(5000)
    expect(result.salaryPaid).toBe(0)
    expect(result.salaryAdvance).toBe(0)
  })

  it('calculates remaining after partial payment', () => {
    const entries = [{ category: 'salaire', salaryMonth: month, staffId: 'emp1', amount: 2000 }]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.salaryPaid).toBe(2000)
    expect(result.remaining).toBe(3000)
  })

  it('remaining never goes negative', () => {
    const entries = [{ category: 'salaire', salaryMonth: month, staffId: 'emp1', amount: 6000 }]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.remaining).toBe(0)
  })

  it('tracks advances separately from salary paid', () => {
    const entries = [
      { category: 'salaire', salaryMonth: month, staffId: 'emp1', amount: 2000 },
      { category: 'avance',  salaryMonth: month, staffId: 'emp1', amount: 500 },
    ]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.salaryPaid).toBe(2000)
    expect(result.salaryAdvance).toBe(500)
    expect(result.remaining).toBe(3000) // remaining ignores advances
  })

  it('matches by name when staffId is absent', () => {
    const entries = [{ category: 'salaire', salaryMonth: month, staffName: 'Hassan', amount: 1000 }]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.salaryPaid).toBe(1000)
  })

  it('ignores entries from other months', () => {
    const entries = [{ category: 'salaire', salaryMonth: '2024-12', staffId: 'emp1', amount: 5000 }]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.salaryPaid).toBe(0)
    expect(result.remaining).toBe(5000)
  })

  it('handles multiple entries in same month', () => {
    const entries = [
      { category: 'salaire', salaryMonth: month, staffId: 'emp1', amount: 1500 },
      { category: 'salaire', salaryMonth: month, staffId: 'emp1', amount: 1500 },
    ]
    const result = calcSalaryStats(emp, entries, month)
    expect(result.salaryPaid).toBe(3000)
    expect(result.remaining).toBe(2000)
  })

  it('handles employee with no salary configured', () => {
    const empNoSalary = { id: 'emp2', name: 'Ali' }
    const result = calcSalaryStats(empNoSalary, [], month)
    expect(result.salaryBase).toBe(0)
    expect(result.remaining).toBe(0)
  })
})
