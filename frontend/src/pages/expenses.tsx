import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, ChevronDown, ChevronUp, Filter, ReceiptIndianRupee } from 'lucide-react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MobileSelect } from '@/components/ui/mobile-select'
import { NativeDateField } from '@/components/ui/native-date-field'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/lib/use-online-status'

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
type FieldErrors = Partial<Record<'amount' | 'vendor' | 'narration' | 'date' | 'fund' | 'category', string>>

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function formatCurrency(amount: number) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

function formatDateShort(iso: string) {
  if (!iso) return 'Date unavailable'
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRecordedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ExpensesPage() {
  const queryClient = useQueryClient()
  const amountRef = useRef<HTMLInputElement>(null)
  const narrationRef = useRef<HTMLTextAreaElement>(null)

  const fundsQuery = useQuery({
    queryKey: ['funds'],
    queryFn: () => api.get<{ funds: Fund[] }>('/funds'),
  })
  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<{ categories: ExpenseCategory[]; expense_categories: ExpenseCategory[] }>('/expense-categories'),
  })
  const vendorsQuery = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get<{ vendors: Vendor[] }>('/vendors'),
  })

  const funds = fundsQuery.data?.funds ?? []
  const categories = categoriesQuery.data?.categories ?? categoriesQuery.data?.expense_categories ?? []
  const vendors = vendorsQuery.data?.vendors ?? []

  const [activeTab, setActiveTab] = useState<'record' | 'activity'>('record')
  const [businessDate, setBusinessDate] = useState(todayISO)
  const [amount, setAmount] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [newVendorName, setNewVendorName] = useState('')
  const [narration, setNarration] = useState('')
  const [fundId, setFundId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [createdExpense, setCreatedExpense] = useState<Expense | null>(null)
  const [createdVendorName, setCreatedVendorName] = useState('')
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const isOnline = useOnlineStatus()

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterFund, setFilterFund] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<{
    from?: string
    to?: string
    fund_id?: string
    category_id?: string
    vendor_id?: string
  }>({})

  useEffect(() => {
    if (!fundId && funds.length) {
      setFundId(funds.find((fund) => fund.name.toLowerCase().includes('main'))?.id ?? funds[0].id)
    }
  }, [fundId, funds])

  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const expensesQuery = useQuery({
    queryKey: ['expenses', appliedFilters],
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      const query = params.toString()
      return api.get<{ expenses: Expense[] }>(`/expenses${query ? `?${query}` : ''}`)
    },
  })
  const expenses = useMemo(() => {
    const list = expensesQuery.data?.expenses ?? []
    return [...list].sort((a, b) => b.business_date.localeCompare(a.business_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [expensesQuery.data?.expenses])

  const selectedVendorName = vendorId
    ? vendors.find((vendor) => vendor.id === vendorId)?.name ?? ''
    : newVendorName
  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.name ?? 'Choose category'
  const selectedFundName = funds.find((fund) => fund.id === fundId)?.name ?? 'Choose fund'
  const vendorValue = vendorId || (newVendorName ? `new:${newVendorName}` : '')
  const vendorOptions = [
    ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    ...(newVendorName ? [{ value: `new:${newVendorName}`, label: newVendorName, description: 'New vendor' }] : []),
  ]
  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length
  const fundMap = new Map(funds.map((fund) => [fund.id, fund.name]))
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
  const vendorMap = new Map(vendors.map((vendor) => [vendor.id, vendor.name]))

  const createExpense = useMutation({
    mutationFn: () => api.post<Expense>('/expenses', {
      business_date: businessDate,
      amount: Number(amount),
      fund_id: fundId,
      category_id: categoryId,
      vendor_id: vendorId || undefined,
      vendor_name: newVendorName || undefined,
      narration: narration.trim(),
    }),
    onSuccess: (expense) => {
      setCreatedVendorName(selectedVendorName)
      setCreatedExpense(expense)
      setRequestError(null)
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
    onError: () => {
      setRequestError('The expense could not be recorded. Check your connection and try again.')
    },
  })

  const focusFirstError = (errors: FieldErrors) => {
    if (errors.amount) amountRef.current?.focus()
    else if (errors.vendor) document.getElementById('expense-vendor')?.focus()
    else if (errors.narration) narrationRef.current?.focus()
  }

  const handleSubmit = () => {
    const errors: FieldErrors = {}
    if (!amount || Number(amount) <= 0) errors.amount = 'Enter a valid amount greater than zero'
    if (!selectedVendorName) errors.vendor = 'Choose or create a vendor'
    if (!narration.trim()) errors.narration = 'Enter a narration'
    if (!businessDate) errors.date = 'Choose a date'
    if (!fundId) errors.fund = 'Choose a fund'
    if (!categoryId) errors.category = 'Choose a category'
    setFieldErrors(errors)
    setRequestError(null)
    if (Object.keys(errors).length) {
      if (errors.narration || errors.date || errors.fund) setDetailsOpen(true)
      window.setTimeout(() => focusFirstError(errors))
      return
    }
    if (!isOnline || createExpense.isPending) return
    createExpense.mutate()
  }

  const resetForm = () => {
    setAmount('')
    setVendorId('')
    setNewVendorName('')
    setNarration('')
    setFieldErrors({})
    setRequestError(null)
    setCreatedExpense(null)
    setDetailsOpen(false)
    amountRef.current?.focus()
  }

  const masterDataLoading = fundsQuery.isLoading || categoriesQuery.isLoading || vendorsQuery.isLoading
  const masterDataError = fundsQuery.isError || categoriesQuery.isError || vendorsQuery.isError

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4 overflow-hidden md:h-auto md:overflow-visible">
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record and review cash paid by the society.</p>
        </div>
        <div role="tablist" aria-label="Expenses sections" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(['record', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`expenses-${tab}-panel`}
              id={`expenses-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'h-11 rounded-lg font-medium capitalize',
                activeTab === tab ? 'bg-card shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/50',
              )}
            >
              {tab === 'activity' && activeFilterCount ? `Activity · ${activeFilterCount}` : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-1 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 pb-28 md:mx-0 md:px-0">
        {activeTab === 'record' ? (
          <div id="expenses-record-panel" role="tabpanel" aria-labelledby="expenses-tab-record" className="space-y-4">
            {!isOnline && (
              <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                You’re offline. Financial entries can’t be recorded.
              </div>
            )}
            {masterDataError && (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Expense choices could not be loaded. Refresh this screen before recording an expense.
              </div>
            )}
            <Card>
              <CardContent className="space-y-5 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="expense-amount">Amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">₹</span>
                    <Input
                      ref={amountRef}
                      id="expense-amount"
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="next"
                      placeholder="0"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value)
                        setFieldErrors((current) => ({ ...current, amount: undefined }))
                      }}
                      aria-invalid={Boolean(fieldErrors.amount)}
                      aria-describedby={fieldErrors.amount ? 'expense-amount-error' : undefined}
                      className="h-16 pl-10 text-2xl font-semibold tabular-nums"
                    />
                  </div>
                  {fieldErrors.amount && <p id="expense-amount-error" role="alert" className="text-sm text-destructive">{fieldErrors.amount}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <MobileSelect
                    id="expense-vendor"
                    value={vendorValue}
                    onValueChange={(value) => {
                      if (value.startsWith('new:')) {
                        setVendorId('')
                        setNewVendorName(value.slice(4))
                      } else {
                        setVendorId(value)
                        setNewVendorName('')
                      }
                      setFieldErrors((current) => ({ ...current, vendor: undefined }))
                    }}
                    onCreate={(name) => {
                      setVendorId('')
                      setNewVendorName(name)
                      setFieldErrors((current) => ({ ...current, vendor: undefined }))
                    }}
                    options={vendorOptions}
                    placeholder="Choose or create vendor"
                    label="Vendor"
                    ariaLabel="Vendor"
                    searchable
                    disabled={masterDataLoading || masterDataError}
                  />
                  {fieldErrors.vendor && <p role="alert" className="text-sm text-destructive">{fieldErrors.vendor}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {categories.slice(0, 4).map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={categoryId === category.id}
                        onClick={() => {
                          setCategoryId(category.id)
                          setFieldErrors((current) => ({ ...current, category: undefined }))
                        }}
                        className={cn(
                          'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                          categoryId === category.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                        )}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                  <MobileSelect
                    value={categoryId}
                    onValueChange={(value) => setCategoryId(value)}
                    options={categories.map((category) => ({ value: category.id, label: category.name }))}
                    placeholder="All categories"
                    label="All categories"
                    ariaLabel="Category"
                    testId="expense-category-select"
                    searchable
                    disabled={masterDataLoading || masterDataError}
                  />
                  {fieldErrors.category && <p role="alert" className="text-sm text-destructive">{fieldErrors.category}</p>}
                </div>

                <div className="overflow-hidden rounded-xl border">
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    aria-controls="expense-details"
                    onClick={() => setDetailsOpen((open) => !open)}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left"
                  >
                    <span>
                      <span className="block text-sm font-semibold">Details</span>
                      <span className="block text-xs text-muted-foreground">{selectedFundName} · {formatDateShort(businessDate)} · {selectedCategoryName}</span>
                    </span>
                    {detailsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  {detailsOpen && (
                    <div id="expense-details" className="space-y-4 border-t p-4">
                      <div className="space-y-2">
                        <Label htmlFor="expense-narration">Narration</Label>
                        <Textarea
                          ref={narrationRef}
                          id="expense-narration"
                          rows={3}
                          placeholder="What was this expense for?"
                          value={narration}
                          onChange={(event) => {
                            setNarration(event.target.value)
                            setFieldErrors((current) => ({ ...current, narration: undefined }))
                          }}
                          aria-invalid={Boolean(fieldErrors.narration)}
                          className="min-h-24 resize-none"
                        />
                        {fieldErrors.narration && <p role="alert" className="text-sm text-destructive">{fieldErrors.narration}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expense-date">Date</Label>
                        <NativeDateField value={businessDate} onChange={setBusinessDate} label="Date" id="expense-date" ariaLabel="Business Date" />
                        {fieldErrors.date && <p role="alert" className="text-sm text-destructive">{fieldErrors.date}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Fund</Label>
                        <MobileSelect
                          value={fundId}
                          onValueChange={setFundId}
                          options={funds.map((fund) => ({ value: fund.id, label: fund.name }))}
                          placeholder="Choose fund"
                          label="Fund"
                          ariaLabel="Fund"
                          testId="expense-fund-select"
                          disabled={masterDataLoading || masterDataError}
                        />
                        {fieldErrors.fund && <p role="alert" className="text-sm text-destructive">{fieldErrors.fund}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">Payment method: <span className="font-medium text-foreground">Cash only</span></p>
                    </div>
                  )}
                </div>

                {!detailsOpen && (
                  <p className="text-xs text-muted-foreground">Cash only. Open Details to add the required narration or change the date and fund.</p>
                )}
                {requestError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{requestError}</div>}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div id="expenses-activity-panel" role="tabpanel" aria-labelledby="expenses-tab-activity" className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Recent expenses</h2>
                <p className="text-xs text-muted-foreground">Tap an expense to view its source details.</p>
              </div>
              <Button variant="outline" size="sm" className="h-11" onClick={() => setFilterSheetOpen(true)} aria-label="Filters">
                <Filter className="size-4" /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
              </Button>
            </div>

            {expensesQuery.isLoading ? (
              <div role="status" aria-label="Loading expenses" className="space-y-2">
                {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : expensesQuery.isError ? (
              <Card><CardContent className="space-y-3 text-center">
                <p role="alert" className="text-sm text-destructive">Expenses could not be loaded. Check your connection and try again.</p>
                <Button variant="outline" className="h-11" onClick={() => expensesQuery.refetch()}>Try again</Button>
              </CardContent></Card>
            ) : expenses.length === 0 ? (
              <Card><CardContent className="space-y-3 py-8 text-center">
                <ReceiptIndianRupee className="mx-auto size-8 text-muted-foreground" />
                <div><p className="font-medium">No expenses yet</p><p className="text-sm text-muted-foreground">Recorded cash expenses will appear here.</p></div>
                <Button variant="outline" className="h-11" onClick={() => setActiveTab('record')}>Record an expense</Button>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {expenses.map((expense) => {
                  const vendorName = vendorMap.get(expense.vendor_id ?? '') ?? 'Vendor unavailable'
                  const categoryName = categoryMap.get(expense.category_id) ?? 'Category unavailable'
                  return (
                    <button
                      key={expense.id}
                      type="button"
                      onClick={() => setSelectedExpense(expense)}
                      aria-label={`${vendorName} paid ${formatCurrency(expense.amount)} on ${formatDateShort(expense.business_date)}`}
                      className="flex min-h-[72px] w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{vendorName}</span>
                        <span className="block truncate text-sm text-muted-foreground">{categoryName}{expense.narration ? ` · ${expense.narration}` : ''}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Paid · {formatDateShort(expense.business_date)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-foreground"><ArrowUpRight className="size-4" />−{formatCurrency(expense.amount)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === 'record' && (
        <div className="shrink-0 border-t bg-background/95 px-1 pt-3 backdrop-blur md:relative md:border-0 md:bg-transparent md:p-0">
          <Button
            className="h-12 w-full text-base"
            disabled={!isOnline || createExpense.isPending || masterDataLoading || masterDataError}
            onClick={handleSubmit}
          >
            {createExpense.isPending ? 'Recording…' : amount && Number(amount) > 0 ? `Record ${formatCurrency(Number(amount))}` : 'Record expense'}
          </Button>
        </div>
      )}

      <Sheet open={Boolean(createdExpense)} onOpenChange={(open) => { if (!open) setCreatedExpense(null) }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          {createdExpense && (
            <>
              <SheetHeader>
                <SheetTitle>Expense recorded</SheetTitle>
                <SheetDescription>Your cashbook has been updated.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <div role="status" className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-3xl font-bold tabular-nums">{formatCurrency(createdExpense.amount)}</p>
                  <p className="mt-1 font-medium">{createdVendorName}</p>
                  <p className="text-sm text-muted-foreground">{formatDateShort(createdExpense.business_date)} · Expense {createdExpense.id.slice(0, 8)}</p>
                </div>
                <div className="grid gap-2">
                  <Button className="h-12" onClick={resetForm}>Record another</Button>
                  <Button variant="outline" className="h-12" onClick={() => { setCreatedExpense(null); setActiveTab('activity') }}>View activity</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selectedExpense)} onOpenChange={(open) => { if (!open) setSelectedExpense(null) }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          {selectedExpense && (
            <>
              <SheetHeader>
                <SheetTitle>Expense details</SheetTitle>
                <SheetDescription>{formatDateShort(selectedExpense.business_date)} · Paid in cash</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 p-4">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-2xl font-bold tabular-nums">{formatCurrency(selectedExpense.amount)}</p>
                  <p className="mt-1 font-semibold">{vendorMap.get(selectedExpense.vendor_id ?? '') ?? 'Vendor unavailable'}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div><dt className="inline text-muted-foreground">Category: </dt><dd className="inline">{categoryMap.get(selectedExpense.category_id) ?? 'Unavailable'}</dd></div>
                    <div><dt className="inline text-muted-foreground">Fund: </dt><dd className="inline">{fundMap.get(selectedExpense.fund_id ?? '') ?? 'Unavailable'}</dd></div>
                    <div><dt className="inline text-muted-foreground">Narration: </dt><dd className="inline">{selectedExpense.narration ?? 'Not provided'}</dd></div>
                    {formatRecordedAt(selectedExpense.created_at) && <div><dt className="inline text-muted-foreground">Recorded: </dt><dd className="inline">{formatRecordedAt(selectedExpense.created_at)}</dd></div>}
                  </dl>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader><SheetTitle>Filters</SheetTitle><SheetDescription>Filter expenses by date, fund, category, and vendor.</SheetDescription></SheetHeader>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="filter-from">From</Label><NativeDateField value={filterFrom} onChange={setFilterFrom} label="From" id="filter-from" ariaLabel="From" /></div>
              <div className="space-y-2"><Label htmlFor="filter-to">To</Label><NativeDateField value={filterTo} onChange={setFilterTo} label="To" id="filter-to" ariaLabel="To" /></div>
            </div>
            <div className="space-y-2"><Label>Fund</Label><MobileSelect value={filterFund} onValueChange={setFilterFund} options={[{ value: '', label: 'All funds' }, ...funds.map((fund) => ({ value: fund.id, label: fund.name }))]} placeholder="All funds" label="Fund" ariaLabel="Filter Fund" /></div>
            <div className="space-y-2"><Label>Category</Label><MobileSelect value={filterCategory} onValueChange={setFilterCategory} options={[{ value: '', label: 'All categories' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} placeholder="All categories" label="Category" ariaLabel="Filter Category" /></div>
            <div className="space-y-2"><Label>Vendor</Label><MobileSelect value={filterVendor} onValueChange={setFilterVendor} options={[{ value: '', label: 'All vendors' }, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))]} placeholder="All vendors" label="Vendor" ariaLabel="Filter Vendor" searchable /></div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterFund(''); setFilterCategory(''); setFilterVendor(''); setAppliedFilters({}); setFilterSheetOpen(false) }}>Clear</Button>
              <Button className="h-12" onClick={() => { setAppliedFilters({ from: filterFrom || undefined, to: filterTo || undefined, fund_id: filterFund || undefined, category_id: filterCategory || undefined, vendor_id: filterVendor || undefined }); setFilterSheetOpen(false) }}>Apply filters</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
