import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  Building2,
  ChevronRight,
  Download,
  Plus,
  Printer,
  Search,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MobileSelect } from '@/components/ui/mobile-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type FlatCategory = {
  id: string
  name: string
  is_active: boolean
  maintenance_amount?: number | null
}

type Person = {
  id: string
  name: string
  mobile: string
  alt_mobile?: string | null
}

type Flat = {
  id: string
  flat_number: string
  flat_category_id: string
  is_active: boolean
  maintenance_amount?: number | null
  category_maintenance_amount?: number | null
  flat_category?: { id: string; name: string; maintenance_amount?: number | null } | null
  category?: { id: string; name: string } | null
  owner?: Person | null
  tenant?: Person | null
  default_payer?: { person: Person | null; role: string | null } | null
  opening_due?: number | null
  total_paid?: number | null
  current_due?: number | null
}

type LedgerEntry = {
  id?: string
  type: string
  business_date: string | null
  amount: number
  narration?: string | null
  running_due: number
}

type LedgerResponse = {
  flat_id: string
  flat_number: string
  opening_due: number
  total_paid: number
  current_due: number
  entries: LedgerEntry[]
}

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function formatMoney(value: number | null | undefined) {
  return money.format(value ?? 0)
}

function formatDate(value: string | null) {
  if (!value) return 'Opening balance'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function friendlyLedgerType(type: string) {
  if (type === 'OPENING') return 'Opening due'
  if (type === 'ARREARS') return 'Arrears receipt'
  if (type === 'PART') return 'Part receipt'
  if (type === 'ADVANCE') return 'Advance receipt'
  return 'Maintenance receipt'
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function FlatsPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedFlatId, setSelectedFlatId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [flatNumber, setFlatNumber] = useState('')
  const [flatCategoryId, setFlatCategoryId] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [occupantRole, setOccupantRole] = useState<'OWNER' | 'TENANT' | null>(null)
  const [occupantPersonId, setOccupantPersonId] = useState('')
  const [occupantError, setOccupantError] = useState<string | null>(null)
  const [openingDueOpen, setOpeningDueOpen] = useState(false)
  const [openingDueAmount, setOpeningDueAmount] = useState('')
  const [openingDueError, setOpeningDueError] = useState<string | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ['flat-categories'],
    queryFn: () => api.get<{ categories: FlatCategory[] }>('/flat-categories'),
  })
  const flatsQuery = useQuery({
    queryKey: ['flats', { withDues: true }],
    queryFn: () => api.get<{ flats: Flat[] }>('/flats?with_dues=true'),
  })
  const personsQuery = useQuery({
    queryKey: ['persons'],
    queryFn: () => api.get<{ persons: Person[] }>('/persons'),
  })

  const categories = categoriesQuery.data?.categories ?? []
  const flats = flatsQuery.data?.flats ?? []
  const persons = personsQuery.data?.persons ?? []
  const selectedFlat = flats.find((flat) => flat.id === selectedFlatId) ?? null
  const normalizedQuery = query.trim().toLowerCase()
  const filteredFlats = useMemo(() => flats.filter((flat) => {
    if (!normalizedQuery) return true
    return [
      flat.flat_number,
      flat.category?.name,
      flat.flat_category?.name,
      flat.owner?.name,
      flat.tenant?.name,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery))
  }), [flats, normalizedQuery])

  const ledgerQuery = useQuery({
    queryKey: ['flat-ledger', selectedFlatId],
    queryFn: () => api.get<LedgerResponse>(`/flats/${selectedFlatId}/ledger`),
    enabled: Boolean(selectedFlatId),
  })

  const createFlat = useMutation({
    mutationFn: () => api.post<Flat>('/flats', {
      flat_number: flatNumber.trim(),
      flat_category_id: flatCategoryId,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['flats'] })
      setCreateOpen(false)
      setFlatNumber('')
      setFlatCategoryId('')
      setCreateError(null)
      toast.success('Flat created')
    },
    onError: (error: unknown) => setCreateError(errorMessage(error, 'Flat could not be created. Try again.')),
  })

  const assignOccupant = useMutation({
    mutationFn: () => api.post(`/flats/${selectedFlatId}/occupants`, {
      person_id: occupantPersonId,
      role: occupantRole,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flats'] }),
        queryClient.invalidateQueries({ queryKey: ['flat-ledger', selectedFlatId] }),
      ])
      setOccupantRole(null)
      setOccupantPersonId('')
      setOccupantError(null)
      toast.success('Occupant added')
    },
    onError: (error: unknown) => setOccupantError(errorMessage(error, 'Occupant could not be added. Try again.')),
  })

  const updateOpeningDue = useMutation({
    mutationFn: () => api.put(`/flats/${selectedFlatId}/opening-due`, {
      amount: Number(openingDueAmount),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flats'] }),
        queryClient.invalidateQueries({ queryKey: ['flat-ledger', selectedFlatId] }),
      ])
      setOpeningDueOpen(false)
      setOpeningDueError(null)
      toast.success('Opening due updated')
    },
    onError: (error: unknown) => setOpeningDueError(errorMessage(error, 'Opening due could not be updated. Try again.')),
  })

  const openOccupantSheet = (role: 'OWNER' | 'TENANT') => {
    setOccupantPersonId('')
    setOccupantError(null)
    setOccupantRole(role)
  }

  const openOpeningDueSheet = () => {
    setOpeningDueAmount(String(selectedFlat?.opening_due ?? 0))
    setOpeningDueError(null)
    setOpeningDueOpen(true)
  }

  const handleDownloadExcel = async () => {
    try {
      const token = useAuthStore.getState().accessToken
      const base = (import.meta.env.API_URL ?? '/api').replace(/\/$/, '')
      const response = await fetch(`${base}/reports/flat-dues.xlsx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error('Dues export could not be downloaded')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'flat-dues.xlsx'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Dues exported')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dues export could not be downloaded')
    }
  }

  if (flatsQuery.error instanceof ApiError && flatsQuery.error.status === 403) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted-foreground">Flats and setup are available to administrators only.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Flats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Occupants, maintenance defaults, dues, and ledger.</p>
        </div>
        <Button className="min-h-12 shrink-0" onClick={() => { setCreateError(null); setCreateOpen(true) }}>
          <Plus className="size-4" />
          Add flat
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search flats"
            placeholder="Search flat or occupant"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-12 pl-9"
          />
        </div>
        <Button variant="outline" className="min-h-12 shrink-0" onClick={handleDownloadExcel} aria-label="Export dues">
          <Download className="size-4" />
          <span className="hidden sm:inline">Export dues</span>
        </Button>
      </div>

      {flatsQuery.isLoading ? (
        <div role="status" aria-label="Loading flats" className="space-y-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : flatsQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Flats could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => flatsQuery.refetch()}>Try again</Button>
        </div>
      ) : filteredFlats.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{flats.length === 0 ? 'No flats yet' : 'No flats match your search'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {flats.length === 0 ? 'Add the first flat to begin occupant and due setup.' : 'Try a flat number, category, or occupant name.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {filteredFlats.map((flat, index) => {
            const maintenanceAmount = flat.maintenance_amount
              ?? flat.category_maintenance_amount
              ?? flat.flat_category?.maintenance_amount
            const occupant = flat.tenant ?? flat.owner
            const due = flat.current_due ?? 0
            return (
              <button
                key={flat.id}
                type="button"
                onClick={() => setSelectedFlatId(flat.id)}
                className={`flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.99] ${index > 0 ? 'border-t' : ''}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">
                  {flat.flat_number.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{flat.flat_number}</span>
                    {!flat.is_active && <StatusBadge label="Inactive" />}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {flat.flat_category?.name ?? flat.category?.name ?? 'No category'}
                    {maintenanceAmount != null ? ` · ${formatMoney(maintenanceAmount)} default` : ''}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {occupant?.name ?? 'No occupant'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{formatMoney(Math.abs(due))}</span>
                  <span className="text-xs text-muted-foreground">{due < 0 ? 'Advance' : due > 0 ? 'Due' : 'Clear'}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      )}

      <FlatDetailSheet
        flat={selectedFlat}
        ledger={ledgerQuery.data}
        ledgerLoading={ledgerQuery.isLoading}
        ledgerError={ledgerQuery.isError}
        onClose={() => setSelectedFlatId(null)}
        onAddOwner={() => openOccupantSheet('OWNER')}
        onAddTenant={() => openOccupantSheet('TENANT')}
        onEditOpeningDue={openOpeningDueSheet}
      />

      <FormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add flat"
        description="Create a flat and assign its maintenance category."
        footer={(
          <Button
            className="min-h-12 w-full"
            disabled={!flatNumber.trim() || !flatCategoryId || createFlat.isPending}
            onClick={() => createFlat.mutate()}
          >
            {createFlat.isPending ? 'Creating flat…' : 'Create flat'}
          </Button>
        )}
      >
        {createError && <InlineError message={createError} />}
        <div className="space-y-2">
          <Label htmlFor="flat-number">Flat number</Label>
          <Input id="flat-number" className="min-h-12" placeholder="A-101" value={flatNumber} onChange={(event) => setFlatNumber(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flat-category">Category</Label>
          <MobileSelect
            id="flat-category"
            value={flatCategoryId}
            onValueChange={setFlatCategoryId}
            options={categories.filter((category) => category.is_active).map((category) => ({
              value: category.id,
              label: category.name,
              description: category.maintenance_amount != null ? `${formatMoney(category.maintenance_amount)} default` : undefined,
            }))}
            label="Category"
            ariaLabel="Category"
            placeholder="Choose category"
            searchable
          />
        </div>
      </FormSheet>

      <FormSheet
        open={Boolean(occupantRole)}
        onOpenChange={(open) => !open && setOccupantRole(null)}
        title={`Add ${occupantRole === 'TENANT' ? 'tenant' : 'owner'}`}
        description={`Choose a person for ${selectedFlat?.flat_number ?? 'this flat'}. The tenant is the default payer when present.`}
        footer={(
          <Button
            className="min-h-12 w-full"
            disabled={!occupantPersonId || assignOccupant.isPending}
            onClick={() => assignOccupant.mutate()}
          >
            {assignOccupant.isPending ? 'Adding occupant…' : `Add ${occupantRole === 'TENANT' ? 'tenant' : 'owner'}`}
          </Button>
        )}
      >
        {occupantError && <InlineError message={occupantError} />}
        {personsQuery.isError ? (
          <InlineError message="People could not be loaded. Close this sheet and try again." />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="occupant-person">Person</Label>
            <MobileSelect
              id="occupant-person"
              value={occupantPersonId}
              onValueChange={setOccupantPersonId}
              options={persons.map((person) => ({ value: person.id, label: person.name, description: person.mobile }))}
              label="Person"
              ariaLabel="Person"
              placeholder="Choose person"
              searchable
            />
            {persons.length === 0 && <p className="text-sm text-muted-foreground">Add a person from More, then return here to assign them.</p>}
          </div>
        )}
      </FormSheet>

      <FormSheet
        open={openingDueOpen}
        onOpenChange={setOpeningDueOpen}
        title="Edit opening due"
        description={`Set the amount ${selectedFlat?.flat_number ?? 'this flat'} owed when records began. Receipts reduce this balance.`}
        footer={(
          <Button
            className="min-h-12 w-full"
            disabled={openingDueAmount === '' || Number(openingDueAmount) < 0 || updateOpeningDue.isPending}
            onClick={() => updateOpeningDue.mutate()}
          >
            {updateOpeningDue.isPending ? 'Saving opening due…' : 'Save opening due'}
          </Button>
        )}
      >
        {openingDueError && <InlineError message={openingDueError} />}
        <div className="space-y-2">
          <Label htmlFor="opening-due">Opening due</Label>
          <Input
            id="opening-due"
            type="number"
            min="0"
            inputMode="decimal"
            className="min-h-12 text-lg tabular-nums"
            value={openingDueAmount}
            onChange={(event) => setOpeningDueAmount(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">Use 0 when the flat had no balance due.</p>
        </div>
      </FormSheet>
    </div>
  )
}

function FlatDetailSheet({
  flat,
  ledger,
  ledgerLoading,
  ledgerError,
  onClose,
  onAddOwner,
  onAddTenant,
  onEditOpeningDue,
}: {
  flat: Flat | null
  ledger: LedgerResponse | undefined
  ledgerLoading: boolean
  ledgerError: boolean
  onClose: () => void
  onAddOwner: () => void
  onAddTenant: () => void
  onEditOpeningDue: () => void
}) {
  const maintenanceAmount = flat?.maintenance_amount
    ?? flat?.category_maintenance_amount
    ?? flat?.flat_category?.maintenance_amount
  const currentDue = flat?.current_due ?? ledger?.current_due ?? 0

  return (
    <Sheet open={Boolean(flat)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)] print:max-h-none">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetHeader>
          <SheetTitle className="text-xl">Flat {flat?.flat_number}</SheetTitle>
          <SheetDescription>{flat?.flat_category?.name ?? flat?.category?.name ?? 'Flat details'}</SheetDescription>
        </SheetHeader>

        {flat && (
          <div className="space-y-5 px-4 pb-6">
            <section className="grid grid-cols-3 overflow-hidden rounded-2xl border bg-muted/20">
              <Metric label="Opening" value={formatMoney(flat.opening_due)} />
              <Metric label="Paid" value={formatMoney(flat.total_paid)} border />
              <Metric label={currentDue < 0 ? 'Advance' : 'Current due'} value={formatMoney(Math.abs(currentDue))} border />
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Default amount</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{maintenanceAmount == null ? 'Not set' : formatMoney(maintenanceAmount)}</p>
                </div>
                <Button variant="outline" className="min-h-11" onClick={onEditOpeningDue}>Edit opening due</Button>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">People</h2>
                <span className="text-xs text-muted-foreground">Default payer</span>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-card">
                <PersonRow role="Tenant" person={flat.tenant} isDefault={flat.default_payer?.role === 'TENANT'} onAdd={onAddTenant} />
                <PersonRow role="Owner" person={flat.owner} isDefault={flat.default_payer?.role === 'OWNER'} onAdd={onAddOwner} border />
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Ledger</h2>
                <Button variant="ghost" className="min-h-11 print:hidden" onClick={() => window.print()}>
                  <Printer className="size-4" />
                  Print
                </Button>
              </div>
              {ledgerLoading ? (
                <div className="space-y-2" role="status" aria-label="Loading ledger">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : ledgerError ? (
                <InlineError message="Ledger could not be loaded. Close the sheet and try again." />
              ) : !ledger?.entries.length ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No ledger activity yet.</div>
              ) : (
                <div className="overflow-hidden rounded-2xl border bg-card">
                  {ledger.entries.map((entry, index) => (
                    <div key={entry.id ?? `${entry.type}-${entry.business_date}-${index}`} className={`flex min-h-16 items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t' : ''}`}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <ArrowDownLeft className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{friendlyLedgerType(entry.type)}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(entry.business_date)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">{entry.type === 'OPENING' ? formatMoney(entry.amount) : `−${formatMoney(entry.amount)}`}</span>
                        <span className="text-xs text-muted-foreground">Balance {formatMoney(entry.running_due)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PersonRow({
  role,
  person,
  isDefault,
  onAdd,
  border = false,
}: {
  role: 'Owner' | 'Tenant'
  person: Person | null | undefined
  isDefault: boolean
  onAdd: () => void
  border?: boolean
}) {
  return (
    <div className={`flex min-h-[72px] items-center gap-3 px-4 py-3 ${border ? 'border-t' : ''}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserRound className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{role}{isDefault ? ' · Default payer' : ''}</span>
        {person ? (
          <>
            <span className="block truncate font-medium">{person.name}</span>
            <span className="block text-xs text-muted-foreground">{person.mobile}</span>
          </>
        ) : (
          <span className="block text-sm text-muted-foreground">Not assigned</span>
        )}
      </span>
      {!person && <Button variant="outline" className="min-h-11" onClick={onAdd}>Add {role.toLowerCase()}</Button>}
    </div>
  )
}

function Metric({ label, value, border = false }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={`min-w-0 p-3 text-center ${border ? 'border-l' : ''}`}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetHeader>
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">{children}</div>
        <SheetFooter className="sticky bottom-0 border-t bg-popover">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{label}</span>
}

function InlineError({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p>
}
