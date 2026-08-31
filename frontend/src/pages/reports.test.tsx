import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReportsPage } from './reports'

function mockCashbook(overrides: {
  opening?: number
  receipts?: Array<Record<string, unknown>>
  expenses?: Array<Record<string, unknown>>
  societyName?: string
} = {}) {
  const opening = overrides.opening ?? 0
  const receipts = overrides.receipts ?? []
  const expenses = overrides.expenses ?? []
  const totalReceipts = receipts.reduce((s, r) => s + Number((r as { amount: number }).amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number((e as { amount: number }).amount), 0)
  const closing = opening + totalReceipts - totalExpenses
  server.use(
    http.get('*/api/cash-opening-balance', ({ request }) => {
      const url = new URL(request.url)
      const d = url.searchParams.get('date')
      return HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: d, amount: opening })
    }),
    http.put('*/api/cash-opening-balance', async ({ request }) => {
      const body = (await request.json()) as { opening_date: string; amount: number }
      if (body.amount < 0) return HttpResponse.json({ detail: 'amount must be >= 0' }, { status: 422 })
      return HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: body.opening_date, amount: body.amount })
    }),
    http.get('*/api/reports/cashbook', ({ request }) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from')!
      const to = url.searchParams.get('to')!
      if (from > to) return HttpResponse.json({ detail: 'from must be <= to' }, { status: 400 })
      return HttpResponse.json({
        society: { id: 'soc-lotus-divine', name: overrides.societyName ?? 'Lotus Divine' },
        from,
        to,
        opening,
        total_receipts: totalReceipts,
        total_expenses: totalExpenses,
        closing,
        receipts,
        expenses,
      })
    }),
  )
}

describe('ReportsPage — T2 Cashbook Report Core', () => {
  it('shows opening editor inline on reports page for selected from date', async () => {
    mockCashbook({ opening: 206394 })
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByRole('heading', { name: /Cashbook Report/i })).toBeInTheDocument()
    const input = await screen.findByLabelText(/Opening balance/i)
    expect(input).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save opening/i })).toBeInTheDocument()
    // should allow saving
    await waitFor(() => expect(input).toHaveValue('206394'))
  })

  it('saves opening balance via PUT and shows summary card with fixture totals 206394 + 120200 - 82300 = 244294', async () => {
    const user = userEvent.setup()
    let savedOpening: { opening_date: string; amount: number } | null = null
    const receipts = [
      { id: 'r1', flat_id: 'flat-1', fund_id: 'fund-main', amount: 80000, business_date: '2026-07-10', type: 'REGULAR', narration: 'July A', status: 'POSTED' },
      { id: 'r2', flat_id: 'flat-1', fund_id: 'fund-main', amount: 40200, business_date: '2026-07-15', type: 'REGULAR', narration: 'July B', status: 'POSTED' },
    ]
    const expenses = [
      { id: 'e1', business_date: '2026-07-12', amount: 50000, fund_id: 'fund-main', category_id: 'cat-1', vendor_id: 'v1', narration: 'Electricity' },
      { id: 'e2', business_date: '2026-07-18', amount: 32300, fund_id: 'fund-main', category_id: 'cat-2', vendor_id: 'v2', narration: 'Salary' },
    ]
    mockCashbook({ opening: 206394, receipts: receipts as unknown as Array<Record<string, unknown>>, expenses: expenses as unknown as Array<Record<string, unknown>> })
    server.use(
      http.put('*/api/cash-opening-balance', async ({ request }) => {
        savedOpening = (await request.json()) as { opening_date: string; amount: number }
        return HttpResponse.json({ society_id: 'soc-lotus-divine', ...savedOpening, exists: true })
      }),
    )
    renderWithProviders(<ReportsPage />)
    // society header and range visible — wait for report to load (opening 206394 triggers report)
    expect(await screen.findByText(/Lotus Divine/)).toBeInTheDocument()
    // summary card — use waitFor because data fetching is async
    await waitFor(() => expect(screen.getByTestId('summary-opening')).toBeInTheDocument())
    expect(screen.getByTestId('summary-receipts')).toHaveTextContent('1,20,200')
    // Indian locale includes commas; check raw values also work
    await waitFor(() => {
      expect(screen.getByTestId('summary-closing')).toHaveTextContent('2,44,294')
    })
    await user.click(screen.getByRole('button', { name: /Save opening/i }))
    await waitFor(() => expect(savedOpening?.amount).toBe(206394))
  })

  it('presets Today / This Week / This Month / Custom set range and re-fetch over same endpoint', async () => {
    const user = userEvent.setup()
    let lastFrom = ''
    let lastTo = ''
    server.use(
      http.get('*/api/cash-opening-balance', () => HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: '2026-07-01', amount: 0 })),
      http.put('*/api/cash-opening-balance', async () => HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: '2026-07-01', amount: 0 })),
      http.get('*/api/reports/cashbook', ({ request }) => {
        const url = new URL(request.url)
        lastFrom = url.searchParams.get('from')!
        lastTo = url.searchParams.get('to')!
        return HttpResponse.json({ society: { id: 'soc-lotus-divine', name: 'Lotus Divine' }, from: lastFrom, to: lastTo, opening: 0, total_receipts: 0, total_expenses: 0, closing: 0, receipts: [], expenses: [] })
      }),
    )
    renderWithProviders(<ReportsPage />)
    await screen.findByRole('heading', { name: /Cashbook Report/i })
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(lastFrom).toBe(lastTo))
    await user.click(screen.getByRole('button', { name: 'This Week' }))
    await waitFor(() => expect(lastFrom <= lastTo).toBe(true))
    await user.click(screen.getByRole('button', { name: 'This Month' }))
    await waitFor(() => expect(lastFrom.slice(0, 7)).toBe(lastTo.slice(0, 7)))
    // custom via date inputs
    const fromInput = screen.getByLabelText('From')
    await user.clear(fromInput)
    await user.type(fromInput, '2026-07-01')
    await waitFor(() => expect(lastFrom).toBe('2026-07-01'))
  })

  it('combined statement shows receipt and expense rows with drill to detail', async () => {
    const user = userEvent.setup()
    const receipts = [
      { id: 'r-drill', flat_id: 'flat-99', fund_id: 'fund-main', amount: 5000, business_date: '2026-07-10', type: 'REGULAR', narration: 'Drill me', status: 'POSTED', flat: { id: 'flat-99', flat_number: 'A-101' }, fund: { id: 'fund-main', name: 'Main Fund' } },
    ]
    const expenses = [
      { id: 'e-drill', business_date: '2026-07-11', amount: 2500, fund_id: 'fund-main', category_id: 'cat-e', vendor_id: 'vendor-x', narration: 'Expense drill', category: { id: 'cat-e', name: 'Electricity' }, vendor: { id: 'vendor-x', name: 'MSEDCL' }, fund: { id: 'fund-main', name: 'Main Fund' } },
    ]
    mockCashbook({ opening: 1000, receipts: receipts as unknown as Array<Record<string, unknown>>, expenses: expenses as unknown as Array<Record<string, unknown>> })
    server.use(
      http.get('*/api/receipts/r-drill', () => HttpResponse.json(receipts[0])),
      http.get('*/api/expenses/e-drill', () => HttpResponse.json(expenses[0])),
    )
    renderWithProviders(<ReportsPage />)
    await screen.findByText(/Combined statement/i)
    expect(await screen.findByText(/Drill me/)).toBeInTheDocument()
    expect(screen.getByText(/Expense drill/)).toBeInTheDocument()
    expect(screen.getByText(/A-101 · Main Fund/)).toBeInTheDocument()
    expect(screen.getByText(/Electricity · MSEDCL · Main Fund/)).toBeInTheDocument()
    // tap row to open detail sheet/dialog
    await user.click(screen.getByRole('button', { name: 'Drill me' }))
    expect(await screen.findByText(/Receipt detail/i)).toBeInTheDocument()
    expect(screen.getByText('r-drill')).toBeInTheDocument()
  })

  it('lets admins reveal voided receipt history without adding it to report totals', async () => {
    const user = userEvent.setup()
    mockCashbook({ opening: 1000 })
    server.use(
      http.get('*/api/receipts', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('include_voided')).toBe('true')
        return HttpResponse.json({
          receipts: [
            { id: 'void-1', amount: 500, business_date: '2026-07-10', status: 'VOIDED', narration: 'Correction' },
          ],
        })
      }),
    )
    renderWithProviders(<ReportsPage />)
    await screen.findByText(/Summary/i)
    await user.click(screen.getByRole('button', { name: /Show voided receipts/i }))
    expect(await screen.findByText(/Correction/)).toBeInTheDocument()
    expect(screen.getByTestId('summary-receipts')).toHaveTextContent('0')
  })

  it('blocks collector access before mounting cashbook queries', async () => {
    let cashbookRequests = 0
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({
          user: { id: 'collector-1', display_name: 'Collector', mobile: '+919999999999' },
          memberships: [
            {
              society: { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' },
              roles: ['collector'],
              permissions: ['receipt:create'],
            },
          ],
          platform_admin: false,
        }),
      ),
      http.get('*/api/reports/cashbook', () => {
        cashbookRequests += 1
        return HttpResponse.json({})
      }),
      http.get('*/api/cash-opening-balance', () => {
        cashbookRequests += 1
        return HttpResponse.json({})
      }),
    )
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByText(/Admin only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save opening/i })).not.toBeInTheDocument()
    expect(cashbookRequests).toBe(0)
  })

  it('business_date inclusive — rows outside range not shown', async () => {
    const receipts = [
      { id: 'r-inside', flat_id: 'flat-1', fund_id: 'fund-main', amount: 100, business_date: '2026-07-15', type: 'REGULAR', narration: 'inside', status: 'POSTED' },
      { id: 'r-outside', flat_id: 'flat-1', fund_id: 'fund-main', amount: 99999, business_date: '2026-06-30', type: 'REGULAR', narration: 'outside', status: 'POSTED' },
    ]
    // Mock to filter by business_date inclusive like real backend: return only inside
    server.use(
      http.get('*/api/cash-opening-balance', () => HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: '2026-07-01', amount: 0 })),
      http.put('*/api/cash-opening-balance', async () => HttpResponse.json({ society_id: 'soc-lotus-divine', opening_date: '2026-07-01', amount: 0 })),
      http.get('*/api/reports/cashbook', () =>
        HttpResponse.json({
          society: { id: 'soc-lotus-divine', name: 'Lotus Divine' },
          from: '2026-07-01',
          to: '2026-07-31',
          opening: 0,
          total_receipts: 100,
          total_expenses: 0,
          closing: 100,
          receipts: [receipts[0]],
          expenses: [],
        }),
      ),
    )
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByText(/inside/)).toBeInTheDocument()
    expect(screen.queryByText(/outside/)).not.toBeInTheDocument()
    expect(screen.queryByText(/99999/)).not.toBeInTheDocument()
  })
})
