import { NavLink } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, HandCoins, Wallet, Building2, PiggyBank, BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'
import { api, ApiError } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type CashbookReport = {
  society: { id: string; name: string | null }
  from: string
  to: string
  opening: number
  total_receipts: number
  total_expenses: number
  closing: number
  receipts: Array<{ id: string; flat: { flat_number: string }; amount: number; business_date: string; narration?: string | null; flat_id?: string }>
  expenses: Array<{ id: string; amount: number; business_date: string; narration?: string | null; vendor?: { name: string } | null; category?: { name: string } | null }>
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() {
  return fmt(new Date())
}
function formatCurrency(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function formatDateShort(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DashboardPage() {
  const { data: me, isLoading: meLoading } = useMe()
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  // Defensive: memberships may be undefined/null per TDD crash test
  const memberships = (me?.memberships ?? []) as Array<{ society: { id: string; name: string; location?: string | null }; roles: string[]; permissions?: string[] }>
  const current = memberships.find((m) => m.society.id === currentSocietyId) ?? memberships[0]
  const currentRoles = (current?.roles ?? []) as string[]
  const isAdmin = me?.platform_admin === true || currentRoles.includes('super_admin') || currentRoles.includes('SOCIETY_ADMIN')
  const isCollector = currentRoles.includes('collector') && !isAdmin
  const societyName = current?.society.name ?? 'Society'

  const today = todayStr()

  const reportQuery = useQuery<CashbookReport, ApiError>({
    queryKey: ['home-cashbook', today, today],
    queryFn: () => api.get<CashbookReport>(`/reports/cashbook?from=${today}&to=${today}`),
    enabled: !meLoading,
    retry: false,
  })

  const report = reportQuery.data
  const isError = reportQuery.isError
  const isLoadingReport = reportQuery.isLoading
  const canShowCash = !!report && !isError

  // Activity derived from report for human-readable display
  const activities: Array<{ id: string; kind: 'receipt' | 'expense'; label: string; context: string; amount: number; date: string }> = []
  if (report) {
    for (const r of report.receipts) {
      activities.push({
        id: r.id,
        kind: 'receipt',
        label: r.flat?.flat_number ?? 'Flat',
        context: r.narration ?? 'Maintenance',
        amount: Number(r.amount),
        date: r.business_date,
      })
    }
    for (const e of report.expenses) {
      activities.push({
        id: e.id,
        kind: 'expense',
        label: e.vendor?.name ?? e.category?.name ?? 'Expense',
        context: e.narration ?? '',
        amount: Number(e.amount),
        date: e.business_date,
      })
    }
    activities.sort((a, b) => b.date.localeCompare(a.date))
  }
  const recent = activities.slice(0, 5)

  // Quick actions: admin sees both, collector sees only Collect
  const showCollect = true
  const showSpend = isAdmin || !isCollector

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {societyName} · Today · {formatDateShort(today)}
        </p>
      </div>

      {isLoadingReport ? (
        <div className="space-y-4" role="status" aria-label="Loading home">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : null}

      {isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-foreground">
          <span>Cash summary could not be loaded. Check connection and try again.</span>
          <Button variant="outline" size="sm" className="shrink-0 min-h-11" onClick={() => reportQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {canShowCash ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-primary px-5 py-6 text-primary-foreground">
              <p className="text-sm font-medium opacity-80">Current cash</p>
              <p className="mt-1 text-[2rem] font-bold leading-tight tabular-nums">{formatCurrency(report.closing)}</p>
              <p className="mt-1 text-xs opacity-70">Closing cash · as of {formatDateShort(today)}</p>
            </div>
            <div className="grid grid-cols-2 divide-x">
              <div className="flex flex-col gap-1 px-4 py-4">
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ArrowDownLeft className="size-3.5 text-success" /> Received
                </span>
                <span className="text-lg font-semibold tabular-nums">{formatCurrency(report.total_receipts)}</span>
                <span className="text-xs text-muted-foreground">Today</span>
              </div>
              <div className="flex flex-col gap-1 px-4 py-4">
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ArrowUpRight className="size-3.5 text-destructive" /> Paid
                </span>
                <span className="text-lg font-semibold tabular-nums">{formatCurrency(report.total_expenses)}</span>
                <span className="text-xs text-muted-foreground">Today</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick actions — whole card tappable */}
      <div className="grid grid-cols-2 gap-3">
        {showCollect ? (
          <NavLink
            to="/receipts"
            className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-4 py-5 text-center shadow-sm transition-colors hover:bg-accent active:scale-[0.99]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <HandCoins className="size-5" />
            </span>
            <span className="text-sm font-semibold">Collect</span>
            <span className="text-xs text-muted-foreground">Record maintenance</span>
          </NavLink>
        ) : null}
        {showSpend ? (
          <NavLink
            to="/expenses"
            className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-4 py-5 text-center shadow-sm transition-colors hover:bg-accent active:scale-[0.99]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
              <Wallet className="size-5" />
            </span>
            <span className="text-sm font-semibold">Spend</span>
            <span className="text-xs text-muted-foreground">Record payment</span>
          </NavLink>
        ) : null}
      </div>

      {/* Admin shortcut to reports */}
      {isAdmin ? (
        <NavLink
          to="/reports"
          className="flex min-h-[56px] items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-accent active:scale-[0.99]"
        >
          <BarChart3 className="size-5 text-muted-foreground" />
          View cashbook report
          <span className="ml-auto text-xs text-muted-foreground">Opening → closing</span>
        </NavLink>
      ) : null}

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoadingReport ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : recent.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm font-medium">No activity yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Receipts and expenses for today will appear here.</p>
            </div>
          ) : (
            recent.map((a) => (
              <div
                key={a.id}
                className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border bg-card px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`flex size-8 items-center justify-center rounded-full ${a.kind === 'receipt' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-destructive'}`}>
                      {a.kind === 'receipt' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <span className="truncate text-sm font-semibold">{a.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {formatDateShort(a.date)} · {a.context}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {a.kind === 'receipt' ? '+' : '−'}{formatCurrency(a.amount)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Setup hints for admin */}
      {isAdmin ? (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Setup</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <NavLink to="/flats" className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
              <Building2 className="size-4" /> Flats
            </NavLink>
            <NavLink to="/funds" className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
              <PiggyBank className="size-4" /> Funds
            </NavLink>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
