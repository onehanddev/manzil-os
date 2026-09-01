import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, CirclePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  maintenance_amount: number | null
}

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function message(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function FlatCategoriesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryAmount, setCategoryAmount] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ['flat-categories'],
    queryFn: () => api.get<{ categories: FlatCategory[] }>('/flat-categories'),
  })
  const categories = categoriesQuery.data?.categories ?? []
  const selected = categories.find((category) => category.id === selectedId) ?? null
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => categories.filter((category) => category.name.toLowerCase().includes(normalizedSearch)), [categories, normalizedSearch])

  const createCategory = useMutation({
    mutationFn: () => api.post('/flat-categories', {
      name: categoryName.trim(),
      maintenance_amount: categoryAmount === '' ? undefined : Number(categoryAmount),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['flat-categories'] })
      setCreateOpen(false)
      setCategoryName('')
      setCategoryAmount('')
      setCreateError(null)
      toast.success('Flat category created')
    },
    onError: (error: unknown) => setCreateError(message(error, 'Flat category could not be created. Try again.')),
  })

  const updateCategory = useMutation({
    mutationFn: (payload: { maintenance_amount?: number | null; is_active?: boolean }) => api.patch(`/flat-categories/${selectedId}`, payload),
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flat-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['flats'] }),
      ])
      setEditError(null)
      if (payload.is_active !== undefined) {
        setConfirmDeactivate(false)
        setSelectedId(null)
        toast.success(payload.is_active ? 'Category activated' : 'Category deactivated')
      } else {
        setSelectedId(null)
        toast.success('Default amount updated')
      }
    },
    onError: (error: unknown) => setEditError(message(error, 'Category could not be updated. Try again.')),
  })

  const openCategory = (category: FlatCategory) => {
    setSelectedId(category.id)
    setEditAmount(category.maintenance_amount == null ? '' : String(category.maintenance_amount))
    setEditError(null)
  }

  if (categoriesQuery.error instanceof ApiError && categoriesQuery.error.status === 403) {
    return <p className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">Flat categories are available to administrators only.</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Flat Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">Maintenance defaults applied when flats are created and receipts are recorded.</p>
        </div>
        <Button className="min-h-12 shrink-0" onClick={() => { setCreateError(null); setCreateOpen(true) }}>
          <CirclePlus className="size-4" />
          Add category
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search flat categories"
          placeholder="Search flat categories"
          className="min-h-12 pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {categoriesQuery.isLoading ? (
        <div className="space-y-3" aria-label="Loading flat categories">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}
        </div>
      ) : categoriesQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Flat categories could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => categoriesQuery.refetch()}>Try again</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="font-medium">{categories.length === 0 ? 'No flat categories yet' : 'No categories match your search'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{categories.length === 0 ? 'Add a category before creating flats.' : 'Try a different category name.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {filtered.map((category, index) => (
            <button
              key={category.id}
              type="button"
              onClick={() => openCategory(category)}
              className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.99] ${index > 0 ? 'border-t' : ''}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">{category.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{category.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {category.maintenance_amount == null ? 'No default amount' : `${money.format(category.maintenance_amount)} default`}
                </span>
              </span>
              {!category.is_active && <StatusBadge label="Inactive" />}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <SheetHandle />
          <SheetHeader>
            <SheetTitle className="text-xl">Add flat category</SheetTitle>
            <SheetDescription>Set an optional default amount to prefill maintenance receipts.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {createError && <InlineError text={createError} />}
            <div className="space-y-2">
              <Label htmlFor="category-name">Category name</Label>
              <Input id="category-name" className="min-h-12" placeholder="2 BHK" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-amount">Default maintenance amount</Label>
              <Input id="category-amount" type="number" min="0" inputMode="decimal" className="min-h-12" placeholder="2500" value={categoryAmount} onChange={(event) => setCategoryAmount(event.target.value)} />
            </div>
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-popover">
            <Button className="min-h-12 w-full" disabled={!categoryName.trim() || Number(categoryAmount) < 0 || createCategory.isPending} onClick={() => createCategory.mutate()}>
              {createCategory.isPending ? 'Creating category…' : 'Create category'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <SheetHandle />
          <SheetHeader>
            <SheetTitle className="text-xl">{selected?.name}</SheetTitle>
            <SheetDescription>Update the amount used to prefill maintenance receipts.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {editError && <InlineError text={editError} />}
            <div className="space-y-2">
              <Label htmlFor="edit-category-amount">Default maintenance amount</Label>
              <Input id="edit-category-amount" type="number" min="0" inputMode="decimal" className="min-h-12" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
              <p className="text-sm text-muted-foreground">Leave empty to remove the default. Existing receipts are unchanged.</p>
            </div>
            <Button
              variant="ghost"
              className={selected?.is_active ? 'min-h-11 w-full text-destructive' : 'min-h-11 w-full'}
              onClick={() => selected?.is_active ? setConfirmDeactivate(true) : updateCategory.mutate({ is_active: true })}
            >
              {selected?.is_active ? 'Deactivate category' : 'Activate category'}
            </Button>
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-popover">
            <Button
              className="min-h-12 w-full"
              disabled={Number(editAmount) < 0 || updateCategory.isPending}
              onClick={() => updateCategory.mutate({ maintenance_amount: editAmount === '' ? null : Number(editAmount) })}
            >
              {updateCategory.isPending ? 'Saving default amount…' : 'Save default amount'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Existing flats keep this category and their records. The category will no longer be available when creating new flats.</AlertDialogDescription>
            {editError && <InlineError text={editError} />}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => updateCategory.mutate({ is_active: false })}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SheetHandle() {
  return <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
}

function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{label}</span>
}

function InlineError({ text }: { text: string }) {
  return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{text}</p>
}
