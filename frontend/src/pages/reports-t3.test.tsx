import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReportsPage } from './reports'

describe('ReportsPage - T3 downloads and history', () => {
  it('shows export, print, and current/history controls to an admin', async () => {
    server.use(
      http.get('*/api/cash-opening-balance', () => HttpResponse.json({ amount: 0, exists: false })),
      http.get('*/api/reports/cashbook', ({ request }) => {
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

    expect(await screen.findByRole('button', { name: 'Current' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download xlsx/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print report/i })).toBeInTheDocument()
  })
})
