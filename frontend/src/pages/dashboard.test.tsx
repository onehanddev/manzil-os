import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils'
import { DashboardPage } from './dashboard'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'

// Mock useMe to control the seam synchronously — MSW-based async rendering
// would swallow the TypeError inside React's error boundary, making RED invisible.
vi.mock('@/lib/api/hooks', () => ({
  useMe: vi.fn(),
  useSocieties: vi.fn(),
}))

const mockedUseMe = vi.mocked(useMe)

// Seam: user-visible DashboardPage — must not crash when memberships are loading/undefined
// Root cause: dashboard.tsx:12 does `me?.memberships.find(...)` — the `?.` only
// guards `me`, not `memberships`. When `me` is defined but `memberships` is
// undefined (e.g. backend returns { user, roles } without memberships, or
// memberships is null/undefined due to malformed payload), it throws
// "Cannot read properties of undefined (reading 'find')" and React Router
// ErrorBoundary blanks the page.
describe('DashboardPage — memberships optional chaining (TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSocietyStore.getState().setCurrentSociety(null)
  })

  it('does not crash while /me is loading (me is undefined)', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useMe>)

    expect(() => renderWithProviders(<DashboardPage />)).not.toThrow()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('does not crash when memberships is undefined (malformed payload / backend shape mismatch)', () => {
    // This is the exact crash from the bug report: `me` is defined (e.g. backend
    // returned { user_id, roles, society_id } without `memberships`), so
    // `me?.memberships` is undefined and `.find` throws.
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'user-1', display_name: 'Test User', mobile: '+91 90000 00000' },
        memberships: undefined as unknown as never,
        platform_admin: false,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)

    // Before fix this throws TypeError: Cannot read properties of undefined (reading 'find')
    expect(() => renderWithProviders(<DashboardPage />)).not.toThrow()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('does not crash when memberships is null', () => {
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'user-1', display_name: 'Test User', mobile: '+91 90000 00000' },
        memberships: null as unknown as never,
        platform_admin: false,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)

    expect(() => renderWithProviders(<DashboardPage />)).not.toThrow()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('does not crash when memberships is an empty array', () => {
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'user-1', display_name: 'Test User', mobile: '+91 90000 00000' },
        memberships: [],
        platform_admin: false,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)

    expect(() => renderWithProviders(<DashboardPage />)).not.toThrow()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders society name when memberships are available and currentSocietyId matches', () => {
    const society = { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' }
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'user-dev', display_name: 'Dev User', mobile: '+91 99999 99999' },
        memberships: [{ society, roles: ['super_admin'], permissions: ['*'] }],
        platform_admin: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)
    useSocietyStore.getState().setCurrentSociety(society.id)

    renderWithProviders(<DashboardPage />)

    expect(screen.getByText(/Lotus Divine/)).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('does not show the cashbook report entry point to collectors', () => {
    const society = { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' }
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'collector-1', display_name: 'Collector', mobile: '+91 90000 00001' },
        memberships: [{ society, roles: ['collector'], permissions: ['receipt:create'] }],
        platform_admin: false,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)
    useSocietyStore.getState().setCurrentSociety(society.id)

    renderWithProviders(<DashboardPage />)

    expect(screen.queryByText('View cashbook report')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /View cashbook report/i })).not.toBeInTheDocument()
  })
})
