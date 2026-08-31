import { HandCoins, Wallet, BarChart3, Building2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'
import { PagePlaceholder } from '@/components/page-placeholder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardPage() {
  const { data: me, isLoading } = useMe()
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  const current = me?.memberships?.find((m) => m.society.id === currentSocietyId)
  const currentRoles = (current?.roles ?? []) as string[]
  const isAdmin = me?.platform_admin === true || currentRoles.includes('super_admin') || currentRoles.includes('SOCIETY_ADMIN')

  return (
    <PagePlaceholder
      title="Dashboard"
      description={
        current
          ? `${current.society.name} — ${current.society.location ?? 'Society'} — Phase 0 pilot cashbook`
          : 'Phase 0 pilot — receipts, expenses, and cashbook report'
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Receipts', icon: HandCoins, to: '/receipts', hint: 'Record maintenance' },
            { label: 'Expenses', icon: Wallet, to: '/expenses', hint: 'Record payments' },
            { label: 'Cashbook Report', icon: BarChart3, to: '/reports', hint: 'Opening → closing' },
            { label: 'Flats & Funds', icon: Building2, to: '/flats', hint: 'Master data' },
          ].filter((item) => item.to !== '/reports' || isAdmin).map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.label} className="hover:bg-accent/50 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" />
                    {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">{item.hint}</div>
                  <NavLink to={item.to} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                    Open
                  </NavLink>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Phase 0 scope</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pilot cashbook only — opening cash, maintenance receipts, expenses, and closing cash.
          Billing, members, multi-society, and settings are deferred to Phase 1 (see PHASE_0_PRD.md).
        </p>
      </div>
    </PagePlaceholder>
  )
}
