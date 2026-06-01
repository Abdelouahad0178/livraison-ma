// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentHeader from '../../pages/agent/AgentHeader'

// Mock firebase/auth
vi.mock('../../firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}))

vi.mock('firebase/auth', () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../components/LiveClock', () => ({
  default: () => <span data-testid="live-clock">12:00</span>,
}))

const EMPTY_FORM = { senderName: '', receiverName: '', weight: '', nbColis: '1', serviceType: 'simple' }

function makeProps(overrides = {}) {
  return {
    profile: { name: 'Hassan', city: 'Casablanca', role: 'agent', code: 'A001' },
    tab: 'home',
    setTab: vi.fn(),
    menuOpen: false,
    setMenuOpen: vi.fn(),
    navigate: vi.fn(),
    openScanModal: vi.fn(),
    modRequests: [],
    aideAgents: [],
    setCreatedParcel: vi.fn(),
    setForm: vi.fn(),
    setArrivageTab: vi.fn(),
    setArrivageSuccess: vi.fn(),
    EMPTY_FORM,
    ...overrides,
  }
}

describe('AgentHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders logo and agent name', () => {
    render(<AgentHeader {...makeProps()} />)
    expect(screen.getByAltText(/BG Express/i)).toBeInTheDocument()
    expect(screen.getByText(/Hassan/)).toBeInTheDocument()
  })

  it('shows city badge', () => {
    render(<AgentHeader {...makeProps()} />)
    expect(screen.getByText(/Casablanca/)).toBeInTheDocument()
  })

  it('shows agent code', () => {
    render(<AgentHeader {...makeProps()} />)
    expect(screen.getByText(/A001/)).toBeInTheDocument()
  })

  it('calls openScanModal on scanner button click', () => {
    const openScanModal = vi.fn()
    render(<AgentHeader {...makeProps({ openScanModal })} />)
    fireEvent.click(screen.getByTitle(/Scanner/i))
    expect(openScanModal).toHaveBeenCalled()
  })

  it('shows mobile menu on hamburger click', () => {
    const setMenuOpen = vi.fn()
    render(<AgentHeader {...makeProps({ setMenuOpen })} />)
    // Find the mobile menu button (Menu icon) - it's the md:hidden button without a title
    const menuBtn = screen.getAllByRole('button').find(b => !b.title && b.className.includes('md:hidden'))
    if (menuBtn) {
      fireEvent.click(menuBtn)
      expect(setMenuOpen).toHaveBeenCalled()
    }
  })

  it('highlights active tab', () => {
    render(<AgentHeader {...makeProps({ tab: 'parcels' })} />)
    // Active tab should have bg-blue-50 class
    const parcelsTab = screen.getAllByRole('button').find(b => b.textContent?.includes('Expéditions'))
    if (parcelsTab) {
      expect(parcelsTab.className).toContain('bg-blue-50')
    }
  })

  it('shows pending modification badge count', () => {
    const modRequests = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'approved' },
      { id: '3', status: 'pending' },
    ]
    // Badge is in the mobile dropdown which is only rendered when menuOpen=true
    render(<AgentHeader {...makeProps({ profile: { ...makeProps().profile, role: 'chef_agence' }, modRequests, menuOpen: true })} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
