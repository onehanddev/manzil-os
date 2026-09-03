import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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

  it('lets an admin approve a pending signup request from the notification drawer', async () => {
    const approve = vi.fn()
    server.use(
      http.get('*/api/notifications', () => HttpResponse.json({
        notifications: [{
          id: 'signup-request-1',
          channel: 'IN_APP',
          message: 'New signup pending approval: New Collector (+919000000123)',
          created_at: '2026-09-03T12:00:00Z',
        }],
      })),
      http.get('*/api/admin/pending', () => HttpResponse.json({
        pending: [{
          user_id: 'pending-user-1',
          mobile: '+919000000123',
          display_name: 'New Collector',
          membership_id: 'membership-1',
          status: 'PENDING',
        }],
      })),
      http.post('*/api/admin/users/:userId/approve', async ({ params, request }) => {
        approve(params.userId, await request.json())
        return HttpResponse.json({ status: 'active', user_id: params.userId, role: 'COLLECTOR' })
      }),
    )

    renderWithProviders(<NotificationBell />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Notifications (1)' }))
    expect(await screen.findByText(/New signup pending approval/)).toBeInTheDocument()
    await userEvent.setup().click(await screen.findByRole('button', { name: /Approve as collector/i }))

    await waitFor(() => expect(approve).toHaveBeenCalledWith('pending-user-1', { role: 'COLLECTOR' }))
    expect(await screen.findByText(/New Collector approved as collector/i)).toBeInTheDocument()
  })
})
