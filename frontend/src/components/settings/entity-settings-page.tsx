import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CirclePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export type SettingsEntity = {
  id: string
  name: string
  is_active?: boolean
  [key: string]: unknown
}

export type SettingsField = {
  key: string
  label: string
  placeholder: string
  required?: boolean
  type?: 'text' | 'tel' | 'email'
  inputMode?: 'text' | 'tel' | 'email'
}

type EntitySettingsPageProps = {
  title: string
  description: string
  singular: string
  endpoint: string
  queryKey: string
  responseKeys: string[]
  fields: SettingsField[]
  summary?: (entity: SettingsEntity) => string | null
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function EntitySettingsPage({
  title,
  description,
  singular,
  endpoint,
  queryKey,
  responseKeys,
  fields,
  summary,
}: EntitySettingsPageProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [mutationError, setMutationError] = useState<string | null>(null)

  const entitiesQuery = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.get<Record<string, SettingsEntity[]>>(endpoint),
  })
  const entities = responseKeys.reduce<SettingsEntity[]>((found, key) => found.length ? found : entitiesQuery.data?.[key] ?? [], [])
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => entities.filter((entity) => {
    if (!normalizedSearch) return true
    return `${entity.name} ${summary?.(entity) ?? ''}`.toLowerCase().includes(normalizedSearch)
  }), [entities, normalizedSearch, summary])

  const createEntity = useMutation({
    mutationFn: () => {
      const payload = Object.fromEntries(fields.flatMap((field) => {
        const value = values[field.key]?.trim() ?? ''
        return value ? [[field.key, value]] : []
      }))
      return api.post<SettingsEntity>(endpoint, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] })
      setFormOpen(false)
      setValues({})
      setMutationError(null)
      toast.success(`${singular[0].toUpperCase()}${singular.slice(1)} created`)
    },
    onError: (error: unknown) => setMutationError(apiMessage(error, `${singular[0].toUpperCase()}${singular.slice(1)} could not be created. Try again.`)),
  })

  const canCreate = fields.every((field) => !field.required || values[field.key]?.trim())
  const plural = title.toLowerCase()

  if (entitiesQuery.error instanceof ApiError && entitiesQuery.error.status === 403) {
    return <p className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">{title} are available to administrators only.</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button className="min-h-12 shrink-0" onClick={() => { setMutationError(null); setFormOpen(true) }}>
          <CirclePlus className="size-4" />
          Add {singular}
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={`Search ${plural}`}
          placeholder={`Search ${plural}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-12 pl-9"
        />
      </div>

      {entitiesQuery.isLoading ? (
        <div className="space-y-3" aria-label={`Loading ${plural}`}>
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}
        </div>
      ) : entitiesQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">{title} could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => entitiesQuery.refetch()}>Try again</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="font-medium">{entities.length === 0 ? `No ${plural} yet` : `No ${plural} match your search`}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {entities.length === 0 ? `Add the first ${singular} to make it available in daily entries.` : 'Try a different name or detail.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {filtered.map((entity, index) => {
            const entitySummary = summary?.(entity)
            return (
              <div key={entity.id} className={`flex min-h-16 items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t' : ''}`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">
                  {entity.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{entity.name}</span>
                  {entitySummary && <span className="block truncate text-sm text-muted-foreground">{entitySummary}</span>}
                </span>
                {entity.is_active === false && <StatusBadge label="Inactive" />}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader>
            <SheetTitle className="text-xl">Add {singular}</SheetTitle>
            <SheetDescription>Enter the details below. You can use this {singular} as soon as it is created.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {mutationError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{mutationError}</p>}
            {fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`${queryKey}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`${queryKey}-${field.key}`}
                  type={field.type ?? 'text'}
                  inputMode={field.inputMode}
                  className="min-h-12"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-popover">
            <Button className="min-h-12 w-full" disabled={!canCreate || createEntity.isPending} onClick={() => createEntity.mutate()}>
              {createEntity.isPending ? `Creating ${singular}…` : `Create ${singular}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{label}</span>
}
