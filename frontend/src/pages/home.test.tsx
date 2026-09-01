import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { DashboardPage } from './dashboard'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'

vi.mock('@/lib/api/hooks', () => ({
  useMe: vi.fn(),
  useSocieties: vi.fn(),
}))

const mockedUseMe = vi.mocked(useMe)

function mockAdminMe() {
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
  return society
}

function mockCollectorMe() {
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
  return society
}

function setupHomeHandlers(opts?: { receipts?: number; expenses?: number; closing?: number }) {
  const closing = opts?.closing ?? 45230
  const totalReceipts = opts?.receipts ?? 12000
  const totalExpenses = opts?.expenses ?? 3400
  const opening = closing - totalReceipts + totalExpenses
  server.use(
    http.get('*/api/reports/cashbook', ({ request }) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      // fail if not inclusive range? Just return valid report
      return HttpResponse.json({
        society: { id: 'soc-lotus-divine', name: 'Lotus Divine' },
        from: from ?? '2026-09-01',
        to: to ?? '2026-09-01',
        opening,
        total_receipts: totalReceipts,
        total_expenses: totalExpenses,
        closing,
        receipts: [
          { id: 'rec-1', flat_id: 'flat-1', amount: 1500, business_date: '2026-09-01', type: 'REGULAR', narration: 'Sept maintenance', status: 'POSTED', flat: { id: 'flat-1', flat_number: 'A-101' }, fund: { id: 'fund-main', name: 'Main Fund' } },
        ],
        expenses: [
          { id: 'exp-1', business_date: '2026-09-01', amount: 800, fund_id: 'fund-main', category_id: 'cat-electricity', vendor_id: 'vendor-1', narration: 'Electricity', category: { id: 'cat-electricity', name: 'Electricity' }, vendor: { id: 'vendor-1', name: 'MSEDCL' }, fund: { id: 'fund-main', name: 'Main Fund' } },
        ],
      })
    }),
    http.get('*/api/receipts', () => HttpResponse.json({ receipts: [
      { id: 'rec-1', flat_id: 'flat-1', amount: 1500, business_date: '2026-09-01', type: 'REGULAR', status: 'POSTED', receipt_number: 'R-0001', flat: { flat_number: 'A-101' } },
    ] })),
    http.get('*/api/expenses', () => HttpResponse.json({ expenses: [
      { id: 'exp-1', business_date: '2026-09-01', amount: 800, fund_id: 'fund-main', category_id: 'cat-electricity', vendor_id: 'vendor-1', narration: 'Electricity' },
    ] })),
    http.get('*/api/flats', () => HttpResponse.json({ flats: [{ id: 'flat-1', flat_number: 'A-101', maintenance_amount: 1500 }] })),
    http.get('*/api/notifications', () => HttpResponse.json({ notifications: [] })),
  )
  return { closing, totalReceipts, totalExpenses, opening }
}

describe('Home — operational dashboard (Slice 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSocietyStore.getState().setCurrentSociety(null)
  })

  it('shows closing cash hero and today received/paid metrics', async () => {
    mockAdminMe()
    setupHomeHandlers({ closing: 45230, receipts: 12000, expenses: 3400 })
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('Current cash')).toBeInTheDocument()
    // tabular figures for cash
    expect(await screen.findByText(/₹45,230/)).toBeInTheDocument()
    expect(await screen.findByText(/Received/i)).toBeInTheDocument()
    expect(await screen.findByText(/₹12,000/)).toBeInTheDocument()
    expect(await screen.findByText(/Paid/i)).toBeInTheDocument()
    expect(await screen.findByText(/₹3,400/)).toBeInTheDocument()
  })

  it('exposes two large quick actions — Collect and Spend — whole card tappable', async () => {
    mockAdminMe()
    setupHomeHandlers()
    renderWithProviders(<DashboardPage />)

    const collect = await screen.findByRole('link', { name: /Collect/i })
    const spend = await screen.findByRole('link', { name: /Spend/i })

    expect(collect).toHaveAttribute('href', '/receipts')
    expect(spend).toHaveAttribute('href', '/expenses')
    // cards are large touch targets (>=48px) and not just a small Open link
    expect(collect.className).not.toContain('text-xs')
    // Ensure no small Open link remnants
    expect(screen.queryByText(/^Open$/)).not.toBeInTheDocument()
  })

  it('collector sees only Collect, not Spend quick action', async () => {
    mockCollectorMe()
    setupHomeHandlers()
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('link', { name: /Collect/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Spend$/i })).not.toBeInTheDocument()
  })

  it('shows recent activity as human-readable rows without UUIDs', async () => {
    mockAdminMe()
    setupHomeHandlers()
    renderWithProviders(<DashboardPage />)

    const row = await screen.findByText(/A-101/i)
    expect(row).toBeInTheDocument()
    // no UUID fragments
    expect(screen.queryByText(/flat-1/)).not.toBeInTheDocument()
    expect(screen.queryByText(/rec-1/)).not.toBeInTheDocument()
  })

  it('preserves quick actions and shows empty state when no activity', async () => {
    mockAdminMe()
    server.use(
      http.get('*/api/reports/cashbook', () => HttpResponse.json({
        society: { id: 'soc-lotus-divine', name: 'Lotus Divine' },
        from: '2026-09-01', to: '2026-09-01', opening: 10000, total_receipts: 0, total_expenses: 0, closing: 10000, receipts: [], expenses: [],
      })),
      http.get('*/api/receipts', () => HttpResponse.json({ receipts: [] })),
      http.get('*/api/expenses', () => HttpResponse.json({ expenses: [] })),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText(/No activity yet/i)).toBeInTheDocument()
    // quick actions remain
    expect(await screen.findByRole('link', { name: /Collect/i })).toBeInTheDocument()
  })

  it('shows retryable error and retains quick actions on report failure', async () => {
    mockAdminMe()
    server.use(
      http.get('*/api/reports/cashbook', () => HttpResponse.json({ detail: 'down' }, { status: 500 })),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Try again/i })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Collect/i })).toBeInTheDocument()
  })

  it('Home heading is operational, not a directory title', async () => {
    mockAdminMe()
    setupHomeHandlers()
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('heading', { name: /Home/i })).toBeInTheDocument()
    // directory copy must be gone
    expect(screen.queryByText(/Phase 0 scope/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Pilot cashbook only/)).not.toBeInTheDocument()
  })
})
