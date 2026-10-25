// @vitest-environment jsdom
import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAgentArchiveSearch } from '../../hooks/useAgentArchiveSearch'

function useHarness(role = 'agentpro', initialPreset = 'custom') {
  const [datePreset, setDatePreset] = useState(initialPreset)
  const [dateFrom, setDateFrom] = useState('2026-10-01')
  const [dateTo, setDateTo] = useState('2026-10-25')
  const archive = useAgentArchiveSearch({ role, datePreset, dateFrom, dateTo, setDatePreset, setDateFrom, setDateTo })
  return { ...archive, datePreset, dateFrom, dateTo, setDatePreset, setDateFrom, setDateTo }
}

describe('Agent Pro archive search', () => {
  it('removes the entire selected period and enables search without bulk loading', () => {
    const { result } = renderHook(() => useHarness())
    act(() => result.current.setIncludeArchived(true))
    expect(result.current).toMatchObject({ includeArchived: true, archiveSearchOnly: true, datePreset: 'all', dateFrom: '', dateTo: '' })
  })

  it('cancels an operational-day filter as well as a custom period', () => {
    const { result } = renderHook(() => useHarness('agentpro', 'operational'))
    act(() => result.current.setIncludeArchived(true))
    expect(result.current.archiveSearchOnly).toBe(true)
    expect(result.current.datePreset).toBe('all')
    act(() => result.current.setIncludeArchived(false))
    expect(result.current.datePreset).toBe('operational')
  })

  it('restores the previous period when archive search is unchecked', () => {
    const { result } = renderHook(() => useHarness())
    act(() => result.current.setIncludeArchived(true))
    act(() => result.current.setIncludeArchived(false))
    expect(result.current).toMatchObject({ includeArchived: false, archiveSearchOnly: false, datePreset: 'custom', dateFrom: '2026-10-01', dateTo: '2026-10-25' })
  })

  it('preserves a period deliberately chosen after activating archives', () => {
    const { result } = renderHook(() => useHarness())
    act(() => result.current.setIncludeArchived(true))
    act(() => result.current.setDatePreset('week'))
    expect(result.current.archiveSearchOnly).toBe(false)
    act(() => result.current.setIncludeArchived(false))
    expect(result.current.datePreset).toBe('week')
  })

  it('does not lose the previous period when the same checked state is applied again', () => {
    const { result } = renderHook(() => useHarness())
    act(() => result.current.setIncludeArchived(true))
    act(() => result.current.setIncludeArchived(true))
    act(() => result.current.setIncludeArchived(false))
    expect(result.current.datePreset).toBe('custom')
    expect(result.current.dateFrom).toBe('2026-10-01')
  })

  it('keeps the existing date behavior for other roles', () => {
    const { result } = renderHook(() => useHarness('chef_agence'))
    act(() => result.current.setIncludeArchived(true))
    expect(result.current).toMatchObject({ includeArchived: true, archiveSearchOnly: false, datePreset: 'custom', dateFrom: '2026-10-01' })
  })
})
