import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Fund = { id: string; name: string; is_active: boolean }
type ExpenseCategory = { id: string; name: string; is_active: boolean }
type Vendor = { id: string; name: string; is_active: boolean }
type Expense = {
  id: string
  business_date: string
  amount: number
  fund_id: string | null
  category_id: string
  vendor_id: string | null
  narration: string | null
  created_by: string
  created_at: string
}

export function ExpensesPage() {
  const qc = useQueryClient()

  const { data: fundData } = useQuery({
    queryKey: ['funds'],
    queryFn: () => api.get<{ funds: Fund[] }>('/funds'),
  })
  const funds = fundData?.funds ?? []

  const { data: catData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<{ categories: ExpenseCategory[]; expense_categories: ExpenseCategory[] }>('/expense-categories'),
  })
  const categories = catData?.categories ?? catData?.expense_categories ?? []

  const { data: vendorData } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get<{ vendors: Vendor[] }>('/vendors'),
  })
  const vendors = vendorData?.vendors ?? []

  // form state
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [narration, setNarration] = useState('')
  const [fundId, setFundId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!fundId && funds.length) {
      const main = funds.find((f) => f.name.toLowerCase().includes('main'))
      setFundId(main ? main.id : funds[0].id)
    }
  }, [funds, fundId])

  useEffect(() => {
    if (!categoryId && categories.length) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId])

  // list filters
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterFund, setFilterFund] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<{ from?: string; to?: string; fund_id?: string; category_id?: string; vendor_id?: string }>({})

  const { data: expenseData } = useQuery({
    queryKey: ['expenses', appliedFilters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (appliedFilters.from) params.set('from', appliedFilters.from)
      if (appliedFilters.to) params.set('to', appliedFilters.to)
      if (appliedFilters.fund_id) params.set('fund_id', appliedFilters.fund_id)
      if (appliedFilters.category_id) params.set('category_id', appliedFilters.category_id)
      if (appliedFilters.vendor_id) params.set('vendor_id', appliedFilters.vendor_id)
      const qs = params.toString()
      return api.get<{ expenses: Expense[] }>(`/expenses${qs ? `?${qs}` : ''}`)
    },
  })
  const expenses = expenseData?.expenses ?? []

  const createExpense = useMutation({
    mutationFn: () =>
      api.post<Expense>('/expenses', {
        business_date: businessDate,
        amount: Number(amount),
        fund_id: fundId,
        category_id: categoryId,
        vendor_name: vendorName.trim() || undefined,
        narration: narration.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setVendorName('')
      setNarration('')
      setAmount('')
      setFormError(null)
      toast.success('Expense recorded')
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to create expense'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const handleSubmit = () => {
    if (!businessDate) {
      setFormError('business_date required')
      return
    }
    if (!amount || Number(amount) <= 0) {
      setFormError('amount must be > 0')
      return
    }
    if (!fundId) {
      setFormError('Select a fund')
      return
    }
    if (!categoryId) {
      setFormError('Select a category')
      return
    }
    setFormError(null)
    createExpense.mutate()
  }

  const fundMap = new Map(funds.map((f) => [f.id, f.name]))
  const catMap = new Map(categories.map((c) => [c.id, c.name]))
  const vendorMap = new Map(vendors.map((v) => [v.id, v.name]))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record cash expenses — CASH only, vendor inline</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Record expense</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="expense-date">Business Date</Label>
            <Input id="expense-date" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="expense-amount">Amount</Label>
            <Input id="expense-amount" type="text" inputMode="numeric" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="expense-vendor">Vendor</Label>
            <Input id="expense-vendor" placeholder="Type new vendor name to create inline" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">New names create Vendor inline (case-insensitive, society-scoped)</p>
          </div>

          <div className="space-y-1">
            <Label>Fund</Label>
            <Select value={fundId} onValueChange={(v) => setFundId(v ?? '')}>
              <SelectTrigger aria-label="Fund" data-testid="expense-fund-select">
                <SelectValue placeholder="Select fund">{funds.find((f) => f.id === fundId)?.name ?? undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
              <SelectTrigger aria-label="Category" data-testid="expense-category-select">
                <SelectValue placeholder="Select category">{categories.find((c) => c.id === categoryId)?.name ?? undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="expense-narration">Narration</Label>
            <Input id="expense-narration" placeholder="Optional" value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">
            Payment method: <span className="font-medium">CASH</span> (only) — non-cash methods are not shown
          </p>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button className="w-full" disabled={createExpense.isPending} onClick={handleSubmit}>
            {createExpense.isPending ? 'Saving…' : 'Create expense'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters — business date &amp; Fund / Category / Vendor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="filter-from">From</Label>
              <Input id="filter-from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">To</Label>
              <Input id="filter-to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fund</Label>
              <Select value={filterFund} onValueChange={(v) => setFilterFund(v === '__all__' ? '' : (v ?? ''))}>
                <SelectTrigger aria-label="Filter Fund">
                  <SelectValue placeholder="All funds">{filterFund ? fundMap.get(filterFund) : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expense Category</Label>
              <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : (v ?? ''))}>
                <SelectTrigger aria-label="Filter Category">
                  <SelectValue placeholder="All categories">{filterCategory ? catMap.get(filterCategory) : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Select value={filterVendor} onValueChange={(v) => setFilterVendor(v === '__all__' ? '' : (v ?? ''))}>
                <SelectTrigger aria-label="Filter Vendor">
                  <SelectValue placeholder="All vendors">{filterVendor ? vendorMap.get(filterVendor) : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAppliedFilters({
                  from: filterFrom || undefined,
                  to: filterTo || undefined,
                  fund_id: filterFund || undefined,
                  category_id: filterCategory || undefined,
                  vendor_id: filterVendor || undefined,
                })
              }
            >
              Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterFrom('')
                setFilterTo('')
                setFilterFund('')
                setFilterCategory('')
                setFilterVendor('')
                setAppliedFilters({})
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses yet — recorded expenses appear here.</p>
          ) : (
            expenses.map((e) => (
              <div key={e.id} className="rounded-lg border px-3 py-2">
                <div className="text-sm font-medium">
                  ₹{e.amount} · {e.business_date} · {catMap.get(e.category_id) ?? e.category_id} · {vendorMap.get(e.vendor_id ?? '') ?? '—'} · {fundMap.get(e.fund_id ?? '') ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.narration ? `${e.narration} · ` : ''}
                  Fund: {fundMap.get(e.fund_id ?? '') ?? e.fund_id ?? '—'} · Category: {catMap.get(e.category_id) ?? e.category_id} · Vendor: {vendorMap.get(e.vendor_id ?? '') ?? '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {e.created_by} · {e.created_at} · {e.business_date}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
