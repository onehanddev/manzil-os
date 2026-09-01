import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ExpenseCategoriesPage, FundsPage, VendorsPage } from './funds'

describe('Financial configuration destinations', () => {
  it('searches funds and creates one from a focused sheet', async () => {
    let funds = [
      { id: 'fund-main', name: 'Main Fund', is_active: true },
      { id: 'fund-sinking', name: 'Sinking Fund', is_active: true },
    ]
    server.use(
      http.get('*/api/funds', () => HttpResponse.json({ funds })),
      http.post('*/api/funds', async ({ request }) => {
        const body = await request.json() as { name: string }
        const fund = { id: 'fund-repair', name: body.name, is_active: true }
        funds = [...funds, fund]
        return HttpResponse.json(fund, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FundsPage />)

    await user.type(await screen.findByRole('searchbox', { name: 'Search funds' }), 'Main')
    expect(screen.getByText('Main Fund')).toBeInTheDocument()
    expect(screen.queryByText('Sinking Fund')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search funds' }))
    await user.click(screen.getByRole('button', { name: 'Add fund' }))
    await user.type(screen.getByLabelText('Fund name'), 'Repair Fund')
    await user.click(screen.getByRole('button', { name: 'Create fund' }))

    expect(await screen.findByText('Repair Fund')).toBeInTheDocument()
  })

  it('creates a vendor without exposing unrelated configuration tabs', async () => {
    let vendors: { id: string; name: string; contact_info: string | null; is_active: boolean }[] = []
    server.use(
      http.get('*/api/vendors', () => HttpResponse.json({ vendors })),
      http.post('*/api/vendors', async ({ request }) => {
        const body = await request.json() as { name: string; contact_info?: string }
        const vendor = { id: 'vendor-1', name: body.name, contact_info: body.contact_info ?? null, is_active: true }
        vendors = [vendor]
        return HttpResponse.json(vendor, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<VendorsPage />)

    expect(await screen.findByText('No vendors yet')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add vendor' }))
    await user.type(screen.getByLabelText('Vendor name'), 'Lift Care')
    await user.type(screen.getByLabelText('Contact information'), '9000000099')
    await user.click(screen.getByRole('button', { name: 'Create vendor' }))

    expect(await screen.findByText('Lift Care')).toBeInTheDocument()
    expect(screen.getByText('9000000099')).toBeInTheDocument()
  })

  it('creates an expense category on its dedicated destination', async () => {
    let categories = [{ id: 'category-1', name: 'Electricity', is_active: true }]
    server.use(
      http.get('*/api/expense-categories', () => HttpResponse.json({ categories })),
      http.post('*/api/expense-categories', async ({ request }) => {
        const body = await request.json() as { name: string }
        const category = { id: 'category-2', name: body.name, is_active: true }
        categories = [...categories, category]
        return HttpResponse.json(category, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ExpenseCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Add expense category' }))
    await user.type(screen.getByLabelText('Category name'), 'Water')
    await user.click(screen.getByRole('button', { name: 'Create expense category' }))

    expect(await screen.findByText('Water')).toBeInTheDocument()
  })
})
