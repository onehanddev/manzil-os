import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building,
  Building2,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PiggyBank,
  Receipt,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useMe } from '@/lib/api/hooks'
import type { Society } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { useSocietyStore } from '@/stores/society-store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/receipts', label: 'Receipts', icon: HandCoins },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
]

const MORE_NAV: NavItem[] = [
  { to: '/members', label: 'Members', icon: Users },
  { to: '/flats', label: 'Flats', icon: Building2 },
  { to: '/funds', label: 'Funds', icon: PiggyBank },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/societies', label: 'Societies', icon: Building },
  { to: '/settings', label: 'Settings', icon: Settings },
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
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clear)
  const currentSocietyId = useSocietyStore((s) => s.currentSocietyId)
  const setCurrentSociety = useSocietyStore((s) => s.setCurrentSociety)
  const navigate = useNavigate()

  const societies = me?.memberships.map((m) => m.society) ?? []
  const current = societies.find((s) => s.id === currentSocietyId) ?? null

  // Auto-select the first society once memberships load.
  useEffect(() => {
    if (!currentSocietyId && societies.length > 0) {
      setCurrentSociety(societies[0].id)
    }
  }, [currentSocietyId, societies, setCurrentSociety])

  function handleLogout() {
    void supabase?.auth.signOut()
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2 px-4">
          <NavLink to="/dashboard" className="mr-1 font-semibold tracking-tight">
            Manzil OS
          </NavLink>
          <div className="ml-auto flex items-center gap-1">
            <SocietySwitcher
              societies={societies}
              current={current}
              loading={isLoading}
              onChange={setCurrentSociety}
            />
            <UserMenu
              name={user?.displayName ?? me?.user.display_name}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r bg-muted/30 p-3 md:flex">
          <nav className="flex flex-col gap-1">
            {[...PRIMARY_NAV, ...MORE_NAV].map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main className="min-h-[calc(100dvh-3.5rem)] flex-1 px-4 py-6 pb-28 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      <MobileNav />
    </div>
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

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid h-16 grid-cols-5">
        {PRIMARY_NAV.map((item) => (
          <MobileLink key={item.to} item={item} />
        ))}
        <MoreSheet />
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

function MoreSheet() {
  return (
    <Sheet>
      <SheetTrigger className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
        <MoreHorizontal className="size-5" />
        More
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
        <SheetTitle className="mb-2 px-1 text-sm font-semibold">
          More
        </SheetTitle>
        <div className="grid grid-cols-3 gap-2 p-1">
          {MORE_NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium',
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'text-muted-foreground hover:bg-accent',
                  )
                }
              >
                <Icon className="size-5" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SocietySwitcher({
  societies,
  current,
  loading,
  onChange,
}: {
  societies: Society[]
  current: Society | null
  loading: boolean
  onChange: (id: string) => void
}) {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1 px-2 font-medium" />
        }
      >
        {loading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <>
            <span className="max-w-32 truncate">
              {current?.name ?? 'Select society'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Societies</DropdownMenuLabel>
        {societies.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => onChange(s.id)}
            className="justify-between"
          >
            {s.name}
            {s.id === current?.id && <Badge variant="secondary">Active</Badge>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/societies')}>
          Manage societies
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({
  name,
  onLogout,
}: {
  name: string | undefined
  onLogout: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          {name ?? 'User'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
