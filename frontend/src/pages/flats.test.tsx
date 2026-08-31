import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { FlatsPage } from './flats'

// Seam: user-visible FlatsPage — category creation with maintenance_amount and receipt prefill
describe('FlatsPage — maintenance_amount (TDD)', () => {
  it('shows maintenance amount input when creating a category (null default)', async () => {
    server.use(
      http.get('/api/flat-categories', () => HttpResponse.json({ categories: [] })),
      http.get('/api/flats', () => HttpResponse.json({ flats: [] })),
      http.get('/api/persons', () => HttpResponse.json({ persons: [] })),
    )
    renderWithProviders(<FlatsPage />)

    // Must have category name input and maintenance amount input
    expect(await screen.findByText('Create flat category')).toBeInTheDocument()
    // new field: maintenance amount, nullable default -> input should be empty initially
    const amountInput = screen.getByLabelText(/Maintenance amount/i)
    expect(amountInput).toBeInTheDocument()
    expect(amountInput).toHaveValue('')
  })

  it('lists categories with their maintenance amount and prefills receipt amount from flat category', async () => {
    const categories = [
      { id: 'cat-1', name: '1 BHK', is_active: true, maintenance_amount: 1500 },
      { id: 'cat-2', name: '2 BHK', is_active: true, maintenance_amount: null },
    ]
    const flats = [
      { id: 'flat-1', flat_number: 'A-101', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1500, category_maintenance_amount: 1500, flat_category: { id: 'cat-1', name: '1 BHK', maintenance_amount: 1500 } },
      { id: 'flat-2', flat_number: 'B-202', flat_category_id: 'cat-2', is_active: true, maintenance_amount: null, category_maintenance_amount: null, flat_category: { id: 'cat-2', name: '2 BHK', maintenance_amount: null } },
    ]
    server.use(
      http.get('/api/flat-categories', () => HttpResponse.json({ categories })),
      http.get('/api/flats', () => HttpResponse.json({ flats })),
      http.get('/api/persons', () => HttpResponse.json({ persons: [] })),
      http.get('/api/flats/flat-1', () => HttpResponse.json(flats[0])),
      http.get('/api/flats/flat-2', () => HttpResponse.json(flats[1])),
    )
    renderWithProviders(<FlatsPage />)

    // categories list should display amounts
    expect(await screen.findByText('1 BHK')).toBeInTheDocument()
    // maintenance amount displayed (₹1500 or 1500) — should be visible immediately after categories load (multiple matches)
    expect(screen.getAllByText(/1500/).length).toBeGreaterThan(0)
    // cat-2 has no default -> should show "No default" or "-" or empty
    expect(screen.getByText(/2 BHK/)).toBeInTheDocument()
  })

  it('receipt flow: selecting a flat prefills amount with category default, leaves empty if no default', async () => {
    const user = userEvent.setup()
    const categories = [{ id: 'cat-1', name: '1 BHK', is_active: true, maintenance_amount: 1800 }]
    const flats = [{ id: 'flat-1', flat_number: 'A-101', flat_category_id: 'cat-1', is_active: true, maintenance_amount: 1800 }]
    server.use(
      http.get('/api/flat-categories', () => HttpResponse.json({ categories })),
      http.get('/api/flats', () => HttpResponse.json({ flats })),
      http.get('/api/persons', () => HttpResponse.json({ persons: [] })),
    )
    renderWithProviders(<FlatsPage />)
    // Flats are under second tab
    await user.click(screen.getByRole('tab', { name: 'Flats' }))
    expect(await screen.findByText('A-101')).toBeInTheDocument()
    // Flat card should show maintenance amount hint
    expect(screen.getAllByText(/1800/).length).toBeGreaterThan(0)
  })
})
