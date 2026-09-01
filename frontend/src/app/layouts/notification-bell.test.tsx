import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { NotificationBell } from './app-shell'

describe('NotificationBell', () => {
  it('shows the daily report fallback in the bell history', async () => {
    server.use(
      http.get('*/api/notifications', () => HttpResponse.json({
        notifications: [{
          id: 'daily-report-1',
          channel: 'PUSH',
          message: 'Daily Report 31 Aug - Collected Rs. 500 (1 receipts), Expenses Rs. 125, Closing Rs. 1,375 - tap to view',
          created_at: '2026-08-31T15:30:00Z',
        }],
      })),
    )

    renderWithProviders(<NotificationBell />)
    expect(await screen.findByRole('button', { name: 'Notifications (1)' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Notifications (1)' }))
    expect(await screen.findByText(/Daily Report 31 Aug/)).toBeInTheDocument()
  })
})
