import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { FlatCategoriesPage } from './flat-categories'

describe('FlatCategoriesPage', () => {
  it('edits the maintenance default and confirms deactivation impact', async () => {
    let category = { id: 'category-1', name: '2 BHK', is_active: true, maintenance_amount: 2500 }
    server.use(
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [category] })),
      http.patch('*/api/flat-categories/category-1', async ({ request }) => {
        const body = await request.json() as { maintenance_amount?: number; is_active?: boolean }
        category = { ...category, ...body }
        return HttpResponse.json(category)
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: /2 BHK/ }))
    const amount = screen.getByLabelText('Default maintenance amount')
    await user.clear(amount)
    await user.type(amount, '3000')
    await user.click(screen.getByRole('button', { name: 'Save default amount' }))
    expect(await screen.findByText('₹3,000 default')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /2 BHK/ }))
    await user.click(screen.getByRole('button', { name: 'Deactivate category' }))
    expect(await screen.findByText(/Existing flats keep this category/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('Inactive')).toBeInTheDocument()
  })

  it('keeps deactivation open and explains a request failure', async () => {
    const category = { id: 'category-1', name: '2 BHK', is_active: true, maintenance_amount: 2500 }
    server.use(
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [category] })),
      http.patch('*/api/flat-categories/category-1', () => HttpResponse.json({ detail: 'Category update unavailable' }, { status: 500 })),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: /2 BHK/ }))
    await user.click(screen.getByRole('button', { name: 'Deactivate category' }))
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Category update unavailable')
    expect(screen.getByRole('alertdialog', { name: 'Deactivate 2 BHK?' })).toBeInTheDocument()
  })
})
