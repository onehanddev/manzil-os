import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReportsPage } from './reports'

describe('ReportsPage - push notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers an explicit admin push subscription from the Reports header', async () => {
    const subscribe = vi.fn()
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue({
          endpoint: 'https://push.example.test/device-1',
          toJSON: () => ({
            endpoint: 'https://push.example.test/device-1',
            keys: { p256dh: 'browser-public-key', auth: 'browser-auth-secret' },
          }),
        }),
      },
    }
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') })
    vi.stubGlobal('PushManager', class PushManager {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(registration) },
    })
    server.use(
      http.get('*/api/push/vapid_public_key', () => HttpResponse.json({ public_key: 'BEl6sQFKyXNHndYpQW6VfA' })),
      http.post('*/api/push/subscribe', async ({ request }) => {
        subscribe(await request.json())
        return HttpResponse.json({ id: 'subscription-1', endpoint: 'https://push.example.test/device-1' }, { status: 201 })
      }),
    )

    renderWithProviders(<ReportsPage />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enable notifications' }))

    await waitFor(() => {
      expect(subscribe).toHaveBeenCalledWith({
        endpoint: 'https://push.example.test/device-1',
        keys: { p256dh: 'browser-public-key', auth: 'browser-auth-secret' },
      })
    })
    expect(screen.getByRole('button', { name: 'Notifications enabled' })).toBeInTheDocument()
  })

  it('opens the pushed daily-report deep link on today\'s cashbook range', async () => {
    let requestedRange = ''
    server.use(
      http.get('*/api/reports/cashbook', ({ request }) => {
        requestedRange = new URL(request.url).search
        return HttpResponse.json({
          society: { id: 'society-1', name: 'Manzil Pilot Society' },
          from: new URL(request.url).searchParams.get('from'),
          to: new URL(request.url).searchParams.get('to'),
          opening: 0,
          total_receipts: 0,
          total_expenses: 0,
          closing: 0,
          receipts: [],
          expenses: [],
        })
      }),
    )

    renderWithProviders(<ReportsPage />, { route: '/reports?from=today&to=today' })

    await waitFor(() => {
      expect(requestedRange).toBe(`?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`)
    })
  })
})
