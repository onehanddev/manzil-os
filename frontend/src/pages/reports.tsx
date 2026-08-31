import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMe } from '@/lib/api/hooks'
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
  const [openingInput, setOpeningInput] = useState('')
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
      toast.success('Opening balance saved')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to save opening balance'),
  })

  function applyPreset(preset: 'today' | 'week' | 'month' | 'custom') {
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

  async function downloadReport(format: 'xlsx' | 'pdf', range = { from, to }) {
    try {
      const token = useAuthStore.getState().accessToken
      const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <Button variant="outline" size="sm" disabled={isEnablingNotifications || notificationsEnabled} onClick={enableNotifications}>
          {notificationsEnabled ? 'Notifications enabled' : isEnablingNotifications ? 'Enabling notifications...' : 'Enable notifications'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant={tab === 'current' ? 'default' : 'outline'} size="sm" onClick={() => setTab('current')}>Current</Button>
        <Button variant={tab === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setTab('history')}>History</Button>
        <Button variant="outline" size="sm" onClick={() => downloadReport('xlsx')}>Download XLSX</Button>
        <Button variant="outline" size="sm" onClick={() => downloadReport('pdf')}>Download PDF</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Print report</Button>
      </div>

      {tab === 'history' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Report history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {historyQuery.isLoading && <p className="text-sm text-muted-foreground">Loading history...</p>}
            {historyQuery.data?.runs.length === 0 && <p className="text-sm text-muted-foreground">No saved exports yet</p>}
            {historyQuery.data?.runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <span>{run.from} to {run.to} · ₹{run.closing.toLocaleString('en-IN')}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setFrom(run.from); setTo(run.to); setTab('current') }}>View</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadReport('xlsx', run)}>XLSX</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadReport('pdf', run)}>PDF</Button>
                </div>
              </div>
            ))}
            {(historyQuery.data?.total ?? 0) > 10 && (
              <div className="flex justify-between">
                <Button size="sm" variant="outline" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={historyPage * 10 >= (historyQuery.data?.total ?? 0)} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className={tab === 'history' ? 'hidden print:hidden' : 'print:hidden'}>
        <CardHeader>
          <CardTitle className="text-sm">Report range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={activePreset === 'today' ? 'default' : 'outline'} size="sm" onClick={() => applyPreset('today')}>
              Today
            </Button>
            <Button variant={activePreset === 'week' ? 'default' : 'outline'} size="sm" onClick={() => applyPreset('week')}>
              This Week
            </Button>
            <Button variant={activePreset === 'month' ? 'default' : 'outline'} size="sm" onClick={() => applyPreset('month')}>
              This Month
            </Button>
            <Button variant={activePreset === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setActivePreset('custom')}>
              Custom
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="report-from">From</Label>
              <Input id="report-from" type="date" value={from} onChange={(e) => { setOpeningInput(''); setFrom(e.target.value); setActivePreset('custom') }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-to">To</Label>
              <Input id="report-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset('custom') }} />
            </div>
          </div>
          {reportQuery.isFetching && <p className="text-xs text-muted-foreground">Loading report…</p>}
          {isForbidden && <p className="text-sm text-destructive" role="alert">Admin only — collector cannot view full cashbook totals</p>}
          {isUnauth && <p className="text-sm text-destructive">Not authenticated</p>}
          {reportQuery.error && !isForbidden && !isUnauth && <p className="text-sm text-destructive">{reportQuery.error.message}</p>}
        </CardContent>
      </Card>

      <Card className={tab === 'history' ? 'hidden print:hidden' : 'print:hidden'}>
        <CardHeader>
          <CardTitle className="text-sm">Cash opening balance for {from}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {openingQuery.isFetching && <p className="text-xs text-muted-foreground">Loading opening…</p>}
          {openingQuery.data?.exists === false && !openingQuery.isFetching && (
            <p className="text-xs text-amber-600">No opening set for this date — enter amount and save</p>
          )}
          <div className="flex gap-2">
            <Label htmlFor="opening-balance" className="sr-only">
              Opening balance
            </Label>
            <Input
              id="opening-balance"
              aria-label="Opening balance"
              type="text"
              inputMode="numeric"
              placeholder="Amount for selected from date"
              value={openingInput}
              onChange={(e) => setOpeningInput(e.target.value)}
            />
            <Button
              disabled={openingQuery.isFetching || saveOpening.isPending || openingInput === '' || Number(openingInput) < 0}
              onClick={() => {
                if (Number(openingInput) < 0) {
                  toast.error('amount must be >= 0')
                  return
                }
                saveOpening.mutate()
              }}
            >
              {saveOpening.isPending ? 'Saving…' : 'Save opening'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Keyed by (society, opening_date) · amount ≥ 0 · admin-only</p>
        </CardContent>
      </Card>

      {report && (
        <Card className={tab === 'history' ? 'hidden print:hidden' : ''}>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <button type="button" className="rounded-lg border p-3 text-left" onClick={() => setSelectedSummary('opening')}>
                <div className="text-xs text-muted-foreground">Opening</div>
                <div className="text-base font-semibold" data-testid="summary-opening">₹{report.opening.toLocaleString('en-IN')}</div>
              </button>
              <button type="button" className="rounded-lg border p-3 text-left" onClick={() => setSelectedSummary('receipts')}>
                <div className="text-xs text-muted-foreground">Total receipts</div>
                <div className="text-base font-semibold text-emerald-600" data-testid="summary-receipts">₹{report.total_receipts.toLocaleString('en-IN')}</div>
              </button>
              <button type="button" className="rounded-lg border p-3 text-left" onClick={() => setSelectedSummary('expenses')}>
                <div className="text-xs text-muted-foreground">Total expenses</div>
                <div className="text-base font-semibold text-red-600" data-testid="summary-expenses">₹{report.total_expenses.toLocaleString('en-IN')}</div>
              </button>
              <button type="button" className="rounded-lg border bg-muted/30 p-3 text-left" onClick={() => setSelectedSummary('closing')}>
                <div className="text-xs text-muted-foreground">Closing = opening + receipts − expenses</div>
                <div className="text-base font-semibold" data-testid="summary-closing">₹{report.closing.toLocaleString('en-IN')}</div>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className={tab === 'history' ? 'hidden print:hidden' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Combined statement — receipts &amp; expenses</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowVoided((value) => !value)}>
                {showVoided ? 'Hide voided receipts' : 'Show voided receipts'}
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
              <div className="overflow-x-auto">
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
                        <td className="py-2 text-right text-emerald-600">{row.kind === 'receipt' ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}</td>
                        <td className="py-2 text-right text-red-600">{row.kind === 'expense' ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}</td>
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
            <p className="text-[11px] text-muted-foreground">Every total is drillable — tap a row to see source receipt/expense record</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.kind === 'receipt' ? 'Receipt detail' : 'Expense detail'}</DialogTitle>
          </DialogHeader>
          {selected && detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading source record...</p>}
          {selected && detailQuery.data && (
            <div className="space-y-2 text-sm">
              {Object.entries(detailQuery.data).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b py-1 last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono text-xs">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedSummary} onOpenChange={(open) => !open && setSelectedSummary(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedSummary ? `${selectedSummary[0].toUpperCase()}${selectedSummary.slice(1)} sources` : 'Summary sources'}</DialogTitle>
          </DialogHeader>
          {selectedSummary === 'opening' && <p className="text-sm">Opening balance for {from}: ₹{report?.opening.toLocaleString('en-IN')}</p>}
          {selectedSummary === 'receipts' && report?.receipts.map((receipt) => <p key={receipt.id} className="text-sm">{receipt.business_date} · {receipt.narration ?? receipt.id} · ₹{Number(receipt.amount).toLocaleString('en-IN')}</p>)}
          {selectedSummary === 'expenses' && report?.expenses.map((expense) => <p key={expense.id} className="text-sm">{expense.business_date} · {expense.narration ?? expense.id} · ₹{Number(expense.amount).toLocaleString('en-IN')}</p>)}
          {selectedSummary === 'closing' && <p className="text-sm">₹{report?.opening.toLocaleString('en-IN')} + ₹{report?.total_receipts.toLocaleString('en-IN')} - ₹{report?.total_expenses.toLocaleString('en-IN')} = ₹{report?.closing.toLocaleString('en-IN')}</p>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
