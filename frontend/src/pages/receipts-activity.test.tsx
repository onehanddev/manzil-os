import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReceiptsPage } from './receipts'

const flats = [
  { id: 'flat-101-id-0001', flat_number: 'A-101', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1500 },
  { id: 'flat-102-id-0002', flat_number: 'B-202', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1500 },
]

describe('ReceiptsPage — Slice 2: Receipt Activity And Safe Corrections', () => {
  it('activity rows show human-readable flat, formatted amount, date, and plain status — not UUID fragments', async () => {
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', () =>
        HttpResponse.json({
          receipts: [
            {
              id: 'receipt-1',
              flat_id: 'flat-101-id-0001',
              amount: 1500,
              business_date: '2026-08-31',
              type: 'REGULAR',
              status: 'POSTED',
              receipt_number: 'MANZIL/26-27/00001',
              narration: 'August maintenance',
              collected_by: 'membership-collector-1',
              payer_person_id: null,
              fund_id: 'fund-main',
            },
          ],
        }),
      ),
    )
    renderWithProviders(<ReceiptsPage />)

    // flat number appears, UUID fragment does not
    expect(await screen.findByText(/A-101/)).toBeInTheDocument()
    expect(screen.queryByText(/flat-101/)).not.toBeInTheDocument()
    expect(screen.queryByText(/flat_id/)).not.toBeInTheDocument()

    // formatted currency
    expect(screen.getByText(/₹1,500/)).toBeInTheDocument()

    // plain-language status Recorded (not POSTED, not UUID)
    expect(screen.getByText(/Recorded/)).toBeInTheDocument()
    expect(screen.queryByText(/\bPOSTED\b/)).not.toBeInTheDocument()

    // human date (31 Aug 2026 or Aug 31)
    expect(screen.getByText(/31 Aug 2026|Aug 31|31 Aug/i)).toBeInTheDocument()

    // collector fallback not showing raw slice without label — should have Recorded by or Collector label
    // Ensure we don't leak the raw collector UUID fragment as the primary text
    const row = screen.getByText(/A-101/).closest('div')?.parentElement ?? document.body
    expect(row.textContent).not.toMatch(/membership-collector-1/)
  })

  it('tapping a receipt opens a detail sheet with human-readable fields and share actions', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', () =>
        HttpResponse.json({
          receipts: [
            {
              id: 'receipt-detail-1',
              flat_id: 'flat-101-id-0001',
              amount: 1800,
              business_date: '2026-08-31',
              type: 'REGULAR',
              status: 'POSTED',
              receipt_number: 'MANZIL/26-27/00042',
              narration: 'August dues',
              collected_by: 'membership-1',
              payer_person_id: null,
              fund_id: 'fund-main',
              public_pdf_url: '/receipts/receipt-detail-1/pdf?token=tok123',
              whatsapp_status: 'DELIVERED',
            },
          ],
        }),
      ),
    )
    renderWithProviders(<ReceiptsPage />)

    // find row and click it
    const row = await screen.findByRole('button', { name: /A-101.*₹1,800|View receipt|MANZIL\/26-27\/00042/i })
      .catch(() => screen.findByText(/A-101/))
    const clickable = await screen.findByText(/A-101/)
    await user.click(clickable)

    // detail sheet appears
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(/MANZIL\/26-27\/00042/)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(/₹1,800/)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(/31 Aug 2026|Aug 31/i)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: /Download PDF/i })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Resend WhatsApp/i })).toBeInTheDocument()
  })

  it('void requires confirmation sheet with reason and impact text — no one-tap Undo', async () => {
    const user = userEvent.setup()
    let voidCalled = false
    let voidBody: unknown = null
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', () =>
        HttpResponse.json({
          receipts: [
            {
              id: 'receipt-void-1',
              flat_id: 'flat-101-id-0001',
              amount: 1500,
              business_date: '2026-08-31',
              type: 'REGULAR',
              status: 'POSTED',
              receipt_number: 'MANZIL/26-27/00099',
              collected_by: 'membership-1',
              fund_id: 'fund-main',
            },
          ],
        }),
      ),
      http.post('*/api/receipts/:id/void', async ({ request }) => {
        voidCalled = true
        voidBody = await request.json()
        return HttpResponse.json({ id: 'receipt-void-1', status: 'VOIDED' })
      }),
      http.post('*/api/receipts/:id/undo', async ({ request }) => {
        voidCalled = true
        voidBody = await request.json()
        return HttpResponse.json({ id: 'receipt-void-1', status: 'VOIDED' })
      }),
    )
    renderWithProviders(<ReceiptsPage />)

    await screen.findByText(/A-101/)
    // open detail
    await user.click(screen.getByText(/A-101/))
    const dialog = await screen.findByRole('dialog')

    // No one-tap "Undo" in history list — must be inside detail and labelled Void receipt
    expect(screen.queryByRole('button', { name: /^Undo$/i })).not.toBeInTheDocument()
    const voidBtn = within(dialog).getByRole('button', { name: /Void receipt/i })
    expect(voidBtn).toBeInTheDocument()

    await user.click(voidBtn)

    // confirmation sheet appears with impact text and reason field
    const confirm = await screen.findByRole('dialog', { name: /Void receipt/i })
      .catch(() => screen.findByText(/Void receipt\?/))
    // need to handle nested dialogs — use getAll
    const dialogs = screen.getAllByRole('dialog')
    const confirmDialog = dialogs[dialogs.length - 1]
    expect(within(confirmDialog).getByText(/This will remove.*totals|excluded from totals|keep history/i)).toBeInTheDocument()
    const reasonInput = within(confirmDialog).getByLabelText(/Reason/i)
    expect(reasonInput).toBeInTheDocument()

    // Void button disabled until reason entered
    const confirmVoidBtn = within(confirmDialog).getByRole('button', { name: /^Void$/i })
    expect(confirmVoidBtn).toBeDisabled()

    await user.type(reasonInput, 'Entered wrong amount')
    expect(confirmVoidBtn).toBeEnabled()

    await user.click(confirmVoidBtn)

    await waitFor(() => expect(voidCalled).toBe(true))
    expect(voidBody).toEqual(expect.objectContaining({ reason: 'Entered wrong amount' }))
  })

  it('filter sheet opens from Filters button and Apply filters updates listing', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', ({ request }) => {
        const url = new URL(request.url)
        const flatId = url.searchParams.get('flat_id')
        const all = [
          { id: 'r1', flat_id: 'flat-101-id-0001', amount: 1500, business_date: '2026-08-31', type: 'REGULAR', status: 'POSTED', receipt_number: 'MANZIL/26-27/00001', collected_by: 'm1', fund_id: 'fund-main' },
          { id: 'r2', flat_id: 'flat-102-id-0002', amount: 1600, business_date: '2026-08-31', type: 'REGULAR', status: 'POSTED', receipt_number: 'MANZIL/26-27/00002', collected_by: 'm1', fund_id: 'fund-main' },
        ]
        const filtered = flatId ? all.filter((r) => r.flat_id === flatId) : all
        return HttpResponse.json({ receipts: filtered })
      }),
    )
    renderWithProviders(<ReceiptsPage />)

    expect(await screen.findByText(/A-101/)).toBeInTheDocument()
    expect(screen.getByText(/B-202/)).toBeInTheDocument()

    // Filters button opens bottom sheet
    const filtersBtn = screen.getByRole('button', { name: /Filters/i })
    await user.click(filtersBtn)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/Unit|Flat/i)).toBeInTheDocument()

    // select B-202 filter and apply
    await user.click(screen.getByRole('combobox', { name: /Unit|Flat/i }))
    await user.click(await screen.findByText('B-202'))
    await user.click(screen.getByRole('button', { name: /Apply filters/i }))

    await waitFor(() => {
      expect(screen.getByText(/B-202/)).toBeInTheDocument()
      expect(screen.queryByText(/A-101/)).not.toBeInTheDocument()
    })
  })

  it('resend WhatsApp is available from detail sheet', async () => {
    const user = userEvent.setup()
    let resendCalled = false
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/funds', () => HttpResponse.json({ funds: [{ id: 'fund-main', name: 'Main Fund', is_active: true }] })),
      http.get('*/api/receipts', () =>
        HttpResponse.json({
          receipts: [
            { id: 'receipt-resend-1', flat_id: 'flat-101-id-0001', amount: 1500, business_date: '2026-08-31', type: 'REGULAR', status: 'POSTED', receipt_number: 'MANZIL/26-27/00010', collected_by: 'm1', fund_id: 'fund-main' },
          ],
        }),
      ),
      http.post('*/api/receipts/receipt-resend-1/whatsapp-resend', () => {
        resendCalled = true
        return HttpResponse.json({ id: 'notif-1', status: 'LOGGED' }, { status: 201 })
      }),
    )
    renderWithProviders(<ReceiptsPage />)
    await user.click(await screen.findByText(/A-101/))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Resend WhatsApp/i }))
    await waitFor(() => expect(resendCalled).toBe(true))
  })
})
