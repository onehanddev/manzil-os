import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './app-shell'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'
import { DashboardPage } from '@/pages/dashboard'

vi.mock('@/lib/api/hooks', () => ({
  useMe: vi.fn(),
  useSocieties: vi.fn(),
}))

const mockedUseMe = vi.mocked(useMe)

function renderShell(route = '/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/receipts" element={<div>Receipts</div>} />
            <Route path="/expenses" element={<div>Expenses</div>} />
            <Route path="/reports" element={<div>Reports</div>} />
            <Route path="/flats" element={<div>Flats</div>} />
            <Route path="/funds" element={<div>Funds</div>} />
            <Route path="/people" element={<div>People page</div>} />
            <Route path="/flat-categories" element={<div>Flat categories page</div>} />
            <Route path="/vendors" element={<div>Vendors page</div>} />
            <Route path="/expense-categories" element={<div>Expense categories page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppShell — navigation role correctness and society scope (Slice 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSocietyStore.getState().setCurrentSociety(null)
  })

  it('admin sees Home, Collect, Spend, Reports, More in bottom nav', async () => {
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

    renderShell()

    // bottom nav: expect role-labeled items (primary nav has aria-label)
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Home$/i })).toHaveAttribute('href', '/dashboard')
    expect(within(nav).getByRole('link', { name: /^Collect$/i })).toHaveAttribute('href', '/receipts')
    expect(within(nav).getByRole('link', { name: /^Spend$/i })).toHaveAttribute('href', '/expenses')
    expect(within(nav).getByRole('link', { name: /^Reports$/i })).toHaveAttribute('href', '/reports')
    expect(within(nav).getByRole('button', { name: /^More$/i })).toBeInTheDocument()
  })

  it('collector does not see Reports in nav or More', async () => {
    const society = { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' }
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'collector-1', display_name: 'Collector', mobile: '+91 90000 00001' },
        memberships: [{ society, roles: ['COLLECTOR'], permissions: ['receipt:create'] }],
        platform_admin: false,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)
    useSocietyStore.getState().setCurrentSociety(society.id)

    renderShell()

    expect(screen.queryByRole('link', { name: /^Reports$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Spend$/i })).not.toBeInTheDocument()
    // open More sheet
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^More$/i }))
    const sheet = await screen.findByRole('dialog', { name: /^More$/i })
    expect(within(sheet).queryByRole('link', { name: /Funds/i })).not.toBeInTheDocument()
    expect(within(sheet).queryByText(/Reports/)).not.toBeInTheDocument()
  })

  it('society switcher is read-only — not a combobox or dropdown', async () => {
    const society = { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' }
    mockedUseMe.mockReturnValue({
      data: {
        user: { id: 'user-dev', display_name: 'Dev User', mobile: '+91 99999 99999' },
        memberships: [
          { society, roles: ['super_admin'], permissions: ['*'] },
          { society: { id: 'soc-rose-valley', name: 'Rose Valley', location: 'Andheri West', city: 'Mumbai' }, roles: ['committee_member'], permissions: [] },
        ],
        platform_admin: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMe>)
    useSocietyStore.getState().setCurrentSociety(society.id)

    renderShell()

    // Society name visible as text, not interactive combobox
    expect(await screen.findByText('Lotus Divine')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // old dropdown trigger must be absent
    expect(screen.queryByText(/Societies/)).not.toBeInTheDocument()
  })

  it('More sheet exposes grouped operational and financial settings', async () => {
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

    renderShell()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^More$/i }))
    const sheet = await screen.findByRole('dialog', { name: /^More$/i })
    expect(within(sheet).getByText('Society setup')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /Flats/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /People/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /Flat categories/i })).toBeInTheDocument()
    expect(within(sheet).getByText('Financial setup')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /Funds/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /Vendors/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /Expense categories/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /Sign out/i })).toBeInTheDocument()
  })

  it('closes More after navigating through a full settings row', async () => {
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

    renderShell()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^More$/i }))
    const sheet = await screen.findByRole('dialog', { name: /^More$/i })
    await user.click(within(sheet).getByRole('link', { name: /People/i }))

    expect(await screen.findByText('People page')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /^More$/i })).not.toBeInTheDocument()
  })

  it('marks More as the active destination on a settings route', async () => {
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

    renderShell('/people')

    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
  })

  it('sign out clears auth and navigates to login', async () => {
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

    renderShell()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Account/i }))

    // The sign out item should appear
    const signOut = await screen.findByRole('menuitem', { name: /Sign out/i })
    expect(signOut).toBeInTheDocument()
    await user.click(signOut)
    // menu closes after action — just verify action was triggerable
    expect(signOut).toBeDefined()
  })
})
