import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ReceiptsPage } from './receipts'

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
      http.get('/api/flats', () => HttpResponse.json({ flats })),
      http.get('/api/flat-categories', () => HttpResponse.json({ categories })),
      http.get('/api/persons', () => HttpResponse.json({ persons: [] })),
      http.get('/api/flats/flat-1', () => HttpResponse.json(flats[0])),
      http.get('/api/flats/flat-2', () => HttpResponse.json(flats[1])),
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
      http.get('/api/flats', () => HttpResponse.json({ flats })),
      http.get('/api/flat-categories', () => HttpResponse.json({ categories: [{ id: 'cat-1', name: '1 BHK', is_active: true, maintenance_amount: 1500 }] })),
      http.get('/api/persons', () => HttpResponse.json({ persons: [] })),
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
})
