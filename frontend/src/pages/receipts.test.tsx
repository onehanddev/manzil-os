import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReceiptsPage } from './receipts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReceiptsPage — maintenance_amount prefill (TDD)', () => {
  it('prefills amount with flat category default when flat is selected, leaves empty if no default', async () => {
    const user = userEvent.setup()
    const flats = [
      { id: 'flat-1', flat_number: 'A-101', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1800, category_maintenance_amount: 1800, flat_category: { id: 'cat-1', name: '1 BHK', maintenance_amount: 1800 } },
      { id: 'flat-2', flat_number: 'B-202', flat_category_id: 'cat-2', is_active: true, maintenance_amount: null, category_maintenance_amount: null, flat_category: { id: 'cat-2', name: '2 BHK', maintenance_amount: null } },
    ]
    const categories = [
      { id: 'cat-1', name: '1 BHK', is_active: true, maintenance_amount: 1800 },
      { id: 'cat-2', name: '2 BHK', is_active: true, maintenance_amount: null },
    ]
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories })),
      http.get('*/api/persons', () => HttpResponse.json({ persons: [] })),
      http.get('*/api/flats/flat-1', () => HttpResponse.json(flats[0])),
      http.get('*/api/flats/flat-2', () => HttpResponse.json(flats[1])),
    )

    renderWithProviders(<ReceiptsPage />)

    // amount input should exist and be empty before flat selection
    const amountInput = await screen.findByLabelText(/Amount/i)
    expect(amountInput).toBeInTheDocument()
    expect(amountInput).toHaveValue('')

    // select flat with default -> amount prefills to 1800
    await user.click(screen.getByRole('combobox', { name: /Flat/i }))
    await user.click(await screen.findByText(/A-101/))
    expect(amountInput).toHaveValue('1800')

    // select flat with no default -> amount clears (empty)
    await user.click(screen.getByRole('combobox', { name: /Flat/i }))
    await user.click(await screen.findByText(/B-202/))
    expect(amountInput).toHaveValue('')
  })

  it('allows overriding prefilled amount', async () => {
    const user = userEvent.setup()
    const flats = [
      { id: 'flat-1', flat_number: 'A-101', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1500 },
    ]
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [{ id: 'cat-1', name: '1 BHK', is_active: true, maintenance_amount: 1500 }] })),
      http.get('*/api/persons', () => HttpResponse.json({ persons: [] })),
    )
    renderWithProviders(<ReceiptsPage />)
    const amountInput = await screen.findByLabelText(/Amount/i)
    await user.click(screen.getByRole('combobox', { name: /Flat/i }))
    await user.click(await screen.findByText(/A-101/))
    expect(amountInput).toHaveValue('1500')
    await user.clear(amountInput)
    await user.type(amountInput, '2000')
    expect(amountInput).toHaveValue('2000')
  })

  it('announces lost connectivity and blocks recording until the device is online', async () => {
    let isOnline = true
    vi.stubGlobal('navigator', { ...navigator, get onLine() { return isOnline } })
    renderWithProviders(<ReceiptsPage />)

    isOnline = false
    act(() => window.dispatchEvent(new Event('offline')))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'You’re offline. Financial entries can’t be recorded.',
    )
    expect(screen.getByRole('button', { name: /Record receipt/i })).toBeDisabled()

    isOnline = true
    act(() => window.dispatchEvent(new Event('online')))

    await waitFor(() => expect(screen.queryByText(/You’re offline/i)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Record receipt/i })).toBeEnabled()
  })

  it('shows official receipt number, PDF action, WhatsApp status, and resend action', async () => {
    const user = userEvent.setup()
    let resendCalled = false
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats: [] })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', () => HttpResponse.json({
        receipts: [
          {
            id: 'receipt-13',
            flat_id: 'flat-1010000',
            amount: 1500,
            business_date: '2026-04-02',
            type: 'REGULAR',
            status: 'POSTED',
            receipt_number: 'MANZIL/26-27/00001',
            public_pdf_url: '/receipts/receipt-13/pdf?token=public-token-13',
            whatsapp_status: 'LOGGED',
            whatsapp_failure_reason: null,
            collected_by: 'membership-admin',
          },
        ],
      })),
      http.post('*/api/receipts/receipt-13/whatsapp-resend', () => {
        resendCalled = true
        return HttpResponse.json({ id: 'notif-13', status: 'LOGGED', provider_mode: 'test' }, { status: 201 })
      }),
    )

    renderWithProviders(<ReceiptsPage />)

    await user.click(screen.getByRole('tab', { name: /Activity/i }))
    expect(await screen.findByText('MANZIL/26-27/00001')).toBeInTheDocument()
    // open detail sheet — PDF/WhatsApp are now inside the sheet per Slice 2
    await user.click(screen.getByRole('button', { name: /MANZIL\/26-27\/00001/i }))
    const dialog = await screen.findByRole('dialog')
    const { within } = await import('@testing-library/react')
    expect(within(dialog).getByRole('link', { name: /Download PDF/i })).toHaveAttribute('href', 'http://localhost:8000/receipts/receipt-13/pdf?token=public-token-13')
    expect(within(dialog).getByText(/queued/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Resend WhatsApp/i }))
    expect(resendCalled).toBe(true)
  })
})
