import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MobileSelect } from '@/components/ui/mobile-select'
import { NativeDateField } from '@/components/ui/native-date-field'
import { cn } from '@/lib/utils'
import { getApiBase } from '@/lib/api/base-url'
import { useOnlineStatus } from '@/lib/use-online-status'
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
  receipt_number?: string | null
  public_pdf_url?: string | null
  whatsapp_status?: string | null
  whatsapp_failure_reason?: string | null
}

const API_BASE = getApiBase()

function receiptPdfHref(receipt: Receipt) {
  const href = receipt.public_pdf_url ?? `/api/receipts/${receipt.id}/pdf`
  if (/^https?:\/\//.test(href) || !href.startsWith('/')) return href
  if (!/^https?:\/\//.test(API_BASE)) return href
  const apiUrl = new URL(API_BASE)
  const apiRoot = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : apiUrl.origin
  return `${apiRoot}${href}`
}

function formatCurrency(amount: number) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

function formatDateShort(iso: string) {
  if (!iso) return '—'
  // Force local noon to avoid TZ shift: parse as local date
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatType(type: string) {
  const m: Record<string, string> = { REGULAR: 'Regular', ARREARS: 'Arrears', PART: 'Part', ADVANCE: 'Advance' }
  return m[type?.toUpperCase()] ?? type ?? '—'
}

function statusLabel(status: string) {
  const s = status?.toUpperCase()
  if (s === 'VOIDED') return 'Voided'
  if (s === 'POSTED' || s === 'RECORDED') return 'Recorded'
  if (s === 'PENDING') return 'Pending'
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '—'
}

function StatusBadge({ status }: { status: string }) {
  const upper = status?.toUpperCase()
  const variant = upper === 'VOIDED' ? 'destructive' : upper === 'POSTED' ? 'secondary' : 'outline'
  return (
    <Badge variant={variant as never} className={upper === 'VOIDED' ? 'bg-destructive/10 text-destructive' : upper === 'POSTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
      {statusLabel(status)}
    </Badge>
  )
}

export function ReceiptsPage() {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const { data: flatData } = useQuery({
    queryKey: ['flats'],
    queryFn: () => api.get<{ flats: Flat[] }>('/flats'),
  })
  const flats = flatData?.flats ?? []
  const flatById = useMemo(() => new Map(flats.map((f) => [f.id, f])), [flats])
  const { data: fundData } = useQuery({
    queryKey: ['funds'],
    queryFn: () => api.get<{ funds: Fund[] }>('/funds'),
  })
  const funds = fundData?.funds ?? []
  const fundById = useMemo(() => new Map(funds.map((f) => [f.id, f.name])), [funds])

  // admin collection filters: business_date-centric
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterFlatId, setFilterFlatId] = useState('')
  const [filterCollector, setFilterCollector] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<{ from?: string; to?: string; flat_id?: string; collector_id?: string }>({})
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const receiptsQueryKey = ['receipts', appliedFilters] as const
  const { data: receiptData, isLoading: receiptsLoading } = useQuery({
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

  const [selectedFlatId, setSelectedFlatId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [fundId, setFundId] = useState('')
  const [payerHint, setPayerHint] = useState<string | null>(null)
  const [narration, setNarration] = useState('')
  const [receiptType, setReceiptType] = useState('REGULAR')

  // detail + void state
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

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
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<Receipt>(`/receipts/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Receipt voided — history preserved')
      setVoidConfirmOpen(false)
      setVoidReason('')
      setSelectedReceipt(null)
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to void'),
  })

  const resendWhatsApp = useMutation({
    mutationFn: (id: string) => api.post(`/receipts/${id}/whatsapp-resend`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('WhatsApp receipt queued')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to resend WhatsApp'),
  })

  const activeFilterCount = [appliedFilters.from, appliedFilters.to, appliedFilters.flat_id, appliedFilters.collector_id].filter(Boolean).length
  const [activeTab, setActiveTab] = useState<'record' | 'activity'>('record')

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4 overflow-hidden md:h-auto md:overflow-visible">
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record payments — recorded immediately. Tap a receipt to view, share, or void with a reason.</p>
        </div>

        <div role="tablist" aria-label="Receipts sections" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <button
          role="tab"
          aria-selected={activeTab === 'record'}
          aria-controls="receipts-record-panel"
          id="receipts-tab-record"
          onClick={() => setActiveTab('record')}
          className={activeTab === 'record' ? 'h-11 rounded-lg bg-card font-medium shadow-sm ring-1 ring-border' : 'h-11 rounded-lg font-medium text-muted-foreground hover:bg-card/50'}
        >
          Record
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'activity'}
          aria-controls="receipts-activity-panel"
          id="receipts-tab-activity"
          onClick={() => setActiveTab('activity')}
          className={activeTab === 'activity' ? 'h-11 rounded-lg bg-card font-medium shadow-sm ring-1 ring-border' : 'h-11 rounded-lg font-medium text-muted-foreground hover:bg-card/50'}
        >
          Activity{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </button>
      </div>

      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 pb-6 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
        {activeTab === 'record' ? (
        <Card id="receipts-record-panel" role="tabpanel" aria-labelledby="receipts-tab-record">
        <CardHeader>
          <CardTitle className="text-sm">Record maintenance receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOnline && (
            <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              You’re offline. Financial entries can’t be recorded.
            </div>
          )}
          <div className="space-y-1">
            <Label>Flat</Label>
            <MobileSelect
              value={selectedFlatId}
              onValueChange={handleFlatChange}
              options={flats.map((f) => ({
                value: f.id,
                label: f.flat_number,
                description:
                  f.maintenance_amount != null || f.category_maintenance_amount != null
                    ? `₹${f.maintenance_amount ?? f.category_maintenance_amount}`
                    : undefined,
              }))}
              placeholder="Select flat"
              label="Flat"
              ariaLabel="Flat"
              testId="receipt-flat-select"
              searchable
            />
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
            <MobileSelect
              value={fundId}
              onValueChange={(v) => setFundId(v ?? '')}
              options={funds.map((f) => ({ value: f.id, label: f.name }))}
              placeholder="Select fund"
              label="Fund"
              testId="receipt-fund-select"
            />
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
            <NativeDateField value={date} onChange={setDate} label="Date" id="receipt-date" ariaLabel="Date" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <MobileSelect
                value={receiptType}
                onValueChange={(v) => setReceiptType(v ?? 'REGULAR')}
                options={[
                  { value: 'REGULAR', label: 'Regular' },
                  { value: 'ARREARS', label: 'Arrears' },
                  { value: 'PART', label: 'Part' },
                  { value: 'ADVANCE', label: 'Advance' },
                ]}
                placeholder="Select type"
                label="Type"
                testId="receipt-type-select"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-narration">Narration</Label>
              <Input id="receipt-narration" placeholder="Optional" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>

          <Button
            className="w-full h-11"
            disabled={!isOnline || createReceipt.isPending}
            onClick={() => {
              if (!isOnline) return
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
            {createReceipt.isPending ? 'Recording…' : amount ? `Record ${formatCurrency(Number(amount) || 0)}` : 'Record receipt'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Prefill: selecting a flat fills amount from its category&apos;s <code>maintenance_amount</code>. Payer is tenant-first, owner fallback via flat occupants. Recorded receipts can be voided with a reason — history is preserved.
          </p>
        </CardContent>
      </Card>
      ) : (
      <div id="receipts-activity-panel" role="tabpanel" aria-labelledby="receipts-tab-activity" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent receipts</h2>
          <Button variant="outline" size="sm" onClick={() => setFilterSheetOpen(true)} aria-label="Filters">
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activity — tap a receipt for details</CardTitle>
          </CardHeader>
        <CardContent className="space-y-2">
          {receiptsLoading ? (
            <p className="text-sm text-muted-foreground">Loading receipts…</p>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts yet — submitted receipts appear here. Voided receipts remain in history (include_voided).</p>
          ) : (
            receipts.map((r) => {
              const flatNumber = flatById.get(r.flat_id)?.flat_number ?? 'Flat'
              const isVoided = r.status?.toUpperCase() === 'VOIDED'
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReceipt(r)}
                  aria-label={`${flatNumber} ${formatCurrency(Number(r.amount))} ${r.receipt_number ?? ''}`}
                  className="flex w-full min-h-[64px] items-center justify-between gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    {r.receipt_number && <div className="text-xs font-semibold text-primary">{r.receipt_number}</div>}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{flatNumber}</span>
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(Number(r.amount))}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateShort(r.business_date)} · {formatType(r.type)}{r.narration ? ` · ${r.narration}` : ''}
                    </div>
                    {r.fund_id && fundById.get(r.fund_id) && (
                      <div className="text-[11px] text-muted-foreground">Fund: {fundById.get(r.fund_id)}</div>
                    )}
                    {isVoided && <div className="text-[11px] text-muted-foreground">Voided {r.voided_at?.slice(0, 16)} {r.void_reason ? `· ${r.void_reason}` : ''}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">View</span>
                </button>
              )
            })
          )}
        </CardContent>
        </Card>
      </div>
      )}
      </div>

      {/* Filter Sheet (bottom) */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Filter receipts by business date, flat, and collector. Filters are society-scoped.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="filter-from">From</Label>
                <NativeDateField value={filterFrom} onChange={setFilterFrom} label="From" id="filter-from" ariaLabel="From" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-to">To</Label>
                <NativeDateField value={filterTo} onChange={setFilterTo} label="To" id="filter-to" ariaLabel="To" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <MobileSelect
                value={filterFlatId}
                onValueChange={(v) => setFilterFlatId(v ?? '')}
                options={[{ value: '', label: 'All units' }, ...flats.map((f) => ({ value: f.id, label: f.flat_number }))]}
                placeholder="All units"
                label="Unit"
                ariaLabel="Unit"
                testId="filter-flat-select"
                searchable
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-collector">Collector ID</Label>
              <Input id="filter-collector" placeholder="collected_by / collector_id" value={filterCollector} onChange={(e) => setFilterCollector(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-11"
                onClick={() => {
                  setAppliedFilters({ from: filterFrom || undefined, to: filterTo || undefined, flat_id: filterFlatId || undefined, collector_id: filterCollector || undefined })
                  setFilterSheetOpen(false)
                }}
              >
                Apply filters
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => {
                  setFilterFrom('')
                  setFilterTo('')
                  setFilterFlatId('')
                  setFilterCollector('')
                  setAppliedFilters({})
                  setFilterSheetOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Filters use business_date (not created_at) and are society-scoped.</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Detail Sheet */}
      <Sheet open={!!selectedReceipt} onOpenChange={(open) => { if (!open) setSelectedReceipt(null) }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
          {selectedReceipt && (() => {
            const r = selectedReceipt
            const flatNumber = flatById.get(r.flat_id)?.flat_number ?? 'Flat'
            const isVoided = r.status?.toUpperCase() === 'VOIDED'
            return (
              <>
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
                <SheetHeader>
                  <SheetTitle>Receipt {r.receipt_number ?? r.id.slice(0, 8)}</SheetTitle>
                  <SheetDescription>
                    {flatNumber} · {formatDateShort(r.business_date)} · {statusLabel(r.status)}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 p-4">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-2xl font-bold tabular-nums">{formatCurrency(Number(r.amount))}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{flatNumber}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-muted-foreground">{formatType(r.type)}</span>
                    </div>
                    {r.receipt_number && <div className="mt-1 text-xs font-mono text-muted-foreground">{r.receipt_number}</div>}
                    <div className="mt-2 space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Date:</span> {formatDateShort(r.business_date)}</div>
                      {r.narration && <div><span className="text-muted-foreground">Narration:</span> {r.narration}</div>}
                      {r.fund_id && <div><span className="text-muted-foreground">Fund:</span> {fundById.get(r.fund_id) ?? '—'}</div>}
                      <div><span className="text-muted-foreground">Status:</span> {statusLabel(r.status)}</div>
                      {isVoided && <div className="text-destructive text-xs">Voided {r.voided_at?.slice(0, 16)} · {r.void_reason ?? 'no reason'}</div>}
                      {r.whatsapp_status && <div className="text-xs text-muted-foreground">WhatsApp: {r.whatsapp_status}{r.whatsapp_failure_reason ? ` · ${r.whatsapp_failure_reason}` : ''}</div>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <a className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 w-full justify-center')} href={receiptPdfHref(r)} target="_blank" rel="noreferrer">
                      Download PDF
                    </a>
                    <Button variant="outline" className="h-11 w-full" onClick={() => resendWhatsApp.mutate(r.id)} disabled={resendWhatsApp.isPending}>
                      {resendWhatsApp.isPending ? 'Queuing…' : 'Resend WhatsApp'}
                    </Button>
                    {isVoided ? (
                      <p className="text-center text-xs text-muted-foreground">This receipt is voided — history preserved. It is excluded from totals.</p>
                    ) : (
                      <Button variant="destructive" className="h-11 w-full" onClick={() => setVoidConfirmOpen(true)}>
                        Void receipt
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>

      {/* Void Confirmation Dialog */}
      <Dialog open={voidConfirmOpen} onOpenChange={(open) => { setVoidConfirmOpen(open); if (!open) setVoidReason('') }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Void receipt?</DialogTitle>
            <DialogDescription>
              This will remove {selectedReceipt ? formatCurrency(Number(selectedReceipt.amount)) : 'the amount'} from totals but keep history. The receipt will be marked Voided and excluded from the cashbook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="void-reason">Reason</Label>
              <Textarea
                id="void-reason"
                placeholder="Enter reason for voiding — e.g., entered wrong amount"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">Reason is required and will be stored with the void.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setVoidConfirmOpen(false)} className="h-11">Cancel</Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={!voidReason.trim() || voidReceipt.isPending}
              onClick={() => {
                if (!selectedReceipt) return
                voidReceipt.mutate({ id: selectedReceipt.id, reason: voidReason.trim() })
              }}
            >
              {voidReceipt.isPending ? 'Voiding…' : 'Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
