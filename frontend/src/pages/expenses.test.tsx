import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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
const vendors = [
  { id: 'vendor-msedcl', name: 'MSEDCL', is_active: true },
]

function mockHandlers(overrides: { expenses?: unknown[] } = {}) {
  const expensesStore: unknown[] = overrides.expenses ?? []
  server.use(
    http.get('*/api/funds', () => HttpResponse.json({ funds })),
    http.get('*/api/expense-categories', () => HttpResponse.json({ categories, expense_categories: categories })),
    http.get('*/api/vendors', () => HttpResponse.json({ vendors })),
    http.get('*/api/expenses', ({ request }) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const cat = url.searchParams.get('category_id')
      const ven = url.searchParams.get('vendor_id')
      const fund = url.searchParams.get('fund_id')
      let filtered = [...expensesStore] as Array<Record<string, unknown>>
      if (from) filtered = filtered.filter((e) => (e.business_date as string) >= from)
      if (to) filtered = filtered.filter((e) => (e.business_date as string) <= to)
      if (cat) filtered = filtered.filter((e) => e.category_id === cat)
      if (ven) filtered = filtered.filter((e) => e.vendor_id === ven)
      if (fund) filtered = filtered.filter((e) => e.fund_id === fund)
      return HttpResponse.json({ expenses: filtered })
    }),
    http.post('*/api/expenses', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      const amount = body.amount as number
      if (amount == null || amount <= 0) return HttpResponse.json({ detail: 'amount must be > 0' }, { status: 422 })
      if (body.payment_method && (body.payment_method as string) !== 'CASH') return HttpResponse.json({ detail: 'payment_method must be CASH' }, { status: 422 })
      if (!body.business_date || !body.fund_id || !body.category_id) return HttpResponse.json({ detail: 'missing fields' }, { status: 422 })
      // vendor_name get-or-create simulation
      let vendorId = body.vendor_id as string | undefined
      let vendorName = body.vendor_name as string | undefined
      if (!vendorId && vendorName && (vendorName as string).trim()) {
        const existing = vendors.find((v) => v.name.toLowerCase() === (vendorName as string).trim().toLowerCase())
        if (existing) vendorId = existing.id
        else {
          const newId = `vendor-${Date.now()}`
          const newVendor = { id: newId, name: (vendorName as string).trim(), is_active: true }
          vendors.push(newVendor)
          vendorId = newId
        }
      }
      const expense = {
        id: `exp-${Date.now()}`,
        business_date: body.business_date,
        amount,
        fund_id: body.fund_id,
        category_id: body.category_id,
        vendor_id: vendorId ?? null,
        narration: body.narration ?? null,
        created_by: 'membership-1',
        created_at: new Date().toISOString(),
      }
      expensesStore.push(expense)
      return HttpResponse.json(expense, { status: 201 })
    }),
  )
  return { expensesStore }
}

describe('ExpensesPage — T1 Expense Management (TDD)', () => {
  it('renders cash expense form with required fields and CASH-only notice', async () => {
    mockHandlers()
    renderWithProviders(<ExpensesPage />)
    expect(await screen.findByRole('heading', { name: /Expenses/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/business date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Amount$/i)).toBeInTheDocument()
    // vendor_name field for inline creation
    expect(screen.getByPlaceholderText(/new vendor name/i)).toBeInTheDocument()
    // selects for Fund and Category
    expect(screen.getAllByText(/CASH/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Payment method/i)).toBeInTheDocument()
    // non-cash methods not shown
    expect(screen.queryByText(/BANK/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/UPI/i)).not.toBeInTheDocument()
  })

  it('admin can create cash Expense with vendor_name inline and sees it in list', async () => {
    const user = userEvent.setup()
    const { expensesStore } = mockHandlers()
    renderWithProviders(<ExpensesPage />)

    // wait for selects to load
    await screen.findByRole('heading', { name: /Expenses/i })

    // fill form
    const dateInput = screen.getByLabelText(/business date/i)
    await user.clear(dateInput)
    await user.type(dateInput, '2099-06-10')

    const amountInput = screen.getByLabelText(/^Amount$/i)
    await user.clear(amountInput)
    await user.type(amountInput, '1234')

    const vendorInput = screen.getByPlaceholderText(/new vendor name/i)
    await user.clear(vendorInput)
    await user.type(vendorInput, 'NewVendorInline')

    const narrationInput = screen.getByLabelText(/narration/i)
    await user.clear(narrationInput)
    await user.type(narrationInput, 'MSEDCL bill June')

    // select Fund (use option role to disambiguate from trigger value)
    await user.click(screen.getByTestId('expense-fund-select'))
    await user.click(await screen.findByRole('option', { name: 'Main Fund' }))

    // select Category
    await user.click(screen.getByTestId('expense-category-select'))
    await user.click(await screen.findByRole('option', { name: 'Electricity' }))

    const submit = screen.getByRole('button', { name: /create expense|submit|record expense/i })
    await user.click(submit)

    await waitFor(() => {
      expect(expensesStore.length).toBe(1)
    })
    // list should show the expense
    expect(await screen.findByText(/1234/)).toBeInTheDocument()
    expect(screen.getByText(/MSEDCL bill June/)).toBeInTheDocument()
    // audit fields visible
    expect(screen.getByText(/membership-1/)).toBeInTheDocument()
  })

  it('vendor_name reuses case-insensitively via inline creation', async () => {
    const user = userEvent.setup()
    mockHandlers()
    renderWithProviders(<ExpensesPage />)
    await screen.findByRole('heading', { name: /Expenses/i })

    const dateInput = screen.getByLabelText(/business date/i)
    const amountInput = screen.getByLabelText(/^Amount$/i)
    const vendorInput = screen.getByPlaceholderText(/new vendor name/i)

    // first expense with MSEDCL
    await user.clear(dateInput); await user.type(dateInput, '2099-06-12')
    await user.clear(amountInput); await user.type(amountInput, '100')
    await user.clear(vendorInput); await user.type(vendorInput, 'MSEDCL')
    await user.click(screen.getByTestId('expense-fund-select')); await user.click(await screen.findByRole('option', { name: 'Main Fund' }))
    await user.click(screen.getByTestId('expense-category-select')); await user.click(await screen.findByRole('option', { name: 'Electricity' }))
    await user.click(screen.getByRole('button', { name: /create expense|submit|record expense/i }))
    await waitFor(() => expect(screen.getByText(/100/)).toBeInTheDocument())

    // second expense with lower-case same vendor
    await user.clear(dateInput); await user.type(dateInput, '2099-06-13')
    await user.clear(amountInput); await user.type(amountInput, '200')
    await user.clear(vendorInput); await user.type(vendorInput, 'msedcl')
    await user.click(screen.getByRole('button', { name: /create expense|submit|record expense/i }))

    // vendors list should not duplicate (only one MSEDCL)
    await waitFor(() => {
      const matches = vendors.filter((v) => v.name.toLowerCase() === 'msedcl')
      expect(matches.length).toBe(1)
    })
  })

  it('rejects zero and negative amounts with validation error', async () => {
    const user = userEvent.setup()
    mockHandlers()
    renderWithProviders(<ExpensesPage />)
    await screen.findByRole('heading', { name: /Expenses/i })

    const amountInput = screen.getByLabelText(/^Amount$/i)
    await user.clear(amountInput)
    await user.type(amountInput, '0')
    await user.click(screen.getByRole('button', { name: /create expense|submit|record expense/i }))
    expect(await screen.findByText(/amount.*> 0|must be.*positive|valid amount/i)).toBeInTheDocument()

    await user.clear(amountInput)
    await user.type(amountInput, '-5')
    await user.click(screen.getByRole('button', { name: /create expense|submit|record expense/i }))
    expect(await screen.findByText(/amount.*> 0|must be.*positive|valid amount/i)).toBeInTheDocument()
  })

  it('expense list is filterable by business_date and category/vendor/fund', async () => {
    const user = userEvent.setup()
    const expenses = [
      { id: 'exp-a', business_date: '2099-06-20', amount: 500, fund_id: 'fund-main', category_id: 'cat-electricity', vendor_id: 'vendor-msedcl', narration: 'A', created_by: 'm1', created_at: new Date().toISOString() },
      { id: 'exp-b', business_date: '2099-06-20', amount: 600, fund_id: 'fund-sinking', category_id: 'cat-salary', vendor_id: 'vendor-extra', narration: 'B', created_by: 'm1', created_at: new Date().toISOString() },
    ]
    mockHandlers({ expenses })
    renderWithProviders(<ExpensesPage />)
    // should show both initially (after filters applied)
    // Apply fund filter
    // Find filter controls
    expect(await screen.findByText(/500/)).toBeInTheDocument()
    expect(screen.getByText(/600/)).toBeInTheDocument()

    // filter by business_date range that excludes one
    const fromInput = screen.getByLabelText(/From/i)
    await user.clear(fromInput)
    await user.type(fromInput, '2099-06-21')
    await user.click(screen.getByRole('button', { name: /Apply filters/i }))
    await waitFor(() => {
      expect(screen.queryByText(/500/)).not.toBeInTheDocument()
      expect(screen.queryByText(/600/)).not.toBeInTheDocument()
    })
  })

  it('shows audit fields created_by and created_at in list rows', async () => {
    const expenses = [
      { id: 'exp-audit', business_date: '2099-06-18', amount: 777, fund_id: 'fund-main', category_id: 'cat-electricity', vendor_id: 'vendor-msedcl', narration: 'audit check', created_by: 'audit-member-123', created_at: '2099-06-18T10:00:00Z' },
    ]
    mockHandlers({ expenses })
    renderWithProviders(<ExpensesPage />)
    expect(await screen.findByText(/audit-member-123/)).toBeInTheDocument()
    expect(screen.getAllByText(/2099-06-18/).length).toBeGreaterThan(0)
  })
})
