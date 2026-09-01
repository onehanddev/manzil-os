import { useState, useMemo } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type MobileSelectOption = {
  value: string
  label: string
  description?: string
}

type MobileSelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: MobileSelectOption[]
  placeholder?: string
  label?: string
  ariaLabel?: string
  testId?: string
  searchable?: boolean
  disabled?: boolean
  id?: string
  onCreate?: (label: string) => void
}

export function MobileSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  label,
  ariaLabel,
  testId,
  searchable = false,
  disabled = false,
  id,
  onCreate,
}: MobileSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q),
    )
  }, [options, query, searchable])

  const handleSelect = (val: string) => {
    onValueChange(val)
    setOpen(false)
    setQuery('')
  }

  const createLabel = query.trim()
  const canCreate = Boolean(
    onCreate
    && createLabel
    && !options.some((option) => option.label.toLowerCase() === createLabel.toLowerCase()),
  )

  return (
    <>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel ?? label}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid={testId}
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          'flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'placeholder:text-muted-foreground',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? (
            <span className="flex items-center gap-2">
              <span>{selected.label}</span>
              {selected.description && (
                <span className="text-xs text-muted-foreground">{selected.description}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
        <SheetContent side="bottom" className="max-h-[min(88dvh,600px)] overflow-hidden pb-[env(safe-area-inset-bottom)] flex flex-col">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border shrink-0" aria-hidden />
          <SheetHeader className="shrink-0">
            <SheetTitle>{label ?? placeholder}</SheetTitle>
            <SheetDescription className="sr-only">Select {label ?? placeholder}</SheetDescription>
          </SheetHeader>

          {searchable && (options.length > 5 || onCreate) && (
            <div className="px-4 pt-2 pb-2 shrink-0">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Search ${label?.toLowerCase() ?? 'options'}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11 pl-9"
                  autoFocus={false}
                />
              </div>
            </div>
          )}

          <div
            role="listbox"
            aria-label={label}
            className="flex-1 overflow-y-auto px-2 pb-4"
          >
            {canCreate && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onCreate?.(createLabel)
                  setOpen(false)
                  setQuery('')
                }}
                className="flex min-h-[52px] w-full items-center rounded-xl bg-primary/10 px-3 py-2 text-left text-sm font-medium text-primary transition-colors active:scale-[0.99]"
              >
                Create “{createLabel}”
              </button>
            )}
            {filtered.length === 0 ? (
              !canCreate && <p className="py-8 text-center text-sm text-muted-foreground">No results</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      'flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors active:scale-[0.99]',
                      isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted active:bg-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('text-sm font-medium', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                        {opt.label}
                      </span>
                      {opt.description && (
                        <span className={cn('ml-2 text-xs', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
