import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, MoreVertical } from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { NativeDateField } from '@/components/ui/native-date-field'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useMe } from '@/lib/api/hooks'
import { getApiBase } from '@/lib/api/base-url'
import { useAuthStore } from '@/stores/auth-store'

type CashbookReport = {
  society: { id: string; name: string | null }
  from: string
  to: string
  opening: number
  total_receipts: number
  total_expenses: number
  closing: number
  receipts: Array<{
    id: string
    flat_id: string
    payer_person_id: string | null
    fund_id: string | null
    amount: number
    business_date: string
    type: string
    narration: string | null
    status: string
    flat: { id: string; flat_number: string }
    fund: { id: string; name: string } | null
  }>
  expenses: Array<{
    id: string
    business_date: string
    amount: number
    fund_id: string | null
    category_id: string
    vendor_id: string | null
    narration: string | null
    category: { id: string; name: string }
    vendor: { id: string; name: string } | null
    fund: { id: string; name: string } | null
  }>
}

type OpeningResponse = { society_id: string; opening_date: string | null; amount: number; exists: boolean }
type ReportRun = {
  id: string
  from: string
  to: string
  opening: number
  total_receipts: number
  total_expenses: number
  closing: number
  generated_at: string
  generated_by: string | null
  format: 'xlsx' | 'pdf'
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() {
  return fmt(new Date())
}

function startOfMonth(d: Date) {
  return fmt(new Date(d.getFullYear(), d.getMonth(), 1))
}
function endOfMonth(d: Date) {
  return fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function startOfWeek(d: Date) {
  const clone = new Date(d)
  const day = clone.getDay()
  const diff = clone.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  clone.setDate(diff)
  return fmt(clone)
}
function endOfWeek(d: Date) {
  const start = new Date(startOfWeek(new Date(d)))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return fmt(end)
}

function formatCurrency(amount: number) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

function formatDateShort(iso: string) {
  const date = new Date(`${iso}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function vapidKeyToUint8Array(publicKey: string) {
  const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
  const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function ReportsPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: me, isLoading: isLoadingMe } = useMe()
  const roles = me?.memberships?.flatMap((membership) => membership.roles as string[]) ?? []
  const isAdmin = me?.platform_admin === true || roles.includes('super_admin') || roles.includes('SOCIETY_ADMIN')
  const now = new Date()
  const pushedToday = searchParams.get('from') === 'today' && searchParams.get('to') === 'today'
  const [from, setFrom] = useState(() => pushedToday ? todayStr() : searchParams.get('from') ?? startOfMonth(now))
  const [to, setTo] = useState(() => pushedToday ? todayStr() : searchParams.get('to') ?? endOfMonth(now))
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'custom'>(pushedToday ? 'today' : 'month')
  const [customRangeOpen, setCustomRangeOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const [openingInput, setOpeningInput] = useState('')
  const [openingEditorOpen, setOpeningEditorOpen] = useState(false)
  const [selected, setSelected] = useState<{ kind: 'receipt' | 'expense'; data: Record<string, unknown> } | null>(null)
  const [showVoided, setShowVoided] = useState(false)
  const [selectedSummary, setSelectedSummary] = useState<'opening' | 'receipts' | 'expenses' | 'closing' | null>(null)
  const [tab, setTab] = useState<'current' | 'history'>('current')
  const [historyPage, setHistoryPage] = useState(1)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false)

  // opening balance for selected from date
  const openingQuery = useQuery({
    queryKey: ['cash-opening-balance', from],
    queryFn: () => api.get<OpeningResponse>(`/cash-opening-balance?date=${from}`),
    enabled: isAdmin && !!from,
  })

  useEffect(() => {
    if (openingQuery.data) {
      setOpeningInput(String(openingQuery.data.amount ?? 0))
    }
  }, [openingQuery.data])

  const reportQuery = useQuery<CashbookReport, ApiError>({
    queryKey: ['cashbook-report', from, to],
    queryFn: () => api.get<CashbookReport>(`/reports/cashbook?from=${from}&to=${to}`),
    enabled: isAdmin && !!from && !!to,
    retry: false,
  })

  const historyQuery = useQuery<{ runs: ReportRun[]; page: number; page_size: number; total: number }, ApiError>({
    queryKey: ['cashbook-history', historyPage],
    queryFn: () => api.get(`/reports/history?page=${historyPage}`),
    enabled: isAdmin && tab === 'history',
    retry: false,
  })

  const voidedQuery = useQuery({
    queryKey: ['voided-receipts', from, to],
    queryFn: () => api.get<{ receipts: CashbookReport['receipts'] }>(`/receipts?from=${from}&to=${to}&include_voided=true`),
    enabled: isAdmin && showVoided,
  })

  const detailQuery = useQuery({
    queryKey: ['cashbook-source', selected?.kind, selected?.data.id],
    queryFn: () => api.get<Record<string, unknown>>(`/${selected?.kind === 'receipt' ? 'receipts' : 'expenses'}/${selected?.data.id}`),
    enabled: isAdmin && !!selected,
  })

  const saveOpening = useMutation({
    mutationFn: () => api.put<OpeningResponse>('/cash-opening-balance', { opening_date: from, amount: Number(openingInput) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-opening-balance'] })
      qc.invalidateQueries({ queryKey: ['cashbook-report'] })
      setOpeningEditorOpen(false)
      toast.success('Opening balance saved')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to save opening balance'),
  })

  function applyPreset(preset: 'today' | 'week' | 'month' | 'custom') {
    if (preset === 'custom') {
      setDraftFrom(from)
      setDraftTo(to)
      setCustomRangeOpen(true)
      return
    }
    const t = new Date()
    setOpeningInput('')
    if (preset === 'today') {
      const s = todayStr()
      setFrom(s)
      setTo(s)
    } else if (preset === 'week') {
      setFrom(startOfWeek(new Date()))
      setTo(endOfWeek(new Date()))
    } else if (preset === 'month') {
      setFrom(startOfMonth(t))
      setTo(endOfMonth(t))
    }
    setActivePreset(preset)
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return
    setOpeningInput('')
    setFrom(draftFrom)
    setTo(draftTo)
    setActivePreset('custom')
    setCustomRangeOpen(false)
  }

  async function downloadReport(format: 'xlsx' | 'pdf', range = { from, to }) {
    try {
      const token = useAuthStore.getState().accessToken
      const base = getApiBase()
      const response = await fetch(`${base}/reports/cashbook?from=${range.from}&to=${range.to}&format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const filename = `cashbook-${range.from}-to-${range.to}.${format}`
      const file = new File([blob], filename, { type: blob.type })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: 'Cashbook report' })
        toast.success('Report shared')
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} downloaded`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      toast.error('Push notifications are not supported by this browser')
      return
    }
    setIsEnablingNotifications(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.message('Notifications are off. Daily reports will remain in the bell history.')
        return
      }
      const { public_key } = await api.get<{ public_key: string | null }>('/push/vapid_public_key')
      if (!public_key) {
        toast.message('Push delivery is not configured yet. Daily reports will remain in the bell history.')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToUint8Array(public_key) })
      await api.post('/push/subscribe', subscription.toJSON())
      setNotificationsEnabled(true)
      toast.success('Daily report notifications enabled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications')
    } finally {
      setIsEnablingNotifications(false)
    }
  }

  const report = reportQuery.data
  const isForbidden = reportQuery.error?.status === 403
  const isUnauth = reportQuery.error?.status === 401

  // combined statement sorted by business_date
  const combined: Array<{ kind: 'receipt' | 'expense'; date: string; amount: number; narration: string | null; id: string; raw: Record<string, unknown> }> = []
  if (report) {
    for (const r of report.receipts) {
      combined.push({ kind: 'receipt', date: r.business_date, amount: Number(r.amount), narration: r.narration, id: r.id, raw: r as unknown as Record<string, unknown> })
    }
    for (const e of report.expenses) {
      combined.push({ kind: 'expense', date: e.business_date, amount: Number(e.amount), narration: e.narration, id: e.id, raw: e as unknown as Record<string, unknown> })
    }
    combined.sort((a, b) => a.date.localeCompare(b.date))
  }
  const sourceDetail = detailQuery.data ?? selected?.data

  if (isLoadingMe) {
    return <p className="text-sm text-muted-foreground">Loading access...</p>
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin only</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Collectors cannot view cashbook totals or opening balances.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-12rem-1px)] flex-col gap-4 overflow-hidden md:h-auto md:overflow-visible">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cashbook Report</h1>
          {report ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {report.society.name ?? 'Society'} · {from} to {to}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Opening → closing · business date inclusive</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Report actions" className="min-h-11 min-w-11 print:hidden" />}>
            <MoreVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 print:hidden">
            <DropdownMenuItem className="min-h-11" onClick={() => downloadReport('xlsx')}>Export XLSX</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => downloadReport('pdf')}>Export PDF</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => window.print()}>Print report</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => setTab('history')}>Report history</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => setOpeningEditorOpen(true)}>Edit opening cash</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" disabled={isEnablingNotifications || notificationsEnabled} onClick={enableNotifications}>
              {notificationsEnabled ? 'Notifications enabled' : isEnablingNotifications ? 'Enabling notifications...' : 'Enable notifications'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {tab === 'history' && (
        <Card className="flex-1 overflow-y-auto overscroll-contain">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Report history</CardTitle>
            <Button variant="outline" className="min-h-11" onClick={() => setTab('current')}>Back to report</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyQuery.isLoading && <p className="text-sm text-muted-foreground">Loading history...</p>}
            {historyQuery.data?.runs.length === 0 && <p className="text-sm text-muted-foreground">No saved exports yet</p>}
            {historyQuery.data?.runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <span>{run.from} to {run.to} · ₹{run.closing.toLocaleString('en-IN')}</span>
                <div className="flex gap-2">
                  <Button className="min-h-11" variant="outline" onClick={() => { setFrom(run.from); setTo(run.to); setTab('current') }}>View</Button>
                  <Button className="min-h-11" variant="outline" onClick={() => downloadReport('xlsx', run)}>XLSX</Button>
                  <Button className="min-h-11" variant="outline" onClick={() => downloadReport('pdf', run)}>PDF</Button>
                </div>
              </div>
            ))}
            {(historyQuery.data?.total ?? 0) > 10 && (
              <div className="flex justify-between">
                <Button className="min-h-11" variant="outline" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</Button>
                <Button className="min-h-11" variant="outline" disabled={historyPage * 10 >= (historyQuery.data?.total ?? 0)} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className={tab === 'history' ? 'hidden print:hidden' : 'shrink-0 border-0 bg-background/95 shadow-none print:hidden'}>
        <CardContent className="p-1">
          <div role="group" aria-label="Report range" className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
            {([
              ['today', 'Today'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['custom', 'Custom'],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                aria-pressed={activePreset === preset}
                className={`min-h-11 rounded-lg px-2 text-sm font-medium transition-colors ${activePreset === preset ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => applyPreset(preset)}
              >
                {label}
              </button>
            ))}
          </div>
          {reportQuery.isFetching && <p className="text-xs text-muted-foreground">Loading report…</p>}
          {isForbidden && <p className="text-sm text-destructive" role="alert">Admin only — collector cannot view full cashbook totals</p>}
          {isUnauth && <p className="text-sm text-destructive">Not authenticated</p>}
          {reportQuery.error && !isForbidden && !isUnauth && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              <span>Cashbook could not be loaded. Check your connection and try again.</span>
              <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => reportQuery.refetch()}>
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle className="text-xl">Custom range</SheetTitle>
            <SheetDescription>Choose both dates, then apply the range.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-from">From</Label>
              <NativeDateField id="report-from" ariaLabel="From" value={draftFrom} onChange={setDraftFrom} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">To</Label>
              <NativeDateField id="report-to" ariaLabel="To" value={draftTo} onChange={setDraftTo} />
            </div>
          </div>
          <SheetFooter>
            <Button className="min-h-12" disabled={!draftFrom || !draftTo || draftFrom > draftTo} onClick={applyCustomRange}>
              Apply range
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={openingEditorOpen} onOpenChange={setOpeningEditorOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle className="text-xl">Edit opening cash</SheetTitle>
            <SheetDescription>Cash on hand at the start of {formatDateShort(from)}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4">
            <Label htmlFor="opening-balance">Opening balance</Label>
            <Input
              id="opening-balance"
              aria-label="Opening balance"
              className="min-h-12 text-base tabular-nums"
              type="text"
              inputMode="numeric"
              placeholder="₹0"
              value={openingInput}
              onChange={(event) => setOpeningInput(event.target.value)}
            />
            {openingQuery.data?.exists === false && !openingQuery.isFetching && (
              <p className="text-sm text-muted-foreground">No opening cash has been set for this date.</p>
            )}
          </div>
          <SheetFooter>
            <Button
              className="min-h-12"
              disabled={openingQuery.isFetching || saveOpening.isPending || openingInput === '' || Number(openingInput) < 0}
              onClick={() => saveOpening.mutate()}
            >
              {saveOpening.isPending ? 'Saving...' : 'Save opening cash'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className={tab === 'history' ? 'hidden' : 'flex-1 space-y-4 overflow-y-auto overscroll-contain pb-28 md:overflow-visible md:pb-0 print:overflow-visible print:pb-0'}>
      {reportQuery.isLoading && (
        <div className="space-y-4" role="status" aria-label="Loading cashbook report">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}
      {report && (
        <Card className={tab === 'history' ? 'hidden print:hidden' : 'overflow-hidden'}>
          <CardContent className="p-0">
            <div className="bg-primary px-5 py-6 text-primary-foreground">
              <p className="text-sm font-medium opacity-80">Closing cash</p>
              <p className="mt-1 text-[2rem] font-bold leading-tight tabular-nums" data-testid="summary-closing">
                {formatCurrency(report.closing)}
              </p>
              <p className="mt-2 text-sm opacity-80">As of {formatDateShort(to)}</p>
            </div>
            <div className="divide-y">
              <button
                type="button"
                className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                onClick={() => setSelectedSummary('opening')}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">₹</span>
                <span className="flex-1 font-medium">Opening cash</span>
                <span className="font-semibold tabular-nums" data-testid="summary-opening">{formatCurrency(report.opening)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                onClick={() => setSelectedSummary('receipts')}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-success-subtle text-success"><ArrowDownLeft className="size-5" /></span>
                <span className="flex-1 font-medium">Received</span>
                <span className="font-semibold tabular-nums" data-testid="summary-receipts">+{formatCurrency(report.total_receipts)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                onClick={() => setSelectedSummary('expenses')}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-danger-subtle text-destructive"><ArrowUpRight className="size-5" /></span>
                <span className="flex-1 font-medium">Paid</span>
                <span className="font-semibold tabular-nums" data-testid="summary-expenses">−{formatCurrency(report.total_expenses)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className={tab === 'history' ? 'hidden print:hidden' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Cash movements</CardTitle>
              <Button
                variant="outline"
                className="min-h-11"
                aria-label={showVoided ? 'Hide voided receipts' : 'Show voided receipts'}
                onClick={() => setShowVoided((value) => !value)}
              >
                {showVoided ? 'Hide voided' : 'Voided'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {showVoided && (
              <div className="rounded-lg border border-dashed p-3">
                <p className="mb-2 text-xs font-medium">Voided receipt history (excluded from totals)</p>
                {voidedQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading voided receipts...</p>
                ) : (
                  (voidedQuery.data?.receipts.filter((receipt) => receipt.status === 'VOIDED') ?? []).map((receipt) => (
                    <button
                      type="button"
                      key={receipt.id}
                      className="flex w-full justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
                      onClick={() => setSelected({ kind: 'receipt', data: receipt as unknown as Record<string, unknown> })}
                    >
                      <span>{receipt.business_date} · {receipt.narration ?? 'Voided receipt'}</span>
                      <span>₹{Number(receipt.amount).toLocaleString('en-IN')}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {combined.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receipts or expenses in this range</p>
            ) : (
              <div className="divide-y md:hidden">
                {combined.map((row) => {
                  const isReceipt = row.kind === 'receipt'
                  const title = row.narration ?? (isReceipt ? 'Receipt' : 'Expense')
                  const context = isReceipt
                    ? `Flat ${(row.raw.flat as CashbookReport['receipts'][number]['flat'] | undefined)?.flat_number ?? 'Unknown'} · ${(row.raw.fund as CashbookReport['receipts'][number]['fund'] | null)?.name ?? 'No fund'}`
                    : `${(row.raw.vendor as CashbookReport['expenses'][number]['vendor'] | null)?.name ?? 'No vendor'} · ${(row.raw.category as CashbookReport['expenses'][number]['category'] | undefined)?.name ?? 'Uncategorised'}`
                  return (
                    <button
                      type="button"
                      key={`${row.kind}-${row.id}`}
                      className="flex min-h-[72px] w-full items-center gap-3 py-3 text-left transition-colors active:bg-muted"
                      onClick={() => setSelected({ kind: row.kind, data: row.raw })}
                    >
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${isReceipt ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-destructive'}`}>
                        {isReceipt ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{isReceipt ? 'Received' : 'Paid'} · {title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{formatDateShort(row.date)} · {context}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{isReceipt ? '+' : '−'}{formatCurrency(row.amount)}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {combined.length > 0 && (
              <div className="hidden overflow-x-auto md:block print:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Particulars / Narration</th>
                      <th className="py-2 text-right">Receipt</th>
                      <th className="py-2 text-right">Payment</th>
                      <th className="py-2 text-left">Fund / Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combined.map((row) => (
                      <tr
                        key={`${row.kind}-${row.id}`}
                        className="border-b last:border-0 hover:bg-muted/40"
                        data-testid={`statement-row-${row.id}`}
                      >
                        <td className="py-2">{row.date}</td>
                        <td className="py-2">
                          <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => setSelected({ kind: row.kind, data: row.raw })}>
                            {row.narration ?? 'View source'}
                          </button>
                        </td>
                        <td className="py-2 text-right text-success">{row.kind === 'receipt' ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}</td>
                        <td className="py-2 text-right text-destructive">{row.kind === 'expense' ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {row.kind === 'receipt'
                            ? `${(row.raw.flat as CashbookReport['receipts'][number]['flat'] | undefined)?.flat_number ?? (row.raw.flat_id as string)?.slice(0, 8) ?? '—'} · ${(row.raw.fund as CashbookReport['receipts'][number]['fund'])?.name ?? (row.raw.fund_id as string)?.slice(0, 8) ?? '—'}`
                            : `${(row.raw.category as CashbookReport['expenses'][number]['category'] | undefined)?.name ?? (row.raw.category_id as string)?.slice(0, 8) ?? '—'} · ${(row.raw.vendor as CashbookReport['expenses'][number]['vendor'])?.name ?? (row.raw.vendor_id as string)?.slice(0, 8) ?? '—'} · ${(row.raw.fund as CashbookReport['expenses'][number]['fund'])?.name ?? (row.raw.fund_id as string)?.slice(0, 8) ?? '—'}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Every total is drillable. Tap a row to see its source record.</p>
          </CardContent>
        </Card>
      )}
      </div>

      <Sheet open={!!selectedSummary} onOpenChange={(open) => !open && setSelectedSummary(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle className="text-xl">
              {selectedSummary === 'receipts' ? 'Money received' : selectedSummary === 'expenses' ? 'Money paid' : selectedSummary === 'opening' ? 'Opening cash' : 'Closing cash'}
            </SheetTitle>
            <SheetDescription>{formatDateShort(from)} to {formatDateShort(to)}</SheetDescription>
          </SheetHeader>
          <div className="divide-y px-4">
            {selectedSummary === 'opening' && (
              <div className="flex min-h-[64px] items-center justify-between gap-4">
                <span className="text-muted-foreground">Balance brought forward</span>
                <span className="font-semibold tabular-nums">{formatCurrency(report?.opening ?? 0)}</span>
              </div>
            )}
            {selectedSummary === 'receipts' && report?.receipts.map((receipt) => (
              <button
                type="button"
                key={receipt.id}
                className="flex min-h-[68px] w-full items-center justify-between gap-4 py-3 text-left"
                onClick={() => {
                  setSelectedSummary(null)
                  setSelected({ kind: 'receipt', data: receipt as unknown as Record<string, unknown> })
                }}
              >
                <span>
                  <span className="block font-medium">{receipt.narration ?? `Receipt from flat ${receipt.flat?.flat_number ?? 'unknown'}`}</span>
                  <span className="block text-sm text-muted-foreground">{formatDateShort(receipt.business_date)} · Flat {receipt.flat?.flat_number ?? 'Unknown'}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">+{formatCurrency(receipt.amount)}</span>
              </button>
            ))}
            {selectedSummary === 'expenses' && report?.expenses.map((expense) => (
              <button
                type="button"
                key={expense.id}
                className="flex min-h-[68px] w-full items-center justify-between gap-4 py-3 text-left"
                onClick={() => {
                  setSelectedSummary(null)
                  setSelected({ kind: 'expense', data: expense as unknown as Record<string, unknown> })
                }}
              >
                <span>
                  <span className="block font-medium">{expense.narration ?? expense.category.name}</span>
                  <span className="block text-sm text-muted-foreground">{formatDateShort(expense.business_date)} · {expense.vendor?.name ?? 'No vendor'}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">−{formatCurrency(expense.amount)}</span>
              </button>
            ))}
            {selectedSummary === 'closing' && (
              <p className="py-4 text-sm tabular-nums">
                {formatCurrency(report?.opening ?? 0)} + {formatCurrency(report?.total_receipts ?? 0)} − {formatCurrency(report?.total_expenses ?? 0)} = {formatCurrency(report?.closing ?? 0)}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle className="text-xl">{selected?.kind === 'receipt' ? 'Receipt details' : 'Expense details'}</SheetTitle>
            <SheetDescription>Source movement included in this cashbook report.</SheetDescription>
          </SheetHeader>
          {selected && detailQuery.isLoading && <p className="px-4 text-sm text-muted-foreground">Loading details...</p>}
          {selected && detailQuery.isError && <p className="mx-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">Details could not be loaded. Close this sheet and try again.</p>}
          {selected && sourceDetail && !detailQuery.isLoading && (
            <div className="divide-y px-4 text-sm">
              <div className="flex min-h-[56px] items-center justify-between gap-4">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold tabular-nums">{formatCurrency(Number(sourceDetail.amount ?? 0))}</span>
              </div>
              <div className="flex min-h-[56px] items-center justify-between gap-4">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDateShort(String(sourceDetail.business_date ?? ''))}</span>
              </div>
              {selected.kind === 'receipt' ? (
                <>
                  <div className="flex min-h-[56px] items-center justify-between gap-4">
                    <span className="text-muted-foreground">Flat</span>
                    <span>{(sourceDetail.flat as CashbookReport['receipts'][number]['flat'] | undefined)?.flat_number ?? 'Unknown flat'}</span>
                  </div>
                  <div className="flex min-h-[56px] items-center justify-between gap-4">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{String(sourceDetail.type ?? 'Regular').toLowerCase()}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-h-[56px] items-center justify-between gap-4">
                    <span className="text-muted-foreground">Vendor</span>
                    <span>{(sourceDetail.vendor as CashbookReport['expenses'][number]['vendor'] | undefined)?.name ?? 'No vendor'}</span>
                  </div>
                  <div className="flex min-h-[56px] items-center justify-between gap-4">
                    <span className="text-muted-foreground">Category</span>
                    <span>{(sourceDetail.category as CashbookReport['expenses'][number]['category'] | undefined)?.name ?? 'Uncategorised'}</span>
                  </div>
                </>
              )}
              <div className="flex min-h-[56px] items-center justify-between gap-4">
                <span className="text-muted-foreground">Fund</span>
                <span>{(sourceDetail.fund as CashbookReport['receipts'][number]['fund'] | undefined)?.name ?? 'No fund'}</span>
              </div>
              {Boolean(sourceDetail.narration) && (
                <div className="py-4">
                  <span className="block text-muted-foreground">Narration</span>
                  <span className="mt-1 block">{String(sourceDetail.narration)}</span>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
