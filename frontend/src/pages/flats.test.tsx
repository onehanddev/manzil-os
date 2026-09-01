import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { FlatsPage } from './flats'

const category = {
  id: 'cat-1',
  name: '2 BHK',
  is_active: true,
  maintenance_amount: 2500,
}

const flat = {
  id: 'flat-1',
  flat_number: 'A-101',
  flat_category_id: category.id,
  is_active: true,
  maintenance_amount: 2500,
  flat_category: category,
  owner: { id: 'person-owner', name: 'Asha Shah', mobile: '9000000001' },
  tenant: null,
  default_payer: {
    person: { id: 'person-owner', name: 'Asha Shah', mobile: '9000000001' },
    role: 'OWNER',
  },
  opening_due: 4000,
  total_paid: 1500,
  current_due: 2500,
}

function useFlatFixtures() {
  server.use(
    http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [category] })),
    http.get('*/api/flats', () => HttpResponse.json({
      flats: [
        flat,
        { ...flat, id: 'flat-2', flat_number: 'B-202', owner: null, default_payer: null },
      ],
    })),
    http.get('*/api/persons', () => HttpResponse.json({
      persons: [flat.owner, { id: 'person-tenant', name: 'Ravi Mehta', mobile: '9000000002' }],
    })),
    http.get('*/api/flats/flat-1/ledger', () => HttpResponse.json({
      flat_id: flat.id,
      flat_number: flat.flat_number,
      opening_due: 4000,
      total_paid: 1500,
      current_due: 2500,
      entries: [
        { type: 'OPENING', business_date: null, amount: 4000, narration: 'Opening due', running_due: 4000 },
        { type: 'REGULAR', business_date: '2026-08-31', amount: 1500, narration: null, running_due: 2500 },
      ],
    })),
  )
}

describe('FlatsPage — searchable setup and contextual detail', () => {
  it('searches flats and opens occupants, dues, and ledger from the full row', async () => {
    useFlatFixtures()
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    const search = await screen.findByRole('searchbox', { name: 'Search flats' })
    await user.type(search, 'A-101')

    expect(screen.getByRole('button', { name: /A-101/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /B-202/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /A-101/ }))
    const detail = await screen.findByRole('dialog', { name: 'Flat A-101' })

    expect(within(detail).getByText('Asha Shah')).toBeInTheDocument()
    expect(within(detail).getByText('Default payer')).toBeInTheDocument()
    expect(within(detail).getAllByText('₹2,500').length).toBeGreaterThan(0)
    expect(within(detail).getByText('31 Aug 2026')).toBeInTheDocument()
    expect(within(detail).queryByText(/flat-1/)).not.toBeInTheDocument()
  })

  it('adds a tenant from flat detail and immediately shows the new default payer', async () => {
    useFlatFixtures()
    let assigned = false
    server.use(
      http.post('*/api/flats/flat-1/occupants', async ({ request }) => {
        const body = await request.json() as { person_id: string; role: string }
        expect(body).toEqual({ person_id: 'person-tenant', role: 'TENANT' })
        assigned = true
        return HttpResponse.json({ id: 'occ-1', ...body }, { status: 201 })
      }),
      http.get('*/api/flats', () => HttpResponse.json({
        flats: [{
          ...flat,
          tenant: assigned ? { id: 'person-tenant', name: 'Ravi Mehta', mobile: '9000000002' } : null,
          default_payer: assigned ? {
            person: { id: 'person-tenant', name: 'Ravi Mehta', mobile: '9000000002' },
            role: 'TENANT',
          } : flat.default_payer,
        }],
      })),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    await user.click(await screen.findByRole('button', { name: /A-101/ }))
    await user.click(screen.getByRole('button', { name: 'Add tenant' }))
    await user.click(screen.getByRole('combobox', { name: 'Person' }))
    await user.click(await screen.findByRole('option', { name: /Ravi Mehta/ }))
    await user.click(screen.getByRole('button', { name: 'Add tenant' }))

    const detail = await screen.findByRole('dialog', { name: 'Flat A-101' })
    expect(await within(detail).findByText('Ravi Mehta')).toBeInTheDocument()
    expect(within(detail).getByText('Tenant · Default payer')).toBeInTheDocument()
  })

  it('updates opening due from flat detail and refreshes visible totals', async () => {
    useFlatFixtures()
    let openingDue = 4000
    server.use(
      http.get('*/api/flats', () => HttpResponse.json({
        flats: [{ ...flat, opening_due: openingDue, current_due: openingDue - 1500 }],
      })),
      http.put('*/api/flats/flat-1/opening-due', async ({ request }) => {
        const body = await request.json() as { amount: number }
        openingDue = body.amount
        return HttpResponse.json({ flat_id: flat.id, amount: openingDue })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    await user.click(await screen.findByRole('button', { name: /A-101/ }))
    await user.click(screen.getByRole('button', { name: 'Edit opening due' }))
    const amount = screen.getByLabelText('Opening due')
    await user.clear(amount)
    await user.type(amount, '5000')
    await user.click(screen.getByRole('button', { name: 'Save opening due' }))

    const detail = await screen.findByRole('dialog', { name: 'Flat A-101' })
    expect(await within(detail).findByText('₹5,000')).toBeInTheDocument()
    expect(within(detail).getAllByText('₹3,500').length).toBeGreaterThan(0)
  })

  it('creates a flat from a focused sheet and shows it in the list', async () => {
    let flats = [flat]
    server.use(
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [category] })),
      http.get('*/api/flats', () => HttpResponse.json({ flats })),
      http.get('*/api/persons', () => HttpResponse.json({ persons: [] })),
      http.post('*/api/flats', async ({ request }) => {
        const body = await request.json() as { flat_number: string; flat_category_id: string }
        flats = [...flats, { ...flat, id: 'flat-new', flat_number: body.flat_number, flat_category_id: body.flat_category_id }]
        return HttpResponse.json(flats.at(-1), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    await user.click(await screen.findByRole('button', { name: 'Add flat' }))
    await user.type(screen.getByLabelText('Flat number'), 'C-303')
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: /2 BHK/ }))
    await user.click(screen.getByRole('button', { name: 'Create flat' }))

    expect(await screen.findByRole('button', { name: /C-303/ })).toBeInTheDocument()
  })

  it('keeps failures distinct from a truthful empty state', async () => {
    server.use(
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [] })),
      http.get('*/api/flats', () => HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })),
      http.get('*/api/persons', () => HttpResponse.json({ persons: [] })),
    )
    renderWithProviders(<FlatsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Flats could not be loaded')
    expect(screen.queryByText('No flats yet')).not.toBeInTheDocument()
  })

  it('preserves flat values when creation fails', async () => {
    server.use(
      http.get('*/api/flat-categories', () => HttpResponse.json({ categories: [category] })),
      http.get('*/api/flats', () => HttpResponse.json({ flats: [] })),
      http.get('*/api/persons', () => HttpResponse.json({ persons: [] })),
      http.post('*/api/flats', () => HttpResponse.json({ detail: 'Flat number already exists' }, { status: 409 })),
    )
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    await user.click(await screen.findByRole('button', { name: 'Add flat' }))
    await user.type(screen.getByLabelText('Flat number'), 'A-101')
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: /2 BHK/ }))
    await user.click(screen.getByRole('button', { name: 'Create flat' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Flat number already exists')
    expect(screen.getByLabelText('Flat number')).toHaveValue('A-101')
  })

  it('exports the existing flat dues workbook', async () => {
    useFlatFixtures()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    server.use(http.get('*/api/reports/flat-dues.xlsx', () => HttpResponse.arrayBuffer(new ArrayBuffer(8))))
    const user = userEvent.setup()
    renderWithProviders(<FlatsPage />)

    await user.click(await screen.findByRole('button', { name: 'Export dues' }))

    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    click.mockRestore()
  })
})
