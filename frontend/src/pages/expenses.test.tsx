import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { ExpensesPage } from './expenses'

const funds = [
  { id: 'fund-main', name: 'Main Fund', is_active: true },
  { id: 'fund-sinking', name: 'Sinking Fund', is_active: true },
]
const categories = [
  { id: 'cat-electricity', name: 'Electricity', is_active: true },
  { id: 'cat-salary', name: 'Salary', is_active: true },
]
const initialVendors = [{ id: 'vendor-msedcl', name: 'MSEDCL', is_active: true }]

type ExpenseRecord = {
  id: string
  business_date: string
  amount: number
  fund_id: string
  category_id: string
  vendor_id: string
  narration: string
  created_by: string
  created_at: string
}

function mockHandlers(initialExpenses: ExpenseRecord[] = []) {
  const expenses = [...initialExpenses]
  const vendors = [...initialVendors]
  const submittedBodies: Record<string, unknown>[] = []
  server.use(
    http.get('*/api/funds', () => HttpResponse.json({ funds })),
    http.get('*/api/expense-categories', () => HttpResponse.json({ categories, expense_categories: categories })),
    http.get('*/api/vendors', () => HttpResponse.json({ vendors })),
    http.get('*/api/expenses', ({ request }) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from')
      const fundId = url.searchParams.get('fund_id')
      return HttpResponse.json({
        expenses: expenses.filter((expense) => (!from || expense.business_date >= from) && (!fundId || expense.fund_id === fundId)),
      })
    }),
    http.post('*/api/expenses', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      submittedBodies.push(body)
      let vendorId = body.vendor_id as string | undefined
      if (!vendorId) {
        const name = String(body.vendor_name)
        const existing = vendors.find((vendor) => vendor.name.toLowerCase() === name.toLowerCase())
        if (existing) vendorId = existing.id
        else {
          vendorId = `vendor-${vendors.length + 1}`
          vendors.push({ id: vendorId, name, is_active: true })
        }
      }
      const expense: ExpenseRecord = {
        id: `expense-${expenses.length + 1}`,
        business_date: String(body.business_date),
        amount: Number(body.amount),
        fund_id: String(body.fund_id),
        category_id: String(body.category_id),
        vendor_id: vendorId,
        narration: String(body.narration),
        created_by: 'membership-private-id',
        created_at: '2099-06-10T10:30:00Z',
      }
      expenses.push(expense)
      return HttpResponse.json(expense, { status: 201 })
    }),
  )
  return { expenses, submittedBodies, vendors }
}

async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Details/i }))
}

describe('ExpensesPage Slice 3', () => {
  it('requires complete expense details and records an existing vendor', async () => {
    const user = userEvent.setup()
    const { submittedBodies } = mockHandlers()
    renderWithProviders(<ExpensesPage />)

    await user.type(await screen.findByLabelText(/^Amount$/i), '1234')
    await user.click(screen.getByRole('combobox', { name: /^Vendor$/i }))
    await user.click(await screen.findByRole('option', { name: 'MSEDCL' }))
    await user.click(screen.getByRole('button', { name: /Record/i }))

    expect(await screen.findByText('Enter a narration')).toBeInTheDocument()
    expect(submittedBodies).toHaveLength(0)

    await user.type(screen.getByLabelText(/Narration/i), 'June electricity bill')
    await user.click(screen.getByRole('button', { name: /Record/i }))

    await waitFor(() => expect(submittedBodies[0]).toMatchObject({
      amount: 1234,
      vendor_id: 'vendor-msedcl',
      narration: 'June electricity bill',
    }))
    const success = await screen.findByRole('dialog', { name: /Expense recorded/i })
    expect(within(success).getByText('₹1,234')).toBeInTheDocument()
    expect(within(success).getByText('MSEDCL')).toBeInTheDocument()
    expect(within(success).getByText(/Expense expense-/i)).toBeInTheDocument()
  })

  it('creates a vendor explicitly inline and persists the expense in Activity', async () => {
    const user = userEvent.setup()
    const { expenses, submittedBodies, vendors } = mockHandlers()
    renderWithProviders(<ExpensesPage />)

    await user.type(await screen.findByLabelText(/^Amount$/i), '875')
    await user.click(screen.getByRole('combobox', { name: /^Vendor$/i }))
    await user.type(await screen.findByPlaceholderText(/Search vendor/i), 'Fresh Services')
    await user.click(screen.getByRole('option', { name: 'Create “Fresh Services”' }))
    await user.click(screen.getByRole('button', { name: /^Details/i }))
    await user.type(screen.getByLabelText(/Narration/i), 'Water tank cleaning')
    await user.click(screen.getByRole('button', { name: /Record ₹875/i }))

    const success = await screen.findByRole('dialog', { name: /Expense recorded/i })
    expect(within(success).getByText('Fresh Services')).toBeInTheDocument()
    expect(submittedBodies[0]).toMatchObject({ vendor_name: 'Fresh Services' })
    expect(vendors.filter((vendor) => vendor.name === 'Fresh Services')).toHaveLength(1)
    expect(expenses).toHaveLength(1)

    await user.click(within(success).getByRole('button', { name: /View activity/i }))
    expect(await screen.findByRole('button', { name: /Fresh Services paid ₹875/i })).toBeInTheDocument()
  })

  it('keeps entered values and explains how to recover when recording fails', async () => {
    const user = userEvent.setup()
    mockHandlers()
    server.use(http.post('*/api/expenses', () => HttpResponse.json({ detail: 'database exploded' }, { status: 500 })))
    renderWithProviders(<ExpensesPage />)

    await user.type(await screen.findByLabelText(/^Amount$/i), '640')
    await user.click(screen.getByRole('combobox', { name: /^Vendor$/i }))
    await user.click(await screen.findByRole('option', { name: 'MSEDCL' }))
    await openDetails(user)
    await user.type(screen.getByLabelText(/Narration/i), 'Failed expense remains')
    await user.click(screen.getByRole('button', { name: /Record ₹640/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your connection and try again/i)
    expect(screen.getByLabelText(/^Amount$/i)).toHaveValue('640')
    expect(screen.getByLabelText(/Narration/i)).toHaveValue('Failed expense remains')
    expect(screen.getByRole('combobox', { name: /^Vendor$/i })).toHaveTextContent('MSEDCL')
  })

  it('shows human-readable, actionable expense rows without leaking internal IDs', async () => {
    const user = userEvent.setup()
    mockHandlers([{
      id: 'expense-private-id',
      business_date: '2099-06-18',
      amount: 777,
      fund_id: 'fund-main',
      category_id: 'cat-electricity',
      vendor_id: 'vendor-msedcl',
      narration: 'Electricity bill',
      created_by: 'membership-private-id',
      created_at: '2099-06-18T10:30:00Z',
    }])
    renderWithProviders(<ExpensesPage />)
    await user.click(screen.getByRole('tab', { name: /Activity/i }))

    const row = await screen.findByRole('button', { name: /MSEDCL paid ₹777 on 18 Jun 2099/i })
    expect(row).toHaveTextContent('Paid')
    expect(row).toHaveTextContent('−₹777')
    expect(screen.queryByText('membership-private-id')).not.toBeInTheDocument()
    expect(screen.queryByText('cat-electricity')).not.toBeInTheDocument()

    await user.click(row)
    const detail = await screen.findByRole('dialog', { name: /Expense details/i })
    expect(within(detail).getByText(/Main Fund/i)).toBeInTheDocument()
    expect(within(detail).getByText('Recorded:')).toBeInTheDocument()
    expect(within(detail).getAllByText(/18 Jun 2099/i).length).toBeGreaterThan(0)
  })

  it('filters Activity from the native filter sheet', async () => {
    const user = userEvent.setup()
    mockHandlers([{
      id: 'expense-filtered', business_date: '2099-06-18', amount: 500, fund_id: 'fund-main', category_id: 'cat-electricity', vendor_id: 'vendor-msedcl', narration: 'Older', created_by: 'm1', created_at: '2099-06-18T10:00:00Z',
    }])
    renderWithProviders(<ExpensesPage />)
    await user.click(screen.getByRole('tab', { name: /Activity/i }))
    expect(await screen.findByText(/Older/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Filters/i }))
    const sheet = await screen.findByRole('dialog', { name: /Filters/i })
    await user.type(within(sheet).getByLabelText(/From/i), '2099-06-19')
    await user.click(within(sheet).getByRole('button', { name: /Apply filters/i }))

    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    expect(screen.queryByText('Older')).not.toBeInTheDocument()
  })

  it('distinguishes an Activity loading failure from a genuine empty state', async () => {
    const user = userEvent.setup()
    mockHandlers()
    server.use(http.get('*/api/expenses', () => HttpResponse.json({ detail: 'Unavailable' }, { status: 503 })))
    renderWithProviders(<ExpensesPage />)
    await user.click(screen.getByRole('tab', { name: /Activity/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
    expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })
})
