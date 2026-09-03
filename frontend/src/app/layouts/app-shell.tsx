import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PiggyBank,
  Shapes,
  Store,
  Tags,
  Users,
  Wallet,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api/client'
import { useMe } from '@/lib/api/hooks'
import type { Society } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { useSocietyStore } from '@/stores/society-store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SheetDescription,
  SheetHeader,
} from '@/components/ui/sheet'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  group?: 'society' | 'financial'
  summary?: string
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/receipts', label: 'Collect', icon: HandCoins },
  { to: '/expenses', label: 'Spend', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const MORE_NAV: NavItem[] = [
  { to: '/flats', label: 'Flats', icon: Building2, group: 'society', summary: 'Occupants, dues, and ledger' },
  { to: '/people', label: 'People', icon: Users, group: 'society', summary: 'Owners, tenants, and contacts' },
  { to: '/flat-categories', label: 'Flat categories', icon: Shapes, group: 'society', summary: 'Maintenance defaults' },
  { to: '/funds', label: 'Funds', icon: PiggyBank, group: 'financial', summary: 'Receipt and expense buckets' },
  { to: '/vendors', label: 'Vendors', icon: Store, group: 'financial', summary: 'Expense payees' },
  { to: '/expense-categories', label: 'Expense categories', icon: Tags, group: 'financial', summary: 'Spending groups' },
]

function getInitials(name: string | undefined) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function AppShell() {
  const { data: me, isLoading } = useMe()
  const onboardingQ = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.get<{ needs_onboarding: boolean }>('/onboarding/status'),
    enabled: !isLoading && !!me,
    retry: false,
  })
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clear)
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  const setCurrentSociety = useSocietyStore((s) => s.setCurrentSociety)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const societies = me?.memberships?.map((m) => m.society) ?? []
  const current = societies.find((s) => s.id === currentSocietyId) ?? societies[0] ?? null
  const currentMembership = me?.memberships?.find((membership) => membership.society.id === currentSocietyId) ?? me?.memberships?.[0]
  const currentRoles = (currentMembership?.roles ?? []) as string[]
  const normalizedRoles = currentRoles.map((role) => role.toLowerCase())
  const permissions = (currentMembership?.permissions ?? []) as string[]
  const isAdmin = me?.platform_admin === true || normalizedRoles.includes('super_admin') || normalizedRoles.includes('society_admin')
  const isCollector = normalizedRoles.includes('collector')

  const primaryNav = PRIMARY_NAV.filter((item) => {
    if (item.to === '/reports') return isAdmin || permissions.includes('*') || permissions.includes('report:view')
    if (item.to === '/expenses') {
      // Collector without explicit expense permission should not see Spend
      if (!isAdmin && isCollector) {
        if (!permissions.includes('*') && !permissions.includes('expense:create') && !permissions.includes('expense:view')) return false
      }
    }
    return true
  })
  const moreNav = MORE_NAV.filter(() => isAdmin)

  useEffect(() => {
    if (!currentSocietyId && societies.length > 0) {
      setCurrentSociety(societies[0].id)
    }
  }, [currentSocietyId, societies, setCurrentSociety])

  useEffect(() => {
    const isPending = !!me && (me.memberships?.length ?? 0) === 0 && !isAdmin && !isCollector
    if (isPending && location.pathname !== '/pending') {
      navigate('/pending', { replace: true })
      return
    }
    if (onboardingQ.data?.needs_onboarding && location.pathname !== '/onboarding' && !isPending) {
      navigate('/onboarding', { replace: true })
    }
  }, [me, onboardingQ.data, location.pathname, navigate, isAdmin, isCollector])

  const handleLogout = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut()
    } catch {
      // ignore
    }
    const token = useAuthStore.getState().accessToken
    if (token) {
      try {
        await api.post('/auth/logout')
      } catch {
        // ignore
      }
    }
    clearAuth()
    useSocietyStore.getState().setCurrentSociety(null)
    queryClient.clear()
    navigate('/login', { replace: true })
  }, [clearAuth, navigate, queryClient])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background print:h-auto print:overflow-visible">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[env(safe-area-inset-top)] print:hidden">
        <div className="flex h-14 items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <NavLink to="/dashboard" className="mr-1 font-semibold tracking-tight">
            Manzil OS
          </NavLink>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <SocietyLabel societies={societies} current={current} loading={isLoading} />
            <UserMenu
              name={user?.displayName ?? me?.user.display_name}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1">
        <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 p-3 md:flex print:hidden">
          <nav className="flex flex-col gap-1">
            {[...primaryNav, ...moreNav].map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-6 pb-28 md:px-8 md:pb-8 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>

      <MobileNav items={primaryNav} moreItems={moreNav} onLogout={handleLogout} />
    </div>
  )
}

type BellNotification = {
  id: string
  channel: string
  message: string | null
  created_at: string | null
}

type PendingApproval = {
  user_id: string
  mobile: string
  display_name: string
  membership_id: string
  status: string
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: BellNotification[] }>('/notifications'),
    refetchInterval: 60_000,
  })
  const rows = notifications.data?.notifications ?? []
  const hasSignupRequest = rows.some((row) => row.channel === 'IN_APP' && row.message?.includes('pending approval'))
  const pending = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => api.get<{ pending: PendingApproval[] }>('/admin/pending'),
    enabled: open && hasSignupRequest,
    retry: false,
  })
  const pendingRows = pending.data?.pending ?? []
  const approveUser = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/users/${userId}/approve`, { role: 'COLLECTOR' }),
    onSuccess: (_data, userId) => {
      const approved = pendingRows.find((row) => row.user_id === userId)
      const message = `${approved?.display_name ?? 'User'} approved as collector`
      setApprovalMessage(message)
      toast.success(message)
      void queryClient.invalidateQueries({ queryKey: ['admin-pending'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not approve user')
    },
  })
  const label = `Notifications (${rows.length})`

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={label} className="relative" />}
      >
        <Bell className="size-4" />
        {rows.length > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-background shadow-sm">
            {rows.length > 9 ? '9+' : rows.length}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)] max-h-[92dvh] overflow-y-auto">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Recent updates for your society</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4">
          {approvalMessage && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              {approvalMessage}
            </p>
          )}
          {pendingRows.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-sm font-semibold">Pending sign-up requests</p>
              <div className="mt-3 space-y-2">
                {pendingRows.map((pendingUser) => (
                  <div key={pendingUser.user_id} className="rounded-lg bg-background/80 p-3 text-foreground shadow-sm">
                    <p className="text-sm font-medium">{pendingUser.display_name}</p>
                    <p className="text-xs text-muted-foreground">{pendingUser.mobile}</p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={approveUser.isPending}
                      onClick={() => approveUser.mutate(pendingUser.user_id)}
                    >
                      Approve as collector
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-muted-foreground">New receipts and reports will appear here.</p>
            </div>
          ) : (
            rows.map((notification) => (
              <div key={notification.id} className="rounded-xl border bg-card p-3">
                <p className="text-sm leading-relaxed">{notification.message ?? 'New update'}</p>
                {notification.created_at && (
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="size-4" />
      {item.label}
    </NavLink>
  )
}

function MobileNav({ items, moreItems, onLogout }: { items: NavItem[]; moreItems: NavItem[]; onLogout: () => void | Promise<void> }) {
  const cols = items.length + 1
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden" aria-label="Primary">
      <div className="grid h-16 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <MobileLink key={item.to} item={item} />
        ))}
        <MoreSheet items={moreItems} onLogout={onLogout} />
      </div>
    </nav>
  )
}

function MobileLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 text-[11px] font-medium',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )
      }
    >
      <Icon className="size-5" />
      {item.label}
    </NavLink>
  )
}

function MoreSheet({ items, onLogout }: { items: NavItem[]; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const societyItems = items.filter((item) => item.group === 'society')
  const financialItems = items.filter((item) => item.group === 'financial')
  const isActive = items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) requestAnimationFrame(() => triggerRef.current?.focus())
      }}
    >
      <SheetTrigger
        ref={triggerRef}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {isActive && <span className="absolute top-1 h-0.5 w-6 rounded-full bg-primary" aria-hidden />}
        <MoreHorizontal className="size-5" />
        More
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)] max-h-[92dvh] overflow-y-auto">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetTitle className="mb-2 px-1 text-sm font-semibold">
          More
        </SheetTitle>
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No additional settings for your role.
          </p>
        ) : (
          <div className="space-y-5 px-1 pb-1">
            <SettingsGroup title="Society setup" items={societyItems} onNavigate={() => setOpen(false)} />
            <SettingsGroup title="Financial setup" items={financialItems} onNavigate={() => setOpen(false)} />
          </div>
        )}
        <div className="border-t px-1 pt-4">
          <p className="mb-2 px-2 text-xs font-semibold text-muted-foreground">Account</p>
          <button
            type="button"
            onClick={() => { setOpen(false); void onLogout() }}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 text-left text-destructive transition-colors hover:bg-destructive/10 active:scale-[0.99]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10"><LogOut className="size-5" /></span>
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SettingsGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: () => void }) {
  return (
    <section>
      <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => cn(
                'flex min-h-[64px] items-center gap-3 px-3 py-2 transition-colors active:scale-[0.99]',
                index > 0 && 'border-t',
                isActive ? 'bg-primary/5 text-primary' : 'hover:bg-muted/50',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.summary}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </NavLink>
          )
        })}
      </div>
    </section>
  )
}

function SocietyLabel({
  societies,
  current,
  loading,
}: {
  societies: Society[]
  current: Society | null
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-4 w-24" />
  // Single-society pilot: always read-only label, never a dropdown/combobox.
  // Range covers demo/mock with multiple societies — label still read-only.
  return (
    <span className="max-w-32 truncate px-2 text-sm font-medium" data-testid="society-label">
      {current?.name ?? societies[0]?.name ?? 'Society'}
    </span>
  )
}

function UserMenu({
  name,
  onLogout,
}: {
  name: string | undefined
  onLogout: () => void | Promise<void>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account" />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {name ?? 'User'}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
