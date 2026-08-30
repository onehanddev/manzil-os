import { Building2 } from 'lucide-react'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'
import { PagePlaceholder } from '@/components/page-placeholder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardPage() {
  const { data: me, isLoading } = useMe()
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  const current = me?.memberships.find((m) => m.society.id === currentSocietyId)

  return (
    <PagePlaceholder
      title={current ? current.society.name : 'Dashboard'}
      description={
        current
          ? `${current.society.location ?? 'Society'} · ${current.roles.join(', ')}`
          : 'Overview of your society'
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {['Fund balance', 'Outstanding dues', 'Collected this month', 'Expenses this month'].map(
          (label) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="flex items-center gap-1 text-xl font-semibold">
                    <Building2 className="size-4 text-muted-foreground" />
                    —
                  </div>
                )}
              </CardContent>
            </Card>
          ),
        )}
      </div>
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Dashboard widgets (fund balances, outstanding, recent activity) land in
        the UX pass.
      </div>
    </PagePlaceholder>
  )
}
