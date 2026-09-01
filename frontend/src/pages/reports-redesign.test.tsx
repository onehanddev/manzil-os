import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReportsPage } from './reports'

function mockReport(onRange?: (from: string, to: string) => void) {
  server.use(
    http.get('*/api/cash-opening-balance', () =>
      HttpResponse.json({ society_id: 'society-1', opening_date: '2026-09-01', amount: 206394, exists: true }),
    ),
    http.get('*/api/reports/cashbook', ({ request }) => {
      const url = new URL(request.url)
      onRange?.(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? '')
      return HttpResponse.json({
        society: { id: 'society-1', name: 'Manzil Pilot Society' },
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        opening: 206394,
        total_receipts: 120200,
        total_expenses: 82300,
        closing: 244294,
        receipts: [
          {
            id: 'receipt-1',
            flat_id: 'flat-1',
            payer_person_id: 'person-1',
            fund_id: 'fund-1',
            amount: 120200,
            business_date: '2026-09-01',
            type: 'REGULAR',
            narration: 'September maintenance',
            status: 'POSTED',
            flat: { id: 'flat-1', flat_number: 'A-101' },
            fund: { id: 'fund-1', name: 'Main Fund' },
          },
        ],
        expenses: [
          {
            id: 'expense-1',
            business_date: '2026-09-02',
            amount: 82300,
            fund_id: 'fund-1',
            category_id: 'category-1',
            vendor_id: 'vendor-1',
            narration: 'Electricity bill',
            category: { id: 'category-1', name: 'Electricity' },
            vendor: { id: 'vendor-1', name: 'MSEDCL' },
            fund: { id: 'fund-1', name: 'Main Fund' },
          },
        ],
      })
    }),
  )
}

describe('ReportsPage cashbook redesign', () => {
  it('explains current cash and source movements without a desktop table', async () => {
    mockReport()

    renderWithProviders(<ReportsPage />)

    expect(await screen.findByText('Closing cash')).toBeInTheDocument()
    expect(screen.getByText('₹2,44,294')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Opening cash ₹2,06,394/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Received \+₹1,20,200/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paid −₹82,300/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Received.*September maintenance.*₹1,20,200/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paid.*Electricity bill.*₹82,300/i })).toBeInTheDocument()
  })

  it('applies a custom range once instead of requesting each draft date', async () => {
    const user = userEvent.setup()
    const requestedRanges: Array<[string, string]> = []
    mockReport((from, to) => requestedRanges.push([from, to]))
    renderWithProviders(<ReportsPage />)
    await screen.findByText('Closing cash')
    await waitFor(() => expect(requestedRanges).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(await screen.findByRole('heading', { name: 'Custom range' })).toBeInTheDocument()

    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    await user.clear(from)
    await user.type(from, '2026-08-01')
    await user.clear(to)
    await user.type(to, '2026-08-31')
    expect(requestedRanges).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Apply range' }))
    await waitFor(() => expect(requestedRanges.at(-1)).toEqual(['2026-08-01', '2026-08-31']))
    expect(requestedRanges).toHaveLength(2)
  })

  it('drills from received cash into semantic source details', async () => {
    const user = userEvent.setup()
    mockReport()
    server.use(
      http.get('*/api/receipts/receipt-1', () => HttpResponse.json({
        id: 'receipt-1',
        amount: 120200,
        business_date: '2026-09-01',
        type: 'REGULAR',
        narration: 'September maintenance',
        status: 'POSTED',
        flat: { id: 'flat-1', flat_number: 'A-101' },
        fund: { id: 'fund-1', name: 'Main Fund' },
      })),
    )
    renderWithProviders(<ReportsPage />)

    await user.click(await screen.findByRole('button', { name: /Received \+₹1,20,200/i }))
    expect(await screen.findByRole('heading', { name: 'Money received' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /September maintenance.*₹1,20,200/i }))

    expect(await screen.findByRole('heading', { name: 'Receipt details' })).toBeInTheDocument()
    expect(screen.getByText('A-101')).toBeInTheDocument()
    expect(screen.getByText('Main Fund')).toBeInTheDocument()
    expect(screen.getByText('01 Sept 2026')).toBeInTheDocument()
    expect(screen.queryByText('flat_id')).not.toBeInTheDocument()
  })

  it('shows a recoverable error instead of an empty report', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get('*/api/cash-opening-balance', () => HttpResponse.json({ amount: 0, exists: false })),
      http.get('*/api/reports/cashbook', ({ request }) => {
        attempts += 1
        if (attempts === 1) return HttpResponse.json({ detail: 'database unavailable' }, { status: 500 })
        const url = new URL(request.url)
        return HttpResponse.json({
          society: { id: 'society-1', name: 'Manzil Pilot Society' },
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          opening: 0,
          total_receipts: 0,
          total_expenses: 0,
          closing: 0,
          receipts: [],
          expenses: [],
        })
      }),
    )
    renderWithProviders(<ReportsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cashbook could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Closing cash')).toBeInTheDocument()
  })

  it('keeps exports, history, and opening cash in the report actions menu', async () => {
    const user = userEvent.setup()
    mockReport()
    renderWithProviders(<ReportsPage />)
    await screen.findByText('Closing cash')

    await user.click(screen.getByRole('button', { name: 'Report actions' }))
    expect(screen.getByRole('menuitem', { name: 'Export XLSX' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export PDF' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Print report' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Report history' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Edit opening cash' }))
    expect(await screen.findByRole('heading', { name: 'Edit opening cash' })).toBeInTheDocument()
    expect(screen.getByLabelText('Opening balance')).toHaveValue('206394')
  })
})
