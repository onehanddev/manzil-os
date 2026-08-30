import { Check } from 'lucide-react'
import { useMe } from '@/lib/api/hooks'
import { useSocietyStore } from '@/stores/society-store'
import { PagePlaceholder } from '@/components/page-placeholder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function SocietiesPage() {
  const { data: me, isLoading } = useMe()
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  const setCurrentSociety = useSocietyStore((s) => s.setCurrentSociety)

  return (
    <PagePlaceholder
      title="Societies"
      description="Switch between the societies you belong to"
    >
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        {me?.memberships.map((m) => {
          const active = m.society.id === currentSocietyId
          return (
            <Card key={m.society.id} className={cn(active && 'border-primary')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{m.society.name}</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {m.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {[m.society.location, m.society.city].filter(Boolean).join(' · ') || '—'}
                </p>
                <Button
                  size="sm"
                  variant={active ? 'outline' : 'default'}
                  disabled={active}
                  onClick={() => setCurrentSociety(m.society.id)}
                >
                  {active && <Check />}
                  {active ? 'Active' : 'Switch'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {!isLoading && me && me.memberships.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            You are not a member of any society yet.
          </div>
        )}
      </div>
    </PagePlaceholder>
  )
}
