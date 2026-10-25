// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MaintenanceOverlay from '../../components/MaintenanceOverlay'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(), unsubscribe: vi.fn(), write: vi.fn().mockResolvedValue(undefined),
  listener: undefined as undefined | ((snapshot: any) => void),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, collection: string, id: string) => `${collection}/${id}`,
  onSnapshot: (...args: any[]) => { mocks.subscribe(...args); mocks.listener = args[1]; return mocks.unsubscribe },
  setDoc: (...args: any[]) => mocks.write(...args),
}))
vi.mock('../../firebase/db', () => ({ db: {} }))
vi.mock('../../components/LiveCodingPanel', () => ({ default: () => <span>Maintenance</span> }))

beforeEach(() => { vi.clearAllMocks(); mocks.listener = undefined })
afterEach(() => { cleanup(); vi.useRealTimers() })
const activate = async () => {
  await waitFor(() => expect(mocks.listener).toBeDefined())
  act(() => mocks.listener!({ data: () => ({ active: true, message: 'Travaux en cours' }) }))
}

describe('maintenance after deferred Firebase loading', () => {
  it('keeps the normal page available when maintenance is inactive', async () => {
    render(<MaintenanceOverlay role="chef_agence" />)
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('still blocks signed-in staff until maintenance is disabled in real time', async () => {
    render(<MaintenanceOverlay role="agentpro" />)
    await activate()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Travaux en cours')
    act(() => mocks.listener!({ data: () => ({ active: false }) }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('preserves the public five-second message', async () => {
    render(<MaintenanceOverlay />)
    await waitFor(() => expect(mocks.listener).toBeDefined())
    vi.useFakeTimers()
    act(() => mocks.listener!({ data: () => ({ active: true, message: 'Travaux en cours' }) }))
    for (let i = 0; i < 5; i++) act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('lets the admin deactivate maintenance and cleans up the subscription', async () => {
    const view = render(<MaintenanceOverlay role="admin" userName="Admin" />)
    await activate()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver pour tout le monde' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith('settings/maintenance', expect.objectContaining({ active: false, updatedBy: 'Admin' }), { merge: true }))
    view.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})
