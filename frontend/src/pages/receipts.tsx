import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Flat = {
  id: string
  flat_number: string
  flat_category_id: string
  maintenance_amount?: number | null
  category_maintenance_amount?: number | null
  flat_category?: { maintenance_amount?: number | null } | null
  owner?: { id: string; name: string; mobile: string } | null
  tenant?: { id: string; name: string; mobile: string } | null
  default_payer?: { person: { id: string; name: string; mobile: string } | null; role: string | null } | null
  default_payer_person_id?: string | null
  default_payer_role?: string | null
}
type Fund = { id: string; name: string; is_active: boolean }
type Receipt = {
  id: string
  flat_id: string
  amount: number
  business_date: string
  type: string
  status: string
  voided_at?: string | null
  void_reason?: string | null
  narration?: string | null
  payer_person_id?: string | null
  fund_id?: string | null
  collected_by?: string | null
}

export function ReceiptsPage() {
  const qc = useQueryClient()
  const { data: flatData } = useQuery({
    queryKey: ['flats'],
    queryFn: () => api.get<{ flats: Flat[] }>('/flats'),
  })
  const flats = flatData?.flats ?? []
  const { data: fundData } = useQuery({
    queryKey: ['funds'],
    queryFn: () => api.get<{ funds: Fund[] }>('/funds'),
  })
  const funds = fundData?.funds ?? []
  // admin collection filters: business_date-centric
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterFlatId, setFilterFlatId] = useState('')
  const [filterCollector, setFilterCollector] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<{ from?: string; to?: string; flat_id?: string; collector_id?: string }>({})
  const receiptsQueryKey = ['receipts', appliedFilters] as const
  const { data: receiptData } = useQuery({
    queryKey: receiptsQueryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      if (appliedFilters.from) params.set('date_from', appliedFilters.from)
      if (appliedFilters.to) params.set('date_to', appliedFilters.to)
      if (appliedFilters.flat_id) params.set('flat_id', appliedFilters.flat_id)
      if (appliedFilters.collector_id) params.set('collector_id', appliedFilters.collector_id)
      const qs = params.toString()
      return api.get<{ receipts: Receipt[] }>(`/receipts${qs ? `?${qs}` : ''}`)
    },
  })
  const receipts = receiptData?.receipts ?? []
  const collectorTotals = receipts.reduce<Record<string, number>>((acc, r) => {
    const key = r.collected_by ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + Number(r.amount)
    return acc
  }, {})

  const [selectedFlatId, setSelectedFlatId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [fundId, setFundId] = useState('')
  const [payerHint, setPayerHint] = useState<string | null>(null)
  const [narration, setNarration] = useState('')
  const [receiptType, setReceiptType] = useState('REGULAR')

  // Default fund to Main Fund if available
  useEffect(() => {
    if (!fundId && funds.length) {
      const main = funds.find((f) => f.name.toLowerCase().includes('main'))
      setFundId(main ? main.id : funds[0].id)
    }
  }, [funds, fundId])

  // Find selected flat's default amount
  const selectedFlat = flats.find((f) => f.id === selectedFlatId)
  const defaultAmount = selectedFlat
    ? (selectedFlat.maintenance_amount ?? selectedFlat.category_maintenance_amount ?? selectedFlat.flat_category?.maintenance_amount ?? null)
    : null

  // Prefill amount when flat changes (if default exists, set it; if no default, clear)
  // Allow manual override after prefill — but if user changes flat again, prefill again.
  useEffect(() => {
    if (!selectedFlatId) {
      setAmount('')
      return
    }
    if (defaultAmount != null) {
      setAmount(String(defaultAmount))
    } else {
      setAmount('')
    }
  }, [selectedFlatId, defaultAmount])

  // Derive default payer tenant-first, owner fallback (inline from flats API)
  useEffect(() => {
    if (!selectedFlat) {
      setPayerHint(null)
      return
    }
    const dp = selectedFlat.default_payer
    if (dp?.person) {
      setPayerHint(`${dp.role}: ${dp.person.name}`)
    } else if (selectedFlat.default_payer_person_id) {
      setPayerHint(`${selectedFlat.default_payer_role}: ${selectedFlat.default_payer_person_id.slice(0, 8)}`)
    } else if (selectedFlat.tenant) {
      setPayerHint(`TENANT: ${selectedFlat.tenant.name}`)
    } else if (selectedFlat.owner) {
      setPayerHint(`OWNER: ${selectedFlat.owner.name}`)
    } else {
      setPayerHint(null)
    }
  }, [selectedFlat])

  const handleFlatChange = (val: string | null) => {
    setSelectedFlatId(val ?? '')
  }

  const createReceipt = useMutation({
    mutationFn: () => {
      const payerId = selectedFlat?.default_payer?.person?.id ?? selectedFlat?.default_payer_person_id ?? selectedFlat?.tenant?.id ?? selectedFlat?.owner?.id ?? undefined
      return api.post<Receipt>('/receipts', {
        flat_id: selectedFlatId,
        amount: Number(amount),
        business_date: date,
        fund_id: fundId,
        payer_person_id: payerId,
        type: receiptType,
        narration: narration.trim() || undefined,
        payment_method: 'CASH',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Receipt submitted (POSTED) — undo available via history')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to submit receipt'),
  })

  const voidReceipt = useMutation({
    mutationFn: (id: string) => api.post<Receipt>(`/receipts/${id}/void`, { reason: 'Undo via UI' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Receipt voided — history preserved')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to void'),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record payments — directly submitted (POSTED). Undo keeps history.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Record maintenance receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Flat</Label>
            <Select value={selectedFlatId} onValueChange={handleFlatChange}>
              <SelectTrigger aria-label="Flat" data-testid="receipt-flat-select">
                <SelectValue placeholder="Select flat">{flats.find((f) => f.id === selectedFlatId)?.flat_number ?? undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number} {f.maintenance_amount != null || f.category_maintenance_amount != null ? `(₹${f.maintenance_amount ?? f.category_maintenance_amount})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedFlat && (
              <p className="text-xs text-muted-foreground">
                {defaultAmount != null ? `Default from category: ₹${defaultAmount}` : 'No default — leave empty or enter amount'}
              </p>
            )}
            {payerHint && <p className="text-xs text-muted-foreground">Payer (tenant-first): {payerHint}</p>}
            <p className="text-xs text-muted-foreground">Payment method: <span className="font-medium">CASH</span> (only) — no other methods shown</p>
          </div>

          <div className="space-y-1">
            <Label>Fund</Label>
            <Select value={fundId} onValueChange={(v) => setFundId(v ?? '')}>
              <SelectTrigger data-testid="receipt-fund-select"><SelectValue placeholder="Select fund">{funds.find((f) => f.id === fundId)?.name ?? undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-amount">Amount</Label>
            <Input
              id="receipt-amount"
              type="text"
              inputMode="numeric"
              placeholder={defaultAmount != null ? `Default ₹${defaultAmount}` : 'Enter amount'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-date">Date</Label>
            <Input id="receipt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={receiptType} onValueChange={(v) => setReceiptType(v ?? 'REGULAR')}>
                <SelectTrigger data-testid="receipt-type-select"><SelectValue>{receiptType}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REGULAR">Regular</SelectItem>
                  <SelectItem value="ARREARS">Arrears</SelectItem>
                  <SelectItem value="PART">Part</SelectItem>
                  <SelectItem value="ADVANCE">Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-narration">Narration</Label>
              <Input id="receipt-narration" placeholder="Optional" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={createReceipt.isPending}
            onClick={() => {
              if (!selectedFlatId) {
                toast.error('Select a flat')
                return
              }
              if (!amount || Number(amount) <= 0) {
                toast.error('Enter a valid amount')
                return
              }
              if (!fundId) {
                toast.error('Select a fund')
                return
              }
              createReceipt.mutate()
            }}
          >
            {createReceipt.isPending ? 'Submitting…' : 'Submit receipt (POSTED)'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Prefill: selecting a flat fills amount from its category&apos;s <code>maintenance_amount</code>. Payer is tenant-first, owner fallback via flat occupants. Submitted receipts are POSTED immediately — undo via void keeps audit history.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Admin collection view — filter by business date / flat / collector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="filter-from">From (business date)</Label>
              <Input id="filter-from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">To (business date)</Label>
              <Input id="filter-to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={filterFlatId} onValueChange={(v) => setFilterFlatId(v === '__all__' ? '' : (v ?? ''))}>
                <SelectTrigger aria-label="Unit filter" data-testid="filter-flat-select"><SelectValue placeholder="All units">{flats.find((f) => f.id === filterFlatId)?.flat_number ?? undefined}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {flats.map((f) => <SelectItem key={f.id} value={f.id}>{f.flat_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-collector">Collector ID</Label>
              <Input id="filter-collector" placeholder="collected_by / collector_id" value={filterCollector} onChange={(e) => setFilterCollector(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAppliedFilters({ from: filterFrom || undefined, to: filterTo || undefined, flat_id: filterFlatId || undefined, collector_id: filterCollector || undefined })}
            >
              Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterFrom('')
                setFilterTo('')
                setFilterFlatId('')
                setFilterCollector('')
                setAppliedFilters({})
              }}
            >
              Clear
            </Button>
            {Object.keys(collectorTotals).length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                Collector totals: {Object.entries(collectorTotals).map(([k, v]) => `${k.slice(0, 8)}: ₹${v}`).join(' · ')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Filters use business_date (not created_at) and are society-scoped.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent receipts (excludes voided from totals)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts yet — submitted receipts appear here. Voided receipts remain in history (include_voided).</p>
          ) : (
            receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">₹{r.amount} · {r.business_date} · {r.type}</div>
                  <div className="text-xs text-muted-foreground">{r.flat_id.slice(0, 8)} · {r.status} {r.narration ? `· ${r.narration}` : ''} · collector {r.collected_by?.slice(0, 8) ?? '—'}</div>
                  {r.status === 'VOIDED' && <div className="text-[11px] text-muted-foreground">Voided {r.voided_at?.slice(0, 16)} · {r.void_reason ?? 'no reason'}</div>}
                </div>
                {r.status !== 'VOIDED' ? (
                  <Button variant="outline" size="sm" onClick={() => voidReceipt.mutate(r.id)} disabled={voidReceipt.isPending}>
                    Undo
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">History preserved</span>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
